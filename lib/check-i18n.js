/**
 * i18n consistency checks, run at the start of every build.
 *  - every locale defines the same `s` / `cat` / `tools` keys as English
 *  - {placeholders} match the English string
 *  - the runtime dictionary (i18n/<lang>/js.js) covers every string the browser scripts can show,
 *    discovered by scanning assets/js for __t('…') calls and `new Error('…')` messages
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NON_EN_ONLY = new Set(['pairName', 'pairH1', 'pairTitle', 'pairMeta', 'hubName', 'hubH1', 'hubTitle', 'hubMeta']);
// strings passed to __t() through a variable, so the scanner cannot see them
const EXTRA_RUNTIME_KEYS = [
  'Unknown error', 'UPPERCASE', 'lowercase', 'Title Case', 'Sentence case',
  'Loading libraries…', 'Loading PDF…', 'Checking for existing text…', 'Done — PDF already contains selectable text.',
  'Loading Tesseract OCR engine…', 'Assembling searchable PDF…', 'Done!',
  'An unexpected error occurred. Please try again.',
];
const placeholders = str => [...String(str).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'lang' ? [] : jsFiles(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

/** English strings the browser scripts can display. Wildcard keys end in "*". */
function runtimeKeys() {
  const keys = new Set(EXTRA_RUNTIME_KEYS);
  const lit = "'((?:[^'\\\\]|\\\\.)*)'";
  for (const file of jsFiles(path.join(ROOT, 'assets', 'js'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(new RegExp(`__t\\(\\s*${lit}`, 'g'))) keys.add(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
    // thrown messages: join adjacent string literals; a variable tail becomes a "*" wildcard
    const re = /new Error\(\s*((?:(?:'(?:[^'\\]|\\.)*'|`[^`]*`)\s*(?:\+\s*)?)+)/g;
    let m;
    while ((m = re.exec(src))) {
      const lits = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'|`([^`]*)`/g)].map(x => (x[1] !== undefined ? x[1] : x[2]).replace(/\\'/g, "'"));
      // a trailing "+" means a non-literal operand follows, i.e. the message has a variable tail
      const dynamic = /\+\s*$/.test(m[1]) || /\$\{/.test(lits.join(''));
      const msg = lits.join('').replace(/\$\{[^}]*\}/g, '*');
      keys.add(msg.includes('*') ? msg.slice(0, msg.indexOf('*') + 1) : (dynamic ? msg + '*' : msg));
    }
  }
  return keys;
}

function check(locales, requiredToolSlugs, en) {
  const problems = [];
  const rk = runtimeKeys();
  for (const [code, L] of Object.entries(locales)) {
    if (code === 'en') continue;
    const tag = m => problems.push(`[${code}] ${m}`);

    // ui strings
    for (const k of Object.keys(en.s)) {
      if (L.s[k] === undefined) tag(`missing string "${k}"`);
      else if (placeholders(L.s[k]) !== placeholders(en.s[k])) tag(`placeholders differ in "${k}": {${placeholders(L.s[k])}} vs {${placeholders(en.s[k])}}`);
    }
    for (const k of Object.keys(L.s)) if (en.s[k] === undefined && !NON_EN_ONLY.has(k)) tag(`unknown string "${k}" (not in en)`);
    for (const k of NON_EN_ONLY) if (L.s[k] === undefined) tag(`missing template "${k}"`);

    // categories
    for (const c of Object.keys(en.cat)) {
      const a = en.cat[c], b = L.cat[c];
      if (!b) { tag(`missing category "${c}"`); continue; }
      for (const k of Object.keys(a)) if (b[k] === undefined) tag(`cat.${c}.${k} missing`);
      if (!b.hub || !b.hub.name || !b.hub.title || !b.hub.meta || !b.hub.h1) tag(`cat.${c}.hub incomplete`);
      if (b.faqs && a.faqs && b.faqs.length !== a.faqs.length) tag(`cat.${c}.faqs has ${b.faqs.length} items, en has ${a.faqs.length}`);
    }
    for (const c of Object.keys(en.benefit || {})) if (!L.benefit[c]) tag(`benefit.${c} missing`);
    for (const c of ['image', 'document', 'spreadsheet', 'audio', 'video']) if (!L.benefit[c]) tag(`benefit.${c} missing`);

    // tool pages
    for (const slug of requiredToolSlugs) {
      const t = L.tools[slug];
      if (!t) { tag(`tools["${slug}"] missing`); continue; }
      for (const k of ['name', 'title', 'meta', 'h1']) if (!t[k]) tag(`tools["${slug}"].${k} missing`);
    }
    if (L.homeFaqs.length !== en.homeFaqs.length) tag(`homeFaqs has ${L.homeFaqs.length} items, en has ${en.homeFaqs.length}`);
    if (L.legal.privacy.sections.length !== en.legal.privacy.sections.length) tag('privacy sections differ from en');
    for (const k of Object.keys(en.pages.home)) if (!L.pages.home[k]) tag(`pages.home.${k} missing`);
    for (const k of ['name', 'title', 'meta', 'h1', 'intro']) if (!(L.pages.master && L.pages.master[k])) tag(`pages.master.${k} missing`);

    // format knowledge: every format must be translated, with the same list lengths
    for (const [fk, base] of Object.entries(L.formatsEn)) {
      const own = L.ownFormats[fk];
      if (!own) { tag(`formats: "${fk}" not translated`); continue; }
      for (const f of ['description', 'limitation', 'compat']) if (!own[f]) tag(`formats.${fk}.${f} missing`);
      if (!own.useCases || own.useCases.length !== base.useCases.length) tag(`formats.${fk}.useCases must have ${base.useCases.length} items`);
    }

    // runtime dictionary
    for (const k of rk) {
      if (L.js[k] === undefined) tag(`js dictionary missing: ${JSON.stringify(k)}`);
      else if (placeholders(L.js[k]) !== placeholders(k)) tag(`js placeholders differ for ${JSON.stringify(k)}`);
      else if (k.endsWith('*') && !L.js[k].includes('*')) tag(`js wildcard translation must contain "*": ${JSON.stringify(k)}`);
    }
  }
  return problems;
}

module.exports = { check, runtimeKeys };
