/**
 * Data & text tools — one shared converter for the /data/ pages.
 *
 * Tool is selected from the page URL:
 *   json-to-csv, csv-to-json, json-to-yaml, yaml-to-json, xml-to-json,
 *   json-formatter, base64-encode, base64-decode, url-encode, url-decode,
 *   case-converter
 *
 * YAML pages additionally load js-yaml from CDN (window.jsyaml).
 * All processing is local; input may be a File/Blob (upload) or a string (paste).
 */
(function () {
  'use strict';

  var TOOL = (location.pathname.match(/\/data\/([a-z0-9-]+)\/?/) || [])[1] || '';

  // ── Input helpers ──────────────────────────────────────────────────────────
  function readText(input) {
    if (typeof input === 'string') return Promise.resolve(input);
    return input.text();
  }

  function textResult(text, filename, mime) {
    return { blob: new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), filename: filename };
  }

  function baseName(input, fallback) {
    if (input && typeof input === 'object' && input.name) {
      return input.name.replace(/\.[^.]+$/, '');
    }
    return fallback;
  }

  // ── CSV ────────────────────────────────────────────────────────────────────
  // Full CSV parser: quoted fields, embedded commas, quotes, and newlines.
  function parseCSV(text) {
    var rows = [], row = [], cur = '', inQ = false, i = 0;
    text = text.replace(/^﻿/, '');
    while (i < text.length) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cur += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { row.push(cur); cur = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
      cur += c; i++;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    // Drop trailing fully-empty rows
    while (rows.length && rows[rows.length - 1].every(function (v) { return v === ''; })) rows.pop();
    return rows;
  }

  function csvField(v) {
    if (v == null) v = '';
    if (typeof v === 'object') v = JSON.stringify(v);
    v = String(v);
    if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function jsonToCsv(text) {
    var data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('Invalid JSON: ' + e.message); }

    if (data && typeof data === 'object' && !Array.isArray(data)) data = [data];
    if (!Array.isArray(data) || !data.length) {
      throw new Error('Expected a JSON array of objects (or a single object) at the top level.');
    }

    // Array of arrays → rows as-is
    if (Array.isArray(data[0])) {
      return data.map(function (r) { return r.map(csvField).join(','); }).join('\n');
    }

    // Array of objects → union of keys as header
    var keys = [];
    data.forEach(function (o) {
      if (o == null || typeof o !== 'object') return;
      Object.keys(o).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
    });
    if (!keys.length) throw new Error('No object keys found — is this an array of objects?');

    var lines = [keys.map(csvField).join(',')];
    data.forEach(function (o) {
      lines.push(keys.map(function (k) { return csvField(o == null ? '' : o[k]); }).join(','));
    });
    return lines.join('\n');
  }

  function csvToJson(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) throw new Error('Need a header row plus at least one data row.');
    var headers = rows[0].map(function (h, i) { return h.trim() || 'column_' + (i + 1); });
    var out = rows.slice(1).map(function (r) {
      var o = {};
      headers.forEach(function (h, i) {
        var v = r[i] == null ? '' : r[i];
        // Preserve numbers/booleans when unambiguous
        if (v !== '' && !isNaN(v) && v.trim() !== '') o[h] = Number(v);
        else if (v === 'true') o[h] = true;
        else if (v === 'false') o[h] = false;
        else o[h] = v;
      });
      return o;
    });
    return JSON.stringify(out, null, 2);
  }

  // ── YAML ───────────────────────────────────────────────────────────────────
  function needYaml() {
    if (!window.jsyaml) throw new Error('YAML library not loaded. Reload the page and try again.');
    return window.jsyaml;
  }

  function jsonToYaml(text) {
    var data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    return needYaml().dump(data, { lineWidth: 120, noRefs: true });
  }

  function yamlToJson(text) {
    var data;
    try { data = needYaml().load(text); }
    catch (e) { throw new Error('Invalid YAML: ' + e.message); }
    return JSON.stringify(data, null, 2);
  }

  // ── XML ────────────────────────────────────────────────────────────────────
  function xmlNodeToJson(node) {
    var obj = {};
    var hasAttrs = false, hasChildren = false;

    if (node.attributes) {
      for (var a = 0; a < node.attributes.length; a++) {
        obj['@' + node.attributes[a].name] = node.attributes[a].value;
        hasAttrs = true;
      }
    }

    var text = '';
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];
      if (child.nodeType === 3 || child.nodeType === 4) { // text / CDATA
        text += child.nodeValue;
      } else if (child.nodeType === 1) { // element
        hasChildren = true;
        var val = xmlNodeToJson(child);
        if (obj.hasOwnProperty(child.nodeName)) {
          if (!Array.isArray(obj[child.nodeName])) obj[child.nodeName] = [obj[child.nodeName]];
          obj[child.nodeName].push(val);
        } else {
          obj[child.nodeName] = val;
        }
      }
    }

    text = text.trim();
    if (!hasChildren && !hasAttrs) return text; // leaf node → plain string
    if (text) obj['#text'] = text;
    return obj;
  }

  function xmlToJson(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var err = doc.querySelector('parsererror');
    if (err) throw new Error('Invalid XML: ' + err.textContent.split('\n')[0]);
    var root = {};
    root[doc.documentElement.nodeName] = xmlNodeToJson(doc.documentElement);
    return JSON.stringify(root, null, 2);
  }

  // ── JSON formatter ─────────────────────────────────────────────────────────
  function jsonFormat(text, mode) {
    var data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    return mode === 'minify' ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  }

  // ── Base64 ─────────────────────────────────────────────────────────────────
  function bytesToBase64(bytes) {
    var bin = '', CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function base64Decode(text) {
    var raw = text.trim()
      .replace(/^data:[^;]*;base64,/, '') // strip data-URI prefix
      .replace(/\s+/g, '');
    raw = raw.replace(/-/g, '+').replace(/_/g, '/'); // accept base64url
    while (raw.length % 4) raw += '=';
    var bin;
    try { bin = atob(raw); }
    catch (e) { throw new Error('Not valid Base64. Check for stray characters or truncation.'); }
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    // If it decodes to clean UTF-8 text, return .txt; otherwise a binary file
    try {
      var decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!/[\x00-\x08\x0E-\x1F]/.test(decoded)) {
        return textResult(decoded, 'decoded.txt');
      }
    } catch (e) { /* binary */ }
    return { blob: new Blob([bytes], { type: 'application/octet-stream' }), filename: 'decoded.bin' };
  }

  // ── Case converter ─────────────────────────────────────────────────────────
  // Split into identifier words: punctuation is dropped, camelCase boundaries kept
  function words(text) {
    return text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9À-ɏ]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  var CASE_MODES = {
    upper:    { label: 'UPPERCASE',     fn: function (t) { return t.toUpperCase(); } },
    lower:    { label: 'lowercase',     fn: function (t) { return t.toLowerCase(); } },
    title:    { label: 'Title Case',    fn: function (t) {
      return t.toLowerCase().replace(/(^|\s|[-—("'])([a-zà-ÿ])/g, function (m, p, c) { return p + c.toUpperCase(); });
    } },
    sentence: { label: 'Sentence case', fn: function (t) {
      return t.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-zà-ÿ])/g, function (m, p, c) { return p + c.toUpperCase(); });
    } },
    camel:    { label: 'camelCase',     fn: function (t) {
      return t.split(/\n/).map(function (line) {
        var w = words(line);
        return w.map(function (x, i) {
          x = x.toLowerCase();
          return i ? x.charAt(0).toUpperCase() + x.slice(1) : x;
        }).join('');
      }).join('\n');
    } },
    pascal:   { label: 'PascalCase',    fn: function (t) {
      return t.split(/\n/).map(function (line) {
        return words(line).map(function (x) {
          x = x.toLowerCase();
          return x.charAt(0).toUpperCase() + x.slice(1);
        }).join('');
      }).join('\n');
    } },
    snake:    { label: 'snake_case',    fn: function (t) {
      return t.split(/\n/).map(function (line) { return words(line).join('_').toLowerCase(); }).join('\n');
    } },
    kebab:    { label: 'kebab-case',    fn: function (t) {
      return t.split(/\n/).map(function (line) { return words(line).join('-').toLowerCase(); }).join('\n');
    } },
  };

  // ── Options UI (injected for tools that need a mode choice) ────────────────
  function injectOptions(html) {
    ['converterSettings', 'panelPaste'].forEach(function (panelId) {
      var panel = document.getElementById(panelId);
      if (!panel || panel.querySelector('.data-tool-options')) return;
      var wrap = document.createElement('div');
      wrap.className = 'data-tool-options mb-3';
      wrap.innerHTML = html;
      var btn = panel.querySelector('#convertBtn, #convertTextBtn');
      if (btn) panel.insertBefore(wrap, btn);
      else panel.appendChild(wrap);
    });
  }

  function selectedOption(name, fallback) {
    var el = document.querySelector('input[name="' + name + '"]:checked, select[data-option="' + name + '"]');
    if (!el) return fallback;
    return el.value || fallback;
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (TOOL === 'json-formatter') {
      injectOptions(
        '<label class="converter-label">Output style</label>' +
        '<div class="d-flex gap-4">' +
        '<label style="cursor:pointer;"><input type="radio" name="jsonMode" value="pretty" checked class="me-2">Pretty-print (2-space indent)</label>' +
        '<label style="cursor:pointer;"><input type="radio" name="jsonMode" value="minify" class="me-2">Minify</label>' +
        '</div>'
      );
    }
    if (TOOL === 'case-converter') {
      var opts = Object.keys(CASE_MODES).map(function (k) {
        return '<option value="' + k + '">' + CASE_MODES[k].label + '</option>';
      }).join('');
      injectOptions(
        '<label class="converter-label" for="caseMode">Convert to</label>' +
        '<select data-option="caseMode" class="form-select">' + opts + '</select>'
      );
    }
  });

  // ── Dispatcher ─────────────────────────────────────────────────────────────
  window.performConversion = async function (input) {
    var name;

    // base64-encode of an uploaded file works on raw bytes, not text
    if (TOOL === 'base64-encode' && typeof input !== 'string') {
      var buf = new Uint8Array(await input.arrayBuffer());
      return textResult(bytesToBase64(buf), baseName(input, 'encoded') + '.base64.txt');
    }

    var text = await readText(input);
    if (!text.trim()) throw new Error('The input is empty.');

    switch (TOOL) {
      case 'json-to-csv':
        return textResult(jsonToCsv(text), baseName(input, 'converted') + '.csv', 'text/csv');
      case 'csv-to-json':
        return textResult(csvToJson(text), baseName(input, 'converted') + '.json', 'application/json');
      case 'json-to-yaml':
        return textResult(jsonToYaml(text), baseName(input, 'converted') + '.yaml', 'application/x-yaml');
      case 'yaml-to-json':
        return textResult(yamlToJson(text), baseName(input, 'converted') + '.json', 'application/json');
      case 'xml-to-json':
        return textResult(xmlToJson(text), baseName(input, 'converted') + '.json', 'application/json');
      case 'json-formatter':
        name = selectedOption('jsonMode', 'pretty') === 'minify' ? 'minified.json' : 'formatted.json';
        return textResult(jsonFormat(text, selectedOption('jsonMode', 'pretty')), name, 'application/json');
      case 'base64-encode':
        return textResult(bytesToBase64(new TextEncoder().encode(text)), 'encoded.base64.txt');
      case 'base64-decode':
        return base64Decode(text);
      case 'url-encode':
        return textResult(encodeURIComponent(text), 'url-encoded.txt');
      case 'url-decode':
        try { return textResult(decodeURIComponent(text.replace(/\+/g, '%20')), 'url-decoded.txt'); }
        catch (e) { throw new Error('Not valid URL-encoded text — check for stray % characters.'); }
      case 'case-converter':
        var mode = CASE_MODES[selectedOption('caseMode', 'upper')] || CASE_MODES.upper;
        return textResult(mode.fn(text), 'converted-case.txt');
      default:
        throw new Error('Unknown tool: ' + TOOL);
    }
  };
})();
