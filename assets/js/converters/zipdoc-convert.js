/**
 * ODT and EPUB documents (both are ZIP packages of XML/XHTML).
 *
 *   ODT  → TXT / HTML / Markdown / Word / PDF
 *   TXT / HTML / Markdown / Word → ODT
 *   EPUB → TXT / HTML / Markdown / PDF
 *
 * The pair is read from the page URL. Libraries per page: JSZip (always), turndown (→ Markdown),
 * html-docx-js (→ Word), markdown-it (Markdown →), mammoth (Word →).
 * Everything runs locally; the file is never uploaded.
 */
(function () {
  'use strict';

  var slug = (location.pathname.match(/\/([a-z0-9]+-to-[a-z0-9]+)\/?$/) || [])[1] || '';
  var FROM = slug.split('-to-')[0], TO = slug.split('-to-')[1];

  var NS = {
    text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
    fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    xlink: 'http://www.w3.org/1999/xlink',
  };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function needZip() {
    if (!window.JSZip) throw new Error('ZIP library not loaded. Reload the page and try again.');
    return window.JSZip;
  }
  function baseName(file) { return (file && file.name ? file.name.replace(/\.[^.]+$/, '') : '') || 'converted'; }
  function xml(text, type) {
    var doc = new DOMParser().parseFromString(text, type || 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('This file is damaged or not a valid document.');
    return doc;
  }
  function blob(text, type) { return new Blob([text], { type: type + ';charset=utf-8' }); }

  /* ═════════════════════════ ODT → HTML ═════════════════════════ */

  function mimeOf(path) {
    var e = (path.match(/\.([a-z0-9]+)$/i) || [])[1];
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' }[(e || '').toLowerCase()];
  }

  async function odtToHtml(file) {
    var zip = await needZip().loadAsync(await file.arrayBuffer());
    var contentFile = zip.file('content.xml');
    if (!contentFile) throw new Error('This is not an OpenDocument text file (.odt).');
    var doc = xml(await contentFile.async('string'));
    var stylesFile = zip.file('styles.xml');
    var styleDoc = stylesFile ? xml(await stylesFile.async('string')) : null;

    // style name → { b, i, u, s, sup, sub }
    var styles = {};
    function readStyles(d) {
      if (!d) return;
      Array.prototype.forEach.call(d.getElementsByTagNameNS(NS.style, 'style'), function (st) {
        var name = st.getAttributeNS(NS.style, 'name');
        var tp = st.getElementsByTagNameNS(NS.style, 'text-properties')[0];
        if (!tp) return;
        var pos = tp.getAttributeNS(NS.style, 'text-position') || '';
        styles[name] = {
          b: /bold|^[6-9]00$/.test(tp.getAttributeNS(NS.fo, 'font-weight') || ''),
          i: /italic|oblique/.test(tp.getAttributeNS(NS.fo, 'font-style') || ''),
          u: !!tp.getAttributeNS(NS.style, 'text-underline-style') && tp.getAttributeNS(NS.style, 'text-underline-style') !== 'none',
          s: !!tp.getAttributeNS(NS.style, 'text-line-through-style') && tp.getAttributeNS(NS.style, 'text-line-through-style') !== 'none',
          sup: /^super|^\d+%/.test(pos) && !/^-/.test(pos),
          sub: /^sub|^-\d+%/.test(pos),
        };
      });
    }
    readStyles(doc); readStyles(styleDoc);

    // list styles: numbered or bullet
    var numbered = {};
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS.text, 'list-style'), function (ls) {
      numbered[ls.getAttributeNS(NS.style, 'name')] = ls.getElementsByTagNameNS(NS.text, 'list-level-style-number').length > 0;
    });

    var images = {};
    async function loadImage(href) {
      if (images[href] !== undefined) return images[href];
      var f = zip.file(href), m = mimeOf(href);
      images[href] = f && m ? 'data:' + m + ';base64,' + (await f.async('base64')) : '';
      return images[href];
    }

    async function kids(node, ctx) {
      var s = '';
      for (var c = node.firstChild; c; c = c.nextSibling) s += await walk(c, ctx);
      return s;
    }
    function wrapStyle(name, inner) {
      var st = styles[name]; if (!st || !inner) return inner;
      if (st.sup) inner = '<sup>' + inner + '</sup>';
      if (st.sub) inner = '<sub>' + inner + '</sub>';
      if (st.s) inner = '<s>' + inner + '</s>';
      if (st.u) inner = '<u>' + inner + '</u>';
      if (st.i) inner = '<em>' + inner + '</em>';
      if (st.b) inner = '<strong>' + inner + '</strong>';
      return inner;
    }

    async function walk(node, ctx) {
      if (node.nodeType === 3) {
        // whitespace between block elements is only XML indentation
        var par = node.parentNode;
        var inText = par && par.namespaceURI === NS.text && /^(p|h|span|a)$/.test(par.localName);
        return !inText && !/\S/.test(node.nodeValue) ? '' : esc(node.nodeValue);
      }
      if (node.nodeType !== 1) return '';
      var ns = node.namespaceURI, ln = node.localName;
      if (ns === NS.text) {
        switch (ln) {
          case 'p': {
            var inner = await kids(node, ctx);
            if (!inner.trim() && !/<img/.test(inner)) return '';
            if (ctx.inList) return inner;
            return '<p>' + inner + '</p>\n';
          }
          case 'h': {
            var lvl = Math.min(parseInt(node.getAttributeNS(NS.text, 'outline-level') || '1', 10) || 1, 6);
            return '<h' + lvl + '>' + (await kids(node, ctx)) + '</h' + lvl + '>\n';
          }
          case 'span': return wrapStyle(node.getAttributeNS(NS.text, 'style-name'), await kids(node, ctx));
          case 'a': {
            var href = node.getAttributeNS(NS.xlink, 'href') || '';
            var t = await kids(node, ctx);
            return /^(https?:|mailto:)/i.test(href) ? '<a href="' + esc(href) + '">' + t + '</a>' : t;
          }
          case 'line-break': return '<br>';
          case 'tab': return '&emsp;';
          case 's': return '&nbsp;'.repeat(parseInt(node.getAttributeNS(NS.text, 'c') || '1', 10));
          case 'list': {
            var tag = numbered[node.getAttributeNS(NS.text, 'style-name')] ? 'ol' : 'ul';
            var items = '';
            for (var li = node.firstChild; li; li = li.nextSibling) {
              if (li.localName === 'list-item' || li.localName === 'list-header') {
                var parts = '';
                for (var c = li.firstChild; c; c = c.nextSibling) {
                  parts += c.localName === 'list' ? await walk(c, ctx) : (await walk(c, { inList: true })) + ' ';
                }
                items += '<li>' + parts.trim() + '</li>\n';
              }
            }
            return '<' + tag + '>\n' + items + '</' + tag + '>\n';
          }
          case 'soft-page-break': case 'tracked-changes': case 'sequence-decls': case 'table-of-content': return ln === 'table-of-content' ? await kids(node, ctx) : '';
          case 'index-body': case 'section': case 'index-title': return await kids(node, ctx);
          default: return await kids(node, ctx);
        }
      }
      if (ns === NS.table) {
        if (ln === 'table') {
          var rows = '';
          for (var r = node.firstChild; r; r = r.nextSibling) {
            var rowEls = r.localName === 'table-row' ? [r] : (r.localName === 'table-header-rows' || r.localName === 'table-rows') ? Array.prototype.slice.call(r.childNodes) : [];
            for (var ri = 0; ri < rowEls.length; ri++) {
              if (rowEls[ri].localName !== 'table-row') continue;
              var cells = '';
              for (var cell = rowEls[ri].firstChild; cell; cell = cell.nextSibling) {
                if (cell.localName !== 'table-cell') continue;
                var span = parseInt(cell.getAttributeNS(NS.table, 'number-columns-spanned') || '1', 10);
                cells += '<td' + (span > 1 ? ' colspan="' + span + '"' : '') + '>' + (await kids(cell, { inList: false })).replace(/^<p>([\s\S]*)<\/p>\n$/, '$1') + '</td>';
              }
              rows += '<tr>' + cells + '</tr>';
            }
          }
          return '<table>' + rows + '</table>\n';
        }
        return '';
      }
      if (ns === NS.draw) {
        if (ln === 'image') {
          var h = (node.getAttributeNS(NS.xlink, 'href') || '').replace(/^\.\//, '');
          var src = h && !/^(https?:)/i.test(h) ? await loadImage(h) : '';
          return src ? '<img src="' + src + '" alt="">' : '';
        }
        if (ln === 'frame' || ln === 'a') return await kids(node, ctx);
        return '';
      }
      if (ns === NS.office && (ln === 'annotation' || ln === 'forms' || ln === 'scripts')) return '';
      return await kids(node, ctx);
    }

    var body = doc.getElementsByTagNameNS(NS.office, 'text')[0];
    if (!body) throw new Error('This is not an OpenDocument text file (.odt).');
    var html = (await kids(body, {})).replace(/<\/(strong|em|u|s)><\1>/g, '');
    var titleEl = null;
    var metaFile = zip.file('meta.xml');
    if (metaFile) {
      var md = xml(await metaFile.async('string'));
      titleEl = md.getElementsByTagName('dc:title')[0];
    }
    return { html: html, title: titleEl && titleEl.textContent || '' };
  }

  /* ═════════════════════════ HTML → ODT ═════════════════════════ */

  function htmlToOdt(html) {
    var JSZip = needZip();
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,head,noscript,template').forEach(function (e) { e.remove(); });
    var auto = {}, autoXml = '', nAuto = 0;
    function spanStyle(f) {
      var key = (f.b ? 'b' : '') + (f.i ? 'i' : '') + (f.u ? 'u' : '') + (f.s ? 's' : '') + (f.code ? 'c' : '');
      if (!key) return '';
      if (!auto[key]) {
        var name = 'T' + (++nAuto); auto[key] = name;
        autoXml += '<style:style style:name="' + name + '" style:family="text"><style:text-properties' +
          (f.b ? ' fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"' : '') +
          (f.i ? ' fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"' : '') +
          (f.u ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '') +
          (f.s ? ' style:text-line-through-style="solid"' : '') +
          (f.code ? ' style:font-name="Liberation Mono"' : '') + '/></style:style>';
      }
      return auto[key];
    }
    function inline(node, f) {
      if (node.nodeType === 3) {
        var t = node.nodeValue.replace(/\s+/g, ' ');
        var s = esc(t);
        var st = spanStyle(f);
        return st && t.trim() ? '<text:span text:style-name="' + st + '">' + s + '</text:span>' : s;
      }
      if (node.nodeType !== 1) return '';
      var tag = node.tagName.toLowerCase(), g = Object.assign({}, f), out = '';
      if (tag === 'br') return '<text:line-break/>';
      if (tag === 'b' || tag === 'strong') g.b = true;
      if (tag === 'i' || tag === 'em' || tag === 'cite') g.i = true;
      if (tag === 'u' || tag === 'ins') g.u = true;
      if (tag === 's' || tag === 'del' || tag === 'strike') g.s = true;
      if (tag === 'code' || tag === 'kbd' || tag === 'tt') g.code = true;
      if (tag === 'img') { var alt = node.getAttribute('alt'); return alt ? esc('[' + alt + ']') : ''; }
      node.childNodes.forEach(function (c) { out += inline(c, g); });
      if (tag === 'a') {
        var href = node.getAttribute('href') || '';
        if (/^(https?:|mailto:)/i.test(href) && out) return '<text:a xlink:type="simple" xlink:href="' + esc(href) + '">' + out + '</text:a>';
      }
      return out;
    }
    var body = '';
    function block(node, listDepth) {
      if (node.nodeType === 3) {
        var t = node.nodeValue.replace(/\s+/g, ' ').trim();
        if (t) body += '<text:p text:style-name="Text_20_body">' + esc(t) + '</text:p>';
        return;
      }
      if (node.nodeType !== 1) return;
      var tag = node.tagName.toLowerCase();
      var m = /^h([1-6])$/.exec(tag);
      if (m) {
        body += '<text:h text:style-name="Heading_20_' + m[1] + '" text:outline-level="' + m[1] + '">' + inline(node, {}) + '</text:h>';
      } else if (tag === 'p' || tag === 'figcaption') {
        body += '<text:p text:style-name="Text_20_body">' + inline(node, {}) + '</text:p>';
      } else if (tag === 'pre') {
        node.textContent.replace(/\n$/, '').split('\n').forEach(function (l) {
          body += '<text:p text:style-name="Preformatted_20_Text">' + esc(l).replace(/ {2,}/g, function (s) { return '<text:s text:c="' + s.length + '"/>'; }) + '</text:p>';
        });
      } else if (tag === 'blockquote') {
        node.childNodes.forEach(function (c) {
          if (c.nodeType === 1 && /^(p|div)$/i.test(c.tagName)) body += '<text:p text:style-name="Quotations">' + inline(c, {}) + '</text:p>';
          else block(c, listDepth);
        });
      } else if (tag === 'ul' || tag === 'ol') {
        body += listXml(node, tag === 'ol' ? 'LNum' : 'LBul');
      } else if (tag === 'hr') {
        body += '<text:p text:style-name="Horizontal_20_Line"/>';
      } else if (tag === 'table') {
        body += tableXml(node);
      } else if (/^(div|section|article|main|aside|header|footer|nav|figure|details|body|html|form|fieldset|center|address)$/.test(tag)) {
        if (node.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,table,pre,blockquote,div,section,li,hr')) node.childNodes.forEach(function (c) { block(c, listDepth); });
        else if (node.textContent.trim()) body += '<text:p text:style-name="Text_20_body">' + inline(node, {}) + '</text:p>';
      } else {
        var s = inline(node, {});
        if (s.trim()) body += '<text:p text:style-name="Text_20_body">' + s + '</text:p>';
      }
    }
    function listXml(node, style) {
      var out = '<text:list text:style-name="' + style + '">';
      node.childNodes.forEach(function (li) {
        if (li.nodeType !== 1 || li.tagName.toLowerCase() !== 'li') return;
        var txt = '', nested = '';
        li.childNodes.forEach(function (c) {
          if (c.nodeType === 1 && /^(ul|ol)$/i.test(c.tagName)) nested += listXml(c, c.tagName.toLowerCase() === 'ol' ? 'LNum' : 'LBul');
          else if (c.nodeType === 1 && /^(p|div)$/i.test(c.tagName)) txt += inline(c, {}) + ' ';
          else txt += inline(c, {});
        });
        out += '<text:list-item><text:p text:style-name="Text_20_body">' + txt.trim() + '</text:p>' + nested + '</text:list-item>';
      });
      return out + '</text:list>';
    }
    var nTable = 0;
    function tableXml(node) {
      var rows = Array.prototype.slice.call(node.querySelectorAll('tr'));
      if (!rows.length) return '';
      var cols = Math.max.apply(null, rows.map(function (r) { return r.children.length; }));
      var name = 'Table' + (++nTable);
      var out = '<table:table table:name="' + name + '" table:style-name="TblStyle"><table:table-column table:number-columns-repeated="' + cols + '"/>';
      rows.forEach(function (r) {
        out += '<table:table-row>';
        Array.prototype.forEach.call(r.children, function (c) {
          if (!/^(td|th)$/i.test(c.tagName)) return;
          var f = c.tagName.toLowerCase() === 'th' ? { b: true } : {};
          out += '<table:table-cell office:value-type="string"><text:p text:style-name="Text_20_body">' + inline(c, f).trim() + '</text:p></table:table-cell>';
        });
        out += '</table:table-row>';
      });
      return out + '</table:table>';
    }
    block(doc.body, 0);

    var nsDecl = 'xmlns:office="' + NS.office + '" xmlns:style="' + NS.style + '" xmlns:text="' + NS.text + '" xmlns:table="' + NS.table +
      '" xmlns:fo="' + NS.fo + '" xmlns:xlink="' + NS.xlink + '" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
    var content = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ' + nsDecl + ' office:version="1.2">' +
      '<office:font-face-decls><style:font-face style:name="Liberation Mono" svg:font-family="\'Liberation Mono\'" style:font-family-generic="modern"/></office:font-face-decls>' +
      '<office:automatic-styles>' + autoXml +
      '<style:style style:name="TblStyle" style:family="table"><style:table-properties style:width="17cm" table:align="margins"/></style:style>' +
      '</office:automatic-styles><office:body><office:text>' + body + '</office:text></office:body></office:document-content>';

    var hs = [null, 20, 16, 14, 12, 11, 11];
    var styleXml = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ' + nsDecl + ' office:version="1.2">' +
      '<office:font-face-decls><style:font-face style:name="Liberation Mono" svg:font-family="\'Liberation Mono\'" style:font-family-generic="modern"/></office:font-face-decls>' +
      '<office:styles>' +
      '<style:default-style style:family="paragraph"><style:text-properties style:font-name="Calibri" fo:font-size="11pt"/></style:default-style>' +
      '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>' +
      '<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.25cm"/></style:style>' +
      '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/><style:text-properties fo:font-weight="bold"/></style:style>' +
      [1, 2, 3, 4, 5, 6].map(function (n) {
        return '<style:style style:name="Heading_20_' + n + '" style:display-name="Heading ' + n + '" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="' + n + '"><style:text-properties fo:font-size="' + hs[n] + 'pt"/></style:style>';
      }).join('') +
      '<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm"/><style:text-properties style:font-name="Liberation Mono" fo:font-size="10pt"/></style:style>' +
      '<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm" fo:margin-bottom="0.25cm"/><style:text-properties fo:font-style="italic"/></style:style>' +
      '<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:border-bottom="0.5pt solid #999999" fo:padding="0cm" fo:margin-bottom="0.3cm"/></style:style>' +
      '<text:list-style style:name="LBul"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="1cm" fo:text-indent="-0.5cm" fo:margin-left="1cm"/></style:list-level-properties></text:list-level-style-bullet></text:list-style>' +
      '<text:list-style style:name="LNum"><text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="1cm" fo:text-indent="-0.6cm" fo:margin-left="1cm"/></style:list-level-properties></text:list-level-style-number></text:list-style>' +
      '</office:styles></office:document-styles>';

    var manifest = '<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">' +
      '<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>' +
      '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
      '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>' +
      '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>';
    var meta = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta xmlns:office="' + NS.office + '" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2"><office:meta><meta:generator>AintoB.com</meta:generator></office:meta></office:document-meta>';

    var zip = new JSZip();
    // The mimetype entry must be first and stored uncompressed (ODF requirement)
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE', createFolders: false });
    zip.file('META-INF/manifest.xml', manifest, { createFolders: false });
    zip.file('content.xml', content, { createFolders: false });
    zip.file('styles.xml', styleXml, { createFolders: false });
    zip.file('meta.xml', meta, { createFolders: false });
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text', compression: 'DEFLATE' });
  }

  /* ═════════════════════════ EPUB → HTML ═════════════════════════ */

  function resolvePath(base, rel) {
    var parts = (base.replace(/[^/]*$/, '') + rel.split('#')[0].split('?')[0]).split('/'), out = [];
    parts.forEach(function (p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
    return decodeURIComponent(out.join('/'));
  }

  async function epubToHtml(file) {
    var zip = await needZip().loadAsync(await file.arrayBuffer());
    var cont = zip.file('META-INF/container.xml');
    if (!cont) throw new Error('This is not a valid EPUB file.');
    var rootPath = xml(await cont.async('string')).querySelector('rootfile').getAttribute('full-path');
    var opf = xml(await zip.file(rootPath).async('string'));
    var manifest = {};
    Array.prototype.forEach.call(opf.getElementsByTagName('item'), function (it) {
      manifest[it.getAttribute('id')] = { href: it.getAttribute('href'), type: it.getAttribute('media-type') || '' };
    });
    var spine = Array.prototype.map.call(opf.getElementsByTagName('itemref'), function (r) { return manifest[r.getAttribute('idref')]; }).filter(Boolean);
    if (!spine.length) throw new Error('This EPUB has no readable chapters.');
    var titleEl = opf.getElementsByTagName('dc:title')[0];
    var imgCache = {};
    var out = [];
    for (var i = 0; i < spine.length; i++) {
      var item = spine[i];
      if (!/x?html/i.test(item.type)) continue;
      var f = zip.file(resolvePath(rootPath, item.href));
      if (!f) continue;
      var d = new DOMParser().parseFromString(await f.async('string'), 'application/xhtml+xml');
      if (d.querySelector('parsererror')) d = new DOMParser().parseFromString(await f.async('string'), 'text/html');
      var body = d.getElementsByTagName('body')[0];
      if (!body) continue;
      body.querySelectorAll('script,style,link,svg,nav[epub\\:type="toc"]').forEach(function (e) { e.remove(); });
      var imgs = Array.prototype.slice.call(body.getElementsByTagName('img'));
      for (var k = 0; k < imgs.length; k++) {
        var src = imgs[k].getAttribute('src') || '';
        var p = resolvePath(resolvePath(rootPath, item.href), src);
        if (imgCache[p] === undefined) {
          var imf = zip.file(p), mt = mimeOf(p);
          imgCache[p] = imf && mt ? 'data:' + mt + ';base64,' + (await imf.async('base64')) : '';
        }
        if (imgCache[p]) imgs[k].setAttribute('src', imgCache[p]); else imgs[k].remove();
      }
      // strip attributes that would leak styling/ids from the book
      body.querySelectorAll('*').forEach(function (el) {
        Array.prototype.slice.call(el.attributes).forEach(function (a) {
          if (!/^(href|src|alt|colspan|rowspan)$/i.test(a.name)) el.removeAttribute(a.name);
        });
        if (el.tagName === 'A' && !/^(https?:|mailto:)/i.test(el.getAttribute('href') || '')) el.removeAttribute('href');
      });
      var html = body.innerHTML.replace(/ xmlns="[^"]*"/g, '').trim();
      if (html) out.push(html);
    }
    if (!out.length) throw new Error('This EPUB has no readable chapters.');
    return { html: out.join('\n<hr>\n'), title: titleEl ? titleEl.textContent.trim() : '' };
  }

  /* ═════════════════════════ HTML → text, outputs ═════════════════════════ */

  function htmlToText(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var out = '';
    function walk(n) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      if (tag === 'br') { out += '\n'; return; }
      if (tag === 'img') return;
      var block = /^(p|div|h[1-6]|li|tr|table|ul|ol|blockquote|pre|hr|section|article)$/.test(tag);
      if (block) out = out.replace(/[ \t]+$/, '') + (out.endsWith('\n') || !out ? '' : '\n');
      if (tag === 'li') out += '• ';
      if (tag === 'hr') out += '* * *';
      if (tag === 'pre') out += n.textContent; else n.childNodes.forEach(walk);
      if (tag === 'td' || tag === 'th') out += '\t';
      if (block) out = out.replace(/[ \t]+$/, '') + (/^h[1-6]|^p$|^ul$|^ol$|^table$|^blockquote$|^pre$|^hr$/.test(tag) ? '\n\n' : '\n');
    }
    walk(doc.body);
    return out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim() + '\n';
  }

  var HTML_CSS = 'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.65;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#171b24}img{max-width:100%;height:auto}' +
    'table{border-collapse:collapse}td,th{border:1px solid #c9ced6;padding:.35rem .6rem;vertical-align:top}';
  function fullHtml(body, title) {
    return '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title || 'Document') +
      '</title><style>' + HTML_CSS + '</style></head>\n<body>\n' + body + '\n</body></html>\n';
  }
  function toMarkdown(html) {
    if (!window.TurndownService) throw new Error('Markdown library not loaded. Reload the page and try again.');
    return new window.TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' }).turndown(html) + '\n';
  }
  function toDocx(html, title) {
    if (!window.htmlDocx) throw new Error('Word library not loaded. Reload the page and try again.');
    return window.htmlDocx.asBlob(fullHtml(html, title), { orientation: 'portrait', margins: { top: 1134, bottom: 1134, left: 1134, right: 1134 } });
  }
  var PRINT_CSS = '@page{margin:2.2cm;size:A4}body{font-family:Georgia,"Times New Roman",serif;font-size:11pt;line-height:1.55;color:#000;margin:0}' +
    'h1,h2,h3,h4{font-family:Calibri,"Segoe UI",Arial,sans-serif;page-break-after:avoid}h1{font-size:20pt}h2{font-size:15pt}h3{font-size:12.5pt}p{margin:0 0 8pt}' +
    'img{max-width:100%;height:auto;page-break-inside:avoid}table{border-collapse:collapse;width:100%;margin-bottom:10pt}td,th{border:1px solid #999;padding:4px 7px;vertical-align:top}' +
    'hr{border:0;border-top:1px solid #bbb;margin:18pt 0}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  function printWindow(body, title) {
    var w = window.open('', '_blank', 'width=920,height=700,menubar=no,toolbar=no');
    if (!w) throw new Error('Popup blocked. Please allow pop-ups for this site in your browser settings, then click "Open Print Dialog" again.');
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(title) + '</title><style>' + PRINT_CSS + '</style></head><body>' + body + '</body></html>');
    w.document.close();
    var go = function () { w.focus(); w.print(); };
    if (w.document.readyState === 'complete') setTimeout(go, 500); else w.addEventListener('load', function () { setTimeout(go, 500); });
    return { printMode: true, printFn: go };
  }

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

    if (TO === 'odt') {
      var html;
      if (FROM === 'txt') {
        var txt = isText ? input : await input.text();
        html = txt.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
      } else if (FROM === 'html') {
        html = isText ? input : await input.text();
      } else if (FROM === 'markdown') {
        if (!window.markdownit) throw new Error('Markdown library not loaded. Reload the page and try again.');
        html = window.markdownit({ html: false, linkify: true, typographer: true }).render(isText ? input : await input.text());
      } else if (FROM === 'word') {
        if (!window.mammoth) throw new Error('Word library not loaded. Reload the page and try again.');
        html = (await window.mammoth.convertToHtml({ arrayBuffer: await input.arrayBuffer() })).value;
      }
      return { blob: await htmlToOdt(html), filename: name + '.odt' };
    }

    var res = FROM === 'odt' ? await odtToHtml(input) : await epubToHtml(input);
    if (!res.html.replace(/<[^>]+>|&nbsp;|\s/g, '')) throw new Error('No text was found in this document.');
    if (TO === 'html') return { blob: blob(fullHtml(res.html, res.title || name), 'text/html'), filename: name + '.html' };
    if (TO === 'txt') return { blob: blob(htmlToText(res.html), 'text/plain'), filename: name + '.txt' };
    if (TO === 'markdown') return { blob: blob(toMarkdown(res.html), 'text/markdown'), filename: name + '.md' };
    if (TO === 'word') return { blob: toDocx(res.html, res.title || name), filename: name + '.docx' };
    if (TO === 'pdf') return printWindow((res.title && FROM === 'epub' ? '<h1>' + esc(res.title) + '</h1>' : '') + res.html, res.title || name);
    throw new Error('Converter not available for this format yet.');
  };

  window.__zipDoc = { htmlToOdt: htmlToOdt, odtToHtml: odtToHtml, epubToHtml: epubToHtml, htmlToText: htmlToText };
})();
