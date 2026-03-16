/**
 * Markdown → Plain Text converter
 * No external dependencies — strips Markdown syntax with regex
 */
window.performConversion = async function (input) {
  const source = typeof input === 'string' ? input : await input.text();

  let txt = source
    // Remove ATX headings (# ## ###...)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove fenced code blocks
    .replace(/```[\s\S]*?```/g, function (m) { return m.replace(/```[^\n]*\n?/g, ''); })
    // Remove blockquotes
    .replace(/^>\s?/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove images — keep alt text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove links — keep label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Remove unordered list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Remove ordered list markers
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Collapse excess blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    blob: new Blob([txt], { type: 'text/plain' }),
    filename: 'converted.txt',
  };
};
