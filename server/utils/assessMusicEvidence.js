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

  // Detect explicit non-musical event types.
  // A theater venue name alone does not count.
  const nonMusicRules = [
    {
      name: 'Evento teatral',
      pattern: /\b(pieza teatral|obra de teatro|obra teatral|gira teatral|montaje teatral|funcion teatral|produccion teatral|festival de teatro)\b/
    },
    {
      name: 'Evento deportivo',
      pattern: /\b(baloncesto|basketball|bsnf|beisbol|baseball|voleibol|volleyball|futbol|soccer|partido deportivo|competencia deportiva)\b/
    }
  ];

  const nonMusicSignals = nonMusicRules
    .filter(rule => rule.pattern.test(text))
    .map(rule => rule.name);

  signals.push(...nonMusicSignals);

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

  // Explicit live acts can be described without the words "concierto"
  // or "musica en vivo". Require corroborating context, not a bare genre.
  const liveBandAnnounced =
    /\b(?:banda|orquesta|grupo musical)\s+en\s+vivo\b/.test(text);

  const namedMusicalPerformance =
    /\b(?:se presentara|se presentaran|presentacion estelar|interpretando)\b/.test(text) &&
    /\b(?:banda|orquesta|canciones?|sencillo|album|temas?|reggae|dub|rock|musica)\b/.test(text);

  const announcedBandLineup =
    /\b(?:bandas?|grupos musicales?)\b/.test(text) &&
    /\b(?:musica|rock|reggae|metal|punk|salsa|hardcore)\b/.test(text) &&
    /\b(?:presentan|presenta|con el regreso|escenario|en vivo)\b/.test(text);

// A source may announce a musical performance through its stage,
// the songs or genre being performed, and an explicit interpretation,
// without using the words "concierto" or "en vivo".
// All three independent clues are required; film screenings are excluded.
const stagePerformanceAnnounced =
  /\b(?:escenario|tarima)\b/.test(text) &&
  /\b(?:interpretacion(?:es)?|interpretara(?:n)?|cantara(?:n)?|cantando)\b/.test(text) &&
  /\b(?:musica|boleros?|canciones?|salsa|rock|plena|bachata|reggae)\b/.test(text) &&
  !/\b(?:cine|pelicula|documental|proyeccion|musica de fondo|karaoke)\b/.test(text);

if (stagePerformanceAnnounced) {
  signals.push('Interpretación musical anunciada en escenario');
}

  if (liveBandAnnounced) {
    signals.push('Banda u orquesta en vivo');
  }
  if (namedMusicalPerformance) {
    signals.push('Presentación musical explícita');
  }
  if (announcedBandLineup) {
    signals.push('Cartel de bandas con anuncio de actuación');
  }

  // Detect performances with musicians and instruments.
  if (
    /\b(acompanado por|acompanada por|junto a)\b/.test(text) &&
    /\b(piano|percusion|guitarra|bateria|violin|saxofon|trompeta)\b/.test(text) &&
    /\b(musica|boleros?|baladas?|canciones?|cantante|artista)\b/.test(text)
  ) {
    signals.push('Músicos e instrumentos en presentación');
  }

  const nonMusicEventDetected = nonMusicSignals.length > 0;

  const musicalPerformanceSignalDetected = signals.some(signal =>
    signal === 'Concierto o presentación en vivo' ||
    signal === 'DJs o música electrónica' ||
    signal === 'Músicos e instrumentos en presentación' ||
    signal === 'Banda u orquesta en vivo' ||
    signal === 'Presentación musical explícita' ||
    signal === 'Cartel de bandas con anuncio de actuación' ||
    signal === 'Interpretación musical anunciada en escenario'
  );

  const mixedEventDetected =
    nonMusicEventDetected && musicalPerformanceSignalDetected;

  const hasMusicalProgram =
    musicalPerformanceSignalDetected && !nonMusicEventDetected;

  const musicalContext =
    /\b(musica|music|musical|orquesta|album|disco|feat|featuring|k-pop|dancehall|afrobeats|techno|electronica|reggaeton|regueton|boleros?|baladas?|canciones?|piano|percusion)\b/.test(text);

  const classification = mixedEventDetected
    ? 'evento_mixto_pendiente_de_verificar'
    : nonMusicEventDetected
      ? 'evento_no_musical'
      : hasMusicalProgram
        ? 'indicios_de_actuacion_musical'
        : musicalContext
          ? 'contexto_musical_pendiente_de_verificar'
          : 'evidencia_insuficiente';

  return {
    description,
    signals,
    classification,
    has_musical_program_evidence: hasMusicalProgram,
    non_music_event_detected: nonMusicEventDetected,
    mixed_event_detected: mixedEventDetected,
    local_music_confirmed: false,
    safe_to_publish: false,
    review_required: true
  };
}

module.exports = { assessMusicEvidence };
