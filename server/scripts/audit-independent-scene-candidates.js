// Pa'l Jangueo - Audit independent music scene relevance.
// Read-only. Does not approve, publish or modify candidates.

const pool = require('../db');

const {
  assessLocalMusicEvidence
} = require('../utils/assessLocalMusicEvidence');

const {
  evaluateStoredArtistIdentities
} = require('../utils/evaluateStoredArtistIdentities');

const {
  assessIndependentMusicScene
} = require('../utils/assessIndependentMusicScene');

const {
  findVerifiedSceneVenue
} = require('../utils/findVerifiedSceneVenue');

const {
  findVerifiedSceneOrganizer
} = require('../utils/findVerifiedSceneOrganizer');

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function validBoleteraUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'boletos.boletera.net' &&
      /^\/e\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

async function main() {
  const { rows } = await pool.query(`
    SELECT
      id,
      source_name,
      source_url,
      source_content_hash,
      caption_text,
      analysis_result
    FROM public.event_candidates
    WHERE source_name = 'Boletera'
      AND is_test = FALSE
      AND review_status = 'pending_review'
    ORDER BY id
  `);

  console.log('\n=== RELEVANCIA PARA LA ESCENA ===');

  for (const candidate of rows) {
    const event = candidate.analysis_result?.event || {};

    console.log('\nEvento:', event.title || 'Sin título');

    const start = new Date(event.normalized?.start_at || '');

    if (
      Number.isNaN(start.getTime()) ||
      start <= new Date()
    ) {
      console.log('Estado: past_or_invalid_event');
      console.log('Publicación autorizada: false');
      continue;
    }

    let raw;

    try {
      raw = JSON.parse(candidate.caption_text);
    } catch {
      console.log('Estado: invalid_source_data');
      console.log('Publicación autorizada: false');
      continue;
    }

    const music = assessLocalMusicEvidence({
      rawDescription: raw.description_raw,
      sourceUrl: candidate.source_url
    });

    const identities = await evaluateStoredArtistIdentities(
      pool,
      candidate
    );

    // Only previously corroborated event-specific
    // artist identities count here.
    const documentedAppearances =
      identities.documented_identity_matches;

    // Match the venue stated by Boletera against
    // our normalized candidate data.
    const originalVenue = raw?.venue?.name;
    const venueNamesAgree = Boolean(
      originalVenue &&
      event.venue &&
      normalizeName(originalVenue) ===
        normalizeName(event.venue)
    );

    const verifiedVenue = (
      venueNamesAgree &&
      validBoleteraUrl(candidate.source_url)
    )
      ? await findVerifiedSceneVenue(pool, {
          name: originalVenue,
          municipality:
            raw.venue.municipality ||
            event.municipality ||
            null
        })
      : null;

    // Construct this link from backend-verified data,
    // never from Gemini or raw external JSON.
    const verifiedOrganizer = validBoleteraUrl(
      candidate.source_url
    )
      ? await findVerifiedSceneOrganizer(pool, {
          sourceTitle: raw.name,
          eventTitle: event.title
        })
      : null;

    const sceneLinks = [];

    if (verifiedVenue) {
      sceneLinks.push({
        link_type: 'independent_scene_venue',
        verification_status: 'corroborated',
        event_match_confirmed: true,
        source_url: candidate.source_url
      });
    }

    if (verifiedOrganizer) {
      sceneLinks.push({
        link_type: verifiedOrganizer.entity_type === 'collective'
          ? 'independent_scene_collective'
          : 'independent_scene_promoter',
        verification_status: 'corroborated',
        event_match_confirmed: true,
        source_url: candidate.source_url
      });
    }

    console.log(
      'Colectivo/promotor de la escena:',
      verifiedOrganizer?.name || 'No verificado'
    );

    const scene = assessIndependentMusicScene({
      musicalPerformanceDetected:
        music.musical_performance_detected === true,
      documentedSceneArtistAppearances:
        documentedAppearances,
      verifiedSceneLinks: sceneLinks
    });

    console.log(
      'Venue de la escena:',
      verifiedVenue?.venue_name || 'No verificado'
    );

    console.log(
      'Presentación musical detectada:',
      scene.musical_performance_detected
    );

    console.log(
      'Artistas locales vinculados y corroborados:',
      documentedAppearances
    );

    console.log(
      'Vínculos verificados con venues/promotores:',
      scene.corroborated_scene_connections
    );

    console.log('Estado:', scene.status);

    console.log(
      'Relevancia documentada:',
      scene.scene_relevance_documented
    );

    console.log(
      'Residencia en PR requerida:',
      scene.performer_residency_required
    );

    console.log(
      'Publicación autorizada:',
      scene.safe_to_publish
    );
  }

  console.log('\nCandidatos examinados:', rows.length);
  console.log('Cambios realizados: 0');
}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
