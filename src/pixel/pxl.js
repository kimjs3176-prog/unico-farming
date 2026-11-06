/**
 * 작은 도트(픽셀아트) 엔진 — 코드로 스프라이트를 '찍는' 도구
 *
 * 기법은 crsolver/claude-pxl(MIT) 스킬의 작업 습관을 따름:
 *  - 재질마다 어두움→밝음 2~5단 명암 램프(ramp)만 사용 (팔레트 밖 색 금지)
 *  - 대칭은 반만 그리고 거울(mirrorX), 외곽선은 손으로 그리지 않고 자동(outline)
 *  - 외곽선은 검정 대신 이웃 재질의 가장 어두운 색(셀아웃)
 *  - 둥근 덩어리는 돔 명암(왼쪽 위 광원)을 단계로 끊고, 경계에서만 아주 약한 디더
 *  - 의미 없는 점 노이즈 금지: 표면 무늬는 판자 줄·기와 줄·잎 덩어리처럼 이유가 있는 것만
 *  - 빛나는 재질(창문·등불)은 glow 플래그 → 밤 조명·블룸에서 빛을 냄
 */

const RAMPS = []; // { name, colors:[[r,g,b]...], glow }
const BY_NAME = {};
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** 명암 램프 등록: 어두움 → 밝음 */
export function ramp(name, colors, { glow = false } = {}) {
  const id = RAMPS.length;
  RAMPS.push({ name, colors: colors.map(hex), glow });
  BY_NAME[name] = id;
  return id;
}
export const R = (name) => {
  const id = BY_NAME[name];
  if (id === undefined) throw new Error(`pxl: 없는 램프 '${name}'`);
  return id;
};
export const rampLen = (r) => RAMPS[typeof r === 'string' ? R(r) : r].colors.length;
export const rampColor = (r, l) => { const c = RAMPS[typeof r === 'string' ? R(r) : r].colors; const k = c[Math.max(0, Math.min(c.length - 1, l))]; return `rgb(${k[0]},${k[1]},${k[2]})`; };

// 4x4 베이어 행렬 (경계 디더용)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
// 광원: 왼쪽 위 앞
const L = (() => { const v = [-0.5, -0.62, 0.6]; const n = Math.hypot(...v); return v.map((x) => x / n); })();

/** 픽셀 = (램프 id + 1) << 4 | 단계  (0 = 투명) */
const enc = (r, l) => ((r + 1) << 4) | Math.max(0, Math.min(15, l));

