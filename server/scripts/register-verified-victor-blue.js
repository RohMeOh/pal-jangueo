const pool = require('../db');

const save = process.argv.includes('--save');
const artistName = 'Victor Blue';

const evidence = [
  {
    url: 'https://victorbluepr.com/',
    kind: 'artist_official',
    claim: 'based_in_puerto_rico',
    excerpt:
      'Víctor Blue es un artista independiente basado en San Juan y Mayagüez'
  },
  {
    url: 'https://claridadpuertorico.com/49-anos-del-festival-de-claridad/',
    kind: 'press',
    claim: 'active_in_local_scene',
    excerpt:
      'Rigo y Karina Melody Melos; Victor Blue; Sintonía Retro'
  },
  {
    url: 'https://eltrackpr.com/eventos/resenas-de-eventos/eventos-musicales-para-este-wiken/3217/',
    kind: 'press',
    claim: 'single_pr_performance',
    excerpt:
      'El intérprete Víctor Blue se presentará en La Caverna este sábado 24 de octubre'
  }
];

async function main() {
  console.log('\n=== IDENTIDAD: VICTOR BLUE ===');

  for (const item of evidence) {
    console.log('\nFuente:', item.url);
    console.log('Tipo:', item.claim);
    console.log('Evidencia:', item.excerpt);
  }

  if (!save) {
    console.log('\nModo: VISTA PREVIA');
    console.log('Cambios realizados: 0');
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Avoid two concurrent registrations of the same name.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['pal-jangueo-artist:Victor Blue']
    );

    const existing = await client.query(`
      SELECT id, name
      FROM public.artists
      WHERE LOWER(TRIM(name)) = LOWER($1)
      FOR UPDATE
    `, [artistName]);

    if (existing.rows.length > 1) {
      throw new Error('Hay perfiles duplicados. Revisar identidad.');
    }

    let artistId;

    if (existing.rows.length === 1) {
      artistId = existing.rows[0].id;
      console.log('\nPerfil existente reutilizado.');
    } else {
      const created = await client.query(`
        INSERT INTO public.artists (
          id, name, genre, website_url
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3
        )
        RETURNING id
      `, [
        artistName,
        'Indie Pop/Rock',
        'https://victorbluepr.com/'
      ]);

      artistId = created.rows[0].id;
      console.log('\nPerfil creado.');
    }

    let inserted = 0;

    for (const item of evidence) {
      const result = await client.query(`
        INSERT INTO public.artist_verification_evidence (
          artist_id,
          source_url,
          source_kind,
          claim_type,
          evidence_excerpt,
          verification_status,
          checked_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          'corroborated', NOW()
        )
        ON CONFLICT (
          artist_id, source_url, claim_type
        )
        DO NOTHING
        RETURNING id
      `, [
        artistId,
        item.url,
        item.kind,
        item.claim,
        item.excerpt
      ]);

      inserted += result.rowCount;
    }

    await client.query('COMMIT');

    console.log('ID del artista:', artistId);
    console.log('Evidencias nuevas:', inserted);
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
