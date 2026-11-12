const fs = require('node:fs');
const pool = require('../db');
const { buildSourceContentHash } = require('../utils/sourceContentHash');

const { fetchHtml, safeUrl } = require('./discover-ticketcenter');
const { extractFlyer } = require('./backfill-ticketcenter-flyers');

const ticketcenterFlyerCache = new Map();

async function loadFlyer(showUrl) {
  if (ticketcenterFlyerCache.has(showUrl)) {
    return ticketcenterFlyerCache.get(showUrl);
  }

  let flyer = null;

  try {
    const official = safeUrl(showUrl);
    if (
      !official ||
      !/^\/es-PR\/shows\/[^/]+\/info\/?$/i.test(
        new URL(official).pathname
      )
    ) {
      throw new Error('Ficha oficial inválida');
    }

    flyer = extractFlyer(await fetchHtml(official));
  } catch (error) {
    console.warn('Flyer pendiente:', showUrl, error.message);
  }

  ticketcenterFlyerCache.set(showUrl, flyer);
  return flyer;
}

const aliases = {
  'musas eventos cba santurce': '1a354618-a703-4479-a8f5-accf8191468c',
  'sala sinfonica pablo casals': '905c581a-a4dd-4d83-aae4-bea12c5a5b16',
  'sala de teatro rene marques santurce': '0b0396d9-27b0-406a-a041-11cf0f506021',
  'sala de festivales antonio paoli santurce': '75b6985f-998a-4504-b980-648d62fa56e2',
  'sala experimental carlos marichal': '8307ceab-6c07-4380-8cd7-6e261e804549',
  'fundacion nacional para la cultura': '3306e371-568e-4297-9b70-cfb74ebf4562',
  'conservatorio de musica de pr': '657fe424-10a7-4cde-82f3-acfff47a88bb',
  'hollywood cafe ponce': 'cbde1ca9-ef85-439f-89c4-94dd504f97b7',
  'monero cafe teatro y bar': '15dcd01e-8606-47d4-a46a-d2322a7f5b95'
};

