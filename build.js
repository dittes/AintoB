#!/usr/bin/env node
/**
 * AintoB.com — multilingual static site generator (plain Node, no dependencies).
 *
 *   node build.js
 *
 * Reads page_map.csv (page list + English SEO copy) and the locale modules in
 * i18n/, then writes every page once per language under /<lang>/ (en, de, cs, pl),
 * plus: the language router at /, redirect stubs for the pre-i18n URLs,
 * sitemap.xml (with hreflang alternates), robots.txt and a _redirects file.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./lib/csv');
const { getConverterConfig } = require('./lib/converters');
const tpl = require('./lib/tpl');
const { check: checkI18n } = require('./lib/check-i18n');
const { LANGS, DEFAULT_LANG, loadLocale } = require('./i18n');

const ROOT = __dirname;
const DOMAIN = 'https://aintob.com';
// Sister site for opening (not converting) files. Point this at a deeper URL
// (e.g. per-format pages) once open-online.com has them.
const OPEN_ONLINE_URL = 'https://open-online.com/';
const YEAR = new Date().getFullYear();
const TODAY = new Date().toISOString().split('T')[0];

// ─── Locale state ─────────────────────────────────────────────────────────────
const LOCALES = Object.fromEntries(LANGS.map(m => [m.code, loadLocale(m)]));
let LANG = DEFAULT_LANG;
let L = LOCALES[LANG];

function setLang(code) { LANG = code; L = LOCALES[code]; }

/** Localised string with {placeholders}. Throws on a missing key so no page ships half-translated. */
function s(key, vars) {
  const str = L.s[key];
  if (str === undefined) throw new Error(`Missing string "${key}" for language "${LANG}"`);
  return vars ? str.replace(/\{(\w+)\}/g, (m, n) => (vars[n] !== undefined ? vars[n] : m)) : str;
}

/** Language-prefixed internal URL for a language-neutral slug. */
const u = slug => `/${LANG}${slug}`;
/** Absolute URL for a slug in a given language. */
const abs = (slug, lang) => `${DOMAIN}/${lang || LANG}${slug}`;

// ─── Generic helpers ──────────────────────────────────────────────────────────
function writeFile(relPath, content) {
  const full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}
const slugToPath = slug => slug.replace(/^\//, '') + 'index.html';
const esc = str => String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = h => String(h).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const firstSentence = t => { if (!t) return ''; const m = t.match(/^[\s\S]*?[.!?](?=\s|$)/); return m ? m[0] : t; };

const HUB = {
  image: '/image-converter/', document: '/document-converter/', spreadsheet: '/spreadsheet-converter/',
  audio: '/audio-converter/', video: '/video-converter/', data: '/data-converter/',
};
const CATS = Object.keys(HUB);
const ICON = { image: '🖼️', document: '📄', spreadsheet: '📊', audio: '🎵', video: '🎬', data: '🧰', all: '🔄' };
const catBase = page => (page['Category'] || '').split('→')[0];
const categoryHub = base => HUB[base] || '/file-converter/';

function fmtKey(name) {
  if (!name) return '';
  const n = name.trim();
  const aliases = { JPEG: 'JPG', HEIF: 'HEIC', DOCX: 'Word', DOC: 'Word', XLSX: 'Excel', XLS: 'Excel', HTM: 'HTML', MD: 'Markdown', TIF: 'TIFF', OGV: 'OGG' };
  return aliases[n.toUpperCase()] || n.charAt(0).toUpperCase() + n.slice(1);
}
const fmtInfo = f => L.formats[fmtKey(f)] || {};
/** Display name of a format (pseudo-formats like "Text" or "Image" are translated). */
const fname = f => (L.fmtNames && L.fmtNames[f]) || f;

/**
 * SEO text (name/title/meta/h1) of a page in the current language.
 * English comes from page_map.csv; other languages are built from templates in the
 * locale (ordinary pages) or from the locale's `tools` table (special tools).
 */
function pageText(page) {
  const slug = page['URL Slug'];
  if (L.tools[slug]) return L.tools[slug];
  if (LANG === DEFAULT_LANG) {
    return { name: page['Page Name'], title: page['SEO Title'], meta: page['Meta Description'], h1: page['H1'] };
  }
  const type = page['Page Type'];
  const cb = catBase(page);
  if (type === 'Master Hub') return L.pages.master;
  if (type === 'Category Hub') return L.cat[cb].hub;
  if (type === 'Format Hub') {
    const fmt = page['Source Format'];
    return { name: s('hubName', { fmt }), title: s('hubTitle', { fmt }), meta: s('hubMeta', { fmt }), h1: s('hubH1', { fmt }) };
  }
  if (type === 'Pair') {
    const from = fname(page['Source Format']), to = fname(page['Target Format']);
    const benefit = L.benefit[cb];
    if (!benefit || from === to) throw new Error(`No ${LANG} text for ${slug} (add it to tools{})`);
    return { name: s('pairName', { from, to }), title: s('pairTitle', { from, to }), meta: s('pairMeta', { from, to, benefit }), h1: s('pairH1', { from, to }) };
  }
  throw new Error(`No ${LANG} text for ${slug}`);
}

const robotsFor = page => (page['Indexation'] === 'Index now' ? 'index, follow' : 'noindex, follow');
const nameOf = page => pageText(page).name;

// ─── HTML components ──────────────────────────────────────────────────────────
function head({ title, desc, slug, robots, schema, ogTitle, extraHead }) {
  const robo = robots || 'index, follow';
  const og = ogTitle || title;
  const indexed = !/noindex/.test(robo);
  const alternates = indexed
    ? LANGS.map(l => `  <link rel="alternate" hreflang="${l.htmlLang}" href="${abs(slug, l.code)}">`).join('\n') +
      `\n  <link rel="alternate" hreflang="x-default" href="${abs(slug, DEFAULT_LANG)}">`
    : '';
  const ogAlt = LANGS.filter(l => l.code !== LANG)
    .map(l => `  <meta property="og:locale:alternate" content="${l.ogLocale}">`).join('\n');
  return `<!DOCTYPE html>
<html lang="${L.meta.htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="${robo}">
  <link rel="canonical" href="${abs(slug)}">
${alternates}

  <!-- Open Graph -->
  <meta property="og:title" content="${esc(og)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${abs(slug)}">
  <meta property="og:locale" content="${L.meta.ogLocale}">
${ogAlt}
  <meta property="og:image" content="${DOMAIN}/assets/img/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(og)}">
  <meta name="twitter:description" content="${esc(desc)}">

  <!-- Preconnect -->
  <link rel="preconnect" href="https://cdn.jsdelivr.net">

  <!-- Styles -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/site.css">
${extraHead || ''}
  <!-- Schema -->
  ${schema ? `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>` : ''}
</head>
<body>`;
}

const skipLink = () => `<a class="skip-link" href="#main-content">${esc(s('skip'))}</a>`;

function langSwitch(slug) {
  const items = LANGS.map(l => `<li><a href="/${l.code}${slug}" hreflang="${l.htmlLang}" lang="${l.htmlLang}" data-lang="${l.code}"${l.code === LANG ? ' aria-current="true"' : ''}>${l.name}</a></li>`).join('');
  return `<details class="lang-switch">
        <summary aria-label="${esc(s('langLabel'))}"><i class="bi bi-translate" aria-hidden="true"></i> <span>${L.meta.short}</span></summary>
        <ul>${items}</ul>
      </details>`;
}

function navbar(slug) {
  return `<nav class="navbar-aintob" aria-label="${esc(s('navMain'))}">
  <div class="container navbar-inner" style="max-width:var(--max-width);">
    <a href="${u('/')}" class="navbar-logo" aria-label="${esc(s('logoAria'))}">🅰️➡️🅱️ <span style="font-size:1rem; font-weight:500; color:var(--color-text-muted);">AintoB</span></a>
    <div class="navbar-actions">
      <a href="${OPEN_ONLINE_URL}" class="navbar-tools-link navbar-open" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> <span class="nav-label">${esc(s('openFiles'))}</span><span class="visually-hidden"> ${esc(s('newTab'))}</span></a>
      <a href="${u('/file-converter/')}" class="navbar-tools-link"><i class="bi bi-grid-3x3-gap" aria-hidden="true"></i> <span class="nav-label">${esc(s('allConverters'))}</span></a>
      ${langSwitch(slug)}
    </div>
  </div>
</nav>`;
}

/** items: [{label, href}] with language-neutral hrefs; "Home" is prepended. */
function breadcrumbs(items) {
  const all = [{ label: s('home'), href: '/' }, ...items];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.label, item: abs(it.href) })),
  };
  const html = all.map((it, i) => (i === all.length - 1
    ? `<li class="breadcrumb-item active" aria-current="page">${esc(it.label)}</li>`
    : `<li class="breadcrumb-item"><a href="${u(it.href)}">${esc(it.label)}</a></li>`)).join('\n      ');
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>
<nav aria-label="${esc(s('breadcrumbAria'))}" class="breadcrumb-nav">
  <div class="container" style="max-width:var(--max-width);">
    <ol class="breadcrumb mb-0" style="padding: 0.625rem 0; font-size: var(--text-sm);">
      ${html}
    </ol>
  </div>
