/**
 * Spreadsheet (CSV / TSV / XLS / XLSX / ODS) → PDF via browser print dialog.
 *
 * Parses the workbook with SheetJS (loaded via CDN), renders the active sheet
 * as a styled HTML table in a print window, and auto-triggers the browser
 * print dialog. The user saves as PDF.
 *
 * Layout is data-faithful, not pixel-perfect Excel recreation. Cell styling,
 * merged cells, and charts are not preserved.
 */
(function () {
  'use strict';

  var TABLE_CSS = [
    '@page { margin: 1.5cm; size: A4 landscape; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt;',
    '       color: #000; background: #fff; margin: 0; padding: 10px; }',
    'h2 { font-size: 13pt; margin: 0 0 10pt; }',
    'p.meta { font-size: 8pt; color: #555; margin: 0 0 8pt; }',
    'table { border-collapse: collapse; width: 100%; }',
    'thead th { background: #1d4ed8; color: #fff; padding: 5px 8px;',
    '            text-align: left; font-size: 9pt; font-weight: bold;',
    '            -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    'tbody td { border: 1px solid #ccc; padding: 3px 7px; font-size: 8.5pt;',
    '           vertical-align: top; }',
    'tbody tr:nth-child(even) td { background: #f8f9fa;',
    '  -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '.notice { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 4px;',
    '          padding: 7px 10px; margin-bottom: 10pt; font-size: 8pt; color: #92400e; }',
    '@media print {',
    '  body { padding: 0; }',
    '  .notice { display: none; }',
    '  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '}'
  ].join('\n');

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openPrintWindow(bodyHtml, title) {
    var w = window.open('', '_blank', 'width=1100,height=700,menubar=no,toolbar=no');
    if (!w) {
      throw new Error(
        'Popup blocked. Please allow pop-ups for this site in your browser ' +
        'settings, then click "Open Print Dialog" again.'
      );
    }
    var doc = '<!DOCTYPE html><html lang="en"><head>' +
      '<meta charset="UTF-8"><title>' + (title || 'Spreadsheet') + '</title>' +
      '<style>' + TABLE_CSS + '</style>' +
      '</head><body>' + bodyHtml + '</body></html>';

    w.document.write(doc);
    w.document.close();

    var doPrint = function () { w.focus(); w.print(); };
    if (w.document.readyState === 'complete') {
      setTimeout(doPrint, 350);
    } else {
      w.addEventListener('load', function () { setTimeout(doPrint, 350); });
    }
    return { printMode: true, printFn: doPrint };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn   = document.getElementById('convertBtn');
    var dlBtn = document.getElementById('downloadBtn');
    if (btn)   btn.innerHTML   = '<i class="bi bi-printer me-2" aria-hidden="true"></i>Open Print Dialog';
    if (dlBtn) dlBtn.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>Print / Save as PDF Again';
  });

  window.performConversion = async function (input) {
    if (!window.XLSX) {
      throw new Error('Spreadsheet library not loaded. Reload the page and try again.');
    }

    var widget = document.querySelector('.section-converter');
    var FROM   = (widget && widget.dataset.from ? widget.dataset.from : '').toUpperCase();

    var wb;
    if (typeof input === 'string') {
      var opts = { type: 'string' };
      if (FROM === 'TSV') opts.FS = '\t';
      wb = window.XLSX.read(input, opts);
    } else {
      var arrayBuffer = await input.arrayBuffer();
      wb = window.XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    }

    var sheetName = wb.SheetNames[0];
    var ws        = wb.Sheets[sheetName];
    var rows      = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (!rows || rows.length === 0) {
      throw new Error('The spreadsheet appears to be empty.');
    }

    var headerRow = rows[0];
    var dataRows  = rows.slice(1);

    var thead = '<thead><tr>' +
      headerRow.map(function (c) { return '<th>' + escHtml(c) + '</th>'; }).join('') +
      '</tr></thead>';

    var tbody = '<tbody>' +
      dataRows.map(function (row) {
        // Pad row to match header width
        var cells = headerRow.map(function (_, i) {
          return '<td>' + escHtml(row[i] !== undefined ? row[i] : '') + '</td>';
        });
        return '<tr>' + cells.join('') + '</tr>';
      }).join('') +
      '</tbody>';

    var filename = (typeof input !== 'string' && input.name) ? escHtml(input.name) : (FROM || 'spreadsheet');

    var notice = '<div class="notice"><strong>Layout note:</strong> Cell formatting, merged cells, ' +
      'and charts are not preserved — this is a data export of the sheet content.</div>';

    var meta = '<p class="meta">Sheet: <strong>' + escHtml(sheetName) + '</strong> &middot; ' +
      rows.length + ' rows &middot; ' + headerRow.length + ' columns &middot; ' +
      'Converted by AintoB.com</p>';

    var tableHtml = '<h2>' + escHtml(sheetName) + '</h2>' +
      meta +
      '<table>' + thead + tbody + '</table>';

    return openPrintWindow(notice + tableHtml, sheetName + ' — Spreadsheet PDF');
  };

})();
