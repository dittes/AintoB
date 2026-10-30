/**
 * Document converters that need RTF or a PDF text reconstruction.
 *
 *   RTF  → HTML / Markdown / Word / PDF        (own RTF parser, no library)
 *   TXT / HTML / Markdown / Word → RTF         (own RTF writer)
 *   PDF  → HTML / Markdown / Word / RTF        (pdf.js text positions → headings, paragraphs, lists)
 *
 * One script for all of them; the pair is read from the page URL (like data-convert.js).
 * Libraries (turndown, markdown-it, mammoth, html-docx-js, pdf.js) are loaded per page by the build.
 */
(function () {
  'use strict';

  var slug = (location.pathname.match(/\/([a-z0-9]+-to-[a-z0-9]+)\/?$/) || [])[1] || '';
  var pair = slug.split('-to-');
  var FROM = pair[0], TO = pair[1];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function baseName(file, fallback) {
    var n = file && file.name ? file.name.replace(/\.[^.]+$/, '') : '';
    return n || fallback || 'converted';
  }

  /* ═════════════════════════ RTF → HTML ═════════════════════════ */

  var SKIP_DEST = {
    fonttbl: 1, colortbl: 1, stylesheet: 1, info: 1, pict: 1, object: 1, header: 1, footer: 1, headerl: 1, headerr: 1,
    headerf: 1, footerl: 1, footerr: 1, footerf: 1, footnote: 1, themedata: 1, colorschememapping: 1, latentstyles: 1,
    datastore: 1, xmlnstbl: 1, listtable: 1, listoverridetable: 1, revtbl: 1, rsidtbl: 1, generator: 1, fldinst: 1,
    bkmkstart: 1, bkmkend: 1, shpinst: 1, shptxt: 0, nonshppict: 1, private: 1, wgrffmtfilter: 1, pgptbl: 1, mmathPr: 1,
  };
  var SPECIAL = {
    emdash: '\u2014', endash: '\u2013', emspace: '\u2003', enspace: '\u2002', bullet: '\u2022',
    lquote: '\u2018', rquote: '\u2019', ldblquote: '\u201C', rdblquote: '\u201D', tab: '\t', line: '\n',
  };

  function decodeBytes(bytes, cp) {
    try { return new TextDecoder('windows-' + cp).decode(new Uint8Array(bytes)); }
    catch (e) { return String.fromCharCode.apply(null, bytes); }
  }

  function parseRtf(src) {
    if (!/^\s*\{\\rtf/.test(src)) throw new Error('This does not look like an RTF file.');
    var cp = (src.match(/\\ansicpg(\d+)/) || [])[1] || '1252';
    var i = 0, n = src.length;
    var st = { skip: false, b: false, i: false, u: false, s: false, sup: false, sub: false, fs: 0, uc: 1, cap: null };
    var stack = [];
    var blocks = [];          // {t:'p', html, fs, bold, list:null|'ul'|'ol'} | {t:'table', rows:[[html]]}
    var cur = newPara();
    var cells = [], rows = [], inTable = false;
    var marker = '', fieldHref = '', lastHref = '', pendingBytes = [], skipChars = 0;
    var fsCount = {};

    function newPara() { return { html: '', plain: '', fs: 0, boldChars: 0, chars: 0, list: null }; }
    function flushBytes() {
      if (!pendingBytes.length) return;
      emit(decodeBytes(pendingBytes, cp));
      pendingBytes = [];
    }
    function emit(text) {
      if (!text || st.skip) return;
      if (st.cap === 'marker') { marker += text; return; }
      if (st.cap === 'inst') { fieldHref += text; return; }
      // "•<tab>" / "1.<tab>" written as plain text (our own RTF writer, many generators) → list marker
      if (!cur.chars && !cur.html && !marker && /^(?:[•·‣▪-]|\d{1,3}[.)])$/.test(text.trim()) && /^\\tab\b/.test(src.substr(i, 5))) { marker = text.trim(); return; }
      var h = esc(text).replace(/\n/g, '<br>').replace(/\t/g, '&emsp;');
      if (!/\S/.test(text) && !cur.html) { return; }
      if (st.sup) h = '<sup>' + h + '</sup>';
      if (st.sub) h = '<sub>' + h + '</sub>';
      if (st.s) h = '<s>' + h + '</s>';
      if (st.u) h = '<u>' + h + '</u>';
      if (st.i) h = '<em>' + h + '</em>';
      if (st.b) h = '<strong>' + h + '</strong>';
      cur.html += h;
      var len = text.replace(/\s/g, '').length;
      cur.plain += text;
      cur.chars += len;
      if (st.b) cur.boldChars += len;
      if (len) { var fs = (st.fs || 22) / 2; cur.fs = Math.max(cur.fs, fs); fsCount[fs] = (fsCount[fs] || 0) + len; }
    }
    function endCell() {
      flushBytes();
      cells.push(cur.html.replace(/(<br>)+$/, ''));
      cur = newPara();
    }
    function endRow() {
      if (cur.html) endCell();
      if (cells.length) rows.push(cells);
      cells = [];
    }
    function flushTable() {
      if (rows.length) { blocks.push({ t: 'table', rows: rows }); rows = []; }
      inTable = false;
    }
    function endPara() {
      flushBytes();
      if (inTable) { if (cur.html) endCell(); return; }
      if (rows.length) flushTable();
      if (marker) {
        cur.list = /^\s*[0-9a-zA-Z]{1,4}[.)]?\s*$/.test(marker) ? 'ol' : 'ul';
        marker = '';
      }
      if (cur.html.replace(/<[^>]+>|&nbsp;|\s/g, '') || cur.list) blocks.push({ t: 'p', html: cur.html, plain: cur.plain, fs: cur.fs, bold: cur.chars && cur.boldChars / cur.chars > 0.9, list: cur.list });
      cur = newPara();
    }

    while (i < n) {
      var c = src[i];
      if (c === '{') {
        flushBytes();
        stack.push({ skip: st.skip, b: st.b, i: st.i, u: st.u, s: st.s, sup: st.sup, sub: st.sub, fs: st.fs, uc: st.uc, cap: st.cap, href: st.href });
        st.opening = true; st.href = null;
        i++;
      } else if (c === '}') {
        flushBytes();
        if (st.href) cur.html += '</a>';
        if (st.cap === 'inst' && stack.length && stack[stack.length - 1].cap !== 'inst') {
          var m = fieldHref.match(/HYPERLINK\s+"?([^"\s]+)"?/i);
          lastHref = m ? m[1] : '';
          fieldHref = '';
        }
        if (stack.length) st = stack.pop();
        st.opening = false;
        i++;
      } else if (c === '\\') {
        var d = src[i + 1];
        if (d === undefined) break;
        if (/[a-zA-Z]/.test(d)) {
          var j = i + 1;
          while (j < n && /[a-zA-Z]/.test(src[j])) j++;
          var word = src.slice(i + 1, j);
          var numStr = '';
          if (src[j] === '-' || /\d/.test(src[j] || '')) {
            var k = j; if (src[k] === '-') k++;
            while (k < n && /\d/.test(src[k])) k++;
            numStr = src.slice(j, k); j = k;
          }
          if (src[j] === ' ') j++;
          i = j;
          var num = numStr === '' ? null : parseInt(numStr, 10);
          var first = st.opening; st.opening = false;
          if (first && (st.star || SKIP_DEST[word])) { st.skip = true; }
          if (word === 'listtext' || word === 'pntext') { st.cap = 'marker'; st.skip = false; }
          if (word === 'fldinst') { st.cap = 'inst'; st.skip = false; }
          if (word === 'fldrslt') {
            st.skip = false;
            if (lastHref) { flushBytes(); cur.html += '<a href="' + esc(lastHref) + '">'; st.href = true; lastHref = ''; }
          }
          st.star = false;
          if (st.skip && st.cap !== 'marker' && st.cap !== 'inst') continue;
          switch (word) {
            case 'par': case 'sect': case 'page': endPara(); break;
            case 'pard': inTable = false; break;
            case 'intbl': inTable = true; break;
            case 'trowd': inTable = true; cells = []; break;
            case 'cell': endCell(); break;
            case 'row': endRow(); break;
            case 'b': flushBytes(); st.b = num !== 0; break;
            case 'i': flushBytes(); st.i = num !== 0; break;
            case 'ul': flushBytes(); st.u = num !== 0; break;
            case 'ulnone': flushBytes(); st.u = false; break;
            case 'strike': flushBytes(); st.s = num !== 0; break;
            case 'super': st.sup = true; st.sub = false; break;
            case 'sub': st.sub = true; st.sup = false; break;
            case 'nosupersub': st.sup = st.sub = false; break;
            case 'fs': st.fs = num || 0; break;
            case 'plain': flushBytes(); st.b = st.i = st.u = st.s = st.sup = st.sub = false; break;
            case 'uc': st.uc = num == null ? 1 : num; break;
            case 'u':
              flushBytes();
              if (num != null) { if (num < 0) num += 65536; emit(String.fromCharCode(num)); skipChars = st.uc; }
              break;
            default:
              if (SPECIAL[word] !== undefined) { flushBytes(); emit(SPECIAL[word]); }
          }
        } else if (d === "'") {
          var hex = src.substr(i + 2, 2);
          i += 4;
          if (skipChars > 0) { skipChars--; continue; }
          if (!st.skip || st.cap) pendingBytes.push(parseInt(hex, 16) || 63);
        } else if (d === '*') {
          st.star = true; i += 2;
        } else if (d === '\\' || d === '{' || d === '}') {
          flushBytes(); emit(d); i += 2;
        } else if (d === '~') {
          flushBytes(); emit('\u00A0'); i += 2;
        } else if (d === '_') {
          flushBytes(); emit('\u2011'); i += 2;
        } else if (d === '\n' || d === '\r') {
          endPara(); i += 2;
        } else { i += 2; }
      } else if (c === '\r' || c === '\n') {
        i++;
      } else {
        // plain text run up to the next control character
        var e = i;
        while (e < n && src[e] !== '\\' && src[e] !== '{' && src[e] !== '}' && src[e] !== '\r' && src[e] !== '\n') e++;
        var chunk = src.slice(i, e);
        i = e;
        if (skipChars > 0) { var cut = Math.min(skipChars, chunk.length); chunk = chunk.slice(cut); skipChars -= cut; }
        if (chunk) { flushBytes(); emit(chunk); }
      }
    }
    flushBytes();
    if (cur.html) endPara();
    if (rows.length) flushTable();

    // body font size = most frequent size by characters
    var body = 11, best = 0;
    Object.keys(fsCount).forEach(function (k) { if (fsCount[k] > best) { best = fsCount[k]; body = parseFloat(k); } });
    return { blocks: blocks, body: body };
  }

  /** blocks: {t:'p', html, plain, fs, bold, list} | {t:'table', rows} → semantic HTML */
  function blocksToHtml(blocks, body) {
    var out = [], listType = null;
    function closeList() { if (listType) { out.push('</' + listType + '>'); listType = null; } }
    var sizes = blocks.filter(function (b) { return b.t === 'p' && b.fs > body * 1.1 && !b.list; }).map(function (b) { return b.fs; });
    var levels = sizes.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return b - a; }).slice(0, 3);
    blocks.forEach(function (b) {
      if (b.t === 'table') {
        closeList();
        out.push('<table>' + b.rows.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
        }).join('') + '</table>');
        return;
      }
      var html = b.html.replace(/<\/(strong|em|u|s)><\1>/g, '');
      if (b.list) {
        if (listType !== b.list) { closeList(); out.push('<' + b.list + '>'); listType = b.list; }
        out.push('<li>' + html + '</li>');
        return;
      }
      closeList();
      var inner = html.replace(/^<strong>([\s\S]*)<\/strong>$/, '$1');
      var lvl = levels.indexOf(b.fs);
      if (b.plain.length < 160 && lvl >= 0) out.push('<h' + (lvl + 1) + '>' + inner + '</h' + (lvl + 1) + '>');
      else if (b.plain.length < 80 && b.bold && b.fs >= body) out.push('<h3>' + inner + '</h3>');
      else out.push('<p>' + html + '</p>');
    });
    closeList();
    return out.join('\n');
  }

  function rtfToHtmlBody(src) {
    var r = parseRtf(src);
    return blocksToHtml(r.blocks, r.body);
  }

  /* ═════════════════════════ HTML → RTF ═════════════════════════ */

  function rtfEsc(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charCodeAt(i);
      if (ch === 92) out += '\\\\';
      else if (ch === 123) out += '\\{';
      else if (ch === 125) out += '\\}';
      else if (ch === 10) out += '\\line ';
      else if (ch === 9) out += '\\tab ';
      else if (ch === 13) continue;
      else if (ch < 32) continue;
      else if (ch < 128) out += text[i];
      else out += '\\u' + (ch > 32767 ? ch - 65536 : ch) + '?';
    }
    return out;
  }

  function htmlToRtf(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,head,noscript,template').forEach(function (el) { el.remove(); });
    var out = '';
    var listStack = [];

    function runs(node, fmt) {
      var s = '';
      node.childNodes.forEach(function (ch) { s += inline(ch, fmt); });
      return s;
    }
    function wrap(code, inner) { return inner ? '{' + code + ' ' + inner + '}' : ''; }
    function inline(node, fmt) {
      if (node.nodeType === 3) return rtfEsc(node.nodeValue.replace(/\s+/g, ' '));
      if (node.nodeType !== 1) return '';
      var tag = node.tagName.toLowerCase();
      switch (tag) {
        case 'br': return '\\line ';
        case 'b': case 'strong': return wrap('\\b', runs(node, fmt));
        case 'i': case 'em': case 'cite': case 'dfn': return wrap('\\i', runs(node, fmt));
        case 'u': case 'ins': return wrap('\\ul', runs(node, fmt));
        case 's': case 'strike': case 'del': return wrap('\\strike', runs(node, fmt));
        case 'sup': return wrap('\\super', runs(node, fmt));
        case 'sub': return wrap('\\sub', runs(node, fmt));
        case 'code': case 'kbd': case 'samp': case 'tt': return wrap('\\f1', runs(node, fmt));
        case 'a': {
          var href = node.getAttribute('href') || '';
          var inner = runs(node, fmt);
          if (!/^(https?:|mailto:)/i.test(href) || !inner) return inner;
          return '{\\field{\\*\\fldinst{HYPERLINK "' + href.replace(/[\\{}"]/g, '') + '"}}{\\fldrslt{\\cf1\\ul ' + inner + '}}}';
        }
        case 'img': { var alt = node.getAttribute('alt'); return alt ? rtfEsc('[' + alt + ']') : ''; }
        case 'input': case 'button': case 'select': case 'textarea': return '';
        default: return runs(node, fmt);
      }
    }
    function para(inner, opts) {
      opts = opts || {};
      return '{\\pard' + (opts.extra || '') + '\\sa' + (opts.after == null ? 160 : opts.after) + ' ' + inner + '\\par}\n';
    }
    var HEAD = { h1: 40, h2: 32, h3: 28, h4: 24, h5: 22, h6: 22 };

    function block(node) {
      if (node.nodeType === 3) {
        var t = node.nodeValue.replace(/\s+/g, ' ').trim();
        if (t) out += para(rtfEsc(t));
        return;
      }
      if (node.nodeType !== 1) return;
      var tag = node.tagName.toLowerCase();
      if (HEAD[tag]) {
        out += '{\\pard\\keepn\\sb240\\sa120\\b\\fs' + HEAD[tag] + ' ' + runs(node) + '\\par}\n';
      } else if (tag === 'p' || tag === 'figcaption' || tag === 'summary') {
        out += para(runs(node));
      } else if (tag === 'ul' || tag === 'ol') {
        listStack.push({ type: tag, n: 0 });
        node.childNodes.forEach(function (ch) {
          if (ch.nodeType === 1 && ch.tagName.toLowerCase() === 'li') li(ch);
          else block(ch);
        });
        listStack.pop();
      } else if (tag === 'blockquote') {
        node.childNodes.forEach(function (ch) {
          if (ch.nodeType === 1 && /^(p|div)$/i.test(ch.tagName)) out += para(runs(ch), { extra: '\\li720\\i', after: 120 });
          else if (ch.nodeType === 3 && ch.nodeValue.trim()) out += para(rtfEsc(ch.nodeValue.trim()), { extra: '\\li720\\i' });
          else block(ch);
        });
      } else if (tag === 'pre') {
        node.textContent.replace(/\n$/, '').split('\n').forEach(function (line) {
          out += '{\\pard\\sa0\\f1\\fs20 ' + rtfEsc(line) + '\\par}\n';
        });
        out += '{\\pard\\sa160\\par}\n';
      } else if (tag === 'hr') {
        out += '{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20\\sa160\\par}\n';
      } else if (tag === 'table') {
        table(node);
      } else if (tag === 'li') {
        li(node);
      } else if (/^(div|section|article|main|aside|header|footer|nav|figure|details|body|html|form|fieldset|dl|dd|dt|center|address)$/.test(tag)) {
        var hasBlock = node.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,table,pre,blockquote,div,section,li,hr');
        if (hasBlock) node.childNodes.forEach(block);
        else if (node.textContent.trim()) out += para(runs(node));
      } else {
        var r = inline(node);
        if (r.trim()) out += para(r);
      }
    }
    function li(node) {
      var depth = Math.max(listStack.length, 1);
      var top = listStack[listStack.length - 1] || { type: 'ul', n: 0 };
      top.n++;
      var label = top.type === 'ol' ? top.n + '.' : '\\bullet ';
      // inline content first, nested lists after
      var inner = '', nested = [];
      node.childNodes.forEach(function (ch) {
        if (ch.nodeType === 1 && /^(ul|ol)$/i.test(ch.tagName)) nested.push(ch);
        else if (ch.nodeType === 1 && /^(p|div)$/i.test(ch.tagName)) inner += runs(ch) + ' ';
        else inner += inline(ch);
      });
      out += '{\\pard\\fi-360\\li' + (360 + depth * 360) + '\\sa60 ' + label + '\\tab ' + inner.trim() + '\\par}\n';
      nested.forEach(block);
    }
    function table(node) {
      var rowsEl = node.querySelectorAll('tr');
      rowsEl.forEach(function (tr) {
        var cellsEl = Array.prototype.filter.call(tr.children, function (c) { return /^(td|th)$/i.test(c.tagName); });
        if (!cellsEl.length) return;
        var w = Math.floor(9000 / cellsEl.length), s = '\\trowd\\trgaph108';
        cellsEl.forEach(function (c, i) {
          s += '\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10\\cellx' + (w * (i + 1));
        });
        cellsEl.forEach(function (c) {
          var isTh = c.tagName.toLowerCase() === 'th';
          s += '\\pard\\intbl ' + (isTh ? '\\b ' : '') + runs(c).trim() + (isTh ? '\\b0 ' : '') + '\\cell';
        });
        out += s + '\\row\n';
      });
      out += '{\\pard\\sa160\\par}\n';
    }

    block(doc.body);
    return '{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033' +
      '{\\fonttbl{\\f0\\fswiss\\fcharset0 Calibri;}{\\f1\\fmodern\\fcharset0 Courier New;}}' +
      '{\\colortbl ;\\red37\\green87\\blue214;}\\viewkind4\\uc1\\f0\\fs22\n' + out + '}';
  }

  function textToRtf(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var body = lines.map(function (l) { return '{\\pard\\sa0 ' + rtfEsc(l) + '\\par}'; }).join('\n');
    return '{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033{\\fonttbl{\\f0\\fmodern\\fcharset0 Courier New;}}\\viewkind4\\uc1\\f0\\fs21\n' + body + '}';
  }

  /* ═════════════════════════ PDF → HTML ═════════════════════════ */

  async function pdfToBlocks(file) {
    var pdfjsLib = window['pdfjs-dist/build/pdf'];
    if (!pdfjsLib) throw new Error('PDF library not loaded. Reload the page and try again.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    var pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    var pages = [];
    var sizeCount = {};

    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var viewport = page.getViewport({ scale: 1 });
      var content = await page.getTextContent();
      var items = content.items.filter(function (it) { return it.str !== undefined && it.transform; }).map(function (it) {
        return { s: it.str, x: it.transform[4], y: it.transform[5], size: Math.hypot(it.transform[0], it.transform[1]) || it.height || 10, w: it.width || 0 };
      });
      items.sort(function (a, b) { return Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x; });
      // group into lines
      var lines = [];
      items.forEach(function (it) {
        var ln = lines[lines.length - 1];
        if (ln && Math.abs(ln.y - it.y) <= Math.max(2, ln.size * 0.35)) ln.items.push(it);
        else lines.push({ y: it.y, size: it.size, items: [it] });
      });
      lines = lines.map(function (ln) {
        ln.items.sort(function (a, b) { return a.x - b.x; });
        var text = '', last = null, chars = {}, x0 = ln.items[0].x;
        ln.items.forEach(function (it) {
          if (last) {
            var gap = it.x - (last.x + last.w);
            if (gap > last.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.s)) text += ' ';
          }
          text += it.s; last = it;
          var k = Math.round(it.size * 2) / 2; chars[k] = (chars[k] || 0) + it.s.replace(/\s/g, '').length;
        });
        var size = ln.size, best = -1;
        Object.keys(chars).forEach(function (k) { if (chars[k] > best) { best = chars[k]; size = parseFloat(k); } });
        text = text.replace(/\s+/g, ' ').trim();
        if (text) sizeCount[size] = (sizeCount[size] || 0) + text.replace(/\s/g, '').length;
        var x1 = ln.items.reduce(function (m, it) { return Math.max(m, it.x + it.w); }, 0);
        return { text: text, size: size, y: ln.y, x: x0, x1: x1, page: p, h: viewport.height };
      }).filter(function (ln) { return ln.text; });
      pages.push(lines);
    }

    // running headers / footers: same text (digits ignored) near the page edge on >= 3 pages, or a bare page number
    var norm = function (t) { return t.replace(/\d+/g, '#').toLowerCase(); };
    var seen = {};
    pages.forEach(function (lines) {
      var done = {};
      lines.forEach(function (ln) {
        var edge = ln.y < ln.h * 0.09 || ln.y > ln.h * 0.93;
        ln.edge = edge;
        if (edge) { var k = norm(ln.text); if (!done[k]) { seen[k] = (seen[k] || 0) + 1; done[k] = 1; } }
      });
    });
    var minPages = Math.min(3, pdf.numPages);
    pages = pages.map(function (lines) {
      return lines.filter(function (ln) {
        if (!ln.edge) return true;
        if (/^(page\s*)?\d{1,4}(\s*(\/|of)\s*\d{1,4})?$/i.test(ln.text)) return false;
        return !(pdf.numPages >= 3 && seen[norm(ln.text)] >= minPages);
      });
    });

    var body = 11, bestN = 0;
    Object.keys(sizeCount).forEach(function (k) { if (sizeCount[k] > bestN) { bestN = sizeCount[k]; body = parseFloat(k); } });

    // text column extent (left edge = most common start, right edge = long lines' end) → a line that stops well
    // short of the right edge ends its paragraph / list item
    var allLines = [].concat.apply([], pages);
    var left = Math.min.apply(null, allLines.map(function (l) { return l.x; }));
    var rights = allLines.map(function (l) { return l.x1; }).sort(function (a, b) { return a - b; });
    var right = rights.length ? rights[Math.floor(rights.length * 0.9)] : 0;
    var shortLine = function (l) { return right - left > 100 && l.x1 < left + (right - left) * 0.72; };

    var BULLET = /^([•●▪■◦·‣–—-]|\*|\d{1,3}[.)]|[a-z][.)])\s+/;
    var blocks = [], curB = null;
    function push() { if (curB) { blocks.push(curB); curB = null; } }
    var lastLine = null;
    pages.forEach(function (lines) {
      lastLine = null;
      lines.forEach(function (ln) {
        var m = BULLET.exec(ln.text);
        var isHead = ln.size > body * 1.12;
        var gap = lastLine ? lastLine.y - ln.y : 0;
        var sameFlow = lastLine && gap > 0 && gap < Math.max(lastLine.size, ln.size) * 1.65 && Math.abs(lastLine.size - ln.size) < 0.8 && !shortLine(lastLine);
        if (isHead) {
          if (curB && curB.t === 'h' && sameFlow) curB.text += ' ' + ln.text;
          else { push(); curB = { t: 'h', text: ln.text, size: ln.size }; }
        } else if (m && ln.size <= body * 1.12) {
          push();
          curB = { t: 'li', ordered: /^\d|^[a-z][.)]/i.test(m[1]), text: ln.text.slice(m[0].length) };
        } else if (curB && (curB.t === 'p' || curB.t === 'li') && sameFlow) {
          if (/[A-Za-zÀ-ž]-$/.test(curB.text) && /^[a-zà-ž]/.test(ln.text)) curB.text = curB.text.slice(0, -1) + ln.text;
          else curB.text += ' ' + ln.text;
        } else {
          push();
          curB = { t: 'p', text: ln.text };
        }
        lastLine = ln;
      });
      // a paragraph may continue on the next page; keep curB open but break line flow
    });
    push();
    if (!blocks.length) throw new Error('No text was found in this PDF. It may be a scanned or image-only PDF. Use the PDF to Searchable PDF tool to extract text via OCR.');

    var sizes = blocks.filter(function (b) { return b.t === 'h'; }).map(function (b) { return b.size; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return b - a; });
    return { blocks: blocks, levels: sizes };
  }

  function pdfBlocksToHtml(res) {
    var out = [], lt = null;
    function close() { if (lt) { out.push('</' + lt + '>'); lt = null; } }
    res.blocks.forEach(function (b) {
      if (b.t === 'li') {
        var tag = b.ordered ? 'ol' : 'ul';
        if (lt !== tag) { close(); out.push('<' + tag + '>'); lt = tag; }
        out.push('<li>' + esc(b.text) + '</li>');
        return;
      }
      close();
      if (b.t === 'h') { var lvl = Math.min(res.levels.indexOf(b.size) + 1, 4) || 1; out.push('<h' + lvl + '>' + esc(b.text) + '</h' + lvl + '>'); }
      else out.push('<p>' + esc(b.text) + '</p>');
    });
    close();
    return out.join('\n');
  }

  /* ═════════════════════════ output helpers ═════════════════════════ */

  var HTML_CSS = 'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.6;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#171b24}' +
    'table{border-collapse:collapse}td,th{border:1px solid #c9ced6;padding:.35rem .6rem;vertical-align:top}';
  function fullHtml(body, title) {
    return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(title || 'Document') + '</title><style>' + HTML_CSS + '</style></head>\n<body>\n' + body + '\n</body></html>\n';
  }
  function toMarkdown(html) {
    if (!window.TurndownService) throw new Error('Markdown library not loaded. Reload the page and try again.');
    var td = new window.TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
    return td.turndown(html);
  }
  function toDocx(html) {
    if (!window.htmlDocx) throw new Error('Word library not loaded. Reload the page and try again.');
    return window.htmlDocx.asBlob(fullHtml(html), { orientation: 'portrait', margins: { top: 1134, bottom: 1134, left: 1134, right: 1134 } });
  }
  var PRINT_CSS = '@page{margin:2.2cm;size:A4}body{font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:11pt;line-height:1.55;color:#000;margin:0}' +
    'h1{font-size:20pt;margin:0 0 10pt}h2{font-size:15pt;margin:14pt 0 6pt}h3{font-size:12.5pt;margin:12pt 0 5pt}h1,h2,h3{page-break-after:avoid}' +
    'p{margin:0 0 8pt}table{border-collapse:collapse;width:100%;margin-bottom:10pt}td,th{border:1px solid #999;padding:4px 7px;vertical-align:top}' +
    'ul,ol{margin:0 0 8pt;padding-left:22px}a{color:#000}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  function printWindow(bodyHtml, title) {
    var w = window.open('', '_blank', 'width=920,height=700,menubar=no,toolbar=no');
    if (!w) {
      throw new Error('Popup blocked. Please allow pop-ups for this site in your browser settings, then click "Open Print Dialog" again.');
    }
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(title) + '</title><style>' + PRINT_CSS + '</style></head><body>' + bodyHtml + '</body></html>');
    w.document.close();
    var go = function () { w.focus(); w.print(); };
    if (w.document.readyState === 'complete') setTimeout(go, 400); else w.addEventListener('load', function () { setTimeout(go, 400); });
    return { printMode: true, printFn: go };
  }
  function blob(text, type) { return new Blob([text], { type: type + ';charset=utf-8' }); }

  document.addEventListener('DOMContentLoaded', function () {
    if (TO !== 'pdf') return;
    var btn = document.getElementById('convertBtn'), dl = document.getElementById('downloadBtn');
    if (btn) btn.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>' + (window.__t ? window.__t('Open Print Dialog') : 'Open Print Dialog');
    if (dl) dl.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>' + (window.__t ? window.__t('Print / Save as PDF Again') : 'Print / Save as PDF Again');
  });

  /* ═════════════════════════ entry point ═════════════════════════ */

  window.performConversion = async function (input) {
    var isText = typeof input === 'string';
    var name = baseName(isText ? null : input);

    // ── X → RTF ──
    if (TO === 'rtf') {
      var rtf;
      if (FROM === 'txt') rtf = textToRtf(isText ? input : await input.text());
      else if (FROM === 'html') rtf = htmlToRtf(isText ? input : await input.text());
      else if (FROM === 'markdown') {
        if (!window.markdownit) throw new Error('Markdown library not loaded. Reload the page and try again.');
        rtf = htmlToRtf(window.markdownit({ html: false, linkify: true, typographer: true }).render(isText ? input : await input.text()));
      } else if (FROM === 'word') {
        if (!window.mammoth) throw new Error('Word library not loaded. Reload the page and try again.');
        var res = await window.mammoth.convertToHtml({ arrayBuffer: await input.arrayBuffer() });
        rtf = htmlToRtf(res.value);
      } else if (FROM === 'pdf') {
        rtf = htmlToRtf(pdfBlocksToHtml(await pdfToBlocks(input)));
      }
      return { blob: blob(rtf, 'application/rtf'), filename: name + '.rtf' };
    }

    // ── RTF → X ──
    if (FROM === 'rtf') {
      var body = rtfToHtmlBody(isText ? input : await input.text());
      if (!body.trim()) throw new Error('No text was found in this RTF file.');
      if (TO === 'html') return { blob: blob(fullHtml(body, name), 'text/html'), filename: name + '.html' };
      if (TO === 'markdown') return { blob: blob(toMarkdown(body) + '\n', 'text/markdown'), filename: name + '.md' };
      if (TO === 'word') return { blob: toDocx(body), filename: name + '.docx' };
      if (TO === 'pdf') return printWindow(body, name);
    }

    // ── PDF → X ──
    if (FROM === 'pdf') {
      var html = pdfBlocksToHtml(await pdfToBlocks(input));
      if (TO === 'html') return { blob: blob(fullHtml(html, name), 'text/html'), filename: name + '.html' };
      if (TO === 'markdown') return { blob: blob(toMarkdown(html) + '\n', 'text/markdown'), filename: name + '.md' };
      if (TO === 'word') return { blob: toDocx(html), filename: name + '.docx' };
    }

    throw new Error('Converter not available for this format yet.');
  };

  // exposed for tests / other converters
  window.__docConvert = { parseRtf: parseRtf, rtfToHtmlBody: rtfToHtmlBody, htmlToRtf: htmlToRtf, textToRtf: textToRtf };
})();