</nav>`;
}

function privacyBlock() {
  return `<div class="privacy-block">
  <div class="privacy-block__inner">
    <span class="privacy-icon" aria-hidden="true">🔒</span>
    <div>
      <strong>${esc(s('privTitle'))}</strong>
      <p>${esc(s('privText'))}</p>
    </div>
  </div>
</div>`;
}

/** Callout linking to open-online.com. `fmt` = a real file format, or null for the generic variant. */
function openOnlineBox(fmt) {
  const title = fmt ? s('ooTitleFmt', { fmt: esc(fmt) }) : s('ooTitleGeneric');
  return `<aside class="open-online" aria-label="open-online.com">
  <div class="container" style="max-width:800px;">
    <div class="open-online__inner">
      <span class="open-online__icon" aria-hidden="true">📂</span>
      <div class="open-online__text">
        <strong>${title}</strong>
        <p>${esc(s('ooText'))}</p>
      </div>
      <a class="btn btn-outline-secondary open-online__btn" href="${OPEN_ONLINE_URL}" target="_blank" rel="noopener">${esc(s('ooButton'))} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i><span class="visually-hidden"> ${esc(s('newTab'))}</span></a>
    </div>
  </div>
</aside>`;
}

function featureCards() {
  const features = [
    { icon: 'bi-lightning-charge-fill', title: s('feat1Title'), text: s('feat1Text') },
    { icon: 'bi-shield-lock-fill', title: s('feat2Title'), text: s('feat2Text') },
    { icon: 'bi-phone', title: s('feat3Title'), text: s('feat3Text') },
    { icon: 'bi-star-fill', title: s('feat4Title'), text: s('feat4Text') },
  ];
  return `<section class="section-features" aria-labelledby="why-aintob">
  <div class="container" style="max-width:var(--max-width);">
    <div class="text-center mb-5">
      <p class="section-label">${esc(s('whyLabel'))}</p>
      <h2 class="section-title" id="why-aintob">${esc(s('whyTitle'))}</h2>
      <p class="section-sub mx-auto">${esc(s('whySub'))}</p>
    </div>
    <div class="row g-4">
      ${features.map(f => `<div class="col-sm-6 col-lg-3">
        <div class="feature-card">
          <div class="feature-icon mx-auto"><i class="bi ${f.icon}" aria-hidden="true"></i></div>
          <h3 class="feature-title">${esc(f.title)}</h3>
          <p class="feature-text">${esc(f.text)}</p>
        </div>
      </div>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

function faqBlock(faqs) {
  const schema = {
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: L.meta.htmlLang,
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) } })),
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>
<section class="section-faq" aria-labelledby="faq-heading">
  <div class="container" style="max-width:800px;">
    <div class="text-center mb-5">
      <p class="section-label">${esc(s('faqLabel'))}</p>
      <h2 class="section-title" id="faq-heading">${esc(s('faqTitle'))}</h2>
    </div>
    <div class="accordion" id="faqAccordion">
      ${faqs.map((f, i) => `<div class="accordion-item">
        <h3 class="accordion-header">
          <button class="accordion-button${i ? ' collapsed' : ''}" type="button" data-bs-toggle="collapse" data-bs-target="#faq${i}" aria-expanded="${i ? 'false' : 'true'}">
            ${esc(f.q)}
          </button>
        </h3>
        <div id="faq${i}" class="accordion-collapse collapse${i ? '' : ' show'}" data-bs-parent="#faqAccordion">
          <div class="accordion-body">${f.a}</div>
        </div>
      </div>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

function footer(slug, extraLinks, extraScripts) {
  const links = [
    { label: s('allConverters'), href: u('/file-converter/') },
    ...CATS.map(c => ({ label: L.cat[c].converters, href: u(HUB[c]) })),
    ...(extraLinks || []).map(l => ({ label: l.label, href: u(l.href) })),
    { label: s('privacyPolicy'), href: u('/privacy/') },
    { label: s('imprint'), href: u('/imprint/') },
    { label: s('footerOpenOnline'), href: OPEN_ONLINE_URL, external: true },
  ];
  const langLinks = LANGS.map(l => `<a href="/${l.code}${slug}" hreflang="${l.htmlLang}" lang="${l.htmlLang}" data-lang="${l.code}"${l.code === LANG ? ' aria-current="true"' : ''}>${l.name}</a>`).join(' · ');
  const dict = LANG === DEFAULT_LANG ? '' : `<script src="/assets/js/lang/${LANG}.js" defer></script>\n`;
  return `<footer class="footer-main" role="contentinfo">
  <div class="container" style="max-width:var(--max-width);">
    <div class="d-flex flex-wrap align-items-start justify-content-between gap-4">
      <div>
        <a href="${u('/')}" class="footer-logo" aria-label="${esc(s('logoAria'))}">🅰️➡️🅱️ AintoB</a>
        <p class="footer-copy">${esc(s('footerCopy', { year: YEAR }))}</p>
        <p class="footer-gdpr-badge"><i class="bi bi-shield-check" aria-hidden="true"></i> ${esc(s('footerBadge'))}</p>
        <p class="footer-langs"><span>${esc(s('langFooter'))}:</span> ${langLinks}</p>
      </div>
      <nav aria-label="${esc(s('navFooter'))}">
        <ul class="footer-links">
          ${links.map(l => `<li><a href="${l.href}"${l.external ? ' target="_blank" rel="noopener"' : ''}>${esc(l.label)}</a></li>`).join('\n          ')}
        </ul>
      </nav>
    </div>
  </div>
</footer>

<!-- Cookie Banner -->
<div id="cookie-banner" role="dialog" aria-label="${esc(s('cookieAria'))}" aria-live="polite">
  <div class="container" style="max-width:var(--max-width); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:1rem;">
    <p class="cookie-text mb-0">${esc(s('cookieText'))} <a href="${u('/privacy/')}">${esc(s('privacyPolicy'))}</a></p>
    <div style="display:flex; gap:.5rem;">
      <button class="btn btn-primary btn-sm" onclick="acceptCookies('all')">${esc(s('acceptAll'))}</button>
      <button class="btn btn-outline-secondary btn-sm" onclick="acceptCookies('essential')">${esc(s('essentialOnly'))}</button>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>
${dict}<script src="/assets/js/site.js" defer></script>
${(extraScripts || []).map(x => `<script src="${x}" defer></script>`).join('\n')}
</body>
</html>`;
}

// ─── Converter widget ─────────────────────────────────────────────────────────
// opts: { action?: string (button label for single-format tools), engineNote?: bool }
function converterWidget(from, to, textMode, opts) {
  opts = opts || {};
  const fromInfo = fmtInfo(from);
  const fromLower = (from || 'file').toLowerCase();
  const F = esc(fname(from)), T = esc(fname(to));
  const sameFmt = from === to;
  const action = esc(opts.action || s('convertTo', { to: fname(to) }));

  const textPanel = textMode ? `
      <div id="panelPaste" class="converter-panel" hidden role="tabpanel" aria-labelledby="tabPaste">
        <label class="converter-label" for="converterTextArea">${esc(s('pasteLabel', { from: fname(from) }))}</label>
        <textarea id="converterTextArea" class="form-control text-editor-area"
          placeholder="${esc(s('pastePlaceholder', { from: fname(from) }))}"
          rows="12" spellcheck="false" aria-label="${esc(s('pasteAria', { from: fname(from) }))}"></textarea>
        <button class="btn btn-primary btn-lg w-100 mt-3" id="convertTextBtn">
          <i class="bi bi-arrow-right-circle me-2" aria-hidden="true"></i>${action}
        </button>
      </div>` : '';

  const engineNote = opts.engineNote ? `
      <div class="alert alert-info d-flex align-items-start gap-2 mb-3 py-2 px-3" style="font-size:var(--text-sm);border-radius:var(--radius-md);" id="engineNote">
        <i class="bi bi-info-circle-fill mt-1 flex-shrink-0" aria-hidden="true"></i>
        <span>${s('engineNoteHtml')}</span>
      </div>` : '';

  const heicNote = (to || '').toUpperCase() === 'HEIC' ? `
      <div class="alert alert-info d-flex align-items-start gap-2 mb-3 py-2 px-3" style="font-size:var(--text-sm);border-radius:var(--radius-md);" id="heicCompatNote">
        <i class="bi bi-info-circle-fill mt-1 flex-shrink-0" aria-hidden="true"></i>
        <span>${s('heicNoteHtml')}</span>
      </div>` : '';

  return `<section class="section-converter" id="converter" aria-labelledby="converter-heading" data-from="${esc(from)}" data-to="${esc(to)}">
  <div class="container" style="max-width:800px;">
    <div class="converter-card">
      <h2 class="visually-hidden" id="converter-heading">${esc(opts.action && sameFmt ? opts.action : s('widgetHeading', { from: fname(from), to: fname(to) }))}</h2>
      ${heicNote}${engineNote}

      ${textMode ? `<div class="converter-mode-tabs" id="converterModeTabs" role="tablist" aria-label="${esc(s('inputMethod'))}">
        <button class="converter-mode-tab active" id="tabFile" role="tab" aria-selected="true" aria-controls="panelFile">
          <i class="bi bi-file-earmark-arrow-up" aria-hidden="true"></i> ${esc(s('tabFile'))}
        </button>
        <button class="converter-mode-tab" id="tabPaste" role="tab" aria-selected="false" aria-controls="panelPaste">
          <i class="bi bi-keyboard" aria-hidden="true"></i> ${esc(s('tabPaste'))}
        </button>
      </div>` : ''}

      <div id="panelFile" class="converter-panel" role="tabpanel" ${textMode ? 'aria-labelledby="tabFile"' : ''}>
        <div class="drop-zone" id="dropZone" role="button" tabindex="0" aria-label="${esc(s('dropAria', { from: fname(from) }))}">
          <i class="bi bi-cloud-upload drop-zone__icon" aria-hidden="true"></i>
          <p class="drop-zone__text">${s('dropTextHtml', { from: F })}</p>
          <p class="drop-zone__sub">${esc(s('or'))}</p>
          <label class="btn btn-primary px-4" for="fileInput">
            <i class="bi bi-folder2-open me-2" aria-hidden="true"></i>${esc(s('browseFile'))}
          </label>
          <input type="file" id="fileInput" class="visually-hidden" accept="${esc(fromInfo.ext || '.*')}"
                 aria-label="${esc(s('selectAria', { from: fname(from) }))}">
          <p class="drop-zone__limit">${esc(s('dropLimit'))}</p>
        </div>

        <div class="converter-settings mt-3" id="converterSettings" hidden>
          <div class="d-flex align-items-center gap-3 mb-3 file-selected-row">
            <i class="bi bi-file-earmark-check-fill text-accent" style="font-size:1.5rem;" aria-hidden="true"></i>
            <div class="flex-grow-1">
              <p class="mb-0 fw-600" id="selectedFileName">file.${esc(fromLower)}</p>
              <p class="text-muted mb-0" style="font-size:var(--text-sm);" id="selectedFileSize"></p>
            </div>
            <button class="btn btn-outline-secondary btn-sm" id="clearFileBtn" aria-label="${esc(s('removeFile'))}">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>

          ${sameFmt ? '' : `<div class="row g-3 align-items-end mb-3">
            <div class="col-sm-5">
              <label class="converter-label" for="inputFormat">${esc(s('fromLabel'))}</label>
              <div class="form-control bg-light fw-600">${F}</div>
            </div>
            <div class="col-sm-2 text-center">
              <div class="converter-arrow mx-auto" id="swapBtn" role="button" tabindex="0" aria-label="${esc(s('swapAria'))}" title="${esc(s('swapTitle'))}">
                ⇄
              </div>
            </div>
            <div class="col-sm-5">
              <label class="converter-label" for="outputFormat">${esc(s('toLabel'))}</label>
              <div class="form-control bg-light fw-600">${T}</div>
            </div>
          </div>`}

          <button class="btn btn-primary btn-lg w-100" id="convertBtn">
            <i class="bi bi-arrow-right-circle me-2" aria-hidden="true"></i>${action}
          </button>
        </div>
      </div>

      ${textPanel}

      <div class="converter-output mt-3" id="converterOutput" hidden>
        <div class="output-success-row d-flex align-items-center gap-3 mb-3">
          <i class="bi bi-check-circle-fill text-success" style="font-size:1.5rem;" aria-hidden="true"></i>
          <p class="mb-0 fw-600">${esc(s('complete'))}</p>
        </div>
        <button class="btn btn-primary btn-lg w-100 mb-2" id="downloadBtn">
          <i class="bi bi-download me-2" aria-hidden="true"></i>${esc(opts.action ? s('downloadResult') : s('downloadTo', { to: fname(to) }))}
        </button>
        <button class="btn btn-outline-secondary w-100" id="convertAnotherBtn">${esc(s('convertAnother'))}</button>
      </div>

      <p class="mode-desc mt-2">
        <i class="bi bi-shield-lock-fill text-accent" aria-hidden="true"></i>
        ${esc(s('widgetPrivacy'))}
      </p>
    </div>
  </div>
</section>`;
}

function linkGrid(pages) {
  return pages.map(p => `<a href="${u(p['URL Slug'])}" class="converter-card-link">
          <span class="converter-card-link__label">${esc(nameOf(p))}</span>
          <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
        </a>`).join('\n        ');
}

function relatedGrid(title, pages, maxShow) {
  if (!pages || !pages.length) return '';
  const id = 'related-' + title.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, '-');
  return `<section class="related-section" aria-labelledby="${id}">
  <div class="container" style="max-width:var(--max-width);">
    <h2 class="section-title mb-4" id="${id}">${esc(title)}</h2>
    <div class="converter-grid">
      ${linkGrid(pages.slice(0, maxShow || 12))}
    </div>
  </div>
</section>`;
}

function pageGridSection(cls, labelId, title, sub, pages) {
  if (!pages.length) return '';
  return `<section class="${cls}" aria-labelledby="${labelId}">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title ${sub ? 'mb-1' : 'mb-4'}" id="${labelId}">${esc(title)}</h2>
      ${sub ? `<p class="text-muted mb-4">${esc(sub)}</p>` : ''}
      <div class="converter-grid">
        ${linkGrid(pages)}
      </div>
    </div>
  </section>`;
}

// ─── Homepage ─────────────────────────────────────────────────────────────────
function buildHomepage(allPages) {
  const slug = '/';
  const pairCount = allPages.filter(p => p['Page Type'] === 'Pair').length;
  const n = Math.floor(pairCount / 10) * 10;
  const popular = allPages.filter(p => p['Page Type'] === 'Pair' && p['Priority'] === 'P1').slice(0, 12);

  const schema = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'AintoB.com', url: abs(slug),
    inLanguage: L.meta.htmlLang, description: L.pages.home.desc,
  };

  return head({ title: L.pages.home.title, desc: L.pages.home.desc, slug, schema })
    + skipLink() + navbar(slug) + `

<main id="main-content">

  <section class="section-hero" aria-labelledby="hero-h1">
    <div class="container text-center" style="max-width:800px;">
      <span class="eyebrow">${esc(s('homeEyebrow'))}</span>
      <h1 class="hero-title" id="hero-h1">${s('homeTitleHtml')}</h1>
      <p class="hero-subtitle mx-auto">${esc(s('homeSub'))}</p>
      <div class="d-flex flex-wrap justify-content-center gap-3 mt-4">
        <a href="${u('/file-converter/')}" class="btn btn-primary btn-lg px-5">
          <i class="bi bi-grid-3x3-gap me-2" aria-hidden="true"></i>${esc(s('browseAll'))}
        </a>
        <a href="#categories" class="btn btn-outline-secondary btn-lg px-5">${esc(s('exploreCats'))}</a>
      </div>
    </div>
  </section>

  <section class="section-categories" id="categories" aria-labelledby="cat-heading">
    <div class="container" style="max-width:var(--max-width);">
      <div class="text-center mb-5">
        <p class="section-label">${esc(s('fileTypesLabel'))}</p>
        <h2 class="section-title" id="cat-heading">${esc(s('chooseCat'))}</h2>
        <p class="section-sub mx-auto">${esc(s('chooseCatSub'))}</p>
      </div>
      <div class="row g-4">
        ${CATS.map(c => `<div class="col-sm-6 col-lg-4">
          <a href="${u(HUB[c])}" class="category-card" aria-label="${esc(L.cat[c].converter)}">
            <span class="category-card__icon" aria-hidden="true">${ICON[c]}</span>
            <h3 class="category-card__title">${esc(L.cat[c].converter)}</h3>
            <p class="category-card__desc">${esc(L.cat[c].homeDesc)}</p>
            <span class="category-card__cta">${esc(s('browseTools'))} <i class="bi bi-arrow-right" aria-hidden="true"></i></span>
          </a>
        </div>`).join('\n        ')}
        <div class="col-sm-6 col-lg-4">
          <a href="${u('/file-converter/')}" class="category-card category-card--all" aria-label="${esc(s('allConverters'))}">
            <span class="category-card__icon" aria-hidden="true">${ICON.all}</span>
            <h3 class="category-card__title">${esc(s('allConverters'))}</h3>
            <p class="category-card__desc">${esc(s('allCardDesc', { n }))}</p>
            <span class="category-card__cta">${esc(s('viewAll'))} <i class="bi bi-arrow-right" aria-hidden="true"></i></span>
          </a>
        </div>
      </div>
    </div>
  </section>

  <section class="section-popular" aria-labelledby="popular-heading">
    <div class="container" style="max-width:var(--max-width);">
      <div class="text-center mb-5">
        <p class="section-label">${esc(s('popularLabel'))}</p>
        <h2 class="section-title" id="popular-heading">${esc(s('popularTitle'))}</h2>
        <p class="section-sub mx-auto">${esc(s('popularSub'))}</p>
      </div>
      <div class="converter-grid">
        ${linkGrid(popular)}
      </div>
      <div class="text-center mt-4">
        <a href="${u('/file-converter/')}" class="btn btn-outline-secondary px-5">${esc(s('viewAllN', { n }))}</a>
      </div>
    </div>
  </section>

  <section class="section-privacy" aria-labelledby="privacy-heading">
    <div class="container" style="max-width:var(--max-width);">
      <div class="row align-items-center g-5">
        <div class="col-lg-6">
          <p class="section-label">${esc(s('homePrivLabel'))}</p>
          <h2 class="section-title" id="privacy-heading">${esc(s('homePrivTitle'))}</h2>
          <p class="text-muted">${esc(s('homePrivText'))}</p>
          <ul class="privacy-list mt-3">
            ${[1, 2, 3, 4].map(i => `<li><i class="bi bi-check-circle-fill text-accent" aria-hidden="true"></i> ${esc(s('homePriv' + i))}</li>`).join('\n            ')}
          </ul>
        </div>
        <div class="col-lg-6">
          <div class="privacy-illustration">
            <div class="priv-box">
              <i class="bi bi-laptop" style="font-size:3rem; color:var(--color-accent);" aria-hidden="true"></i>
              <p class="fw-600 mb-1 mt-2">${esc(s('homePrivBoxTitle'))}</p>
              <p class="text-muted" style="font-size:var(--text-sm);">${esc(s('homePrivBoxText'))}</p>
              <div class="priv-badge"><i class="bi bi-shield-check" aria-hidden="true"></i> ${esc(s('homePrivBadge'))}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section-how" aria-labelledby="how-heading">
    <div class="container" style="max-width:var(--max-width);">
      <div class="text-center mb-5">
        <p class="section-label">${esc(s('howLabel'))}</p>
        <h2 class="section-title" id="how-heading">${esc(s('howTitle'))}</h2>
      </div>
      <div class="row g-4 text-center">
        ${[1, 2, 3].map(i => `<div class="col-md-4">
          <div class="how-step">
            <div class="how-step__num">${i}</div>
            <h3 class="how-step__title">${esc(s('how' + i + 'Title'))}</h3>
            <p class="how-step__desc">${esc(s('how' + i + 'Desc'))}</p>
          </div>
        </div>`).join('\n        ')}
      </div>
    </div>
  </section>

  ${openOnlineBox(null)}
  ${featureCards()}
  ${faqBlock(L.homeFaqs)}

</main>

` + footer(slug);
}

