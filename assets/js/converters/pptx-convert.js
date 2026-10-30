/**
 * PowerPoint (.pptx) → TXT / HTML / Markdown / PDF.
 *
 * A .pptx is a ZIP of XML files. This reads the slides in presentation order and keeps titles, bullet text
 * (with nesting) and tables, plus embedded pictures for HTML/Markdown/PDF. Layout, shapes, animations, charts and
 * speaker notes are not reproduced. Pair read from the page URL; JSZip (and turndown for Markdown) loaded by the page.
 */
(function () {
  'use strict';

  var slug = (location.pathname.match(/\/([a-z0-9]+-to-[a-z0-9]+)\/?$/) || [])[1] || '';
  var TO = slug.split('-to-')[1];

  var A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  var P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function xml(text) {
    var d = new DOMParser().parseFromString(text, 'application/xml');
    if (d.querySelector('parsererror')) throw new Error('This file is damaged or not a valid document.');
    return d;
  }
  function kids(node, ns, name) {
    return Array.prototype.filter.call(node.childNodes, function (c) { return c.nodeType === 1 && c.namespaceURI === ns && c.localName === name; });
  }
  function all(node, ns, name) { return Array.prototype.slice.call(node.getElementsByTagNameNS(ns, name)); }

  function paraHtml(p) {
    var out = '';
    Array.prototype.forEach.call(p.childNodes, function (c) {
      if (c.nodeType !== 1 || c.namespaceURI !== A) return;
      if (c.localName === 'br') { out += '<br>'; return; }
      if (c.localName !== 'r' && c.localName !== 'fld') return;
      var t = all(c, A, 't').map(function (x) { return x.textContent; }).join('');
      if (!t) return;
      var rPr = kids(c, A, 'rPr')[0], h = esc(t);
      if (rPr) {
        if (rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none') h = '<u>' + h + '</u>';
        if (rPr.getAttribute('i') === '1') h = '<em>' + h + '</em>';
        if (rPr.getAttribute('b') === '1') h = '<strong>' + h + '</strong>';
        var link = kids(rPr, A, 'hlinkClick')[0];
        if (link && link.getAttributeNS(R, 'id')) h = { link: link.getAttributeNS(R, 'id'), html: h };
      }
      out += typeof h === 'string' ? h : '\u0001' + h.link + '\u0002' + h.html + '\u0003';
    });
    return out;
  }

  function listHtml(items) {
    var out = '', depth = -1;
    items.forEach(function (it) {
      var lvl = Math.min(it.lvl, depth + 1);
      if (depth === -1) { out += '<ul>'; depth = 0; }
      else if (lvl > depth) { out += '<ul>'; depth = lvl; }
      else { while (depth > lvl) { out += '</li></ul>'; depth--; } out += '</li>'; }
      out += '<li>' + it.html;
    });
    out += '</li>';
    while (depth > 0) { out += '</ul></li>'; depth--; }
    return out + '</ul>';
  }

  async function pptxToHtml(file) {
    if (!window.JSZip) throw new Error('ZIP library not loaded. Reload the page and try again.');
    var zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    var pres = zip.file('ppt/presentation.xml');
    if (!pres) throw new Error('This is not a PowerPoint (.pptx) file.');
    var rels = {};
    xml(await zip.file('ppt/_rels/presentation.xml.rels').async('string')).documentElement.childNodes.forEach(function (r) {
      if (r.nodeType === 1) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    });
    var order = all(xml(await pres.async('string')), P, 'sldId').map(function (s) { return rels[s.getAttributeNS(R, 'id')]; }).filter(Boolean);
    if (!order.length) throw new Error('This presentation has no slides.');

    var html = [], slideNo = 0;
    for (var i = 0; i < order.length; i++) {
      var path = 'ppt/' + order[i].replace(/^\/?(ppt\/)?/, '');
      var f = zip.file(path);
      if (!f) continue;
      var doc = xml(await f.async('string'));
      var relFile = zip.file(path.replace(/slides\/([^/]+)$/, 'slides/_rels/$1.rels'));
      var srels = {};
      if (relFile) Array.prototype.forEach.call(xml(await relFile.async('string')).documentElement.childNodes, function (r) {
        if (r.nodeType === 1) srels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), mode: r.getAttribute('TargetMode') };
      });
      slideNo++;
      var title = '', body = '';
      var tree = all(doc, P, 'spTree')[0];
      var shapes = tree ? Array.prototype.slice.call(tree.childNodes) : [];
      for (var s = 0; s < shapes.length; s++) {
        var sh = shapes[s];
        if (sh.nodeType !== 1) continue;
        if (sh.localName === 'sp') {
          var ph = all(sh, P, 'ph')[0];
          var type = ph && ph.getAttribute('type');
          var paras = all(sh, A, 'p');
          var items = paras.map(function (p) {
            var lvl = parseInt((kids(p, A, 'pPr')[0] || { getAttribute: function () { return '0'; } }).getAttribute('lvl') || '0', 10);
            var bullet = !kids(p, A, 'pPr')[0] || !kids(kids(p, A, 'pPr')[0], A, 'buNone').length;
            return { html: paraHtml(p), lvl: lvl, bullet: bullet };
          }).filter(function (x) { return x.html.replace(/<[^>]+>|\u0001[^\u0002]*\u0002|\u0003/g, '').trim(); });
          if (!items.length) continue;
          if (type === 'title' || type === 'ctrTitle') { title = items.map(function (x) { return x.html; }).join(' '); continue; }
          if (type === 'subTitle' || (items.length === 1 && !items[0].lvl && !type)) { body += items.map(function (x) { return '<p>' + x.html + '</p>'; }).join(''); continue; }
          body += listHtml(items);
        } else if (sh.localName === 'graphicFrame') {
          var rows = all(sh, A, 'tr');
          if (rows.length) body += '<table>' + rows.map(function (tr) {
            return '<tr>' + kids(tr, A, 'tc').map(function (tc) { return '<td>' + all(tc, A, 'p').map(paraHtml).filter(Boolean).join('<br>') + '</td>'; }).join('') + '</tr>';
          }).join('') + '</table>';
        } else if (sh.localName === 'pic') {
          var blip = all(sh, A, 'blip')[0], rid = blip && blip.getAttributeNS(R, 'embed'), tgt = rid && srels[rid];
          if (tgt) {
            var ip = ('ppt/slides/' + tgt.target).split('/'), norm = [];
            ip.forEach(function (x) { if (x === '..') norm.pop(); else if (x !== '.') norm.push(x); });
            var imf = zip.file(norm.join('/')), ext = (norm[norm.length - 1].match(/\.([a-z0-9]+)$/i) || [])[1];
            var mt = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' }[(ext || '').toLowerCase()];
            if (imf && mt) body += '<p><img src="data:' + mt + ';base64,' + (await imf.async('base64')) + '" alt=""></p>';
          }
        }
      }
      // resolve hyperlink placeholders
      body = body.replace(/\u0001([^\u0002]*)\u0002([\s\S]*?)\u0003/g, function (m, id, inner) {
        var r = srels[id];
        return r && /^https?:/i.test(r.target) ? '<a href="' + esc(r.target) + '">' + inner + '</a>' : inner;
      });
      title = title.replace(/\u0001[^\u0002]*\u0002([\s\S]*?)\u0003/g, '$1');
      html.push('<section class="slide"><h2>' + (title || (slideNo)) + '</h2>' + body + '</section>');
    }
    if (!html.length) throw new Error('This presentation has no slides.');
    return html.join('\n');
  }

  function htmlToText(h) {
    var doc = new DOMParser().parseFromString(h, 'text/html'), out = [];
    doc.querySelectorAll('section.slide').forEach(function (sec, i) {
      var lines = ['--- Slide ' + (i + 1) + ' ---'];
      sec.childNodes.forEach(function (n) {
        if (n.tagName === 'H2') lines.push(n.textContent.trim().toUpperCase());
        else if (n.tagName === 'UL') n.querySelectorAll('li').forEach(function (li) {
          var depth = 0, p = li.parentElement; while (p && p !== sec) { if (p.tagName === 'UL') depth++; p = p.parentElement; }
          var own = Array.prototype.filter.call(li.childNodes, function (c) { return c.tagName !== 'UL'; }).map(function (c) { return c.textContent; }).join('').trim();
          if (own) lines.push(new Array(depth).join('  ') + '• ' + own);
        });
        else if (n.tagName === 'TABLE') n.querySelectorAll('tr').forEach(function (tr) { lines.push(Array.prototype.map.call(tr.children, function (c) { return c.textContent.trim(); }).join('\t')); });
        else if (n.textContent.trim()) lines.push(n.textContent.trim());
      });
      out.push(lines.join('\n'));
    });
    return out.join('\n\n') + '\n';
  }

  var CSS = 'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.55;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#171b24}' +
    'section.slide{border:1px solid #d0d5dd;border-radius:12px;padding:1.2rem 1.5rem;margin:0 0 1.5rem;page-break-inside:avoid}section.slide h2{margin-top:0;font-size:1.4rem}' +
    'img{max-width:100%;height:auto}table{border-collapse:collapse}td{border:1px solid #c9ced6;padding:.3rem .6rem}';

  document.addEventListener('DOMContentLoaded', function () {
    if (TO !== 'pdf') return;
    var btn = document.getElementById('convertBtn'), dl = document.getElementById('downloadBtn');
    if (btn) btn.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>' + (window.__t ? window.__t('Open Print Dialog') : 'Open Print Dialog');
    if (dl) dl.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>' + (window.__t ? window.__t('Print / Save as PDF Again') : 'Print / Save as PDF Again');
  });

  window.performConversion = async function (input) {
    var name = (input.name || '').replace(/\.[^.]+$/, '') || 'converted';
    var body = await pptxToHtml(input);
    if (TO === 'txt') return { blob: new Blob([htmlToText(body)], { type: 'text/plain;charset=utf-8' }), filename: name + '.txt' };
    if (TO === 'html') return { blob: new Blob(['<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(name) + '</title><style>' + CSS + '</style></head>\n<body>\n' + body + '\n</body></html>\n'], { type: 'text/html;charset=utf-8' }), filename: name + '.html' };
    if (TO === 'markdown') {
      if (!window.TurndownService) throw new Error('Markdown library not loaded. Reload the page and try again.');
      var td = new window.TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
      var md = body.split('\n').map(function (s) { return td.turndown(s.replace(/^<section class="slide">/, '').replace(/<\/section>$/, '')); }).join('\n\n---\n\n');
      return { blob: new Blob([md + '\n'], { type: 'text/markdown;charset=utf-8' }), filename: name + '.md' };
    }
    if (TO === 'pdf') {
      var w = window.open('', '_blank', 'width=920,height=700,menubar=no,toolbar=no');
      if (!w) throw new Error('Popup blocked. Please allow pop-ups for this site in your browser settings, then click "Open Print Dialog" again.');
      w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(name) + '</title><style>@page{margin:1.5cm}' + CSS + '@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0}}</style></head><body>' + body + '</body></html>');
      w.document.close();
      var go = function () { w.focus(); w.print(); };
      if (w.document.readyState === 'complete') setTimeout(go, 500); else w.addEventListener('load', function () { setTimeout(go, 500); });
      return { printMode: true, printFn: go };
    }
    throw new Error('Converter not available for this format yet.');
  };

  window.__pptx = { pptxToHtml: pptxToHtml, htmlToText: htmlToText };
})();
