/**
 * AintoB.com — Site JavaScript
 * Cookie consent · Converter UI · Fade-in · Drag-and-drop
 */
(function () {
  'use strict';

  // ── Cookie Banner ─────────────────────────────────────────
  const CONSENT_KEY = 'aintob_cookie_consent';

  function initCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;
    const existing = localStorage.getItem(CONSENT_KEY);
    if (!existing) banner.classList.add('show');
  }

  window.acceptCookies = function (level) {
    localStorage.setItem(CONSENT_KEY, level);
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.remove('show');
  };

  window.openCookieSettings = function () {
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.add('show');
  };

  // ── Converter Widget ──────────────────────────────────────
  function initConverterWidget() {
    const dropZone          = document.getElementById('dropZone');
    const fileInput         = document.getElementById('fileInput');
    const converterSettings = document.getElementById('converterSettings');
    const converterOutput   = document.getElementById('converterOutput');
    const selectedFileName  = document.getElementById('selectedFileName');
    const selectedFileSize  = document.getElementById('selectedFileSize');
    const clearFileBtn      = document.getElementById('clearFileBtn');
    const convertBtn        = document.getElementById('convertBtn');
    const downloadBtn       = document.getElementById('downloadBtn');
    const convertAnotherBtn = document.getElementById('convertAnotherBtn');

    // Text-mode elements (may not exist on file-only pages)
    const tabFile           = document.getElementById('tabFile');
    const tabPaste          = document.getElementById('tabPaste');
    const panelFile         = document.getElementById('panelFile');
    const panelPaste        = document.getElementById('panelPaste');
    const converterTextArea = document.getElementById('converterTextArea');
    const convertTextBtn    = document.getElementById('convertTextBtn');

    if (!dropZone && !converterTextArea) return;

    let selectedFile     = null;
    let lastResultBlob   = null;
    let lastResultName   = 'converted';

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function showFile(file) {
      selectedFile = file;
      if (selectedFileName) selectedFileName.textContent = file.name;
      if (selectedFileSize) selectedFileSize.textContent = formatBytes(file.size);
      if (dropZone) dropZone.hidden = true;
      if (converterSettings) converterSettings.hidden = false;
      if (converterOutput)   converterOutput.hidden = true;
    }

    function resetWidget() {
      selectedFile   = null;
      lastResultBlob = null;
      if (fileInput) fileInput.value = '';
      if (dropZone) dropZone.hidden = false;
      if (converterSettings) converterSettings.hidden = true;
      if (converterOutput)   converterOutput.hidden = true;
      if (converterTextArea) converterTextArea.value = '';
    }

    // ── Tab switching ────────────────────────────────────────
    function activateTab(which) {
      if (!tabFile || !tabPaste) return;
      if (which === 'file') {
        tabFile.classList.add('active');
        tabFile.setAttribute('aria-selected', 'true');
        tabPaste.classList.remove('active');
        tabPaste.setAttribute('aria-selected', 'false');
        if (panelFile)  panelFile.hidden  = false;
        if (panelPaste) panelPaste.hidden = true;
      } else {
        tabPaste.classList.add('active');
        tabPaste.setAttribute('aria-selected', 'true');
        tabFile.classList.remove('active');
        tabFile.setAttribute('aria-selected', 'false');
        if (panelPaste) panelPaste.hidden = false;
        if (panelFile)  panelFile.hidden  = true;
        if (converterSettings) converterSettings.hidden = true;
        if (converterOutput)   converterOutput.hidden   = true;
      }
    }

    if (tabFile)  tabFile.addEventListener('click',  function () { activateTab('file');  });
    if (tabPaste) tabPaste.addEventListener('click',  function () { activateTab('paste'); });

    // ── File input ───────────────────────────────────────────
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (this.files && this.files[0]) showFile(this.files[0]);
      });
    }

    // ── Drag & drop ──────────────────────────────────────────
    if (dropZone) {
      dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        this.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', function () {
        this.classList.remove('dragover');
      });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) showFile(file);
      });
      dropZone.addEventListener('click', function (e) {
        if (fileInput && e.target !== fileInput) fileInput.click();
      });
      dropZone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (fileInput) fileInput.click(); }
      });
    }

    // ── Clear ────────────────────────────────────────────────
    if (clearFileBtn) clearFileBtn.addEventListener('click', resetWidget);

    // ── Shared conversion runner ─────────────────────────────
    async function runConversion(input, buttonEl) {
      if (!window.performConversion) {
        showToast('Converter not available for this format yet.', 'error');
        return;
      }
      const origHtml = buttonEl.innerHTML;
      buttonEl.disabled = true;
      buttonEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Converting…';

      try {
        const result = await window.performConversion(input);
        lastResultBlob = result.blob;
        lastResultName = result.filename || 'converted';

        if (buttonEl === convertBtn) {
          if (converterSettings) converterSettings.hidden = true;
        }
        if (converterOutput) converterOutput.hidden = false;
      } catch (err) {
        showToast('Conversion failed: ' + (err.message || 'Unknown error'), 'error');
      } finally {
        buttonEl.disabled = false;
        buttonEl.innerHTML = origHtml;
      }
    }

    // ── File-mode convert button ─────────────────────────────
    if (convertBtn) {
      convertBtn.addEventListener('click', function () {
        if (!selectedFile) return;
        runConversion(selectedFile, convertBtn);
      });
    }

    // ── Text-mode convert button ─────────────────────────────
    if (convertTextBtn) {
      convertTextBtn.addEventListener('click', function () {
        const text = converterTextArea ? converterTextArea.value.trim() : '';
        if (!text) { showToast('Please paste some text first.', 'info'); return; }
        runConversion(text, convertTextBtn);
      });
    }

    // ── Download ─────────────────────────────────────────────
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        if (!lastResultBlob) { showToast('Nothing to download yet.', 'info'); return; }
        const url = URL.createObjectURL(lastResultBlob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = lastResultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('File downloaded.', 'success');
      });
    }

    // ── Convert another ──────────────────────────────────────
    if (convertAnotherBtn) convertAnotherBtn.addEventListener('click', resetWidget);
  }

  // ── Swap button ───────────────────────────────────────────
  function initSwapButton() {
    const swapBtn = document.getElementById('swapBtn');
    if (!swapBtn) return;
    swapBtn.addEventListener('click', function () {
      showToast('Use the reverse converter link below to swap directions.', 'info');
    });
    swapBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
    });
  }

  // ── Toast ─────────────────────────────────────────────────
  function showToast(msg, type) {
    const existing = document.getElementById('aintob-toast');
    if (existing) existing.remove();

    const t = document.createElement('div');
    t.id = 'aintob-toast';
    const icons  = { success: 'bi-check-circle-fill', info: 'bi-info-circle-fill', error: 'bi-x-circle-fill' };
    const colors = { success: '#16a34a', info: 'var(--color-accent)', error: '#dc2626' };
    t.style.cssText = `position:fixed;bottom:5rem;right:1rem;z-index:9999;background:#fff;
      border:1px solid var(--color-border);border-radius:var(--radius-md);padding:.75rem 1rem;
      box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:.625rem;max-width:320px;
      font-size:var(--text-sm);animation:fadeUp .25s ease;`;
    t.innerHTML = `<i class="bi ${icons[type] || icons.info}" style="color:${colors[type]};font-size:1rem;" aria-hidden="true"></i>
      <span>${msg}</span>
      <button onclick="this.parentElement.remove()" aria-label="Close" style="margin-left:auto;background:none;border:none;cursor:pointer;padding:0;color:var(--color-text-light);">
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>`;
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentElement) t.remove(); }, 4000);
  }

  // ── Fade-in Observer ──────────────────────────────────────
  function initFadeIn() {
    const els = document.querySelectorAll('.fade-in');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    els.forEach(el => observer.observe(el));
  }

  // ── Init ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    initCookieBanner();
    initConverterWidget();
    initSwapButton();
    initFadeIn();
  });

})();
