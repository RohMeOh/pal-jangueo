// Pa'l Jangueo - Curated event candidate staging.
// Preview by default. --stage saves for human review only.
// Never approves or publishes events.

const fs = require('node:fs');
const path = require('node:path');

const {
  prepareCuratedEvent
} = require('../utils/prepareCuratedEvent');

const {
  buildSourceContentHash
} = require('../utils/sourceContentHash');

const args = process.argv.slice(2);
const save = args.includes('--stage');
const files = args.filter(arg => arg !== '--stage');

if (
  files.length !== 1 ||
  args.some(arg => arg.startsWith('--') && arg !== '--stage')
) {
  console.error(
    'Uso: node scripts/stage-curated-event.js archivo.json [--stage]'
  );
  process.exit(1);
}

function isPlaceholderUrl(value) {
  const hostname = new URL(value).hostname.toLowerCase();

  return [
    'example.com',
    'example.org',
    'example.net',
    'localhost'
  ].includes(hostname) || hostname.endsWith('.invalid');
}

function comparableText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

function hasFieldEvidence(items, field, prepared) {
  const sourceText = comparableText(prepared.source_text);

  return items.some(item => {
    if (
      item?.field !== field ||
      typeof item.excerpt !== 'string' ||
      typeof item.source_url !== 'string'
    ) {
      return false;
    }

    const excerpt = comparableText(item.excerpt);

    if (
      excerpt.length < 8 ||
      !sourceText.includes(excerpt)
    ) {
      return false;
    }

    try {
      const url = new URL(item.source_url);

      if (
        url.protocol !== 'https:' ||
        url.href !== prepared.source.url
      ) {
        return false;
      }
    } catch {
      return false;
    }

    // The quoted evidence must identify the actual title/venue.
    if (
      field === 'title' &&
      !excerpt.includes(comparableText(prepared.event.title))
    ) {
      return false;
    }

    if (
      field === 'venue' &&
      !excerpt.includes(comparableText(prepared.event.venue))
    ) {
      return false;
    }

    // Dates and times must match the actual event fields.
    if (
      (field === 'date_text' || field === 'time_text') &&
      !excerpt.includes(comparableText(prepared.event[field]))
    ) {
      return false;
    }

    return true;
  });
}