// ─── Master hub (/file-converter/) ────────────────────────────────────────────
function buildMasterHub(page, allPages) {
  const slug = page['URL Slug'];
  const txt = pageText(page);
  const count = c => allPages.filter(p => catBase(p) === c && p['Page Type'] === 'Pair').length;
  const formatHubs = allPages.filter(p => p['Page Type'] === 'Format Hub');
  const topPairs = allPages.filter(p => p['Page Type'] === 'Pair' && p['Priority'] === 'P1');
  const intro = LANG === DEFAULT_LANG ? page['Template Intro'] : L.pages.master.intro;

  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: txt.name, description: txt.meta, url: abs(slug), inLanguage: L.meta.htmlLang };

  return head({ title: txt.title, desc: txt.meta, slug, robots: robotsFor(page), schema })
    + skipLink() + navbar(slug)
    + breadcrumbs([{ label: txt.name, href: slug }])
    + `<main id="main-content">

  <section class="section-hero" aria-labelledby="hub-h1">
    <div class="container" style="max-width:800px; text-align:center;">
      <span class="eyebrow">${esc(s('masterEyebrow'))}</span>
      <h1 class="hero-title" id="hub-h1">${esc(txt.h1)}</h1>
      <p class="hero-subtitle mx-auto">${esc(intro)}</p>
    </div>
  </section>

  <section class="section-categories" aria-labelledby="categories-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-4" id="categories-h2">${esc(s('browseByType'))}</h2>
      <div class="row g-4">
        ${CATS.map(c => `<div class="col-sm-6 col-lg-4">
          <a href="${u(HUB[c])}" class="category-card">
            <span class="category-card__icon" aria-hidden="true">${ICON[c]}</span>
            <h3 class="category-card__title">${esc(L.cat[c].converters)}</h3>
            <p class="category-card__desc">${esc(s('catCount', { n: count(c) }))}</p>
            <span class="category-card__cta">${esc(s('browse'))} <i class="bi bi-arrow-right" aria-hidden="true"></i></span>
          </a>
        </div>`).join('\n        ')}
      </div>
    </div>
  </section>

  ${pageGridSection('section-formats', 'formats-h2', s('browseByFormat'), '', formatHubs)}
  ${pageGridSection('section-popular', 'popular-h2', s('mostPopularConv'), '', topPairs)}

  ${openOnlineBox(null)}
  ${privacyBlock()}

</main>
` + footer(slug);
}

