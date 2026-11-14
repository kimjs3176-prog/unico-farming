// UI 조각들이 함께 쓰는 도우미: 요소 만들기·글자 이스케이프·게이지 %·레벨 경험치 시작점
import { LEVELS } from '../game/sim/quests.js';
export { blurTextInput } from '../game/input.js';

export const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export function pct(x, v) { return Math.round(((x - v.lo) / (v.hi - v.lo)) * 100); }
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function LEVEL_PREV(q) { return LEVELS[q.level - 1] || 0; }
