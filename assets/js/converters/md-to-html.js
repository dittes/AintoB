/**
 * Markdown → HTML converter
 * Requires: markdown-it (loaded via CDN before this script)
 */
window.performConversion = async function (input) {
  const md = window.markdownit({ html: false, linkify: true, typographer: true });
  const source = typeof input === 'string' ? input : await input.text();
  const rendered = md.render(source);
  const full = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Converted</title></head>
<body>
${rendered}
</body>
</html>`;
  return {
    blob: new Blob([full], { type: 'text/html' }),
    filename: 'converted.html',
  };
};