// ─── Category hub ─────────────────────────────────────────────────────────────
function buildCategoryHub(page, allPages) {
  const slug = page['URL Slug'];
  const cb = catBase(page);
  const C = L.cat[cb];
  const txt = pageText(page);

  const fmtHubs = allPages.filter(p => p['Page Type'] === 'Format Hub' && p['Category'] === cb);
  const pairPages = allPages.filter(p => p['Page Type'] === 'Pair' && catBase(p) === cb);
  const topPairs = pairPages.filter(p => p['Priority'] === 'P1');
  const morePairs = pairPages.filter(p => p['Priority'] !== 'P1');

  const schema = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: txt.name, description: txt.meta, url: abs(slug), inLanguage: L.meta.htmlLang,
  };

  return head({ title: txt.title, desc: txt.meta, slug, robots: robotsFor(page), schema })
    + skipLink() + navbar(slug)
    + breadcrumbs([{ label: nameOf(allPages.find(p => p['Page Type'] === 'Master Hub')), href: '/file-converter/' }, { label: txt.name, href: slug }])
    + `<main id="main-content">

  <section class="section-hero" aria-labelledby="cat-h1">
    <div class="container" style="max-width:800px; text-align:center;">
      <span class="eyebrow">${ICON[cb]} ${esc(C.eyebrow)}</span>
      <h1 class="hero-title" id="cat-h1">${esc(txt.h1)}</h1>
      <p class="hero-subtitle mx-auto">${esc(C.desc)}</p>
    </div>
  </section>

  ${fmtHubs.length ? `<section class="section-formats" aria-labelledby="formats-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-1" id="formats-h2">${esc(s('browseByFormat'))}</h2>
      <p class="text-muted mb-4">${esc(s('browseByFormatSub'))}</p>
      <div class="row g-4">
        ${fmtHubs.map(f => {
          const info = fmtInfo(f['Source Format']);
          const count = allPages.filter(p => p['Page Type'] === 'Pair' && (p['Source Format'] === f['Source Format'] || p['Target Format'] === f['Source Format'])).length;
          return `<div class="col-sm-6 col-lg-4">
            <a href="${u(f['URL Slug'])}" class="format-hub-card">
              <span class="format-hub-card__icon" aria-hidden="true">${info.icon || '📁'}</span>
              <h3 class="format-hub-card__name">${esc(f['Source Format'])}</h3>
              <p class="format-hub-card__full">${esc(info.fullName || '')}</p>
              <p class="format-hub-card__count">${esc(s('convToolsCount', { n: count }))}</p>
            </a>
          </div>`;
        }).join('\n        ')}
      </div>
    </div>
  </section>` : ''}

  ${pageGridSection('section-popular', 'popular-h2', C.popularTitle, C.popularSub, topPairs)}
  ${pageGridSection('section-more-pairs', 'more-pairs-h2', C.allTitle, '', morePairs)}

  ${openOnlineBox(null)}
  ${privacyBlock()}
  ${faqBlock(C.faqs)}

</main>
` + footer(slug);
}

