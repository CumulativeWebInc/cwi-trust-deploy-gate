'use strict';
/**
 * CWI Deploy Gate — lib/gate.js
 *
 * Pre-flight static checks that encode CWI's real deployment scar tissue as
 * machine-checkable rules. Zero dependencies, Node >= 18.
 *
 * Checks:
 *   1. scope      — inline-module scope audit (the DISTRICT_BEACONS class)
 *   2. labels     — SAMPLE/LIVE badge audit (build-time constants vs mode)
 *   3. versioning — importer/module cache-bust query-string audit
 *   4. secrets    — secret-shaped value scan (never prints values)
 *
 * Each check returns an array of finding objects:
 *   { check, file, line, message }
 */

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/* shared helpers                                                      */
/* ------------------------------------------------------------------ */

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function isBinary(buf) {
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function walkFiles(root, { exclude = [] } = {}) {
  const out = [];
  const skipDirs = new Set(['node_modules', '.git', '.hg', '.svn']);
  function rec(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (excluded(rel, exclude)) continue;
      if (e.isDirectory()) {
        if (skipDirs.has(e.name)) continue;
        rec(full);
      } else if (e.isFile()) {
        out.push({ full, rel });
      }
    }
  }
  rec(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function excluded(rel, patterns) {
  for (const p of patterns) {
    if (!p) continue;
    if (p.includes('*')) {
      const re = new RegExp('^' + p.split('*').map(escapeRegExp).join('.*') + '$');
      if (re.test(rel)) return true;
    } else if (rel === p || rel.startsWith(p.endsWith('/') ? p : p + '/')) {
      return true;
    }
  }
  return false;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/* ------------------------------------------------------------------ */
/* Check 1 — inline-module scope audit                                 */
/*                                                                     */
/* The DISTRICT_BEACONS class (gear-ledger, 2026-09-17): an identifier */
/* declared with const/let inside a nested callback scope but          */
/* referenced from a shallower scope (module top level / outer fn)     */
/* throws ReferenceError and kills boot. Unit tests never saw it       */
/* because no test evaluated the page's inline module script.          */
/*                                                                     */
/* Method: mask strings/comments, tokenize, track brace depth, collect */
/* declarations per depth and references per depth. Flag a reference   */
/* when EVERY declaration of that identifier sits at a strictly        */
/* deeper scope depth than the reference. Conservative by design:       */
/* sibling scopes are not distinguished, so exotic misses are          */
/* possible, but top-level/outer-function references — the incident     */
/* class — are caught.                                                 */
/* ------------------------------------------------------------------ */

const JS_KEYWORDS = new Set(
  ('break case catch class const continue debugger default delete do else export extends ' +
   'finally for function if import in instanceof new return super switch this throw try ' +
   'typeof var void while with yield let static get set async await of from as ' +
   'true false null').split(' ')
);

const JS_BUILTINS = new Set(
  ('console window document navigator process module exports require __dirname __filename ' +
   'globalThis global self location history localStorage sessionStorage fetch ' +
   'setTimeout clearTimeout setInterval clearInterval requestAnimationFrame ' +
   'cancelAnimationFrame URL URLSearchParams JSON Math Object Array String Number Boolean ' +
   'Date RegExp Error Promise Map Set WeakMap WeakSet Symbol BigInt Reflect Proxy Intl ' +
   'performance crypto TextEncoder TextDecoder Blob FormData Headers Request Response ' +
   'AbortController Event CustomEvent queueMicrotask structuredClone undefined NaN Infinity ' +
   'arguments').split(' ')
);

// Mask comments + string/template contents (keeping ${} expressions) so the
// scope walker never mistakes text for code. Length-preserving: newlines kept,
// everything else becomes spaces, so line numbers survive.
function maskSource(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // shebang (#!/usr/bin/env node) is not code — mask the whole first line
  if (src.startsWith('#!')) {
    while (i < n && src[i] !== '\n') { out += ' '; i++; }
  }
  const REGEX_AFTER = new Set(['(', ',', '=', '[', '!', '&', '|', '?', ':', ';', '{', '}', '+', '-', '*', '%', '<', '>', '^', '~', '\n', ' ']);
  let prevSig = '\n';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      out += '  '; i += 2;
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      prevSig = '\n';
    } else if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
      prevSig = ' ';
    } else if (c === '"' || c === "'") {
      out += ' '; i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { out += '  '; i += 2; }
        else { out += src[i] === '\n' ? '\n' : ' '; i++; }
      }
      out += ' '; i++;
      prevSig = 'x';
    } else if (c === '`') {
      out += ' '; i++;
      let depth = 0;
      while (i < n) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === '`' && depth === 0) { out += ' '; i++; break; }
        if (src[i] === '$' && src[i + 1] === '{') { out += '${'; i += 2; depth++; continue; }
        if (src[i] === '}' && depth > 0) { out += '}'; i++; depth--; prevSig = '}'; continue; }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      prevSig = 'x';
    } else if (c === '/' && (prevSig === '\n' || REGEX_AFTER.has(prevSig)) && d !== '/' && d !== '*') {
      // likely a regex literal — consume to closing unescaped /
      out += ' '; i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === '[') inClass = true;
        if (src[i] === ']') inClass = false;
        if (src[i] === '/' && !inClass) break;
        if (src[i] === '\n') break; // not a regex after all (division) — bail
        out += ' '; i++;
      }
      if (i < n && src[i] === '/') { out += ' '; i++; while (i < n && /[a-z]/i.test(src[i])) { out += ' '; i++; } }
      prevSig = 'x';
    } else {
      out += c;
      if (c !== ' ' && c !== '\t' && c !== '\r' && c !== '\n') prevSig = c;
      i++;
    }
  }
  return out;
}

