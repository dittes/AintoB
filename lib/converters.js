'use strict';
// ─── Converter Configs ────────────────────────────────────────────────────────
// CDN library URLs used by converter scripts
const CDN = {
  markdownIt: 'https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js',
  turndown:   'https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.min.js',
  mammoth:    'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  htmlDocx:   'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js',
  html2pdf:   'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
  jsPDF:      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  pdfJS:      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  xlsx:       'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  heic2any:   'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
  jsYaml:     'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js',
  jszip:      'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  ffmpeg:     'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js',
  ffmpegUtil: 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js',
};

const IMAGE_FMTS  = new Set(['AVIF','BMP','GIF','HEIC','ICO','JPG','PNG','SVG','TIFF','WEBP']);
const SHEET_FMTS  = new Set(['CSV','TSV','EXCEL','ODS']);
const AUDIO_FMTS  = new Set(['FLAC','M4A','MP3','OGG','WAV']);
const VIDEO_FMTS  = new Set(['AVI','FLV','MOV','MP4','WEBM','WMV']);
// Raster formats ffmpeg.wasm can read AND write (used for TIFF/GIF image pairs
// that the canvas API cannot handle)
const FFMPEG_RASTER = new Set(['BMP','GIF','JPG','PNG','TIFF','WEBP']);

