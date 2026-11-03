const fs = require('node:fs');

function reportTicketPublication({
  provider, mode, evaluated, ready, blocked,
  errors, simulated, published
}) {
  const metrics = {
    'Candidatos evaluados': evaluated,
    'Candidatos aptos': ready,
    'Candidatos bloqueados': blocked,
    'Errores por candidato': errors,
    'Funciones simuladas y revertidas': simulated,
    'Funciones publicadas': published
  };

  for (const [name, value] of Object.entries(metrics)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('Contador de publicación inválido: ' + name);
    }
  }

  const message = evaluated === 0
    ? 'No había candidatos pendientes para evaluar.'
    : 'Los motivos de bloqueo y los errores aparecen en el log del paso.';

  console.log(message);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      `### ${provider}: publicación`,
      '',
      `Modo: ${mode}`,
      '',
      '| Resultado | Cantidad |',
      '| --- | ---: |',
      ...Object.entries(metrics).map(([name, value]) =>
        `| ${name} | ${value} |`
      ),
      '',
      message,
      '',
      'Un candidato puede contener varias funciones.',
      ''
    ].join('\n') + '\n');
  }
}

module.exports = { reportTicketPublication };
