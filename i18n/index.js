/**
 * Locale loader.
 *
 * Every language lives in i18n/<code>/ with four modules:
 *   ui.js       – meta + strings (`s`), category copy, tool-page copy, FAQs, legal text
 *   formats.js  – per-format description/useCases/limitation/compat (English is the base;
 *                 other locales override only what they translate)
 *   tpl.js      – English → translation map for the hand-written PDF page templates
 *   js.js       – English → translation map for strings shown by browser scripts
 *
 * To add a language: copy i18n/en, translate, and add its code to LANGS below.
 */
'use strict';

const ALL_LANGS = [
  { code: 'en', name: 'English', short: 'EN', htmlLang: 'en', ogLocale: 'en_US', dateLocale: 'en-GB', ocr: 'eng' },
  { code: 'de', name: 'Deutsch', short: 'DE', htmlLang: 'de', ogLocale: 'de_DE', dateLocale: 'de-DE', ocr: 'deu' },
  { code: 'cs', name: 'Čeština', short: 'CS', htmlLang: 'cs', ogLocale: 'cs_CZ', dateLocale: 'cs-CZ', ocr: 'ces' },
  { code: 'pl', name: 'Polski', short: 'PL', htmlLang: 'pl', ogLocale: 'pl_PL', dateLocale: 'pl-PL', ocr: 'pol' },
];
// Dev shortcut: AINTOB_LANGS=en,de node build.js builds only those languages
// (hreflang/sitemap then list only them — never deploy a filtered build).
const only = (process.env.AINTOB_LANGS || '').split(',').filter(Boolean);
const LANGS = only.length ? ALL_LANGS.filter(l => only.includes(l.code)) : ALL_LANGS;
const DEFAULT_LANG = 'en';

function loadLocale(meta) {
  const dir = `./${meta.code}`;
  const ui = require(`${dir}/ui.js`);
  const base = require('./en/formats.js');
  const own = meta.code === DEFAULT_LANG ? {} : require(`${dir}/formats.js`);

  // Merge format translations over the English base (field by field).
  const formats = {};
  for (const [key, en] of Object.entries(base)) formats[key] = Object.assign({}, en, own[key] || {});

  return {
    meta,
    s: ui.s,
    cat: ui.cat,
    benefit: ui.benefit,
    tools: ui.tools,
    fmtNames: ui.fmtNames,
    homeFaqs: ui.homeFaqs,
    legal: ui.legal,
    pages: ui.pages,
    formats,
    ownFormats: own,
    formatsEn: base,
    tpl: meta.code === DEFAULT_LANG ? {} : require(`${dir}/tpl.js`),
    js: meta.code === DEFAULT_LANG ? {} : require(`${dir}/js.js`),
  };
}

module.exports = { LANGS, DEFAULT_LANG, loadLocale };
