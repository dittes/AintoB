/**
 * Markdown → Word (.docx) converter
 * Requires: markdown-it + html-docx-js (loaded via CDN before this script)
 */
window.performConversion = async function (input) {
  const md = window.markdownit({ html: false, linkify: true, typographer: true });
  const source = typeof input === 'string' ? input : await input.text();
  const htmlBody = md.render(source);

  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body>${htmlBody}</body>
</html>`;

  const docxBlob = window.htmlDocx.asBlob(fullHtml, { orientation: 'portrait', margins: { top: 720, bottom: 720, left: 720, right: 720 } });
  return {
    blob: docxBlob,
    filename: 'converted.docx',
  };
};
