/**
 * Web fonts: TTF / OTF ↔ WOFF (WOFF 1.0, zlib-compressed tables).
 *
 * WOFF is just an sfnt font whose tables are individually deflated, so no outline conversion is needed:
 *   ttf-to-woff, otf-to-woff  → compress tables (CompressionStream 'deflate' = zlib)
 *   woff-to-ttf, woff-to-otf  → decompress tables and rebuild the sfnt directory
 * A TrueType-flavoured WOFF can only become .ttf and a CFF-flavoured one only .otf; the converter says so
 * instead of renaming. (WOFF2 uses Brotli, which browsers cannot compress natively, so it is not offered.)
 */
(function () {
  'use strict';

  var slug = (location.pathname.match(/\/([a-z0-9]+-to-[a-z0-9]+)\/?$/) || [])[1] || '';
  var FROM = slug.split('-to-')[0], TO = slug.split('-to-')[1];

  async function stream(bytes, Ctor) {
    var s = new Blob([bytes]).stream().pipeThrough(new Ctor('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  function need() {
    if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot compress or decompress fonts. Please use a current Chrome, Edge, Firefox or Safari.');
    }
  }
  function pad4(n) { return (n + 3) & ~3; }
  function tag(dv, o) { return String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)); }
  async function toWoff(buf) {
    need();
    var src = new Uint8Array(buf), dv = new DataView(buf);
    var flavor = dv.getUint32(0), n = dv.getUint16(4);
    var sig = tag(dv, 0);
    if (!(flavor === 0x00010000 || sig === 'OTTO' || sig === 'true')) throw new Error('This is not a TrueType or OpenType font file.');
    var tables = [];
    for (var i = 0; i < n; i++) {
      var o = 12 + i * 16;
      var off = dv.getUint32(o + 8), len = dv.getUint32(o + 12);
      var raw = src.subarray(off, off + len);
      var comp = await stream(raw, CompressionStream);
      var useComp = comp.length < raw.length;
      tables.push({ tag: tag(dv, o), sum: dv.getUint32(o + 4), orig: len, data: useComp ? comp : raw, comp: useComp ? comp.length : len });
    }
    var dirSize = 44 + n * 20, offset = dirSize, total = dirSize;
    tables.forEach(function (t) { t.off = offset; offset += pad4(t.comp); });
    total = offset;
    var origSize = 12 + n * 16;
    tables.forEach(function (t) { origSize += pad4(t.orig); });
    var out = new Uint8Array(total), od = new DataView(out.buffer);
    od.setUint32(0, 0x774F4646); od.setUint32(4, flavor); od.setUint32(8, total); od.setUint16(12, n); od.setUint16(14, 0);
    od.setUint32(16, origSize); od.setUint16(20, 1); od.setUint16(22, 0);
    // metaOffset, metaLength, metaOrigLength, privOffset, privLength stay 0
    tables.forEach(function (t, i) {
      var p = 44 + i * 20;
      for (var k = 0; k < 4; k++) out[p + k] = t.tag.charCodeAt(k);
      od.setUint32(p + 4, t.off); od.setUint32(p + 8, t.comp); od.setUint32(p + 12, t.orig); od.setUint32(p + 16, t.sum);
      out.set(t.data, t.off);
    });
    return out;
  }

  async function fromWoff(buf) {
    need();
    var dv = new DataView(buf), src = new Uint8Array(buf);
    if (buf.byteLength < 44 || dv.getUint32(0) !== 0x774F4646) {
      if (buf.byteLength > 4 && dv.getUint32(0) === 0x774F4632) throw new Error('This is a WOFF2 font, which this tool cannot read yet. Use a WOFF (1.0) file.');
      throw new Error('This is not a WOFF font file.');
    }
    var flavor = dv.getUint32(4), n = dv.getUint16(12);
    var tables = [];
    for (var i = 0; i < n; i++) {
      var p = 44 + i * 20;
      var t = { tag: tag(dv, p), off: dv.getUint32(p + 4), comp: dv.getUint32(p + 8), orig: dv.getUint32(p + 12), sum: dv.getUint32(p + 16) };
      var chunk = src.subarray(t.off, t.off + t.comp);
      t.data = t.comp < t.orig ? await stream(chunk, DecompressionStream) : chunk;
      if (t.data.length !== t.orig) throw new Error('This font file is damaged.');
      tables.push(t);
    }
    tables.sort(function (a, b) { return a.tag < b.tag ? -1 : 1; });
    var offset = 12 + n * 16;
    tables.forEach(function (t) { t.so = offset; offset += pad4(t.orig); });
    var out = new Uint8Array(offset), od = new DataView(out.buffer);
    var maxPow = 1, log = 0; while (maxPow * 2 <= n) { maxPow *= 2; log++; }
    od.setUint32(0, flavor); od.setUint16(4, n); od.setUint16(6, maxPow * 16); od.setUint16(8, log); od.setUint16(10, n * 16 - maxPow * 16);
    tables.forEach(function (t, i) {
      var p = 12 + i * 16;
      for (var k = 0; k < 4; k++) out[p + k] = t.tag.charCodeAt(k);
      od.setUint32(p + 4, t.sum); od.setUint32(p + 8, t.so); od.setUint32(p + 12, t.orig);
      out.set(t.data, t.so);
    });
    return { bytes: out, cff: flavor === 0x4F54544F };
  }

  window.performConversion = async function (input) {
    var buf = await input.arrayBuffer();
    var name = (input.name || '').replace(/\.[^.]+$/, '') || 'font';
    if (TO === 'woff') {
      var w = await toWoff(buf);
      return { blob: new Blob([w], { type: 'font/woff' }), filename: name + '.woff' };
    }
    var r = await fromWoff(buf);
    if (TO === 'ttf' && r.cff) throw new Error('This WOFF contains OpenType (CFF) outlines. Use the WOFF to OTF converter instead.');
    if (TO === 'otf' && !r.cff) throw new Error('This WOFF contains TrueType outlines. Use the WOFF to TTF converter instead.');
    return { blob: new Blob([r.bytes], { type: TO === 'otf' ? 'font/otf' : 'font/ttf' }), filename: name + '.' + TO };
  };
  window.__font = { toWoff: toWoff, fromWoff: fromWoff };
})();
