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
  const EXT_MAP  = { JPG: 'jpg', PNG: 'png', WEBP: 'webp', AVIF: 'avif', HEIC: 'heic', BMP: 'bmp', ICO: 'ico' };

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

  // ── BMP output (manual 24-bit encoder — canvas cannot write BMP) ───────────
  if (TO === 'BMP') {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { blob: encodeBMP(imgData), filename: 'converted.bmp' };
  }

  // ── ICO output (PNG-in-ICO container, scaled to icon size) ─────────────────
  if (TO === 'ICO') {
    // Modern ICO files embed PNG data; 256px is the maximum icon dimension
    const size = Math.min(256, Math.max(canvas.width, canvas.height));
    const icoCanvas = document.createElement('canvas');
    icoCanvas.width = size;
    icoCanvas.height = size;
    const icoCtx = icoCanvas.getContext('2d');
    icoCtx.imageSmoothingEnabled = true;
    icoCtx.imageSmoothingQuality = 'high';
    // Centre the image inside a square icon, preserving aspect ratio
    const scale = Math.min(size / canvas.width, size / canvas.height);
    const dw = Math.round(canvas.width * scale), dh = Math.round(canvas.height * scale);
    icoCtx.drawImage(canvas, Math.floor((size - dw) / 2), Math.floor((size - dh) / 2), dw, dh);

    const pngBlob = await new Promise((res, rej) =>
      icoCanvas.toBlob(b => b ? res(b) : rej(new Error('Icon export failed.')), 'image/png'));
    const png = new Uint8Array(await pngBlob.arrayBuffer());

    // ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) + PNG payload
    const ico = new Uint8Array(22 + png.length);
    const dv  = new DataView(ico.buffer);
    dv.setUint16(2, 1, true);                     // type: icon
    dv.setUint16(4, 1, true);                     // image count
    ico[6] = size === 256 ? 0 : size;             // width  (0 = 256)
    ico[7] = size === 256 ? 0 : size;             // height (0 = 256)
    dv.setUint16(10, 1, true);                    // colour planes
    dv.setUint16(12, 32, true);                   // bits per pixel
    dv.setUint32(14, png.length, true);           // payload size
    dv.setUint32(18, 22, true);                   // payload offset
    ico.set(png, 22);
    return { blob: new Blob([ico], { type: 'image/x-icon' }), filename: 'favicon.ico' };
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

// 24-bit uncompressed BMP encoder (BITMAPINFOHEADER, bottom-up rows, BGR order).
// Transparency is composited onto white, matching the JPG behaviour above.
function encodeBMP(imgData) {
  const w = imgData.width, h = imgData.height, src = imgData.data;
  const rowSize = Math.floor((24 * w + 31) / 32) * 4; // rows padded to 4 bytes
  const pixelBytes = rowSize * h;
  const buf = new ArrayBuffer(54 + pixelBytes);
  const dv  = new DataView(buf);
  const out = new Uint8Array(buf);

  // BITMAPFILEHEADER
  out[0] = 0x42; out[1] = 0x4D;            // 'BM'
  dv.setUint32(2, 54 + pixelBytes, true);  // file size
  dv.setUint32(10, 54, true);              // pixel data offset
  // BITMAPINFOHEADER
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);               // planes
  dv.setUint16(28, 24, true);              // bpp
  dv.setUint32(34, pixelBytes, true);
  dv.setInt32(38, 2835, true);             // 72 DPI
  dv.setInt32(42, 2835, true);

  for (let y = 0; y < h; y++) {
    let off = 54 + (h - 1 - y) * rowSize;  // bottom-up
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = src[i + 3] / 255;
      out[off++] = Math.round(src[i + 2] * a + 255 * (1 - a)); // B
      out[off++] = Math.round(src[i + 1] * a + 255 * (1 - a)); // G
      out[off++] = Math.round(src[i]     * a + 255 * (1 - a)); // R
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}
