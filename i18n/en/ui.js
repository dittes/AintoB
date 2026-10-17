/**
 * English locale — the reference every other language mirrors key-for-key.
 *
 * Conventions
 *  - `{name}` placeholders are filled by build.js.
 *  - Keys ending in `Html` may contain markup and are inserted unescaped.
 *  - Page titles/metas for ordinary pair/hub pages come from page_map.csv in
 *    English; the other languages build them from the templates in `s`.
 */
'use strict';

const s = {
  // ── chrome ──────────────────────────────────────────────────────────────
  skip: 'Skip to main content',
  logoAria: 'AintoB home',
  navMain: 'Main navigation',
  navFooter: 'Footer navigation',
  breadcrumbAria: 'Breadcrumb',
  home: 'Home',
  allConverters: 'All Converters',
  openFiles: 'Open files',
  newTab: '(opens in a new tab)',
  langLabel: 'Language',
  langFooter: 'Languages',
  footerCopy: '© {year} AintoB.com – All rights reserved.',
  footerBadge: 'Privacy-first · Browser-only · No uploads',
  footerOpenOnline: 'Open files online',
  privacyPolicy: 'Privacy Policy',
  imprint: 'Imprint',
  cookieAria: 'Cookie preferences',
  cookieText: 'We use essential cookies only. No tracking without your consent.',
  acceptAll: 'Accept All',
  essentialOnly: 'Essential Only',

  // ── shared blocks ───────────────────────────────────────────────────────
  privTitle: '100% Private & Browser-Based',
  privText: 'Your files never leave your device. All conversion happens locally in your browser — nothing is uploaded to any server. No sign-up required.',
  whyLabel: 'Why AintoB?',
  whyTitle: 'Built for Speed, Privacy & Simplicity',
  whySub: 'No installs, no accounts, no file uploads. Every conversion runs entirely in your browser.',
  feat1Title: 'Instant',
  feat1Text: 'Results in milliseconds. No queues, no waiting, no server round-trips.',
  feat2Title: 'Private',
  feat2Text: 'Your data never leaves your browser. Zero server storage, zero uploads.',
  feat3Title: 'Mobile-friendly',
  feat3Text: 'Works flawlessly on any device — phone, tablet, or desktop.',
  feat4Title: 'Always Free',
  feat4Text: 'No sign-up, no subscription, no hidden costs. Free forever.',
  faqLabel: 'FAQ',
  faqTitle: 'Frequently Asked Questions',

  // ── open-online.com callout ─────────────────────────────────────────────
  ooTitleFmt: 'Just need to open {fmt} files?',
  ooTitleGeneric: 'Need to open a file instead of converting it?',
  ooText: 'open-online.com helps you open many different file types online — no need to convert them first.',
  ooButton: 'Open files on open-online.com',

  // ── converter widget ────────────────────────────────────────────────────
  widgetHeading: 'Convert {from} to {to}',
  tabFile: 'Upload File',
  tabPaste: 'Paste Text',
  inputMethod: 'Input method',
  pasteLabel: 'Paste your {from} content below',
  pastePlaceholder: 'Paste your {from} content here…',
  pasteAria: 'Paste {from} text',
  dropAria: 'Click or drag a {from} file here',
  dropTextHtml: 'Drag & drop your <strong>{from}</strong> file here',
  or: 'or',
  browseFile: 'Browse File',
  selectAria: 'Select {from} file',
  dropLimit: 'Max file size: 50 MB · Your file stays in your browser',
  removeFile: 'Remove file',
  fromLabel: 'From',
  toLabel: 'To',
  swapAria: 'Swap conversion direction',
  swapTitle: 'Swap A ↔ B',
  convertTo: 'Convert to {to}',
  complete: 'Conversion complete!',
  downloadTo: 'Download {to} File',
  downloadResult: 'Download Result',
  convertAnother: 'Convert another file',
  widgetPrivacy: 'Your file is processed locally in your browser — nothing is ever uploaded.',
  heicNoteHtml: '<strong>Safari only:</strong> HEIC encoding is natively supported in Safari 17+. On Chrome or Firefox, use <strong>PNG or WebP</strong> for lossless quality, or on macOS open the file in Preview → File → Export → HEIC.',
  engineNoteHtml: 'This converter runs a full <strong>FFmpeg engine in your browser</strong>. The first conversion downloads the engine (~31&nbsp;MB, cached afterwards) — your file itself still never leaves your device.',

  // ── converter page body ─────────────────────────────────────────────────
  moreFrom: 'More {from} Conversions',
  otherWays: 'Other Ways to Get a {to} File',
  needReverse: 'Need the reverse?',
  whyConvert: 'Why Convert {from} to {to}?',
  whyUse: 'Why Use the {name}?',
  useCases: 'Common use cases',
  keepInMind: 'Keep in mind:',
  howTo: 'How to Convert {from} to {to}',
  howToUse: 'How to Use the {name}',
  step1Html: 'Upload or drop your <strong>{from}</strong> file into the converter above.',
  step2Html: 'Adjust any output settings for <strong>{to}</strong> if needed.',
  step3Html: 'Click <strong>Convert</strong> and download your converted file instantly.',
  toolStep1Html: 'Upload or drop your <strong>{from}</strong> file into the tool above.',
  toolStep1PasteHtml: 'Upload or drop your <strong>{from}</strong> file into the tool above, or paste your content directly.',
  toolStep2: 'Choose your options in the settings panel.',
  toolStep3: 'Click the button and download your result instantly.',
  aboutFormats: 'About the Formats',
  aboutTool: 'About This Tool',
  compat: 'Compatibility:',
  pairIntro: 'Converting {from} to {to} is a common task whenever a file has to work somewhere that expects the other format. {fromFirst} {toFirst} This converter makes the switch locally in your browser — nothing is uploaded.',
  uc1Html: 'You have a <strong>{from}</strong> file and need it in <strong>{to}</strong> format.',
  uc2Html: 'The target software or platform requires <strong>{to}</strong> but your file is in <strong>{from}</strong>.',
  uc3Html: 'Typical use of <strong>{to}</strong>: {use}.',
  uc4: 'You want to reduce file size or improve compatibility without using desktop software.',
  faqFreeQ: 'Is the {from} to {to} converter free?',
  faqFreeA: 'Yes — completely free with no sign-up, no watermarks, and no size limits for typical files.',
  faqQualityQ: 'Will quality be lost when converting from {from} to {to}?',
  faqQualityLossless: 'Both {from} and {to} are lossless formats, so no quality will be lost during conversion.',
  faqQualityLossy: '{to} uses lossy compression, which may reduce quality slightly compared to the original {from}. For most uses, the difference is imperceptible at standard quality settings.',
  faqQualityGeneric: 'Quality depends on the output settings. For lossless output, choose the highest quality setting available.',
  faqSafeQ: 'Is my {from} file safe?',
  faqSafeA: 'Your file is processed entirely within your browser using local JavaScript. It is never uploaded to any server. Only you can access your file.',
  faqSizeQ: 'How large a {from} file can I convert?',
  faqSizeA: 'For browser-based conversion, files up to 50 MB work best. Very large files may take longer depending on your device. We recommend splitting very large files before converting.',
  faqMultiQ: 'Can I convert multiple {from} files at once?',
  faqMultiA: 'Currently, AintoB converts one file at a time to keep the browser-based process simple and private. Reload the page to convert another file.',
  toolFaq1Q: 'Is the {name} free?',
  toolFaq1A: 'Yes — completely free with no sign-up, no watermarks, and no size limits for typical files.',
  toolFaq2Q: 'Is my data safe?',
  toolFaq2A: 'Your file or pasted content is processed entirely within your browser using local JavaScript. It is never uploaded to any server. Only you can access your data.',
  toolFaq3Q: 'How large a file can I process?',
  toolFaq3A: 'For browser-based processing, files up to 50 MB work best. Very large files may take longer depending on your device.',
  toolFaq4Q: 'Do I need to install anything?',
  toolFaq4A: 'No — the {name} runs entirely in your web browser. No app, plugin, or account required.',

  // ── format hub ──────────────────────────────────────────────────────────
  fmtEyebrow: '{fmt} Format',
  whatIs: 'What is {fmt}?',
  commonUses: 'Common uses for {fmt}',
  note: 'Note:',
  convertFrom: 'Convert from {fmt}',
  convertFromSub: 'Choose the output format you need from a {fmt} file.',
  convertToFmt: 'Convert to {fmt}',
  convertToSub: 'Convert other formats into {fmt}.',
  fmtFallbackDesc: '{fmt} ({full}) is a file format.',
  hubFaqFreeQ: 'Is the {fmt} converter free?',
  hubFaqFreeA: 'Yes — all {fmt} conversion tools on AintoB are completely free. No account required, no upload limits for typical files.',
  hubFaqWhatQ: 'What is a {fmt} file?',
  hubFaqSafeQ: 'Is converting {fmt} files safe?',
  hubFaqSafeA: 'Your {fmt} files are processed entirely in your browser. Nothing is sent to any server — the conversion is performed locally using browser-native APIs.',
  hubFaqStandQ: 'What does {fmt} stand for?',
  hubFaqStandA: '{fmt} stands for {full}. {first}',

  // ── category / master hubs ──────────────────────────────────────────────
  browseByFormat: 'Browse by Format',
  browseByFormatSub: 'Select a format to see all available conversions from and to that format.',
  convToolsCount: '{n} conversion tools',
  masterEyebrow: 'Complete Directory',
  browseByType: 'Browse by File Type',
  catCount: '{n} converter tools in this category.',
  browse: 'Browse',
  mostPopularConv: 'Most Popular Conversions',

  // ── homepage ────────────────────────────────────────────────────────────
  homeEyebrow: 'Free · Private · Browser-Based',
  homeTitleHtml: 'Convert Anything<br><span class="text-accent">From A to B</span>',
  homeSub: 'Free online file conversion for images, documents, spreadsheets, audio and video. Everything runs in your browser — nothing uploaded, nothing stored.',
  browseAll: 'Browse All Converters',
  exploreCats: 'Explore Categories',
  fileTypesLabel: 'File Types',
  chooseCat: 'Choose a Converter Category',
  chooseCatSub: 'Browse by file type to find the exact converter you need.',
  browseTools: 'Browse tools',
  allCardDesc: 'Browse the full directory of {n}+ conversion tools, organised by format.',
  viewAll: 'View all',
  popularLabel: 'Most Used',
  popularTitle: 'Popular Converter Tools',
  popularSub: 'Jump straight to the most searched file conversions.',
  viewAllN: 'View All {n}+ Converters',
  homePrivLabel: 'Privacy First',
  homePrivTitle: 'Your Files Never Leave Your Browser',
  homePrivText: 'Unlike most online converters, AintoB never uploads your files to a server. Every conversion runs entirely in your browser using local processing — which means:',
  homePriv1: 'No file uploads — your data stays on your device',
  homePriv2: 'No server storage — nothing is saved or logged',
  homePriv3: 'No account required — completely anonymous',
  homePriv4: 'Works offline after the page loads',
  homePrivBoxTitle: 'Your Browser',
  homePrivBoxText: 'File loaded → Converted → Downloaded',
  homePrivBadge: '100% Local',
  howLabel: 'How It Works',
  howTitle: 'Convert Files in Three Steps',
  how1Title: 'Choose a Converter',
  how1Desc: 'Browse by category or format and pick your exact conversion (e.g. "HEIC to JPG").',
  how2Title: 'Drop or Select Your File',
  how2Desc: 'Drag and drop your file onto the converter, or click to browse from your device.',
  how3Title: 'Download the Result',
  how3Desc: 'Click convert and download your file in the new format — ready in seconds.',

  // ── language router (shown in every language on /) ──────────────────────
  routerChoose: 'Choose your language',
  routerSub: 'Free online file converter — private, in your browser.',
  routerNoJs: 'Continue in:',
};

