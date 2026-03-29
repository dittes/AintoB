/**
 * HTML → PDF via browser print dialog.
 *
 * The most reliable browser-only approach: renders HTML in a clean print
 * window and auto-opens the browser's native print dialog. The user saves
 * as PDF from there. No CORS issues, no canvas rasterisation, no external
 * PDF engine required.
 */
(function () {
  'use strict';

  // ── Shared print CSS ──────────────────────────────────────────────────────
  var PRINT_CSS = [
    '@page { margin: 2cm; size: A4; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt;',
    '       line-height: 1.7; color: #000; background: #fff;',
    '       max-width: 800px; margin: 0 auto; padding: 0 20px; }',
    'h1 { font-size: 22pt; margin: 0 0 14pt; }',
    'h2 { font-size: 16pt; margin: 18pt 0 8pt; }',
    'h3 { font-size: 13pt; margin: 14pt 0 6pt; }',
    'h4, h5, h6 { font-size: 11pt; margin: 12pt 0 4pt; }',
    'h1,h2,h3,h4,h5,h6 { page-break-after: avoid; }',
    'p { margin: 0 0 10pt; orphans: 3; widows: 3; }',
    'a { color: #000; }',
    'table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; page-break-inside: avoid; }',
    'th, td { border: 1px solid #999; padding: 5px 9px; text-align: left; vertical-align: top; }',
    'th { background: #f0f0f0; font-weight: bold; }',
    'pre { background: #f5f5f5; border: 1px solid #ddd; padding: 12px;',
    '      font-size: 10pt; font-family: "Courier New", Courier, monospace;',
    '      white-space: pre-wrap; word-wrap: break-word; page-break-inside: avoid; }',
    'code { background: #f5f5f5; padding: 2px 5px; font-size: 10pt;',
    '       font-family: "Courier New", Courier, monospace; border-radius: 3px; }',
    'pre code { background: none; padding: 0; border-radius: 0; }',
    'blockquote { border-left: 4px solid #ccc; margin: 12pt 0; padding-left: 16px;',
    '             color: #444; font-style: italic; }',
    'ul, ol { padding-left: 26px; margin-bottom: 10pt; }',
    'li { margin-bottom: 4pt; }',
    'img { max-width: 100%; height: auto; page-break-inside: avoid; }',
    'hr { border: 0; border-top: 1px solid #ccc; margin: 18pt 0; }',
    '@media print {',
    '  body { padding: 0; }',
    '  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '}'
  ].join('\n');

  // ── Sanitise: strip scripts/event-handlers before putting in a new window ─
  function sanitise(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\s+on\w+\s*=\s*(['"])[\s\S]*?\1/gi, '')
      .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  }

  // ── Open a clean popup and print ─────────────────────────────────────────
  function openPrintWindow(bodyHtml, title) {
    var w = window.open('', '_blank', 'width=920,height=700,menubar=no,toolbar=no');
    if (!w) {
      throw new Error(
        'Popup blocked. Please allow pop-ups for this site in your browser ' +
        'settings, then click "Open Print Dialog" again.'
      );
    }
    var doc = [
      '<!DOCTYPE html><html lang="en"><head>',
      '<meta charset="UTF-8">',
      '<title>' + (title || 'Document') + '</title>',
      '<style>' + PRINT_CSS + '</style>',
      '</head><body>',
      bodyHtml,
      '</body></html>'
    ].join('');

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

  // ── Update button labels on DOMContentLoaded ──────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var btn  = document.getElementById('convertBtn');
    var dlBtn = document.getElementById('downloadBtn');
    if (btn)   btn.innerHTML   = '<i class="bi bi-printer me-2" aria-hidden="true"></i>Open Print Dialog';
    if (dlBtn) dlBtn.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>Print / Save as PDF Again';
  });

  // ── Main converter ────────────────────────────────────────────────────────
  window.performConversion = async function (input) {
    var source = typeof input === 'string' ? input : await input.text();
    var clean  = sanitise(source);
    // Wrap bare text (no block tags) in a paragraph
    var hasBlock = /<(p|div|h[1-6]|ul|ol|table|pre|blockquote)/i.test(clean);
    if (!hasBlock) clean = '<p>' + clean.replace(/\n/g, '<br>') + '</p>';
    return openPrintWindow(clean, 'HTML → PDF');
  };

})();
