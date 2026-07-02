/**
 * Image compressor — adjustable quality + optional downscale, canvas-based.
 * Accepts any raster format the browser can decode; outputs JPG or WebP
 * (lossy) — the formats that actually shrink photos.
 */
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ── Inject compression controls ────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var settings = el('converterSettings');
    if (!settings || el('compressControls')) return;

    var ctrl = document.createElement('div');
    ctrl.id = 'compressControls';
    ctrl.className = 'mb-3';
    ctrl.innerHTML =
      '<label class="converter-label" for="compressQ">Quality: <span id="compressQVal">70</span>%</label>' +
      '<input type="range" id="compressQ" class="form-range" min="10" max="95" step="5" value="70">' +
      '<div class="row g-2 mt-1">' +
      '  <div class="col-6">' +
      '    <label class="converter-label" for="compressFormat">Output format</label>' +
      '    <select id="compressFormat" class="form-select">' +
      '      <option value="jpg" selected>JPG (most compatible)</option>' +
      '      <option value="webp">WebP (smallest)</option>' +
      '    </select></div>' +
      '  <div class="col-6">' +
      '    <label class="converter-label" for="compressMaxW">Max width (optional)</label>' +
      '    <input type="number" id="compressMaxW" class="form-control" placeholder="e.g. 1920" min="1" max="20000"></div>' +
      '</div>';

    settings.insertBefore(ctrl, el('convertBtn'));

    el('compressQ').addEventListener('input', function () {
      el('compressQVal').textContent = this.value;
    });
  });

  function loadImage(blob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload  = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not read this image. Is the file a valid image?')); };
      img.src = URL.createObjectURL(blob);
    });
  }

  window.performConversion = async function (input) {
    var img = await loadImage(input);
    var w = img.naturalWidth, h = img.naturalHeight;

    var maxW = parseInt(el('compressMaxW').value, 10);
    if (maxW > 0 && w > maxW) {
      h = Math.max(1, Math.round(h * maxW / w));
      w = maxW;
    }

    var fmt     = el('compressFormat').value;
    var quality = parseInt(el('compressQ').value, 10) / 100;
    var mime    = fmt === 'webp' ? 'image/webp' : 'image/jpeg';

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (fmt === 'jpg') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);

    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, mime, quality); });
    if (!blob) throw new Error('Your browser could not encode the compressed image.');

    // Show the before/after size in the output panel
    var output = el('converterOutput');
    if (output) {
      var info = el('compressSizeInfo');
      if (!info) {
        info = document.createElement('p');
        info.id = 'compressSizeInfo';
        info.className = 'text-muted mb-2';
        info.style.fontSize = 'var(--text-sm)';
        output.insertBefore(info, output.querySelector('#downloadBtn'));
      }
      var saved = input.size > 0 ? Math.round((1 - blob.size / input.size) * 100) : 0;
      info.textContent = formatBytes(input.size) + ' → ' + formatBytes(blob.size) +
        (saved > 0 ? ' (' + saved + '% smaller)' : ' (no size reduction — try a lower quality)');
    }

    var base = (input.name || 'image').replace(/\.[^.]+$/, '');
    return { blob: blob, filename: base + '-compressed.' + fmt };
  };
})();
