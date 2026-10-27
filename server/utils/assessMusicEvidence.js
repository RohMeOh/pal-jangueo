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
  Igrave: 'Ì', Uuml: 'Ü', iexcl: '¡', iquest: '¿',
  middot: '·', ndash: '–', mdash: '—', rsquo: '’',
  lsquo: '‘', ldquo: '“', rdquo: '”'
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
      // Comedy with background or incidental live music is not
      // a music-first event. Do not reject musical improvisation alone.
      name: 'Comedia o stand-up',
      pattern: /\b(?:stand[\s-]*up(?:\s+comedy)?|(?:show|espectaculo|noche|funcion)\s+de\s+comedia|comedia\s+(?:improvisada|en\s+vivo)|improvisacion\s+comica)\b/
    },
    {
      name: 'Evento teatral',
      pattern: /\b(pieza teatral|obra de teatro|obra teatral|gira teatral|montaje teatral|funcion teatral|produccion teatral|festival de teatro)\b/
    },
    {
      name: 'Evento deportivo',
      pattern: /\b(baloncesto|basketball|bsnf|beisbol|baseball|voleibol|volleyball|futbol|soccer|partido deportivo|competencia deportiva)\b/
    },
    {
      // An announced screening is a mixed event when live music also appears.
      // A venue name containing "Cine" alone must not exclude a concert.
      name: 'Documental o cine',
      pattern: /\b(?:documental|punkumental|pelicula|proyeccion(?:es)?|noche de cine|festival de cine|funcion de cine)\b/
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

  // Acoustic acts may announce live songs, performers and instruments
  // without the exact wording "concierto" or "musica en vivo".
  const liveAcousticAct =
    /\ben vivo\b/.test(text) &&
    /\b(?:canciones?|cantar|cantando|cantautores?|cantantes?)\b/.test(text) &&
    (
      /\bacustic[oa]s?\b/.test(text) ||
      (/\bguitarras?\b/.test(text) &&
        /\b(?:cantar|cantando|cantautores?|voces)\b/.test(text))
    );

  // A provider's explicit "En tarima:" lineup corroborated by
  // orchestras or bands is stronger than a genre-only description.
  const onStageEnsemble =
    /\ben tarima\s*:/.test(text) &&
    (text.match(/\b(?:orquestas?|bandas?)\b/g) || []).length >= 2 &&
    !/\b(?:musica de fondo|karaoke|charla|conferencia|panel)\b/.test(text);

  // A live musical tribute needs an announced return to the stage
  // AND an explicitly musical tribute. A tribute title alone is not enough.
  const onStageMusicTribute =
    /\b(?:volvemos|regresamos|retornamos)\s+a\s+(?:la\s+)?tarima\b/.test(text) &&
    /\b(?:tributo|homenaje)\s+a\s+(?:la\s+)?(?:musica|banda|rock|canciones?|artistas?)\b/.test(text) &&
    !/\b(?:charla|conferencia|panel|musica de fondo|karaoke)\b/.test(text);

  const namedMusicalPerformance =
    /\b(?:se presentara|se presentaran|presentacion estelar|interpretando)\b/.test(text) &&
    /\b(?:banda|orquesta|canciones?|sencillo|album|temas?|reggae|dub|rock|musica)\b/.test(text);

  const announcedBandLineup =
    /\b(?:bandas?|grupos musicales?)\b/.test(text) &&
    /\b(?:musica|rock|reggae|metal|punk|salsa|hardcore)\b/.test(text) &&
    /\b(?:presentan|presenta|con el regreso|escenario|en vivo)\b/.test(text);

  // A stage, an interpretation, and musical context must corroborate
  // one another. Film screenings and background music are not enough.
  const stagePerformanceAnnounced =
    /\b(?:escenario|tarima)\b/.test(text) &&
    /\b(?:interpretacion(?:es)?|interpretara(?:n)?|cantara(?:n)?|cantando)\b/.test(text) &&
    /\b(?:musica|boleros?|canciones?|salsa|rock|plena|bachata|reggae)\b/.test(text) &&
    !/\b(?:cine|pelicula|documental|proyeccion|musica de fondo|karaoke)\b/.test(text);

  // An actual DJ set is a performance. A genre, party name, or the
  // letters "DJ" by themselves do not prove anyone will perform.
  // An official multi-stage DJ programme needs all three
  // corroborating facts; merely mentioning "DJ" is insufficient.
  const stagedDjShow =
    /\btwo\s+stages?\b/.test(text) &&
    /\btwo\s+music\s+styles\b/.test(text) &&
    /\btwo\s+djs?\b/.test(text);

  const liveDjPerformance =
    stagedDjShow ||
    /\bdjs?\s+sets?\b/.test(text) ||
    /\bdjs?\s+en\s+vivo\b/.test(text) ||
    /\bdjs?\b[^.!?]{0,70}\b(?:tocara(?:n)?|se presentara(?:n)?|mezclara(?:n)?|actuara(?:n)?)\b/.test(text) ||
    /\b(?:tocara(?:n)?|se presentara(?:n)?|actuara(?:n)?|presentacion en vivo)\b[^.!?]{0,70}\bdjs?\b/.test(text);

  if (liveAcousticAct) {
    signals.push('Actuación acústica en vivo');
  }

  if (onStageEnsemble) {
    signals.push('Orquesta o banda anunciada en tarima');
  }

  if (onStageMusicTribute) {
    signals.push('Tributo musical anunciado en tarima');
  }

  if (stagePerformanceAnnounced) {
    signals.push('Interpretación musical anunciada en escenario');
  }

  if (liveDjPerformance) {
    signals.push('DJs o música electrónica');
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


  // Broader music-first events: freestyle, artist tours,
  // curated electronic music and album celebrations.
  const freestyle =
    /\bbatallas? de rap improvisado\b/.test(text) &&
    /\b(?:liga|ranking|participantes|publico|competencia)\b/.test(text);

  const artistTour =
    /\bcantautor(?:a)?\b/.test(text) &&
    /\bse presenta\b/.test(text) &&
    /\b(?:gira|musica|album)\b/.test(text);

  const electronicNight =
    /\bmusica en el centro\b/.test(text) &&
    /\bcuraduria enfocada en la musica electronica\b/.test(text) &&
    /\b(?:pista|club)\b/.test(text);

  const albumCelebration =
    /\b(?:conmemoramos|celebramos|aniversario)\b/.test(text) &&
    /\b(?:disco|album)\b/.test(text) &&
    /\btrayectoria musical\b/.test(text) &&
    /\bvolver a las canciones\b/.test(text);

  if (freestyle) signals.push('Rap improvisado en vivo');
  if (artistTour) signals.push('Cantautor en gira');
  if (electronicNight) signals.push('Experiencia electrónica musical');
  if (albumCelebration) signals.push('Celebración musical de disco');

  const nonMusicEventDetected = nonMusicSignals.length > 0;

  const musicalPerformanceSignalDetected = signals.some(signal =>
    signal === 'Concierto o presentación en vivo' ||
    signal === 'Actuación acústica en vivo' ||
    signal === 'Orquesta o banda anunciada en tarima' ||
    signal === 'Tributo musical anunciado en tarima' ||
    signal === 'DJs o música electrónica' ||
    signal === 'Músicos e instrumentos en presentación' ||
    signal === 'Banda u orquesta en vivo' ||
    signal === 'Presentación musical explícita' ||
    signal === 'Cartel de bandas con anuncio de actuación' ||
    signal === 'Interpretación musical anunciada en escenario' ||
    signal === 'Rap improvisado en vivo' ||
    signal === 'Cantautor en gira' ||
    signal === 'Experiencia electrónica musical' ||
    signal === 'Celebración musical de disco'
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
