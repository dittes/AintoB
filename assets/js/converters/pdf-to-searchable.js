/**
 * PDF → Searchable PDF (OCR)
 *
 * This is a standalone tool with custom UI — it does NOT use the standard
 * site.js converter widget. The HTML page for this tool loads this script
 * and provides its own button / progress elements.
 *
 * Pipeline:
 *  1. Load the PDF with PDF.js and check if text is already embedded.
 *  2. If the PDF already has text (> threshold characters): report as
 *     already searchable and allow download of the original.
 *  3. If the PDF is image-only / low text:
 *     a. Render each page to a canvas at 150 dpi via PDF.js.
 *     b. OCR each canvas with Tesseract.js (English by default).
 *     c. Re-build a new PDF with pdf-lib:
 *        - embed the rasterised page image as background
 *        - draw the OCR text in tiny white (visually invisible) text so
 *          PDF search / copy-paste works.
 *     d. Return the searchable PDF blob for download.
 *
 * Limitations:
 *  - OCR accuracy depends on scan quality (Tesseract.js is good, not perfect).
 *  - Word-level text positioning is not preserved; text is placed as a
 *    single block per page (copy-paste works, word highlighting does not).
 *  - Very large PDFs (> 50 MB) may run slowly or cause memory pressure.
 */

(function () {
  'use strict';

  // ── UI element references (set in init) ───────────────────────────────────
  var ui = {};

  // ── Load pdf-lib from CDN ─────────────────────────────────────────────────
  function loadPDFLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      s.onload  = function () { resolve(window.PDFLib); };
      s.onerror = function () { reject(new Error('Failed to load pdf-lib. Check your internet connection.')); };
      document.head.appendChild(s);
    });
  }

  // ── Load Tesseract.js from CDN ────────────────────────────────────────────
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload  = function () { resolve(window.Tesseract); };
      s.onerror = function () { reject(new Error('Failed to load Tesseract OCR library. Check your internet connection.')); };
      document.head.appendChild(s);
    });
  }

  // ── Render one PDF.js page to a canvas ───────────────────────────────────
  async function renderPageToCanvas(pdfPage, scale) {
    var viewport = pdfPage.getViewport({ scale: scale });
    var canvas   = document.createElement('canvas');
    canvas.width  = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvasContext: ctx, viewport: viewport }).promise;
    return canvas;
  }

  // ── Canvas → JPEG Uint8Array ──────────────────────────────────────────────
  function canvasToJpegBytes(canvas, quality) {
    var dataUrl = canvas.toDataURL('image/jpeg', quality || 0.85);
    var b64     = dataUrl.split(',')[1];
    var raw     = atob(b64);
    var arr     = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  // ── Set progress bar + status text ───────────────────────────────────────
  function setProgress(pct, msg) {
    if (ui.progressBar) {
      ui.progressBar.style.width = pct + '%';
      ui.progressBar.setAttribute('aria-valuenow', pct);
      ui.progressBar.textContent = pct + '%';
    }
    if (ui.statusMsg) ui.statusMsg.textContent = msg || '';
  }

  function showError(msg) {
    if (ui.errorBox) {
      ui.errorBox.textContent = msg;
      ui.errorBox.hidden = false;
    }
    setProgress(0, '');
    if (ui.progressSection) ui.progressSection.hidden = true;
    if (ui.convertBtn) {
      ui.convertBtn.disabled = false;
      ui.convertBtn.innerHTML = '<i class="bi bi-search me-2" aria-hidden="true"></i>Create Searchable PDF';
    }
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  // ── Main OCR pipeline ─────────────────────────────────────────────────────
  async function run(file) {
    if (ui.errorBox)        ui.errorBox.hidden = true;
    if (ui.resultSection)   ui.resultSection.hidden = true;
    if (ui.progressSection) ui.progressSection.hidden = false;

    ui.convertBtn.disabled = true;
    ui.convertBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing…';

    try {
      setProgress(5, 'Loading libraries…');
      var pdfjsLib = window['pdfjs-dist/build/pdf'];
      if (!pdfjsLib) throw new Error('PDF.js not loaded. Reload the page.');
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

      var PDFLib   = await loadPDFLib();
      setProgress(10, 'Loading PDF…');

      var arrayBuffer = await file.arrayBuffer();
      var srcPdf      = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      var numPages    = srcPdf.numPages;

      // ── Step 1: Check if already searchable ────────────────────────────
      setProgress(12, 'Checking for existing text…');
      var totalChars = 0;
      for (var pi = 1; pi <= Math.min(numPages, 5); pi++) {
        var pg      = await srcPdf.getPage(pi);
        var content = await pg.getTextContent();
        totalChars += content.items.reduce(function (acc, it) { return acc + (it.str || '').length; }, 0);
      }

      // If there's substantial text already (avg > 100 chars/page in sample),
      // the PDF is text-native — OCR is not needed.
      var CHAR_THRESHOLD = 100;
      if (totalChars / Math.min(numPages, 5) > CHAR_THRESHOLD) {
        setProgress(100, 'Done — PDF already contains selectable text.');
        if (ui.progressSection) ui.progressSection.hidden = true;
        if (ui.resultSection)   ui.resultSection.hidden = false;
        if (ui.resultMsg) {
          ui.resultMsg.innerHTML =
            '<i class="bi bi-check-circle-fill text-success me-2" aria-hidden="true"></i>' +
            'This PDF already has selectable text — no OCR needed. ' +
            'You can download the original file.';
        }
        if (ui.downloadBtn) {
          var origBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
          ui.downloadBtn.onclick = function () { triggerDownload(origBlob, file.name || 'document.pdf'); };
          ui.downloadBtn.hidden = false;
        }
        ui.convertBtn.disabled = false;
        ui.convertBtn.innerHTML = '<i class="bi bi-search me-2" aria-hidden="true"></i>Create Searchable PDF';
        return;
      }

      // ── Step 2: OCR each page ──────────────────────────────────────────
      setProgress(15, 'Loading Tesseract OCR engine…');
      var Tesseract = await loadTesseract();

      var langEl = ui.langSelect;
      var lang   = (langEl && langEl.value) ? langEl.value : 'eng';

      setProgress(20, 'Initialising OCR for language: ' + lang + '…');

      var worker = await Tesseract.createWorker([lang], 1, {
        // Quiet logging
        logger: function () {}
      });

      var newPdfDoc = await PDFLib.PDFDocument.create();
      var helvetica = await newPdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

      var RENDER_SCALE = 1.5; // 108 dpi — balance between accuracy and speed/memory

      for (var i = 1; i <= numPages; i++) {
        var pct = Math.round(20 + (i / numPages) * 70);
        setProgress(pct, 'OCR page ' + i + ' of ' + numPages + '…');

        var pdfPage  = await srcPdf.getPage(i);
        var canvas   = await renderPageToCanvas(pdfPage, RENDER_SCALE);
        var jpegData = canvasToJpegBytes(canvas, 0.85);

        // OCR
        var ocrResult = await worker.recognize(canvas);
        var ocrText   = ocrResult.data.text || '';

        // Build new PDF page
        var pageWidthPt  = pdfPage.getViewport({ scale: 1 }).width;
        var pageHeightPt = pdfPage.getViewport({ scale: 1 }).height;

        var newPage = newPdfDoc.addPage([pageWidthPt, pageHeightPt]);

        // Embed the rasterised page image as background
        var jpegImage = await newPdfDoc.embedJpg(jpegData);
        newPage.drawImage(jpegImage, {
          x:      0,
          y:      0,
          width:  pageWidthPt,
          height: pageHeightPt
        });

        // Overlay invisible OCR text so PDF search / copy works
        // Text is drawn in white at near-zero opacity — visually hidden
        // but present in the PDF text stream.
        if (ocrText.trim()) {
          try {
            newPage.drawText(ocrText, {
              x:          5,
              y:          pageHeightPt - 15,
              size:       8,
              font:       helvetica,
              color:      PDFLib.rgb(1, 1, 1),  // white
              opacity:    0.01,                  // essentially invisible
              maxWidth:   pageWidthPt - 10,
              lineHeight: 9
            });
          } catch (e) {
            // Ignore text-draw failures (e.g. very long lines) — image is still embedded
          }
        }
      }

      await worker.terminate();

      setProgress(95, 'Assembling searchable PDF…');
      var pdfBytes = await newPdfDoc.save();
      var pdfBlob  = new Blob([pdfBytes], { type: 'application/pdf' });

      setProgress(100, 'Done!');
      if (ui.progressSection) ui.progressSection.hidden = true;
      if (ui.resultSection)   ui.resultSection.hidden = false;
      if (ui.resultMsg) {
        ui.resultMsg.innerHTML =
          '<i class="bi bi-check-circle-fill text-success me-2" aria-hidden="true"></i>' +
          'Searchable PDF created — ' + numPages + ' page' + (numPages !== 1 ? 's' : '') + ' processed.';
      }

      var baseName  = (file.name || 'document').replace(/\.pdf$/i, '');
      var dlFilename = baseName + '-searchable.pdf';

      if (ui.downloadBtn) {
        ui.downloadBtn.onclick = function () { triggerDownload(pdfBlob, dlFilename); };
        ui.downloadBtn.hidden = false;
      }

      // Auto-trigger download
      triggerDownload(pdfBlob, dlFilename);

    } catch (err) {
      showError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      if (ui.convertBtn) {
        ui.convertBtn.disabled = false;
        ui.convertBtn.innerHTML = '<i class="bi bi-search me-2" aria-hidden="true"></i>Create Searchable PDF';
      }
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    ui.dropZone        = document.getElementById('dropZone');
    ui.fileInput       = document.getElementById('fileInput');
    ui.fileName        = document.getElementById('selectedFileName');
    ui.fileSize        = document.getElementById('selectedFileSize');
    ui.clearBtn        = document.getElementById('clearFileBtn');
    ui.settingsPanel   = document.getElementById('converterSettings');
    ui.convertBtn      = document.getElementById('convertBtn');
    ui.progressSection = document.getElementById('ocrProgress');
    ui.progressBar     = document.getElementById('ocrProgressBar');
    ui.statusMsg       = document.getElementById('ocrStatus');
    ui.resultSection   = document.getElementById('ocrResult');
    ui.resultMsg       = document.getElementById('ocrResultMsg');
    ui.downloadBtn     = document.getElementById('downloadBtn');
    ui.errorBox        = document.getElementById('ocrError');
    ui.langSelect      = document.getElementById('ocrLang');

    var selectedFile = null;

    function formatBytes(b) {
      if (b < 1024)    return b + ' B';
      if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1048576).toFixed(1) + ' MB';
    }

    function showFile(file) {
      selectedFile = file;
      if (ui.fileName)    ui.fileName.textContent    = file.name;
      if (ui.fileSize)    ui.fileSize.textContent    = formatBytes(file.size);
      if (ui.dropZone)    ui.dropZone.hidden          = true;
      if (ui.settingsPanel) ui.settingsPanel.hidden   = false;
      if (ui.resultSection)  ui.resultSection.hidden  = true;
      if (ui.progressSection) ui.progressSection.hidden = true;
      if (ui.errorBox)    ui.errorBox.hidden          = true;
    }

    function resetAll() {
      selectedFile = null;
      if (ui.fileInput)  ui.fileInput.value  = '';
      if (ui.dropZone)   ui.dropZone.hidden   = false;
      if (ui.settingsPanel) ui.settingsPanel.hidden = true;
      if (ui.resultSection)  ui.resultSection.hidden  = true;
      if (ui.progressSection) ui.progressSection.hidden = true;
      if (ui.errorBox)   ui.errorBox.hidden   = true;
      setProgress(0, '');
    }

    if (ui.fileInput) {
      ui.fileInput.addEventListener('change', function () {
        if (this.files && this.files[0]) showFile(this.files[0]);
      });
    }

    if (ui.dropZone) {
      ui.dropZone.addEventListener('dragover',  function (e) { e.preventDefault(); this.classList.add('dragover'); });
      ui.dropZone.addEventListener('dragleave', function ()  { this.classList.remove('dragover'); });
      ui.dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('dragover');
        var f = e.dataTransfer.files[0];
        if (f) showFile(f);
      });
      ui.dropZone.addEventListener('click', function (e) {
        if (ui.fileInput && !e.target.closest('label')) ui.fileInput.click();
      });
      ui.dropZone.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && ui.fileInput) { e.preventDefault(); ui.fileInput.click(); }
      });
    }

    if (ui.clearBtn) ui.clearBtn.addEventListener('click', resetAll);

    if (ui.convertBtn) {
      ui.convertBtn.addEventListener('click', function () {
        if (!selectedFile) return;
        run(selectedFile);
      });
    }

    var convertAnotherBtn = document.getElementById('convertAnotherBtn');
    if (convertAnotherBtn) convertAnotherBtn.addEventListener('click', resetAll);
  });

})();
