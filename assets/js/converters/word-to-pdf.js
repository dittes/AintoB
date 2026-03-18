/**
 * Word (.docx) → PDF
 * Mammoth converts DOCX → HTML, then html2pdf.js renders to PDF.
 */
window.performConversion = async function (input) {
  if (!window.mammoth)   throw new Error('Word library not loaded. Reload the page and try again.');
  if (!window.html2pdf)  throw new Error('PDF library not loaded. Reload the page and try again.');
  if (typeof input === 'string') throw new Error('Word to PDF requires a .docx file. Please upload a file.');

  const arrayBuffer = await input.arrayBuffer();
  const result = await window.mammoth.convertToHtml({ arrayBuffer });

  const container = document.createElement('div');
  container.style.cssText = 'font-family:Calibri,sans-serif;font-size:11pt;line-height:1.5;padding:1.5cm;max-width:800px;';
  container.innerHTML = result.value;
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
