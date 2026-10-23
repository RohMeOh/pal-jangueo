// Pa'l Jangueo - Multi-source discovery runner
// Read-only. Never saves, approves or publishes events.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SOURCES = [
  {
    name: 'Boletera',
    script: 'run-discovery.js'
  },
  {
    name: 'PRticket',
    script: 'discover-prticket.js'
  },
  {
    name: 'Coca-Cola Music Hall',
    script: 'preview-venue-details.js'
  }
];

function main() {
  console.log("\n====================================");
  console.log("PA'L JANGUEO - MULTI-SOURCE DISCOVERY");
  console.log("====================================");
  console.log('Modo: SOLO LECTURA');

  let successful = 0;
  let failed = 0;

  for (const source of SOURCES) {
    console.log('\n====================================');
    console.log('Fuente:', source.name);
    console.log('====================================');

    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, source.script)],
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        timeout: 300000,
        maxBuffer: 4 * 1024 * 1024
      }
    );

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.error || result.status !== 0) {
      failed++;
      console.error(
        'Falló la fuente:',
        result.error?.message || `Código ${result.status}`
      );
    } else {
      successful++;
      console.log('Fuente procesada correctamente.');
    }
  }

  console.log('\n====================================');
  console.log('RESUMEN MULTIFUENTE');
  console.log('====================================');
  console.log('Fuentes configuradas:', SOURCES.length);
  console.log('Fuentes exitosas:', successful);
  console.log('Fuentes fallidas:', failed);
  console.log('Registros guardados: 0');
  console.log('Eventos publicados: 0');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();