function tokenize(masked) {
  const toks = [];
  const re = /([A-Za-z_$][A-Za-z0-9_$]*)|(\.\.\.|=>|===|!==|==|!=|<=|>=|\?\.)|(\s+)|([\s\S])/g;
  let m;
  let line = 1, col = 0;
  while ((m = re.exec(masked)) !== null) {
    const t = m[0];
    const tok = { v: t, line, col };
    for (const ch of t) { if (ch === '\n') { line++; col = 0; } else col++; }
    if (m[3]) continue; // whitespace
    tok.type = m[1] ? 'ident' : (m[2] ? 'op' : 'p');
    toks.push(tok);
  }
  return toks;
}

// Collect declared names from a destructuring/param token run, as indices.
// In a binding context, an identifier followed by ':' is a key (skip); all
// other identifiers are bindings (covers shorthand {a}, [x], rest ...r,
// defaults a=1).
function harvestBindingIndices(toks, lo, hi) {
  const idxs = [];
  for (let i = lo; i < hi; i++) {
    const t = toks[i];
    if (t.type !== 'ident' || JS_KEYWORDS.has(t.v)) continue;
    const prev = toks[i - 1], next = toks[i + 1];
    if (prev && prev.v === '.') continue;
    if (next && next.v === ':') continue; // key position
    idxs.push(i);
  }
  return idxs;
}