// ─── Format hub ───────────────────────────────────────────────────────────────
function buildFormatHub(page, allPages) {
  const slug = page['URL Slug'];
  const fmt = page['Source Format'];
  const info = fmtInfo(fmt);
  const cb = catBase(page);
  const C = L.cat[cb];
  const txt = pageText(page);

  const fromPages = allPages.filter(p => p['Page Type'] === 'Pair' && p['Source Format'] === fmt);
  const toPages = allPages.filter(p => p['Page Type'] === 'Pair' && p['Target Format'] === fmt);
  const relatedHubs = allPages.filter(p => p['Page Type'] === 'Format Hub' && p['Category'] === page['Category'] && p['Source Format'] !== fmt).slice(0, 6);

  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: txt.name, description: txt.meta, url: abs(slug), inLanguage: L.meta.htmlLang };
  const catHubHref = page['Parent Hub'] || categoryHub(cb);
  const desc = info.description || s('fmtFallbackDesc', { fmt, full: info.fullName || fmt, cat: cb });

  const faqs = [
    { q: s('hubFaqFreeQ', { fmt }), a: s('hubFaqFreeA', { fmt }) },
    { q: s('hubFaqWhatQ', { fmt }), a: desc },
    { q: s('hubFaqSafeQ', { fmt }), a: s('hubFaqSafeA', { fmt }) },
    { q: s('hubFaqStandQ', { fmt }), a: s('hubFaqStandA', { fmt, full: info.fullName || fmt, first: firstSentence(info.description) }).trim() },
  ];

  return head({ title: txt.title, desc: txt.meta, slug, robots: robotsFor(page), schema })
    + skipLink() + navbar(slug)
    + breadcrumbs([{ label: C.converter, href: catHubHref }, { label: txt.name, href: slug }])
    + `<main id="main-content">

  <section class="section-hero" aria-labelledby="fmt-h1">
    <div class="container" style="max-width:800px; text-align:center;">
      <span class="eyebrow">${info.icon || '📁'} ${esc(s('fmtEyebrow', { fmt }))}</span>
      <h1 class="hero-title" id="fmt-h1">${esc(txt.h1)}</h1>
      <p class="hero-subtitle mx-auto">${esc(txt.meta)}</p>
      <div class="d-flex flex-wrap justify-content-center gap-2 mt-4">
        ${fromPages.slice(0, 3).map(p => `<a href="${u(p['URL Slug'])}" class="btn btn-primary px-4">${esc(nameOf(p))}</a>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="section-explainer" aria-labelledby="explainer-h2">
    <div class="container" style="max-width:800px;">
      <div class="explainer-card">
        <h2 class="section-title" id="explainer-h2">${esc(s('whatIs', { fmt }))}</h2>
        <p>${desc}</p>
        ${info.useCases ? `<h3 class="explainer-subtitle">${esc(s('commonUses', { fmt }))}</h3>
        <ul class="explainer-list">
          ${info.useCases.map(x => `<li><i class="bi bi-check-circle-fill text-accent me-2" aria-hidden="true"></i>${x}</li>`).join('\n          ')}
        </ul>` : ''}
        ${info.limitation ? `<div class="explainer-note"><i class="bi bi-info-circle me-2" aria-hidden="true"></i><strong>${esc(s('note'))}</strong> ${info.limitation}</div>` : ''}
        ${info.compat ? `<p class="text-muted mt-2"><strong>${esc(s('compat'))}</strong> ${info.compat}</p>` : ''}
      </div>
    </div>
  </section>

  ${pageGridSection('section-from-to', 'from-h2', s('convertFrom', { fmt }), s('convertFromSub', { fmt }), fromPages)}
  ${pageGridSection('section-from-to section-from-to--to', 'to-h2', s('convertToFmt', { fmt }), s('convertToSub', { fmt }), toPages)}
  ${pageGridSection('section-related', 'rel-hubs-h2', C.relatedFormats, '', relatedHubs)}

  ${openOnlineBox(fmt)}
  ${privacyBlock()}
  ${faqBlock(faqs)}

