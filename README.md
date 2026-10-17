# AintoB.com — Multilingual, Browser-Based File Converter Suite

**212 pages × 4 languages (English, Deutsch, Čeština, Polski)** · generated from `page_map.csv` + locale files ·
pure HTML/CSS/JS · no backend · no uploads

Every conversion runs in the visitor's browser (Canvas, File API, Web Workers, WASM). Nothing is sent to a
server, so the site is private by design and free to host on any static host (currently GitHub Pages, see `CNAME`).

## URL structure

```
/                         language router (picks /en/ /de/ /cs/ /pl/ from the saved choice or browser language)
/en/…  /de/…  /cs/…  /pl/…   the site, one subfolder per language, identical slugs in every language
/image/png-to-jpg/ …      OLD (pre-i18n) URLs → redirect stubs pointing at /en/…  (see "URL migration")
```

`/en/image/png-to-jpg/` ⇄ `/de/image/png-to-jpg/` ⇄ `/cs/…` ⇄ `/pl/…`. Slugs stay English on purpose: it keeps
hreflang mapping trivial and every translation reachable with a one-segment swap. Titles, H1s and body copy are
localised per language.

## Repository layout

```
build.js                  generator (plain Node, no dependencies):  node build.js
page_map.csv              page list + English SEO copy (source of truth for structure)
i18n/
  index.js                language list + locale loader
  en/ de/ cs/ pl/
    ui.js                 UI strings, title/meta templates, category copy, tool pages, FAQs, legal text
    formats.js            per-format description / use cases / limitation / compatibility
    tpl.js                English → translation for the hand-written PDF page templates   (not en)
    js.js                 English → translation for messages shown by browser scripts       (not en)
templates/                hand-written tool pages (pdf-edit, pdf-to-searchable): English HTML + page CSS
lib/
  converters.js           page → converter script + CDN libs mapping
  tpl.js                  build-time HTML translator used for templates/
  check-i18n.js           completeness checks (run on every build)
  csv.js
scripts/verify.js         post-build checks (hreflang, sitemap, links, redirects, lengths)
assets/
  css/                    base.css (tokens) + site.css (components)
  js/site.js              shared widget + __t() runtime translation helper
  js/converters/          one script per converter, loaded only on pages that need it
  js/lang/<code>.js       GENERATED runtime dictionaries (do not edit; edit i18n/<code>/js.js)
en/ de/ cs/ pl/           GENERATED pages
index.html                GENERATED language router
_redirects                GENERATED 301 map for hosts that support it (Netlify, Cloudflare Pages)
sitemap.xml robots.txt    GENERATED
```

Everything marked GENERATED is rewritten by `node build.js`; commit the output (GitHub Pages serves the repo root).

## Build and verify

```
node build.js            # builds all languages; fails if any translation is missing
node scripts/verify.js   # checks the generated site
AINTOB_LANGS=en,de node build.js   # dev shortcut: only some languages (never deploy a filtered build)
```

`build.js` refuses to build if a locale lacks a string/placeholder/format/tool page that English has, or if the
runtime dictionary misses a message that a browser script can show (it scans `assets/js` for `__t('…')` calls and
`new Error('…')` messages). `scripts/verify.js` then checks all 848 pages: `<html lang>`, self-canonical,
title/description length and uniqueness, hreflang reciprocity, sitemap ↔ page agreement, every internal link and
asset, and the old-URL redirects.

## SEO setup

- `<link rel="alternate" hreflang>` for en/de/cs/pl plus `x-default` → `/en/…` on every indexable page; `noindex`
  pages carry none. `og:locale` + `og:locale:alternate`, `inLanguage` in JSON-LD, localised breadcrumbs/FAQ schema.
- `sitemap.xml` lists every indexable page in every language with `xhtml:link` alternates.
- Language switcher (plain `<details>` links, crawlable) in the nav and a language row in the footer.
- Unique, keyword-targeted title/meta/H1 per page and language, e.g. *PNG in JPG umwandeln* (de),
  *Převodník PNG na JPG* (cs), *Konwerter PNG na JPG* (pl).

## URL migration (301-equivalent notes)

Moving the site into language subfolders changed every URL. GitHub Pages cannot send HTTP 301s, so:

1. Every old URL (`/image/png-to-jpg/`, `/document/pdf-edit/`, `/image-converter/`, `/privacy/`, … 211 in total) is now a
   small redirect stub: `canonical` → the `/en/` page, `noindex`, and a script that forwards to the visitor's saved or
   browser language (default `/en/`), with a `<noscript>` meta-refresh fallback and visible links.
