/**
 * Plain Text → Word (.docx) using html-docx-js
 */
window.performConversion = async function (input) {
  if (!window.htmlDocx) throw new Error('Word library not loaded. Reload the page and try again.');
  const source = typeof input === 'string' ? input : await input.text();

  // Wrap each paragraph in <p> tags, preserving line breaks
  const escaped = source
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = escaped
    .split(/\n{2,}/)
    .map(block => `<p style="white-space:pre-wrap;">${block.replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Calibri,sans-serif;font-size:11pt;line-height:1.5;">${body}</body></html>`;
  const blob = window.htmlDocx.asBlob(fullHtml, {
    orientation: 'portrait',
    margins: { top: 720, bottom: 720, left: 720, right: 720 },
  });
  return { blob, filename: 'converted.docx' };
};
