const pool = require('../db');
const {
  LIST_URL, fetchHtml, extractCards, extractDetail
} = require('./discover-prticket');
const { normalizePrticketEvent } = require('../utils/normalizePrticketEvent');
const { buildSourceContentHash } = require('../utils/sourceContentHash');

const args = process.argv.slice(2);
if (args.length !== 1 || !['--simulate', '--apply'].includes(args[0])) {
  throw new Error('Uso: --simulate o --apply');
}
const apply = args[0] === '--apply';

const allowed = new Set([
  'mataron-a-pedro', 'cangrejeros26', 'boleros-baladas',
  'esoterica-tropical', 'nacionaldelbailador',
  'cantaresdenavidad', 'concierto-tuna',
  'quien-mato-a-rene', 'rickycolonesencia',
  'ndi-morovis', 'deps'
]);

async function main() {
  const cards = extractCards(await fetchHtml(LIST_URL));
  const selected = cards.filter(card =>
    allowed.has(new URL(card.source_url).pathname.split('/').pop())
  );

  if (selected.length !== allowed.size ||
      new Set(selected.map(card => card.source_url)).size !== allowed.size) {
    throw new Error('Listado incompleto o ambiguo.');
  }

  // Read every official page before opening the transaction.
  const prepared = [];
  for (const card of selected) {
    const detail = extractDetail(await fetchHtml(card.source_url));
    prepared.push({
      card, detail, live: normalizePrticketEvent(card, detail)
    });
  }

  const db = await pool.connect();
  const results = [];
  try {
    await db.query('BEGIN');

    for (const { card, detail, live } of prepared) {
      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['PRticket|' + card.source_url]
      );

      const { rows } = await db.query(`
        SELECT * FROM public.event_candidates
        WHERE source_name = 'PRticket'
          AND source_url = $1 AND is_test = FALSE
        FOR UPDATE
      `, [card.source_url]);

      if (rows.length !== 1) throw new Error('Candidato ambiguo.');
      const current = rows[0];
      const analysis = current.analysis_result;
      const event = analysis?.event;
      const previous = JSON.parse(current.caption_text);

      if (
        !['approved', 'rejected'].includes(current.review_status) ||
        !event ||
        current.source_content_hash !== buildSourceContentHash({
          captionText: current.caption_text
        }) ||
        live.status !== 'structured_data_ready' ||
        event.title !== live.title ||
        event.venue !== live.venue ||
        event.normalized?.start_at !== live.start_at ||
        (current.review_status === 'approved' && !current.approved_event_id) ||
        (current.review_status === 'rejected' && current.approved_event_id)
      ) {
        throw new Error('Identidad, fecha o revisión diferente: ' + card.source_url);
      }

      const evidence = {
        title: card.title,
        page_title: detail.page_title,
        ...(detail.description_evidence
          ? { description_text: detail.description_evidence }
          : {}),
        venue: live.venue,
        date_text: live.source_date_text,
        time_text: live.source_time_text,
        start_at: live.start_at,
        poster_url: detail.poster_url || null,
        source_url: card.source_url
      };

      // Only description extraction and equivalent time formatting
      // may change in this reconciliation.
      const keys = new Set([
        ...Object.keys(previous), ...Object.keys(evidence)
      ]);
      const changed = [...keys].filter(key =>
        JSON.stringify(previous[key]) !== JSON.stringify(evidence[key])
      );

      if (changed.some(key =>
        !['description_text', 'time_text'].includes(key)
      )) {
        throw new Error('Cambio fuera del alcance: ' + card.source_url);
      }

      const caption = JSON.stringify(evidence);
      const hash = buildSourceContentHash({ captionText: caption });
      if (hash === current.source_content_hash) {
        results.push({ evento: live.title, resultado: 'YA_CONCILIADO' });
        continue;
      }

      const history = analysis.evidence_sync_history || [];
      if (!Array.isArray(history)) throw new Error('Historial inválido.');

      const updatedAnalysis = {
        ...analysis,
        evidence_sync_history: [
          ...history,
          {
            method: 'description_and_equivalent_time_reconciliation',
            checked_at: new Date().toISOString(),
            changed_fields: changed,
            previous_caption_text: current.caption_text,
            previous_source_content_hash: current.source_content_hash,
            current_source_content_hash: hash
          }
        ]
      };

      // Preserve the original analysis and review decision.
      // This refreshes the source snapshot, not the published event.
      const updated = await db.query(`
        UPDATE public.event_candidates
        SET caption_text = $2,
            source_content_hash = $3,
            analysis_result = $4::jsonb
        WHERE id = $1
          AND review_status = $5
          AND approved_event_id IS NOT DISTINCT FROM $6::uuid
        RETURNING id
      `, [
        current.id, caption, hash, JSON.stringify(updatedAnalysis),
        current.review_status, current.approved_event_id
      ]);

      if (updated.rowCount !== 1) throw new Error('La revisión cambió.');

      results.push({
        evento: live.title,
        estado_conservado: current.review_status,
        campos: changed.join(', '),
        resultado: 'EVIDENCIA_CONCILIADA'
      });
    }

    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.table(results);
    console.log(apply ? 'Conciliación guardada.' : 'SIMULACIÓN REVERTIDA.');
    console.log('Eventos publicados modificados: 0');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
