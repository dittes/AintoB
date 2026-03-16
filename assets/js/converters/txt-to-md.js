/**
 * Plain Text → Markdown converter
 * No external dependencies — detects patterns and applies basic Markdown
 */
window.performConversion = async function (input) {
  const source = typeof input === 'string' ? input : await input.text();

  const lines = source.split('\n');
  const out = lines.map(function (line, i) {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // Lines in ALL CAPS that are short → heading
    if (/^[A-Z][A-Z0-9 :–\-]{2,59}$/.test(trimmed) && trimmed === trimmed.toUpperCase()) {
      return '## ' + trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
    }

    // Lines that look like list items (start with - or * or a number)
    if (/^[-*•]\s+/.test(trimmed)) return line;
    if (/^\d+[.)]\s+/.test(trimmed)) return line;

    // URLs on their own line → Markdown link
    if (/^https?:\/\/\S+$/.test(trimmed)) return `[${trimmed}](${trimmed})`;

    return line;
  });

  const markdown = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    blob: new Blob([markdown], { type: 'text/markdown' }),
    filename: 'converted.md',
  };
};
