/**
 * Word (.docx) → PDF via browser print dialog.
 *
 * Uses mammoth.js (loaded via CDN) to extract HTML from the DOCX, then opens
 * a styled print window. The user saves as PDF from the browser print dialog.
 *
 * Note: mammoth preserves text, headings, lists, and basic tables well.
 * Complex Word layouts (multi-column, text boxes, custom fonts, tracked
 * changes) will render approximately, not pixel-perfectly.
 */
(function () {
  'use strict';

  var PRINT_CSS = [
    '@page { margin: 2.5cm; size: A4; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 11pt;',
    '       line-height: 1.6; color: #000; background: #fff;',
    '       max-width: 800px; margin: 0 auto; padding: 0 20px; }',
    'h1 { font-size: 20pt; margin: 0 0 12pt; }',
    'h2 { font-size: 15pt; margin: 16pt 0 7pt; }',
    'h3 { font-size: 12pt; margin: 12pt 0 5pt; }',
    'h4, h5, h6 { font-size: 11pt; margin: 10pt 0 4pt; }',
    'h1,h2,h3,h4,h5,h6 { page-break-after: avoid; }',
    'p { margin: 0 0 9pt; orphans: 3; widows: 3; }',
    'table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; page-break-inside: avoid; }',
    'th, td { border: 1px solid #aaa; padding: 5px 8px; text-align: left; vertical-align: top; }',
    'th { background: #f0f0f0; font-weight: bold; }',
    'ul, ol { padding-left: 24px; margin-bottom: 9pt; }',
    'li { margin-bottom: 4pt; }',
    'a { color: #000; }',
    'img { max-width: 100%; height: auto; page-break-inside: avoid; }',
    '.notice { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 4px;',
    '          padding: 8px 12px; margin-bottom: 14pt; font-size: 10pt; color: #92400e;',
    '          font-family: Arial, sans-serif; }',
    '@media print {',
    '  body { padding: 0; }',
    '  .notice { display: none; }',
    '  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '}'
  ].join('\n');

  function openPrintWindow(bodyHtml, title) {
    var w = window.open('', '_blank', 'width=920,height=700,menubar=no,toolbar=no');
    if (!w) {
      throw new Error(
        'Popup blocked. Please allow pop-ups for this site in your browser ' +
        'settings, then click "Open Print Dialog" again.'
      );
    }
    var doc = '<!DOCTYPE html><html lang="en"><head>' +
      '<meta charset="UTF-8"><title>' + (title || 'Document') + '</title>' +
      '<style>' + PRINT_CSS + '</style>' +
      '</head><body>' + bodyHtml + '</body></html>';

    w.document.write(doc);
    w.document.close();

    var doPrint = function () { w.focus(); w.print(); };
    if (w.document.readyState === 'complete') {
      setTimeout(doPrint, 400);
    } else {
      w.addEventListener('load', function () { setTimeout(doPrint, 400); });
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
    if (!window.mammoth) {
      throw new Error('Word library not loaded. Reload the page and try again.');
    }
    if (typeof input === 'string') {
      throw new Error('Word to PDF requires a .docx file. Please upload a .docx file.');
    }

    var arrayBuffer = await input.arrayBuffer();
    var result = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer });

    var html = result.value;
    // Strip any scripts defensively
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Prepend a layout-fidelity notice (hidden when printing)
    var notice = '<div class="notice"><strong>Layout note:</strong> This rendering is based on ' +
      'the document text and structure. Complex Word layouts (multi-column, text boxes, ' +
      'tracked changes, custom fonts) may look different from the original.</div>';

    return openPrintWindow(notice + html, 'Word → PDF');
  };

})();