function normalize(value) {
  return String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--stage')) {
    throw new Error('Uso: node scripts/stage-ticketcenter-candidates.js [--stage]');
  }

  const save = args.includes('--stage');
  const path = '/tmp/ticketcenter-details.json';

  if (Date.now() - fs.statSync(path).mtimeMs > 86400000) {
    throw new Error('El catálogo tiene más de 24 horas; vuelve a extraerlo.');
  }

  const catalog = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!catalog.details_complete || catalog.detail_errors?.length) {
    throw new Error('La extracción tiene fichas pendientes.');
  }

  const db = await pool.connect();

  try {
    await db.query('BEGIN');
    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['ticketcenter-candidate-staging']
    );

    const { rows } = await db.query(`
      SELECT id, name, municipality, location_verification_status
      FROM public.venues
      FOR SHARE
    `);

    const venues = new Map(rows.map(v => [v.id, v]));
    const counts = {};
    const seen = new Set();
    const add = key => counts[key] = (counts[key] || 0) + 1;

    for (const e of catalog.events) {
      const title = normalize(e.title);

      const outsideScope =
        /\bcascanueces\b|\bmaestra vida\b|\bles miserables\b|\bspelling bee\b/.test(title) ||
        ['toc toc', 'la fiesta del divorcio', 'los gomes vs los latorre']
          .includes(title);

      for (const p of e.performances) {
        if (outsideScope) {
          add('FUERA_DE_ALCANCE');
          continue;
        }

        if (
          e.source_conflict ||
          (
            title.startsWith('alma de tango') &&
            (
              title !== 'alma de tango de gardel a piazzolla' ||
              p.start_at !== '2026-11-22T20:00:00.000Z' ||
              normalize(p.venue_name) !== 'sala sinfonica pablo casals'
            )
          )
        ) {
          add('CONFLICTO');
          continue;
        }

        if (!e.detail_checked) {
          add('FICHA_PENDIENTE');
          continue;
        }

        const start = new Date(p.start_at);
        if (!Number.isFinite(+start) || +start <= Date.now()) {
          add('FECHA_NO_FUTURA');
          continue;
        }

        const url = new URL(p.ticket_url);
        const match = url.pathname.match(
          /^\/es-PR\/events\/[^/]+\/(\d{4})-(\d{1,2})-(\d{1,2})_(\d{1,2})\.(\d{2})\/[^/]+\/?$/i
        );

        if (
          url.protocol !== 'https:' ||
          url.hostname !== 'tcpr.com' ||
          url.username || url.password || url.port ||
          url.search || url.hash || !match
        ) {
          throw new Error(`Enlace de función inválido: ${e.title}`);
        }

        const [, y, m, d, h, min] = match;
        const local = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:00`;
        const calendarDate = new Date(`${local}Z`);

        if (
          !Number.isFinite(+calendarDate) ||
          calendarDate.toISOString().slice(0, 19) !== local ||
          +new Date(`${local}-04:00`) !== +start
        ) {
          throw new Error(`Fecha y enlace no coinciden: ${e.title}`);
        }

        const venue = venues.get(aliases[normalize(p.venue_name)]);
        if (!venue || venue.location_verification_status !== 'verified') {
          add('VENUE_PENDIENTE');
          continue;
        }

        if (seen.has(url.href)) {
          add('REPETIDA_EN_CATALOGO');
          continue;
        }
        seen.add(url.href);

        const old = await db.query(`
          SELECT id
          FROM public.event_candidates
          WHERE source_name = $1 AND source_url = $2
            AND is_test = FALSE
        `, ['Ticket Center PR', url.href]);

        if (old.rowCount) {
          add('YA_EXISTE_REQUIERE_COMPARAR_EVIDENCIA');
          continue;
        }

        const duplicate = await db.query(`
          SELECT id FROM public.events
          WHERE start_at = $1
            AND (
              venue_id = $2
              OR LOWER(TRIM(title)) = LOWER(TRIM($3))
            )
        `, [start.toISOString(), venue.id, e.title]);

        if (duplicate.rowCount) {
          add('POSIBLE_DUPLICADO_PUBLICADO');
          continue;
        }

        const flyerUrl = await loadFlyer(e.source_url);

        const evidence = {
          title: e.title,
          description: e.description || '',
          venue_id: venue.id,
          venue: venue.name,
          start_at: start.toISOString(),
          source_url: url.href,
          show_url: e.source_url,
          flyer_url: flyerUrl,
          music: e.music
        };

        const captionText = JSON.stringify(evidence);
        const hash = buildSourceContentHash({ captionText });

        const analysis = {
          status: 'pending_review',
          review_required: true,
          ingestion_method: 'ticketcenter_review_staging',
          source: { name: 'Ticket Center PR', url: url.href },
          event: {
            title: e.title,
            description: e.description || '',
            venue: venue.name,
            venue_id: venue.id,
            municipality: venue.municipality,
            is_music_event: false,
            event_status: 'unverified',
            flyer_url: flyerUrl,
            ticket_url: url.href,
            normalized: {
              start_at: start.toISOString(),
              price_type: 'unknown',
              price_min: null,
              price_max: null
            }
          },
          extracted_evidence: evidence,
          preliminary_music_assessment: e.music,
          verification: {
            source_page_extracted: true,
            venue_verified: true,
            musical_program_verified: false,
            duplicate_status: 'needs_review',
            conflict_status: 'needs_review'
          },
          validation: {
            basic_checks_passed: false,
            safe_to_publish: false,
            review_required: true
          }
        };

        if (save) {
          await db.query(`
            INSERT INTO public.event_candidates (
              source_name, source_url, flyer_url,
              caption_text, analysis_result,
              review_status, is_test, source_content_hash
            )
            VALUES (
              $1, $2, $6, $3, $4::jsonb,
              'pending_review', FALSE, $5
            )
          `, [
            'Ticket Center PR', url.href, captionText,
            JSON.stringify(analysis), hash, flyerUrl
          ]);
        }

        add(save ? 'GUARDADO_PENDIENTE' : 'PREPARABLE');
      }
    }

    await db.query(save ? 'COMMIT' : 'ROLLBACK');
    console.table(counts);
    console.log('Modo:', save ? 'GUARDAR PENDIENTES' : 'VISTA PREVIA');
    console.log('Eventos aprobados: 0');
    console.log('Eventos publicados: 0');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
