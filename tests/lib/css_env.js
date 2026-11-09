// CSS 시험 공용 도우미: style.css → theme.css 를 @import 까지 풀어 읽은 규칙 목록과, 화면 크기별로 실제로 이기는 값
// (브라우저 없이 같은 선택자끼리만 단순 계산). W0 뒤로는 고치지 않음 — 시험마다 필요한 도우미는 그 시험 파일 안에 둠
import { readFileSync, readdirSync } from 'node:fs';

export const root = new URL('../../', import.meta.url);
export const read = (p) => readFileSync(new URL(p, root), 'utf8');

/** @import './x.css'; 를 그 파일 내용으로 바꿔 한 덩어리로 (Vite 가 묶는 순서와 같음). 같은 조각을 두 번 읽으면 실패 */
const IMPORT = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?\s*;/g;
function load(url, seen) {
  if (seen.has(url.href)) throw new Error(`같은 CSS 조각을 두 번 @import: ${url.pathname}`);
  seen.add(url.href);
  return readFileSync(url, 'utf8').replace(IMPORT, (m, rel) => load(new URL(rel, url), seen));
}
/** CSS 파일 하나를 @import 까지 풀어 읽음 */
export const readCss = (p) => load(new URL(p, root), new Set());

/** CSS → [{ sel, decls: [[prop, value]], media: ['@media ...'] }] (주석 제거, 중첩 @media 지원) */
export function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') { stack.push(buf.trim()); buf = ''; }
    else if (ch === '}') {
      const sel = stack.pop();
      if (!sel.startsWith('@')) {
        const decls = buf.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
          const i = d.indexOf(':');
          return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
        });
        out.push({ sel: sel.replace(/\s+/g, ' '), decls, media: stack.filter((s) => s.startsWith('@')) });
      }
      buf = '';
    } else buf += ch;
  }
  return out;
}

// ---- 미디어 조건 (이 파일은 W0 뒤로 고치지 않으므로 뒤 조각이 쓸 만한 조건까지 미리)
// env: { w, h, coarse } + 고를 수 있는 것 { dpr=1, dark=false, reducedMotion=false, displayMode='browser' }
const ratio = (v) => { const [a, b = '1'] = v.split('/'); return parseFloat(a) / parseFloat(b); };
const dppx = (v) => { const n = parseFloat(v); return /dpi$/.test(v) ? n / 96 : /dpcm$/.test(v) ? (n * 2.54) / 96 : n; };
/** 범위 조건: 이 환경의 값 + 글자 값 읽기 (길이는 px 만) */
const RANGE = {
  width: [(e) => e.w, parseFloat],
  height: [(e) => e.h, parseFloat],
  'aspect-ratio': [(e) => e.w / e.h, ratio],
  resolution: [(e) => e.dpr ?? 1, dppx],
};
/** 고르는 조건: 이 환경에서 참인 값 하나 */
const pointer = (e) => (e.coarse ? 'coarse' : 'fine');
const hover = (e) => (e.coarse ? 'none' : 'hover');
const PICK = {
  orientation: (e) => (e.h >= e.w ? 'portrait' : 'landscape'), // 정사각형은 세로 (명세)
  pointer, 'any-pointer': pointer, hover, 'any-hover': hover,
  'prefers-reduced-motion': (e) => (e.reducedMotion ? 'reduce' : 'no-preference'),
  'prefers-color-scheme': (e) => (e.dark ? 'dark' : 'light'),
  'prefers-contrast': () => 'no-preference',
  'display-mode': (e) => e.displayMode || 'browser',
  scan: () => 'progressive',
  update: () => 'fast',
};
const EPS = 1e-9;
const CMP = { '<': (a, b) => a < b - EPS, '<=': (a, b) => a <= b + EPS, '>': (a, b) => a > b + EPS, '>=': (a, b) => a >= b - EPS, '=': (a, b) => Math.abs(a - b) <= EPS };
const FLIP = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' };

