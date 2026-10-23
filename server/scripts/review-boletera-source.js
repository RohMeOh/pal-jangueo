// Pa'l Jangueo - Verify Boletera source before editorial review.
// Read-only technical verification. Never records editorial approval.

const pool = require('../db');
const { isDeepStrictEqual } = require('node:util');
const { extractEventJsonLd } = require('../utils/extractEventJsonLd');
const { adaptBoleteraEvent } = require('../adapters/boleteraAdapter');
const { buildSourceContentHash } = require('../utils/sourceContentHash');
const {
  checkSceneApprovalEligibility
} = require('../utils/checkSceneApprovalEligibility');

const [id, ...flags] = process.argv.slice(2);
// This script only verifies source data; it cannot save reviews.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (
  !UUID.test(id || '') ||
  flags.length > 0
) {
  console.error(
    'Uso: node scripts/review-boletera-source.js UUID'
  );
  process.exit(1);
}

function sameText(a, b) {
  return String(a ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase() === String(b ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
}

function classifyChange(previous, current) {
  if (isDeepStrictEqual(previous, current)) {
    return 'unchanged';
  }

  const { organizers, ...remaining } = current;

  const platformOnly =
    !Object.hasOwn(previous, 'organizers') &&
    Array.isArray(organizers) &&
    organizers.length === 1 &&
    organizers[0]?.name === 'Boletera' &&
    organizers[0]?.url === 'https://boletos.boletera.net/' &&
    Object.keys(organizers[0]).length === 2 &&
    isDeepStrictEqual(previous, remaining);

  return platformOnly
    ? 'platform_metadata_only'
    : 'review_required';
}

async function main() {
  const { rows } = await pool.query(`
    SELECT *
    FROM public.event_candidates
    WHERE id = $1
  `, [id]);

  if (rows.length !== 1) {
    throw new Error('Candidato no encontrado.');
  }

  const candidate = rows[0];

  if (
    candidate.source_name !== 'Boletera' ||
    candidate.is_test !== false ||
    candidate.review_status !== 'pending_review' ||
    candidate.approved_event_id != null ||
    candidate.reviewed_at ||
    candidate.analysis_result?.editorial_review
  ) {
    throw new Error('Candidato no apto para esta revisión.');
  }

  const url = new URL(candidate.source_url);

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'boletos.boletera.net' ||
    !/^\/e\/[^/]+\/?$/.test(url.pathname)
  ) {
    throw new Error('URL de Boletera no válida.');
  }

  const response = await fetch(url.href, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'text/html' }
  });

  if (!response.ok) {
    throw new Error(`Boletera respondió HTTP ${response.status}`);
  }

  const extracted = extractEventJsonLd(
    await response.text(),
    url.href
  );

  if (extracted.length !== 1) {
    throw new Error('Extracción ambigua.');
  }

  const previousRaw = JSON.parse(candidate.caption_text);
  const currentRaw = extracted[0];

  const storedHash = buildSourceContentHash({
    captionText: candidate.caption_text
  });

  if (storedHash !== candidate.source_content_hash) {
    throw new Error('Integridad del candidato incorrecta.');
  }

  const change = classifyChange(previousRaw, currentRaw);

  if (change === 'review_required') {
    throw new Error('Cambios sustanciales: requiere revisión adicional.');
  }

  const currentEvent = adaptBoleteraEvent(currentRaw).event;
  const storedEvent = candidate.analysis_result?.event || {};

  if (
    !sameText(currentEvent.title, storedEvent.title) ||
    !sameText(currentEvent.venue, storedEvent.venue) ||
    currentEvent.normalized?.start_at !==
      storedEvent.normalized?.start_at ||
    storedEvent.event_status !== 'EventScheduled'
  ) {
    throw new Error('Los datos esenciales del evento no coinciden.');
  }

  const scene = await checkSceneApprovalEligibility(pool, candidate);

  if (!scene.eligible) {
    throw new Error(
      'Relevancia de escena pendiente: ' + scene.status
    );
  }

  console.log('\n=== REVISIÓN EDITORIAL DE BOLETERA ===');
  console.log('Modo: VISTA PREVIA');
  console.log('Evento:', storedEvent.title);
  console.log('Venue:', storedEvent.venue);
  console.log('Fecha UTC:', storedEvent.normalized.start_at);
  console.log('Fuente consultada: Boletera');
  console.log('Integridad del registro: CORRECTA');
  console.log('Clasificación del cambio:', change);
  console.log('Pilares corroborados:', scene.confirmed_pillars.join(', '));
  console.log('Publicación autorizada: NO');

  console.log('Verificación técnica: COMPLETADA');
  console.log('Revisión humana registrada: NO');
  console.log('Cambios realizados: 0');
  console.log('Eventos publicados: 0');

}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
