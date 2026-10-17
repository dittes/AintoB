#!/usr/bin/env node
/**
 * Post-build checks for the generated site (no dependencies):  node scripts/verify.js
 *
 *  1. every /<lang>/ page: <html lang>, self-canonical, unique title/description, length limits
 *  2. hreflang: every alternate exists, links back (reciprocal), x-default → /en/, noindex pages carry none
 *  3. sitemap.xml: every <loc> exists and is indexable, alternates match the pages' own hreflang
 *  4. every internal link and asset reference resolves to a file
 *  5. old (pre-i18n) URLs are redirect stubs pointing at /en/, and appear in _redirects
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOMAIN = 'https://aintob.com';
const LANGS = ['en', 'de', 'cs', 'pl'];
const problems = [];
const fail = (m) => problems.push(m);

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));
const attr = (html, re) => (html.match(re) || [])[1];

function pagesOf(lang) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, lang, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name === 'index.html') out.push('/' + dir + (dir ? '/' : ''));
    }
  })('');
  return out;
}

const slugs = {};
for (const l of LANGS) slugs[l] = new Set(pagesOf(l));
const base = [...slugs.en];
for (const l of LANGS) {
  const a = [...slugs[l]].filter(s => !slugs.en.has(s)), b = base.filter(s => !slugs[l].has(s));
  if (a.length || b.length) fail(`[${l}] page set differs from en: extra ${a.slice(0, 3)} missing ${b.slice(0, 3)}`);
}

const info = {}; // `${lang}${slug}` → {title, desc, robots, canonical, alts}
const titles = new Map(), descs = new Map();
for (const l of LANGS) {
  for (const slug of slugs[l]) {
    const file = `${l}${slug}index.html`;
    const html = read(file);
    const title = attr(html, /<title>([^<]*)<\/title>/);
    const desc = attr(html, /<meta name="description" content="([^"]*)"/);
    const robots = attr(html, /<meta name="robots" content="([^"]*)"/);
    const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
    const htmlLang = attr(html, /<html lang="([^"]*)"/);
    const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"/g)].map(m => [m[1], m[2]]);
    info[l + slug] = { title, desc, robots, canonical, alts };

    if (htmlLang !== l) fail(`${file}: <html lang="${htmlLang}"> should be "${l}"`);
    if (canonical !== `${DOMAIN}/${l}${slug}`) fail(`${file}: canonical is ${canonical}`);
    if (!title) fail(`${file}: no <title>`);
    else {
      if (title.length > 75) fail(`${file}: title is ${title.length} chars: ${title}`);
      const k = `${l}|${title}`;
      if (titles.has(k)) fail(`${file}: duplicate title with ${titles.get(k)}`); else titles.set(k, file);
    }
    if (!desc) fail(`${file}: no meta description`);
    else {
      if (desc.length > 185) fail(`${file}: description is ${desc.length} chars`);
      if (desc.length < 50) fail(`${file}: description is only ${desc.length} chars`);
      const k = `${l}|${desc}`;
      if (descs.has(k) && slug !== '/privacy/' && slug !== '/imprint/') fail(`${file}: duplicate description with ${descs.get(k)}`); else descs.set(k, file);
    }
    const indexed = !/noindex/.test(robots || '');
    if (!indexed && alts.length) fail(`${file}: noindex page must not carry hreflang`);
    if (indexed) {
      const want = [...LANGS.map(x => [x, `${DOMAIN}/${x}${slug}`]), ['x-default', `${DOMAIN}/en${slug}`]];
      if (JSON.stringify(alts) !== JSON.stringify(want)) fail(`${file}: hreflang set is wrong`);
    }
    if (/\{[a-zA-Z]+\}/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')) && !/pdf-edit|pdf-to-searchable/.test(file)) {
      const m = html.replace(/<script[\s\S]*?<\/script>/g, '').match(/\{[a-zA-Z]+\}/);
      fail(`${file}: unreplaced placeholder ${m[0]}`);
    }
    if (/undefined|\[object Object\]/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) fail(`${file}: contains "undefined"/"[object Object]"`);
  }
}

// reciprocity: if A lists B, B lists A
for (const [key, p] of Object.entries(info)) {
  for (const [, href] of p.alts) {
    const target = href.replace(DOMAIN, '');
    const lang = target.split('/')[1];
    const slug = '/' + target.split('/').slice(2).join('/');
    const q = info[lang + slug];
    if (!q) { fail(`${key}: hreflang target missing: ${href}`); continue; }
    if (!q.alts.some(([, h]) => h === `${DOMAIN}/${key.slice(0, 2)}${key.slice(2)}`)) fail(`${key}: not reciprocated by ${href}`);
  }
}

// sitemap
const sm = read('sitemap.xml');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
if (new Set(locs).size !== locs.length) fail('sitemap.xml: duplicate <loc>');
for (const loc of locs) {
  const rel = loc.replace(DOMAIN, '');
  const [, lang] = rel.split('/');
  const slug = '/' + rel.split('/').slice(2).join('/');
  const p = info[lang + slug];
  if (!p) fail(`sitemap: ${loc} has no page`);
  else if (/noindex/.test(p.robots)) fail(`sitemap: ${loc} is noindex`);
}
const indexedPages = Object.entries(info).filter(([, p]) => !/noindex/.test(p.robots)).length;
if (locs.length !== indexedPages) fail(`sitemap lists ${locs.length} URLs but ${indexedPages} pages are indexable`);
if (!/<xhtml:link rel="alternate" hreflang="x-default"/.test(sm)) fail('sitemap: no x-default alternates');

// internal links & assets
const checked = new Set();
for (const l of LANGS) {
  for (const slug of slugs[l]) {
    const html = read(`${l}${slug}index.html`);
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
      const href = m[1];
      if (checked.has(href)) continue;
      checked.add(href);
      if (href.startsWith('//')) continue;
      const ok = href.endsWith('/') ? exists(href.slice(1) + 'index.html') : exists(href.slice(1));
      if (!ok) fail(`${l}${slug}: broken link ${href}`);
    }
  }
}

// old URLs
const redirects = exists('_redirects') ? read('_redirects') : '';
for (const slug of slugs.en) {
  if (slug === '/') continue;
  const rel = slug.slice(1) + 'index.html';
  if (!exists(rel)) { fail(`old URL ${slug}: no redirect stub`); continue; }
  const h = read(rel);
  if (!h.includes(`href="${DOMAIN}/en${slug}"`)) fail(`old URL ${slug}: stub canonical wrong`);
  if (!redirects.includes(`${slug} /en${slug} 301`)) fail(`old URL ${slug}: missing from _redirects`);
}
if (!exists('index.html') || !/localStorage\.getItem\('aintob_lang'\)/.test(read('index.html'))) fail('root index.html is not the language router');

console.log(`checked ${Object.keys(info).length} pages, ${locs.length} sitemap URLs, ${checked.size} distinct internal URLs`);
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):\n` + problems.slice(0, 40).map(p => '  ' + p).join('\n') + (problems.length > 40 ? `\n  … and ${problems.length - 40} more` : ''));
  process.exit(1);
}
console.log('✅ all checks passed');
