// Pa'l Jangueo - Preliminary music evidence assessment
// Never confirms local relevance or authorizes publication.

const NAMED_ENTITIES = {
  amp: '&', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í',
  oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  agrave: 'à', egrave: 'è', igrave: 'ì',
  ograve: 'ò', ugrave: 'ù', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í',
  Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  Igrave: 'Ì', Uuml: 'Ü'
};

function decodeEntities(value) {
  return String(value ?? '').replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (original, entity) => {
      if (entity.startsWith('#')) {
        const hex = entity[1]?.toLowerCase() === 'x';
        const number = parseInt(
          entity.slice(hex ? 2 : 1),
          hex ? 16 : 10
        );

        return (
          Number.isInteger(number) &&
          number > 0 &&
          number <= 0x10ffff &&
          !(number >= 0xd800 && number <= 0xdfff)
        ) ? String.fromCodePoint(number) : original;
      }

      return NAMED_ENTITIES[entity] ?? original;
    }
  );
}

function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function assessMusicEvidence(rawDescription) {
  const description = decodeEntities(
    String(rawDescription ?? '').replace(/<[^>]*>/g, ' ')
  )
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const text = normalize(description);
  const signals = [];

  const rules = [
    {
      name: 'Concierto o presentación en vivo',
      pattern: /\b(concierto|tocando|musica en vivo|acto de apertura|live performance|live music)\b/
    },
    {
      name: 'DJs o música electrónica',
      pattern: /\b(dj|djs|dj set|techno|afterhours|electronic dance party)\b/
    },
    {
      name: 'Documental o cine',
      pattern: /\b(documental|punkumental|pelicula|proyeccion|cine)\b/
    },
    {
      name: 'Experiencia temática',
      pattern: /\b(tematica|tematico|experiencia tematica|inspirado en|inspirada en)\b/
    }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      signals.push(rule.name);
    }
  }

  const hasMusicalProgram = signals.some(signal =>
    signal === 'Concierto o presentación en vivo' ||
    signal === 'DJs o música electrónica'
  );

  const musicalContext =
    /\b(musica|musical|orquesta|album|disco|feat|featuring|k-pop|dancehall|afrobeats|techno|electronica)\b/.test(text);

  const classification = hasMusicalProgram
    ? 'indicios_de_actuacion_musical'
    : musicalContext
      ? 'contexto_musical_pendiente_de_verificar'
      : 'evidencia_insuficiente';

  return {
    description,
    signals,
    classification,
    has_musical_program_evidence: hasMusicalProgram,
    local_music_confirmed: false,
    safe_to_publish: false,
    review_required: true
  };
}

module.exports = { assessMusicEvidence };
