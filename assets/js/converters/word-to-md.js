/**
 * Word (.docx) → Markdown converter
 * Requires: mammoth.browser.min.js + Turndown (loaded via CDN before this script)
 */
window.performConversion = async function (input) {
  if (typeof input === 'string') {
    throw new Error('Word to Markdown requires a .docx file. Please upload a file.');
  }
  const arrayBuffer = await input.arrayBuffer();
  const result = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
  const td = new window.TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  const markdown = td.turndown(result.value);
  return {
    blob: new Blob([markdown], { type: 'text/markdown' }),
    filename: 'converted.md',
  };
};
