/**
 * Contacts (VCF / vCard) and calendars (ICS / iCalendar) ↔ CSV / Excel.
 *
 *   vcf-to-csv, vcf-to-excel, csv-to-vcf, ics-to-csv, ics-to-excel, csv-to-ics
 *
 * The pair is read from the page URL. SheetJS (window.XLSX) is only needed for Excel output.
 * Everything runs locally; the file is never uploaded.
 */
(function () {
  'use strict';

  var slug = (location.pathname.match(/\/([a-z0-9]+-to-[a-z0-9]+)\/?$/) || [])[1] || '';
  var FROM = slug.split('-to-')[0], TO = slug.split('-to-')[1];

  /* ───────────── shared text helpers ───────────── */

  // RFC 5545 / 6350 line unfolding: a CRLF followed by a space or tab continues the previous line
  function unfold(text) {
    return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  }
  function unescapeValue(v) {
    return v.replace(/\\([nN,;\\])/g, function (m, c) { return c === 'n' || c === 'N' ? '\n' : c; });
  }
  function escapeValue(v) {
    return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }
  function foldLine(line) {
    // fold at 75 characters (good enough: no multi-byte splitting because we cut by code points)
    var chars = Array.from(line), out = [], cur = '', bytes = 0;
    chars.forEach(function (ch) {
      var b = new TextEncoder().encode(ch).length;
      if (bytes + b > 74 && cur) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += b;
    });
    out.push(cur);
    return out.join('\r\n');
  }
  function decodeQP(v, charset) {
    var bytes = [];
    v.replace(/=\n/g, '').replace(/=([0-9A-Fa-f]{2})|([\s\S])/g, function (m, hex, ch) {
      if (hex) bytes.push(parseInt(hex, 16));
      else Array.prototype.push.apply(bytes, new TextEncoder().encode(ch));
      return '';
    });
    try { return new TextDecoder(charset || 'utf-8').decode(new Uint8Array(bytes)); } catch (e) { return new TextDecoder().decode(new Uint8Array(bytes)); }
  }

  // "NAME;PARAM=a;PARAM=b:value" → { name, params:{...}, value }
  function parseProp(line) {
    var colon = -1, inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === ':' && !inQ) { colon = i; break; }
    }
    if (colon < 0) return null;
    var head = line.slice(0, colon).split(';'), value = line.slice(colon + 1);
    var name = head[0].toUpperCase().replace(/^[A-Z0-9-]+\./, ''), params = {};
    head.slice(1).forEach(function (p) {
      var eq = p.indexOf('=');
      var k = (eq < 0 ? 'TYPE' : p.slice(0, eq)).toUpperCase(), v = eq < 0 ? p : p.slice(eq + 1);
      v = v.replace(/"/g, '');
      if (/^(TYPE|ENCODING|VALUE)$/.test(k)) v = v.toUpperCase();
      params[k] = k === 'CHARSET' ? v.toLowerCase() : (params[k] ? params[k] + ',' : '') + v;
    });
    return { name: name, params: params, value: value };
  }

  async function readText(input) { return typeof input === 'string' ? input : await input.text(); }

  /* ───────────── CSV ───────────── */

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    // delimiter guess from the header line
    var first = text.split(/\r?\n/)[0] || '';
    var sep = [',', ';', '\t'].map(function (d) { return [d, first.split(d).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return v.trim() !== ''; }); });
  }
  function csvCell(v) {
    v = v == null ? '' : String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function rowsToCsv(rows) { return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'; }
  function rowsToXlsx(rows, sheetName) {
    if (!window.XLSX) throw new Error('Spreadsheet library not loaded. Reload the page and try again.');
    var wb = window.XLSX.utils.book_new();
    var ws = window.XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map(function (h, i) {
      var w = rows.reduce(function (m, r) { return Math.max(m, String(r[i] == null ? '' : r[i]).split('\n')[0].length); }, 8);
      return { wch: Math.min(w + 2, 60) };
    });
    window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return new Blob([window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function output(rows, input, sheet) {
    var name = (input && input.name ? input.name.replace(/\.[^.]+$/, '') : '') || 'converted';
    if (TO === 'excel') return { blob: rowsToXlsx(rows, sheet), filename: name + '.xlsx' };
    return { blob: new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename: name + '.csv' };
  }

  /* ───────────── VCF → rows ───────────── */

  var VCF_COLS = ['Full Name', 'First Name', 'Last Name', 'Organization', 'Job Title', 'Mobile', 'Work Phone', 'Home Phone', 'Other Phone',
    'Email', 'Email 2', 'Address', 'Website', 'Birthday', 'Notes'];

  function parseVcf(text) {
    var lines = unfold(text), cards = [], card = null;
    lines.forEach(function (line) {
      var up = line.trim().toUpperCase();
      if (up === 'BEGIN:VCARD') { card = []; return; }
      if (up === 'END:VCARD') { if (card) cards.push(card); card = null; return; }
      if (!card || !line.trim()) return;
      var p = parseProp(line);
      if (p) {
        if (/QUOTED-PRINTABLE/.test(p.params.ENCODING || '')) p.value = decodeQP(p.value, p.params.CHARSET);
        card.push(p);
      }
    });
    if (!cards.length) throw new Error('No contacts were found in this file.');
    return cards;
  }

  function vcfRows(text) {
    var rows = [VCF_COLS];
    parseVcf(text).forEach(function (props) {
      var r = {}, phones = { Mobile: [], 'Work Phone': [], 'Home Phone': [], 'Other Phone': [] }, emails = [], adr = [], urls = [], notes = [];
      props.forEach(function (p) {
        var v = p.value, t = p.params.TYPE || '';
        switch (p.name) {
          case 'FN': r['Full Name'] = unescapeValue(v); break;
          case 'N': { var n = v.split(';').map(unescapeValue); r['Last Name'] = n[0] || ''; r['First Name'] = [n[1], n[2]].filter(Boolean).join(' '); r._n = [n[3], n[1], n[2], n[0], n[4]].filter(Boolean).join(' '); break; }
          case 'ORG': r.Organization = v.split(';').map(unescapeValue).filter(Boolean).join(', '); break;
          case 'TITLE': r['Job Title'] = unescapeValue(v); break;
          case 'TEL': {
            var key = /CELL|MOBILE/.test(t) ? 'Mobile' : /WORK/.test(t) ? 'Work Phone' : /HOME/.test(t) ? 'Home Phone' : 'Other Phone';
            phones[key].push(v.replace(/^tel:/i, '')); break;
          }
          case 'EMAIL': emails.push(v.replace(/^mailto:/i, '')); break;
          case 'ADR': adr.push(v.split(';').map(unescapeValue).filter(Boolean).join(', ')); break;
          case 'URL': urls.push(v); break;
          case 'BDAY': r.Birthday = v.replace(/^(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'); break;
          case 'NOTE': notes.push(unescapeValue(v)); break;
        }
      });
      if (!r['Full Name']) r['Full Name'] = r._n || '';
      Object.keys(phones).forEach(function (k) { r[k] = phones[k].join('; '); });
      r.Email = emails[0] || ''; r['Email 2'] = emails.slice(1).join('; ');
      r.Address = adr.join(' | '); r.Website = urls.join('; '); r.Notes = notes.join('\n');
      rows.push(VCF_COLS.map(function (c) { return r[c] || ''; }));
    });
    return rows;
  }

  /* ───────────── CSV → VCF ───────────── */

  var ALIASES = {
    first: ['first name', 'firstname', 'given name', 'vorname', 'jméno', 'imię', 'imie'],
    last: ['last name', 'lastname', 'surname', 'family name', 'nachname', 'příjmení', 'nazwisko'],
    full: ['full name', 'name', 'display name', 'fullname', 'kontakt', 'contact'],
    org: ['organization', 'organisation', 'company', 'firma', 'unternehmen', 'společnost', 'firma/organizacja', 'organization name'],
    title: ['job title', 'title', 'position', 'beruf', 'position/title', 'pozice', 'stanowisko'],
    mobile: ['mobile', 'mobile phone', 'cell', 'cell phone', 'handy', 'mobil', 'mobilní', 'komórka'],
    work: ['work phone', 'business phone', 'phone (work)', 'telefon geschäftlich', 'phone', 'telephone', 'tel', 'telefon'],
    home: ['home phone', 'phone (home)', 'telefon privat'],
    other: ['other phone', 'phone 2', 'fax'],
    email: ['email', 'e-mail', 'e-mail address', 'email address', 'email 1', 'mail'],
    email2: ['email 2', 'e-mail 2', 'e-mail 2 address', 'email address 2'],
    address: ['address', 'adresse', 'street', 'home address', 'adresa', 'adres'],
    web: ['website', 'web', 'url', 'homepage'],
    bday: ['birthday', 'birth date', 'date of birth', 'geburtstag', 'narozeniny', 'urodziny'],
    notes: ['notes', 'note', 'notizen', 'comments', 'poznámky', 'notatki'],
  };
  function colIndex(headers) {
    var idx = {}, norm = headers.map(function (h) { return h.trim().toLowerCase(); });
    Object.keys(ALIASES).forEach(function (k) {
      for (var i = 0; i < ALIASES[k].length; i++) { var f = norm.indexOf(ALIASES[k][i]); if (f > -1 && Object.keys(idx).every(function (o) { return idx[o] !== f; })) { idx[k] = f; break; } }
    });
    return idx;
  }

  function csvToVcf(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) throw new Error('Need a header row plus at least one data row.');
    var idx = colIndex(rows[0]);
    if (idx.full == null && idx.first == null && idx.last == null && idx.email == null) {
      throw new Error('Could not find name or email columns. Use headers such as "First Name", "Last Name", "Email", "Phone".');
    }
    var out = [];
    rows.slice(1).forEach(function (r) {
      var g = function (k) { return idx[k] != null ? (r[idx[k]] || '').trim() : ''; };
      var first = g('first'), last = g('last'), full = g('full');
      if (!full) full = [first, last].filter(Boolean).join(' ');
      if (!first && !last && full) { var parts = full.split(/\s+/); last = parts.length > 1 ? parts.pop() : ''; first = parts.join(' '); }
      if (!full && !g('email') && !g('mobile') && !g('work')) return;
      var L = ['BEGIN:VCARD', 'VERSION:3.0'];
      L.push('N:' + escapeValue(last) + ';' + escapeValue(first) + ';;;');
      L.push('FN:' + escapeValue(full || g('email')));
      if (g('org')) L.push('ORG:' + escapeValue(g('org')));
      if (g('title')) L.push('TITLE:' + escapeValue(g('title')));
      [['mobile', 'CELL'], ['work', 'WORK'], ['home', 'HOME'], ['other', 'VOICE']].forEach(function (p) {
        g(p[0]).split(/\s*;\s*/).filter(Boolean).forEach(function (v) { L.push('TEL;TYPE=' + p[1] + ':' + v.replace(/[\r\n]/g, '')); });
      });
      [g('email'), g('email2')].forEach(function (e) { e.split(/\s*;\s*/).filter(Boolean).forEach(function (v) { L.push('EMAIL;TYPE=INTERNET:' + v); }); });
      if (g('address')) L.push('ADR;TYPE=HOME:;;' + escapeValue(g('address')) + ';;;;');
      if (g('web')) L.push('URL:' + g('web'));
      if (g('bday')) { var b = g('bday').match(/^(\d{4})-(\d{2})-(\d{2})/); L.push('BDAY:' + (b ? b[1] + '-' + b[2] + '-' + b[3] : g('bday'))); }
      if (g('notes')) L.push('NOTE:' + escapeValue(g('notes')));
      L.push('END:VCARD');
      out.push(L.map(foldLine).join('\r\n'));
    });
    if (!out.length) throw new Error('No contacts were found in this file.');
    return out.join('\r\n') + '\r\n';
  }

  /* ───────────── ICS ↔ rows ───────────── */

  var ICS_COLS = ['Summary', 'Start', 'End', 'All day', 'Location', 'Description', 'Organizer', 'Status', 'Repeat', 'URL'];

  function icsDate(p) {
    if (!p) return { text: '', allDay: false };
    var m = p.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return { text: p.value, allDay: false };
    if (m[4] === undefined) return { text: m[1] + '-' + m[2] + '-' + m[3], allDay: true };
    return { text: m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + (m[7] ? ' UTC' : ''), allDay: false };
  }

  function icsRows(text) {
    var lines = unfold(text), events = [], ev = null;
    lines.forEach(function (line) {
      var up = line.trim().toUpperCase();
      if (up === 'BEGIN:VEVENT') { ev = {}; return; }
      if (up === 'END:VEVENT') { if (ev) events.push(ev); ev = null; return; }
      if (!ev || !line.trim() || /^(BEGIN|END):/i.test(line)) return;   // skip nested VALARM etc.
      var p = parseProp(line);
      if (p && !ev[p.name]) ev[p.name] = p;
    });
    if (!events.length) throw new Error('No events were found in this file.');
    var rows = [ICS_COLS];
    events.forEach(function (e) {
      var s = icsDate(e.DTSTART), en = icsDate(e.DTEND);
      var org = e.ORGANIZER ? (e.ORGANIZER.params.CN ? e.ORGANIZER.params.CN : e.ORGANIZER.value.replace(/^mailto:/i, '')) : '';
      rows.push([
        e.SUMMARY ? unescapeValue(e.SUMMARY.value) : '', s.text, en.text, s.allDay ? 'yes' : 'no',
        e.LOCATION ? unescapeValue(e.LOCATION.value) : '', e.DESCRIPTION ? unescapeValue(e.DESCRIPTION.value) : '',
        org, e.STATUS ? e.STATUS.value : '', e.RRULE ? e.RRULE.value : '', e.URL ? e.URL.value : '',
      ]);
    });
    return rows;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // accepts 2026-10-30, 2026-10-30 18:00, 30.10.2026 18:00, 10/30/2026 6:00 PM, ISO with T/Z
  function parseWhen(v) {
    v = (v || '').trim();
    if (!v) return null;
    var m, y, mo, d, h = null, mi = 0, utc = /\b(z|utc)$/i.test(v);
    v = v.replace(/\s*(z|utc)$/i, '');
    if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]+(\d{1,2}):(\d{2}))?/))) { y = +m[1]; mo = +m[2]; d = +m[3]; if (m[4]) { h = +m[4]; mi = +m[5]; } }
    else if ((m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (m[4]) { h = +m[4]; mi = +m[5]; } }
    else if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AaPp])[Mm])?)?/))) {
      mo = +m[1]; d = +m[2]; y = +m[3];
      if (m[4]) { h = +m[4]; mi = +m[5]; if (m[6]) { var pm = /p/i.test(m[6]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; } }
    } else return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y: y, mo: mo, d: d, h: h, mi: mi, utc: utc };
  }
  function fmtDate(w) { return w.y + pad(w.mo) + pad(w.d); }
  function fmtDateTime(w) { return fmtDate(w) + 'T' + pad(w.h || 0) + pad(w.mi || 0) + '00' + (w.utc ? 'Z' : ''); }
  function addDays(w, n) { var dt = new Date(Date.UTC(w.y, w.mo - 1, w.d + n)); return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: w.h, mi: w.mi, utc: w.utc }; }
  function addMinutes(w, n) {
    var dt = new Date(Date.UTC(w.y, w.mo - 1, w.d, w.h || 0, (w.mi || 0) + n));
    return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes(), utc: w.utc };
  }

  function csvToIcs(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) throw new Error('Need a header row plus at least one data row.');
    var H = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var find = function (names) { for (var i = 0; i < names.length; i++) { var f = H.indexOf(names[i]); if (f > -1) return f; } return -1; };
    var cSum = find(['summary', 'subject', 'title', 'event', 'name', 'betreff', 'titel', 'předmět', 'temat']);
    var cStart = find(['start', 'start date', 'start time', 'begin', 'date', 'beginn', 'start datum', 'začátek', 'początek']);
    var cStartTime = find(['start time', 'startzeit', 'time']);
    var cEnd = find(['end', 'end date', 'finish', 'ende', 'konec', 'koniec']);
    var cEndTime = find(['end time', 'endzeit']);
    var cLoc = find(['location', 'place', 'ort', 'místo', 'miejsce']);
    var cDesc = find(['description', 'notes', 'details', 'beschreibung', 'popis', 'opis']);
    if (cSum < 0 || cStart < 0) throw new Error('Could not find event columns. Use headers such as "Summary" and "Start".');
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), n = 0;
    var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AintoB.com//CSV to ICS//EN', 'CALSCALE:GREGORIAN'];
    rows.slice(1).forEach(function (r, i) {
      var s = parseWhen((r[cStart] || '') + (cStartTime > -1 && cStartTime !== cStart && r[cStartTime] && !/\d:\d/.test(r[cStart] || '') ? ' ' + r[cStartTime] : ''));
      if (!s || !(r[cSum] || '').trim()) return;
      var e = cEnd > -1 ? parseWhen((r[cEnd] || '') + (cEndTime > -1 && r[cEndTime] && !/\d:\d/.test(r[cEnd] || '') ? ' ' + r[cEndTime] : '')) : null;
      var allDay = s.h === null;
      var L = ['BEGIN:VEVENT', 'UID:aintob-' + stamp + '-' + (++n) + '@aintob.com', 'DTSTAMP:' + stamp.replace(/Z?$/, 'Z'), 'SUMMARY:' + escapeValue(r[cSum].trim())];
      if (allDay) {
        L.push('DTSTART;VALUE=DATE:' + fmtDate(s));
        L.push('DTEND;VALUE=DATE:' + fmtDate(e && e.h === null ? addDays(e, 1) : addDays(s, 1)));
      } else {
        L.push('DTSTART:' + fmtDateTime(s));
        L.push('DTEND:' + fmtDateTime(e && e.h !== null ? e : addMinutes(s, 60)));
      }
      if (cLoc > -1 && (r[cLoc] || '').trim()) L.push('LOCATION:' + escapeValue(r[cLoc].trim()));
      if (cDesc > -1 && (r[cDesc] || '').trim()) L.push('DESCRIPTION:' + escapeValue(r[cDesc].trim()));
      L.push('END:VEVENT');
      out.push(L.map(foldLine).join('\r\n'));
    });
    if (n === 0) throw new Error('No events were found in this file. Dates should look like 2026-10-30 18:00 or 30.10.2026 18:00.');
    out.push('END:VCALENDAR');
    return out.join('\r\n') + '\r\n';
  }

  /* ───────────── entry point ───────────── */

  window.performConversion = async function (input) {
    var text = await readText(input);
    if (!text.trim()) throw new Error('The input is empty.');
    var name = (input && input.name ? input.name.replace(/\.[^.]+$/, '') : '') || 'converted';
    if (FROM === 'vcf') return output(vcfRows(text), input, 'Contacts');
    if (FROM === 'ics') return output(icsRows(text), input, 'Events');
    if (TO === 'vcf') return { blob: new Blob([csvToVcf(text)], { type: 'text/vcard;charset=utf-8' }), filename: name + '.vcf' };
    if (TO === 'ics') return { blob: new Blob([csvToIcs(text)], { type: 'text/calendar;charset=utf-8' }), filename: name + '.ics' };
    throw new Error('Converter not available for this format yet.');
  };

  window.__contacts = { vcfRows: vcfRows, csvToVcf: csvToVcf, icsRows: icsRows, csvToIcs: csvToIcs };
})();
