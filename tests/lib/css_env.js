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

/** 이 저장소에서 쓰는 미디어 조건만: (max/min-width|height: Npx) (min-aspect-ratio: a/b) (pointer: coarse) (hover: none) */
export function mediaMatches(q, env) {
  if (!q.startsWith('@media')) return false; // @keyframes 등
  return q.slice(6).split(',').some((part) => [...part.matchAll(/\(([^)]+)\)/g)].every(([, f]) => {
    const [k, v] = f.split(':').map((x) => x.trim());
    const n = parseFloat(v);
    if (k === 'max-width') return env.w <= n;
    if (k === 'min-width') return env.w >= n;
    if (k === 'max-height') return env.h <= n;
    if (k === 'min-height') return env.h >= n;
    if (k === 'min-aspect-ratio') { const [a, b] = v.split('/').map(Number); return env.w * b >= env.h * a; }
    if (k === 'pointer') return v === (env.coarse ? 'coarse' : 'fine');
    if (k === 'hover') return v === (env.coarse ? 'none' : 'hover');
    if (k === 'prefers-reduced-motion') return false;
    throw new Error(`모르는 미디어 조건: ${f}`);
  }));
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
