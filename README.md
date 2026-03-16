# AintoB.com — Static Site Generator

**186 pages** generated from `page_map.csv` · Bootstrap 5.3 · GDPR-ready · SEO-optimised

## Architecture

Plain Node.js static site generator. No framework dependencies.

```
/
├── build.js           ← Generator (run this to rebuild)
├── page_map.csv       ← Source of truth for all pages
├── assets/
│   ├── css/
│   │   ├── base.css   ← Design tokens + Bootstrap overrides
│   │   └── site.css   ← Component styles (grids, cards, widgets)
│   └── js/
│       └── site.js    ← Cookie banner + converter UI + fade-in
├── sitemap.xml        ← Generated (140 indexable URLs)
├── robots.txt         ← Generated
└── [all page dirs]    ← Generated from CSV
```

## To Regenerate

1. Update `page_map.csv` with new rows
2. Run:
   ```
   node build.js
   ```
3. All pages are written directly to the repo root (served by GitHub Pages)

## Page Types

| Type | Count | Template |
|------|-------|----------|
| Homepage | 1 | `buildHomepage()` |
| Master Hub (`/file-converter/`) | 1 | `buildMasterHub()` |
| Category Hubs | 5 | `buildCategoryHub()` |
| Format Hubs | 26 | `buildFormatHub()` |
| Pair Converters | 151 | `buildPairPage()` |
| Static (privacy, imprint) | 2 | Inline |

## SEO Features

- Unique `<title>` and `<meta description>` from CSV
- `<link rel="canonical">` on every page
- `<meta name="robots" noindex>` on "Index after QA" pages
- BreadcrumbList schema on all pages
- FAQPage schema on hub and pair pages
- SoftwareApplication schema on pair pages
- WebSite + SearchAction schema on homepage
- 6,699 internal crawlable links across the site
- sitemap.xml with priorities and change frequencies
- Skip-to-content link for accessibility (WCAG AA)

## Deployment

This repo is configured for GitHub Pages (see `CNAME`).
Push to `main` → site deploys at `aintob.com`.
