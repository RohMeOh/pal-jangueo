// Pa'l Jangueo - PRticket automated candidate staging.
// Preview by default. --stage saves REAL pending candidates.
// Never approves or publishes events.

const {
  LIST_URL,
  fetchHtml,
  extractCards,
  extractDetail
} = require('./discover-prticket');

const {
  normalizePrticketEvent
} = require('../utils/normalizePrticketEvent');

const {
  buildSourceContentHash
} = require('../utils/sourceContentHash');

const {
  storePendingEventCandidate
} = require('../utils/storePendingEventCandidate');

const {
  assessMusicEvidence
} = require('../utils/assessMusicEvidence');

const args = process.argv.slice(2);
const save = args.includes('--stage');

const slugsArgument = args.find(arg =>
  arg.startsWith('--slugs=')
);

const limitArgument = args.find(arg =>
  arg.startsWith('--limit=')
);

if (args.some(arg =>
  arg !== '--stage' &&
  !/^--slugs=[a-z0-9,_-]+$/i.test(arg) &&
  !/^--limit=\d+$/.test(arg)
)) {
  throw new Error('Argumentos no reconocidos.');
}

const limit = limitArgument
  ? Number(limitArgument.split('=')[1])
  : 10;

if (!Number.isInteger(limit) || limit < 1 || limit > 40) {
  throw new Error('El límite debe estar entre 1 y 40.');
}

const requestedSlugs = slugsArgument
  ? new Set(slugsArgument.split('=')[1].split(','))
  : null;

function approvedPoster(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'dgxrvn37x26wa.cloudfront.net' &&
      !parsed.username &&
      !parsed.password
    ) ? parsed.href : null;
  } catch {
    return null;
  }
}

function buildCandidate(card, detail, normalized) {
  const evidence = {
    title: card.title,
    page_title: detail.page_title,
    ...(detail.description_evidence
      ? { description_text: detail.description_evidence }
      : {}),
    venue: normalized.venue,
    date_text: normalized.source_date_text,
    time_text: normalized.source_time_text,
    start_at: normalized.start_at,
    poster_url: approvedPoster(detail.poster_url),
    source_url: card.source_url
  };

  const captionText = JSON.stringify(evidence);

  const music = assessMusicEvidence(
    [card.title, detail.description_evidence]
      .filter(Boolean)
      .join(' ')
  );

  const analysis = {
    status: 'pending_review',
    review_required: true,
    ingestion_method: 'automated_prticket_discovery',
    source: {
      name: 'PRticket',
      url: card.source_url
    },
    event: {
      title: normalized.title,
      venue: normalized.venue,
      municipality: null,
      neighborhood: null,
      date_text: normalized.source_date_text,
      time_text: normalized.source_time_text,
      is_music_event: false,
      local_music_confirmed: false,
      event_status: 'unverified',
      ticket_url: card.source_url,
      normalized: {
        start_at: normalized.start_at,
        price_type: 'unknown',
        price_min: null,
        price_max: null
      }
    },
    extracted_evidence: evidence,
    preliminary_music_assessment: {
      classification: music.classification,
      signals: music.signals,
      has_musical_program_evidence:
        music.has_musical_program_evidence,
      non_music_event_detected:
        music.non_music_event_detected,
      mixed_event_detected:
        music.mixed_event_detected,
      safe_to_publish: false
    },
    verification: {
      source_page_extracted: true,
      musical_program_verified: false,
      venue_verified: false,
      scene_relevance_documented: false
    },
    validation: {
      basic_checks_passed: false,
      safe_to_publish: false,
      review_required: true
    }
  };

  return {
    analysis,
    captionText,
    contentHash: buildSourceContentHash({
      captionText
    }),
    posterUrl: approvedPoster(
      normalized.poster_url
    )
  };
}

async function stageCandidate(pool, card, prepared) {
  return storePendingEventCandidate({
    pool,
    sourceName: 'PRticket',
    sourceUrl: card.source_url,
    flyerUrl: prepared.posterUrl,
    captionText: prepared.captionText,
    analysis: prepared.analysis,
    sourceContentHash: prepared.contentHash
  });
}

async function main() {
  let pool;

  try {
    console.log('\n=== PRTICKET: CANDIDATOS AUTOMÁTICOS ===');
    console.log(
      'Modo:',
      save ? 'GUARDAR CANDIDATOS REALES' : 'VISTA PREVIA'
    );

    const listing = await fetchHtml(LIST_URL);
    const cards = extractCards(listing);

    const selected = requestedSlugs
      ? cards.filter(card => {
          const slug = new URL(card.source_url)
            .pathname.split('/').pop();
          return requestedSlugs.has(slug);
        })
      : cards.slice(0, limit);

    if (save) {
      pool = require('../db');
    }

    const summary = {
      discovered: cards.length,
      examined: selected.length,
      complete: 0,
      incomplete: 0,
      saved: 0,
      existing: 0,
      blocked: 0,
      errors: 0
    };

    for (const card of selected) {
      try {
        const html = await fetchHtml(card.source_url);
        const detail = extractDetail(html);
        const normalized = normalizePrticketEvent(
          card,
          detail
        );

        console.log('\nEvento:', normalized.title);
        console.log('Venue:', normalized.venue || 'Pendiente');
        console.log('Fecha:', normalized.start_at || 'Pendiente');
        console.log('Flyer:', normalized.poster_url || 'Pendiente');
        console.log('Estado:', normalized.status);

        if (normalized.status !== 'structured_data_ready') {
          summary.incomplete++;
          console.log('Resultado: NO GUARDADO');
          continue;
        }

        summary.complete++;

        if (!save) {
          console.log('Resultado: APTO PARA ALMACENAMIENTO');
          continue;
        }

        const prepared = buildCandidate(
          card, detail, normalized
        );

        const result = await stageCandidate(
          pool, card, prepared
        );

        console.log('Supabase:', result);

        if (result.startsWith('GUARDADO')) {
          summary.saved++;
        } else if (result === 'YA_EXISTE') {
          summary.existing++;
        } else {
          summary.blocked++;
        }

      } catch (error) {
        summary.errors++;
        console.error('Error:', card.source_url, error.message);
      }
    }

    console.log('\n=== RESUMEN PRTICKET ===');
    console.log('Tarjetas encontradas:', summary.discovered);
    console.log('Eventos examinados:', summary.examined);
    console.log('Datos estructurados:', summary.complete);
    console.log('Datos incompletos:', summary.incomplete);
    console.log('Candidatos nuevos:', summary.saved);
    console.log('Candidatos existentes:', summary.existing);
    console.log('Bloqueados:', summary.blocked);
    console.log('Errores:', summary.errors);
    console.log('Aprobaciones automáticas: 0');
    console.log('Publicaciones automáticas: 0');

    if (summary.errors > 0) {
      process.exitCode = 1;
    }

  } finally {
    if (pool) await pool.end();
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
