# AintoB.com — Browser-Based File Converter Suite

**210 static pages** generated from `page_map.csv` · Pure HTML/CSS/JS · No backend · No uploads

Every conversion runs entirely in the visitor's browser (Canvas, File API, Web Workers,
WASM). Nothing is ever sent to a server, which makes the site private by design and free
to host on any static host (currently GitHub Pages, see `CNAME`).

## Architecture

```
/
├── build.js            ← Static site generator (plain Node.js, no dependencies)
├── page_map.csv        ← Source of truth: one row per page (SEO copy, formats, priority)
├── assets/
│   ├── css/
│   │   ├── base.css    ← Design tokens + Bootstrap overrides
│   │   └── site.css    ← Component styles (grids, cards, converter widget)
│   └── js/
│       ├── site.js     ← Shared widget logic: drag-drop, tabs, convert/download flow
│       └── converters/ ← One script per converter (loaded only on pages that need it)
├── sitemap.xml         ← Generated (166 indexable URLs)
├── robots.txt          ← Generated
└── image/ document/ spreadsheet/ audio/ video/ data/ …   ← Generated pages
```

### Rebuild

```
node build.js
```

Reads `page_map.csv`, writes every page to the repo root, regenerates `sitemap.xml` and
`robots.txt`. Pages with Page Type `Custom` (hand-built tools like `/document/pdf-edit/`)
are left untouched but stay in the sitemap.

### How a converter page works

1. `build.js` → `getConverterConfig(from, to, slug)` maps each page to a converter script
   plus any CDN libraries it needs. These are appended as `<script defer>` tags.
2. The page's converter script sets `window.performConversion(input)` where `input` is a
   `File` (upload) or `string` (paste mode). It returns `{ blob, filename }` — or
   `{ printMode: true, printFn }` for print-based PDF output.
3. `assets/js/site.js` wires the widget UI (drop zone, paste tab, convert button,
   download button) around that contract.

Converter scripts can inject extra controls into `#converterSettings` / `#panelPaste`
(see `image-resize.js` or `data-convert.js` for the pattern).

### Adding a new converter

1. Add a row to `page_map.csv` (copy a similar row; unique ID, slug, SEO title/meta/H1,
   keywords, `Parent Hub`, Priority). If the format is new, add it to the `FMT`
   knowledge base in `build.js`.
2. Map the page to a script in `getConverterConfig()` in `build.js`.
3. Write the script in `assets/js/converters/` implementing `window.performConversion`.
4. `node build.js`, then test with a real file at `npx serve -p 4200 .`.

## Converter engines

| Engine | Used for | Loaded |
|--------|----------|--------|
| Canvas API | Image ↔ image (PNG, JPG, WebP, AVIF, BMP, ICO), resize, compress | native |
| ffmpeg.wasm (~31 MB, single-thread core) | All audio & video pages, TIFF pairs, X→GIF | lazily on first conversion, cached |
| pdf.js / pdf-lib / jsPDF | PDF read, edit, create | CDN per page |
| mammoth / markdown-it / turndown / html-docx | Word, Markdown, HTML documents | CDN per page |
| SheetJS (xlsx) | CSV, TSV, Excel, ODS | CDN per page |
| js-yaml | JSON ↔ YAML | CDN per page |
| Tesseract.js | OCR (searchable PDF) | lazily |
| heic2any | HEIC decode | CDN per page |
| Native JS | JSON/CSV/XML/Base64/URL/case text tools | — |

"To PDF" text converters use a print-window flow (`window.print()` → Save as PDF) for
honest, high-fidelity output instead of a lossy client-side PDF renderer.

## Tool categories (210 pages)

- **Image**: AVIF, BMP, GIF, HEIC, ICO, JPG, PNG, SVG, TIFF, WebP conversions, plus
  Image Resizer and Image Compressor.
- **Document**: PDF, Word, HTML, Markdown, RTF, TXT — plus the hand-built PDF Editor
  (merge/split/rotate/watermark) and PDF OCR (searchable PDF) tools.
- **Spreadsheet**: CSV, TSV, Excel, ODS.
- **Audio**: MP3, WAV, M4A, OGG + audio extraction from MP4/MOV/AVI/WebM — via ffmpeg.wasm.
- **Video**: MP4, MOV, AVI, WebM, GIF — via ffmpeg.wasm.
- **Data & Text**: JSON↔CSV, JSON↔YAML, XML→JSON, JSON Formatter & Minifier,
  Base64 encode/decode, URL encode/decode, Case Converter.

## SEO

- Unique `<title>`, meta description, H1, and format-specific body copy per page
- Canonical, Open Graph, and Twitter card tags on every page
- JSON-LD: SoftwareApplication + FAQPage on tool pages, CollectionPage + BreadcrumbList
  on hubs, WebSite + SearchAction on the homepage
- Internal linking: breadcrumbs, related-converter grids, reverse-conversion links,
  format hubs, category hubs
- `sitemap.xml` (priorities + change frequencies) and `robots.txt` generated on build
- Skip-to-content link, semantic HTML, WCAG-AA-minded markup

## Deployment

Push to `main` → GitHub Pages serves the repo root at **aintob.com**.
