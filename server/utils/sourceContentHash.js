// Pa'l Jangueo - Source content fingerprint

const fs = require('node:fs');
const { createHash } = require('node:crypto');

function sha256(value) {
  return createHash('sha256')
    .update(value)
    .digest('hex');
}

function buildSourceContentHash({
  captionText = null,
  imagePath = null
} = {}) {
  // No content means no reliable source fingerprint.
  if (!captionText && !imagePath) {
    return null;
  }

  let imageHash = null;

  if (imagePath) {
    // Hash the original image bytes, not its filename.
    const image = fs.readFileSync(imagePath);
    imageHash = sha256(image);
  }

  const content = JSON.stringify({
    version: 1,
    caption: captionText,
    image_hash: imageHash
  });

  return sha256(content);
}

module.exports = { buildSourceContentHash };
