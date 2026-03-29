/**
 * PDF → Image converter using PDF.js
 *
 * Supports:
 *  - Single page export (with page selector)
 *  - All pages export packaged as a ZIP (via JSZip loaded on demand)
 *
 * Output format is read from section[data-to]: PNG (default), JPG, WebP.
 * TIFF falls back to PNG with a warning.
 */
(function () {
  'use strict';

  // ── Output format helpers ─────────────────────────────────────────────────
  var MIME_MAP = { JPG: 'image/jpeg', JPEG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp' };
  var EXT_MAP  = { JPG: 'jpg', JPEG: 'jpg', PNG: 'png', WEBP: 'webp', TIFF: 'png' };

  // ── Lazily load JSZip from CDN ────────────────────────────────────────────
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      s.onload  = function () { resolve(window.JSZip); };
      s.onerror = function () {
        reject(new Error('Could not load ZIP library. Try exporting one page at a time.'));
      };
      document.head.appendChild(s);
    });
  }

  // ── Inject page-selector controls into the converter settings panel ───────
  function injectPageControls() {
    var settings = document.getElementById('converterSettings');
    if (!settings) return;
    if (document.getElementById('pdfPageControls')) return; // already injected

    var ctrl = document.createElement('div');
    ctrl.id        = 'pdfPageControls';
    ctrl.className = 'mb-3';
    ctrl.hidden    = true; // shown once a PDF is loaded
    ctrl.innerHTML = [
      '<label class="converter-label">Pages to export</label>',
      '<div class="d-flex flex-wrap gap-3 mb-2">',
      '  <label class="d-flex align-items-center gap-2" style="cursor:pointer;font-size:var(--text-sm);">',
      '    <input type="radio" name="pdfPageMode" value="one" checked>',
      '    Page <input type="number" id="pdfPageNum"',
      '      class="form-control form-control-sm d-inline-block ms-1" value="1" min="1"',
      '      style="width:72px;" aria-label="Page number">',
      '    <span id="pdfPageTotal" class="text-muted"></span>',
      '  </label>',
      '  <label class="d-flex align-items-center gap-2" style="cursor:pointer;font-size:var(--text-sm);">',
      '    <input type="radio" name="pdfPageMode" value="all">',
      '    All pages <span class="text-muted" style="font-size:var(--text-xs);">(downloads as .zip)</span>',
      '  </label>',
      '</div>'
    ].join('');

    // Insert before the Convert button
    var convertBtn = settings.querySelector('#convertBtn');
    if (convertBtn) {
      settings.insertBefore(ctrl, convertBtn);
    } else {
      settings.appendChild(ctrl);
    }

    // Toggle page-number field when "all" radio is chosen
    ctrl.querySelectorAll('input[name="pdfPageMode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var numInput = document.getElementById('pdfPageNum');
        if (numInput) numInput.disabled = (r.value === 'all');
      });
    });
  }

  // ── Load PDF metadata when a file is selected (to show page count) ────────
  document.addEventListener('DOMContentLoaded', function () {
    injectPageControls();

    var fileInput = document.getElementById('fileInput');
    if (!fileInput) return;

    fileInput.addEventListener('change', async function () {
      if (!this.files || !this.files[0]) return;
      try {
        var pdfjsLib = window['pdfjs-dist/build/pdf'];
        if (!pdfjsLib) return;
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

        var ab  = await this.files[0].arrayBuffer();
        var pdf = await pdfjsLib.getDocument({ data: ab }).promise;

        var numPages = pdf.numPages;
        var totalEl  = document.getElementById('pdfPageTotal');
        var numEl    = document.getElementById('pdfPageNum');
        var ctrl     = document.getElementById('pdfPageControls');

        if (totalEl) totalEl.textContent = 'of ' + numPages;
        if (numEl)   numEl.max = numPages;
        if (ctrl)    ctrl.hidden = false;

        // Update download button label to reflect multi-page awareness
        var dlBtn = document.getElementById('downloadBtn');
        if (dlBtn) {
          var widget = document.querySelector('.section-converter');
          var TO     = (widget && widget.dataset.to ? widget.dataset.to : 'PNG').toUpperCase();
          var ext    = EXT_MAP[TO] || 'png';
          dlBtn.innerHTML = numPages > 1
            ? '<i class="bi bi-download me-2" aria-hidden="true"></i>Download Image(s)'
            : '<i class="bi bi-download me-2" aria-hidden="true"></i>Download ' + ext.toUpperCase() + ' File';
        }
      } catch (e) {
        // Non-critical — page controls stay hidden, single-page export still works
      }
    });
  });

  // ── Main converter ────────────────────────────────────────────────────────
  window.performConversion = async function (input) {
    var widget = document.querySelector('.section-converter');
    var TO     = (widget && widget.dataset.to ? widget.dataset.to : 'PNG').toUpperCase();

    if (TO === 'RTF' || TO === 'MARKDOWN' || TO === 'WORD' || TO === 'HTML') {
      throw new Error(
        'PDF to ' + TO + ' conversion is not supported in the browser. ' +
        'Try PDF to Text for plain text extraction instead.'
      );
    }
    if (TO === 'TIFF') {
      // Warn but fall through — we'll save as PNG
      console.warn('TIFF encoding is not supported in browsers; saving as PNG instead.');
    }

    var outMime = MIME_MAP[TO] || 'image/png';
    var outExt  = EXT_MAP[TO]  || 'png';
    var quality = (TO === 'JPG' || TO === 'JPEG') ? 0.92 : undefined;

    var pdfjsLib = window['pdfjs-dist/build/pdf'];
    if (!pdfjsLib) throw new Error('PDF library not loaded. Reload the page and try again.');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    var arrayBuffer = input instanceof Blob ? await input.arrayBuffer() : await input.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Read user's page selection
    var modeEl   = document.querySelector('input[name="pdfPageMode"]:checked');
    var mode     = modeEl ? modeEl.value : 'one';
    var numInput = document.getElementById('pdfPageNum');
    var selPage  = numInput ? Math.max(1, Math.min(parseInt(numInput.value) || 1, pdf.numPages)) : 1;

    var SCALE = 2.0; // 144 dpi effective

    async function renderPageToBlob(pageNum) {
      var page     = await pdf.getPage(pageNum);
      var viewport = page.getViewport({ scale: SCALE });
      var canvas   = document.createElement('canvas');
      canvas.width  = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      var ctx = canvas.getContext('2d');

      // White background for JPEG (transparent would produce black fill)
      if (TO === 'JPG' || TO === 'JPEG') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      return new Promise(function (resolve, reject) {
        canvas.toBlob(
          function (b) { b ? resolve(b) : reject(new Error('Image export failed for page ' + pageNum)); },
          outMime,
          quality
        );
      });
    }

    // ── Single page ────────────────────────────────────────────────────────
    if (mode === 'one') {
      var blob = await renderPageToBlob(selPage);
      return { blob: blob, filename: 'page-' + selPage + '.' + outExt };
    }

    // ── All pages → ZIP ────────────────────────────────────────────────────
    var JSZip  = await loadJSZip();
    var zip    = new JSZip();
    var folder = zip.folder('pdf-pages');
    var digits = String(pdf.numPages).length;

    for (var i = 1; i <= pdf.numPages; i++) {
      var pageBlob = await renderPageToBlob(i);
      var arr      = await pageBlob.arrayBuffer();
      var padded   = String(i).padStart(digits, '0');
      folder.file('page-' + padded + '.' + outExt, arr);
    }

    var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return { blob: zipBlob, filename: 'pdf-pages.zip' };
  };

})();
