/**
 * CSV → TXT  (passthrough — saves the CSV content as a plain .txt file)
 */
window.performConversion = async function (input) {
  const source = typeof input === 'string' ? input : await input.text();
  return {
    blob: new Blob([source], { type: 'text/plain' }),
    filename: 'converted.txt',
  };
};
