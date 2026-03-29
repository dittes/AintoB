/**
 * Markdown → PDF via browser print dialog.
 *
 * Converts Markdown to HTML with markdown-it (loaded via CDN on the page),
 * then opens a styled print window and auto-triggers the browser print dialog.
 * The user saves as PDF from there.
 */
(function () {
  'use strict';

  var PRINT_CSS = [
    '@page { margin: 2cm; size: A4; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt;',
    '       line-height: 1.7; color: #000; background: #fff;',
    '       max-width: 800px; margin: 0 auto; padding: 0 20px; }',
    'h1 { font-size: 22pt; margin: 0 0 14pt; border-bottom: 2px solid #ddd; padding-bottom: 6pt; }',
    'h2 { font-size: 16pt; margin: 18pt 0 8pt; border-bottom: 1px solid #eee; padding-bottom: 3pt; }',
    'h3 { font-size: 13pt; margin: 14pt 0 6pt; }',
    'h4, h5, h6 { font-size: 11pt; margin: 12pt 0 4pt; }',
    'h1,h2,h3,h4,h5,h6 { page-break-after: avoid; }',
    'p { margin: 0 0 10pt; orphans: 3; widows: 3; }',
    'a { color: #2563eb; }',
    'table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; page-break-inside: avoid; }',
    'th, td { border: 1px solid #999; padding: 5px 9px; text-align: left; }',
    'th { background: #f0f0f0; font-weight: bold; }',
    'pre { background: #f5f5f5; border: 1px solid #ddd; padding: 12px;',
    '      font-size: 10pt; font-family: "Courier New", Courier, monospace;',
    '      white-space: pre-wrap; word-wrap: break-word; page-break-inside: avoid; }',
    'code { background: #f5f5f5; padding: 2px 5px; font-size: 10pt;',
    '       font-family: "Courier New", Courier, monospace; border-radius: 3px; }',
    'pre code { background: none; padding: 0; }',
    'blockquote { border-left: 4px solid #ccc; margin: 12pt 0 12pt 0;',
    '             padding: 6pt 6pt 6pt 14px; color: #444; font-style: italic; background: #fafafa; }',
    'ul, ol { padding-left: 26px; margin-bottom: 10pt; }',
    'li { margin-bottom: 4pt; }',
    'img { max-width: 100%; height: auto; page-break-inside: avoid; }',
    'hr { border: 0; border-top: 1px solid #ccc; margin: 18pt 0; }',
    '@media print {',
    '  body { padding: 0; }',
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
    if (!window.markdownit) {
      throw new Error('Markdown library not loaded. Reload the page and try again.');
    }
    var source = typeof input === 'string' ? input : await input.text();

    var md = window.markdownit({
      html:        false,   // Never render raw HTML from Markdown for safety
      linkify:     true,
      typographer: true,
      breaks:      false
    });

    var htmlBody = md.render(source);

    // Strip any injected scripts (markdownit with html:false shouldn't produce
    // any, but defence in depth)
    htmlBody = htmlBody.replace(/<script[\s\S]*?<\/script>/gi, '');

    return openPrintWindow(htmlBody, 'Markdown → PDF');
  };

})();