</main>
` + footer(slug);
}

// ─── Converter (pair / tool) page ─────────────────────────────────────────────
function pairUseCases(from, to, fromInfo, toInfo) {
  const F = esc(fname(from)), T = esc(fname(to));
  const items = [s('uc1Html', { from: F, to: T }), s('uc2Html', { from: F, to: T })];
  if (toInfo.useCases && toInfo.useCases[0]) items.push(s('uc3Html', { to: T, use: toInfo.useCases[0] }));
  items.push(s('uc4'));
  return items;
}

function buildPairPage(page, allPages) {
  const slug = page['URL Slug'];
  const from = page['Source Format'], to = page['Target Format'];
  const fromInfo = fmtInfo(from), toInfo = fmtInfo(to);
  const cb = catBase(page);
  const C = L.cat[cb];
  const txt = pageText(page);
  const tool = L.tools[slug];
  const sameFmt = from === to;

  const parentSlug = page['Parent Hub'];
  const catHubHref = categoryHub(cb);
  const parentPage = allPages.find(p => p['URL Slug'] === parentSlug);

  const sameFrom = allPages.filter(p => p['Page Type'] === 'Pair' && p['Source Format'] === from && p['URL Slug'] !== slug && (p['Target Format'] !== to || sameFmt)).slice(0, 6);
  const sameTo = allPages.filter(p => p['Page Type'] === 'Pair' && p['Target Format'] === to && p['Source Format'] !== from).slice(0, 6);
  const reverse = sameFmt ? null : allPages.find(p => p['Page Type'] === 'Pair' && p['Source Format'] === to && p['Target Format'] === from);

  const cfg = getConverterConfig(from, to, slug);
  const robots = robotsFor(page);
  const action = (tool && tool.action) || (cfg && cfg.action) || undefined;
  if (LANG !== DEFAULT_LANG && cfg && cfg.action && !(tool && tool.action)) throw new Error(`${slug}: tools[].action missing (button label would be English)`);

  const schema = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: txt.name,
    applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web browser', inLanguage: L.meta.htmlLang,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: txt.meta, url: abs(slug),
  };

  const steps = sameFmt
    ? [s(cfg && cfg.textMode ? 'toolStep1PasteHtml' : 'toolStep1Html', { from: esc(fname(from)) }), s('toolStep2'), s('toolStep3')]
    : [s('step1Html', { from: esc(fname(from)) }), s('step2Html', { to: esc(fname(to)) }), s('step3Html')];

  // Intro paragraph: authored text where it exists, otherwise built from the format facts.
  let intro;
  const csvValue = page['Template Value Block'] || '';
  if (tool && tool.value) intro = tool.value;
  else if (LANG === DEFAULT_LANG && csvValue && !/^Explain why someone converts/i.test(csvValue)) intro = csvValue;
  else intro = s('pairIntro', {
    from: fname(from), to: fname(to),
    fromFirst: firstSentence(fromInfo.description), toFirst: firstSentence(toInfo.description),
  }).replace(/\s+/g, ' ');
  const limitation = toInfo.limitation || fromInfo.limitation || null;

  const faqs = sameFmt
    ? [1, 2, 3, 4].map(i => ({ q: s(`toolFaq${i}Q`, { name: txt.name }), a: s(`toolFaq${i}A`, { name: txt.name }) }))
    : buildPairFAQs(from, to);

  const card = (key, info) => `<div class="${sameFmt ? 'col-12' : 'col-md-6'}">
          <div class="format-explainer-card">
            <div class="format-explainer-card__header">
              <span class="format-explainer-card__icon" aria-hidden="true">${info.icon || '📁'}</span>
              <h3 class="format-explainer-card__name">${esc(fname(key))} <span class="text-muted fw-normal">(${esc(info.fullName || key)})</span></h3>
            </div>
            <p>${info.description ? firstTwoSentences(info.description) : s('fmtFallbackDesc', { fmt: key, full: key, cat: cb })}</p>
            ${info.compat ? `<p class="text-muted" style="font-size:var(--text-sm);"><strong>${esc(s('compat'))}</strong> ${info.compat}</p>` : ''}
          </div>
        </div>`;

  const showOpenOnline = !sameFmt && fmtInfo(from).ext && !/\*/.test(fmtInfo(from).ext || '');
  const extraLinks = [];
  if (parentPage && parentSlug !== catHubHref) extraLinks.push({ label: nameOf(parentPage), href: parentSlug });
  extraLinks.push({ label: C.converter, href: catHubHref });

  const crumbs = [{ label: C.converter, href: catHubHref }];
  if (parentPage && parentSlug !== catHubHref) crumbs.push({ label: nameOf(parentPage), href: parentSlug });
  crumbs.push({ label: txt.name, href: slug });

  return head({ title: txt.title, desc: txt.meta, slug, robots, schema })
    + skipLink() + navbar(slug)
    + breadcrumbs(crumbs)
    + `<main id="main-content">

  <section class="section-hero section-hero--pair" aria-labelledby="pair-h1">
    <div class="container" style="max-width:800px; text-align:center;">
      <div class="format-badge-row">
        ${sameFmt ? `<span class="format-badge format-badge--from">${esc(fname(from))}</span>` : `<span class="format-badge format-badge--from">${esc(fname(from))}</span>
        <span class="format-badge-arrow" aria-hidden="true">→</span>
        <span class="format-badge format-badge--to">${esc(fname(to))}</span>`}
      </div>
      <h1 class="hero-title" id="pair-h1">${esc(txt.h1)}</h1>
      <p class="hero-subtitle mx-auto">${esc(txt.meta)}</p>
    </div>
  </section>

  ${converterWidget(from, to, cfg ? cfg.textMode : false, { action, engineNote: cfg && cfg.engineNote })}

  <section class="section-content" aria-labelledby="intro-h2">
    <div class="container" style="max-width:800px;">
      <h2 class="section-title" id="intro-h2">${esc(sameFmt ? s('whyUse', { name: txt.name }) : s('whyConvert', { from: fname(from), to: fname(to) }))}</h2>
      <p>${intro}</p>
      <h3 class="explainer-subtitle">${esc(s('useCases'))}</h3>
      <ul class="explainer-list">
        ${pairUseCases(from, to, fromInfo, toInfo).map(x => `<li><i class="bi bi-check-circle-fill text-accent me-2" aria-hidden="true"></i>${x}</li>`).join('\n        ')}
      </ul>
      ${limitation ? `<div class="explainer-note"><i class="bi bi-info-circle me-2" aria-hidden="true"></i><strong>${esc(s('keepInMind'))}</strong> ${limitation}</div>` : ''}
    </div>
  </section>

  <section class="section-how-it-works" aria-labelledby="how-h2">
    <div class="container" style="max-width:800px;">
      <h2 class="section-title" id="how-h2">${esc(sameFmt ? s('howToUse', { name: txt.name }) : s('howTo', { from: fname(from), to: fname(to) }))}</h2>
      <ol class="how-it-works-list">
        ${steps.map(x => `<li>${x}</li>`).join('\n        ')}
      </ol>
    </div>
  </section>

  <section class="section-formats-explainer" aria-labelledby="formats-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-4" id="formats-h2">${esc(sameFmt ? s('aboutTool') : s('aboutFormats'))}</h2>
      <div class="row g-4">
        ${card(from, fromInfo)}
        ${sameFmt ? '' : card(to, toInfo)}
      </div>
    </div>
  </section>

  ${showOpenOnline ? openOnlineBox(from) : openOnlineBox(null)}
  ${privacyBlock()}

  ${relatedGrid(s('moreFrom', { from: fname(from) }), sameFrom)}
  ${relatedGrid(s('otherWays', { to: fname(to) }), sameTo)}

  ${reverse ? `<section class="section-reverse" aria-labelledby="reverse-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-3" id="reverse-h2">${esc(s('needReverse'))}</h2>
      <a href="${u(reverse['URL Slug'])}" class="converter-card-link" style="max-width:320px;">
        <span class="converter-card-link__label">${esc(nameOf(reverse))}</span>
        <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
      </a>
    </div>
  </section>` : ''}

  ${faqBlock(faqs)}

