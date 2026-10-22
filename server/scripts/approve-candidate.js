// Pa'l Jangueo - Controlled event approval
// Default: read-only preview.
// --approve: create an UNPUBLISHED event in one transaction.

const pool = require('../db');

const candidateId = process.argv[2];
const approve = process.argv.includes('--approve');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  if (!UUID.test(candidateId || '')) {
    throw new Error('Proporciona un ID de candidato válido.');
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    if (approve) {
      await client.query('BEGIN');
      transactionStarted = true;
    }

    const { rows } = await client.query(`
      SELECT *
      FROM public.event_candidates
      WHERE id = $1
      ${approve ? 'FOR UPDATE' : ''}
    `, [candidateId]);

    if (rows.length !== 1) {
      throw new Error('Candidato no encontrado.');
    }

    const candidate = rows[0];
    const analysis = candidate.analysis_result || {};
    const event = analysis.event || {};
    const normalized = event.normalized || {};
    const editorial = analysis.editorial_review || {};

    const problems = [];

    if (candidate.is_test) {
      problems.push('No se pueden aprobar pruebas.');
    }

    if (candidate.review_status !== 'pending_review') {
      problems.push('El candidato no está pendiente.');
    }

    if (!event.title?.trim()) {
      problems.push('Falta el título.');
    }

    if (event.is_music_event !== true ||
        event.local_music_confirmed !== true) {
      problems.push('Música local sin confirmar.');
    }

    if (analysis.validation?.basic_checks_passed !== true) {
      problems.push('No pasó la validación básica.');
    }

    if (
      editorial.method !== 'manual_editorial_review' ||
      !editorial.reason?.trim() ||
      !Array.isArray(editorial.evidence_urls) ||
      editorial.evidence_urls.length === 0 ||
      !candidate.reviewed_at
    ) {
      problems.push('Falta evidencia de revisión editorial.');
    }

    const date = normalized.start_at
      ? new Date(normalized.start_at)
      : null;

    if (!date ||
        Number.isNaN(date.getTime()) ||
        date <= new Date()) {
      problems.push('Fecha inválida o pasada.');
    }

    if (!['scheduled', 'EventScheduled'].includes(
      event.event_status
    )) {
      problems.push('Estado del evento no confirmado.');
    }

    if (!['free', 'paid', 'unknown'].includes(
      normalized.price_type
    )) {
      problems.push('Tipo de precio inválido.');
    }

    const min = normalized.price_min;
    const max = normalized.price_max;

    if (
      [min, max].some(value =>
        value !== null &&
        value !== undefined &&
        (typeof value !== 'number' ||
         !Number.isFinite(value) ||
         value < 0)
      ) ||
      (min != null && max != null && max < min)
    ) {
      problems.push('Precios inconsistentes.');
    }

    if (candidate.source_name !== 'Boletera') {
      problems.push('Fuente no autorizada por esta herramienta.');
    }

    try {
      const sourceUrl = new URL(candidate.source_url);
      const ticketUrl = new URL(event.ticket_url);

      const sourcePath = sourceUrl.pathname.replace(/\/$/, '');

      if (
        sourceUrl.protocol !== 'https:' ||
        sourceUrl.hostname !== 'boletos.boletera.net' ||
        !/^\/e\/[^/]+$/.test(sourcePath) ||
        ticketUrl.protocol !== 'https:' ||
        ticketUrl.hostname !== sourceUrl.hostname ||
        ticketUrl.pathname !== sourcePath + '/tickets'
      ) {
        problems.push('Enlace de boletos no corresponde al evento.');
      }
    } catch {
      problems.push('Falta una URL válida del evento o boletos.');
    }

    const venueResult = await client.query(`
      SELECT id, location_verification_status
      FROM public.venues
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
        AND LOWER(TRIM(municipality)) = LOWER(TRIM($2))
    `, [
      event.venue || '',
      event.municipality || ''
    ]);

    const venue = venueResult.rows[0];

    if (venueResult.rows.length !== 1 ||
        venue?.location_verification_status !== 'verified') {
      problems.push('Local no identificado y verificado.');
    }

    const sourceResult = await client.query(`
      SELECT id FROM public.sources
      WHERE name = 'Boletera'
    `);

    if (sourceResult.rows.length !== 1) {
      problems.push('Fuente Boletera no registrada.');
    }

    if (problems.length === 0 && approve) {
      // Serialize approvals at the same venue and start time.
      await client.query(`
        SELECT pg_advisory_xact_lock(hashtext($1::text))
      `, [venue.id + '|' + date.toISOString()]);
    }

    if (problems.length === 0) {
      const duplicate = await client.query(`
        SELECT id FROM public.events
        WHERE venue_id = $1 AND start_at = $2
        LIMIT 1
      `, [venue.id, date.toISOString()]);

      if (duplicate.rows.length) {
        problems.push(
          'Ya existe un evento en este local y horario. Revisar duplicado.'
        );
      }

      const matchingSource = await client.query(`
        SELECT event_id FROM public.event_sources
        WHERE source_url = $1 LIMIT 1
      `, [candidate.source_url]);

      if (matchingSource.rows.length) {
        problems.push('Esta publicación ya está vinculada a un evento.');
      }
    }

    console.log('=== PA’L JANGUEO ===');
    console.log('APROBACIÓN DE CANDIDATOS\n');
    console.log('Evento:', event.title);
    console.log('Local:', event.venue);
    console.log('Fuente:', candidate.source_name);
    console.log('Modo:', approve ? 'APROBACIÓN' : 'VISTA PREVIA');

    if (problems.length) {
      console.log('\nNO APTO:');
      for (const problem of problems) {
        console.log('-', problem);
      }

      if (approve) {
        throw new Error('Aprobación bloqueada.');
      }

      return;
    }

    if (!approve) {
      console.log('\nLISTO PARA APROBACIÓN MANUAL');
      console.log('Se guardará inicialmente sin publicar.');
      console.log('Registros modificados: 0');
      return;
    }

    const inserted = await client.query(`
      INSERT INTO public.events (
        title, venue_id, start_at, status,
        price_type, price_min, price_max,
        ticket_url, ticket_provider, is_published
      )
      VALUES (
        $1, $2, $3, 'scheduled',
        $4, $5, $6, $7, 'Boletera', FALSE
      )
      RETURNING id, is_published
    `, [
      event.title.trim(),
      venue.id,
      date.toISOString(),
      normalized.price_type,
      min ?? null,
      max ?? null,
      event.ticket_url
    ]);

    const newEvent = inserted.rows[0];

    await client.query(`
      INSERT INTO public.event_sources (
        event_id, source_id, source_url, last_checked_at
      )
      VALUES ($1, $2, $3, NOW())
    `, [
      newEvent.id,
      sourceResult.rows[0].id,
      candidate.source_url
    ]);

    const updated = await client.query(`
      UPDATE public.event_candidates
      SET review_status = 'approved',
          approved_event_id = $1,
          reviewed_at = NOW()
      WHERE id = $2
        AND is_test = FALSE
        AND review_status = 'pending_review'
      RETURNING id
    `, [newEvent.id, candidateId]);

    if (updated.rowCount !== 1) {
      throw new Error('No se pudo finalizar la aprobación.');
    }

    await client.query('COMMIT');
    transactionStarted = false;

    console.log('\nEVENTO APROBADO Y GUARDADO');
    console.log('ID del evento:', newEvent.id);
    console.log('Publicado:', newEvent.is_published);
    console.log('Fuente vinculada: Boletera');

  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
