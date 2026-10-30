/**
 * Jupyter Notebook (.ipynb) → Markdown / HTML / PDF.
 *
 * Markdown cells are kept, code cells become fenced code blocks, and saved outputs (text, tables, images) follow
 * their cell. Nothing is executed. HTML/PDF render Markdown with markdown-it (loaded by the page).
 */
(function () {
  'use strict';

  var slug = (location.pathname.match(/\/([a-z0-9]+-to-[a-z0-9]+)\/?$/) || [])[1] || '';
  var TO = slug.split('-to-')[1];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function src(v) { return Array.isArray(v) ? v.join('') : (v || ''); }
  function stripAnsi(s) { return String(s).replace(/\u001b\[[0-9;]*[A-Za-z]/g, ''); }

  function parse(text) {
    var nb;
    try { nb = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    var cells = nb.cells || (nb.worksheets && nb.worksheets[0] && nb.worksheets[0].cells);
    if (!Array.isArray(cells)) throw new Error('This is not a Jupyter notebook (no cells found).');
    var lang = (nb.metadata && ((nb.metadata.language_info && nb.metadata.language_info.name) || (nb.metadata.kernelspec && nb.metadata.kernelspec.language))) || 'python';
    return { cells: cells, lang: lang };
  }

  // each cell → [{kind:'md'|'code'|'out'|'html'|'img', text}]
  function cellParts(c, lang) {
    var parts = [];
    if (c.cell_type === 'markdown') parts.push({ kind: 'md', text: src(c.source || c.input) });
    else if (c.cell_type === 'raw') parts.push({ kind: 'out', text: src(c.source) });
    else if (c.cell_type === 'code') {
      var code = src(c.source || c.input);
      if (code.trim()) parts.push({ kind: 'code', text: code, lang: lang });
      (c.outputs || []).forEach(function (o) {
        if (o.output_type === 'stream') parts.push({ kind: 'out', text: src(o.text) });
        else if (o.output_type === 'error') parts.push({ kind: 'out', text: stripAnsi((o.traceback || []).join('\n') || (o.ename + ': ' + o.evalue)) });
        else {
          var d = o.data || {};
          if (d['image/png']) parts.push({ kind: 'img', text: 'data:image/png;base64,' + src(d['image/png']).replace(/\s/g, '') });
          else if (d['image/jpeg']) parts.push({ kind: 'img', text: 'data:image/jpeg;base64,' + src(d['image/jpeg']).replace(/\s/g, '') });
          else if (d['text/html']) parts.push({ kind: 'html', text: src(d['text/html']) });
          else if (d['text/plain']) parts.push({ kind: 'out', text: src(d['text/plain']) });
        }
      });
    }
    return parts;
  }

  function toMarkdown(nb) {
    var out = [];
    nb.cells.forEach(function (c) {
      cellParts(c, nb.lang).forEach(function (p) {
        if (p.kind === 'md') out.push(p.text.trim());
        else if (p.kind === 'code') out.push('```' + nb.lang + '\n' + p.text.replace(/\n$/, '') + '\n```');
        else if (p.kind === 'out') out.push('```text\n' + stripAnsi(p.text).replace(/\n$/, '') + '\n```');
        else if (p.kind === 'img') out.push('![output](' + p.text + ')');
        else if (p.kind === 'html') out.push('<!-- HTML output -->\n' + p.text.trim());
      });
    });
    return out.join('\n\n') + '\n';
  }

  function toHtmlBody(nb) {
    if (!window.markdownit) throw new Error('Markdown library not loaded. Reload the page and try again.');
    var md = window.markdownit({ html: false, linkify: true, typographer: false });
    var out = [];
    nb.cells.forEach(function (c) {
      cellParts(c, nb.lang).forEach(function (p) {
        if (p.kind === 'md') out.push('<div class="md">' + md.render(p.text) + '</div>');
        else if (p.kind === 'code') out.push('<pre class="code"><code>' + esc(p.text.replace(/\n$/, '')) + '</code></pre>');
        else if (p.kind === 'out') out.push('<pre class="out">' + esc(stripAnsi(p.text).replace(/\n$/, '')) + '</pre>');
        else if (p.kind === 'img') out.push('<p><img src="' + p.text + '" alt="output"></p>');
        else if (p.kind === 'html') {
          // saved HTML output (e.g. pandas tables): keep tables, drop scripts/styles/handlers
          var d = new DOMParser().parseFromString(p.text, 'text/html');
          d.querySelectorAll('script,style,iframe,object,embed,link').forEach(function (e) { e.remove(); });
          d.querySelectorAll('*').forEach(function (e) { Array.prototype.slice.call(e.attributes).forEach(function (a) { if (/^on|^style$/i.test(a.name)) e.removeAttribute(a.name); }); });
          out.push('<div class="html-out">' + d.body.innerHTML + '</div>');
        }
      });
    });
    return out.join('\n');
  }

  var CSS = 'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.6;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#171b24}' +
    'pre{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.85rem;padding:.7rem .9rem;border-radius:8px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0 0 .8rem}' +
    'pre.code{background:#f1f3f6;border:1px solid #e4e7ec}pre.out{background:#fff;border-left:3px solid #d0d5dd;border-radius:0}img{max-width:100%;height:auto}' +
    'table{border-collapse:collapse;font-size:.85rem;margin-bottom:1rem}td,th{border:1px solid #d0d5dd;padding:.25rem .5rem}';

  document.addEventListener('DOMContentLoaded', function () {
    if (TO !== 'pdf') return;
    var btn = document.getElementById('convertBtn'), dl = document.getElementById('downloadBtn');
    if (btn) btn.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>' + (window.__t ? window.__t('Open Print Dialog') : 'Open Print Dialog');
    if (dl) dl.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>' + (window.__t ? window.__t('Print / Save as PDF Again') : 'Print / Save as PDF Again');
  });

  window.performConversion = async function (input) {
    var text = typeof input === 'string' ? input : await input.text();
    if (!text.trim()) throw new Error('The input is empty.');
    var name = (input && input.name ? input.name.replace(/\.[^.]+$/, '') : '') || 'notebook';
    var nb = parse(text);
    if (TO === 'markdown') return { blob: new Blob([toMarkdown(nb)], { type: 'text/markdown;charset=utf-8' }), filename: name + '.md' };
    var body = toHtmlBody(nb);
    if (TO === 'html') {
      return { blob: new Blob(['<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(name) + '</title><style>' + CSS + '</style></head>\n<body>\n' + body + '\n</body></html>\n'], { type: 'text/html;charset=utf-8' }), filename: name + '.html' };
    }
    if (TO === 'pdf') {
      var w = window.open('', '_blank', 'width=920,height=700,menubar=no,toolbar=no');
      if (!w) throw new Error('Popup blocked. Please allow pop-ups for this site in your browser settings, then click "Open Print Dialog" again.');
      w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(name) + '</title><style>@page{margin:1.8cm}' + CSS + '@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;max-width:none}}</style></head><body>' + body + '</body></html>');
      w.document.close();
      var go = function () { w.focus(); w.print(); };
      if (w.document.readyState === 'complete') setTimeout(go, 500); else w.addEventListener('load', function () { setTimeout(go, 500); });
      return { printMode: true, printFn: go };
    }
    throw new Error('Converter not available for this format yet.');
  };

  window.__ipynb = { parse: parse, toMarkdown: toMarkdown };
})();