const cat = {
  image: {
    converter: 'Image Converter', converters: 'Image Converters', eyebrow: 'Image Converters',
    popularTitle: 'Most Popular Image Conversions', popularSub: 'The most searched image format conversions.',
    allTitle: 'All Image Converters', relatedFormats: 'Related Image Formats',
    homeDesc: 'JPG, PNG, WebP, HEIC, AVIF, GIF, SVG, TIFF and more.',
    desc: "Image converters handle raster and vector formats used in photography, web design, and print. Whether you're converting iPhone HEIC photos to JPG, optimising images to WebP for the web, or exporting SVGs to PNG for social media, these tools handle the most common image format workflows entirely in your browser.",
    faqs: [
      { q: 'Is the image converter free?', a: 'Yes — all image converters on AintoB are completely free. No account, no subscription, no file size fees for typical files.' },
      { q: 'Which image format should I use for the web?', a: 'For photographs on the web, WebP or AVIF give the best file size with good quality. JPG is the safe, universally compatible fallback. Use PNG for graphics, icons, or images requiring transparency.' },
      { q: 'Can I convert HEIC photos from my iPhone?', a: 'Yes — the HEIC to JPG converter processes your iPhone photos directly in the browser. No app or software installation required.' },
      { q: 'Will converting reduce my image quality?', a: 'Converting to JPG or WebP uses lossy compression and will reduce quality slightly. Converting to PNG or TIFF is lossless. Lossless-to-lossless conversions (e.g. PNG to WebP in lossless mode) preserve full quality.' },
    ],
  },
  document: {
    converter: 'Document Converter', converters: 'Document Converters', eyebrow: 'Document Converters',
    popularTitle: 'Most Popular Document Conversions', popularSub: 'The most searched document format conversions.',
    allTitle: 'All Document Converters', relatedFormats: 'Related Document Formats',
    homeDesc: 'PDF, Word, HTML, Markdown, RTF, TXT and more.',
    desc: 'Document converters handle the formats used for text, reports, and structured content. Convert between PDF, Word, HTML, Markdown, RTF, and plain text — all without installing software or uploading files to a server.',
    faqs: [
      { q: 'Is the document converter free?', a: 'Yes — all document converters on AintoB are completely free. No account, no subscription, no file size fees for typical files.' },
      { q: 'Can I convert scanned PDFs to editable Word documents?', a: 'Scanned PDFs contain images of text rather than actual text characters. OCR (Optical Character Recognition) is required to extract editable text, which is beyond basic format conversion.' },
      { q: 'Does converting from Markdown preserve formatting?', a: 'Yes — Markdown converts cleanly to HTML, preserving headings, bold, italics, links, lists, and code blocks. Converting Markdown to PDF or Word also works, though complex layouts may need manual adjustment.' },
    ],
  },
  spreadsheet: {
    converter: 'Spreadsheet Converter', converters: 'Spreadsheet Converters', eyebrow: 'Spreadsheet Converters',
    popularTitle: 'Most Popular Spreadsheet Conversions', popularSub: 'The most searched spreadsheet format conversions.',
    allTitle: 'All Spreadsheet Converters', relatedFormats: 'Related Spreadsheet Formats',
    homeDesc: 'CSV, Excel, ODS, TSV and more.',
    desc: 'Spreadsheet converters handle tabular data formats used in data analysis, finance, and business reporting. Convert between CSV, Excel, ODS, and TSV — essential for data exchange between different systems and applications.',
    faqs: [
      { q: 'Is the spreadsheet converter free?', a: 'Yes — all spreadsheet converters on AintoB are completely free. No account, no subscription, no file size fees for typical files.' },
      { q: 'Will formulas be preserved when converting from Excel?', a: 'When converting Excel to CSV or TXT, formulas are replaced by their calculated values — the formula itself is not stored in plain text formats. Converting between spreadsheet formats (Excel ↔ ODS) generally preserves formulas.' },
      { q: 'What is the difference between CSV and TSV?', a: 'Both are plain-text tabular formats. CSV uses commas to separate values; TSV uses tab characters. TSV is safer for data that frequently contains commas (like addresses or numbers), while CSV is more universally supported.' },
    ],
  },
  audio: {
    converter: 'Audio Converter', converters: 'Audio Converters', eyebrow: 'Audio Converters',
    popularTitle: 'Most Popular Audio Conversions', popularSub: 'The most searched audio format conversions.',
    allTitle: 'All Audio Converters', relatedFormats: 'Related Audio Formats',
    homeDesc: 'MP3, WAV, M4A, OGG and more.',
    desc: "Audio converters handle music, podcast, and recording formats. Whether you're extracting audio from video, converting between compression formats, or preparing files for specific devices or platforms, these tools cover the most common audio conversion needs.",
    faqs: [
      { q: 'Is the audio converter free?', a: 'Yes — all audio converters on AintoB are completely free. No account, no subscription, no file size fees for typical files.' },
      { q: 'Which audio format has the best quality?', a: 'For lossless quality, WAV preserves audio with no compression. For smaller files with excellent quality, M4A/AAC and OGG Vorbis outperform MP3 at the same bitrate. MP3 is the most compatible choice for broad device support.' },
      { q: 'Can I extract audio from a video file?', a: 'Yes — AintoB includes tools like MP4 to MP3, MP4 to WAV, WebM to MP3, and more that extract the audio track from video files entirely in your browser.' },
    ],
  },
  video: {
    converter: 'Video Converter', converters: 'Video Converters', eyebrow: 'Video Converters',
    popularTitle: 'Most Popular Video Conversions', popularSub: 'The most searched video format conversions.',
    allTitle: 'All Video Converters', relatedFormats: 'Related Video Formats',
    homeDesc: 'MP4, MOV, WebM, AVI, GIF and more.',
    desc: 'Video converters handle the formats used for streaming, editing, and sharing video content. Convert between MP4, MOV, WebM, AVI, and more — and extract audio or create animated GIFs from video clips.',
    faqs: [
      { q: 'Is the video converter free?', a: 'Yes — all video converters on AintoB are completely free. No account, no subscription, no file size fees for typical files.' },
      { q: 'Which video format is best for social media?', a: 'MP4 with H.264 encoding is the universal choice — accepted by YouTube, Instagram, TikTok, Twitter, and virtually every platform. It balances quality, compatibility, and file size.' },
      { q: 'Can I convert a video to a GIF?', a: 'Yes — AintoB includes MP4 to GIF, WebM to GIF, and MOV to GIF converters. Note that GIFs are limited to 256 colours and can be quite large — for short clips, WebP animation or MP4 is often a better choice.' },
    ],
  },
  data: {
    converter: 'Data & Text Converter', converters: 'Data & Text Tools', eyebrow: 'Data & Text Converters',
    popularTitle: 'Most Popular Data & Text Conversions', popularSub: 'The most searched data format conversions.',
    allTitle: 'All Data & Text Converters', relatedFormats: 'Related Data & Text Formats',
    homeDesc: 'JSON, CSV, YAML, XML, Base64, URL encoding and more.',
    desc: 'Data and text tools handle the structured formats developers and analysts work with every day. Convert between JSON, CSV, YAML, and XML, encode or decode Base64 and URLs, format and minify JSON, and change text case — all instantly in your browser.',
    faqs: [
      { q: 'Are the data and text tools free?', a: 'Yes — every data tool on AintoB is completely free. No account, no subscription, no usage limits.' },
      { q: 'Is it safe to paste sensitive data like API responses or tokens?', a: 'All processing happens locally in your browser with JavaScript — nothing you paste or upload is ever sent to a server. For highly sensitive data you can even load the page, disconnect from the internet, and run the conversion offline.' },
      { q: 'What is the difference between JSON and YAML?', a: 'Both represent the same data model. JSON uses brackets and quotes and is the standard for APIs; YAML uses indentation and is preferred for hand-edited configuration files like Kubernetes manifests and CI pipelines.' },
      { q: 'Is Base64 encryption?', a: 'No — Base64 is an encoding, not encryption. It makes binary data safe to transmit as text, but anyone can decode it. Never rely on Base64 to protect secrets.' },
    ],
  },
};

