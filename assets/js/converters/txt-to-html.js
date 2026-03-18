/**
 * Plain Text → HTML
 * Wraps each non-empty line as a paragraph. Detects headings (ALL CAPS short lines) and URLs.
 */
window.performConversion = async function (input) {
  const source = typeof input === 'string' ? input : await input.text();

  const paragraphs = source.split(/\n{2,}/).map(block => {
    const lines = block.trim().split('\n');
    if (lines.length === 1) {
      const line = lines[0].trim();
      // Short ALL-CAPS line → heading
      if (/^[A-Z][A-Z\s\d:–\-]{2,59}$/.test(line) && line === line.toUpperCase()) {
        return `<h2>${esc(line)}</h2>`;
      }
      // URL on its own
      if (/^https?:\/\/\S+$/.test(line)) {
        return `<p><a href="${esc(line)}">${esc(line)}</a></p>`;
      }
    }
    // Multi-line block → bulleted list if each line starts with - or *
    if (lines.every(l => /^[-*•]\s+/.test(l.trim()))) {
      const items = lines.map(l => `<li>${esc(l.replace(/^[-*•]\s+/, '').trim())}</li>`).join('\n');
      return `<ul>${items}</ul>`;
    }
    return `<p>${lines.map(l => esc(l.trim())).join('<br>')}</p>`;
  }).join('\n');

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Converted</title></head>
<body>
${paragraphs}
</body>
</html>`;

  return {
    blob: new Blob([html], { type: 'text/html' }),
    filename: 'converted.html',
  };
};
