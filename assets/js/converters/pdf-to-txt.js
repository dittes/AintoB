/**
 * PDF → Plain Text converter using PDF.js
 * Extracts all text content from every page.
 */
window.performConversion = async function (input) {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  if (!pdfjsLib) throw new Error('PDF library not loaded. Reload the page and try again.');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const arrayBuffer = await (input instanceof Blob ? input.arrayBuffer() : input.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    pages.push(pageText.trim());
  }

  const fullText = pages.join('\n\n');
  return {
    blob: new Blob([fullText], { type: 'text/plain' }),
    filename: 'converted.txt',
  };
};
