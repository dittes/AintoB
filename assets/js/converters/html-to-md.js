/**
 * HTML → Markdown converter
 * Requires: Turndown (loaded via CDN before this script)
 */
window.performConversion = async function (input) {
  const td = new window.TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  const source = typeof input === 'string' ? input : await input.text();
  const markdown = td.turndown(source);
  return {
    blob: new Blob([markdown], { type: 'text/markdown' }),
    filename: 'converted.md',
  };
};