2. `_redirects` contains the same mapping as real `301`s (`/image/png-to-jpg/ /en/image/png-to-jpg/ 301`). It is ignored
   on GitHub Pages but works unchanged if the site ever moves to Netlify or Cloudflare Pages.
3. English page copy is unchanged except for the fixes listed below, so existing rankings carry over to `/en/`.
   After deploying, submit the new `sitemap.xml` in Search Console and watch its page-indexing report for the old URLs
   until Google has picked up the `/en/` equivalents.

Fixed while migrating: pair pages previously printed template instructions as body text ("…Add 2–3 concrete use cases and
one honest limitation."); intros are now built from the format facts. The homepage no longer advertises a `SearchAction`
for a `/search/` page that does not exist.

## open-online.com

The sister site for *opening* (not converting) files is linked from the navigation, the footer, a callout on every
converter / format / category page, and the homepage. The URL lives in one constant, `OPEN_ONLINE_URL` in `build.js`
(currently the site's homepage — it has no sub-pages yet; point it at per-format URLs once they exist).

## How a converter page works

1. `lib/converters.js` → `getConverterConfig(from, to, slug)` maps a page to a converter script plus CDN libraries.
2. The script sets `window.performConversion(input)` (`File` for uploads, `string` for pasted text) and returns
   `{ blob, filename }`, or `{ printMode: true, printFn }` for print-based PDF output.
3. `assets/js/site.js` wires the widget (drop zone, paste tab, convert/download) around that contract.
4. User-visible strings in scripts go through `__t('English text', {vars})`; error messages thrown with
   `new Error('English text')` are translated automatically where they are shown. Add the translations to
   `i18n/<code>/js.js` (a trailing `*` in a key matches a message with a variable tail).

Engines: Canvas (images), ffmpeg.wasm (audio/video/TIFF/GIF, ~31 MB, loaded lazily on first conversion), pdf.js,
pdf-lib, jsPDF, mammoth, markdown-it, turndown, SheetJS, js-yaml, heic2any, Tesseract.js (OCR).

## Adding a converter

1. Add a row to `page_map.csv` (unique ID, slug, English title/meta/H1, formats, priority, `Parent Hub`).
2. Map it to a script in `lib/converters.js`; write the script in `assets/js/converters/`.
3. New format? Add it to `i18n/en/formats.js` **and** to `i18n/de|cs|pl/formats.js`.
4. Pages that are not an ordinary "A to B" pair (same source and target, or anything under `/data/`) need an entry in
   `tools{}` in every locale's `ui.js` (name, title, meta, h1, optional button label `action` and intro `value`).
5. `node build.js && node scripts/verify.js`, then test with a real file (`npx serve -p 4200 .`).

Ordinary pairs need no translation work: their titles, descriptions and copy come from the locale templates.

## Adding a language

1. Create `i18n/<code>/` with `ui.js`, `formats.js`, `tpl.js` and `js.js`. Start by copying the German files
   (`i18n/de/`) — English has no `tpl.js`/`js.js` because it needs no translation. Mind plurals: the existing locales
   phrase counts as "label: number", so one string works for 1, 2–4 and 5+.
2. Add `{ code, name, short, htmlLang, ogLocale, dateLocale, ocr }` to `ALL_LANGS` in `i18n/index.js` (`ocr` is the
   Tesseract language code used as the OCR dropdown default).
3. `node build.js` tells you exactly which strings are still missing. `scripts/verify.js` checks the rest.
4. Nothing else to wire up: the language switcher, hreflang tags, sitemap, router and old-URL redirects all read the
   language list.

## Known limitations

- **Imprint / legal copy** is a translation of the existing short texts. A commercial site operated from Germany or
  Austria needs the operator's name and address in the *Impressum*; that information is not in the repository.
- Browser-native parse errors (e.g. the tail of `Invalid JSON: …`) stay in the browser's own language.
- PDF watermarks use PDF's built-in font, which cannot draw letters like ů, ě, ł, ą; those are folded to base letters
  and the user is told.
- HEIC *encoding* needs Safari 17+ (no browser encoder exists elsewhere); the pages say so.
- `assets/img/og-image.png` is referenced by every page's Open Graph tags but does not exist yet.

## Deployment

Push to `main` → GitHub Pages serves the repo root at **aintob.com**.
