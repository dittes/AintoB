/**
 * HTML → Plain Text
 * Parses HTML via the browser's DOMParser and extracts visible text.
 */
window.performConversion = async function (input) {
  const source = typeof input === 'string' ? input : await input.text();
  const parser = new DOMParser();
  const doc    = parser.parseFromString(source, 'text/html');

  // Remove script and style elements
  doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());

  // Preserve paragraph/heading/list breaks
  doc.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, br, tr').forEach(el => {
    el.insertAdjacentText('beforebegin', '\n');
  });

  const text = (doc.body?.innerText || doc.body?.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    blob: new Blob([text], { type: 'text/plain' }),
    filename: 'converted.txt',
  };
};
