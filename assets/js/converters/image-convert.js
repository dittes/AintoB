/**
 * Universal image-to-image converter (canvas-based)
 * Reads format from section[data-from] / section[data-to] data attributes.
 * Supported inputs:  JPG, PNG, WebP, GIF (first frame), SVG, AVIF, HEIC (with heic2any CDN)
 * Supported outputs: JPG, PNG, WebP, AVIF (Chrome 85+ only)
 * Unsupported:       GIF/TIFF/HEIC output (throws descriptive error)
 */
window.performConversion = async function (input) {
  const widget = document.querySelector('.section-converter');
  const FROM   = (widget?.dataset.from || '').toUpperCase();
  const TO     = (widget?.dataset.to   || '').toUpperCase();

  // ── Unsupported output formats ─────────────────────────────────────────────
  if (TO === 'GIF') {
    throw new Error('GIF encoding is not supported in browsers. Convert to PNG or WebP instead.');
  }
  if (TO === 'TIFF') {
    throw new Error('TIFF encoding is not supported in browsers. Convert to PNG or JPG instead.');
  }
  if (TO === 'HEIC') {
    throw new Error('HEIC encoding is not supported in browsers. Convert to JPG or PNG instead.');
  }

  // ── Unsupported input formats ──────────────────────────────────────────────
  if (FROM === 'TIFF') {
    throw new Error('TIFF decoding is not supported in this browser. Please open the file in an image editor and re-save as JPG or PNG first.');
  }

  const MIME_MAP = { JPG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp', AVIF: 'image/avif' };
  const EXT_MAP  = { JPG: 'jpg', PNG: 'png', WEBP: 'webp', AVIF: 'avif', GIF: 'gif' };
  const outMime  = MIME_MAP[TO] || 'image/png';
  const outExt   = EXT_MAP[TO]  || TO.toLowerCase();

  let sourceBlob = input instanceof Blob ? input : new Blob([await input.arrayBuffer()]);

  // ── HEIC → decode to JPEG blob first ──────────────────────────────────────
  if (FROM === 'HEIC') {
    if (!window.heic2any) throw new Error('HEIC decoder not loaded. Reload the page and try again.');
    const converted = await window.heic2any({ blob: sourceBlob, toType: 'image/jpeg', quality: 0.92 });
    sourceBlob = Array.isArray(converted) ? converted[0] : converted;
    if (TO === 'JPG') {
      return { blob: sourceBlob, filename: 'converted.jpg' };
    }
  }

  // ── Load image into HTMLImageElement ──────────────────────────────────────
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

  // Fill white background for JPG (transparent → white)
  if (TO === 'JPG') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  // ── Export blob ────────────────────────────────────────────────────────────
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
