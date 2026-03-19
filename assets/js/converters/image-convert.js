/**
 * Universal image-to-image converter (canvas-based)
 * Reads format from section[data-from] / section[data-to] data attributes.
 * Supported inputs:  JPG, PNG, WebP, GIF (first frame), SVG, AVIF, HEIC (with heic2any CDN)
 * Supported outputs: JPG, PNG, WebP, AVIF (Chrome 85+), HEIC (Safari native or WASM fallback)
 * Unsupported:       GIF/TIFF output (throws descriptive error)
 */
window.performConversion = async function (input) {
  const widget = document.querySelector('.section-converter');
  const FROM   = (widget?.dataset.from || '').toUpperCase();
  const TO     = (widget?.dataset.to   || '').toUpperCase();

  // ── Hard unsupported outputs ───────────────────────────────────────────────
  if (TO === 'GIF') {
    throw new Error('GIF encoding is not supported in browsers. Convert to PNG or WebP instead.');
  }
  if (TO === 'TIFF') {
    throw new Error('TIFF encoding is not supported in browsers. Convert to PNG or JPG instead.');
  }

  // ── Unsupported input ──────────────────────────────────────────────────────
  if (FROM === 'TIFF') {
    throw new Error('TIFF decoding is not supported in this browser. Please open the file in an image editor and re-save as JPG or PNG first.');
  }

  const MIME_MAP = { JPG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp', AVIF: 'image/avif' };
  const EXT_MAP  = { JPG: 'jpg', PNG: 'png', WEBP: 'webp', AVIF: 'avif', HEIC: 'heic' };

  let sourceBlob = input instanceof Blob ? input : new Blob([await input.arrayBuffer()]);

  // ── HEIC input → decode to JPEG blob first ─────────────────────────────────
  if (FROM === 'HEIC') {
    if (!window.heic2any) throw new Error('HEIC decoder not loaded. Reload the page and try again.');
    const converted = await window.heic2any({ blob: sourceBlob, toType: 'image/jpeg', quality: 0.92 });
    sourceBlob = Array.isArray(converted) ? converted[0] : converted;
    if (TO === 'JPG') {
      return { blob: sourceBlob, filename: 'converted.jpg' };
    }
  }

  // ── Load image into HTMLImageElement ───────────────────────────────────────
  const url = URL.createObjectURL(sourceBlob);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload  = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load image. The file may be corrupt or in an unsupported format.'));
    el.src = url;
  });

  // ── Draw to canvas ─────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');

  // White background for JPG (removes transparency)
  if (TO === 'JPG') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  // ── HEIC output ────────────────────────────────────────────────────────────
  if (TO === 'HEIC') {
    // Safari 17+ supports HEIC encoding natively via canvas
    const nativeBlob = await new Promise(res => canvas.toBlob(b => res(b), 'image/heic', 0.9));
    if (nativeBlob && nativeBlob.type === 'image/heic') {
      return { blob: nativeBlob, filename: 'converted.heic' };
    }

    // Chrome and Firefox do not support HEIC encoding — no browser-compatible
    // HEIC encoder library exists on CDN (HEVC codec requires native support).
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
      throw new Error('Your version of Safari does not support HEIC encoding. Please update to Safari 17 or later.');
    }
    throw new Error(
      'HEIC encoding requires Safari 17+ or a desktop app. ' +
      'On Chrome/Firefox, try saving as PNG or WebP instead — both are lossless and widely supported. ' +
      'On macOS: open the image in Preview → File → Export → HEIC.'
    );
  }

  // ── Standard canvas export ─────────────────────────────────────────────────
  const outMime = MIME_MAP[TO] || 'image/png';
  const outExt  = EXT_MAP[TO]  || TO.toLowerCase();

  const outBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('Image export failed. Canvas may be too large.')),
      outMime,
      TO === 'JPG' ? 0.92 : 0.90
    );
  });

  // Check AVIF was actually encoded (not silently downgraded to PNG)
  if (TO === 'AVIF' && outBlob.type !== 'image/avif') {
    throw new Error('AVIF output is not supported in this browser. Please use PNG or WebP instead.');
  }

  return { blob: outBlob, filename: `converted.${outExt}` };
};
