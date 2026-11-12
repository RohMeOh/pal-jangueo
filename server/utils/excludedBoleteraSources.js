'use strict';

// Known non-production listing from Boletera.
// Exact source exclusion, not a broad title-based filter.
const EXCLUDED_PATH = '/e/mx-lab-evento-de-prueba';

function isExcludedBoleteraSource(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.hostname === 'boletos.boletera.net' &&
      url.pathname.replace(/\/$/, '') === EXCLUDED_PATH
    );
  } catch {
    return false;
  }
}

module.exports = { isExcludedBoleteraSource };
