// Pa'l Jangueo - Curated independent-scene venue registry.
// Preview by default; --save writes reviewed evidence.
// Does not approve or publish events.

const pool = require('../db');

const save = process.argv.includes('--save');

const registry = [
  {
    name: 'La Respuesta',
    sources: [
      {
        url: 'https://claridadpuertorico.com/fofito-amor-y-vision-para-impulsar-la-respuesta-y-santurce-virtual/',
        kind: 'press',
        summary:
          'Claridad documenta a La Respuesta como espacio de desarrollo y encuentro de artistas de la escena independiente de Puerto Rico desde 2008.'
      },
      {
        url: 'https://www.primerahora.com/entretenimiento/musica/notas/vivo-el-intercambio/',
        kind: 'press',
        summary:
          'Primera Hora documenta conciertos independientes en La Respuesta con bandas locales y visitantes compartiendo escenario.'
      }
    ]
  }
];

async function registerVenue(client, item) {
  const found = await client.query(`
    SELECT id, name, location_verification_status
    FROM public.venues
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
    FOR UPDATE
  `, [item.name]);

  if (found.rows.length !== 1) {
    throw new Error(
      `Se esperaba un venue único: ${item.name}`
    );
  }

  const venue = found.rows[0];

  if (venue.location_verification_status !== 'verified') {
    throw new Error(
      `La ubicación de ${item.name} no está verificada.`
    );
  }

  console.log('\nVenue:', venue.name);
  console.log('ID:', venue.id);
  console.log('Ubicación:', venue.location_verification_status);

  for (const source of item.sources) {
    console.log('Fuente:', source.url);
    console.log('Evidencia:', source.summary);
  }

  if (!save) {
    console.log('Modo: VISTA PREVIA');
    return;
  }

  const existing = await client.query(`
    SELECT id, verification_status
    FROM public.scene_entities
    WHERE entity_type = 'venue'
      AND venue_id = $1
    FOR UPDATE
  `, [venue.id]);

  if (existing.rows.length > 1) {
    throw new Error('Registros de escena duplicados.');
  }

  if (existing.rows[0]?.verification_status === 'rejected') {
    throw new Error(
      'La clasificación fue rechazada anteriormente.'
    );
  }

  let sceneId = existing.rows[0]?.id;

  if (!sceneId) {
    const inserted = await client.query(`
      INSERT INTO public.scene_entities (
        entity_type,
        venue_id,
        verification_status
      )
      VALUES ('venue', $1, 'pending')
      RETURNING id
    `, [venue.id]);

    sceneId = inserted.rows[0].id;
  }

  for (const source of item.sources) {
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
      sceneId,
      source.url,
      source.kind,
      source.summary
    ]);
  }

  const verified = await client.query(`
    SELECT source_url, verification_status
    FROM public.scene_entity_evidence
    WHERE scene_entity_id = $1
      AND source_url = ANY($2::text[])
  `, [
    sceneId,
    item.sources.map(source => source.url)
  ]);

  const allCorroborated = item.sources.every(source =>
    verified.rows.some(row =>
      row.source_url === source.url &&
      row.verification_status === 'corroborated'
    )
  );

  const independentHosts = new Set(
    item.sources.map(source => new URL(source.url).hostname)
  );

  if (!allCorroborated || independentHosts.size < 2) {
    throw new Error(
      'Se requieren dos fuentes independientes corroboradas.'
    );
  }

  await client.query(`
    UPDATE public.scene_entities
    SET verification_status = 'verified',
        verified_at = COALESCE(verified_at, NOW())
    WHERE id = $1
      AND verification_status IN ('pending', 'verified')
  `, [sceneId]);

  console.log('Entidad de escena:', sceneId);
  console.log('Estado: verified');
  console.log('Fuentes corroboradas:', verified.rows.length);
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--save')) {
    throw new Error('Uso: node scripts/register-scene-venues.js [--save]');
  }

  console.log('\n=== REGISTRO DE VENUES DE LA ESCENA ===');
  console.log('Modo:', save ? 'GUARDAR' : 'VISTA PREVIA');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const item of registry) {
      await registerVenue(client, item);
    }

    if (save) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    console.log('\nEventos modificados: 0');
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
