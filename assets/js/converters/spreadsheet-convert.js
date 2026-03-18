/**
 * Universal spreadsheet converter using SheetJS (xlsx)
 * Handles: CSV ↔ TSV ↔ Excel (.xlsx) ↔ ODS
 * Reads source/target from section[data-from] / section[data-to]
 */
window.performConversion = async function (input) {
  if (!window.XLSX) throw new Error('Spreadsheet library not loaded. Reload the page and try again.');

  const widget = document.querySelector('.section-converter');
  const FROM   = (widget?.dataset.from || '').toUpperCase();
  const TO     = (widget?.dataset.to   || '').toUpperCase();

  let wb; // workbook

  // ── Read input ─────────────────────────────────────────────────────────────
  if (typeof input === 'string') {
    // Text paste: CSV or TSV — XLSX.read with type:'string' handles both
    const opts = { type: 'string' };
    if (FROM === 'TSV') opts.FS = '\t';
    wb = XLSX.read(input, opts);
  } else {
    // File upload: binary
    const arrayBuffer = await input.arrayBuffer();
    wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];

  // ── Write output ───────────────────────────────────────────────────────────
  let outData, outMime, outExt;

  if (TO === 'CSV') {
    outData = XLSX.utils.sheet_to_csv(ws, { FS: ',' });
    outMime = 'text/csv';
    outExt  = 'csv';
  } else if (TO === 'TSV') {
    outData = XLSX.utils.sheet_to_csv(ws, { FS: '\t' });
    outMime = 'text/tab-separated-values';
    outExt  = 'tsv';
  } else if (TO === 'EXCEL') {
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    outData = new Uint8Array(buf);
    outMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    outExt  = 'xlsx';
  } else if (TO === 'ODS') {
    const buf = XLSX.write(wb, { bookType: 'ods', type: 'array' });
    outData = new Uint8Array(buf);
    outMime = 'application/vnd.oasis.opendocument.spreadsheet';
    outExt  = 'ods';
  } else {
    throw new Error(`Unsupported output format: ${TO}`);
  }

  return {
    blob: new Blob([outData], { type: outMime }),
    filename: `converted.${outExt}`,
  };
};
