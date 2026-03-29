/**
 * PDF Editor — merge, split, rotate, delete pages, add watermark
 *
 * This is a standalone multi-tool that does NOT use the standard site.js
 * converter widget. The HTML page provides its own UI with tool tabs.
 *
 * Requires pdf-lib (loaded via CDN on the page).
 */

(function () {
  'use strict';

  // ── Shared helpers ─────────────────────────────────────────────────────────

  function formatBytes(b) {
    if (b < 1024)    return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
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

  function showResult(sectionId, msg, blob, filename) {
    var section = document.getElementById(sectionId);
    if (!section) return;
    var msgEl   = section.querySelector('.result-msg');
    var dlBtn   = section.querySelector('.result-download-btn');
    if (msgEl)  msgEl.innerHTML = '<i class="bi bi-check-circle-fill text-success me-2"></i>' + msg;
    if (dlBtn && blob) {
      dlBtn.onclick = function () { triggerDownload(blob, filename); };
      dlBtn.hidden  = false;
      // Auto-download
      triggerDownload(blob, filename);
    }
    section.hidden = false;
  }

  function showToolError(sectionId, msg) {
    var el = document.getElementById(sectionId);
    if (el) { el.textContent = msg; el.hidden = false; }
  }

  function setBtn(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn._orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing…';
    } else {
      btn.disabled = false;
      if (btn._orig) btn.innerHTML = btn._orig;
    }
  }

  function getPDFLib() {
    if (!window.PDFLib) throw new Error('pdf-lib not loaded. Reload the page and try again.');
    return window.PDFLib;
  }

  // ── Parse page range string e.g. "1-3,5,7-9" → 0-indexed array ──────────
  function parsePageRange(rangeStr, numPages) {
    var result = [];
    var seen   = {};
    var parts  = rangeStr.split(',');
    for (var i = 0; i < parts.length; i++) {
      var part  = parts[i].trim();
      var match = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!match) throw new Error('Invalid page range: "' + part + '". Use e.g. "1-3,5,7".');
      var from = parseInt(match[1]);
      var to   = match[2] ? parseInt(match[2]) : from;
      if (from < 1 || to > numPages || from > to) {
        throw new Error('Page range "' + part + '" is out of bounds (1–' + numPages + ').');
      }
      for (var p = from; p <= to; p++) {
        if (!seen[p]) { result.push(p - 1); seen[p] = true; } // convert to 0-indexed
      }
    }
    if (!result.length) throw new Error('No valid pages in range.');
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOL 1: MERGE
  // ═══════════════════════════════════════════════════════════════
  async function runMerge() {
    var input    = document.getElementById('mergeFiles');
    var btn      = document.getElementById('mergePDFBtn');
    var errorEl  = document.getElementById('mergeError');
    var resultEl = document.getElementById('mergeResult');

    if (errorEl)  errorEl.hidden  = true;
    if (resultEl) resultEl.hidden = true;

    if (!input || !input.files || input.files.length < 2) {
      showToolError('mergeError', 'Please select at least 2 PDF files to merge.');
      return;
    }

    setBtn(btn, true);
    try {
      var PDFLib  = getPDFLib();
      var merged  = await PDFLib.PDFDocument.create();

      for (var i = 0; i < input.files.length; i++) {
        var ab  = await input.files[i].arrayBuffer();
        var src = await PDFLib.PDFDocument.load(ab);
        var pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(function (p) { merged.addPage(p); });
      }

      var bytes = await merged.save();
      var blob  = new Blob([bytes], { type: 'application/pdf' });
      showResult('mergeResult', 'Merged ' + input.files.length + ' PDFs into one file.', blob, 'merged.pdf');

    } catch (err) {
      showToolError('mergeError', 'Merge failed: ' + err.message);
    } finally {
      setBtn(btn, false);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOL 2: SPLIT
  // ═══════════════════════════════════════════════════════════════
  async function runSplit() {
    var fileInput = document.getElementById('splitFile');
    var rangeInput = document.getElementById('splitRange');
    var btn       = document.getElementById('splitPDFBtn');
    var errorEl   = document.getElementById('splitError');
    var resultEl  = document.getElementById('splitResult');
    var pageCount = document.getElementById('splitPageCount');

    if (errorEl)  errorEl.hidden  = true;
    if (resultEl) resultEl.hidden = true;

    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      showToolError('splitError', 'Please upload a PDF first.');
      return;
    }
    var rangeStr = rangeInput ? rangeInput.value.trim() : '';
    if (!rangeStr) {
      showToolError('splitError', 'Please enter a page range (e.g. "1-3,5").');
      return;
    }

    setBtn(btn, true);
    try {
      var PDFLib = getPDFLib();
      var ab     = await fileInput.files[0].arrayBuffer();
      var srcDoc = await PDFLib.PDFDocument.load(ab);
      var total  = srcDoc.numPages;

      if (pageCount) pageCount.textContent = '(' + total + ' pages total)';

      var indices = parsePageRange(rangeStr, total);
      var newDoc  = await PDFLib.PDFDocument.create();
      var pages   = await newDoc.copyPages(srcDoc, indices);
      pages.forEach(function (p) { newDoc.addPage(p); });

      var bytes   = await newDoc.save();
      var blob    = new Blob([bytes], { type: 'application/pdf' });
      showResult('splitResult', 'Extracted ' + indices.length + ' page(s) into a new PDF.', blob, 'split.pdf');

    } catch (err) {
      showToolError('splitError', 'Split failed: ' + err.message);
    } finally {
      setBtn(btn, false);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOL 3: ROTATE & DELETE PAGES
  // ═══════════════════════════════════════════════════════════════

  var rotatePdfDoc = null;
  var rotateSrcBytes = null;

  async function loadRotateFile(file) {
    var PDFLib = getPDFLib();
    rotateSrcBytes = await file.arrayBuffer();
    rotatePdfDoc   = await PDFLib.PDFDocument.load(rotateSrcBytes.slice(0));

    var thumbContainer = document.getElementById('pageThumbs');
    if (!thumbContainer) return;
    thumbContainer.innerHTML = '';

    for (var i = 0; i < rotatePdfDoc.numPages; i++) {
      var thumb = document.createElement('div');
      thumb.className = 'page-thumb';
      thumb.dataset.pageIndex = i;
      thumb.innerHTML = [
        '<span class="page-thumb__num">Page ' + (i + 1) + '</span>',
        '<div class="page-thumb__actions">',
        '  <button class="btn btn-sm btn-outline-secondary" data-action="ccw" data-page="' + i + '" title="Rotate 90° CCW">↺ 90°</button>',
        '  <button class="btn btn-sm btn-outline-secondary" data-action="cw"  data-page="' + i + '" title="Rotate 90° CW">↻ 90°</button>',
        '  <button class="btn btn-sm btn-outline-danger"    data-action="del" data-page="' + i + '" title="Delete page">✕ Delete</button>',
        '</div>'
      ].join('');
      thumbContainer.appendChild(thumb);
    }

    var container = document.getElementById('rotatePanel');
    if (container) container.hidden = false;
  }

  function applyRotateAndDelete() {
    var rotateFile = document.getElementById('rotateFile');
    var btn        = document.getElementById('rotateApplyBtn');
    var errorEl    = document.getElementById('rotateError');
    var resultEl   = document.getElementById('rotateResult');

    if (errorEl)  errorEl.hidden  = true;
    if (resultEl) resultEl.hidden = true;

    if (!rotatePdfDoc) {
      showToolError('rotateError', 'Please upload a PDF first.');
      return;
    }

    // Read the per-page actions from the UI
    var thumbs   = document.querySelectorAll('.page-thumb');
    var rotations = {};   // pageIndex → cumulative degrees
    var deleted   = {};   // pageIndex → true

    thumbs.forEach(function (t) {
      var idx = parseInt(t.dataset.pageIndex);
      rotations[idx] = rotations[idx] || 0;
      // Actions are applied live in UI; read from data attributes
      var r = parseInt(t.dataset.rotation || 0);
      rotations[idx] = r;
      if (t.dataset.deleted === 'true') deleted[idx] = true;
    });

    setBtn(btn, true);

    (async function () {
      try {
        var PDFLib = getPDFLib();
        var srcDoc = await PDFLib.PDFDocument.load(rotateSrcBytes.slice(0));
        var newDoc = await PDFLib.PDFDocument.create();

        for (var i = 0; i < srcDoc.numPages; i++) {
          if (deleted[i]) continue; // skip deleted pages
          var [page] = await newDoc.copyPages(srcDoc, [i]);
          var rot = rotations[i] || 0;
          if (rot !== 0) {
            var currentRot = page.getRotation().angle;
            page.setRotation(PDFLib.degrees((currentRot + rot + 360) % 360));
          }
          newDoc.addPage(page);
        }

        var bytes = await newDoc.save();
        var blob  = new Blob([bytes], { type: 'application/pdf' });
        var kept  = srcDoc.numPages - Object.keys(deleted).length;
        showResult('rotateResult', 'Done — ' + kept + ' page(s) saved.', blob, 'edited.pdf');
      } catch (err) {
        showToolError('rotateError', 'Processing failed: ' + err.message);
      } finally {
        setBtn(btn, false);
      }
    })();
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOL 4: WATERMARK
  // ═══════════════════════════════════════════════════════════════
  async function runWatermark() {
    var fileInput  = document.getElementById('watermarkFile');
    var textInput  = document.getElementById('watermarkText');
    var opInput    = document.getElementById('watermarkOpacity');
    var colorInput = document.getElementById('watermarkColor');
    var btn        = document.getElementById('watermarkBtn');
    var errorEl    = document.getElementById('watermarkError');
    var resultEl   = document.getElementById('watermarkResult');

    if (errorEl)  errorEl.hidden  = true;
    if (resultEl) resultEl.hidden = true;

    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      showToolError('watermarkError', 'Please upload a PDF first.');
      return;
    }
    var text = textInput ? textInput.value.trim() : 'CONFIDENTIAL';
    if (!text) text = 'CONFIDENTIAL';

    var opacity = parseFloat(opInput ? opInput.value : 0.25);
    if (isNaN(opacity) || opacity < 0.05) opacity = 0.05;
    if (opacity > 1) opacity = 1;

    // Parse hex colour
    var hex   = (colorInput ? colorInput.value : '#cc0000').replace('#', '');
    var r     = parseInt(hex.substring(0, 2), 16) / 255;
    var g     = parseInt(hex.substring(2, 4), 16) / 255;
    var b2    = parseInt(hex.substring(4, 6), 16) / 255;

    setBtn(btn, true);
    try {
      var PDFLib = getPDFLib();
      var ab     = await fileInput.files[0].arrayBuffer();
      var pdfDoc = await PDFLib.PDFDocument.load(ab);
      var font   = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      var pages  = pdfDoc.getPages();
      var FONT_SIZE = 56;

      pages.forEach(function (page) {
        var w   = page.getWidth();
        var h   = page.getHeight();
        var tw  = font.widthOfTextAtSize(text, FONT_SIZE);
        var th  = font.heightAtSize(FONT_SIZE);
        var cx  = w  / 2 - tw / 2;
        var cy  = h  / 2 - th / 2;

        page.drawText(text, {
          x:       cx,
          y:       cy,
          size:    FONT_SIZE,
          font:    font,
          color:   PDFLib.rgb(r, g, b2),
          opacity: opacity,
          rotate:  PDFLib.degrees(-45)
        });
      });

      var bytes = await pdfDoc.save();
      var blob  = new Blob([bytes], { type: 'application/pdf' });
      showResult('watermarkResult', 'Watermark "' + text + '" applied to ' + pages.length + ' page(s).', blob, 'watermarked.pdf');
    } catch (err) {
      showToolError('watermarkError', 'Watermark failed: ' + err.message);
    } finally {
      setBtn(btn, false);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', function () {

    // ── Tool tab switching ─────────────────────────────────────────────────
    var tabs = document.querySelectorAll('[data-pdf-tool-tab]');
    var panels = document.querySelectorAll('[data-pdf-tool-panel]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        panels.forEach(function (p) { p.hidden = true; });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        var target = document.querySelector('[data-pdf-tool-panel="' + tab.dataset.pdfToolTab + '"]');
        if (target) target.hidden = false;
      });
    });

    // ── Merge ──────────────────────────────────────────────────────────────
    var mergeBtn = document.getElementById('mergePDFBtn');
    if (mergeBtn) mergeBtn.addEventListener('click', runMerge);

    // File count label
    var mergeFiles = document.getElementById('mergeFiles');
    if (mergeFiles) {
      mergeFiles.addEventListener('change', function () {
        var label = document.getElementById('mergeFileCount');
        if (label) {
          label.textContent = this.files.length
            ? this.files.length + ' file(s) selected'
            : 'No files selected';
        }
      });
    }

    // ── Split ──────────────────────────────────────────────────────────────
    var splitBtn = document.getElementById('splitPDFBtn');
    if (splitBtn) splitBtn.addEventListener('click', runSplit);

    // Show page count when split file chosen
    var splitFile = document.getElementById('splitFile');
    if (splitFile) {
      splitFile.addEventListener('change', async function () {
        if (!this.files || !this.files[0]) return;
        try {
          var PDFLib = getPDFLib();
          var ab     = await this.files[0].arrayBuffer();
          var doc    = await PDFLib.PDFDocument.load(ab);
          var el     = document.getElementById('splitPageCount');
          if (el) el.textContent = '(' + doc.numPages + ' pages total)';
        } catch (e) { /* ignore */ }
      });
    }

    // ── Rotate / Delete ────────────────────────────────────────────────────
    var rotateFile = document.getElementById('rotateFile');
    if (rotateFile) {
      rotateFile.addEventListener('change', async function () {
        if (!this.files || !this.files[0]) return;
        try { await loadRotateFile(this.files[0]); } catch (e) {
          showToolError('rotateError', 'Failed to load PDF: ' + e.message);
        }
      });
    }

    // Delegate thumb action buttons
    var thumbContainer = document.getElementById('pageThumbs');
    if (thumbContainer) {
      thumbContainer.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;
        var idx    = parseInt(btn.dataset.page);
        var thumb  = thumbContainer.querySelector('.page-thumb[data-page-index="' + idx + '"]');
        if (!thumb) return;

        if (action === 'del') {
          thumb.dataset.deleted = 'true';
          thumb.style.opacity   = '0.35';
          thumb.style.textDecoration = 'line-through';
          btn.textContent = '✓ Deleted';
          btn.disabled    = true;
          // Add undo button
          var undo = document.createElement('button');
          undo.className   = 'btn btn-sm btn-outline-secondary ms-1';
          undo.textContent = 'Undo';
          undo.addEventListener('click', function () {
            thumb.dataset.deleted = 'false';
            thumb.style.opacity   = '';
            thumb.style.textDecoration = '';
            btn.textContent = '✕ Delete';
            btn.disabled    = false;
            undo.remove();
          });
          btn.parentNode.appendChild(undo);
        } else {
          var currentRot = parseInt(thumb.dataset.rotation || 0);
          var delta      = (action === 'cw') ? 90 : -90;
          thumb.dataset.rotation = (currentRot + delta + 360) % 360;
          var label = thumb.querySelector('.page-thumb__num');
          if (label) {
            var base = 'Page ' + (idx + 1);
            var rot  = parseInt(thumb.dataset.rotation);
            label.textContent = rot ? base + ' (rotated ' + rot + '°)' : base;
          }
        }
      });
    }

    var rotateApplyBtn = document.getElementById('rotateApplyBtn');
    if (rotateApplyBtn) rotateApplyBtn.addEventListener('click', applyRotateAndDelete);

    // ── Watermark ──────────────────────────────────────────────────────────
    var watermarkBtn = document.getElementById('watermarkBtn');
    if (watermarkBtn) watermarkBtn.addEventListener('click', runWatermark);

  }); // DOMContentLoaded

})();
