/**
 * Image → PDF converter using jsPDF
 * Supports: JPG, PNG, WebP, GIF, SVG, AVIF as input
 * HEIC: decoded first via heic2any (loaded via CDN on HEIC pages)
 */
window.performConversion = async function (input) {
  const widget = document.querySelector('.section-converter');
  const FROM   = (widget?.dataset.from || '').toUpperCase();

  if (!window.jspdf) throw new Error('PDF library not loaded. Reload the page and try again.');
  const { jsPDF } = window.jspdf;

  let sourceBlob = input instanceof Blob ? input : new Blob([await input.arrayBuffer()]);

  // HEIC → JPEG first
  if (FROM === 'HEIC') {
    if (!window.heic2any) throw new Error('HEIC decoder not loaded. Reload the page and try again.');
    const converted = await window.heic2any({ blob: sourceBlob, toType: 'image/jpeg', quality: 0.92 });
    sourceBlob = Array.isArray(converted) ? converted[0] : converted;
  }

  // TIFF not supported
  if (FROM === 'TIFF') {
    throw new Error('TIFF decoding is not supported in this browser. Please save the file as JPG or PNG first.');
  }

  // Load image
  const url = URL.createObjectURL(sourceBlob);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload  = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load image. The file may be corrupt or unsupported.'));
    el.src = url;
  });

  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // Fit onto A4 (210 × 297 mm) preserving aspect ratio
  const A4_W = 210, A4_H = 297;
  const margin = 10;
  const maxW = A4_W - margin * 2;
  const maxH = A4_H - margin * 2;
  const scale = Math.min(maxW / w, maxH / h, 1);
  const pdfW = w * scale;
  const pdfH = h * scale;

  // Render to canvas to get base64 data
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  const orientation = pdfW > pdfH ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const xOffset = (orientation === 'portrait' ? A4_W : A4_H) / 2 - pdfW / 2;
  const yOffset = (orientation === 'portrait' ? A4_H : A4_W) / 2 - pdfH / 2;
  doc.addImage(imgData, 'JPEG', xOffset, yOffset, pdfW, pdfH);

  const pdfBlob = doc.output('blob');
  return { blob: pdfBlob, filename: 'converted.pdf' };
};
