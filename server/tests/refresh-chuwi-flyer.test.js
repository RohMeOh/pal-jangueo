'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { refreshChuwiFlyer } = require('../scripts/refresh-chuwi-flyer');

const OLD = 'https://res.cloudinary.com/eventservice/image/upload/q_auto,f_auto/v1793720093/saas/logos/image_1793720070996_wi3i9j6jn.webp';
const NEW = 'https://res.cloudinary.com/eventservice/image/upload/q_auto,f_auto/v1793823611/saas/logos/image_1793823607418_xd8xhucpd.webp';

function fixture({ stored = OLD, official = NEW, updateCount = 1 } = {}) {
  const statements = [];
  let released = false;
  let connections = 0;
  const pool = { connect: async () => {
    connections++;
    return {
      release: () => { released = true; },
      query: async (sql, params) => {
        statements.push({ sql, params });
        if (sql.includes('SELECT e.id')) {
          return { rows: [{ id: 'event', title: 'CHUWI en vivo', flyer_url: stored }] };
        }
        if (sql.includes('UPDATE public.events')) {
          return { rowCount: updateCount, rows: [{ id: 'event', flyer_url: NEW }] };
        }
        return { rows: [] };
      }
    };
  } };
  const fetchImpl = async url => url.startsWith('https://boletos.')
    ? { ok: true, text: async () => `<meta property="og:image" content="${official}">` }
    : { ok: true, headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  return { pool, fetchImpl, statements,
    released: () => released, connections: () => connections };
}

test('simulation updates only flyer and timestamp, then rolls back', async () => {
  const f = fixture();
  await refreshChuwiFlyer(f);
  const update = f.statements.find(s => s.sql.includes('UPDATE public.events'));
  assert.match(update.sql, /SET flyer_url = \$2, updated_at = NOW\(\)/);
  assert.equal(update.params[1], NEW);
  assert.equal(update.params[2], OLD);
  assert.equal(f.statements.at(-1).sql, 'ROLLBACK');
  assert.ok(f.released());
});

test('apply commits one validated flyer update', async () => {
  const f = fixture();
  await refreshChuwiFlyer({ ...f, apply: true });
  assert.equal(f.statements.at(-1).sql, 'COMMIT');
});

test('rerunning an applied repair does not update the event again', async () => {
  const f = fixture({ stored: NEW });
  await refreshChuwiFlyer({ ...f, apply: true });
  assert.ok(!f.statements.some(s => s.sql.includes('UPDATE public.events')));
  assert.equal(f.statements.at(-1).sql, 'ROLLBACK');
});

test('changed source blocks before connecting to the database', async () => {
  const f = fixture({ official: OLD });
  await assert.rejects(refreshChuwiFlyer(f), /La fuente cambió/);
  assert.equal(f.connections(), 0);
});

test('unexpected stored flyer is preserved', async () => {
  const f = fixture({ stored: 'https://example.com/newer.webp' });
  await assert.rejects(refreshChuwiFlyer(f), /no se sobrescribió/);
  assert.equal(f.statements.at(-1).sql, 'ROLLBACK');
  assert.ok(!f.statements.some(s => s.sql.includes('UPDATE public.events')));
});

test('unexpected update count rolls back and releases the connection', async () => {
  const f = fixture({ updateCount: 0 });
  await assert.rejects(refreshChuwiFlyer(f), /exactamente un evento/);
  assert.equal(f.statements.at(-1).sql, 'ROLLBACK');
  assert.ok(f.released());
});