/** 괄호 안 조건 하나. 모르는 조건은 브라우저처럼 거짓 (던지지 않음) */
function feature(f, env) {
  const c = f.indexOf(':');
  if (c >= 0) {
    let k = f.slice(0, c).trim();
    const v = f.slice(c + 1).trim();
    k = k.replace(/^-webkit-(min-|max-)?device-pixel-ratio$/, (m, p) => `${p || ''}resolution`).replace(/^(min-|max-)?device-/, '$1');
    const pre = /^(min|max)-/.exec(k)?.[1];
    const name = pre ? k.slice(4) : k;
    if (RANGE[name]) {
      const [get, read] = RANGE[name];
      return CMP[pre === 'min' ? '>=' : pre === 'max' ? '<=' : '='](get(env), read(v));
    }
    return !pre && !!PICK[name] && PICK[name](env) === v;
  }
  // 범위 문법: (width <= 600px), (400px < width < 900px), (600px >= width)
  const m = /^(?:(.+?)\s*([<>]=?|=)\s*)?([a-z-]+)\s*(?:([<>]=?|=)\s*(.+))?$/.exec(f.trim());
  if (m && (m[2] || m[4])) {
    const [, a, op1, name, op2, b] = m;
    if (!RANGE[name]) return false;
    const [get, read] = RANGE[name];
    const x = get(env);
    return (!op1 || CMP[FLIP[op1]](x, read(a))) && (!op2 || CMP[op2](x, read(b)));
  }
  // 값 없이 (hover)·(pointer)·(width): none·0 이 아니면 참
  const k = f.trim();
  if (RANGE[k]) return RANGE[k][0](env) !== 0;
  if (PICK[k]) return !['none', 'no-preference'].includes(PICK[k](env));
  return false;
}

/** 쉼표로 나뉜 미디어 쿼리 하나: [not|only] [all|screen|print] [and] (조건) and|or (조건) … */
function mediaQuery(s, env) {
  let not = false;
  const lead = /^(not|only)\s+/.exec(s);
  if (lead) { not = lead[1] === 'not'; s = s.slice(lead[0].length); }
  let ok = true;
  const type = /^([a-z-]+)\s*(?:and\s+|$)/.exec(s);
  if (type) { ok = type[1] === 'all' || type[1] === 'screen'; s = s.slice(type[0].length); }
  const feats = [...s.matchAll(/\(([^()]+)\)/g)].map((x) => x[1]);
  if (feats.length) ok = ok && (/\)\s*or\s*\(/.test(s) ? feats.some((f) => feature(f, env)) : feats.every((f) => feature(f, env)));
  return not ? !ok : ok;
}

/** at-rule 이 env 에서 켜지는지. @media 는 계산, @supports 는 요즘 브라우저라 보고 참(not 은 거짓), 나머지(@keyframes·@container 등)는 거짓 */
export function mediaMatches(q, env) {
  q = q.replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.startsWith('@supports')) return !/^@supports not\b/.test(q);
  if (!q.startsWith('@media')) return false;
  return q.slice(6).split(',').some((part) => mediaQuery(part.trim(), env));
}

// 조각 폴더의 .css 는 모두 목록(style.css·theme.css)에 한 번씩 들어 있어야 함 (빠진 조각은 화면에 안 나옴)
const STYLE = readCss('src/ui/style.css'), THEME = readCss('src/ui/theme.css');
for (const [dir, list] of [['src/ui/css/', 'src/ui/style.css'], ['src/ui/theme/', 'src/ui/theme.css']]) {
  const names = [...read(list).matchAll(IMPORT)].map((m) => new URL(m[1], new URL(list, root)).href);
  for (const f of readdirSync(new URL(dir, root)).filter((x) => x.endsWith('.css'))) {
    const href = new URL(dir + f, root).href;
    const n = names.filter((x) => x === href).length;
    if (n !== 1) throw new Error(`${dir}${f} 가 ${list} 에 ${n}번 들어 있음 (한 번이어야 함)`);
  }
}

export const RULES = [...parse(STYLE), ...parse(THEME)];
export const PHONE = { w: 390, h: 844, coarse: true };
export const LAND = { w: 844, h: 390, coarse: true };
export const TABLET = { w: 820, h: 1180, coarse: true };
export const DESK = { w: 1280, h: 800, coarse: false };
export const DESK2 = { w: 1100, h: 740, coarse: false };
export const WIDE = { w: 1440, h: 900, coarse: false };
export const SHORT = { w: 1280, h: 480, coarse: false }; // 낮은 데스크톱 창

/** 선택자 목록에 sel 이 그대로 들어 있는 규칙 중 env 에서 마지막으로 이기는 prop 값 (border 묶음은 두께로도 셈) */
export function value(env, sel, prop) {
  let v;
  for (const r of RULES) {
    if (!r.sel.split(',').map((s) => s.trim()).includes(sel)) continue;
    if (!r.media.every((m) => mediaMatches(m, env))) continue;
    for (const [p, val] of r.decls) {
      if (p === prop) v = val;
      else if (prop === 'border-width' && p === 'border') v = val.split(' ')[0];
    }
  }
  return v;
}