async function main() {
  const filePath = path.resolve(files[0]);
  const input = JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  );

  const prepared = prepareCuratedEvent(input);
  const event = prepared.event;
  const start = new Date(event.normalized?.start_at || '');

  const requiredFields = [
    'title',
    'venue',
    'date_text',
    'time_text',
    'is_music_event'
  ];

  const missingEvidence = requiredFields.filter(field =>
    !hasFieldEvidence(prepared.field_evidence, field, prepared)
  );

  console.log('\n=== CANDIDATO DOCUMENTADO ===');
  console.log('Modo:', save ? 'GUARDAR' : 'VISTA PREVIA');
  console.log('Evento:', event.title);
  console.log('Fuente:', prepared.source.name);
  console.log('URL:', prepared.source.url);
  console.log('Fecha UTC:', event.normalized?.start_at);
  console.log('Venue:', event.venue);
  console.log('Flyer:', prepared.flyer_url || 'No disponible');
  console.log('Boletos:', prepared.ticket_url || 'No disponible');
  console.log(
    'Validación básica:',
    prepared.validation.basic_checks_passed
  );
  console.log(
    'Evidencias pendientes:',
    missingEvidence.length
      ? missingEvidence.join(', ')
      : 'Ninguna'
  );

  console.log('Revisión humana requerida: SÍ');
  console.log('Publicación autorizada: NO');

  if (!save) {
    console.log('\nCambios realizados: 0');
    return;
  }

  // All additional safeguards apply before opening the DB.
  if (
    input.is_test !== false ||
    input.confirmed_source_review !== true
  ) {
    throw new Error(
      'Se requiere is_test:false y confirmed_source_review:true.'
    );
  }

  if (
    isPlaceholderUrl(prepared.source.url) ||
    prepared.source.name === 'Fuente de prueba'
  ) {
    throw new Error('No se permiten fuentes ficticias.');
  }

  if (!prepared.validation.basic_checks_passed) {
    throw new Error('La validación básica no fue superada.');
  }

  if (
    Number.isNaN(start.getTime()) ||
    start <= new Date()
  ) {
    throw new Error('El evento no tiene una fecha futura válida.');
  }

  if (missingEvidence.length) {
    throw new Error(
      'Faltan evidencias para: ' + missingEvidence.join(', ')
    );
  }

  // The hash includes all source-derived content that affects review.
  const contentSnapshot = JSON.stringify({
    source: prepared.source,
    source_text: prepared.source_text,
    event,
    field_evidence: prepared.field_evidence,
    conflicts: prepared.conflicts,
    flyer_url: prepared.flyer_url,
    ticket_url: prepared.ticket_url
  });

  const contentHash = buildSourceContentHash({
    captionText: contentSnapshot
  });

  const pool = require('../db');
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [prepared.source.url]
    );

    // Catch obvious duplicates across different source URLs.
    const duplicates = await client.query(`
      SELECT id, source_name, source_url
      FROM public.event_candidates
      WHERE is_test = FALSE
        AND source_url IS DISTINCT FROM $4
        AND LOWER(TRIM(analysis_result #>> '{event,title}'))
            = LOWER(TRIM($1))
        AND LOWER(TRIM(analysis_result #>> '{event,venue}'))
            = LOWER(TRIM($2))
        AND analysis_result #>> '{event,normalized,start_at}' = $3
      LIMIT 5
    `, [
      event.title,
      event.venue,
      event.normalized.start_at,
      prepared.source.url
    ]);

    if (duplicates.rows.length) {
      throw new Error(
        'Posible evento duplicado en otra fuente: revisión necesaria.'
      );
    }

    const existing = await client.query(`
      SELECT
        id,
        source_name,
        review_status,
        approved_event_id,
        source_content_hash,
        caption_text,
        analysis_result
      FROM public.event_candidates
      WHERE is_test = FALSE
        AND source_url = $1
      FOR UPDATE
    `, [prepared.source.url]);

    if (existing.rows.length > 1) {
      throw new Error(
        'Hay múltiples candidatos para esta URL.'
      );
    }

    const previous = existing.rows[0];

    if (
      previous &&
      previous.source_name !== prepared.source.name
    ) {
      throw new Error(
        'La URL ya está registrada bajo otra fuente.'
      );
    }

    let result;
    let candidateId;

    if (!previous) {
      const inserted = await client.query(`
        INSERT INTO public.event_candidates (
          source_name,
          source_url,
          flyer_url,
          caption_text,
          analysis_result,
          review_status,
          is_test,
          source_content_hash
        )
        VALUES (
          $1, $2, $3, $4, $5::jsonb,
          'pending_review', FALSE, $6
        )
        RETURNING id
      `, [
        prepared.source.name,
        prepared.source.url,
        prepared.flyer_url,
        prepared.source_text,
        JSON.stringify(prepared),
        contentHash
      ]);

      candidateId = inserted.rows[0].id;
      result = 'GUARDADO';

    } else {
      candidateId = previous.id;

      if (previous.source_content_hash === contentHash) {
        result = 'REUTILIZADO';

      } else if (
        previous.review_status !== 'pending_review' ||
        previous.approved_event_id != null
      ) {
        result = 'ACTUALIZACIÓN BLOQUEADA';

      } else {
        const oldAnalysis = previous.analysis_result || {};

        const history = Array.isArray(
          oldAnalysis.source_change_history
        ) ? oldAnalysis.source_change_history : [];

        const newAnalysis = {
          ...prepared,
          source_change_history: [
            ...history,
            {
              detected_at: new Date().toISOString(),
              previous_hash: previous.source_content_hash,
              new_hash: contentHash,
              previous_event: oldAnalysis.event || null,
              previous_caption_text: previous.caption_text,
              previous_editorial_review:
                oldAnalysis.editorial_review || null
            }
          ].slice(-10),
          merged_candidate_archive:
            oldAnalysis.merged_candidate_archive || []
        };

        const updated = await client.query(`
          UPDATE public.event_candidates
          SET
            flyer_url = $2,
            caption_text = $3,
            analysis_result = $4::jsonb,
            source_content_hash = $5,
            reviewed_at = NULL
          WHERE id = $1
            AND review_status = 'pending_review'
            AND approved_event_id IS NULL
          RETURNING id
        `, [
          candidateId,
          prepared.flyer_url,
          prepared.source_text,
          JSON.stringify(newAnalysis),
          contentHash
        ]);

        if (updated.rowCount !== 1) {
          throw new Error('No se pudo actualizar el candidato.');
        }

        result = 'ACTUALIZADO';
      }
    }

    await client.query('COMMIT');

    console.log('\nResultado:', result);
    console.log('ID:', candidateId);
    console.log('Eventos aprobados: 0');
    console.log('Eventos publicados: 0');

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