// Hand-built pages keep their existing live English copy; the CSV supplies the
// text of every other English page.
const tools = {
  '/document/pdf-edit/': {
    name: 'PDF Editor',
    title: 'PDF Editor – Merge, Split, Rotate, Watermark · Free Browser Tool',
    meta: 'Free browser-based PDF editor. Merge multiple PDFs, split by page range, rotate or delete pages, and add text watermarks — all locally, no upload.',
    h1: 'PDF Editor',
  },
  '/document/pdf-to-searchable/': {
    name: 'PDF to Searchable PDF (OCR)',
    title: 'PDF to Searchable PDF – Free OCR, Browser-Only',
    meta: 'Make scanned PDFs searchable with free browser-based OCR. No upload, no server. Tesseract OCR runs entirely in your browser to add a text layer to image-based PDFs.',
    h1: 'PDF to Searchable PDF (OCR)',
  },
};

const homeFaqs = [
  { q: 'Is AintoB free to use?', a: 'Yes, every tool on AintoB.com is completely free with no registration or account required. There are no hidden costs or premium tiers.' },
  { q: 'Is my data safe?', a: 'Your files are processed entirely within your browser using local JavaScript. Nothing is ever uploaded to our servers — your data stays on your device from start to finish.' },
  { q: 'What file formats does AintoB support?', a: 'AintoB supports image formats (JPG, PNG, WebP, HEIC, AVIF, GIF, SVG, TIFF, BMP, ICO), document formats (PDF, Word, HTML, Markdown, RTF, TXT), spreadsheet formats (CSV, Excel, ODS, TSV), audio formats (MP3, WAV, M4A, OGG), video formats (MP4, MOV, WebM, AVI), and data formats (JSON, YAML, XML, Base64).' },
  { q: 'Do I need to install anything?', a: 'No. AintoB works entirely in your web browser — no app to download, no plugin to install. Open the page, drop your file, and convert.' },
  { q: 'Are there file size limits?', a: 'For browser-based conversion we recommend files under 50 MB for the best experience. Very large files may take longer to process depending on your device performance.' },
  { q: 'Can I just open a file instead of converting it?', a: 'Yes — open-online.com helps you open many different file types online, without converting them first.' },
];