</main>
` + footer(slug, extraLinks, cfg ? [...cfg.libs, cfg.converterScript] : []);
}

function firstTwoSentences(t) {
  const m = t.match(/^([\s\S]*?[.!?])(\s+[\s\S]*?[.!?])?(?=\s|$)/);
  return m ? (m[1] + (m[2] || '')) : t;
}

function buildPairFAQs(from, to) {
  const F = fname(from), T = fname(to);
  const lossless = ['PNG', 'TIFF', 'WAV', 'BMP', 'SVG'];
  const lossy = ['JPG', 'JPEG', 'MP3', 'HEIC'];
  const quality = lossless.includes(to.toUpperCase()) && lossless.includes(from.toUpperCase())
    ? s('faqQualityLossless', { from: F, to: T })
    : lossy.includes(to.toUpperCase()) ? s('faqQualityLossy', { from: F, to: T }) : s('faqQualityGeneric');
  return [
    { q: s('faqFreeQ', { from: F, to: T }), a: s('faqFreeA') },
    { q: s('faqQualityQ', { from: F, to: T }), a: quality },
    { q: s('faqSafeQ', { from: F }), a: s('faqSafeA') },
    { q: s('faqSizeQ', { from: F }), a: s('faqSizeA') },
    { q: s('faqMultiQ', { from: F }), a: s('faqMultiA') },
  ];
}

// ─── Hand-built tool pages (templates/*.html) ─────────────────────────────────
const CUSTOM = {
  'pdf-edit': {
    libs: ['https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'],
    scripts: ['/assets/js/converters/pdf-edit.js', '/assets/js/converters/pdf-edit-preview.js'],
  },
  'pdf-to-searchable': {
    libs: ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'],
    scripts: ['/assets/js/converters/pdf-to-searchable.js'],
  },
};

function buildCustomPage(page, allPages) {
  const slug = page['URL Slug'];
  const key = slug.split('/')[2];
  const def = CUSTOM[key];
  if (!def) throw new Error(`No custom template registered for ${slug}`);
  const txt = pageText(page);
  const C = L.cat[catBase(page)];
  const parentPage = allPages.find(p => p['URL Slug'] === page['Parent Hub']);

  let main = fs.readFileSync(path.join(ROOT, 'templates', key + '.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'templates', key + '.css'), 'utf8');

  // OCR page: default the language dropdown to the page language
  if (key === 'pdf-to-searchable') {
    main = main.replace('<option value="eng" selected>', '<option value="eng">')
      .replace(`<option value="${L.meta.ocr}">`, `<option value="${L.meta.ocr}" selected>`);
  }

  if (LANG !== DEFAULT_LANG) {
    const r = tpl.translate(main, L.tpl);
    if (r.missing.length) {
      throw new Error(`${slug} [${LANG}]: ${r.missing.length} untranslated text unit(s) in i18n/${LANG}/tpl.js:\n  - ` + r.missing.join('\n  - '));
    }
    main = r.html;
  }

  // default watermark word (input value + live preview) in the page language
  if (key === 'pdf-edit' && L.tpl.CONFIDENTIAL) {
    main = main.replace('value="CONFIDENTIAL"', `value="${esc(L.tpl.CONFIDENTIAL)}"`).replace('>CONFIDENTIAL</span>', `>${esc(L.tpl.CONFIDENTIAL)}</span>`);
  }

  // internal links → language-prefixed; link labels follow the localised page names
  main = main.replace(/href="\/(?!assets\/|\/)([^"]*)"/g, (m, rest) => `href="/${LANG}/${rest}"`);
  main = main.replace(/(<a href="\/[a-z]{2}(\/[^"]*)" class="converter-card-link">\s*<span class="converter-card-link__label">)([^<]*)(<\/span>)/g, (m, a, target, _t, z) => {
    const p = allPages.find(x => x['URL Slug'] === target);
    return p ? a + esc(nameOf(p)) + z : m;
  });

  // FAQ structured data from the (translated) accordion
  const faqs = [...main.matchAll(/<button class="accordion-button[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/button>[\s\S]*?<div class="accordion-body">([\s\S]*?)<\/div>/g)]
    .map(m => ({ q: stripTags(m[1]), a: stripTags(m[2]) }));
  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: L.meta.htmlLang,
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  main = main.replace('<section class="section-faq"', `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>\n  <section class="section-faq"`);
  // open-online callout before the privacy block
  main = main.replace('<div class="privacy-block">', `${openOnlineBox(null)}\n  <div class="privacy-block">`);

  const schema = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: txt.name,
    applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web browser', inLanguage: L.meta.htmlLang,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: txt.meta, url: abs(slug),
  };

  const crumbs = [{ label: C.converter, href: categoryHub(catBase(page)) }];
  if (parentPage) crumbs.push({ label: nameOf(parentPage), href: parentPage['URL Slug'] });
  crumbs.push({ label: txt.name, href: slug });

  return head({ title: txt.title, desc: txt.meta, slug, robots: robotsFor(page), schema, extraHead: `  <style>\n${css}  </style>` })
    + skipLink() + navbar(slug)
    + breadcrumbs(crumbs)
    + main + '\n'
    + footer(slug, crumbs.slice(0, -1).map(c => ({ label: c.label, href: c.href })), [...def.libs, ...def.scripts]);
}

// ─── Legal pages ──────────────────────────────────────────────────────────────
function buildPrivacyPage() {
  const slug = '/privacy/';
  const P = L.legal.privacy;
  const date = new Date().toLocaleDateString(L.meta.dateLocale, { day: 'numeric', month: 'long', year: 'numeric' });
  return head({ title: P.title, desc: P.desc, slug, robots: 'index, follow' })
    + skipLink() + navbar(slug)
    + breadcrumbs([{ label: P.h1, href: slug }])
    + `<main id="main-content">
  <section class="section-hero">
    <div class="container" style="max-width:800px;">
      <h1 class="hero-title">${esc(P.h1)}</h1>
      <p class="text-muted">${esc(P.updated.replace('{date}', date))}</p>
    </div>
  </section>
  <section class="section-content">
    <div class="container" style="max-width:800px;">
      ${P.sections.map(sec => `<h2>${esc(sec.h)}</h2>\n      ${sec.html.replace('{imprintUrl}', u('/imprint/'))}`).join('\n\n      ')}
    </div>
  </section>
</main>
` + footer(slug);
}

function buildImprintPage() {
  const slug = '/imprint/';
  const I = L.legal.imprint;
  return head({ title: I.title, desc: I.desc, slug, robots: 'noindex, follow' })
    + skipLink() + navbar(slug)
    + breadcrumbs([{ label: I.h1, href: slug }])
    + `<main id="main-content">
  <section class="section-hero">
    <div class="container" style="max-width:800px;">
      <h1 class="hero-title">${esc(I.h1)}</h1>
    </div>
  </section>
  <section class="section-content">
    <div class="container" style="max-width:800px;">
      ${I.html}
    </div>
  </section>
