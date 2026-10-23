// Pa'l Jangueo - Cross-source event identity audit.
// Read-only. Does not approve, publish or update events.

const pool = require('../db');
const {
  checkLocalArtistEvidence
} = require('../utils/checkLocalArtistEvidence');

const CANDIDATE_ID = 'be8b36d3-bfa3-43d5-bbbd-ea13604e1126';

const OFFICIAL_URL = 'https://victorbluepr.com/';
const PRESS_URL =
  'https://eltrackpr.com/eventos/resenas-de-eventos/eventos-musicales-para-este-wiken/3217/';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function visibleText(html) {
  return normalize(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
  );
}

async function getText(url, expectedHostname) {
  const parsed = new URL(url);

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== expectedHostname
  ) {
    throw new Error('Fuente no autorizada: ' + url);
  }

  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'text/html' }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/html')) {
    throw new Error('La fuente no devolvió HTML.');
  }

  const html = await response.text();

  if (html.length > 1500000) {
    throw new Error('Página demasiado grande.');
  }

  return visibleText(html);
}

function matchesTitle(context, title, artistName) {
  const remaining = normalize(title)
    .replace(normalize(artistName), '');

  const words = [...new Set(
    remaining.split(' ').filter(word => word.length >= 4)
  )];

  return (
    words.length >= 2 &&
    words.every(word =>
      ` ${context} `.includes(` ${word} `)
    )
  );
}

