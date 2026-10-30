/**
 * Spreadsheet → HTML table / Markdown table (CSV, TSV, Excel, ODS) using SheetJS.
 * Pair read from the page URL (csv-to-html, excel-to-markdown, …). Every sheet becomes a table;
 * with more than one sheet each table gets the sheet name as heading.
 */
(function () {
  'use strict';

  var slug = (location.pathname.match(/\/([a-z0-9]+-to-[a-z0-9]+)\/?$/) || [])[1] || '';
  var FROM = slug.split('-to-')[0], TO = slug.split('-to-')[1];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function cellText(v) {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().replace(/T00:00:00\.000Z$/, '').replace(/\.000Z$/, '').replace('T', ' ');
    return String(v);
  }

  async function readRows(input) {
    if (!window.XLSX) throw new Error('Spreadsheet library not loaded. Reload the page and try again.');
    var X = window.XLSX, wb;
    if (typeof input === 'string') wb = X.read(input, { type: 'string', FS: FROM === 'tsv' ? '\t' : undefined, cellDates: true });
    else if (FROM === 'csv' || FROM === 'tsv') wb = X.read(await input.text(), { type: 'string', FS: FROM === 'tsv' ? '\t' : undefined, cellDates: true });
    else wb = X.read(await input.arrayBuffer(), { type: 'array', cellDates: true });
    var sheets = wb.SheetNames.map(function (n) {
      var rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false });
      return { name: n, rows: rows };
    }).filter(function (s) { return s.rows.length; });
    if (!sheets.length) throw new Error('This workbook has no sheets.');
    return sheets;
  }

  function width(rows) { return rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0); }

  function toHtml(sheets, title) {
    var multi = sheets.length > 1;
    var body = sheets.map(function (s) {
      var w = width(s.rows);
      var tr = s.rows.map(function (r, ri) {
        var cells = '';
        for (var c = 0; c < w; c++) cells += '<' + (ri === 0 ? 'th' : 'td') + '>' + esc(cellText(r[c])) + '</' + (ri === 0 ? 'th' : 'td') + '>';
        return '<tr>' + cells + '</tr>';
      }).join('\n');
      return (multi ? '<h2>' + esc(s.name) + '</h2>\n' : '') + '<table>\n' + tr + '\n</table>';
    }).join('\n\n');
    return '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + '</title>' +
      '<style>body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;margin:2rem;color:#171b24}table{border-collapse:collapse;margin:0 0 2rem}' +
      'th,td{border:1px solid #c9ced6;padding:.4rem .7rem;text-align:left;vertical-align:top}th{background:#f1f3f6}</style></head>\n<body>\n' + body + '\n</body></html>\n';
  }

  function mdCell(v) { return cellText(v).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>'); }
  function toMarkdown(sheets) {
    var multi = sheets.length > 1;
    return sheets.map(function (s) {
      var w = width(s.rows), lines = [];
      function row(r) { var c = []; for (var i = 0; i < w; i++) c.push(mdCell(r[i])); return '| ' + c.join(' | ') + ' |'; }
      lines.push(row(s.rows[0]));
      lines.push('|' + new Array(w + 1).join(' --- |'));
      s.rows.slice(1).forEach(function (r) { lines.push(row(r)); });
      return (multi ? '## ' + s.name + '\n\n' : '') + lines.join('\n');
    }).join('\n\n') + '\n';
  }

  window.performConversion = async function (input) {
    var name = (input && input.name ? input.name.replace(/\.[^.]+$/, '') : '') || 'converted';
    var sheets = await readRows(input);
    if (TO === 'html') return { blob: new Blob([toHtml(sheets, name)], { type: 'text/html;charset=utf-8' }), filename: name + '.html' };
    return { blob: new Blob([toMarkdown(sheets)], { type: 'text/markdown;charset=utf-8' }), filename: name + '.md' };
  };
})();
