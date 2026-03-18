/**
 * RTF → Plain Text
 * Strips RTF control codes and formatting via regex.
 * Handles common RTF patterns without a full parser.
 */
window.performConversion = async function (input) {
  const source = typeof input === 'string' ? input : await input.text();

  const text = source
    // Remove RTF header and info groups
    .replace(/\{\\info[\s\S]*?\}/g, '')
    // Remove embedded objects and images
    .replace(/\{\\(?:pict|object|fldinst|fldrslt|fonttbl|colortbl|stylesheet|listtable|listoverridetable)[\s\S]*?\}/g, '')
    // Remove \bin blocks (binary data)
    .replace(/\\bin\d*\s[\s\S]*?(?=\\|\{|\})/g, '')
    // Unicode character escapes: \uNNN? → character
    .replace(/\\u(\d+)\?/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    // Handle special characters
    .replace(/\\'/g, (m, offset, str) => {
      const hex = str.slice(offset + 2, offset + 4);
      return hex ? String.fromCharCode(parseInt(hex, 16)) : '';
    })
    // Paragraph breaks
    .replace(/\\(?:par|pard|sect|page)\b\s*/g, '\n')
    // Line breaks
    .replace(/\\line\b\s*/g, '\n')
    // Tab
    .replace(/\\tab\b\s*/g, '\t')
    // Remove remaining control words and symbols
    .replace(/\\[a-z*]+\-?\d*\s?/gi, '')
    // Remove remaining braces and backslashes
    .replace(/[{}\\]/g, '')
    // Collapse excess whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    blob: new Blob([text], { type: 'text/plain' }),
    filename: 'converted.txt',
  };
};
