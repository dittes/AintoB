/**
 * HTML → Word (.docx) using html-docx-js
 */
window.performConversion = async function (input) {
  if (!window.htmlDocx) throw new Error('Word library not loaded. Reload the page and try again.');
  const source = typeof input === 'string' ? input : await input.text();

  // html-docx-js needs a complete HTML document
  const fullHtml = source.trim().startsWith('<!DOCTYPE') || source.trim().startsWith('<html')
    ? source
    : `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${source}</body></html>`;

  const blob = window.htmlDocx.asBlob(fullHtml, {
    orientation: 'portrait',
    margins: { top: 720, bottom: 720, left: 720, right: 720 },
  });
  return { blob, filename: 'converted.docx' };
};
