// Pa'l Jangueo - Register a documented scene collective.
// Preview by default. --save writes curated evidence.
// Never approves or publishes events.

const pool = require('../db');

const args = process.argv.slice(2);

if (args.some(arg => arg !== '--save')) {
  console.error('Uso: node scripts/register-scene-collective.js [--save]');
  process.exit(1);
}

const save = args.includes('--save');

const collective = {
  name: 'y2k Obsession',
  entity_type: 'collective',
  sources: [
    {
      url: 'https://ra.co/events/1610024',
      kind: 'other',
      summary:
        'Resident Advisor identifica a Y2K Obsession como promotor de ASSIDO en San Juan en 2022 y documenta su actividad en la escena electrónica underground puertorriqueña.'
    },
    {
      url: 'https://es.ra.co/events/2501265',
      kind: 'other',
      summary:
        'Resident Advisor documenta TORQUE, presentado por y2k Obsession en 7eight7 en agosto de 2026, y su conexión con la serie ASSIDO.'
    },
    {
      url: 'https://event.marriott.com/sjusi-sheraton-puerto-rico-resort-and-casino/events/santurce/y2k-obsession-presenta-torque-12570598',
      kind: 'other',
      summary:
        'Marriott Events registra TORQUE como evento presentado por y2k Obsession en 7eight7, con programación musical en San Juan durante agosto de 2026.'
    }
  ]
};

function sourceDomain(value) {
  const host = new URL(value).hostname.toLowerCase();

  // Treat RA language subdomains as one source.
  if (host === 'ra.co' || host.endsWith('.ra.co')) {
    return 'ra.co';
  }

  if (host === 'marriott.com' || host.endsWith('.marriott.com')) {
    return 'marriott.com';
  }

  return host;
}

async function main() {
  console.log('\n=== COLECTIVO DE LA ESCENA ===');
  console.log('Nombre:', collective.name);
  console.log('Modo:', save ? 'GUARDAR' : 'VISTA PREVIA');

  for (const source of collective.sources) {
    console.log('\nFuente:', source.url);
    console.log('Evidencia:', source.summary);
  }

  if (!save) {
    console.log('\nCambios realizados: 0');
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['scene-collective:y2k obsession']
    );

    const existing = await client.query(`
      SELECT id, verification_status
      FROM public.scene_entities
      WHERE entity_type = 'collective'
        AND LOWER(BTRIM(name)) = LOWER(BTRIM($1))
      FOR UPDATE
    `, [collective.name]);

    if (existing.rows.length > 1) {
      throw new Error('Identidades duplicadas.');
    }

    if (existing.rows[0]?.verification_status === 'rejected') {
      throw new Error('El colectivo fue rechazado previamente.');
    }

    let entityId = existing.rows[0]?.id;

    if (!entityId) {
      const inserted = await client.query(`
        INSERT INTO public.scene_entities (
          entity_type, name, verification_status
        )
        VALUES ('collective', $1, 'pending')
        RETURNING id
      `, [collective.name]);

      entityId = inserted.rows[0].id;
    }

    for (const source of collective.sources) {
      await client.query(`
        INSERT INTO public.scene_entity_evidence (
          scene_entity_id,
          source_url,
          source_kind,
          evidence_summary,
          verification_status,
          checked_at
        )
        VALUES (
          $1, $2, $3, $4, 'corroborated', NOW()
        )
        ON CONFLICT (scene_entity_id, source_url)
        DO NOTHING
      `, [
        entityId,
        source.url,
        source.kind,
        source.summary
      ]);
    }

    const { rows } = await client.query(`
      SELECT source_url
      FROM public.scene_entity_evidence
      WHERE scene_entity_id = $1
        AND verification_status = 'corroborated'
        AND checked_at IS NOT NULL
    `, [entityId]);

    const recordedUrls = new Set(rows.map(row => row.source_url));

    const allRecorded = collective.sources.every(source =>
      recordedUrls.has(source.url)
    );

    const domains = new Set(
      rows.map(row => sourceDomain(row.source_url))
    );

    if (!allRecorded || domains.size < 2) {
      throw new Error(
        'Evidencia insuficiente o fuentes sin corroborar.'
      );
    }

    await client.query(`
      UPDATE public.scene_entities
      SET verification_status = 'verified',
          verified_at = COALESCE(verified_at, NOW())
      WHERE id = $1
        AND verification_status IN ('pending', 'verified')
    `, [entityId]);

    await client.query('COMMIT');

    console.log('\nColectivo registrado:', collective.name);
    console.log('ID:', entityId);
    console.log('Estado: verified');
    console.log('Fuentes registradas:', rows.length);
    console.log('Dominios distintos:', domains.size);
    console.log('Eventos modificados: 0');
    console.log('Eventos publicados: 0');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
