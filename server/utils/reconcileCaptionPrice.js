const { normalizePrice } = require('./normalizeEvent');

function isMissing(value) {
  return value == null ||
    ['null', '', 'unknown', 'no indicado']
      .includes(String(value).trim().toLowerCase());
}

function extractCaptionPrice(caption) {
  if (!caption) return null;

  const matches = [...caption.matchAll(
    /(?:(?:desde|a partir de)\s+)?\$\s*\d+(?:[.,]\d{1,2})?/gi
  )];

  // Multiple prices require additional validation.
  if (matches.length !== 1) return null;

  const quote = matches[0][0].trim();

  const priceText = quote
    .replace(/^a partir de\s+/i, 'Desde ')
    .replace(/^desde\s+/i, 'Desde ');

  if (normalizePrice(priceText).price_type !== 'paid') {
    return null;
  }

  return { quote, priceText };
}

// Compare single amounts without losing qualifiers.
function sameSingleAmount(a, b) {
  const x = normalizePrice(a);
  const y = normalizePrice(b);

  return x.price_type === 'paid' &&
    y.price_type === 'paid' &&
    x.price_min !== null &&
    x.price_min === y.price_min &&
    (x.price_max === null || x.price_max === x.price_min) &&
    (y.price_max === null || y.price_max === y.price_min);
}

function reconcileCaptionPrice(result, caption) {
  const extracted = extractCaptionPrice(caption);
  if (!extracted) return result;

  result.conflicts ||= [];
  result.warnings ||= [];
  result.field_evidence ||= [];

  const knownImageConflict = result.conflicts.some(conflict =>
    conflict.field === 'price_text' &&
    !isMissing(conflict.image_value)
  );

  const priceFromImage = result.field_evidence.some(evidence =>
    evidence.field === 'price_text' &&
    evidence.source === 'image'
  );

  // Never silently overwrite an image-supported price.
  if (knownImageConflict || priceFromImage) {
    if (
      !knownImageConflict &&
      !isMissing(result.price_text) &&
      !sameSingleAmount(result.price_text, extracted.priceText)
    ) {
      result.conflicts.push({
        field: 'price_text',
        image_value: String(result.price_text),
        text_value: extracted.priceText
      });

      result.price_text = null;

      result.warnings.push(
        'Precio del flyer y caption no coinciden.'
      );
    }

    return result;
  }

  // A genuinely different amount requires review.
  if (
    !isMissing(result.price_text) &&
    !sameSingleAmount(result.price_text, extracted.priceText)
  ) {
    result.warnings.push(
      'El importe extraído no coincide con el caption; revisar.'
    );

    return result;
  }

  // Preserve "Desde", "A partir de", etc.
  result.price_text = extracted.priceText;

  // Missing image data is not a contradiction.
  result.conflicts = result.conflicts.filter(conflict =>
    !(
      conflict.field === 'price_text' &&
      isMissing(conflict.image_value)
    )
  );

  // Remove obsolete warnings after reconciliation.
  result.warnings = result.warnings.filter(warning =>
    !/conflict.*price_text|price_text.*conflict|el precio extra[ií]do no coincide con el caption/i.test(warning)
  );

  // Replace outdated caption price evidence.
  result.field_evidence = result.field_evidence.filter(evidence =>
    !(
      evidence.field === 'price_text' &&
      evidence.source === 'text'
    )
  );

  result.field_evidence.push({
    field: 'price_text',
    source: 'text',
    quote: extracted.quote
  });

  return result;
}

module.exports = { reconcileCaptionPrice };