function checkScopeFile(file, src) {
  const findings = [];
  const masked = maskSource(src);
  const toks = tokenize(masked);
  const decls = new Map(); // name -> [{scope, line}]
  const refs = [];         // {name, scope, line, idx}
  const bindingIdx = new Set(); // token indices that are binding positions, never references

  // Scope identity (not just depth): each `{` opens a scope with a unique id
  // and a parent link, so sibling scopes are distinguished. A reference is
  // only satisfied by a declaration in its own scope or an ancestor scope —
  // exactly the ReferenceError semantics of the DISTRICT_BEACONS incident.
  const scopeParent = new Map([[0, null]]);
  const scopeIsFunc = new Map([[0, true]]); // module top level counts as function scope for `var`
  let nextScope = 1;
  const scopeStack = [0];
  // Function headers awaiting their body `{`, as {depth, closeIdx}: the body
  // is the first `{` after closeIdx opening at the same brace depth. Used
  // ONLY to mark function scopes for `var` hoisting — params live in the
  // enclosing scope, so a `{` inside a default value can never orphan them.
  const funcPending = [];
  const curScope = () => scopeStack[scopeStack.length - 1];
  const newScope = (isFunc) => {
    const id = nextScope++;
    scopeParent.set(id, curScope());
    scopeIsFunc.set(id, !!isFunc);
    return id;
  };
  const visible = (declScope, refScope) => {
    let s = refScope;
    while (s !== null && s !== undefined) {
      if (s === declScope) return true;
      s = scopeParent.get(s);
    }
    return false;
  };

  const declare = (name, scope, line) => {
    if (JS_KEYWORDS.has(name)) return;
    if (!decls.has(name)) decls.set(name, []);
    decls.get(name).push({ scope, line });
  };
  // declare every binding in [lo, hi) in scope `s` and mark the tokens
  const declareBindings = (lo, hi, s, line) => {
    for (const k of harvestBindingIndices(toks, lo, hi)) {
      bindingIdx.add(k);
      declare(toks[k].v, s, line);
    }
  };
  // `var` hoists to the nearest function scope (or module top level)
  const funcScopeOf = (s) => {
    let x = s;
    while (x !== null && x !== undefined && !scopeIsFunc.get(x)) x = scopeParent.get(x);
    return x === null || x === undefined ? 0 : x;
  };

  // matchClose returns index of matching close for open at idx
  const matchClose = (idx, open, close) => {
    let d = 0;
    for (let i = idx; i < toks.length; i++) {
      if (toks[i].v === open) d++;
      else if (toks[i].v === close) { d--; if (d === 0) return i; }
    }
    return -1;
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.v === '{') {
      const id = nextScope++;
      // pair with a pending function header, if this brace is its body
      let isFunc = false;
      while (funcPending.length) {
        const top = funcPending[funcPending.length - 1];
        if (top.closeIdx < i && top.depth === scopeStack.length - 1) {
          funcPending.pop(); isFunc = true;
        } else break;
      }
      scopeParent.set(id, curScope());
      scopeIsFunc.set(id, isFunc);
      scopeStack.push(id);
      continue;
    }
    if (t.v === '}') { if (scopeStack.length > 1) scopeStack.pop(); continue; }
    if (t.v === '=>' || t.type !== 'ident') {
      if (t.v === '=>') {
        // Params precede: either a bare ident or (...). Params are declared
        // in the CURRENT (enclosing) scope — simpler and immune to `{`s
        // inside default values; the body block is always a child scope, so
        // visibility is unaffected. Block-body arrows additionally register
        // their body `{` as a function scope (for `var` hoisting).
        const cs = curScope();
        const prev = toks[i - 1];
        const declareArrowParams = (s) => {
          if (prev && prev.type === 'ident') { bindingIdx.add(i - 1); declare(prev.v, s, t.line); }
          else if (prev && prev.v === ')') {
            const open = (() => { let d = 0; for (let k = i - 1; k >= 0; k--) { if (toks[k].v === ')') d++; else if (toks[k].v === '(') { d--; if (d === 0) return k; } } return -1; })();
            if (open !== -1) declareBindings(open + 1, i - 1, s, t.line);
          }
        };
        declareArrowParams(cs);
        if (toks[i + 1] && toks[i + 1].v === '{') {
          funcPending.push({ depth: scopeStack.length - 1, closeIdx: i });
        }
      }
      continue;
    }
    const v = t.v;

    if (v === 'import') {
      const nxt = toks[i + 1];
      if (nxt && nxt.v === '(') continue; // dynamic import() — builtin-ish
      // static import clause: import A from / import {a, b as c} from / import * as ns from
      const cs = curScope();
      let j = i + 1;
      if (toks[j] && toks[j].v === '*') {
        // import * as ns
        if (toks[j + 1] && toks[j + 1].v === 'as' && toks[j + 2]) {
          bindingIdx.add(j + 2); declare(toks[j + 2].v, cs, t.line);
        }
      } else if (toks[j] && toks[j].v === '{') {
        const end = matchClose(j, '{', '}');
        const stop = end === -1 ? toks.length : end;
        // `import {a, b as c}` — bind `a`, and the alias `c` (not the export name `b`)
        for (let k = j + 1; k < stop; k++) {
          const tk = toks[k];
          if (tk.type !== 'ident' || JS_KEYWORDS.has(tk.v) || tk.v === 'as') continue;
          if (toks[k + 1] && toks[k + 1].v === 'as') continue; // export name, not a local binding
          bindingIdx.add(k); declare(tk.v, cs, t.line);
        }
        if (end !== -1) {
          for (let k = j + 1; k < end; k++) {
            if (toks[k].v === 'as' && toks[k + 1] && toks[k + 1].type === 'ident') {
              bindingIdx.add(k + 1); declare(toks[k + 1].v, cs, t.line);
            }
          }
        }
      } else if (toks[j] && toks[j].type === 'ident') {
        bindingIdx.add(j); declare(toks[j].v, cs, t.line);
      }
      continue;
    }
    if (v === 'function') {
      const cs = curScope();
      const nxt = toks[i + 1];
      let j = i + 1;
      if (nxt && nxt.type === 'ident') { bindingIdx.add(i + 1); declare(nxt.v, cs, t.line); j = i + 2; }
      else if (nxt && nxt.v === '*') j = i + 2;
      if (toks[j] && toks[j].v === '(') {
        const end = matchClose(j, '(', ')');
        declareBindings(j + 1, end === -1 ? toks.length : end, cs, t.line);
        if (end !== -1) funcPending.push({ depth: scopeStack.length - 1, closeIdx: end });
      }
      continue;
    }
    if (v === 'class') {
      const nxt = toks[i + 1];
      if (nxt && nxt.type === 'ident') { bindingIdx.add(i + 1); declare(nxt.v, curScope(), t.line); }
      continue;
    }
    if (v === 'const' || v === 'let' || v === 'var') {
      // declaration list until ';' at this nesting level
      const cs = curScope();
      const target = v === 'var' ? funcScopeOf(cs) : cs;
      let j = i + 1;
      let paren = 0, brace = 0, bracket = 0;
      const flush = (a, b) => {
        for (const k of harvestBindingIndices(toks, a, b)) { bindingIdx.add(k); declare(toks[k].v, target, t.line); }
      };
      let cur = j;
      for (; j < toks.length; j++) {
        const w = toks[j].v;
        if (w === '(') paren++; else if (w === ')') paren--;
        else if (w === '{') brace++; else if (w === '}') brace--;
        else if (w === '[') bracket++; else if (w === ']') bracket--;
        if (w === ';' && paren === 0 && brace === 0 && bracket === 0) break;
        if (w === ',' && paren === 0 && brace === 0 && bracket === 0) { flush(cur, j); cur = j + 1; }
      }
      flush(cur, j);
      i = j - 1; // let loop continue from ';' (or end)
      continue;
    }
    if (v === 'catch') {
      const nxt = toks[i + 1];
      if (nxt && nxt.v === '(') {
        const end = matchClose(i + 1, '(', ')');
        declareBindings(i + 2, end === -1 ? toks.length : end, curScope(), t.line);
        if (end !== -1) i = end; // skip the header — tokens are bindings, not refs
      }
      continue;
    }
    if (v === 'for') {
      const nxt = toks[i + 1];
      if (nxt && nxt.v === '(') {
        const end = matchClose(i + 1, '(', ')');
        let k = i + 2;
        if (toks[k] && (toks[k].v === 'const' || toks[k].v === 'let' || toks[k].v === 'var')) {
          const lim = end === -1 ? toks.length : end;
          const semi = toks.findIndex((x, idx) => idx > k && idx < lim && (x.v === ';' || x.v === 'of' || x.v === 'in'));
          const stop = semi === -1 ? lim : semi;
          // loop vars live in the enclosing scope (bodies are always children);
          // `var` additionally hoists to the function scope via funcScopeOf.
          const target = toks[k].v === 'var' ? funcScopeOf(curScope()) : curScope();
          declareBindings(k + 1, stop, target, t.line);
        }
        if (end !== -1) i = end; // skip the header — inner `const` must not re-fire
      }
      continue;
    }
    // --- reference or plain assignment ---
    if (bindingIdx.has(i)) continue; // binding position, never a reference
    if (JS_KEYWORDS.has(v)) continue;
    const prev = toks[i - 1], next = toks[i + 1];
    if (prev && prev.v === '.') continue;                 // member name
    if (next && next.v === ':' && prev && ['{', ',', '(', ';', '}'].includes(prev.v)) continue; // key/label position
    if (v === '$' && next && next.v === '{') continue; // `${` template opener, not an identifier
    if (v === 'as') continue;
    // plain assignment counts as a declaration in the current scope (implicit global)
    if (next && next.v === '=' && !(prev && ['==', '===', '!=', '!==', '<=', '>='].includes(prev.v))) {
      declare(v, curScope(), t.line);
      continue;
    }
    refs.push({ name: v, scope: curScope(), line: t.line, idx: i });
  }

  // Retroactive pass: binding positions discovered later (arrow params seen at
  // `=>`) were recorded as references when first visited — drop them now.
  const realRefs = refs.filter(r => !bindingIdx.has(r.idx));

  for (const r of realRefs) {
    if (JS_BUILTINS.has(r.name)) continue;
    const ds = decls.get(r.name);
    if (!ds || ds.length === 0) {
      // Undeclared entirely. Flag ONLY at module top level — deeper unresolved
      // names are usually globals from other scripts (browser page soup) and
      // flagging them all would drown the signal.
      if (r.scope === 0) {
        findings.push({
          check: 'scope', file, line: r.line,
          message: `identifier "${r.name}" referenced at module top level with no declaration in this file — ReferenceError risk (DISTRICT_BEACONS class)`
        });
      }
      continue;
    }
    if (ds.every(d => !visible(d.scope, r.scope))) {
      findings.push({
        check: 'scope', file, line: r.line,
        message: `identifier "${r.name}" referenced from a scope where none of its declarations is visible — the DISTRICT_BEACONS ReferenceError class (declared inside a nested callback/sibling scope)`
      });
    }
  }
  return findings;
}


