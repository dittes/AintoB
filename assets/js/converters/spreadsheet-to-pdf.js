/**
 * Spreadsheet (CSV / TSV / Excel / ODS) → PDF
 * Parses with SheetJS, renders as an HTML table, then exports via html2pdf.js
 */
window.performConversion = async function (input) {
  if (!window.XLSX)      throw new Error('Spreadsheet library not loaded. Reload the page and try again.');
  if (!window.html2pdf)  throw new Error('PDF library not loaded. Reload the page and try again.');

  const widget = document.querySelector('.section-converter');
  const FROM   = (widget?.dataset.from || '').toUpperCase();

  let wb;

  if (typeof input === 'string') {
    const opts = { type: 'string' };
    if (FROM === 'TSV') opts.FS = '\t';
    wb = XLSX.read(input, opts);
  } else {
    const arrayBuffer = await input.arrayBuffer();
    wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];

  // Build an HTML table from the sheet
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const tableRows = rows.map((row, ri) => {
    const tag = ri === 0 ? 'th' : 'td';
    const cells = row.map(cell => `<${tag} style="border:1px solid #ccc;padding:4px 8px;">${String(cell).replace(/</g,'&lt;')}</${tag}>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  const tableHtml = `<table style="border-collapse:collapse;width:100%;font-size:10pt;">${tableRows}</table>`;

  const container = document.createElement('div');
  container.style.cssText = 'font-family:Arial,sans-serif;padding:1cm;max-width:1200px;';
  container.innerHTML = tableHtml;
  document.body.appendChild(container);

  return new Promise((resolve, reject) => {
    window.html2pdf()
      .set({ margin: 8, filename: 'converted.pdf', html2canvas: { scale: 1.5 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } })
      .from(container)
      .outputPdf('blob')
      .then(blob => { document.body.removeChild(container); resolve({ blob, filename: 'converted.pdf' }); })
      .catch(err => { document.body.removeChild(container); reject(err); });
  });
};
