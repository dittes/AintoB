/**
 * Markdown → PDF converter
 * Requires: markdown-it + html2pdf.js (loaded via CDN before this script)
 */
window.performConversion = async function (input) {
  const md = window.markdownit({ html: false, linkify: true, typographer: true });
  const source = typeof input === 'string' ? input : await input.text();
  const htmlBody = md.render(source);

  const container = document.createElement('div');
  container.style.cssText = 'font-family:Georgia,serif;font-size:12pt;line-height:1.6;padding:2cm;max-width:800px;';
  container.innerHTML = htmlBody;
  document.body.appendChild(container);

  return new Promise(function (resolve, reject) {
    window.html2pdf()
      .set({ margin: 10, filename: 'converted.pdf', html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4' } })
      .from(container)
      .outputPdf('blob')
      .then(function (blob) {
        document.body.removeChild(container);
        resolve({ blob: blob, filename: 'converted.pdf' });
      })
      .catch(function (err) {
        document.body.removeChild(container);
        reject(err);
      });
  });
};
