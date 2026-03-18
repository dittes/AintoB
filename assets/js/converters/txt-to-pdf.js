/**
 * Plain Text → PDF using html2pdf.js
 */
window.performConversion = async function (input) {
  if (!window.html2pdf) throw new Error('PDF library not loaded. Reload the page and try again.');
  const source = typeof input === 'string' ? input : await input.text();

  const container = document.createElement('div');
  container.style.cssText = 'font-family:"Courier New",monospace;font-size:11pt;line-height:1.6;padding:1.5cm;white-space:pre-wrap;max-width:800px;';
  container.textContent = source;
  document.body.appendChild(container);

  return new Promise((resolve, reject) => {
    window.html2pdf()
      .set({ margin: 10, filename: 'converted.pdf', html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4' } })
      .from(container)
      .outputPdf('blob')
      .then(blob => { document.body.removeChild(container); resolve({ blob, filename: 'converted.pdf' }); })
      .catch(err => { document.body.removeChild(container); reject(err); });
  });
};
