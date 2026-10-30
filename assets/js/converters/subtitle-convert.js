/**
 * Subtitles: SRT ↔ VTT, and SRT / VTT → plain text transcript.
 * Pair read from the page URL (srt-to-vtt, vtt-to-srt, srt-to-txt, vtt-to-txt).
 */
(function () {
  'use strict';

  var slug = (location.pathname.match(/\/([a-z0-9]+-to-[a-z0-9]+)\/?$/) || [])[1] || '';
  var FROM = slug.split('-to-')[0], TO = slug.split('-to-')[1];

  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function p3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }

  // "00:01:02,345" / "01:02.345" / "1:02:03.4" → milliseconds
  function toMs(s) {
    var m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
    if (!m) return null;
    return ((+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3])) * 1000 + Math.round(parseFloat('0.' + m[4].padEnd(3, '0')) * 1000);
  }
  function fmt(ms, sep) {
    ms = Math.max(0, ms);
    var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return p2(h) + ':' + p2(m) + ':' + p2(s) + sep + p3(ms % 1000);
  }

  // → [{ start, end, text, settings }]
  function parse(text) {
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
    var cues = [];
    text.split(/\n{2,}/).forEach(function (block) {
      var lines = block.split('\n');
      var ti = -1;
      for (var i = 0; i < lines.length; i++) if (/-->/.test(lines[i])) { ti = i; break; }
      if (ti < 0) return;     // WEBVTT header, NOTE, STYLE, REGION blocks
      var m = lines[ti].match(/^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)\s*(.*)$/);
      if (!m) return;
      var a = toMs(m[1]), b = toMs(m[2]);
      if (a == null || b == null) return;
      cues.push({ start: a, end: b, text: lines.slice(ti + 1).join('\n'), settings: m[3] || '' });
    });
    if (!cues.length) throw new Error('No subtitles were found in this file.');
    return cues;
  }

  function toSrt(cues) {
    return cues.map(function (c, i) {
      var t = c.text.replace(/<\/?c(?:\.[^>]*)?>|<\d{2}:[\d:.]+>|<\/?v(?:\s[^>]*)?>|<\/?(?:ruby|rt|lang)[^>]*>/g, '');
      t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
      return (i + 1) + '\n' + fmt(c.start, ',') + ' --> ' + fmt(c.end, ',') + '\n' + t;
    }).join('\n\n') + '\n';
  }
  function toVtt(cues) {
    return 'WEBVTT\n\n' + cues.map(function (c, i) {
      return (i + 1) + '\n' + fmt(c.start, '.') + ' --> ' + fmt(c.end, '.') + '\n' + c.text;
    }).join('\n\n') + '\n';
  }
  function toTxt(cues) {
    return cues.map(function (c) {
      return c.text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\{\\an?\d\}/g, '').trim();
    }).filter(Boolean).join('\n') + '\n';
  }

  window.performConversion = async function (input) {
    var text = typeof input === 'string' ? input : await input.text();
    if (!text.trim()) throw new Error('The input is empty.');
    var name = (input && input.name ? input.name.replace(/\.[^.]+$/, '') : '') || 'subtitles';
    var cues = parse(text);
    if (TO === 'vtt') return { blob: new Blob([toVtt(cues)], { type: 'text/vtt;charset=utf-8' }), filename: name + '.vtt' };
    if (TO === 'srt') return { blob: new Blob([toSrt(cues)], { type: 'application/x-subrip;charset=utf-8' }), filename: name + '.srt' };
    if (TO === 'txt') return { blob: new Blob([toTxt(cues)], { type: 'text/plain;charset=utf-8' }), filename: name + '.txt' };
    throw new Error('Converter not available for this format yet.');
  };
  window.__subs = { parse: parse, toSrt: toSrt, toVtt: toVtt, toTxt: toTxt };
})();