function checkScope(root, files) {
  const findings = [];
  for (const f of files) {
    if (!/\.(js|mjs|cjs)$/.test(f.rel)) continue;
    const buf = fs.readFileSync(f.full);
    if (isBinary(buf)) continue;
    findings.push(...checkScopeFile(f.rel, buf.toString('utf8')));
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Check 2 — SAMPLE/LIVE label audit                                   */
/*                                                                     */
/* The 3D-world lesson (2026-09-18): the GEAR LEDGER billboard's        */
/* SAMPLE badge and the music ticker's SIM tag were hardcoded at scene  */
/* build and never followed the WorldClient mode. Labels must read a   */
/* mode value, never a build-time constant.                            */
/*                                                                     */
/* Flags literal SAMPLE/LIVE badges in markup/JS that show no evidence */
/* of being driven by a mode variable. Passes when: the same           */
/* statement/expression also mentions a mode-like variable, or selects */
/* between BOTH labels (mode-keyed map / ternary over both), or the    */
/* occurrence is a data binding ({{ }}, ${ }, bindings) rather than    */
/* static text.                                                        */
/* ------------------------------------------------------------------ */

const MODE_VAR_RE = /\b(mode|isLive|is_live|liveMode|LIVE_MODE|sampleMode|isSample|worldMode|appMode|env|ENV|config|CONFIG|settings|SETTINGS|flags|FLAGS|featureFlag)\b/;

// index of a // line comment that is not inside a string, or -1
function indexOfLineComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '/' && line[i + 1] === '/') return i;
  }
  return -1;
}

