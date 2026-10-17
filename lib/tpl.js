/**
 * Build-time translator for hand-written HTML templates (no dependencies).
 *
 * The templates stay in English. A dictionary maps each English "text unit"
 * (the inner HTML of an element that holds text and only inline tags) to its
 * translation. Leading/trailing icon tags (<i class="bi …"></i>) are kept
 * outside the key, so keys read like plain English sentences.
 *
 *   translate(html, dict)  → { html, missing[] }
 *   units(html)            → every translatable English unit (for authoring dicts)
 */
'use strict';

const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
const INLINE = new Set(['i', 'strong', 'em', 'b', 'code', 'kbd', 'small', 'abbr', 'sub', 'sup', 'u', 'mark', 'span', 'br']);
const HAS_WORDS = /[A-Za-zÀ-ž]{2,}/;
const ICON_LEAD = /^(\s*<i\b[^>]*><\/i>\s*)*/;
const ICON_TRAIL = /(\s*<i\b[^>]*><\/i>\s*)*$/;

function parse(html) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|[^<]+/g;
  let m;
  while ((m = re.exec(html))) {
    const tok = m[0];
    const top = stack[stack.length - 1];
    if (tok.startsWith('<!--')) continue;
    if (m[2] === undefined) { top.children.push({ text: tok }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1] === '/') {
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== tag) i--;
      if (i > 0) {
        stack[i].innerEnd = m.index;
        stack[i].closeEnd = m.index + tok.length;
        stack.length = i;
      }
      continue;
    }
    const node = { tag, attrs: m[3], children: [], innerStart: m.index + tok.length };
    top.children.push(node);
    if (tag === 'script' || tag === 'style') {
      const close = html.indexOf('</' + tag, re.lastIndex);
      node.opaque = true;
      node.innerEnd = close;
      re.lastIndex = html.indexOf('>', close) + 1;
    } else if (VOID.has(tag) || /\/\s*$/.test(m[3])) {
      node.innerEnd = node.innerStart;
    } else {
      stack.push(node);
    }
  }
  return root;
}

function allInline(node) {
  return node.children.every(c => c.text !== undefined || (INLINE.has(c.tag) && allInline(c)));
}

function isUnit(node) {
  if (node.opaque || node.innerEnd === undefined) return false;
  const direct = node.children.filter(c => c.text !== undefined).map(c => c.text).join('');
  if (!HAS_WORDS.test(direct.replace(/&[a-z]+;/g, ' '))) return false;
  return allInline(node);
}

function collect(node, html, out) {
  for (const c of node.children) {
    if (c.text !== undefined || c.opaque) continue;
    if (isUnit(c)) out.push(c);
    else collect(c, html, out);
  }
}

function normalise(s) { return s.replace(/\s+/g, ' ').trim(); }

/** Split a unit's inner HTML into [lead, core, trail]; `core` is the dictionary key. */
function split(inner) {
  const lead = inner.match(ICON_LEAD)[0];
  const rest = inner.slice(lead.length);
  const trail = rest.match(ICON_TRAIL)[0];
  const core = rest.slice(0, rest.length - trail.length);
  const lw = core.match(/^\s*/)[0];
  const tw = core.match(/\s*$/)[0];
  return { lead: lead + lw, key: normalise(core), trail: tw + trail };
}

function units(html) {
  const root = parse(html);
  const nodes = [];
  collect(root, html, nodes);
  return nodes
    .filter(n => !/converter-card-link__label|id="wmPreviewText"/.test(n.attrs || ''))
    .map(n => split(html.slice(n.innerStart, n.innerEnd)).key);
}

const ATTR_RE = /(\s(?:placeholder|aria-label|title|alt)=")([^"]+)(")/g;

function translate(html, dict) {
  const missing = [];
  // 1. attributes (done first: it changes offsets)
  html = html.replace(ATTR_RE, (all, a, v, z) => {
    if (!HAS_WORDS.test(v)) return all;
    if (dict[v] !== undefined) return a + dict[v] + z;
    missing.push(v);
    return all;
  });
  // 2. text units, replaced back-to-front so offsets stay valid
  const root = parse(html);
  const nodes = [];
  collect(root, html, nodes);
  for (const n of nodes.reverse()) {
    if (/converter-card-link__label|id="wmPreviewText"/.test(n.attrs || '')) continue;
    const { lead, key, trail } = split(html.slice(n.innerStart, n.innerEnd));
    const tr = dict[key];
    if (tr === undefined) { missing.push(key); continue; }
    html = html.slice(0, n.innerStart) + lead + tr + trail + html.slice(n.innerEnd);
  }
  return { html, missing: [...new Set(missing)] };
}

module.exports = { translate, units };
