#!/usr/bin/env node
/**
 * AintoB.com Static Site Generator
 * ─────────────────────────────────
 * Reads page_map.csv and generates all static HTML pages.
 *
 * Usage:
 *   node build.js
 *
 * Output: all pages written to the repo root (served by GitHub Pages).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const ROOT   = __dirname;
const DOMAIN = 'https://aintob.com';
const YEAR   = new Date().getFullYear();

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseCSVRow(line);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseCSVRow(row) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') {
      if (inQ && row[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

// ─── Format Knowledge Base ────────────────────────────────────────────────────
const FMT = {
  AVIF: {
    fullName: 'AV1 Image File Format',
    ext: '.avif', mime: 'image/avif', category: 'image',
    icon: '🖼️',
    description: 'AVIF is a next-generation image format developed by the Alliance for Open Media. It offers significantly better compression than JPG or WebP while maintaining high visual quality, supporting HDR, wide color gamut, and transparency.',
    useCases: ['Optimising images for web performance and Core Web Vitals', 'Reducing bandwidth costs on high-traffic sites', 'Storing HDR photography with modern devices'],
    limitation: 'Browser support is growing but not universal — older browsers do not support AVIF and will need a fallback format.',
    compat: 'Chrome 85+, Firefox 93+, Safari 16+, Edge 121+.',
  },
  GIF: {
    fullName: 'Graphics Interchange Format',
    ext: '.gif', mime: 'image/gif', category: 'image',
    icon: '🎞️',
    description: 'GIF is one of the oldest web image formats, dating back to 1987. It supports simple frame-by-frame animations and is limited to a 256-colour palette per frame. Despite its age, GIF remains ubiquitous for short looping animations and reactions across social platforms and messaging apps.',
    useCases: ['Short looping animations and reaction clips', 'Simple animated banners or loading indicators', 'Platform-compatible animated images for messaging apps'],
    limitation: 'Limited to 256 colours per frame — unsuitable for photographs or images with complex gradients.',
    compat: 'Universal — supported in every browser, email client, and messaging platform.',
  },
  HEIC: {
    fullName: 'High Efficiency Image Container',
    ext: '.heic', mime: 'image/heic', category: 'image',
    icon: '📷',
    description: 'HEIC is the photo format used by Apple devices since iOS 11. Based on the HEIF standard with H.265 compression, HEIC files are roughly half the size of equivalent JPGs while maintaining superior image quality. They also support depth maps, transparency, and multi-image sequences for Live Photos.',
    useCases: ['Sharing photos taken on iPhone or iPad', 'Reducing iCloud storage with smaller file sizes', 'Archiving high-quality iPhone photography for editing'],
    limitation: 'Limited native support outside Apple ecosystems — Windows, Android, and many apps require conversion or a codec plugin.',
    compat: 'Native on iOS 11+, macOS High Sierra+. Requires plugins or conversion for Windows and Android.',
  },
  JPG: {
    fullName: 'Joint Photographic Experts Group',
    ext: '.jpg', mime: 'image/jpeg', category: 'image',
    icon: '🌅',
    description: "JPG (or JPEG) is the world's most widely used image format for photographs. Lossy compression achieves small file sizes at the cost of some image detail — a trade-off that works well for natural scenes and photographs where minor quality loss is imperceptible.",
    useCases: ['Sharing photographs online and via email', 'Uploading images to social media platforms', 'Storing camera photos with manageable file sizes'],
    limitation: 'Lossy compression permanently discards image data. JPG is unsuitable for text-heavy images, logos, or files that require repeated editing.',
    compat: 'Universal — supported by every browser, OS, device, and image application on the planet.',
  },
  PNG: {
    fullName: 'Portable Network Graphics',
    ext: '.png', mime: 'image/png', category: 'image',
    icon: '🏳️',
    description: 'PNG uses lossless compression, preserving every pixel of the original without any quality degradation. It supports full alpha-channel transparency, making it ideal for logos, icons, UI elements, and any image that requires a transparent background or pixel-perfect fidelity.',
    useCases: ['Logos and icons requiring crisp transparency', 'Screenshots and interface mockups', 'Images requiring repeated editing without any quality loss'],
    limitation: 'PNG files are significantly larger than JPG for photographic content — not ideal for photos on bandwidth-constrained sites.',
    compat: 'Universal — supported by all browsers, operating systems, and image editors.',
  },
  SVG: {
    fullName: 'Scalable Vector Graphics',
    ext: '.svg', mime: 'image/svg+xml', category: 'image',
    icon: '📐',
    description: 'SVG is an XML-based vector format. Unlike raster formats, SVG images scale to any size without losing sharpness — perfect for logos, icons, illustrations, and any graphic that must look crisp on retina displays or at large print sizes.',
    useCases: ['Website logos and icons that scale across resolutions', 'Infographics and interactive data visualisations', 'Print-ready artwork requiring sharp edges at any size'],
    limitation: 'Not suitable for photographs or complex raster imagery. SVG works best with geometric shapes and flat-colour illustrations.',
    compat: 'Supported by all modern browsers. Can be embedded directly in HTML.',
  },
  TIFF: {
    fullName: 'Tagged Image File Format',
    ext: '.tiff', mime: 'image/tiff', category: 'image',
    icon: '🗂️',
    description: 'TIFF is the professional standard for archival-quality image storage. It supports lossless compression, multiple layers, and high colour depth — making it the preferred format for print production, document scanning, and archival photography where maximum image fidelity is non-negotiable.',
    useCases: ['Archiving scanned documents and artwork at full quality', 'Print production and publishing pre-press workflows', 'Medical and scientific imaging requiring maximum fidelity'],
    limitation: 'Very large file sizes make TIFF impractical for web use or casual sharing. Most web browsers do not support TIFF natively.',
    compat: 'Supported by professional tools (Photoshop, GIMP, Lightroom), but not by most web browsers or basic viewers.',
  },
  WebP: {
    fullName: 'Web Picture Format',
    ext: '.webp', mime: 'image/webp', category: 'image',
    icon: '🌐',
    description: "WebP is a modern image format developed by Google for the web. It delivers superior lossless and lossy compression compared to PNG and JPG — WebP images are typically 25–35% smaller than equivalent JPGs at the same visual quality — while also supporting transparency and animation.",
    useCases: ['Optimising images for faster web performance', 'Reducing page load times on image-heavy websites', 'Web images requiring transparency without PNG file sizes'],
    limitation: "Older versions of Safari and some legacy apps have limited WebP support, though compatibility is now near-universal in modern browsers.",
    compat: 'Chrome, Firefox, Edge, Safari 14+, and most modern applications.',
  },
  HTML: {
    fullName: 'HyperText Markup Language',
    ext: '.html', mime: 'text/html', category: 'document',
    icon: '🌐',
    description: 'HTML is the standard markup language for web content. HTML files describe the structure of a webpage — headings, paragraphs, links, images, tables — using a hierarchy of elements and tags. It is the universal output format for web content and can be converted to and from document and plain-text formats.',
    useCases: ['Exporting web content for offline reading', 'Converting web pages to editable documents', 'Archiving HTML reports as PDFs or plain text'],
    limitation: 'Complex layouts, JavaScript interactions, and external resources (CSS, images) may not translate accurately when converting HTML to other formats.',
    compat: 'Universal — every browser natively renders HTML.',
  },
  Markdown: {
    fullName: 'Markdown',
    ext: '.md', mime: 'text/markdown', category: 'document',
    icon: '📝',
    description: 'Markdown is a lightweight, human-readable plain-text formatting syntax created by John Gruber and Aaron Swartz. Simple punctuation marks up headings, bold, italics, links, code, and lists — and it converts cleanly to HTML. Markdown is the de-facto standard for README files, documentation, and technical writing.',
    useCases: ['Writing documentation and README files for code repositories', 'Blog posts and technical articles in static-site generators', 'Converting to HTML or PDF for publication and sharing'],
    limitation: 'Different Markdown flavours (CommonMark, GFM, kramdown) have slightly different syntax — complex tables or custom extensions may not convert perfectly across tools.',
    compat: 'Supported by GitHub, VS Code, Notion, Obsidian, Hugo, Jekyll, and virtually all developer tools.',
  },
  PDF: {
    fullName: 'Portable Document Format',
    ext: '.pdf', mime: 'application/pdf', category: 'document',
    icon: '📄',
    description: "PDF, created by Adobe, is the global standard for sharing documents with fixed layouts. A PDF preserves fonts, images, and formatting identically across all devices and operating systems — what you see on screen is exactly what prints. It is used for contracts, reports, invoices, and official documents worldwide.",
    useCases: ['Sharing reports, invoices, or contracts that must look identical everywhere', 'Archiving documents in a non-editable, print-ready format', 'Combining multiple pages or images into a single shareable file'],
    limitation: 'PDFs are difficult to edit without specialist software. Extracting text or data for re-use in other formats can be imprecise, especially for scanned PDFs.',
    compat: 'Universal — supported natively by every modern OS, browser, and countless applications.',
  },
  RTF: {
    fullName: 'Rich Text Format',
    ext: '.rtf', mime: 'application/rtf', category: 'document',
    icon: '📋',
    description: 'RTF is a document format created by Microsoft in 1987 for cross-platform text exchange. It supports basic formatting — bold, italics, font sizes, colours, and tables — while remaining compatible with virtually every word processor: Microsoft Word, LibreOffice, TextEdit, and WordPad.',
    useCases: ['Exchanging formatted documents across different word processors', 'Basic document compatibility when .docx is not supported', 'Email attachments requiring readable formatting on any system'],
    limitation: 'RTF supports only basic formatting — complex Word layouts, macros, embedded objects, and advanced tables may not transfer correctly.',
    compat: 'Near-universal — readable by Microsoft Word, LibreOffice, Apple Pages, Google Docs, and most word processors.',
  },
  TXT: {
    fullName: 'Plain Text',
    ext: '.txt', mime: 'text/plain', category: 'document',
    icon: '📃',
    description: "Plain text (.txt) files contain unformatted characters with no styling, fonts, or layout. What you see is exactly what is stored — simple characters and line breaks. TXT is the most universally compatible format in computing, readable by literally every text editor, terminal, and programming language without special software.",
    useCases: ['Storing data readable by any system or language', 'Exporting log files, configuration files, or raw data', 'Stripping formatting from a document to access plain content'],
    limitation: 'No support for bold, italics, headings, tables, or any visual formatting — unsuitable for documents requiring visual structure.',
    compat: 'Universal — readable by every OS, text editor, browser, and programming language.',
  },
  Word: {
    fullName: 'Microsoft Word Document',
    ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'document',
    icon: '📝',
    description: "Microsoft Word's .docx format is the world's most widely used word processor format. Word documents support rich formatting — styles, headers, footers, tables, images, tracked changes, and macros — and are the standard for business, academic, and legal documents globally.",
    useCases: ['Business reports, letters, and formal proposals', 'Academic papers and formatted essays requiring citation styles', 'Legal documents requiring tracked changes and precise formatting'],
    limitation: 'Complex Word features — mail merges, macros, specific fonts — may not render identically in non-Microsoft applications.',
    compat: 'Supported by Microsoft Word, LibreOffice, Google Docs, Apple Pages, WPS Office, and most modern productivity applications.',
  },
  CSV: {
    fullName: 'Comma-Separated Values',
    ext: '.csv', mime: 'text/csv', category: 'spreadsheet',
    icon: '📊',
    description: 'CSV is a plain-text format for tabular data where each line represents a row and commas separate column values. It is the most universal data-exchange format — virtually every database, spreadsheet application, CRM, and analytics tool can import and export CSV files without any special configuration.',
    useCases: ['Exporting database records for analysis in Excel or Google Sheets', 'Importing contact lists, product catalogues, or financial records', 'Data exchange between different software systems and APIs'],
    limitation: "CSV has no standard for data types, number formats, or multiple sheets — all values are stored as text. Commas inside values require careful quoting.",
    compat: 'Universal — supported by Excel, Google Sheets, LibreOffice, every database system, and virtually all data tools.',
  },
  Excel: {
    fullName: 'Microsoft Excel Workbook',
    ext: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'spreadsheet',
    icon: '📈',
    description: "Microsoft Excel's .xlsx format is the world's most widely used spreadsheet format. Excel files support multiple sheets, formulas, charts, pivot tables, conditional formatting, macros, and rich cell styling — making them the standard for financial modelling, data analysis, and business reporting.",
    useCases: ['Financial modelling, budgets, and accounting workbooks', 'Data analysis with formulas, pivot tables, and charts', 'Business reports and dashboards shared across teams'],
    limitation: 'Complex formulas, macros, or proprietary Excel features may not convert correctly to other formats or open correctly in non-Microsoft applications.',
    compat: 'Supported by Microsoft Excel, Google Sheets, LibreOffice Calc, Apple Numbers, and most spreadsheet applications.',
  },
  ODS: {
    fullName: 'OpenDocument Spreadsheet',
    ext: '.ods', mime: 'application/vnd.oasis.opendocument.spreadsheet', category: 'spreadsheet',
    icon: '📉',
    description: 'ODS is the open-standard spreadsheet format used by LibreOffice, OpenOffice, and Google Sheets. Part of the ISO-standardised OpenDocument Format, ODS stores spreadsheet data — cells, formulas, charts, and formatting — in an open, non-proprietary way, free from vendor lock-in.',
    useCases: ['LibreOffice and OpenOffice-based workflows', 'Sharing spreadsheets without requiring Microsoft Office', 'Government and academic documents requiring open-format compliance'],
    limitation: 'Some complex Excel formulas, macros, or proprietary chart types may not convert perfectly from or to ODS.',
    compat: 'Native in LibreOffice and OpenOffice. Supported by Google Sheets, Microsoft Excel 2007+, and most modern spreadsheet tools.',
  },
  TSV: {
    fullName: 'Tab-Separated Values',
    ext: '.tsv', mime: 'text/tab-separated-values', category: 'spreadsheet',
    icon: '📋',
    description: 'TSV is a plain-text tabular format similar to CSV but using tab characters as delimiters. Because tabs rarely appear inside data values, TSV avoids the quoting complexity of CSV and is popular in bioinformatics, database exports, and scientific data exchange.',
    useCases: ['Exporting database tables where comma-separated values would be ambiguous', 'Bioinformatics and scientific data exchange between tools', 'Data imports into tools that prefer tab delimiters over commas'],
    limitation: 'Like CSV, TSV has no native support for formatting, multiple sheets, or typed data — all values are plain text.',
    compat: 'Supported by Excel, Google Sheets, most database clients, and any text editor.',
  },
  M4A: {
    fullName: 'MPEG-4 Audio',
    ext: '.m4a', mime: 'audio/mp4', category: 'audio',
    icon: '🎵',
    description: "M4A is Apple's container format for AAC-encoded audio. It delivers excellent audio quality at low bitrates — significantly better than MP3 at equivalent sizes — and is the default format for Apple Music, iTunes purchases, and voice recordings on Apple devices.",
    useCases: ['Music from Apple Music or iTunes', 'High-quality audio on Apple devices (iPhone, iPad, Mac)', 'Podcast audio and voice recordings within the Apple ecosystem'],
    limitation: 'Some older devices and media players may not support .m4a files and require conversion to MP3.',
    compat: 'Native on Apple devices, iTunes, QuickTime, and most modern media players including VLC and Windows Media Player.',
  },
  MP3: {
    fullName: 'MPEG Audio Layer III',
    ext: '.mp3', mime: 'audio/mpeg', category: 'audio',
    icon: '🎶',
    description: "MP3 is the world's most widely supported audio format. Introduced in 1993, it uses psychoacoustic compression to dramatically reduce file sizes while preserving perceptible audio quality. Despite newer formats existing, MP3's universal compatibility makes it the default for music, podcasts, and voice recordings.",
    useCases: ['Music libraries, playlists, and portable players', 'Podcast distribution and audio content delivery', 'Voice recordings, interviews, and audio messages'],
    limitation: 'Lossy compression permanently discards some audio data. At very low bitrates, quality degradation becomes audible.',
    compat: 'Universal — supported by every device, browser, media player, and platform.',
  },
  OGG: {
    fullName: 'Ogg Vorbis',
    ext: '.ogg', mime: 'audio/ogg', category: 'audio',
    icon: '🎼',
    description: 'OGG is an open, royalty-free audio container format developed by Xiph.Org, typically using the Vorbis codec. OGG Vorbis delivers audio quality comparable to MP3 and AAC without any licensing restrictions, making it popular in open-source applications, web games, Linux systems, and browser-based audio.',
    useCases: ['Open-source applications and games requiring royalty-free audio', 'Web audio where royalty-free browser-native support is needed', 'Linux and open-source desktop audio applications'],
    limitation: 'Limited support on Apple devices — Safari and iOS do not support OGG natively and require a JavaScript fallback.',
    compat: 'Chrome, Firefox, Android, VLC, and most open-source players. Not natively supported by Safari or iOS.',
  },
  WAV: {
    fullName: 'Waveform Audio File Format',
    ext: '.wav', mime: 'audio/wav', category: 'audio',
    icon: '🔊',
    description: "WAV is Microsoft's uncompressed audio format and the standard for professional audio production. WAV files contain raw PCM audio data with no compression, delivering lossless quality. This makes WAV the preferred format for recording studios, audio editors, broadcast production, and any workflow requiring pristine, unaltered audio.",
    useCases: ['Professional audio recording and studio production', 'Intermediate format during editing to avoid quality loss', 'Audio samples, sound effects, and broadcast-ready masters'],
    limitation: 'Very large file sizes — uncompressed audio can be 10× the size of an equivalent MP3. Not practical for storage or streaming at scale.',
    compat: 'Universal — supported by every professional audio application, DAW, media player, and most devices.',
  },
  AVI: {
    fullName: 'Audio Video Interleave',
    ext: '.avi', mime: 'video/x-msvideo', category: 'video',
    icon: '🎥',
    description: 'AVI is one of the oldest video container formats, introduced by Microsoft in 1992. While largely superseded by MP4 for most purposes, AVI remains widely recognised and stored in archives. It can contain video encoded with various codecs (DivX, XviD, H.264) alongside audio tracks.',
    useCases: ['Playing back legacy video files from older archives', 'Compatibility with older video editing software', 'Windows-native and industrial applications still using AVI'],
    limitation: 'AVI has poor support for modern codecs, does not support streaming, and generally produces larger files than MP4.',
    compat: 'Supported by Windows Media Player, VLC, and most video players. Modern browsers do not support AVI natively.',
  },
  MOV: {
    fullName: 'QuickTime Movie',
    ext: '.mov', mime: 'video/quicktime', category: 'video',
    icon: '🎬',
    description: "MOV is Apple's QuickTime container format, introduced in 1991. It is the native format for video recorded on iPhone, iPad, and Mac cameras, and is widely used in professional video production on macOS. MOV files typically use H.264 or H.265 encoding and support multiple audio tracks.",
    useCases: ['Raw video from iPhone, iPad, or Mac cameras', 'Professional video editing in Final Cut Pro or other macOS tools', 'High-quality video sharing within the Apple ecosystem'],
    limitation: 'MOV files can be large and may need conversion for Windows compatibility or reliable web playback.',
    compat: 'Natively supported on macOS and iOS. VLC handles MOV on Windows. Not natively supported in most web browsers.',
  },
  MP4: {
    fullName: 'MPEG-4 Part 14',
    ext: '.mp4', mime: 'video/mp4', category: 'video',
    icon: '🎦',
    description: "MP4 is the world's most widely supported video container format. It efficiently stores video (H.264 or H.265), audio, and subtitles in a single file with excellent compression. MP4 is the standard for streaming platforms, social media, mobile devices, and video sharing — if you need one video format that works everywhere, MP4 is it.",
    useCases: ['Video for YouTube, social media, and streaming services', 'Recording and sharing video on any mobile device', 'Web-embedded video that plays in all browsers'],
    limitation: 'MP4 with H.264 is widely supported but not fully open — H.264 is patent-encumbered, and H.265 has even more complex licensing.',
    compat: 'Universal — supported by every browser, device, operating system, and video platform.',
  },
  WebM: {
    fullName: 'WebM Video',
    ext: '.webm', mime: 'video/webm', category: 'video',
    icon: '🌐',
    description: "WebM is an open, royalty-free video format developed by Google for web delivery. It uses VP8/VP9 or AV1 video with Vorbis or Opus audio — providing excellent compression and quality for streaming without codec licensing costs. WebM is the preferred open format for HTML5 video in browsers that avoid proprietary codecs.",
    useCases: ['Open-source and royalty-free web video without licensing concerns', 'Browser-based video in HTML5 players', 'Web applications and games using open video formats'],
    limitation: 'Limited native support on Apple devices — Safari does not support VP8/VP9 WebM well; iOS and macOS prefer H.264 MP4.',
    compat: 'Chrome, Firefox, Edge, Android. Limited or no support on Safari and iOS without workarounds.',
  },
};

// Normalise lookup key
function fmtKey(name) {
  if (!name) return '';
  const n = name.trim();
  // Handle aliases
  const aliases = { JPEG: 'JPG', HEIF: 'HEIC', DOCX: 'Word', DOC: 'Word',
    XLSX: 'Excel', XLS: 'Excel', HTM: 'HTML', MD: 'Markdown', TIF: 'TIFF', OGV: 'OGG' };
  return aliases[n.toUpperCase()] || n.charAt(0).toUpperCase() + n.slice(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slugToPath(slug) {
  // '/image/jpg-to-png/' → 'image/jpg-to-png/index.html'
  return slug.replace(/^\//, '').replace(/\/$/, '') + '/index.html';
}

function writeFile(relPath, content) {
  const abs = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleCase(str) {
  return (str || '').replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function categoryLabel(cat) {
  const map = {
    image: 'Image', document: 'Document', spreadsheet: 'Spreadsheet',
    audio: 'Audio', video: 'Video', all: 'All'
  };
  const base = cat.split('→')[0];
  return map[base] || titleCase(base);
}

function categoryHub(cat) {
  const base = cat.split('→')[0];
  const slugs = {
    image: '/image-converter/', document: '/document-converter/',
    spreadsheet: '/spreadsheet-converter/', audio: '/audio-converter/', video: '/video-converter/'
  };
  return slugs[base] || '/file-converter/';
}

function categoryIcon(cat) {
  const base = cat.split('→')[0];
  const icons = { image: '🖼️', document: '📄', spreadsheet: '📊', audio: '🎵', video: '🎬', all: '🔄' };
  return icons[base] || '🔄';
}

// ─── Markdown Converter Configs ──────────────────────────────────────────────
// Per-page CDN libraries + converter script for browser-side Markdown conversion.
// Consumed by buildPairPage() to inject the right scripts into each page.
const MARKDOWN_CONVERTER_CONFIGS = {
  '/document/markdown-to-html/': {
    textMode: true,
    libs: ['https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js'],
    converterScript: '/assets/js/converters/md-to-html.js',
  },
  '/document/html-to-markdown/': {
    textMode: true,
    libs: ['https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.min.js'],
    converterScript: '/assets/js/converters/html-to-md.js',
  },
  '/document/markdown-to-pdf/': {
    textMode: false,
    libs: [
      'https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js',
      'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.4/dist/html2pdf.bundle.min.js',
    ],
    converterScript: '/assets/js/converters/md-to-pdf.js',
  },
  '/document/markdown-to-word/': {
    textMode: false,
    libs: [
      'https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js',
      'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js',
    ],
    converterScript: '/assets/js/converters/md-to-word.js',
  },
  '/document/word-to-markdown/': {
    textMode: false,
    libs: [
      'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
      'https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.min.js',
    ],
    converterScript: '/assets/js/converters/word-to-md.js',
  },
  '/document/markdown-to-txt/': {
    textMode: true,
    libs: [],
    converterScript: '/assets/js/converters/md-to-txt.js',
  },
  '/document/txt-to-markdown/': {
    textMode: true,
    libs: [],
    converterScript: '/assets/js/converters/txt-to-md.js',
  },
};

// ─── HTML Components ──────────────────────────────────────────────────────────

function head({ title, desc, canonical, robots, schema, ogTitle }) {
  const robo = robots || 'index, follow';
  const og   = ogTitle || title;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="${robo}">
  <link rel="canonical" href="${DOMAIN}${canonical}">

  <!-- Open Graph -->
  <meta property="og:title" content="${esc(og)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${DOMAIN}${canonical}">
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

  <!-- Schema -->
  ${schema ? `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>` : ''}
</head>
<body>`;
}

function skipLink() {
  return `<a class="skip-link" href="#main-content">Skip to main content</a>`;
}

function navbar() {
  return `<nav class="navbar-aintob" aria-label="Main navigation">
  <div class="container" style="max-width:var(--max-width); display:flex; align-items:center; justify-content:space-between;">
    <a href="/" class="navbar-logo" aria-label="AintoB home">🅰️➡️🅱️ <span style="font-size:1rem; font-weight:500; color:var(--color-text-muted);">AintoB</span></a>
    <nav aria-label="Site navigation" style="display:flex; align-items:center; gap:0.75rem;">
      <a href="/file-converter/" class="navbar-tools-link"><i class="bi bi-grid-3x3-gap" aria-hidden="true"></i> All Converters</a>
    </nav>
  </div>
</nav>`;
}

function breadcrumbs(items) {
  // items: [{label, href}]
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((it, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": it.label,
      "item": it.href ? `${DOMAIN}${it.href}` : undefined
    }))
  };
  const html = items.map((it, i) => {
    const isLast = i === items.length - 1;
    return isLast
      ? `<li class="breadcrumb-item active" aria-current="page">${esc(it.label)}</li>`
      : `<li class="breadcrumb-item"><a href="${it.href}">${esc(it.label)}</a></li>`;
  }).join('\n');
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>
<nav aria-label="Breadcrumb" class="breadcrumb-nav">
  <div class="container" style="max-width:var(--max-width);">
    <ol class="breadcrumb mb-0" style="padding: 0.625rem 0; font-size: var(--text-sm);">
      <li class="breadcrumb-item"><a href="/">Home</a></li>
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
      <strong>100% Private &amp; Browser-Based</strong>
      <p>Your files never leave your device. All conversion happens locally in your browser — nothing is uploaded to any server. No sign-up required.</p>
    </div>
  </div>
</div>`;
}

function featureCards() {
  const features = [
    { icon: 'bi-lightning-charge-fill', title: 'Instant', text: 'Results in milliseconds. No queues, no waiting, no server round-trips.' },
    { icon: 'bi-shield-lock-fill', title: 'Private', text: 'Your data never leaves your browser. Zero server storage, zero uploads.' },
    { icon: 'bi-phone', title: 'Mobile-friendly', text: 'Works flawlessly on any device — phone, tablet, or desktop.' },
    { icon: 'bi-star-fill', title: 'Always Free', text: 'No sign-up, no subscription, no hidden costs. Free forever.' },
  ];
  return `<section class="section-features" aria-labelledby="why-aintob">
  <div class="container" style="max-width:var(--max-width);">
    <div class="text-center mb-5">
      <p class="section-label">Why AintoB?</p>
      <h2 class="section-title" id="why-aintob">Built for Speed, Privacy &amp; Simplicity</h2>
      <p class="section-sub mx-auto">No installs, no accounts, no file uploads. Every conversion runs entirely in your browser.</p>
    </div>
    <div class="row g-4">
      ${features.map(f => `<div class="col-sm-6 col-lg-3">
        <div class="feature-card">
          <div class="feature-icon mx-auto"><i class="bi ${f.icon}" aria-hidden="true"></i></div>
          <h3 class="feature-title">${f.title}</h3>
          <p class="feature-text">${f.text}</p>
        </div>
      </div>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

function faqBlock(faqs) {
  const schemaItems = faqs.map(f => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } }));
  const schema = { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": schemaItems };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>
<section class="section-faq" aria-labelledby="faq-heading">
  <div class="container" style="max-width:800px;">
    <div class="text-center mb-5">
      <p class="section-label">FAQ</p>
      <h2 class="section-title" id="faq-heading">Frequently Asked Questions</h2>
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

function footer(extraLinks, extraScripts) {
  const links = [
    { label: 'All Converters', href: '/file-converter/' },
    { label: 'Image Converters', href: '/image-converter/' },
    { label: 'Document Converters', href: '/document-converter/' },
    { label: 'Spreadsheet Converters', href: '/spreadsheet-converter/' },
    { label: 'Audio Converters', href: '/audio-converter/' },
    { label: 'Video Converters', href: '/video-converter/' },
    ...(extraLinks || []),
    { label: 'Privacy Policy', href: '/privacy/' },
    { label: 'Imprint', href: '/imprint/' },
  ];
  return `<footer class="footer-main" role="contentinfo">
  <div class="container" style="max-width:var(--max-width);">
    <div class="d-flex flex-wrap align-items-start justify-content-between gap-4">
      <div>
        <a href="/" class="footer-logo" aria-label="AintoB home">🅰️➡️🅱️ AintoB</a>
        <p class="footer-copy">© ${YEAR} AintoB.com – All rights reserved.</p>
        <p class="footer-gdpr-badge"><i class="bi bi-shield-check" aria-hidden="true"></i> Privacy-first · Browser-only · No uploads</p>
      </div>
      <nav aria-label="Footer navigation">
        <ul class="footer-links">
          ${links.map(l => `<li><a href="${l.href}">${esc(l.label)}</a></li>`).join('\n          ')}
        </ul>
      </nav>
    </div>
  </div>
</footer>

<!-- Cookie Banner -->
<div id="cookie-banner" role="dialog" aria-label="Cookie preferences" aria-live="polite">
  <div class="container" style="max-width:var(--max-width); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:1rem;">
    <p class="cookie-text mb-0">We use essential cookies only. No tracking without your consent. <a href="/privacy/">Privacy Policy</a></p>
    <div style="display:flex; gap:.5rem;">
      <button class="btn btn-primary btn-sm" onclick="acceptCookies('all')">Accept All</button>
      <button class="btn btn-outline-secondary btn-sm" onclick="acceptCookies('essential')">Essential Only</button>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>
<script src="/assets/js/site.js" defer></script>
${(extraScripts || []).map(s => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>`;
}

// ─── Converter Widget ─────────────────────────────────────────────────────────
// textMode: boolean — if true, shows a "Paste Text" tab alongside the file upload.
function converterWidget(from, to, pageSlug, textMode) {
  const fromInfo = FMT[fmtKey(from)] || {};
  const toInfo   = FMT[fmtKey(to)]   || {};
  const fromLower = (from || 'file').toLowerCase();

  const textPanel = textMode ? `
      <!-- Text Paste Panel (shown when "Paste Text" tab is active) -->
      <div id="panelPaste" class="converter-panel" hidden role="tabpanel" aria-labelledby="tabPaste">
        <label class="converter-label" for="converterTextArea">Paste your ${esc(from)} content below</label>
        <textarea id="converterTextArea" class="form-control text-editor-area"
          placeholder="Paste your ${esc(from)} content here…"
          rows="12" spellcheck="false" aria-label="Paste ${esc(from)} text"></textarea>
        <button class="btn btn-primary btn-lg w-100 mt-3" id="convertTextBtn">
          <i class="bi bi-arrow-right-circle me-2" aria-hidden="true"></i>Convert to ${esc(to)}
        </button>
      </div>` : '';

  return `<section class="section-converter" id="converter" aria-labelledby="converter-heading">
  <div class="container" style="max-width:800px;">
    <div class="converter-card">
      <h2 class="visually-hidden" id="converter-heading">Convert ${esc(from)} to ${esc(to)}</h2>

      ${textMode ? `<!-- Mode Tabs -->
      <div class="converter-mode-tabs" id="converterModeTabs" role="tablist" aria-label="Input method">
        <button class="converter-mode-tab active" id="tabFile" role="tab" aria-selected="true" aria-controls="panelFile">
          <i class="bi bi-file-earmark-arrow-up" aria-hidden="true"></i> Upload File
        </button>
        <button class="converter-mode-tab" id="tabPaste" role="tab" aria-selected="false" aria-controls="panelPaste">
          <i class="bi bi-keyboard" aria-hidden="true"></i> Paste Text
        </button>
      </div>` : ''}

      <!-- File Upload Panel -->
      <div id="panelFile" class="converter-panel" role="tabpanel" ${textMode ? 'aria-labelledby="tabFile"' : ''}>
        <!-- Drop Zone -->
        <div class="drop-zone" id="dropZone" role="button" tabindex="0" aria-label="Click or drag a ${esc(from)} file here">
          <i class="bi bi-cloud-upload drop-zone__icon" aria-hidden="true"></i>
          <p class="drop-zone__text">Drag &amp; drop your <strong>${esc(from)}</strong> file here</p>
          <p class="drop-zone__sub">or</p>
          <label class="btn btn-primary px-4" for="fileInput">
            <i class="bi bi-folder2-open me-2" aria-hidden="true"></i>Browse File
          </label>
          <input type="file" id="fileInput" class="visually-hidden" accept="${esc(fromInfo.ext || '.*')}"
                 aria-label="Select ${esc(from)} file">
          <p class="drop-zone__limit">Max file size: 50 MB · Your file stays in your browser</p>
        </div>

        <!-- Selected File + Settings -->
        <div class="converter-settings mt-3" id="converterSettings" hidden>
          <div class="d-flex align-items-center gap-3 mb-3 file-selected-row">
            <i class="bi bi-file-earmark-check-fill text-accent" style="font-size:1.5rem;" aria-hidden="true"></i>
            <div class="flex-grow-1">
              <p class="mb-0 fw-600" id="selectedFileName">file.${fromLower}</p>
              <p class="text-muted mb-0" style="font-size:var(--text-sm);" id="selectedFileSize"></p>
            </div>
            <button class="btn btn-outline-secondary btn-sm" id="clearFileBtn" aria-label="Remove file">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>

          <div class="row g-3 align-items-end mb-3">
            <div class="col-sm-5">
              <label class="converter-label" for="inputFormat">From</label>
              <div class="form-control bg-light fw-600">${esc(from)}</div>
            </div>
            <div class="col-sm-2 text-center">
              <div class="converter-arrow mx-auto" id="swapBtn" role="button" tabindex="0" aria-label="Swap conversion direction" title="Swap A ↔ B">
                ⇄
              </div>
            </div>
            <div class="col-sm-5">
              <label class="converter-label" for="outputFormat">To</label>
              <div class="form-control bg-light fw-600">${esc(to)}</div>
            </div>
          </div>

          <button class="btn btn-primary btn-lg w-100" id="convertBtn">
            <i class="bi bi-arrow-right-circle me-2" aria-hidden="true"></i>Convert to ${esc(to)}
          </button>
        </div>
      </div>

      ${textPanel}

      <!-- Output (shared by both modes) -->
      <div class="converter-output mt-3" id="converterOutput" hidden>
        <div class="output-success-row d-flex align-items-center gap-3 mb-3">
          <i class="bi bi-check-circle-fill text-success" style="font-size:1.5rem;" aria-hidden="true"></i>
          <p class="mb-0 fw-600">Conversion complete!</p>
        </div>
        <button class="btn btn-primary btn-lg w-100 mb-2" id="downloadBtn">
          <i class="bi bi-download me-2" aria-hidden="true"></i>Download ${esc(to)} File
        </button>
        <button class="btn btn-outline-secondary w-100" id="convertAnotherBtn">Convert another file</button>
      </div>

      <!-- Privacy note -->
      <p class="mode-desc mt-2">
        <i class="bi bi-shield-lock-fill text-accent" aria-hidden="true"></i>
        Your file is processed locally in your browser — nothing is ever uploaded.
      </p>
    </div>
  </div>
</section>`;
}

// ─── Related Converters Grid ──────────────────────────────────────────────────
function relatedGrid(title, pages, maxShow) {
  if (!pages || !pages.length) return '';
  const show = pages.slice(0, maxShow || 12);
  return `<section class="related-section" aria-labelledby="related-${title.toLowerCase().replace(/\s/g,'-')}">
  <div class="container" style="max-width:var(--max-width);">
    <h2 class="section-title mb-4" id="related-${title.toLowerCase().replace(/\s/g,'-')}">${esc(title)}</h2>
    <div class="converter-grid">
      ${show.map(p => `<a href="${p['URL Slug']}" class="converter-card-link">
        <span class="converter-card-link__label">${esc(p['Page Name'])}</span>
        <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
      </a>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

// ─── Page Templates ───────────────────────────────────────────────────────────

// ── Homepage ──────────────────────────────────────────────────────────────────
function buildHomepage(allPages) {
  const categories = [
    { label: 'Image Converter', icon: '🖼️', href: '/image-converter/', desc: 'JPG, PNG, WebP, HEIC, AVIF, GIF, SVG, TIFF and more.' },
    { label: 'Document Converter', icon: '📄', href: '/document-converter/', desc: 'PDF, Word, HTML, Markdown, RTF, TXT and more.' },
    { label: 'Spreadsheet Converter', icon: '📊', href: '/spreadsheet-converter/', desc: 'CSV, Excel, ODS, TSV and more.' },
    { label: 'Audio Converter', icon: '🎵', href: '/audio-converter/', desc: 'MP3, WAV, M4A, OGG and more.' },
    { label: 'Video Converter', icon: '🎬', href: '/video-converter/', desc: 'MP4, MOV, WebM, AVI, GIF and more.' },
  ];

  // Popular pages: P1 priority pair pages
  const popular = allPages
    .filter(p => p['Page Type'] === 'Pair' && p['Priority'] === 'P1')
    .slice(0, 12);

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "AintoB.com",
    "url": DOMAIN,
    "description": "Free online converter tools. Convert files, formats and more. Fast, free and privacy-friendly.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": { "@type": "EntryPoint", "urlTemplate": `${DOMAIN}/search/?q={search_term_string}` },
      "query-input": "required name=search_term_string"
    }
  };

  const faqs = [
    { q: 'Is AintoB free to use?', a: 'Yes, every tool on AintoB.com is completely free with no registration or account required. There are no hidden costs or premium tiers.' },
    { q: 'Is my data safe?', a: 'Your files are processed entirely within your browser using local JavaScript. Nothing is ever uploaded to our servers — your data stays on your device from start to finish.' },
    { q: 'What file formats does AintoB support?', a: 'AintoB supports image formats (JPG, PNG, WebP, HEIC, AVIF, GIF, SVG, TIFF), document formats (PDF, Word, HTML, Markdown, RTF, TXT), spreadsheet formats (CSV, Excel, ODS, TSV), audio formats (MP3, WAV, M4A, OGG), and video formats (MP4, MOV, WebM, AVI).' },
    { q: 'Do I need to install anything?', a: 'No. AintoB works entirely in your web browser — no app to download, no plugin to install. Open the page, drop your file, and convert.' },
    { q: 'Are there file size limits?', a: 'For browser-based conversion we recommend files under 50 MB for the best experience. Very large files may take longer to process depending on your device performance.' },
  ];

  return head({
    title: 'AintoB – Free Online File Converter | Privacy-First, Browser-Based',
    desc: 'Convert files online for free. Images, documents, spreadsheets, audio and video — all processed in your browser. No uploads, no sign-up.',
    canonical: '/',
    robots: 'index, follow',
    schema: websiteSchema,
  }) + skipLink() + navbar() + `

<main id="main-content">

  <!-- Hero -->
  <section class="section-hero" aria-labelledby="hero-h1">
    <div class="container text-center" style="max-width:800px;">
      <span class="eyebrow">Free · Private · Browser-Based</span>
      <h1 class="hero-title" id="hero-h1">Convert Anything<br><span class="text-accent">From A to B</span></h1>
      <p class="hero-subtitle mx-auto">Free online file conversion for images, documents, spreadsheets, audio and video. Everything runs in your browser — nothing uploaded, nothing stored.</p>
      <div class="d-flex flex-wrap justify-content-center gap-3 mt-4">
        <a href="/file-converter/" class="btn btn-primary btn-lg px-5">
          <i class="bi bi-grid-3x3-gap me-2" aria-hidden="true"></i>Browse All Converters
        </a>
        <a href="#categories" class="btn btn-outline-secondary btn-lg px-5">Explore Categories</a>
      </div>
    </div>
  </section>

  <!-- Categories -->
  <section class="section-categories" id="categories" aria-labelledby="cat-heading">
    <div class="container" style="max-width:var(--max-width);">
      <div class="text-center mb-5">
        <p class="section-label">File Types</p>
        <h2 class="section-title" id="cat-heading">Choose a Converter Category</h2>
        <p class="section-sub mx-auto">Browse by file type to find the exact converter you need.</p>
      </div>
      <div class="row g-4">
        ${categories.map(c => `<div class="col-sm-6 col-lg-4">
          <a href="${c.href}" class="category-card" aria-label="${c.label}">
            <span class="category-card__icon" aria-hidden="true">${c.icon}</span>
            <h3 class="category-card__title">${c.label}</h3>
            <p class="category-card__desc">${c.desc}</p>
            <span class="category-card__cta">Browse tools <i class="bi bi-arrow-right" aria-hidden="true"></i></span>
          </a>
        </div>`).join('\n        ')}
        <div class="col-sm-6 col-lg-4">
          <a href="/file-converter/" class="category-card category-card--all" aria-label="All converters">
            <span class="category-card__icon" aria-hidden="true">🔄</span>
            <h3 class="category-card__title">All Converters</h3>
            <p class="category-card__desc">Browse the full directory of 150+ conversion tools, organised by format.</p>
            <span class="category-card__cta">View all <i class="bi bi-arrow-right" aria-hidden="true"></i></span>
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- Popular Tools -->
  <section class="section-popular" aria-labelledby="popular-heading">
    <div class="container" style="max-width:var(--max-width);">
      <div class="text-center mb-5">
        <p class="section-label">Most Used</p>
        <h2 class="section-title" id="popular-heading">Popular Converter Tools</h2>
        <p class="section-sub mx-auto">Jump straight to the most searched file conversions.</p>
      </div>
      <div class="converter-grid">
        ${popular.map(p => `<a href="${p['URL Slug']}" class="converter-card-link">
          <span class="converter-card-link__label">${esc(p['Page Name'])}</span>
          <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
        </a>`).join('\n        ')}
      </div>
      <div class="text-center mt-4">
        <a href="/file-converter/" class="btn btn-outline-secondary px-5">View All 150+ Converters</a>
      </div>
    </div>
  </section>

  <!-- Privacy Trust Section -->
  <section class="section-privacy" aria-labelledby="privacy-heading">
    <div class="container" style="max-width:var(--max-width);">
      <div class="row align-items-center g-5">
        <div class="col-lg-6">
          <p class="section-label">Privacy First</p>
          <h2 class="section-title" id="privacy-heading">Your Files Never Leave Your Browser</h2>
          <p class="text-muted">Unlike most online converters, AintoB never uploads your files to a server. Every conversion runs entirely in your browser using local processing — which means:</p>
          <ul class="privacy-list mt-3">
            <li><i class="bi bi-check-circle-fill text-accent" aria-hidden="true"></i> No file uploads — your data stays on your device</li>
            <li><i class="bi bi-check-circle-fill text-accent" aria-hidden="true"></i> No server storage — nothing is saved or logged</li>
            <li><i class="bi bi-check-circle-fill text-accent" aria-hidden="true"></i> No account required — completely anonymous</li>
            <li><i class="bi bi-check-circle-fill text-accent" aria-hidden="true"></i> Works offline after the page loads</li>
          </ul>
        </div>
        <div class="col-lg-6">
          <div class="privacy-illustration">
            <div class="priv-box">
              <i class="bi bi-laptop" style="font-size:3rem; color:var(--color-accent);" aria-hidden="true"></i>
              <p class="fw-600 mb-1 mt-2">Your Browser</p>
              <p class="text-muted" style="font-size:var(--text-sm);">File loaded → Converted → Downloaded</p>
              <div class="priv-badge"><i class="bi bi-shield-check" aria-hidden="true"></i> 100% Local</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="section-how" aria-labelledby="how-heading">
    <div class="container" style="max-width:var(--max-width);">
      <div class="text-center mb-5">
        <p class="section-label">How It Works</p>
        <h2 class="section-title" id="how-heading">Convert Files in Three Steps</h2>
      </div>
      <div class="row g-4 text-center">
        <div class="col-md-4">
          <div class="how-step">
            <div class="how-step__num">1</div>
            <h3 class="how-step__title">Choose a Converter</h3>
            <p class="how-step__desc">Browse by category or format, or search for your exact conversion (e.g. "HEIC to JPG").</p>
          </div>
        </div>
        <div class="col-md-4">
          <div class="how-step">
            <div class="how-step__num">2</div>
            <h3 class="how-step__title">Drop or Select Your File</h3>
            <p class="how-step__desc">Drag and drop your file onto the converter, or click to browse from your device.</p>
          </div>
        </div>
        <div class="col-md-4">
          <div class="how-step">
            <div class="how-step__num">3</div>
            <h3 class="how-step__title">Download the Result</h3>
            <p class="how-step__desc">Click convert and download your file in the new format — ready in seconds.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  ${featureCards()}
  ${faqBlock(faqs)}

</main>

` + footer();
}

// ── Master Hub (/file-converter/) ─────────────────────────────────────────────
function buildMasterHub(page, allPages) {
  const categories = [
    { label: 'Image Converters', icon: '🖼️', href: '/image-converter/', count: allPages.filter(p => (p['Category']||'').split('→')[0] === 'image' && p['Page Type'] === 'Pair').length },
    { label: 'Document Converters', icon: '📄', href: '/document-converter/', count: allPages.filter(p => p['Category'] === 'document' && p['Page Type'] === 'Pair').length },
    { label: 'Spreadsheet Converters', icon: '📊', href: '/spreadsheet-converter/', count: allPages.filter(p => p['Category'] === 'spreadsheet' && p['Page Type'] === 'Pair').length },
    { label: 'Audio Converters', icon: '🎵', href: '/audio-converter/', count: allPages.filter(p => (p['Category']||'').split('→')[0] === 'audio' && p['Page Type'] === 'Pair').length },
    { label: 'Video Converters', icon: '🎬', href: '/video-converter/', count: allPages.filter(p => (p['Category']||'').split('→')[0] === 'video' && p['Page Type'] === 'Pair').length },
  ];

  const formatHubs = allPages.filter(p => p['Page Type'] === 'Format Hub');
  const topPairs   = allPages.filter(p => p['Page Type'] === 'Pair' && p['Priority'] === 'P1');

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": page['Page Name'],
    "description": page['Meta Description'],
    "url": `${DOMAIN}${page['URL Slug']}`,
  };

  return head({
    title: page['SEO Title'],
    desc: page['Meta Description'],
    canonical: page['URL Slug'],
    robots: page['Indexation'] === 'Index now' ? 'index, follow' : 'noindex, follow',
    schema: collectionSchema,
  }) + skipLink() + navbar()
    + breadcrumbs([{ label: 'File Converter', href: '/file-converter/' }])
    + `<main id="main-content">

  <section class="section-hero" aria-labelledby="hub-h1">
    <div class="container" style="max-width:800px; text-align:center;">
      <span class="eyebrow">Complete Directory</span>
      <h1 class="hero-title" id="hub-h1">${esc(page['H1'])}</h1>
      <p class="hero-subtitle mx-auto">${esc(page['Template Intro'])}</p>
    </div>
  </section>

  <!-- Category Cards -->
  <section class="section-categories" aria-labelledby="categories-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-4" id="categories-h2">Browse by File Type</h2>
      <div class="row g-4">
        ${categories.map(c => `<div class="col-sm-6 col-lg-4">
          <a href="${c.href}" class="category-card">
            <span class="category-card__icon" aria-hidden="true">${c.icon}</span>
            <h3 class="category-card__title">${c.label}</h3>
            <p class="category-card__desc">${c.count} converter tools in this category.</p>
            <span class="category-card__cta">Browse <i class="bi bi-arrow-right" aria-hidden="true"></i></span>
          </a>
        </div>`).join('\n        ')}
      </div>
    </div>
  </section>

  <!-- Format Hubs -->
  <section class="section-formats" aria-labelledby="formats-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-4" id="formats-h2">Browse by Format</h2>
      <div class="converter-grid">
        ${formatHubs.map(p => `<a href="${p['URL Slug']}" class="converter-card-link">
          <span class="converter-card-link__label">${esc(p['Page Name'])}</span>
          <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
        </a>`).join('\n        ')}
      </div>
    </div>
  </section>

  <!-- Top Pairs -->
  <section class="section-popular" aria-labelledby="popular-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-4" id="popular-h2">Most Popular Conversions</h2>
      <div class="converter-grid">
        ${topPairs.map(p => `<a href="${p['URL Slug']}" class="converter-card-link">
          <span class="converter-card-link__label">${esc(p['Page Name'])}</span>
          <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
        </a>`).join('\n        ')}
      </div>
    </div>
  </section>

  ${privacyBlock()}

</main>
` + footer();
}

// ── Category Hub ──────────────────────────────────────────────────────────────
function buildCategoryHub(page, allPages) {
  const cat = page['Category'];
  const catBase = cat.split('→')[0];

  // Format hubs in this category
  const fmtHubs = allPages.filter(p => p['Page Type'] === 'Format Hub' && p['Category'] === catBase);

  // Top pair pages in this category
  const pairPages = allPages.filter(p =>
    p['Page Type'] === 'Pair' &&
    (p['Category'] === cat || p['Category'] === catBase || p['Category'].startsWith(catBase))
  );
  const topPairs  = pairPages.filter(p => p['Priority'] === 'P1');
  const morePairs = pairPages.filter(p => p['Priority'] !== 'P1').slice(0, 24);

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": page['Page Name'],
    "description": page['Meta Description'],
    "url": `${DOMAIN}${page['URL Slug']}`,
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": DOMAIN },
        { "@type": "ListItem", "position": 2, "name": "File Converter", "item": `${DOMAIN}/file-converter/` },
        { "@type": "ListItem", "position": 3, "name": page['Page Name'], "item": `${DOMAIN}${page['URL Slug']}` },
      ]
    }
  };

  const catDescriptions = {
    image: 'Image converters handle raster and vector formats used in photography, web design, and print. Whether you\'re converting iPhone HEIC photos to JPG, optimising images to WebP for the web, or exporting SVGs to PNG for social media, these tools handle the most common image format workflows entirely in your browser.',
    document: 'Document converters handle the formats used for text, reports, and structured content. Convert between PDF, Word, HTML, Markdown, RTF, and plain text — all without installing software or uploading files to a server.',
    spreadsheet: 'Spreadsheet converters handle tabular data formats used in data analysis, finance, and business reporting. Convert between CSV, Excel, ODS, and TSV — essential for data exchange between different systems and applications.',
    audio: 'Audio converters handle music, podcast, and recording formats. Whether you\'re extracting audio from video, converting between compression formats, or preparing files for specific devices or platforms, these tools cover the most common audio conversion needs.',
    video: 'Video converters handle the formats used for streaming, editing, and sharing video content. Convert between MP4, MOV, WebM, AVI, and more — and extract audio or create animated GIFs from video clips.',
  };

  const faqs = buildCategoryFAQs(catBase);

  return head({
    title: page['SEO Title'],
    desc: page['Meta Description'],
    canonical: page['URL Slug'],
    robots: 'index, follow',
    schema: collectionSchema,
  }) + skipLink() + navbar()
    + breadcrumbs([
        { label: 'File Converter', href: '/file-converter/' },
        { label: page['Page Name'], href: page['URL Slug'] },
      ])
    + `<main id="main-content">

  <section class="section-hero" aria-labelledby="cat-h1">
    <div class="container" style="max-width:800px; text-align:center;">
      <span class="eyebrow">${categoryIcon(catBase)} ${categoryLabel(catBase)} Converters</span>
      <h1 class="hero-title" id="cat-h1">${esc(page['H1'])}</h1>
      <p class="hero-subtitle mx-auto">${catDescriptions[catBase] || esc(page['Template Intro'])}</p>
    </div>
  </section>

  <!-- Format Hubs -->
  <section class="section-formats" aria-labelledby="formats-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-1" id="formats-h2">Browse by Format</h2>
      <p class="text-muted mb-4">Select a format to see all available conversions from and to that format.</p>
      <div class="row g-4">
        ${fmtHubs.map(f => {
          const info = FMT[fmtKey(f['Source Format'])] || {};
          const fromCount = allPages.filter(p => p['Page Type'] === 'Pair' && p['Source Format'] === f['Source Format']).length;
          const toCount   = allPages.filter(p => p['Page Type'] === 'Pair' && p['Target Format'] === f['Source Format']).length;
          return `<div class="col-sm-6 col-lg-4">
            <a href="${f['URL Slug']}" class="format-hub-card">
              <span class="format-hub-card__icon" aria-hidden="true">${info.icon || '📁'}</span>
              <h3 class="format-hub-card__name">${esc(f['Source Format'])}</h3>
              <p class="format-hub-card__full">${esc(info.fullName || '')}</p>
              <p class="format-hub-card__count">${fromCount + toCount} conversion tools</p>
            </a>
          </div>`;
        }).join('\n        ')}
      </div>
    </div>
  </section>

  ${topPairs.length ? `<!-- Top Pairs -->
  <section class="section-popular" aria-labelledby="popular-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-1" id="popular-h2">Most Popular ${categoryLabel(catBase)} Conversions</h2>
      <p class="text-muted mb-4">The most searched ${catBase} format conversions.</p>
      <div class="converter-grid">
        ${topPairs.map(p => `<a href="${p['URL Slug']}" class="converter-card-link">
          <span class="converter-card-link__label">${esc(p['Page Name'])}</span>
          <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
        </a>`).join('\n        ')}
      </div>
    </div>
  </section>` : ''}

  ${morePairs.length ? `<!-- More Pairs -->
  <section class="section-more-pairs" aria-labelledby="more-pairs-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-4" id="more-pairs-h2">All ${categoryLabel(catBase)} Converters</h2>
      <div class="converter-grid">
        ${morePairs.map(p => `<a href="${p['URL Slug']}" class="converter-card-link">
          <span class="converter-card-link__label">${esc(p['Page Name'])}</span>
          <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
        </a>`).join('\n        ')}
      </div>
    </div>
  </section>` : ''}

  ${privacyBlock()}
  ${faqBlock(faqs)}

</main>
` + footer();
}

function buildCategoryFAQs(cat) {
  const base = {
    q: `Is the ${cat} converter free?`,
    a: `Yes — all ${cat} converters on AintoB are completely free. No account, no subscription, no file size fees for typical files.`
  };
  const catFaqs = {
    image: [
      base,
      { q: 'Which image format should I use for the web?', a: 'For photographs on the web, WebP or AVIF give the best file size with good quality. JPG is the safe, universally compatible fallback. Use PNG for graphics, icons, or images requiring transparency.' },
      { q: 'Can I convert HEIC photos from my iPhone?', a: 'Yes — the HEIC to JPG converter processes your iPhone photos directly in the browser. No app or software installation required.' },
      { q: 'Will converting reduce my image quality?', a: 'Converting to JPG or WebP uses lossy compression and will reduce quality slightly. Converting to PNG or TIFF is lossless. Lossless-to-lossless conversions (e.g. PNG to WebP in lossless mode) preserve full quality.' },
    ],
    document: [
      base,
      { q: 'Can I convert scanned PDFs to editable Word documents?', a: 'Scanned PDFs contain images of text rather than actual text characters. OCR (Optical Character Recognition) is required to extract editable text, which is beyond basic format conversion.' },
      { q: 'Does converting from Markdown preserve formatting?', a: 'Yes — Markdown converts cleanly to HTML, preserving headings, bold, italics, links, lists, and code blocks. Converting Markdown to PDF or Word also works, though complex layouts may need manual adjustment.' },
    ],
    spreadsheet: [
      base,
      { q: 'Will formulas be preserved when converting from Excel?', a: 'When converting Excel to CSV or TXT, formulas are replaced by their calculated values — the formula itself is not stored in plain text formats. Converting between spreadsheet formats (Excel ↔ ODS) generally preserves formulas.' },
      { q: 'What is the difference between CSV and TSV?', a: 'Both are plain-text tabular formats. CSV uses commas to separate values; TSV uses tab characters. TSV is safer for data that frequently contains commas (like addresses or numbers), while CSV is more universally supported.' },
    ],
    audio: [
      base,
      { q: 'Which audio format has the best quality?', a: 'For lossless quality, WAV preserves audio with no compression. For smaller files with excellent quality, M4A/AAC and OGG Vorbis outperform MP3 at the same bitrate. MP3 is the most compatible choice for broad device support.' },
      { q: 'Can I extract audio from a video file?', a: 'Yes — AintoB includes tools like MP4 to MP3, MP4 to WAV, WebM to MP3, and more that extract the audio track from video files entirely in your browser.' },
    ],
    video: [
      base,
      { q: 'Which video format is best for social media?', a: 'MP4 with H.264 encoding is the universal choice — accepted by YouTube, Instagram, TikTok, Twitter, and virtually every platform. It balances quality, compatibility, and file size.' },
      { q: 'Can I convert a video to a GIF?', a: 'Yes — AintoB includes MP4 to GIF, WebM to GIF, and MOV to GIF converters. Note that GIFs are limited to 256 colours and can be quite large — for short clips, WebP animation or MP4 is often a better choice.' },
    ],
  };
  return catFaqs[cat] || [base];
}

// ── Format Hub ────────────────────────────────────────────────────────────────
function buildFormatHub(page, allPages) {
  const fmt  = page['Source Format'];
  const info = FMT[fmtKey(fmt)] || {};
  const catBase = (page['Category'] || '').split('→')[0];

  // From and To pair pages
  const fromPages = allPages.filter(p => p['Page Type'] === 'Pair' && p['Source Format'] === fmt);
  const toPages   = allPages.filter(p => p['Page Type'] === 'Pair' && p['Target Format'] === fmt);

  // Related format hubs (same category, different format)
  const relatedHubs = allPages.filter(p =>
    p['Page Type'] === 'Format Hub' &&
    p['Category'] === page['Category'] &&
    p['Source Format'] !== fmt
  ).slice(0, 6);

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": page['Page Name'],
    "description": page['Meta Description'],
    "url": `${DOMAIN}${page['URL Slug']}`,
  };

  const catHubHref  = page['Parent Hub'] || categoryHub(catBase);
  const catHubLabel = categoryLabel(catBase) + ' Converter';

  const faqs = [
    { q: `Is the ${fmt} converter free?`, a: `Yes — all ${fmt} conversion tools on AintoB are completely free. No account required, no upload limits for typical files.` },
    { q: `What is a ${fmt} file?`, a: info.description || `${fmt} is a file format used for ${catBase} files.` },
    { q: `Is converting ${fmt} files safe?`, a: `Your ${fmt} files are processed entirely in your browser. Nothing is sent to any server — the conversion is performed locally using browser-native APIs.` },
    { q: `What does ${fmt} stand for?`, a: `${fmt} stands for ${info.fullName || fmt}. ${info.description ? info.description.split('.')[0] + '.' : ''}` },
  ];

  return head({
    title: page['SEO Title'],
    desc: page['Meta Description'],
    canonical: page['URL Slug'],
    robots: 'index, follow',
    schema: collectionSchema,
  }) + skipLink() + navbar()
    + breadcrumbs([
        { label: categoryLabel(catBase) + ' Converter', href: catHubHref },
        { label: page['Page Name'], href: page['URL Slug'] },
      ])
    + `<main id="main-content">

  <section class="section-hero" aria-labelledby="fmt-h1">
    <div class="container" style="max-width:800px; text-align:center;">
      <span class="eyebrow">${info.icon || '📁'} ${esc(fmt)} Format</span>
      <h1 class="hero-title" id="fmt-h1">${esc(page['H1'])}</h1>
      <p class="hero-subtitle mx-auto">${esc(page['Meta Description'])}</p>
      <div class="d-flex flex-wrap justify-content-center gap-2 mt-4">
        ${fromPages.slice(0,3).map(p => `<a href="${p['URL Slug']}" class="btn btn-primary px-4">${esc(p['Page Name'])}</a>`).join('\n        ')}
      </div>
    </div>
  </section>

  <!-- Format Explainer -->
  <section class="section-explainer" aria-labelledby="explainer-h2">
    <div class="container" style="max-width:800px;">
      <div class="explainer-card">
        <h2 class="section-title" id="explainer-h2">What is ${esc(fmt)}?</h2>
        <p>${info.description || `${fmt} (${info.fullName || fmt}) is a ${catBase} file format.`}</p>
        ${info.useCases ? `<h3 class="explainer-subtitle">Common uses for ${esc(fmt)}</h3>
        <ul class="explainer-list">
          ${info.useCases.map(u => `<li><i class="bi bi-check-circle-fill text-accent me-2" aria-hidden="true"></i>${u}</li>`).join('\n          ')}
        </ul>` : ''}
        ${info.limitation ? `<div class="explainer-note"><i class="bi bi-info-circle me-2" aria-hidden="true"></i><strong>Note:</strong> ${info.limitation}</div>` : ''}
        ${info.compat ? `<p class="text-muted mt-2"><strong>Compatibility:</strong> ${info.compat}</p>` : ''}
      </div>
    </div>
  </section>

  ${fromPages.length ? `<!-- Convert From -->
  <section class="section-from-to" aria-labelledby="from-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-1" id="from-h2">Convert from ${esc(fmt)}</h2>
      <p class="text-muted mb-4">Choose the output format you need from a ${esc(fmt)} file.</p>
      <div class="converter-grid">
        ${fromPages.map(p => `<a href="${p['URL Slug']}" class="converter-card-link">
          <span class="converter-card-link__label">${esc(p['Page Name'])}</span>
          <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
        </a>`).join('\n        ')}
      </div>
    </div>
  </section>` : ''}

  ${toPages.length ? `<!-- Convert To -->
  <section class="section-from-to section-from-to--to" aria-labelledby="to-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-1" id="to-h2">Convert to ${esc(fmt)}</h2>
      <p class="text-muted mb-4">Convert other formats into ${esc(fmt)}.</p>
      <div class="converter-grid">
        ${toPages.map(p => `<a href="${p['URL Slug']}" class="converter-card-link">
          <span class="converter-card-link__label">${esc(p['Page Name'])}</span>
          <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
        </a>`).join('\n        ')}
      </div>
    </div>
  </section>` : ''}

  ${relatedHubs.length ? `<!-- Related Format Hubs -->
  <section class="section-related" aria-labelledby="rel-hubs-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-4" id="rel-hubs-h2">Related ${categoryLabel(catBase)} Formats</h2>
      <div class="converter-grid">
        ${relatedHubs.map(p => `<a href="${p['URL Slug']}" class="converter-card-link">
          <span class="converter-card-link__label">${esc(p['Page Name'])}</span>
          <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
        </a>`).join('\n        ')}
      </div>
    </div>
  </section>` : ''}

  ${privacyBlock()}
  ${faqBlock(faqs)}

</main>
` + footer();
}

// ── Pair Page ─────────────────────────────────────────────────────────────────
function buildPairPage(page, allPages) {
  const from     = page['Source Format'];
  const to       = page['Target Format'];
  const fromInfo = FMT[fmtKey(from)] || {};
  const toInfo   = FMT[fmtKey(to)]   || {};
  const catBase  = (page['Category'] || '').split('→')[0];

  const parentSlug  = page['Parent Hub'];
  const parentLabel = allPages.find(p => p['URL Slug'] === parentSlug)?.['Page Name'] || from + ' Converter';
  const catHubHref  = categoryHub(catBase);
  const catHubLabel = categoryLabel(catBase) + ' Converter';

  // Related: same source format (different target), same target format (different source), reverse
  const sameFrom    = allPages.filter(p => p['Page Type'] === 'Pair' && p['Source Format'] === from && p['Target Format'] !== to).slice(0, 6);
  const sameTo      = allPages.filter(p => p['Page Type'] === 'Pair' && p['Target Format'] === to && p['Source Format'] !== from).slice(0, 6);
  const reverse     = allPages.find(p => p['Page Type'] === 'Pair' && p['Source Format'] === to && p['Target Format'] === from);

  const isNoIndex = page['Indexation'] !== 'Index now';
  const robots = isNoIndex ? 'noindex, follow' : 'index, follow';

  const appSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": page['Page Name'],
    "applicationCategory": "UtilitiesApplication",
    "operatingSystem": "Web browser",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "description": page['Meta Description'],
    "url": `${DOMAIN}${page['URL Slug']}`,
  };

  // Build how-it-works steps from template
  const steps = [
    `Upload or drop your <strong>${esc(from)}</strong> file into the converter above.`,
    `Adjust any output settings for <strong>${esc(to)}</strong> if needed.`,
    `Click <strong>Convert</strong> and download your converted file instantly.`,
  ];

  // Value proposition: why convert from A to B
  const whyConvert = buildWhyConvert(from, to, fromInfo, toInfo, page);

  // Page-specific FAQs
  const faqs = buildPairFAQs(from, to, fromInfo, toInfo);

  return head({
    title: page['SEO Title'],
    desc: page['Meta Description'],
    canonical: page['URL Slug'],
    robots,
    schema: appSchema,
  }) + skipLink() + navbar()
    + breadcrumbs([
        { label: catHubLabel, href: catHubHref },
        { label: parentLabel, href: parentSlug },
        { label: page['Page Name'], href: page['URL Slug'] },
      ])
    + `<main id="main-content">

  <!-- Hero -->
  <section class="section-hero section-hero--pair" aria-labelledby="pair-h1">
    <div class="container" style="max-width:800px; text-align:center;">
      <div class="format-badge-row">
        <span class="format-badge format-badge--from">${esc(from)}</span>
        <span class="format-badge-arrow" aria-hidden="true">→</span>
        <span class="format-badge format-badge--to">${esc(to)}</span>
      </div>
      <h1 class="hero-title" id="pair-h1">${esc(page['H1'])}</h1>
      <p class="hero-subtitle mx-auto">${esc(page['Meta Description'])}</p>
    </div>
  </section>

  ${converterWidget(from, to, page['URL Slug'])}

  <!-- Intro & Why -->
  <section class="section-content" aria-labelledby="intro-h2">
    <div class="container" style="max-width:800px;">
      <h2 class="section-title" id="intro-h2">Why Convert ${esc(from)} to ${esc(to)}?</h2>
      <p>${whyConvert.intro}</p>
      <h3 class="explainer-subtitle">Common use cases</h3>
      <ul class="explainer-list">
        ${whyConvert.useCases.map(u => `<li><i class="bi bi-check-circle-fill text-accent me-2" aria-hidden="true"></i>${u}</li>`).join('\n        ')}
      </ul>
      ${whyConvert.limitation ? `<div class="explainer-note"><i class="bi bi-info-circle me-2" aria-hidden="true"></i><strong>Keep in mind:</strong> ${whyConvert.limitation}</div>` : ''}
    </div>
  </section>

  <!-- How It Works -->
  <section class="section-how-it-works" aria-labelledby="how-h2">
    <div class="container" style="max-width:800px;">
      <h2 class="section-title" id="how-h2">How to Convert ${esc(from)} to ${esc(to)}</h2>
      <ol class="how-it-works-list">
        ${steps.map(s => `<li>${s}</li>`).join('\n        ')}
      </ol>
    </div>
  </section>

  <!-- Format Explainers -->
  <section class="section-formats-explainer" aria-labelledby="formats-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-4" id="formats-h2">About the Formats</h2>
      <div class="row g-4">
        <div class="col-md-6">
          <div class="format-explainer-card">
            <div class="format-explainer-card__header">
              <span class="format-explainer-card__icon" aria-hidden="true">${fromInfo.icon || '📁'}</span>
              <h3 class="format-explainer-card__name">${esc(from)} <span class="text-muted fw-normal">(${esc(fromInfo.fullName || from)})</span></h3>
            </div>
            <p>${fromInfo.description ? fromInfo.description.split('.').slice(0, 2).join('.') + '.' : `${from} is a ${catBase} file format.`}</p>
            ${fromInfo.compat ? `<p class="text-muted" style="font-size:var(--text-sm);"><strong>Compatibility:</strong> ${fromInfo.compat}</p>` : ''}
          </div>
        </div>
        <div class="col-md-6">
          <div class="format-explainer-card">
            <div class="format-explainer-card__header">
              <span class="format-explainer-card__icon" aria-hidden="true">${toInfo.icon || '📁'}</span>
              <h3 class="format-explainer-card__name">${esc(to)} <span class="text-muted fw-normal">(${esc(toInfo.fullName || to)})</span></h3>
            </div>
            <p>${toInfo.description ? toInfo.description.split('.').slice(0, 2).join('.') + '.' : `${to} is a ${catBase} file format.`}</p>
            ${toInfo.compat ? `<p class="text-muted" style="font-size:var(--text-sm);"><strong>Compatibility:</strong> ${toInfo.compat}</p>` : ''}
          </div>
        </div>
      </div>
    </div>
  </section>

  ${privacyBlock()}

  <!-- Related: same source -->
  ${sameFrom.length ? relatedGrid(`More ${esc(from)} Conversions`, sameFrom) : ''}

  <!-- Related: same target -->
  ${sameTo.length ? relatedGrid(`Other Ways to Get a ${esc(to)} File`, sameTo) : ''}

  <!-- Reverse -->
  ${reverse ? `<section class="section-reverse" aria-labelledby="reverse-h2">
    <div class="container" style="max-width:var(--max-width);">
      <h2 class="section-title mb-3" id="reverse-h2">Need the reverse?</h2>
      <a href="${reverse['URL Slug']}" class="converter-card-link" style="max-width:320px;">
        <span class="converter-card-link__label">${esc(reverse['Page Name'])}</span>
        <i class="bi bi-arrow-right converter-card-link__arrow" aria-hidden="true"></i>
      </a>
    </div>
  </section>` : ''}

  ${faqBlock(faqs)}

</main>
` + footer([
    { label: parentLabel, href: parentSlug },
    { label: catHubLabel, href: catHubHref },
  ]);
}

function buildWhyConvert(from, to, fromInfo, toInfo, page) {
  const valBlock = page['Template Value Block'] || '';

  // Extract intro sentence from the template value block
  const introRaw = valBlock.replace(/^Explain why someone converts.*?:/i, '').trim();
  const intro = introRaw || `Converting ${from} to ${to} is a common workflow when you need to move between ${fromInfo.category || 'file'} formats. ${fromInfo.fullName || from} files ${fromInfo.description ? fromInfo.description.split('.')[0].toLowerCase().replace(`${from.toLowerCase()} `, '').replace(`${fromInfo.fullName || from} `, '') + '.' : ''} ${to} files ${toInfo.description ? toInfo.description.split('.')[0].toLowerCase().replace(`${to.toLowerCase()} `, '').replace(`${toInfo.fullName || to} `, '') + '.' : ''}`;

  // Use cases from the from format, with a twist for the target
  const fromUseCases = fromInfo.useCases || [];
  const toUseCases   = toInfo.useCases   || [];
  const useCases = [
    fromUseCases[0] ? `You have a <strong>${from}</strong> file and need it in <strong>${to}</strong> format for ${toUseCases[0] ? toUseCases[0].toLowerCase() : 'compatibility'}.` : null,
    toUseCases[0] ? `The target software or platform requires <strong>${to}</strong> but your file is in <strong>${from}</strong>.` : null,
    `You want to reduce file size or improve compatibility without using desktop software.`,
  ].filter(Boolean);

  const limitation = toInfo.limitation || fromInfo.limitation || null;

  return { intro, useCases, limitation };
}

function buildPairFAQs(from, to, fromInfo, toInfo) {
  return [
    { q: `Is the ${from} to ${to} converter free?`, a: `Yes — completely free with no sign-up, no watermarks, and no size limits for typical files.` },
    { q: `Will quality be lost when converting from ${from} to ${to}?`, a: (() => {
      const lossless = ['PNG', 'TIFF', 'WAV', 'BMP', 'SVG'];
      const lossy    = ['JPG', 'JPEG', 'MP3', 'HEIC'];
      if (lossless.includes(to.toUpperCase()) && lossless.includes(from.toUpperCase()))
        return `Both ${from} and ${to} are lossless formats, so no quality will be lost during conversion.`;
      if (lossy.includes(to.toUpperCase()))
        return `${to} uses lossy compression, which may reduce quality slightly compared to the original ${from}. For most uses, the difference is imperceptible at standard quality settings.`;
      return `Quality depends on the output settings. For lossless output, choose the highest quality setting available.`;
    })() },
    { q: `Is my ${from} file safe?`, a: `Your file is processed entirely within your browser using local JavaScript. It is never uploaded to any server. Only you can access your file.` },
    { q: `How large a ${from} file can I convert?`, a: `For browser-based conversion, files up to 50 MB work best. Very large files may take longer depending on your device. We recommend splitting very large files before converting.` },
    { q: `Can I convert multiple ${from} files at once?`, a: `Currently, AintoB converts one file at a time to keep the browser-based process simple and private. Reload the page to convert another file.` },
  ];
}

// ── Simple Static Pages ───────────────────────────────────────────────────────
function buildPrivacyPage() {
  return head({
    title: 'Privacy Policy | AintoB.com',
    desc: 'AintoB privacy policy. Learn how we handle your data — spoiler: we barely do. No file uploads, no tracking without consent.',
    canonical: '/privacy/',
    robots: 'index, follow',
  }) + skipLink() + navbar()
  + breadcrumbs([{ label: 'Privacy Policy', href: '/privacy/' }])
  + `<main id="main-content">
  <section class="section-hero">
    <div class="container" style="max-width:800px;">
      <h1 class="hero-title">Privacy Policy</h1>
      <p class="text-muted">Last updated: ${new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})}</p>
    </div>
  </section>
  <section class="section-content">
    <div class="container" style="max-width:800px;">
      <h2>1. What data do we collect?</h2>
      <p>AintoB.com is a browser-based file conversion tool. <strong>Files you convert are never uploaded to our servers.</strong> All conversion processing happens locally in your browser using JavaScript.</p>
      <p>We may collect basic anonymised analytics data (pages viewed, approximate location by country, browser type) when you consent to analytics cookies. This data is never linked to personal identifiers.</p>

      <h2>2. Cookies</h2>
      <p>We use essential cookies only by default. Essential cookies enable basic site functionality (e.g. cookie consent preference storage). We do not use tracking cookies without your explicit consent.</p>
      <p>You can change your cookie preferences at any time using the cookie banner.</p>

      <h2>3. File handling</h2>
      <p>Files you select for conversion are processed entirely in your browser. They are <strong>never transmitted to our servers</strong>. We have no technical ability to access the content of your files.</p>

      <h2>4. Third-party services</h2>
      <p>We load Bootstrap CSS and JavaScript from a CDN (cdn.jsdelivr.net). The CDN may log request metadata (IP address, timestamp) as per its own privacy policy. We do not share any personal data with CDN providers.</p>

      <h2>5. Your rights (GDPR)</h2>
      <p>If you are in the EU/EEA, you have rights to access, correct, or delete personal data held about you. Since we collect minimal personal data, most requests will be straightforward. Contact us via the Imprint page for any data requests.</p>

      <h2>6. Contact</h2>
      <p>For privacy-related questions, see our <a href="/imprint/">Imprint</a> page for contact details.</p>
    </div>
  </section>
</main>
` + footer();
}

function buildImprintPage() {
  return head({
    title: 'Imprint | AintoB.com',
    desc: 'Legal imprint and contact information for AintoB.com.',
    canonical: '/imprint/',
    robots: 'noindex, follow',
  }) + skipLink() + navbar()
  + breadcrumbs([{ label: 'Imprint', href: '/imprint/' }])
  + `<main id="main-content">
  <section class="section-hero">
    <div class="container" style="max-width:800px;">
      <h1 class="hero-title">Imprint</h1>
    </div>
  </section>
  <section class="section-content">
    <div class="container" style="max-width:800px;">
      <p>This website is operated by the owner of AintoB.com. For legal and GDPR-related inquiries, please use the contact form or reach out via email.</p>
      <p>AintoB.com is a free, browser-based file conversion service. No files are stored on our servers.</p>
      <h2>Disclaimer</h2>
      <p>AintoB.com provides file conversion tools for informational and productivity purposes. We make no guarantees regarding the accuracy or completeness of converted output. Use converted files at your own discretion.</p>
    </div>
  </section>
</main>
` + footer();
}

// ─── Sitemap Generator ────────────────────────────────────────────────────────
function buildSitemap(allPages) {
  const now = new Date().toISOString().split('T')[0];
  const indexable = allPages.filter(p => p['Indexation'] === 'Index now');

  const urls = [
    { loc: '/', priority: '1.0', freq: 'weekly' },
    ...indexable.map(p => ({
      loc: p['URL Slug'],
      priority: p['Priority'] === 'P1' ? '0.9' : p['Page Type'] === 'Format Hub' ? '0.8' : p['Page Type'] === 'Category Hub' ? '0.9' : '0.7',
      freq: p['Page Type'] === 'Pair' ? 'monthly' : 'weekly',
    })),
    { loc: '/privacy/', priority: '0.3', freq: 'yearly' },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${DOMAIN}${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${DOMAIN}/sitemap.xml
`;
}

// ─── Main Build ───────────────────────────────────────────────────────────────
function build() {
  console.log('🏗️  AintoB Static Site Generator\n');

  // Read CSV
  const csvContent = fs.readFileSync(path.join(ROOT, 'page_map.csv'), 'utf8');
  const allPages   = parseCSV(csvContent);
  console.log(`📄 Loaded ${allPages.length} pages from CSV`);

  let count = 0;

  // Homepage
  writeFile('index.html', buildHomepage(allPages));
  console.log('  ✓ /index.html (homepage)');
  count++;

  // All pages from CSV
  for (const page of allPages) {
    const slug = page['URL Slug'];
    if (!slug) continue;

    let html;
    try {
      switch (page['Page Type']) {
        case 'Master Hub':   html = buildMasterHub(page, allPages);   break;
        case 'Category Hub': html = buildCategoryHub(page, allPages); break;
        case 'Format Hub':   html = buildFormatHub(page, allPages);   break;
        case 'Pair':         html = buildPairPage(page, allPages);    break;
        default:
          console.warn(`  ⚠ Unknown page type "${page['Page Type']}" for ${slug}`);
          continue;
      }
    } catch (err) {
      console.error(`  ✗ Error building ${slug}: ${err.message}`);
      continue;
    }

    const outPath = slugToPath(slug);
    writeFile(outPath, html);
    console.log(`  ✓ ${slug}`);
    count++;
  }

  // Static pages
  writeFile('privacy/index.html', buildPrivacyPage());
  writeFile('imprint/index.html', buildImprintPage());
  console.log('  ✓ /privacy/ + /imprint/');
  count += 2;

  // Sitemap + robots
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(allPages), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), buildRobots(), 'utf8');
  console.log('  ✓ sitemap.xml');
  console.log('  ✓ robots.txt');

  console.log(`\n✅ Build complete — ${count} pages generated.\n`);
  console.log('To regenerate: node build.js');
}

build();
