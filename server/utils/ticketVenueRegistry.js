// Shared venue registration for PRticket and Boletera.
// Call ensureTicketVenue inside an existing database transaction.

const { randomUUID } = require('node:crypto');
const {
  getMunicipalityRegion
} = require('./municipalityRegions');

const MUNICIPALITIES = `
Adjuntas|Aguada|Aguadilla|Aguas Buenas|Aibonito|Añasco|
Arecibo|Arroyo|Barceloneta|Barranquitas|Bayamón|Cabo Rojo|
Caguas|Camuy|Canóvanas|Carolina|Cataño|Cayey|Ceiba|
Ciales|Cidra|Coamo|Comerío|Corozal|Culebra|Dorado|
Fajardo|Florida|Guánica|Guayama|Guayanilla|Guaynabo|
Gurabo|Hatillo|Hormigueros|Humacao|Isabela|Jayuya|
Juana Díaz|Juncos|Lajas|Lares|Las Marías|Las Piedras|
Loíza|Luquillo|Manatí|Maricao|Maunabo|Mayagüez|Moca|
Morovis|Naguabo|Naranjito|Orocovis|Patillas|Peñuelas|
Ponce|Quebradillas|Rincón|Río Grande|Sabana Grande|
Salinas|San Germán|San Juan|San Lorenzo|San Sebastián|
Santa Isabel|Toa Alta|Toa Baja|Trujillo Alto|Utuado|
Vega Alta|Vega Baja|Vieques|Villalba|Yabucoa|Yauco
`.replace(/\s*\n\s*/g, '').split('|');

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const MUNICIPALITY_MAP = new Map(
  MUNICIPALITIES.map(name => [normalize(name), name])
);

const LOCALITIES = new Map([
  ['garrochales', ['Arecibo', 'Garrochales']],
  ['santurce', ['San Juan', 'Santurce']],
  ['miramar', ['San Juan', 'Miramar']],
  ['rio piedras', ['San Juan', 'Río Piedras']],
  ['hato rey', ['San Juan', 'Hato Rey']],
  ['condado', ['San Juan', 'Condado']],
  ['isla verde', ['Carolina', 'Isla Verde']]
]);

function trustedSource(sourceName, sourceUrl) {
  try {
    const url = new URL(sourceUrl);

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password
    ) return false;

    if (sourceName === 'PRticket') {
      return url.hostname === 'boletos.prticket.com' &&
        /^\/events\/es\/[a-z0-9_-]+\/?$/i.test(url.pathname);
    }

    if (sourceName === 'Boletera') {
      return url.hostname === 'boletos.boletera.net' &&
        /^\/e\/[^/]+\/?$/.test(url.pathname);
    }

    return false;
  } catch {
    return false;
  }
}

function planTicketVenue({
  sourceName,
  sourceUrl,
  venueName,
  municipality
}) {
  if (!trustedSource(sourceName, sourceUrl)) {
    throw new Error('Fuente de venue no autorizada.');
  }

  const name = String(venueName || '').trim();

  if (
    name.length < 3 ||
    name.length > 180 ||
    /[<>]/.test(name)
  ) {
    throw new Error('Nombre de venue inválido.');
  }

  const rawMunicipality = normalize(municipality);

  let city = MUNICIPALITY_MAP.get(rawMunicipality) || null;
  let neighborhood = null;

  if (!city && LOCALITIES.has(rawMunicipality)) {
    [city, neighborhood] = LOCALITIES.get(rawMunicipality);
  }

  if (rawMunicipality && !city) {
    throw new Error(
      'Ubicación no reconocida como municipio o localidad de PR: ' +
      municipality
    );
  }

  // Boletera supplies municipality information in its JSON-LD.
  // Require that location for newly discovered Boletera venues.
  if (sourceName === 'Boletera' && !city) {
    throw new Error('Boletera no confirmó el municipio de PR.');
  }

  return {
    name,
    municipality: city,
    neighborhood,
    sourceUrl,
    sourceName
  };
}

async function ensureTicketVenue(db, plan) {
  // This lock is retained until the caller commits or rolls back.
  await db.query(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    ['ticket-venue:' + normalize(plan.name)]
  );

  const existing = await db.query(`
    SELECT id, name, municipality,
           location_verification_status
    FROM public.venues
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
    FOR UPDATE
  `, [plan.name]);

  let matches = existing.rows;

  if (plan.municipality) {
    matches = matches.filter(row =>
      !row.municipality ||
      normalize(row.municipality) === normalize(plan.municipality)
    );
  }

  if (matches.length > 1) {
    throw new Error('Venue ambiguo: requiere conciliación.');
  }

  if (matches.length === 1) {
    const venue = matches[0];

    if (venue.location_verification_status === 'conflict') {
      throw new Error('Venue con ubicación contradictoria.');
    }

    return {
      id: venue.id,
      created: false,
      verified: venue.location_verification_status === 'verified'
    };
  }

  const region = getMunicipalityRegion(
    plan.municipality
  );

  const inserted = await db.query(`
    INSERT INTO public.venues (
      id, name, region, municipality, neighborhood,
      location_verification_status, location_source_url
    )
    VALUES (
      $1, $2, $3, $4, $5, 'unverified', $6
    )
    RETURNING id
  `, [
    randomUUID(),
    plan.name,
    region,
    plan.municipality,
    plan.neighborhood,
    plan.sourceUrl
  ]);

  return {
    id: inserted.rows[0].id,
    created: true,
    verified: false
  };
}

module.exports = {
  planTicketVenue,
  ensureTicketVenue
};
