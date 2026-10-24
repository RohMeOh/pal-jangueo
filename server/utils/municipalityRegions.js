// Regional classification used by Pa'l Jangueo.
// Covers all 78 municipalities of Puerto Rico.

const GROUPS = {
  'La Metro': `San Juan|Bayamón|Carolina|Cataño|Guaynabo|
    Toa Alta|Toa Baja|Trujillo Alto|Canóvanas|Loíza`,

  'Norte': `Arecibo|Barceloneta|Camuy|Dorado|Florida|
    Hatillo|Manatí|Quebradillas|Vega Alta|Vega Baja`,

  'Sur': `Arroyo|Coamo|Guánica|Guayama|Guayanilla|
    Juana Díaz|Patillas|Peñuelas|Ponce|Salinas|
    Santa Isabel|Villalba|Yauco`,

  'Este': `Ceiba|Culebra|Fajardo|Humacao|Juncos|
    Las Piedras|Luquillo|Maunabo|Naguabo|Río Grande|
    Vieques|Yabucoa|San Lorenzo`,

  'El West': `Aguada|Aguadilla|Añasco|Cabo Rojo|
    Hormigueros|Isabela|Lajas|Las Marías|Maricao|
    Mayagüez|Moca|Rincón|Sabana Grande|San Germán|
    San Sebastián`,

  'El Centro': `Adjuntas|Aguas Buenas|Aibonito|
    Barranquitas|Caguas|Cayey|Ciales|Cidra|Comerío|
    Corozal|Gurabo|Jayuya|Lares|Morovis|Naranjito|
    Orocovis|Utuado`
};

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const mapping = new Map();

for (const [region, list] of Object.entries(GROUPS)) {
  for (const name of list.split('|')) {
    const municipality = name.trim();
    const key = normalize(municipality);

    if (!key || mapping.has(key)) {
      throw new Error(
        'Municipio duplicado o inválido: ' + municipality
      );
    }

    mapping.set(key, region);
  }
}

if (mapping.size !== 78) {
  throw new Error(
    'Se esperaban 78 municipios; encontrados: ' +
    mapping.size
  );
}

function getMunicipalityRegion(municipality) {
  return mapping.get(normalize(municipality)) || null;
}

module.exports = {
  getMunicipalityRegion,
  municipalityCount: mapping.size
};
