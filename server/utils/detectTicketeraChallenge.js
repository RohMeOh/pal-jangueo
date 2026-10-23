// Detect Ticketera access challenges.
// Never treat challenge HTML as event content.

function detectTicketeraChallenge(html) {
  const text = String(html ?? '');

  return (
    /<title[^>]*>\s*Client Challenge\s*<\/title>/i.test(text) ||
    /\/_fs-ch-[a-z0-9-]+\/assets\//i.test(text)
  );
}

module.exports = { detectTicketeraChallenge };