async function main() {
  const { rows } = await pool.query(`
    SELECT id, source_content_hash, analysis_result
    FROM public.event_candidates
    WHERE id = $1
      AND source_name = 'Boletera'
      AND is_test = FALSE
  `, [CANDIDATE_ID]);

  if (rows.length !== 1) {
    throw new Error('Candidato no encontrado.');
  }

  const candidate = rows[0];
  const analysis = candidate.analysis_result || {};
  const extraction = analysis.artist_extraction;
  const event = analysis.event || {};

  if (
    extraction?.source_content_hash !==
    candidate.source_content_hash
  ) {
    throw new Error('Extracción de artistas desactualizada.');
  }

  const victor = (extraction.artists || []).find(
    item => normalize(item.name) === 'victor blue'
  );

  if (!victor || victor.evidence?.source !== 'text') {
    throw new Error('Victor Blue no tiene extracción textual.');
  }

  const evidence = await checkLocalArtistEvidence(
    pool,
    victor.name
  );

  console.log('\n=== CORROBORACIÓN DE IDENTIDAD ===');
  console.log('Evento:', event.title);
  console.log('Artista:', victor.name);
  console.log('Perfil:', evidence.artist_id || 'No encontrado');
  console.log('Evidencia local:', evidence.status);

  if (!evidence.evidence_requirements_met) {
    console.log('Identidad del evento corroborada: NO');
    return;
  }

  // Verify that these exact sources were registered.
  const { rows: sources } = await pool.query(`
    SELECT source_url, source_kind, claim_type
    FROM public.artist_verification_evidence
    WHERE artist_id = $1
      AND verification_status = 'corroborated'
      AND source_url = ANY($2::text[])
  `, [evidence.artist_id, [OFFICIAL_URL, PRESS_URL]]);

  const hasOfficial = sources.some(source =>
    source.source_url === OFFICIAL_URL &&
    source.source_kind === 'artist_official' &&
    source.claim_type === 'based_in_puerto_rico'
  );

  const hasPress = sources.some(source =>
    source.source_url === PRESS_URL &&
    source.source_kind === 'press' &&
    source.claim_type === 'single_pr_performance'
  );

  if (!hasOfficial || !hasPress) {
    console.log('Fuentes registradas insuficientes.');
    return;
  }

  const start = new Date(event.normalized?.start_at || '');

  if (Number.isNaN(start.getTime())) {
    throw new Error('Fecha inválida.');
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('es-PR', {
      timeZone: 'America/Puerto_Rico',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).formatToParts(start)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, normalize(part.value)])
  );

  const fullDate = normalize(
    `${parts.day} de ${parts.month} de ${parts.year}`
  );

  const shortDate = normalize(
    `${parts.day} de ${parts.month}`
  );

  console.log('Fecha del evento (Puerto Rico):', fullDate);
  console.log('Consultando fuentes independientes...');

  const [official, press] = await Promise.all([
    getText(OFFICIAL_URL, 'victorbluepr.com'),
    getText(PRESS_URL, 'eltrackpr.com')
  ]);

  const officialIndex = official.indexOf(fullDate);
  const pressIndex = press.indexOf('victor blue');

  const officialContext = officialIndex >= 0
    ? official.slice(
        Math.max(0, officialIndex - 80),
        officialIndex + 300
      )
    : '';

  const pressContext = pressIndex >= 0
    ? press.slice(
        Math.max(0, pressIndex - 90),
        pressIndex + 550
      )
    : '';

  const venue = normalize(event.venue);

  const officialMatch = Boolean(
    officialContext &&
    officialContext.includes(venue) &&
    official.includes('victor blue') &&
    matchesTitle(officialContext, event.title, victor.name)
  );

  const pressMatch = Boolean(
    pressContext &&
    pressContext.includes(venue) &&
    pressContext.includes(shortDate) &&
    matchesTitle(pressContext, event.title, victor.name)
  );

  console.log('\nSitio oficial coincide:', officialMatch);
  console.log('Prensa independiente coincide:', pressMatch);

  const corroborated = officialMatch && pressMatch;

  console.log(
    'Relación artista-evento corroborada:',
    corroborated
  );
  console.log('Artista vinculado al perfil:', evidence.artist_id);
  console.log('Publicación autorizada: false');

  if (!process.argv.includes('--save')) {
    console.log('Cambios realizados: 0');
    return;
  }

  if (!corroborated) {
    throw new Error(
      'No se guardará una identidad sin ambas coincidencias.'
    );
  }

  if (start <= new Date()) {
    throw new Error(
      'El evento ya pasó. No se guardará esta corroboración.'
    );
  }

  const record = {
    artist_id: evidence.artist_id,
    artist_name: victor.name,
    status: 'cross_source_event_match',
    method: 'official_site_and_independent_press',
    source_content_hash: candidate.source_content_hash,
    event_title: event.title,
    event_start_at: event.normalized.start_at,
    venue: event.venue,
    checked_at: new Date().toISOString(),
    checks: {
      official_event_match: officialMatch,
      independent_press_event_match: pressMatch
    },
    sources: [
      {
        url: OFFICIAL_URL,
        kind: 'artist_official',
        matched_excerpt: officialContext.slice(0, 350)
      },
      {
        url: PRESS_URL,
        kind: 'press',
        matched_excerpt: pressContext.slice(0, 550)
      }
    ],
    local_music_confirmed: false,
    safe_to_publish: false
  };

  const updated = await pool.query(`
    UPDATE public.event_candidates
    SET analysis_result = jsonb_set(
      COALESCE(analysis_result, '{}'::jsonb),
      '{artist_identity_verifications}',
      COALESCE(
        analysis_result->'artist_identity_verifications',
        '{}'::jsonb
      ) || jsonb_build_object($2::text, $3::jsonb),
      true
    )
    WHERE id = $1
      AND source_content_hash = $4
      AND review_status = 'pending_review'
      AND approved_event_id IS NULL
      AND is_test = FALSE
      AND analysis_result->'artist_extraction'
        ->>'source_content_hash' = $4
    RETURNING id
  `, [
    candidate.id,
    evidence.artist_id,
    JSON.stringify(record),
    candidate.source_content_hash
  ]);

  if (updated.rowCount !== 1) {
    throw new Error(
      'El candidato cambió o dejó de estar pendiente. No se guardó.'
    );
  }

  console.log('Corroboración guardada en Supabase: SÍ');
  console.log('Estado del candidato: pending_review');
  console.log('Eventos aprobados: 0');
  console.log('Eventos publicados: 0');
}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