function checkLabelsFile(file, src) {
  const findings = [];
  const isHtml = /\.(html?)$/.test(file);
  const lines = src.split('\n');
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine;
    if (/deploy-gate:\s*allow/.test(line)) return; // per-line suppression
    // skip full-line comments and badges inside trailing comments
    const trimmed = line.trim();
    if (/^(\/\/|\/\*|#|\*|<!--)/.test(trimmed)) return;
    const commentAt = indexOfLineComment(line);
    // find literal SAMPLE / LIVE badges (whole word, uppercase)
    const re = /\b(SAMPLE|LIVE)\b/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const word = m[1];
      if (commentAt !== -1 && commentAt < m.index) continue; // inside trailing comment
      // data bindings → driven, not static
      if (/\{\{|\$\{|v-if|v-show|:class|data-bind|ng-if|x-if/.test(line)) continue;
      const literalRemoved = line.replace(new RegExp(`(['"\`])${word}\\1`, 'g'), '$1$1');
      // mode-driven if a mode-like variable appears outside the literal
      if (MODE_VAR_RE.test(literalRemoved)) continue;
      // mode-keyed selection: both labels present in the same statement
      const other = word === 'SAMPLE' ? 'LIVE' : 'SAMPLE';
      if (new RegExp(`\\b${other}\\b`).test(line)) continue;
      findings.push({
        check: 'labels', file, line: lineNo,
        message: `hardcoded "${word}" badge with no mode variable driving it — labels must read the mode, never a build-time constant (2026-09-18 3D-world lesson)`
      });
    }
    // HTML static badge elements: <... class="...badge...">SAMPLE</...>
    if (isHtml) {
      const hm = />\s*(SAMPLE|LIVE)\s*</.exec(line);
      if (hm && !/\{\{|\$\{|data-bind/.test(line) && !/deploy-gate:\s*allow/.test(line)) {
        // already covered by literal scan above unless inside comment; the
        // literal scan flags it — dedupe by checking we didn't just push
        const already = findings.some(f => f.line === lineNo && f.message.includes(`"${hm[1]}"`));
        if (!already) {
          findings.push({
            check: 'labels', file, line: lineNo,
            message: `static "${hm[1]}" badge baked into markup — drive it from a mode value (2026-09-18 3D-world lesson)`
          });
        }
      }
    }
  });
  return findings;
}

function checkLabels(root, files) {
  const findings = [];
  for (const f of files) {
    if (!/\.(js|mjs|cjs|html?)$/.test(f.rel)) continue;
    const buf = fs.readFileSync(f.full);
    if (isBinary(buf)) continue;
    findings.push(...checkLabelsFile(f.rel, buf.toString('utf8')));
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Check 3 — importer/module cache-bust versioning                     */
/*                                                                     */
/* The Pages cache split-brain (2026-09-17): shipping a new index.html  */
/* + a new stage-logic.js together broke the world on Black's phone —  */
/* the browser fetched the new HTML but served the OLD cached          */
/* stage-logic.js. Rule: any deploy that changes BOTH an importer and  */
/* its module must bump the import query string (?v=YYYYMMDD).          */
/*                                                                     */
/* Method: given the set of changed files (git diff or --changed),     */
/* extract relative module URLs from each changed importer             */
/* (import/from, dynamic import(), <script src>); resolve to repo      */
/* paths; flag when the target is ALSO changed and the URL carries no  */
/* version query string.                                               */
/* ------------------------------------------------------------------ */

function extractModuleUrls(file, src) {
  const urls = [];
  const isHtml = /\.(html?)$/.test(file);
  const push = (u, line) => { if (u) urls.push({ url: u, line }); };
  if (isHtml) {
    const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(src)) !== null) push(m[1], lineOf(src, m.index));
    // inline module scripts inside HTML also import
    const inline = /<script\b(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = inline.exec(src)) !== null) {
      for (const u of extractModuleUrls(file + ' (inline)', m[1])) {
        urls.push({ url: u.url, line: lineOf(src, m.index) });
      }
    }
    return urls;
  }
  const patterns = [
    /\bimport\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:[^'"]*?\s+from\s+)["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bnew\s+Worker\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) push(m[1], lineOf(src, m.index));
  }
  return urls;
}

function isRelativeModuleUrl(u) {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) return false; // scheme: http:, data:, blob:
  if (u.startsWith('//')) return false;
  if (u.startsWith('#')) return false;
  return true;
}

function resolveModuleUrl(root, importerRel, url) {
  const clean = url.split('?')[0].split('#')[0];
  if (!clean) return null;
  let abs;
  if (clean.startsWith('/')) abs = path.join(root, clean.slice(1));
  else abs = path.join(path.dirname(path.join(root, importerRel)), clean);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  if (rel.startsWith('..')) return null;
  return rel;
}

function checkVersioning(root, files, changedSet) {
  const findings = [];
  if (!changedSet || changedSet.size === 0) return findings;
  const norm = s => s.replace(/^\.\//, '');
  const changed = new Set([...changedSet].map(norm));
  for (const f of files) {
    if (!changed.has(norm(f.rel))) continue;
    if (!/\.(js|mjs|cjs|html?)$/.test(f.rel)) continue;
    const src = fs.readFileSync(f.full, 'utf8');
    for (const { url, line } of extractModuleUrls(f.rel, src)) {
      if (!isRelativeModuleUrl(url)) continue;
      const target = resolveModuleUrl(root, f.rel, url);
      if (!target) continue;
      if (!changed.has(norm(target))) continue; // module unchanged → no bump needed
      if (/\?[a-zA-Z0-9_.-]*=?/.test(url) && url.includes('?')) continue; // has query string
      findings.push({
        check: 'versioning', file: f.rel, line,
        message: `importer changed AND module "${target}" changed, but import URL "${url}" carries no version query — bump ?v=YYYYMMDD (2026-09-17 Pages cache split-brain)`
      });
    }
  }
  return findings;
}

function gitChangedFiles(root, base) {
  const { execFileSync } = require('child_process');
  try {
    const out = execFileSync('git', ['diff', '--name-only', base || 'HEAD', '--', '.'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return new Set(out.split('\n').map(s => s.trim()).filter(Boolean));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Check 4 — secret scan                                               */
/*                                                                     */
/* Catches secret-shaped values before deploy. NEVER prints a value —  */
/* findings name the file, line, and the matched key/filename class    */
/* only. Encodes the standing security order (encrypt all CWI data).   */
/* ------------------------------------------------------------------ */

const SECRET_FILE_RE = /(^|\/)\.env(\..*)?$|(^|\/)[^/]*\.(pem|key)$|(^|\/)id_rsa[^/]*$|(^|\/)[^/]*(secret|credential)[^/]*$/i;
const SECRET_LINE_RES = [
  { re: /\b([A-Za-z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWOR?D|CREDENTIAL|PRIVATE[_-]?KEY)[A-Za-z0-9_]*)\s*([:=])/i, key: 1, sep: 2 },
  { re: /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*)\s*(=)\s*\S+/ , key: 1, sep: 2 },
];
const PRIVATE_KEY_BLOCK_RE = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/;
const PLACEHOLDER_RE = /^(xxx+|changeme|your[-_].*|example|test|none|null|undefined|\*+|placeholder.*)$/i;

function looksPlaceholder(value) {
  const v = value.replace(/^['"]|['"]$/g, '').trim();
  return v === '' || PLACEHOLDER_RE.test(v);
}

// Decide whether a matched key-shaped assignment is really a secret literal.
// Never called with the value printed anywhere — verdict only.
function secretValueVerdict(sep, rawVal, quoted, line) {
  if (!rawVal || looksPlaceholder(rawVal)) return 'skip';
  if (/^(true|false|null|undefined)$/i.test(rawVal) || /^[0-9]/.test(rawVal)) return 'skip';
  if (/^[[{]/.test(rawVal)) return 'skip';   // collection literal, not a secret
  if (rawVal.startsWith('/')) return 'skip'; // regex literal (e.g. the gate's own patterns)
  if (rawVal.includes('(')) return 'skip';   // call expression, e.g. token = getToken()
  if (sep === ':' && !quoted && /[{}\(\);]/.test(line)) return 'skip';
  // bare identifier after ':' on a code-looking line is a reference
  // (e.g. { secrets: checkSecrets }), not a literal — YAML-style bare
  // values on non-code lines still flag.
  return 'flag';
}

function checkSecrets(root, files) {
  const findings = [];
  for (const f of files) {
    if (SECRET_FILE_RE.test('/' + f.rel) || SECRET_FILE_RE.test(f.rel)) {
      findings.push({
        check: 'secrets', file: f.rel, line: 0,
        message: `secret-shaped filename (.env / .pem / .key / id_rsa / *secret* / *credential*) — never deploy this (value never shown)`
      });
      continue;
    }
    if (!/\.(js|mjs|cjs|ts|json|ya?ml|toml|ini|env|txt|md|html?|sh|py|rb|php)$/.test(f.rel)) continue;
    let buf;
    try { buf = fs.readFileSync(f.full); } catch { continue; }
    if (isBinary(buf)) continue;
    const src = buf.toString('utf8');
    if (PRIVATE_KEY_BLOCK_RE.test(src)) {
      findings.push({
        check: 'secrets', file: f.rel, line: lineOf(src, src.search(PRIVATE_KEY_BLOCK_RE)),
        message: `private-key block present — never deploy key material (contents redacted)`
      });
    }
    const lines = src.split('\n');
    lines.forEach((ln, idx) => {
      if (/deploy-gate:\s*allow/.test(ln)) return;
      for (const { re, key, sep } of SECRET_LINE_RES) {
        const m = re.exec(ln);
        if (!m) continue;
        const k = m[key] || 'secret-shaped assignment';
        // extract the raw value to judge it — never printed
        const tail = ln.slice(m.index + m[0].length);
        const vm = /^\s*(['"]?)([^'"\s;,]+)/.exec(tail);
        const quoted = vm ? vm[1] !== '' : false;
        const val = vm ? vm[2] : '';
        if (secretValueVerdict(m[sep] || '=', val, quoted, ln) === 'skip') continue;
        findings.push({
          check: 'secrets', file: f.rel, line: idx + 1,
          message: `key "${k}" looks secret-shaped — value redacted, rotate before deploy`
        });
        break;
      }
    });
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* runner                                                              */
/* ------------------------------------------------------------------ */

const CHECKS = { scope: checkScope, labels: checkLabels, secrets: checkSecrets };

function run(root, { checks = ['scope', 'labels', 'versioning', 'secrets'], exclude = [], changed = null, base = 'HEAD' } = {}) {
  let files;
  try {
    if (fs.statSync(root).isFile()) {
      const rel = path.basename(root);
      if (!excluded(rel, exclude)) files = [{ full: root, rel }];
      else files = [];
    } else {
      files = walkFiles(root, { exclude });
    }
  } catch {
    files = walkFiles(root, { exclude });
  }
  const findings = [];
  const active = new Set(checks);
  if (active.has('scope')) findings.push(...checkScope(root, files));
  if (active.has('labels')) findings.push(...checkLabels(root, files));
  if (active.has('secrets')) findings.push(...checkSecrets(root, files));
  if (active.has('versioning')) {
    const changedSet = changed || gitChangedFiles(root, base);
    findings.push(...checkVersioning(root, files, changedSet));
  }
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { findings, filesScanned: files.length };
}

module.exports = {
  run,
  checkScopeFile,
  checkLabels,
  checkLabelsFile,
  checkSecrets,
  checkVersioning,
  extractModuleUrls,
  maskSource,
  CHECKS: Object.keys(CHECKS).concat(['versioning']),
};