export class Spr {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint16Array(w * h); }

  _r(r) { return typeof r === 'string' ? R(r) : r; }
  _clampL(r, l) { return Math.max(0, Math.min(RAMPS[r].colors.length - 1, Math.round(l))); }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x]; }
  set(x, y, r, l) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    if (r === null) { this.d[y * this.w + x] = 0; return this; }
    r = this._r(r);
    this.d[y * this.w + x] = enc(r, this._clampL(r, l));
    return this;
  }
  rampAt(x, y) { const v = this.get(x, y); return v ? (v >> 4) - 1 : -1; }
  levelAt(x, y) { return this.get(x, y) & 15; }

  rect(x, y, w, h, r, l) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, r, l); return this; }
  hline(x0, x1, y, r, l) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, r, l); return this; }
  vline(x, y0, y1, r, l) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, r, l); return this; }
  line(x0, y0, x1, y1, r, l) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, r, l);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }

  /**
   * 타원(덩어리). opt.shade: 돔 명암(단계 = 램프 전체), opt.level: 단색, opt.edge: 테두리 안쪽에 어두운 선(부위 구분)
   * opt.lo/hi: 사용할 단계 범위, opt.dither: 경계 디더 세기(0~0.3), opt.clip(x,y): 그릴 픽셀 거르기
   */
  ell(cx, cy, rx, ry, r, opt = {}) {
    r = this._r(r);
    const n = RAMPS[r].colors.length;
    const lo = opt.lo ?? 0, hi = opt.hi ?? n - 1;
    const dith = opt.dither ?? 0.12;
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1), y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    const inside = (x, y) => { const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry; return u * u + v * v <= 1; };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      if (opt.clip && !opt.clip(x, y)) continue;
      let lv;
      if (opt.level !== undefined) lv = opt.level;
      else {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
        const lx = opt.light ? opt.light[0] : L[0], ly = opt.light ? opt.light[1] : L[1];
        let d = u * lx + v * ly + z * L[2];
        d = 0.5 + 0.5 * d; // 0..1
        d = Math.pow(Math.max(0, d), opt.gamma ?? 1.15);
        d += BAYER[(y & 3) * 4 + (x & 3)] * dith;
        lv = lo + Math.floor(d * (hi - lo + 1));
        lv = Math.max(lo, Math.min(hi, lv));
      }
      if (opt.edge !== undefined && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))) lv = opt.edge;
      this.set(x, y, r, lv);
    }
    return this;
  }

  /** 다각형 채우기 (점: [x,y,x,y,...]) — opt.level 단색, 또는 opt.grad: 'y'(위가 밝음) */
  poly(pts, r, opt = {}) {
    r = this._r(r);
    const n = RAMPS[r].colors.length;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      const yc = y + 0.5;
      for (let i = 0; i < pts.length; i += 2) {
        const ax = pts[i], ay = pts[i + 1], bx = pts[(i + 2) % pts.length], by = pts[(i + 3) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) {
        if (opt.clip && !opt.clip(x, y)) continue;
        let lv = opt.level ?? n - 2;
        if (opt.grad === 'y') lv = Math.round((opt.hi ?? n - 1) - ((y - minY) / Math.max(1, maxY - minY)) * ((opt.hi ?? n - 1) - (opt.lo ?? 0)) + BAYER[(y & 3) * 4 + (x & 3)] * 0.6);
        this.set(x, y, r, lv);
      }
    }
    return this;
  }

  /** 문자 격자 붙이기: map 은 글자 → [램프, 단계] (또는 null = 지우기), '.' 은 건너뜀 */
  grid(x, y, str, map) {
    const rows = str.replace(/^\n+|\s+$/g, '').split('\n').map((s) => s.trim());
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      const m = map[ch];
      if (m === undefined) return;
      if (m === null) this.set(x + i, y + j, null);
      else this.set(x + i, y + j, m[0], m[1]);
    }));
    return this;
  }

  /** 다른 스프라이트 찍기 (투명은 건너뜀) */
  stamp(s, x, y, { flip = false, swap = null } = {}) {
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const v = s.d[j * s.w + (flip ? s.w - 1 - i : i)];
      if (!v) continue;
      let out = v;
      if (swap) { const rr = (v >> 4) - 1; const to = swap[RAMPS[rr].name]; if (to) out = enc(R(to), Math.min(rampLen(to) - 1, v & 15)); }
      const X = x + i, Y = y + j;
      if (X >= 0 && Y >= 0 && X < this.w && Y < this.h) this.d[Y * this.w + X] = out;
    }
    return this;
  }

  /** 왼쪽 절반을 오른쪽으로 거울 복사 (axis: 거울 중심, 기본 가운데) */
  mirrorX(axis = this.w / 2) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < axis; x++) {
      const tx = Math.round(2 * axis - 1 - x);
      if (tx >= 0 && tx < this.w) { const v = this.d[y * this.w + x]; if (v) this.d[y * this.w + tx] = v; }
    }
    return this;
  }

  flipped() { const s = new Spr(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) s.d[y * this.w + x] = this.d[y * this.w + this.w - 1 - x]; return s; }
  clone() { const s = new Spr(this.w, this.h); s.d.set(this.d); return s; }

  /** 재질 바꾸기 (팔레트 교체 변형) */
  swap(map) {
    for (let i = 0; i < this.d.length; i++) {
      const v = this.d[i]; if (!v) continue;
      const to = map[RAMPS[(v >> 4) - 1].name];
      if (to) this.d[i] = enc(R(to), Math.min(rampLen(to) - 1, v & 15));
    }
    return this;
  }

  /** 전체 명암을 n 단계 올리거나 내림 */
  shift(n, where) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = this.d[y * this.w + x]; if (!v) continue;
      if (where && !where(x, y)) continue;
      const r = (v >> 4) - 1; this.d[y * this.w + x] = enc(r, this._clampL(r, (v & 15) + n));
    }
    return this;
  }

  /**
   * 자동 외곽선 (셀아웃): 투명 픽셀 중 불투명 이웃이 있으면 그 이웃 재질의 가장 어두운 색.
   * 광원 쪽(위·왼쪽) 테두리는 한 단계 밝게 → 딱딱한 검은 테두리 대신 부드러운 윤곽
   */
  outline({ soft = true, ink = null } = {}) {
    const src = this.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue;
      const nb = [at(x, y + 1), at(x + 1, y), at(x - 1, y), at(x, y - 1)];
      const v = nb.find((q) => q);
      if (!v) continue;
      if (ink) { this.set(x, y, ink[0], ink[1]); continue; }
      const r = (v >> 4) - 1;
      // 아래·오른쪽 이웃이 비어 있고 위·왼쪽만 칠해진 경우 = 그림자 쪽 테두리
      const lightSide = soft && !at(x, y - 1) && !at(x - 1, y) && (at(x, y + 1) || at(x + 1, y));
      this.d[y * this.w + x] = enc(r, lightSide && RAMPS[r].colors.length > 3 ? 1 : 0);
    }
    return this;
  }

  /** 부위 사이 경계선: 서로 다른 재질이 만나는 곳의 위쪽(앞쪽) 픽셀을 어둡게 */
  seams(onlyRamps = null, depth = 2) {
    const src = this.d.slice();
    for (let y = 1; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = src[y * this.w + x], u = src[(y - 1) * this.w + x];
      if (!v || !u) continue;
      const rv = (v >> 4) - 1, ru = (u >> 4) - 1;
      if (rv === ru) continue;
      if (onlyRamps && !onlyRamps.includes(RAMPS[rv].name)) continue;
      this.d[y * this.w + x] = enc(rv, Math.max(0, (v & 15) - depth));
    }
    return this;
  }

  /** 캔버스로 굽기. glowOnly: 빛나는 재질만 (블룸·야간 발광용) */
  toCanvas({ glowOnly = false, scale = 1 } = {}) {
    const c = document.createElement('canvas');
    c.width = this.w * scale; c.height = this.h * scale;
    const g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    let any = false;
    for (let i = 0; i < this.d.length; i++) {
      const v = this.d[i]; if (!v) continue;
      const rp = RAMPS[(v >> 4) - 1];
      if (glowOnly && !rp.glow) continue;
      const col = rp.colors[v & 15];
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
      any = true;
    }
    if (scale === 1) g.putImageData(img, 0, 0);
    else { const t = document.createElement('canvas'); t.width = this.w; t.height = this.h; t.getContext('2d').putImageData(img, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, c.width, c.height); }
    c.hasPixels = any;
    return c;
  }
}

/** 결정적 난수 (같은 씨앗 → 같은 그림) */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
export const rampRGB = (r, l) => { const c = RAMPS[typeof r === 'string' ? R(r) : r].colors; return c[Math.max(0, Math.min(c.length - 1, l))]; };
