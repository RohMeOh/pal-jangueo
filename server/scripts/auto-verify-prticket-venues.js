const pool = require('../db');

const apply = process.argv.includes('--apply');

if (process.argv.slice(2).some(arg => arg !== '--apply')) {
  throw new Error('Uso: node scripts/auto-verify-prticket-venues.js [--apply]');
}

// Fuentes autorizadas para verificar locales.
// Se pueden incorporar otros municipios y venues más adelante.
const trustedVenues = [
  {
    name: 'Teatro Braulio Castillo',
    region: 'La Metro',
    municipality: 'Bayamón',
    neighborhood: null,
    address: 'Casa Alcaldía Plazoleta, PR-2, Bayamón, Puerto Rico',
    website_url: 'https://www.teatrobrauliocastillo.com/',
    location_source_url:
      'https://www.municipiodebayamon.com/departamento-de-historia-y-cultura/lugares-de-interes/',
    evidence: [
      {
        label: 'Directorio municipal',
        url: 'https://www.municipiodebayamon.com/administracion/directorio-municipal/',
        required: ['casa alcaldia', 'carretera num']
      },
      {
        label: 'Lugares de interés municipales',
        url: 'https://www.municipiodebayamon.com/departamento-de-historia-y-cultura/lugares-de-interes/',
        required: ['casa alcaldia', 'pr-2', 'bayamon']
      },
      {
        label: 'Página del teatro',
        url: 'https://www.teatrobrauliocastillo.com/',
        required: ['bayamon']
      }
    ]
  }
];

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToText(html) {
  const entities = {
    nbsp: ' ', amp: '&', quot: '"', apos: "'",
    aacute: 'á', eacute: 'é', iacute: 'í',
    oacute: 'ó', uacute: 'ú', ntilde: 'ñ'
  };

  return normalize(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, hex, dec) => {
        const code = parseInt(hex || dec, hex ? 16 : 10);
        return code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code) : ' ';
      })
      .replace(/&([a-z]+);/gi, (match, name) =>
        entities[name.toLowerCase()] || ' '
      )
  );
}

async function fetchOfficialText(url) {
  const expected = new URL(url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(16000),
    headers: { Accept: 'text/html' }
  });

  const final = new URL(response.url);

  const hostname = host => host.replace(/^www\./, '');

  if (
    !response.ok ||
    final.protocol !== 'https:' ||
    hostname(final.hostname) !== hostname(expected.hostname)
  ) {
    throw new Error('Respuesta o redirección no autorizada');
  }

  const html = await response.text();

  if (html.length > 4000000) {
    throw new Error('Respuesta demasiado grande');
  }

  return htmlToText(html);
}

function matchesVenueSection(text, name, required) {
  const needle = normalize(name);
  let from = 0;

  while (true) {
    const index = text.indexOf(needle, from);

    if (index === -1) return false;

    const nearby = text.slice(index, index + 1500);

    if (required.every(term =>
      nearby.includes(normalize(term))
    )) {
      return true;
    }

    from = index + needle.length;
  }
}

async function main() {
  console.log('\n=== VERIFICACIÓN AUTOMÁTICA DE LOCALES ===');
  console.log('Modo:', apply ? 'REGISTRO' : 'SOLO LECTURA');

  const pending = await pool.query(`
    SELECT DISTINCT
      analysis_result #>> '{event,venue}' AS venue
    FROM public.event_candidates
    WHERE source_name = 'PRticket'
      AND review_status = 'pending_review'
      AND is_test = FALSE
  `);

  for (const venue of trustedVenues) {
    const needed = pending.rows.some(row =>
      normalize(row.venue) === normalize(venue.name)
    );

    if (!needed) {
      console.log('\nSIN CANDIDATOS:', venue.name);
      continue;
    }

    console.log('\nLocal:', venue.name);

    let verified = true;

    for (const source of venue.evidence) {
      try {
        const text = await fetchOfficialText(source.url);

        const matched = matchesVenueSection(
          text, venue.name, source.required
        );

        console.log(
          matched ? 'PASS:' : 'NO VERIFICADO:',
          source.label
        );

        if (!matched) verified = false;

      } catch (error) {
        verified = false;
        console.log(
          'NO VERIFICADO:',
          source.label,
          error.message
        );
      }
    }

    if (!verified) {
      console.log('RESULTADO: REQUIERE REVISIÓN');
      continue;
    }

    const db = await pool.connect();

    try {
      if (apply) {
        await db.query('BEGIN');
        await db.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          ['venue:' + normalize(venue.name)]
        );
      }

      const existing = await db.query(`
        SELECT id, name, location_verification_status
        FROM public.venues
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
      `, [venue.name]);

      if (existing.rows.length) {
        console.log('RESULTADO: LOCAL YA REGISTRADO');
        console.table(existing.rows);
      } else if (!apply) {
        console.log('RESULTADO: APTO PARA REGISTRO');
      } else {
        const result = await db.query(`
          INSERT INTO public.venues (
            name, region, municipality, neighborhood,
            address, website_url,
            location_verification_status,
            location_verified_at,
            location_source_url
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            'verified', NOW(), $7
          )
          RETURNING id, name, location_verification_status
        `, [
          venue.name,
          venue.region,
          venue.municipality,
          venue.neighborhood,
          venue.address,
          venue.website_url,
          venue.location_source_url
        ]);

        console.log('RESULTADO: LOCAL REGISTRADO');
        console.table(result.rows);
      }

      if (apply) await db.query('COMMIT');

    } catch (error) {
      if (apply) await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  console.log('\nEventos publicados: 0');
  console.log('Modo de escritura:', apply);
}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
