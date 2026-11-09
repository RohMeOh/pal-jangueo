'use strict';

// Targeted repair: the previous official flyer now returns HTTP 404.
// Only the published event's flyer changes; review evidence stays intact.
const { extractBoleteraFlyer } = require('../utils/extractBoleteraFlyer');

const SOURCE = 'https://boletos.boletera.net/e/chuwi-en-vivo';
const EVENT_ID = 'ae1d286c-d735-4ad1-ac96-74d9478c5fc5';
const OLD_FLYER = 'https://res.cloudinary.com/eventservice/image/upload/q_auto,f_auto/v1793720093/saas/logos/image_1793720070996_wi3i9j6jn.webp';
const NEW_FLYER = 'https://res.cloudinary.com/eventservice/image/upload/q_auto,f_auto/v1793823611/saas/logos/image_1793823607418_xd8xhucpd.webp';

async function refreshChuwiFlyer({ pool, fetchImpl = fetch, apply = false }) {
  // Recheck the official event and checkout before opening a transaction.
  for (const url of [SOURCE, SOURCE + '/tickets']) {
    const response = await fetchImpl(url, {
      redirect: 'error', signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    if (extractBoleteraFlyer(await response.text()) !== NEW_FLYER) {
      throw new Error('La fuente cambió; revisar el flyer antes de actualizar.');
    }
  }

  const image = await fetchImpl(NEW_FLYER, {
    redirect: 'error', signal: AbortSignal.timeout(20000)
  });
  if (!image.ok || !/^image\//i.test(image.headers.get('content-type') || '')) {
    throw new Error('El nuevo flyer no responde con una imagen válida.');
  }
  if (!(await image.arrayBuffer()).byteLength) {
    throw new Error('El nuevo flyer está vacío.');
  }

  const db = await pool.connect();
  let transaction = false;
  try {
    await db.query('BEGIN');
    transaction = true;
    const { rows } = await db.query(`
      SELECT e.id, e.title, e.flyer_url
      FROM public.events e
      WHERE e.id = $1 AND e.ticket_provider = 'Boletera'
        AND e.ticket_url = $2 AND e.is_published = TRUE
        AND EXISTS (
          SELECT 1 FROM public.event_sources es
          WHERE es.event_id = e.id AND es.source_url = $3
        )
      FOR UPDATE OF e
    `, [EVENT_ID, SOURCE + '/tickets', SOURCE]);

    if (rows.length !== 1 || !/chuwi/i.test(rows[0].title)) {
      throw new Error('No existe un evento publicado único con el vínculo esperado.');
    }

    if (rows[0].flyer_url === NEW_FLYER) {
      await db.query('ROLLBACK');
      transaction = false;
      console.log('YA_ACTUALIZADO: CHUWI conserva el flyer oficial actual.');
      return;
    }
    if (rows[0].flyer_url !== OLD_FLYER) {
      throw new Error('El flyer almacenado cambió; no se sobrescribió.');
    }

    const updated = await db.query(`
      UPDATE public.events
      SET flyer_url = $2, updated_at = NOW()
      WHERE id = $1 AND flyer_url = $3
      RETURNING id, title, flyer_url
    `, [EVENT_ID, NEW_FLYER, OLD_FLYER]);
    if (updated.rowCount !== 1) throw new Error('No se actualizó exactamente un evento.');

    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    transaction = false;
    console.table(updated.rows);
    console.log(apply ? 'Flyer de CHUWI actualizado.' : 'SIMULACIÓN REVERTIDA.');
    console.log('Título, fecha, precios y revisión: sin cambios.');
  } catch (error) {
    if (transaction) await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--simulate', '--apply'].includes(args[0])) {
    console.error('Uso: node scripts/refresh-chuwi-flyer.js --simulate|--apply');
    process.exitCode = 1;
  } else {
    const pool = require('../db');
    refreshChuwiFlyer({ pool, apply: args[0] === '--apply' })
      .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
      })
      .finally(() => pool.end());
  }
}

module.exports = { refreshChuwiFlyer };
