'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '../scripts/auto-publish-boletera.js');
const url = 'https://boletos.boletera.net/e/concierto-de-prueba';

function runMocked(args, candidates = 1) {
  // Intercept the DB before loading the CLI: no network or writes are possible.
  const preload = `
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (parent?.filename === ${JSON.stringify(scriptPath)} && request.startsWith('../utils/')) {
        return {};
      }
      if (request === '../db' && parent?.filename === ${JSON.stringify(scriptPath)}) {
        return {
          query: async (sql, params) => {
            if (!sql.includes('FROM public.event_candidates')) {
              throw new Error('Unexpected database query');
            }
            console.log('MOCK_QUERY_PARAMS:', JSON.stringify(params));
            const selected = params?.[0];
            const candidates = ${candidates};
            const rows = candidates === 0 ? [] : Array.from({length: candidates}, (_, i) => ({
              source_url: selected || 'https://boletos.boletera.net/e/prueba-' + i,
              analysis_result: {event: {normalized: {start_at: '2000-01-01T00:00:00Z'}}}
            }));
            return {rows};
          },
          end: async () => {}
        };
      }
      return originalLoad.apply(this, arguments);
    };
    process.argv = [process.execPath, ${JSON.stringify(scriptPath)}, ...${JSON.stringify(args)}];
    require(${JSON.stringify(scriptPath)});
  `;
  return spawnSync(process.execPath, ['-e', preload], {
    encoding: 'utf8', timeout: 8000,
    cwd: path.resolve(__dirname, '..'),
    env: {PATH: process.env.PATH, HOME: process.env.HOME}
  });
}

test('Boletera --slug selects exactly one source URL, without publishing', () => {
  const result = runMocked(['--slug=concierto-de-prueba', '--simulate']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MOCK_QUERY_PARAMS: \["https:\/\/boletos\.boletera\.net\/e\/concierto-de-prueba"\]/);
  assert.match(result.stdout, /Candidatos: 1/);
  assert.match(result.stdout, /Bloqueados: 1/);
  assert.match(result.stdout, /Publicados: 0/);
});

test('Boletera --slug fails closed when no pending candidate matches', () => {
  const result = runMocked(['--slug=concierto-de-prueba', '--simulate'], 0);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No existe un candidato pendiente único/);
});

test('Boletera rejects a slug and --all together', () => {
  const result = runMocked(['--all', '--slug=concierto-de-prueba', '--publish']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Uso:/);
});

test('Boletera rejects malformed slug input and duplicate slug flags', () => {
  for (const args of [
    ['--slug=../otra-ruta', '--publish'],
    ['--slug=', '--publish'],
    ['--slug=prueba', '--slug=prueba2', '--publish']
  ]) {
    const result = runMocked(args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, /Uso:/);
  }
});

test('Boletera retains the existing --all --simulate mode', () => {
  const result = runMocked(['--all', '--simulate'], 2);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MOCK_QUERY_PARAMS: \[null\]/);
  assert.match(result.stdout, /Candidatos: 2/);
  assert.match(result.stdout, /Bloqueados: 2/);
});
