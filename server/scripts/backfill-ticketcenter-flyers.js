const {
  fetchHtml, decode, safeUrl
} = require('./discover-ticketcenter');

function attribute(tag, name) {
  return decode(tag.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'is')
  )?.[2] || '');
}

function extractFlyer(html) {
  const images = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map(m => m[0]);

  const hasClass = (tag, name) =>
    attribute(tag, 'class').split(/\s+/).includes(name);

  const large = images.filter(tag => hasClass(tag, 'largeImage'));
  const magnify = images.filter(tag => hasClass(tag, 'magnify'));
  const medium = images.filter(tag => hasClass(tag, 'item_medium_image'));

  let value;

  if (large.length === 1) {
    value = attribute(large[0], 'src');
  } else if (large.length === 0 && magnify.length === 1) {
    const action = attribute(magnify[0], 'onclick');
    value = action.match(
      /openImageBigView\s*\(\s*event\s*,\s*(['"])(.*?)\1/i
    )?.[2];
  } else if (
    large.length === 0 &&
    magnify.length === 0 &&
    medium.length === 1
  ) {
    value = attribute(medium[0], 'src');
  }

  if (!value) {
    throw new Error('Flyer principal ausente o ambiguo');
  }

  const url = safeUrl(value);

  if (
    !url ||
    !/^\/weblink\/\d+\/get\.resource\/images\//.test(
      new URL(url).pathname
    )
  ) {
    throw new Error('URL del flyer no autorizada');
  }

  return url;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--save') || args.length > 1) {
    throw new Error('Uso: node scripts/backfill-ticketcenter-flyers.js [--save]');
  }

  const save = args.includes('--save');
  const pool = require('../db');

  try {
    const { rows } = await pool.query(`
      SELECT c.id AS candidate_id, e.id AS event_id, e.title,
             c.analysis_result #>> '{extracted_evidence,show_url}' AS show_url
      FROM public.event_candidates c
      JOIN public.events e ON e.id = c.approved_event_id
      WHERE c.source_name = 'Ticket Center PR'
        AND c.is_test = FALSE
        AND c.review_status = 'approved'
        AND e.ticket_provider = 'Ticket Center PR'
        AND e.flyer_url IS NULL
      ORDER BY e.start_at
    `);

    const cache = new Map();
    const results = [];
    let updated = 0;

    for (const row of rows) {
      try {
        if (
          !row.show_url ||
          safeUrl(row.show_url) !== row.show_url ||
          !/^\/es-PR\/shows\/[^/]+\/info\/?$/i.test(
            new URL(row.show_url).pathname
          )
        ) {
          throw new Error('Ficha oficial inválida');
        }

        if (!cache.has(row.show_url)) {
          const flyer = extractFlyer(await fetchHtml(row.show_url));

          const response = await fetch(flyer, {
            redirect: 'error',
            signal: AbortSignal.timeout(20000),
            headers: {
              Accept: 'image/*',
              Referer: 'https://pal-jangueo.vercel.app/'
            }
          });

          const type = response.headers.get('content-type') || '';

          if (
            !response.ok ||
            !/^image\/(?:png|jpeg|webp|gif)(?:;|$)/i.test(type)
          ) {
            await response.body?.cancel();
            throw new Error(`Imagen inválida: HTTP ${response.status}, ${type}`);
          }

          const bytes = new Uint8Array(await response.arrayBuffer());
          if (!bytes.length) throw new Error('Imagen vacía');

          cache.set(row.show_url, flyer);
        }

        const flyer = cache.get(row.show_url);

        if (save) {
          const db = await pool.connect();

          try {
            await db.query('BEGIN');

            const change = await db.query(`
              UPDATE public.events e
              SET flyer_url = $2, updated_at = NOW()
              WHERE e.id = $1
                AND e.flyer_url IS NULL
                AND e.ticket_provider = 'Ticket Center PR'
                AND EXISTS (
                  SELECT 1 FROM public.event_candidates c
                  WHERE c.id = $3
                    AND c.approved_event_id = e.id
                    AND c.review_status = 'approved'
                    AND c.source_name = 'Ticket Center PR'
                )
              RETURNING e.id
            `, [row.event_id, flyer, row.candidate_id]);

            if (change.rowCount === 1) {
              await db.query(`
                UPDATE public.event_candidates
                SET flyer_url = $2,
                    analysis_result = jsonb_set(
                      analysis_result, '{flyer_backfill}', $3::jsonb, TRUE
                    )
                WHERE id = $1
                  AND approved_event_id = $4
                  AND review_status = 'approved'
              `, [
                row.candidate_id,
                flyer,
                JSON.stringify({
                  source_url: row.show_url,
                  flyer_url: flyer,
                  checked_at: new Date().toISOString()
                }),
                row.event_id
              ]);
            }

            await db.query('COMMIT');
            updated += change.rowCount;
          } catch (error) {
            await db.query('ROLLBACK');
            throw error;
          } finally {
            db.release();
          }
        }

        console.log('OK:', row.title);
        results.push({ evento: row.title, resultado: 'OK' });
      } catch (error) {
        console.error('ERROR:', row.title, error.message);
        results.push({
          evento: row.title,
          resultado: error.message,
          failed: true
        });
      }
    }

    const errors = results.filter(r => r.failed);
    console.log('\nEventos actualizados:', updated);
    console.log('Errores:', errors.length);
    if (errors.length) console.table(errors);

    const { rows: summary } = await pool.query(`
      SELECT
        COUNT(*)::integer AS publicados,
        COUNT(*) FILTER (
          WHERE flyer_url IS NOT NULL
        )::integer AS con_flyer,
        COUNT(*) FILTER (
          WHERE flyer_url IS NULL
        )::integer AS sin_flyer
      FROM public.events
      WHERE ticket_provider = 'Ticket Center PR'
        AND is_published = TRUE
    `);

    console.table(summary);
    if (errors.length) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { extractFlyer };
