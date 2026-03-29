/**
 * Plain Text → PDF via browser print dialog.
 *
 * Wraps the text in a <pre> block inside a clean print window and
 * auto-triggers the browser print dialog. The user saves as PDF.
 */
(function () {
  'use strict';

  var PRINT_CSS = [
    '@page { margin: 2cm; size: A4; }',
    'body { font-family: "Courier New", Courier, monospace; font-size: 10.5pt;',
    '       line-height: 1.55; color: #000; background: #fff;',
    '       margin: 0; padding: 0; }',
    'pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; padding: 0; }',
    '@media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }'
  ].join('\n');

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function openPrintWindow(bodyHtml) {
    var w = window.open('', '_blank', 'width=920,height=700,menubar=no,toolbar=no');
    if (!w) {
      throw new Error(
        'Popup blocked. Please allow pop-ups for this site in your browser ' +
        'settings, then click "Open Print Dialog" again.'
      );
    }
    var doc = '<!DOCTYPE html><html lang="en"><head>' +
      '<meta charset="UTF-8"><title>Text → PDF</title>' +
      '<style>' + PRINT_CSS + '</style>' +
      '</head><body>' + bodyHtml + '</body></html>';

    w.document.write(doc);
    w.document.close();

    var doPrint = function () { w.focus(); w.print(); };
    if (w.document.readyState === 'complete') {
      setTimeout(doPrint, 300);
    } else {
      w.addEventListener('load', function () { setTimeout(doPrint, 300); });
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
    var source = typeof input === 'string' ? input : await input.text();
    var html   = '<pre>' + escHtml(source) + '</pre>';
    return openPrintWindow(html);
  };

})();
