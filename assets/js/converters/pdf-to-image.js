/**
 * PDF → Image converter using PDF.js
 * Renders the first page of a PDF to JPG/PNG/WebP.
 * Output format read from section[data-to].
 */
window.performConversion = async function (input) {
  const widget = document.querySelector('.section-converter');
  const TO     = (widget?.dataset.to || 'PNG').toUpperCase();

  const MIME_MAP = { JPG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp', TIFF: null };
  const EXT_MAP  = { JPG: 'jpg', PNG: 'png', WEBP: 'webp', TIFF: 'png' };

  if (TO === 'TIFF') {
    throw new Error('TIFF encoding is not supported in browsers. The first PDF page will be saved as PNG instead. Please rename the file if needed.');
  }

  const outMime = MIME_MAP[TO] || 'image/png';
  const outExt  = EXT_MAP[TO]  || 'png';

  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  if (!pdfjsLib) throw new Error('PDF library not loaded. Reload the page and try again.');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const arrayBuffer = await (input instanceof Blob ? input.arrayBuffer() : input.arrayBuffer());
  const pdf  = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const scale    = 2.0; // 2× for better resolution
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  const ctx = canvas.getContext('2d');

  if (TO === 'JPG') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  await page.render({ canvasContext: ctx, viewport }).promise;

  const outBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('Image export failed.')),
      outMime, 0.92
    );
  });

  return { blob: outBlob, filename: `converted.${outExt}` };
};