// Returns { textMode, libs[], converterScript, action?, engineNote? } or null
// if no browser converter exists.
function getConverterConfig(from, to, slug) {
  const f = (from || '').toUpperCase().replace('JPEG','JPG');
  const t = (to   || '').toUpperCase().replace('JPEG','JPG');
  const C = (script, libs = [], textMode = false, opts = {}) =>
    ({ textMode, libs, converterScript: `/assets/js/converters/${script}`,
       engineNote: script === 'media-convert.js', ...opts });

  // ── Data & text tools (slug-keyed — one shared script) ────────────────────
  const dataMap = {
    '/data/json-to-csv/':    C('data-convert.js', [], true),
    '/data/csv-to-json/':    C('data-convert.js', [], true),
    '/data/json-to-yaml/':   C('data-convert.js', [CDN.jsYaml], true),
    '/data/yaml-to-json/':   C('data-convert.js', [CDN.jsYaml], true),
    '/data/xml-to-json/':    C('data-convert.js', [], true),
    '/data/json-formatter/': C('data-convert.js', [], true, { action: 'Format JSON' }),
    '/data/base64-encode/':  C('data-convert.js', [], true, { action: 'Encode to Base64' }),
    '/data/base64-decode/':  C('data-convert.js', [], true, { action: 'Decode Base64' }),
    '/data/url-encode/':     C('data-convert.js', [], true, { action: 'URL-Encode' }),
    '/data/url-decode/':     C('data-convert.js', [], true, { action: 'URL-Decode' }),
    '/data/case-converter/': C('data-convert.js', [], true, { action: 'Convert Case' }),
    '/data/json-to-xml/':    C('data-convert.js', [], true),
    '/data/csv-to-xml/':     C('data-convert.js', [], true),
    '/data/xml-to-csv/':     C('data-convert.js', [], true),
    '/data/xml-to-yaml/':    C('data-convert.js', [CDN.jsYaml], true),
    '/data/json-to-excel/':  C('data-convert.js', [CDN.xlsx], true),
    '/data/excel-to-json/':  C('data-convert.js', [CDN.xlsx], false),
  };
  if (dataMap[slug]) return dataMap[slug];

  // ── Standalone image tools ────────────────────────────────────────────────
  if (slug === '/image/resize-image/')   return C('image-resize.js',   [], false, { action: 'Resize Image' });
  if (slug === '/image/compress-image/') return C('image-compress.js', [], false, { action: 'Compress Image' });

  // ── RTF in/out and PDF → HTML / Markdown / Word / RTF (one shared script, see doc-convert.js) ──
  const DOC_IN_TEXT = new Set(['RTF', 'TXT', 'HTML', 'MARKDOWN']);
  const toRtf   = t === 'RTF' && ['TXT', 'HTML', 'MARKDOWN', 'WORD', 'PDF'].includes(f);
  const fromRtf = f === 'RTF' && ['HTML', 'MARKDOWN', 'WORD', 'PDF'].includes(t);
  const fromPdf = f === 'PDF' && ['HTML', 'MARKDOWN', 'WORD', 'RTF'].includes(t);
  if (toRtf || fromRtf || fromPdf) {
    const libs = [];
    if (t === 'MARKDOWN') libs.push(CDN.turndown);
    if (t === 'WORD') libs.push(CDN.htmlDocx);
    if (f === 'MARKDOWN') libs.push(CDN.markdownIt);
    if (f === 'WORD') libs.push(CDN.mammoth);
    if (f === 'PDF') libs.push(CDN.pdfJS);
    return C('doc-convert.js', libs, DOC_IN_TEXT.has(f));
  }

  // ── ODT / EPUB (ZIP packages, see zipdoc-convert.js) ──────────────────────────
  const fromZipDoc = (f === 'ODT' && ['TXT', 'HTML', 'MARKDOWN', 'WORD', 'PDF'].includes(t)) || (f === 'EPUB' && ['TXT', 'HTML', 'MARKDOWN', 'PDF'].includes(t));
  const toOdt = t === 'ODT' && ['TXT', 'HTML', 'MARKDOWN', 'WORD'].includes(f);
  if (fromZipDoc || toOdt) {
    const libs = [CDN.jszip];
    if (t === 'MARKDOWN') libs.push(CDN.turndown);
    if (t === 'WORD') libs.push(CDN.htmlDocx);
    if (f === 'MARKDOWN') libs.push(CDN.markdownIt);
    if (f === 'WORD') libs.push(CDN.mammoth);
    return C('zipdoc-convert.js', libs, toOdt && ['TXT', 'HTML', 'MARKDOWN'].includes(f));
  }

  // ── Spreadsheet → HTML / Markdown table ───────────────────────────────────────
  if (SHEET_FMTS.has(f) && (t === 'HTML' || t === 'MARKDOWN')) {
    return C('sheet-to-doc.js', [CDN.xlsx], f === 'CSV' || f === 'TSV');
  }

  // ── Audio / video (ffmpeg.wasm, loaded lazily on first conversion) ────────
  const isMedia = AUDIO_FMTS.has(f) || AUDIO_FMTS.has(t) || VIDEO_FMTS.has(f) || VIDEO_FMTS.has(t);
  if (isMedia) return C('media-convert.js', [CDN.ffmpeg, CDN.ffmpegUtil]);

  // ── TIFF / GIF image pairs the canvas API cannot encode → ffmpeg.wasm ─────
  if (FFMPEG_RASTER.has(f) && FFMPEG_RASTER.has(t) && (f === 'TIFF' || t === 'TIFF' || t === 'GIF')) {
    return C('media-convert.js', [CDN.ffmpeg, CDN.ffmpegUtil]);
  }

  // ── Markdown (existing, explicit) ─────────────────────────────────────────
  const mdMap = {
    '/document/markdown-to-html/': C('md-to-html.js', [CDN.markdownIt], true),
    '/document/html-to-markdown/': C('html-to-md.js', [CDN.turndown], true),
    '/document/markdown-to-pdf/':  C('md-to-pdf.js',  [CDN.markdownIt, CDN.html2pdf]),
    '/document/markdown-to-word/': C('md-to-word.js', [CDN.markdownIt, CDN.htmlDocx]),
    '/document/word-to-markdown/': C('word-to-md.js', [CDN.mammoth, CDN.turndown]),
    '/document/markdown-to-txt/':  C('md-to-txt.js',  [], true),
    '/document/txt-to-markdown/':  C('txt-to-md.js',  [], true),
  };
  if (mdMap[slug]) return mdMap[slug];

  // ── Image → Image (canvas) ────────────────────────────────────────────────
  if (IMAGE_FMTS.has(f) && IMAGE_FMTS.has(t)) {
    const libs = f === 'HEIC' ? [CDN.heic2any] : [];
    return C('image-convert.js', libs);
  }

  // ── Image → PDF ───────────────────────────────────────────────────────────
  if (IMAGE_FMTS.has(f) && t === 'PDF') {
    const libs = f === 'HEIC' ? [CDN.heic2any, CDN.jsPDF] : [CDN.jsPDF];
    return C('image-to-pdf.js', libs);
  }

  // ── PDF → Image ───────────────────────────────────────────────────────────
  if (f === 'PDF' && IMAGE_FMTS.has(t)) {
    return C('pdf-to-image.js', [CDN.pdfJS]);
  }

  // ── PDF → TXT ─────────────────────────────────────────────────────────────
  if (f === 'PDF' && t === 'TXT') {
    return C('pdf-to-txt.js', [CDN.pdfJS]);
  }

  // ── HTML conversions ──────────────────────────────────────────────────────
  if (f === 'HTML' && t === 'TXT')  return C('html-to-txt.js',  [],                  true);
  if (f === 'HTML' && t === 'PDF')  return C('html-to-pdf.js',  [CDN.html2pdf],      true);
  if (f === 'HTML' && t === 'WORD') return C('html-to-word.js', [CDN.htmlDocx],      true);

  // ── TXT conversions ───────────────────────────────────────────────────────
  if (f === 'TXT' && t === 'HTML')  return C('txt-to-html.js',  [],                  true);
  if (f === 'TXT' && t === 'PDF')   return C('txt-to-pdf.js',   [CDN.html2pdf],      true);
  if (f === 'TXT' && t === 'WORD')  return C('txt-to-word.js',  [CDN.htmlDocx],      true);
  if (f === 'TXT' && t === 'CSV')   return C('txt-to-csv.js',   [],                  true);

  // ── RTF conversions ───────────────────────────────────────────────────────
  if (f === 'RTF' && t === 'TXT')   return C('rtf-to-txt.js',   [],                  true);

  // ── Word conversions ──────────────────────────────────────────────────────
  if (f === 'WORD' && t === 'HTML') return C('word-to-html.js', [CDN.mammoth]);
  if (f === 'WORD' && t === 'PDF')  return C('word-to-pdf.js',  [CDN.mammoth, CDN.html2pdf]);
  if (f === 'WORD' && t === 'TXT')  return C('word-to-txt.js',  [CDN.mammoth]);

  // ── Spreadsheet ↔ Spreadsheet ─────────────────────────────────────────────
  if (SHEET_FMTS.has(f) && SHEET_FMTS.has(t)) {
    const textMode = f === 'CSV' || f === 'TSV';
    return C('spreadsheet-convert.js', [CDN.xlsx], textMode);
  }

  // ── Spreadsheet → PDF ─────────────────────────────────────────────────────
  if (SHEET_FMTS.has(f) && t === 'PDF') {
    const textMode = f === 'CSV' || f === 'TSV';
    return C('spreadsheet-to-pdf.js', [CDN.xlsx, CDN.html2pdf], textMode);
  }

  // ── CSV ↔ TXT ─────────────────────────────────────────────────────────────
  if (f === 'CSV' && t === 'TXT') return C('csv-to-txt.js', [], true);

  return null; // no browser converter for this pair
}

module.exports = { getConverterConfig, CDN };
