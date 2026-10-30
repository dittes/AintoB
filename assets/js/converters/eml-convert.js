/**
 * E-mail (.eml) → TXT / HTML / PDF.
 *
 * Parses the RFC 5322 / MIME structure locally: headers (incl. encoded words), multipart bodies,
 * quoted-printable / base64 transfer encodings and charsets. Inline images (cid:) are embedded; remote images
 * are NOT loaded, so tracking pixels never fire. Attachments are listed by name but not extracted.
 */
(function () {
  'use strict';

  var slug = (location.pathname.match(/\/([a-z0-9]+-to-[a-z0-9]+)\/?$/) || [])[1] || '';
  var TO = slug.split('-to-')[1];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function bytesFromBinary(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
  function decodeCharset(bytes, cs) {
    try { return new TextDecoder((cs || 'utf-8').toLowerCase()).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }
  function qpBytes(s) {
    var out = [];
    s = s.replace(/=\r?\n/g, '');
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else out.push(s.charCodeAt(i) & 255);
    }
    return new Uint8Array(out);
  }
  function b64Bytes(s) {
    try { return bytesFromBinary(atob(s.replace(/[^A-Za-z0-9+/=]/g, ''))); } catch (e) { return new Uint8Array(0); }
  }

  // RFC 2047 "=?utf-8?B?...?=" in header values
  function decodeWords(v) {
    return v.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=(\s+(?==\?))?/g, function (m, cs, enc, data) {
      var bytes = /b/i.test(enc) ? b64Bytes(data) : qpBytes(data.replace(/_/g, ' '));
      return decodeCharset(bytes, cs);
    });
  }

  // Latin-1 string of the raw file keeps every byte intact; each part is re-decoded with its own charset
  function parseHeaders(raw) {
    var h = {}, lines = raw.replace(/\r\n?/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n');
    lines.forEach(function (l) {
      var i = l.indexOf(':');
      if (i > 0) { var k = l.slice(0, i).trim().toLowerCase(); if (!(k in h)) h[k] = l.slice(i + 1).trim(); }
    });
    return h;
  }
  function param(v, name) {
    var m = (v || '').match(new RegExp(name + '\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))', 'i'));
    return m ? (m[1] !== undefined ? m[1] : m[2]) : '';
  }

  function parsePart(raw) {
    var split = raw.search(/\r?\n\r?\n/);
    var headRaw = split < 0 ? raw : raw.slice(0, split);
    var body = split < 0 ? '' : raw.slice(split).replace(/^\r?\n\r?\n/, '');
    var h = parseHeaders(headRaw);
    var type = ((h['content-type'] || 'text/plain').split(';')[0] || '').trim().toLowerCase();
    var part = { headers: h, type: type, ctype: h['content-type'] || '', parts: [] };
    if (/^multipart\//.test(type)) {
      var b = param(h['content-type'], 'boundary');
      if (b) {
        var segs = body.split('--' + b);
        segs.slice(1).forEach(function (seg) {
          if (/^--/.test(seg)) return;
          part.parts.push(parsePart(seg.replace(/^\r?\n/, '')));
        });
      }
    } else if (type === 'message/rfc822') {
      part.parts.push(parsePart(body));
    } else {
      var enc = (h['content-transfer-encoding'] || '7bit').trim().toLowerCase();
      part.bytes = enc === 'base64' ? b64Bytes(body) : enc === 'quoted-printable' ? qpBytes(body) : bytesFromBinary(body);
      part.charset = param(h['content-type'], 'charset') || 'utf-8';
    }
    return part;
  }

  function walk(part, acc) {
    if (part.parts.length) { part.parts.forEach(function (p) { walk(p, acc); }); return acc; }
    var disp = (part.headers['content-disposition'] || '').toLowerCase();
    var name = decodeWords(param(part.headers['content-disposition'], 'filename') || param(part.ctype, 'name'));
    var cid = (part.headers['content-id'] || '').replace(/[<>]/g, '');
    if (/^text\/plain$/.test(part.type) && !/attachment/.test(disp) && !name) acc.text.push(decodeCharset(part.bytes, part.charset));
    else if (/^text\/html$/.test(part.type) && !/attachment/.test(disp) && !name) acc.html.push(decodeCharset(part.bytes, part.charset));
    else if (/^image\//.test(part.type) && cid) acc.cids[cid] = { type: part.type, bytes: part.bytes };
    else if (name || /attachment/.test(disp)) acc.attachments.push(name || part.type);
    return acc;
  }

  function toB64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }

  function sanitize(html, cids) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base,video,audio').forEach(function (e) { e.remove(); });
    doc.querySelectorAll('*').forEach(function (e) {
      Array.prototype.slice.call(e.attributes).forEach(function (a) {
        if (/^on/i.test(a.name) || (a.name === 'href' && /^\s*javascript:/i.test(a.value)) || a.name === 'background') e.removeAttribute(a.name);
      });
    });
    doc.querySelectorAll('img').forEach(function (img) {
      var s = img.getAttribute('src') || '', m = s.match(/^cid:(.+)$/i);
      if (m && cids[decodeURIComponent(m[1])]) { var c = cids[decodeURIComponent(m[1])]; img.setAttribute('src', 'data:' + c.type + ';base64,' + toB64(c.bytes)); }
      else if (!/^data:image\//i.test(s)) {
        var alt = img.getAttribute('alt');
        var rep = doc.createElement('span'); rep.textContent = alt ? '[' + alt + ']' : ''; img.replaceWith(rep);   // remote image: not loaded
      }
    });
    return doc.body.innerHTML;
  }

  function htmlToText(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html'), out = '';
    doc.querySelectorAll('script,style').forEach(function (e) { e.remove(); });
    (function w(n) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
      if (n.nodeType !== 1) return;
      var t = n.tagName.toLowerCase();
      if (t === 'br') { out += '\n'; return; }
      var blk = /^(p|div|h[1-6]|li|tr|table|ul|ol|blockquote|pre|hr)$/.test(t);
      if (blk && !out.endsWith('\n')) out += '\n';
      if (t === 'li') out += '• ';
      n.childNodes.forEach(w);
      if (t === 'a' && n.getAttribute('href') && /^https?:/.test(n.getAttribute('href')) && n.textContent.trim() !== n.getAttribute('href')) out += ' (' + n.getAttribute('href') + ')';
      if (t === 'td' || t === 'th') out += '\t';
      if (blk) out += /^(p|h[1-6]|ul|ol|table|blockquote)$/.test(t) ? '\n\n' : '\n';
    })(doc.body);
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function parseEml(raw) {
    var root = parsePart(raw);
    var acc = walk(root, { text: [], html: [], cids: {}, attachments: [] });
    var h = root.headers;
    if (!h.from && !h.subject && !acc.text.length && !acc.html.length) throw new Error('This does not look like an e-mail (.eml) file.');
    var meta = {
      subject: decodeWords(h.subject || ''), from: decodeWords(h.from || ''), to: decodeWords(h.to || ''), cc: decodeWords(h.cc || ''),
      date: h.date || '',
    };
    return { meta: meta, acc: acc };
  }

  var CSS = 'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.55;max-width:50rem;margin:2rem auto;padding:0 1rem;color:#171b24}' +
    '.hdr{border-bottom:1px solid #d0d5dd;margin-bottom:1.2rem;padding-bottom:.8rem}.hdr h1{font-size:1.4rem;margin:0 0 .5rem}.hdr dl{display:grid;grid-template-columns:auto 1fr;gap:.15rem .8rem;margin:0;font-size:.9rem}' +
    '.hdr dt{color:#646c7b}.hdr dd{margin:0}img{max-width:100%;height:auto}pre{white-space:pre-wrap;font-family:inherit}.att{margin-top:1.2rem;font-size:.9rem;color:#646c7b}';

  function headerHtml(m, atts) {
    var rows = [['From', m.from], ['To', m.to], ['Cc', m.cc], ['Date', m.date]].filter(function (r) { return r[1]; });
    return '<div class="hdr"><h1>' + esc(m.subject || '(no subject)') + '</h1><dl>' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl></div>';
  }
  function bodyHtml(e) {
    var body = e.acc.html.length ? sanitize(e.acc.html.join('<hr>'), e.acc.cids) : '<pre>' + esc(e.acc.text.join('\n\n')) + '</pre>';
    return headerHtml(e.meta) + body + (e.acc.attachments.length ? '<p class="att">📎 ' + e.acc.attachments.map(esc).join(', ') + '</p>' : '');
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (TO !== 'pdf') return;
    var btn = document.getElementById('convertBtn'), dl = document.getElementById('downloadBtn');
    if (btn) btn.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>' + (window.__t ? window.__t('Open Print Dialog') : 'Open Print Dialog');
    if (dl) dl.innerHTML = '<i class="bi bi-printer me-2" aria-hidden="true"></i>' + (window.__t ? window.__t('Print / Save as PDF Again') : 'Print / Save as PDF Again');
  });

  window.performConversion = async function (input) {
    // read as Latin-1 so no byte is lost; parts are decoded with their own charset afterwards
    var raw = typeof input === 'string' ? input : await new Promise(function (res, rej) {
      var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsBinaryString(input);
    });
    if (!raw.trim()) throw new Error('The input is empty.');
    var name = (input && input.name ? input.name.replace(/\.[^.]+$/, '') : '') || 'message';
    var e = parseEml(raw);

    if (TO === 'txt') {
      var body = e.acc.text.length ? e.acc.text.join('\n\n') : htmlToText(e.acc.html.join('\n'));
      var head = [['From', e.meta.from], ['To', e.meta.to], ['Cc', e.meta.cc], ['Date', e.meta.date], ['Subject', e.meta.subject]].filter(function (r) { return r[1]; })
        .map(function (r) { return r[0] + ': ' + r[1]; }).join('\n');
      var att = e.acc.attachments.length ? '\n\nAttachments: ' + e.acc.attachments.join(', ') : '';
      return { blob: new Blob([head + '\n\n' + body.replace(/\r\n?/g, '\n').trim() + att + '\n'], { type: 'text/plain;charset=utf-8' }), filename: name + '.txt' };
    }
    var inner = bodyHtml(e);
    if (TO === 'html') {
      return { blob: new Blob(['<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(e.meta.subject || name) + '</title><style>' + CSS + '</style></head>\n<body>\n' + inner + '\n</body></html>\n'], { type: 'text/html;charset=utf-8' }), filename: name + '.html' };
    }
    if (TO === 'pdf') {
      var w = window.open('', '_blank', 'width=920,height=700,menubar=no,toolbar=no');
      if (!w) throw new Error('Popup blocked. Please allow pop-ups for this site in your browser settings, then click "Open Print Dialog" again.');
      w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(e.meta.subject || name) + '</title><style>@page{margin:2cm}' + CSS + '@media print{body{margin:0;max-width:none}}</style></head><body>' + inner + '</body></html>');
      w.document.close();
      var go = function () { w.focus(); w.print(); };
      if (w.document.readyState === 'complete') setTimeout(go, 500); else w.addEventListener('load', function () { setTimeout(go, 500); });
      return { printMode: true, printFn: go };
    }
    throw new Error('Converter not available for this format yet.');
  };
  window.__eml = { parseEml: parseEml };
})();
