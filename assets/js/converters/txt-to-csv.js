/**
 * TXT → CSV  (passthrough — saves the text file with .csv extension)
 * Useful when the user has a CSV stored as .txt and wants it as .csv.
 */
window.performConversion = async function (input) {
  const source = typeof input === 'string' ? input : await input.text();
  return {
    blob: new Blob([source], { type: 'text/csv' }),
    filename: 'converted.csv',
  };
};
