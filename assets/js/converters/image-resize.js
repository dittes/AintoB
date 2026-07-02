/**
 * Image resizer — exact pixel dimensions or percentage scaling, canvas-based.
 * Accepts any raster format the browser can decode (JPG, PNG, WebP, GIF, BMP, AVIF, ICO).
 */
(function () {
  'use strict';

  var natural = { w: 0, h: 0 };

  function el(id) { return document.getElementById(id); }

  // ── Inject resize controls into the settings panel ─────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var settings = el('converterSettings');
    if (!settings || el('resizeControls')) return;

    var ctrl = document.createElement('div');
    ctrl.id = 'resizeControls';
    ctrl.className = 'mb-3';
    ctrl.innerHTML =
      '<label class="converter-label">Resize mode</label>' +
      '<div class="d-flex gap-4 mb-2">' +
      '  <label style="cursor:pointer;"><input type="radio" name="resizeMode" value="px" checked class="me-2">Pixels</label>' +
      '  <label style="cursor:pointer;"><input type="radio" name="resizeMode" value="pct" class="me-2">Percent</label>' +
      '</div>' +
      '<div id="resizePxRow" class="row g-2 align-items-end mb-2">' +
      '  <div class="col-5"><label class="converter-label" for="resizeW">Width (px)</label>' +
      '    <input type="number" id="resizeW" class="form-control" min="1" max="20000"></div>' +
      '  <div class="col-5"><label class="converter-label" for="resizeH">Height (px)</label>' +
      '    <input type="number" id="resizeH" class="form-control" min="1" max="20000"></div>' +
      '  <div class="col-2 text-center pb-2">' +
      '    <label style="cursor:pointer;font-size:var(--text-sm);white-space:nowrap;" title="Keep aspect ratio">' +
      '      <input type="checkbox" id="resizeLock" checked class="me-1">🔒</label></div>' +
      '</div>' +
      '<div id="resizePctRow" class="row g-2 mb-2" hidden>' +
      '  <div class="col-6"><label class="converter-label" for="resizePct">Scale (%)</label>' +
      '    <input type="number" id="resizePct" class="form-control" value="50" min="1" max="500"></div>' +
      '</div>' +
      '<label class="converter-label" for="resizeFormat">Output format</label>' +
      '<select id="resizeFormat" class="form-select">' +
      '  <option value="auto" selected>Same as input (PNG for GIF/BMP)</option>' +
      '  <option value="png">PNG (lossless)</option>' +
      '  <option value="jpg">JPG (smaller)</option>' +
      '  <option value="webp">WebP (modern)</option>' +
      '</select>' +
      '<p class="text-muted mt-1 mb-0" style="font-size:var(--text-sm);" id="resizeDims"></p>';

    var convertBtn = el('convertBtn');
    settings.insertBefore(ctrl, convertBtn);

    // Mode toggle
    ctrl.addEventListener('change', function (e) {
      if (e.target.name === 'resizeMode') {
        el('resizePxRow').hidden  = e.target.value !== 'px';
        el('resizePctRow').hidden = e.target.value !== 'pct';
      }
    });

    // Aspect-ratio lock
    el('resizeW').addEventListener('input', function () {
      if (el('resizeLock').checked && natural.w && this.value > 0) {
        el('resizeH').value = Math.max(1, Math.round(this.value * natural.h / natural.w));
      }
    });
    el('resizeH').addEventListener('input', function () {
      if (el('resizeLock').checked && natural.h && this.value > 0) {
        el('resizeW').value = Math.max(1, Math.round(this.value * natural.w / natural.h));
      }
    });

    // Pre-fill dimensions when a file is chosen (picker or drag-and-drop)
    var fileInput = el('fileInput');
    if (fileInput) fileInput.addEventListener('change', function () {
      if (this.files && this.files[0]) prefill(this.files[0]);
    });
    var dropZone = el('dropZone');
    if (dropZone) dropZone.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) prefill(f);
    });
  });

  function prefill(file) {
    loadImage(file).then(function (img) {
      natural.w = img.naturalWidth;
      natural.h = img.naturalHeight;
      el('resizeW').value = natural.w;
      el('resizeH').value = natural.h;
      el('resizeDims').textContent = 'Original size: ' + natural.w + ' × ' + natural.h + ' px';
      URL.revokeObjectURL(img.src);
    }).catch(function () { /* handled at convert time */ });
  }

  function loadImage(blob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload  = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not read this image. Is the file a valid image?')); };
      img.src = URL.createObjectURL(blob);
    });
  }

  var MIMES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

  window.performConversion = async function (input) {
    var img = await loadImage(input);
    natural.w = img.naturalWidth;
    natural.h = img.naturalHeight;

    var mode = document.querySelector('input[name="resizeMode"]:checked');
    var w, h;
    if (mode && mode.value === 'pct') {
      var pct = parseFloat(el('resizePct').value);
      if (!(pct > 0)) throw new Error('Enter a valid percentage.');
      w = Math.max(1, Math.round(natural.w * pct / 100));
      h = Math.max(1, Math.round(natural.h * pct / 100));
    } else {
      w = parseInt(el('resizeW').value, 10);
      h = parseInt(el('resizeH').value, 10);
      if (!(w > 0) || !(h > 0)) throw new Error('Enter a valid width and height in pixels.');
    }
    if (w * h > 100000000) throw new Error('Target size is too large — keep it under 100 megapixels.');

    // Output format
    var fmtSel = el('resizeFormat').value;
    var fmt = fmtSel;
    if (fmtSel === 'auto') {
      var ext = (input.name || '').split('.').pop().toLowerCase();
      fmt = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp' }[ext] || 'png';
    }

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (fmt === 'jpg') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);

    var blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, MIMES[fmt], fmt === 'png' ? undefined : 0.92);
    });
    if (!blob) throw new Error('Your browser could not encode the resized image.');

    var base = (input.name || 'image').replace(/\.[^.]+$/, '');
    return { blob: blob, filename: base + '-' + w + 'x' + h + '.' + fmt };
  };
})();
