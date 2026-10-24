// Extract the official Boletera flyer from Open Graph metadata.
// No network calls or database changes.

function extractBoleteraFlyer(html) {
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  const images = new Set();

  for (const tag of tags) {
    const attrs = {};

    for (const match of tag.matchAll(
      /([\w:-]+)\s*=\s*(["'])(.*?)\2/g
    )) {
      attrs[match[1].toLowerCase()] = match[3];
    }

    const property = String(
      attrs.property || attrs.name || ''
    ).toLowerCase();

    if (
      !['og:image', 'og:image:url'].includes(property) ||
      !attrs.content
    ) {
      continue;
    }

    try {
      const image = new URL(
        attrs.content.replace(/&amp;/gi, '&')
      );

      if (
        image.protocol !== 'https:' ||
        image.hostname !== 'res.cloudinary.com' ||
        image.username ||
        image.password ||
        !image.pathname.startsWith(
          '/eventservice/image/upload/'
        ) ||
        !/\.(webp|png|jpg|jpeg)$/i.test(image.pathname)
      ) {
        continue;
      }

      images.add(image.href);
    } catch {
      // Ignore invalid image URLs.
    }
  }

  return images.size === 1 ? [...images][0] : null;
}

module.exports = { extractBoleteraFlyer };