const pages = {
  home: {
    title: 'AintoB – Free Online File Converter | Privacy-First, Browser-Based',
    desc: 'Convert files online for free. Images, documents, spreadsheets, audio and video — all processed in your browser. No uploads, no sign-up.',
  },
};

const legal = {
  privacy: {
    title: 'Privacy Policy | AintoB.com',
    desc: 'AintoB privacy policy. Learn how we handle your data — spoiler: we barely do. No file uploads, no tracking without consent.',
    h1: 'Privacy Policy',
    updated: 'Last updated: {date}',
    sections: [
      { h: '1. What data do we collect?', html: '<p>AintoB.com is a browser-based file conversion tool. <strong>Files you convert are never uploaded to our servers.</strong> All conversion processing happens locally in your browser using JavaScript.</p><p>We may collect basic anonymised analytics data (pages viewed, approximate location by country, browser type) when you consent to analytics cookies. This data is never linked to personal identifiers.</p>' },
      { h: '2. Cookies', html: '<p>We use essential cookies only by default. Essential cookies enable basic site functionality (e.g. cookie consent preference storage). We do not use tracking cookies without your explicit consent.</p><p>You can change your cookie preferences at any time using the cookie banner.</p>' },
      { h: '3. File handling', html: '<p>Files you select for conversion are processed entirely in your browser. They are <strong>never transmitted to our servers</strong>. We have no technical ability to access the content of your files.</p>' },
      { h: '4. Third-party services', html: '<p>We load Bootstrap CSS and JavaScript, and some conversion libraries, from a CDN (cdn.jsdelivr.net). The CDN may log request metadata (IP address, timestamp) as per its own privacy policy. We do not share any personal data with CDN providers.</p><p>Our pages link to the separate website open-online.com. If you follow such a link, that site’s own privacy policy applies.</p>' },
      { h: '5. Your rights (GDPR)', html: '<p>If you are in the EU/EEA, you have rights to access, correct, or delete personal data held about you. Since we collect minimal personal data, most requests will be straightforward. Contact us via the Imprint page for any data requests.</p>' },
      { h: '6. Contact', html: '<p>For privacy-related questions, see our <a href="{imprintUrl}">Imprint</a> page for contact details.</p>' },
    ],
  },
  imprint: {
    title: 'Imprint | AintoB.com',
    desc: 'Legal imprint and contact information for AintoB.com.',
    h1: 'Imprint',
    html: '<p>This website is operated by the owner of AintoB.com. For legal and GDPR-related inquiries, please use the contact form or reach out via email.</p><p>AintoB.com is a free, browser-based file conversion service. No files are stored on our servers.</p><h2>Disclaimer</h2><p>AintoB.com provides file conversion tools for informational and productivity purposes. We make no guarantees regarding the accuracy or completeness of converted output. Use converted files at your own discretion.</p>',
  },
};

module.exports = {
  s,
  cat,
  benefit: {},
  tools,
  fmtNames: {},
  homeFaqs,
  pages,
  legal,
};
