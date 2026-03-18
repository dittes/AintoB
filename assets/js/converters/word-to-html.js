/**
 * Word (.docx) → HTML using Mammoth
 */
window.performConversion = async function (input) {
  if (!window.mammoth) throw new Error('Word library not loaded. Reload the page and try again.');
  if (typeof input === 'string') throw new Error('Word to HTML requires a .docx file. Please upload a file.');

  const arrayBuffer = await input.arrayBuffer();
  const result = await window.mammoth.convertToHtml({ arrayBuffer });

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Converted</title>
  <style>body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.5;max-width:800px;margin:2rem auto;padding:0 1rem;}</style>
</head>
<body>
${result.value}
</body>
</html>`;

  return {
    blob: new Blob([fullHtml], { type: 'text/html' }),
    filename: 'converted.html',
  };
};
