/**
 * Word (.docx) → Plain Text using Mammoth
 */
window.performConversion = async function (input) {
  if (!window.mammoth) throw new Error('Word library not loaded. Reload the page and try again.');
  if (typeof input === 'string') throw new Error('Word to TXT requires a .docx file. Please upload a file.');

  const arrayBuffer = await input.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return {
    blob: new Blob([result.value.trim()], { type: 'text/plain' }),
    filename: 'converted.txt',
  };
};