</main>
` + footer(slug);
}

// ─── Language router (/) and redirect stubs for the pre-i18n URLs ─────────────
const DETECT_JS = `var P=${JSON.stringify(LANGS.map(l => l.code))},l='${DEFAULT_LANG}';try{var v=localStorage.getItem('aintob_lang');if(P.indexOf(v)>-1){l=v}else{var n=navigator.languages||[navigator.language||l];for(var i=0;i<n.length;i++){var c=String(n[i]).slice(0,2).toLowerCase();if(P.indexOf(c)>-1){l=c;break}}}}catch(e){}`;

function buildRouterPage() {
  const names = LANGS.map(l => LOCALES[l.code].s.routerChoose).join(' · ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AintoB – File Converter · Dateikonverter · Převodník souborů · Konwerter plików</title>
  <meta name="description" content="${esc(LANGS.map(l => LOCALES[l.code].s.routerSub).join(' '))}">
  <link rel="canonical" href="${DOMAIN}/">
  <style>
    :root{--accent:#3b5bdb;--text:#111827;--muted:#6b7280;--border:#e5e7eb;--bg:#f9fafb}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem 1rem;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.5}
    main{width:100%;max-width:30rem;background:#fff;border:1px solid var(--border);border-radius:1rem;padding:2rem 1.5rem;text-align:center}
    h1{font-size:1.75rem;margin:.25rem 0 .5rem;letter-spacing:-.02em}
    p{margin:0 0 1.5rem;color:var(--muted)}
    ul{list-style:none;margin:0;padding:0;display:grid;gap:.75rem}
    a{display:block;padding:.9rem 1rem;border:1px solid var(--border);border-radius:.75rem;color:var(--text);text-decoration:none;font-weight:600;text-align:left}
    a:hover,a:focus-visible{border-color:var(--accent);outline:none;box-shadow:0 0 0 3px rgba(59,91,219,.15)}
    a small{display:block;font-weight:400;color:var(--muted)}
  </style>
  <script>${DETECT_JS}if(location.hash!=='#choose'){location.replace('/'+l+'/'+location.search)}</script>
</head>
<body>
  <main>
    <div aria-hidden="true" style="font-size:2rem">🅰️➡️🅱️</div>
    <h1>AintoB</h1>
    <p>${esc(names)}</p>
    <ul>
      ${LANGS.map(l => `<li><a href="/${l.code}/" hreflang="${l.htmlLang}" lang="${l.htmlLang}" data-lang="${l.code}">${l.name}<small>${esc(LOCALES[l.code].s.routerSub)}</small></a></li>`).join('\n      ')}
    </ul>
  </main>
  <script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-lang]');if(a){try{localStorage.setItem('aintob_lang',a.getAttribute('data-lang'))}catch(x){}}})</script>
</body>
</html>`;
}

function buildRedirectStub(slug) {
  const target = `/${DEFAULT_LANG}${slug}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AintoB</title>
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${DOMAIN}${target}">
  <noscript><meta http-equiv="refresh" content="0; url=${target}"></noscript>
  <script>${DETECT_JS}location.replace('/'+l+'${slug}'+location.search+location.hash)</script>
</head>
<body>
  <p>This page has moved / Diese Seite ist umgezogen / Stránka byla přesunuta / Strona została przeniesiona:</p>
  <ul>${LANGS.map(l => `<li><a href="/${l.code}${slug}" hreflang="${l.htmlLang}">${l.name}</a></li>`).join('')}</ul>
</body>
</html>`;
}

// ─── Sitemap / robots / redirects / runtime dictionaries ──────────────────────
function buildSitemap(allPages) {
  const entries = [
    { slug: '/', priority: '1.0', freq: 'weekly' },
    ...allPages.filter(p => p['Indexation'] === 'Index now').map(p => ({
      slug: p['URL Slug'],
      priority: p['Priority'] === 'P1' ? '0.9' : p['Page Type'] === 'Format Hub' ? '0.8' : p['Page Type'] === 'Category Hub' ? '0.9' : '0.7',
      freq: p['Page Type'] === 'Pair' ? 'monthly' : 'weekly',
    })),
    { slug: '/privacy/', priority: '0.3', freq: 'yearly' },
  ];
  const alts = slug => LANGS.map(l => `    <xhtml:link rel="alternate" hreflang="${l.htmlLang}" href="${DOMAIN}/${l.code}${slug}"/>`).join('\n')
    + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${DOMAIN}/${DEFAULT_LANG}${slug}"/>`;
  const urls = [];
  for (const e of entries) {
    for (const l of LANGS) {
      urls.push(`  <url>
    <loc>${DOMAIN}/${l.code}${e.slug}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${e.freq}</changefreq>
    <priority>${e.priority}</priority>
${alts(e.slug)}
  </url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

const buildRobots = () => `User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml\n`;

// ─── Main build ───────────────────────────────────────────────────────────────
function build() {
  console.log('🏗️  AintoB multilingual static site generator\n');
  const allPages = parseCSV(fs.readFileSync(path.join(ROOT, 'page_map.csv'), 'utf8'));
  console.log(`📄 ${allPages.length} pages in page_map.csv × ${LANGS.length} languages (${LANGS.map(l => l.code).join(', ')})`);

  // Fail fast on incomplete translations
  const toolSlugs = allPages.filter(p => p['Page Type'] === 'Custom' || (p['Page Type'] === 'Pair' && (p['URL Slug'].startsWith('/data/') || p['Source Format'] === p['Target Format']))).map(p => p['URL Slug']);
  const problems = checkI18n(LOCALES, toolSlugs, LOCALES[DEFAULT_LANG]);
  if (problems.length) {
    console.error(`\n✗ ${problems.length} i18n problem(s):\n` + problems.slice(0, 60).map(x => '  ' + x).join('\n') + (problems.length > 60 ? `\n  … and ${problems.length - 60} more` : ''));
    process.exit(1);
  }

  const builders = {
    'Master Hub': buildMasterHub, 'Category Hub': buildCategoryHub, 'Format Hub': buildFormatHub,
    Pair: buildPairPage, Custom: buildCustomPage,
  };
  let count = 0;
  const failures = [];

  for (const l of LANGS) {
    setLang(l.code);
    let n = 0;
    const put = (slug, html) => { writeFile(`${l.code}/${slugToPath(slug)}`, html); n++; };
    try { put('/', buildHomepage(allPages)); } catch (e) { failures.push(`[${l.code}] /: ${e.message}`); }
    for (const page of allPages) {
      const slug = page['URL Slug'];
      const fn = builders[page['Page Type']];
      if (!slug || !fn) { console.warn(`  ⚠ skipping ${slug} (${page['Page Type']})`); continue; }
      try { put(slug, fn(page, allPages)); } catch (e) { failures.push(`[${l.code}] ${slug}: ${e.message}`); }
    }
    try { put('/privacy/', buildPrivacyPage()); put('/imprint/', buildImprintPage()); } catch (e) { failures.push(`[${l.code}] legal: ${e.message}`); }

    // runtime dictionary for scripts (English strings are the keys)
    if (l.code !== DEFAULT_LANG) {
      writeFile(`assets/js/lang/${l.code}.js`, `/* generated by build.js from i18n/${l.code}/js.js */\nwindow.AINTOB_DICT=${JSON.stringify(L.js)};\n`);
    }
    console.log(`  ✓ /${l.code}/  ${n} pages`);
    count += n;
  }

  if (failures.length) {
    console.error(`\n✗ ${failures.length} page(s) failed:\n` + failures.slice(0, 20).map(f => '  ' + f).join('\n'));
    process.exit(1);
  }

  // Root router + redirect stubs for every pre-i18n URL (GitHub Pages cannot send real 301s)
  writeFile('index.html', buildRouterPage());
  const oldSlugs = [...allPages.map(p => p['URL Slug']), '/privacy/', '/imprint/'];
  for (const slug of oldSlugs) writeFile(slugToPath(slug), buildRedirectStub(slug));
  // Same mapping as real 301s for hosts that support a _redirects file (Netlify, Cloudflare Pages)
  writeFile('_redirects', '# Generated by build.js — old (pre-i18n) URLs → English pages\n' +
    oldSlugs.map(slug => `${slug} /${DEFAULT_LANG}${slug} 301`).join('\n') + '\n');

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(allPages), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), buildRobots(), 'utf8');
  console.log(`  ✓ / (language router) + ${oldSlugs.length} redirect stubs + _redirects`);
  console.log('  ✓ sitemap.xml, robots.txt');
  console.log(`\n✅ Build complete — ${count} localised pages.\n`);
}

build();
