// Pa'l Jangueo - Verify scene organizers mentioned in an event.
// Read-only. Does not approve or publish events.

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sourceDomain(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;

    const host = url.hostname.toLowerCase();

    if (host === 'ra.co' || host.endsWith('.ra.co')) {
      return 'ra.co';
    }

    if (
      host === 'marriott.com' ||
      host.endsWith('.marriott.com')
    ) {
      return 'marriott.com';
    }

    return host;
  } catch {
    return null;
  }
}

function explicitlyPresents(title, organizationName) {
  const titleText = normalize(title);
  const nameText = normalize(organizationName);

  if (!nameText) return false;

  return [
    `${nameText} presenta `,
    `${nameText} presents `,
    `${nameText} organiza `
  ].some(prefix => titleText.startsWith(prefix));
}

async function findVerifiedSceneOrganizer(pool, {
  sourceTitle,
  eventTitle
}) {
  // Both titles must agree. Never trust a name only
  // because it happens to appear in a description.
  if (
    !sourceTitle ||
    !eventTitle ||
    normalize(sourceTitle) !== normalize(eventTitle)
  ) {
    return null;
  }

  const { rows: organizations } = await pool.query(`
    SELECT id, name, entity_type
    FROM public.scene_entities
    WHERE entity_type IN ('collective', 'promoter')
      AND verification_status = 'verified'
      AND verified_at IS NOT NULL
  `);

  const matching = organizations.filter(item =>
    explicitlyPresents(sourceTitle, item.name)
  );

  // Zero or multiple matches must not be guessed.
  if (matching.length !== 1) return null;

  const organization = matching[0];

  const { rows: evidence } = await pool.query(`
    SELECT source_url
    FROM public.scene_entity_evidence
    WHERE scene_entity_id = $1
      AND verification_status = 'corroborated'
      AND checked_at IS NOT NULL
  `, [organization.id]);

  const domains = new Set(
    evidence.map(item => sourceDomain(item.source_url))
      .filter(Boolean)
  );

  if (domains.size < 2) return null;

  return {
    scene_entity_id: organization.id,
    name: organization.name,
    entity_type: organization.entity_type,
    scene_membership_verified: true,
    event_relation: 'explicit_presenter_in_ticket_title',
    independent_source_domains: domains.size
  };
}

module.exports = { findVerifiedSceneOrganizer };
