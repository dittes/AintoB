/**
 * PDF → Plain Text using PDF.js
 *
 * Extracts text from every page of a text-native PDF. Attempts to reconstruct
 * readable line breaks by grouping text items by vertical position. Scanned /
 * image-only PDFs will produce empty or minimal output — use the PDF to
 * Searchable PDF tool (OCR) for those files.
 */
(function () {
  'use strict';

  // Threshold (in PDF pts) below which two items are considered the same line
  var SAME_LINE_THRESHOLD = 3;

  /**
   * Group text items into lines based on their Y position, then join them.
   * Items within SAME_LINE_THRESHOLD pts of each other vertically are one line.
   */
  function itemsToText(items) {
    if (!items || !items.length) return '';

    // Sort items top-to-bottom (PDF Y-axis is bottom-up, so higher Y = higher on page)
    var sorted = items.slice().sort(function (a, b) {
      var ay = a.transform ? a.transform[5] : 0;
      var by = b.transform ? b.transform[5] : 0;
      return by - ay; // descending Y = top of page first
    });

    var lines = [];
    var currentLine = [];
    var currentY    = null;

    sorted.forEach(function (item) {
      var y = item.transform ? item.transform[5] : 0;
      if (currentY === null) {
        currentY = y;
      }
      if (Math.abs(y - currentY) > SAME_LINE_THRESHOLD) {
        // New line
        if (currentLine.length) lines.push(currentLine.join(' ').trim());
        currentLine = [];
        currentY    = y;
      }
      var text = item.str || '';
      if (text) currentLine.push(text);
    });
    if (currentLine.length) lines.push(currentLine.join(' ').trim());

    return lines.filter(function (l) { return l.length > 0; }).join('\n');
  }

  window.performConversion = async function (input) {
    var pdfjsLib = window['pdfjs-dist/build/pdf'];
    if (!pdfjsLib) throw new Error('PDF library not loaded. Reload the page and try again.');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    var arrayBuffer = input instanceof Blob ? await input.arrayBuffer() : await input.arrayBuffer();
    var pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    var pages = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      var page    = await pdf.getPage(i);
      var content = await page.getTextContent();
      var text    = itemsToText(content.items);
      if (pdf.numPages > 1) {
        pages.push('--- Page ' + i + ' ---\n' + text);
      } else {
        pages.push(text);
      }
    }

    var fullText = pages.join('\n\n');

    if (!fullText.trim()) {
      throw new Error(
        'No text was found in this PDF. It may be a scanned or image-only PDF. ' +
        'Use the PDF to Searchable PDF tool to extract text via OCR.'
      );
    }

    return {
      blob:     new Blob([fullText], { type: 'text/plain;charset=utf-8' }),
      filename: 'extracted-text.txt'
    };
  };

})();
