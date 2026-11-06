import { MW, MH, G, POND, PLOTS } from './map.js';
import { rampRGB, bayer } from './pxl.js';

const T = 32;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** 시간대 주변광 (곱하기 색) */
const AMBIENT = [
  [0.0, [62, 72, 138]], [0.2, [70, 78, 140]], [0.25, [214, 150, 170]], [0.31, [255, 236, 218]], [0.42, [255, 252, 246]],
  [0.62, [255, 250, 240]], [0.71, [255, 196, 140]], [0.77, [190, 128, 150]], [0.83, [80, 84, 146]], [1.0, [62, 72, 138]],
];
export function ambientAt(t) {
  for (let i = 1; i < AMBIENT.length; i++) if (t <= AMBIENT[i][0]) { const [t0, c0] = AMBIENT[i - 1], [t1, c1] = AMBIENT[i]; return lerp3(c0, c1, (t - t0) / (t1 - t0)); }
  return AMBIENT[0][1];
}
/** 0 = 낮, 1 = 한밤 */
export function nightness(t) {
  if (t < 0.21) return 1; if (t < 0.29) return 1 - (t - 0.21) / 0.08;
  if (t < 0.74) return 0; if (t < 0.84) return (t - 0.74) / 0.1; return 1;
}

export class Renderer {
  constructor(canvas, S, map) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.S = S; this.map = map;
    this.low = document.createElement('canvas'); this.lg = this.low.getContext('2d');
    this.light = document.createElement('canvas'); this.lt = this.light.getContext('2d');
    this.glowC = document.createElement('canvas'); this.gg = this.glowC.getContext('2d');
    this.blurC = document.createElement('canvas'); this.bg = this.blurC.getContext('2d');
    this.bloomC = document.createElement('canvas'); this.bl = this.bloomC.getContext('2d');
    this.fx = { dof: true, bloom: true, vignette: true };
    this.auto = true;
    this.filterOK = 'filter' in this.lg;
    this.particles = [];
    this.rain = [];
    this.t = 0;
    this.bakeGround();
    this.buildStatics();
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.floor(innerWidth * dpr), H = Math.floor(innerHeight * dpr);
    this.canvas.width = W; this.canvas.height = H;
    this.scale = Math.max(2, Math.floor(Math.min(W, H) / 420));
    // 한 점 더 크게 그려 두고 화면에 옮길 때 소수점만큼 밀어 냄 → 도트는 그대로, 스크롤은 부드럽게
    this.VW = Math.ceil(W / this.scale) + 1; this.VH = Math.ceil(H / this.scale) + 1;
    for (const c of [this.low, this.light, this.glowC]) { c.width = this.VW; c.height = this.VH; }
    // 후처리는 낮은 해상도에서 (흐림은 어차피 부드러우니 1/2, 블룸은 1/4)
    this.blurC.width = Math.ceil(this.VW / 2); this.blurC.height = Math.ceil(this.VH / 2);
    this.bloomC.width = Math.ceil(this.VW / 4); this.bloomC.height = Math.ceil(this.VH / 4);
    this.lg.imageSmoothingEnabled = false;
    // 틸트시프트 마스크 (위쪽 = 먼 곳 흐림, 아래쪽 = 가까운 곳 살짝)
    const g = this.bg.createLinearGradient(0, 0, 0, this.blurC.height);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.24, 'rgba(0,0,0,0)'); g.addColorStop(0.84, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    this.dofGrad = g;
    const v = this.ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, 'rgba(10,6,30,0)'); v.addColorStop(1, 'rgba(10,6,30,0.42)');
    this.vignette = v;
  }

  /* ─────────── 지형 굽기: 픽셀마다 재질·명암 ─────────── */
  bakeGround() {
    const W = MW * T, H = MH * T;
    const { ground } = this.map;
    const mat = new Uint8Array(W * H);
    const tileAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return G.grass; return ground[ty * MW + tx]; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      // 경계를 구불구불하게: 낮은 주파수 노이즈로 표본 위치를 흔듦 (물은 원래 타원 그대로)
      const u = (x + 0.5) / T - POND.cx, v = (y + 0.5) / T - POND.cy;
      const pondEdge = (u / POND.rx) ** 2 + (v / POND.ry) ** 2 + (vnoise(x / 18, y / 18) - 0.5) * 0.18;
      if (pondEdge < 1) { mat[y * W + x] = G.water; continue; }
      const wx = (vnoise(x / 20, y / 20) - 0.5) * 12, wy = (vnoise(x / 20 + 50, y / 20 + 50) - 0.5) * 12;
      let m = tileAt(x + wx, y + wy);
      if (m === G.water) m = G.grass;
      mat[y * W + x] = m;
    }
    // 물까지 거리 (모래톱·깊이)
    const INF = 999;
    const dl = new Float32Array(W * H), dw = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { const w = mat[i] === G.water; dl[i] = w ? INF : 0; dw[i] = w ? 0 : INF; }
    const chamfer = (d) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let v = d[i]; if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + 1.41); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 1.41); } d[i] = v; }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let v = d[i]; if (x < W - 1) v = Math.min(v, d[i + 1] + 1); if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 1.41); if (x > 0) v = Math.min(v, d[i + W - 1] + 1.41); } d[i] = v; }
    };
    chamfer(dl); chamfer(dw);
    this.landDist = dl;

    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const put = (i, rgb) => { img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2]; img.data[i * 4 + 3] = 255; };
    const M = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? G.grass : mat[y * W + x]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, m = mat[i];
      const n = vnoise(x / 54, y / 54) * 0.7 + vnoise(x / 17, y / 17) * 0.3 + bayer(x, y) * 0.035;
      const n2 = vnoise(x / 13 + 9, y / 13 + 3);
      if (m === G.water) {
        const d = dl[i];
        let l = d < 3 ? 4 : d < 12 + n * 4 ? 3 : 2;
        if (d < 1.2) l = 5; // 물가 거품 띠
        put(i, rampRGB('water', l));
        continue;
      }
      const wd = dw[i];
      if (wd < 7 + n2 * 4) { put(i, rampRGB('sand', wd < 2.5 ? 1 : wd < 4.5 ? 2 : 3 + (n > 0.6 ? 1 : 0))); continue; }
      if (m === G.grass) {
        let l = n > 0.74 ? 4 : 3;
        // 길·밭과 닿는 풀 가장자리: 아래쪽은 그림자, 위쪽 둘레는 밝은 풀끝
        if (M(x, y + 1) !== G.grass || M(x, y + 2) !== G.grass) l = 2;
        else if (M(x, y - 1) !== G.grass) l = 5;
        put(i, rampRGB('grass', l));
      } else if (m === G.path) {
        let l = n > 0.76 ? 4 : 3;
        // 풀 바로 아래 길은 풀 그림자
        if (M(x, y - 1) === G.grass || M(x, y - 2) === G.grass) l = 1;
        else if (M(x, y - 3) === G.grass) l = 2;
        put(i, rampRGB('path', l));
      } else if (m === G.soil) {
        let l = 2;
        if (M(x, y - 1) === G.grass || M(x, y - 2) === G.grass) l = 0;
        put(i, rampRGB('soil', l));
      }
    }
    g.putImageData(img, 0, 0);
    // 풀잎 다발: 8px 칸마다 확률적으로 (풀이 있는 곳만, 경계에서 떨어진 곳)
    const tuft = (x, y, big) => {
      const px = (dx, dy, l) => { g.fillStyle = `rgb(${rampRGB('grass', l)})`; g.fillRect(x + dx, y + dy, 1, 1); };
      px(0, 0, 5); px(-1, 1, 4); px(1, 1, 4); px(0, 1, 4); px(-2, 2, 3); px(2, 2, 3); px(0, 2, 1); px(-1, 2, 1); px(1, 2, 1);
      if (big) { px(-2, 1, 5); px(2, 0, 5); px(3, 1, 4); }
    };
    for (let cy = 0; cy < H; cy += 8) for (let cx = 0; cx < W; cx += 8) {
      const h = hash(cx * 3 + 1, cy * 5 + 7);
      const cl = vnoise(cx / 60 + 3, cy / 60 + 8); // 다발이 무리 지어 남
      if (h > 0.08 + cl * 0.35) continue;
      const x = cx + Math.floor(hash(cx, cy) * 6) + 1, y = cy + Math.floor(hash(cy, cx) * 5) + 1;
      let ok = true;
      for (let dy = -3; dy <= 5 && ok; dy++) for (let dx = -4; dx <= 4; dx++) if (M(x + dx, y + dy) !== G.grass || dw[Math.max(0, Math.min(H - 1, y + dy)) * W + Math.max(0, Math.min(W - 1, x + dx))] < 10) { ok = false; break; }
      if (ok) tuft(x, y, h < 0.03);
    }
    // 길 위 자갈 (자갈길이라 알갱이가 이유 있음, 드문드문)
    for (let cy = 0; cy < H; cy += 11) for (let cx = 0; cx < W; cx += 11) {
      if (hash(cx + 5, cy + 9) > 0.16) continue;
      const x = cx + Math.floor(hash(cx, cy + 2) * 8), y = cy + Math.floor(hash(cx + 2, cy) * 8);
      if (M(x, y) !== G.path || M(x + 2, y) !== G.path || M(x, y - 3) !== G.path) continue;
      g.fillStyle = `rgb(${rampRGB('path', 5)})`; g.fillRect(x, y, 2, 1);
      g.fillStyle = `rgb(${rampRGB('path', 1)})`; g.fillRect(x, y + 1, 2, 1);
    }
    this.groundC = c;

    // 물 반짝임 점 목록 (물 깊은 곳)
    this.glints = [];
    for (let k = 0; k < 140; k++) {
      const x = Math.floor((POND.cx + (hash(k, 1) - 0.5) * POND.rx * 1.8) * T), y = Math.floor((POND.cy + (hash(k, 2) - 0.5) * POND.ry * 1.8) * T);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (mat[y * W + x] === G.water && dl[y * W + x] > 5) this.glints.push({ x, y, ph: hash(k, 3) * 6.28, len: 2 + Math.floor(hash(k, 4) * 4) });
    }
    // 물가 거품 두 장 (번갈아)
    this.foam = [0, 1].map((ph) => {
      const fc = document.createElement('canvas'); fc.width = W; fc.height = H; const fg = fc.getContext('2d');
      const x0 = Math.floor((POND.cx - POND.rx - 1) * T), x1 = Math.ceil((POND.cx + POND.rx + 1) * T), y0 = Math.floor((POND.cy - POND.ry - 1) * T), y1 = Math.ceil((POND.cy + POND.ry + 1) * T);
      fg.fillStyle = `rgb(${rampRGB('water', 5)})`;
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const i = y * W + x; if (mat[i] !== G.water) continue;
        const d = dl[i];
        const wave = Math.sin((x + y * 0.6) / 6 + ph * Math.PI) > 0.2;
        if (d > 1.2 && d < 3.2 && wave && ((x + y + ph) & 1)) fg.fillRect(x, y, 1, 1);
      }
      return fc;
    });
  }

  /* ─────────── 고정 소품 → 그리기 목록 ─────────── */
  buildStatics() {
    const S = this.S;
    const list = [];
    const decals = [];
    this.lights = [];
    const cx = (o) => o.x * T + T / 2, by = (o) => o.y * T + T;
    for (const o of this.map.objs) {
      switch (o.type) {
        case 'tree': {
          const set = o.fruit ? null : (o.kind === 'autumn' ? S.tree.autumn : S.tree.fol);
          const t = set ? set[o.seed % set.length] : S.tree.fruit[o.fruit];
          list.push({ o, img: t.trunk, x: cx(o) - 36, y: by(o) - 2 - 104, sy: by(o) - 4, tall: true, shadow: 'xl', sx: cx(o), shy: by(o) - 5 });
          list.push({ o, crown: true, set: t, x: cx(o) - 36, y: by(o) - 2 - 104, sy: by(o) - 4, tall: true, ph: o.seed * 0.7 });
          break;
        }
        case 'pine': list.push({ img: S.pine[o.seed % 4], x: cx(o) - 28, y: by(o) - 3 - 94, sy: by(o) - 4, tall: true, shadow: 'l', sx: cx(o), shy: by(o) - 4 }); break;
        case 'bush': list.push({ img: S.bush[o.seed % 6], x: cx(o) - 20, y: by(o) - 30, sy: by(o) - 6 }); break;
        case 'rock': list.push({ img: S.rock[o.seed % 2], x: cx(o) - 13, y: by(o) - 22, sy: by(o) - 8 }); break;
        case 'bigrock': list.push({ img: S.bigrock, x: cx(o) - 22, y: by(o) - 34, sy: by(o) - 8 }); break;
        case 'stump': list.push({ img: S.stump, x: cx(o) - 13, y: by(o) - 22, sy: by(o) - 8 }); break;
        case 'hay': list.push({ img: S.hay, x: cx(o) - 17, y: by(o) - 28, sy: by(o) - 6, shadow: 'm', sx: cx(o), shy: by(o) - 4 }); break;
        case 'crate': list.push({ img: S.crate, x: cx(o) - 13, y: by(o) - 28, sy: by(o) - 6 }); break;
        case 'flowers': decals.push({ img: S.flowers[o.seed % 8], x: cx(o) - 14, y: by(o) - 22 }); break;
        case 'reeds': list.push({ img: S.reeds[o.seed % 3], x: cx(o) - 10, y: by(o) - 32, sy: by(o) - 4 }); break;
        case 'lily': decals.push({ img: S.lily[o.seed % 2], x: Math.round(o.px) - 9, y: Math.round(o.py) - 6, bob: o.seed }); break;
        case 'house': list.push({ img: S.house.day, glow: S.house.night, x: o.x * T, y: by(o) - 148, sy: by(o) - 2, tall: true });
          this.lights.push({ x: o.x * T + 38, y: by(o) - 50, r: 60, c: [255, 190, 100] }, { x: o.x * T + 122, y: by(o) - 50, r: 60, c: [255, 190, 100] }, { x: o.x * T + 80, y: by(o) - 30, r: 40, c: [255, 180, 90] });
          break;
        case 'barn': list.push({ img: S.barn.day, glow: S.barn.night, x: o.x * T - 2, y: by(o) - 150, sy: by(o) - 2, tall: true }); this.lights.push({ x: o.x * T + 64, y: by(o) - 110, r: 46, c: [255, 190, 100] }); break;
        case 'stall': list.push({ img: S.stall, x: o.x * T, y: by(o) - 110, sy: by(o) - 4, tall: true }); break;
        case 'well': list.push({ img: S.well, x: o.x * T + 4, y: by(o) - 72, sy: by(o) - 4, tall: true }); break;
        case 'lamp': list.push({ img: S.lamp.day, glow: S.lamp.night, x: cx(o) - 10, y: by(o) - 66, sy: by(o) - 4, tall: true, shadow: 's', sx: cx(o), shy: by(o) - 4 }); this.lights.push({ x: cx(o), y: by(o) - 56, r: 92, c: [255, 200, 120], lamp: true }); break;
        case 'sign': list.push({ img: S.sign, x: cx(o) - 18, y: by(o) - 36, sy: by(o) - 4 }); break;
        case 'mailbox': list.push({ img: S.mailbox, x: cx(o) - 10, y: by(o) - 36, sy: by(o) - 4 }); break;
        case 'trough': list.push({ trough: true, x: o.x * T + 2, y: by(o) - 26, sy: by(o) - 4 }); break;
        case 'fence': list.push({ img: S.fence[o.mask], x: o.x * T, y: by(o) - 42, sy: by(o) - 6 }); break;
      }
    }
    this.statics = list;
    this.decals = decals;
  }

  /* ─────────── 한 장면 그리기 ─────────── */
  render(game, dt) {
    this.t += dt;
    // 자동 품질: 3초 평균이 40fps 아래면 블룸 → 흐림 순서로 끔 (직접 켜고 끈 뒤에는 건드리지 않음)
    if (this.auto && dt > 0) {
      this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
      if (this.fpsAcc > 3) {
        const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
        if (fps < 40) { if (this.fx.bloom) this.fx.bloom = false; else if (this.fx.dof) this.fx.dof = false; else this.auto = false; }
      }
    }
    const S = this.S, g = this.lg, VW = this.VW, VH = this.VH;
    const WW = MW * T, WH = MH * T;
    const focus = game.cameraFocus(dt);
    let cfx = focus.x - VW / 2, cfy = focus.y - VH / 2;
    cfx = VW >= WW ? (WW - VW) / 2 : Math.max(0, Math.min(WW - VW, cfx));
    cfy = VH >= WH ? (WH - VH) / 2 : Math.max(0, Math.min(WH - VH, cfy));
    const camX = Math.floor(cfx), camY = Math.floor(cfy);
    const fracX = cfx - camX, fracY = cfy - camY;
    this.camX = camX; this.camY = camY; this.camFX = cfx; this.camFY = cfy;
    const night = nightness(game.time);
    const rain = game.raining ? 1 : 0;

    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = '#173d30'; g.fillRect(0, 0, VW, VH);
    g.drawImage(this.groundC, camX, camY, VW, VH, 0, 0, VW, VH);
    // 물: 거품 번갈아 + 반짝임 줄
    g.drawImage(this.foam[Math.floor(this.t * 1.6) % 2], camX, camY, VW, VH, 0, 0, VW, VH);
    g.fillStyle = `rgb(${rampRGB('water', 5)})`;
    for (const p of this.glints) {
      const k = Math.sin(this.t * 1.7 + p.ph);
      if (k < 0.55) continue;
      const len = Math.round(p.len * (k - 0.55) / 0.45) + 1;
      g.fillRect(p.x - camX - (len >> 1), p.y - camY, len, 1);
    }
    for (const d of this.decals) g.drawImage(d.img, d.x - camX, d.y - camY + (d.bob ? Math.round(Math.sin(this.t * 1.2 + d.bob) * 0.6) : 0));

    // 밭 (바닥에 붙은 층)
    const farm = game.farm;
    const drawables = [];
    for (let i = 0; i < farm.plots.length; i++) {
      const p = farm.plots[i];
      const px = (PLOTS.x + (i % PLOTS.cols)) * T - camX, py = (PLOTS.y + Math.floor(i / PLOTS.cols)) * T - camY;
      if (px < -T || py < -64 || px > VW || py > VH + T) continue;
      if (p.state !== 'empty') g.drawImage(S.soil[p.water > 0 ? 1 : 0], px, py);
      else g.drawImage(S.plotMark, px, py);
      if (p.state === 'growing' || p.state === 'ready') {
        const st = farm.stage(i);
        const img = S.crop[p.crop][p.giant && st === 2 ? 3 : st];
        drawables.push({ img, x: px + camX, y: py + camY - 12, sy: py + camY + 28 });
        if (p.weeds) g.drawImage(S.weeds, px, py);
        if (st === 2 && Math.floor(this.t * 2 + i) % 5 === 0) drawables.push({ img: S.sparkle[Math.floor(this.t * 8) % 4], x: px + camX + 10 + (i * 7) % 12, y: py + camY - 6, sy: py + camY + 40 });
      }
    }

    // 고정 소품 + 움직이는 것들
    for (const d of this.statics) if (d.x - camX < VW + 40 && d.x - camX > -180 && d.y - camY < VH + 20 && d.sy - camY > -10) drawables.push(d);
    for (const e of game.drawEntities()) drawables.push(e);
    drawables.sort((a, b) => a.sy - b.sy);

    // 그림자 먼저 (반투명 한 층)
    g.globalAlpha = 0.28;
    for (const d of drawables) if (d.shadow) { const sh = S.shadow[d.shadow]; g.drawImage(sh, Math.round(d.sx - camX - sh.width / 2), Math.round(d.shy - camY - sh.height / 2)); }
    g.globalAlpha = 1;
    let playerD = null, playerIdx = -1;
    const glowList = [];
    drawables.forEach((d, idx) => {
      let img = d.img;
      let x = Math.round(d.x - camX), y = Math.round(d.y - camY);
      if (d.crown) {
        const t = d.o?.shaken && d.set === S.tree.fruit[d.o.fruit] ? S.tree.fruit[d.o.fruit + '_bare'] : d.set;
        img = t.crown;
        // 바람: 1px 좌우 흔들림 (비·바람 오면 더)
        const sway = Math.sin(this.t * (rain ? 2.2 : 1.1) + d.ph) * (rain ? 1.6 : 0.9) + (d.o?.shakeT > 0 ? Math.sin(d.o.shakeT * 40) * 2 : 0);
        x += Math.round(sway);
      }
      if (d.trough) img = S.trough[game.ranch.trough > 0 ? 1 : 0];
      if (!img) return;
      if (d.alpha !== undefined) g.globalAlpha = d.alpha;
      if (d.flash) g.filter = 'brightness(1.6)';
      g.drawImage(img, x, y);
      if (d.flash) g.filter = 'none';
      g.globalAlpha = 1;
      if (d.glow && night > 0.01) glowList.push([d.glow, x, y]);
      if (d.player) { playerD = { d, x, y, img }; playerIdx = idx; }
      if (d.bubble) { const b = S.bubble[d.bubble]; if (b) g.drawImage(b, x + (img.width >> 1) - 8, y - 12 + Math.round(Math.sin(this.t * 5) * 1)); }
    });
    // 큰 것에 가려진 주인공: 반투명 실루엣으로 한 번 더
    if (playerD) {
      const { x, y, img } = playerD;
      const covered = drawables.slice(playerIdx + 1).some((d) => d.tall && (d.img || d.set) && x + 30 > d.x - camX && x + 10 < d.x - camX + (d.img || d.set.crown).width && y + 40 > d.y - camY && y < d.y - camY + (d.img || d.set.crown).height - 8);
      if (covered) { g.globalAlpha = 0.42; g.drawImage(img, x, y); g.globalAlpha = 1; }
    }

    // 낚시찌·효과
    game.drawOverlay(g, camX, camY, this.t);
    this.updateParticles(game, dt, night, camX, camY);
    for (const p of this.particles) {
      if (p.kind === 'leaf') { g.fillStyle = p.col; g.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 2, 1); g.fillRect(Math.round(p.x - camX) + (Math.sin(p.a) > 0 ? 1 : 0), Math.round(p.y - camY) - 1, 1, 1); }
      else if (p.kind === 'dust') { g.globalAlpha = 0.5 * p.life; g.fillStyle = '#fff6d8'; g.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 1, 1); g.globalAlpha = 1; }
      else if (p.kind === 'puff') { g.globalAlpha = 0.6 * p.life; g.fillStyle = `rgb(${rampRGB('path', 4)})`; g.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 2, 2); g.globalAlpha = 1; }
      else if (p.kind === 'drop') { g.fillStyle = `rgb(${rampRGB('water', 4)})`; g.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 1, 2); }
      else if (p.kind === 'icon') { g.globalAlpha = Math.min(1, p.life * 2); g.drawImage(p.img, Math.round(p.x - camX - 8), Math.round(p.y - camY - 8)); g.globalAlpha = 1; }
    }

    // ── 조명: 주변광(곱하기) + 등불(더하기) ──
    const amb = ambientAt(game.time);
    const dim = rain ? 0.78 : 1;
    const lt = this.lt;
    lt.globalCompositeOperation = 'source-over';
    lt.fillStyle = `rgb(${amb[0] * dim | 0},${amb[1] * dim | 0},${Math.min(255, amb[2] * dim * (rain ? 1.08 : 1)) | 0})`;
    lt.fillRect(0, 0, VW, VH);
    // 흘러가는 구름 그림자 (낮)
    if (night < 0.6) {
      for (let k = 0; k < 4; k++) {
        const cxw = ((this.t * 9 + k * 520) % (WW + 600)) - 300, cyw = (k * 337 + 140) % WH;
        const x = cxw - camX, y = cyw - camY;
        if (x < -260 || x > VW + 260 || y < -200 || y > VH + 200) continue;
        const gr = lt.createRadialGradient(x, y, 10, x, y, 200);
        gr.addColorStop(0, `rgba(40,50,110,${0.16 * (1 - night)})`); gr.addColorStop(1, 'rgba(40,50,110,0)');
        lt.fillStyle = gr; lt.fillRect(x - 200, y - 200, 400, 400);
      }
    }
    if (night > 0.02) {
      lt.globalCompositeOperation = 'lighter';
      const lights = [...this.lights, ...game.extraLights()];
      for (const L of lights) {
        const x = L.x - camX, y = L.y - camY;
        if (x < -L.r || y < -L.r || x > VW + L.r || y > VH + L.r) continue;
        const flick = L.lamp ? 1 + Math.sin(this.t * 7 + L.x) * 0.03 : 1;
        const k = night * (L.k ?? 1);
        const gr = lt.createRadialGradient(x, y, 0, x, y, L.r * flick);
        gr.addColorStop(0, `rgba(${L.c[0] * k | 0},${L.c[1] * k | 0},${L.c[2] * k | 0},1)`);
        gr.addColorStop(0.45, `rgba(${L.c[0] * k * 0.5 | 0},${L.c[1] * k * 0.42 | 0},${L.c[2] * k * 0.3 | 0},1)`);
        gr.addColorStop(1, 'rgba(0,0,0,1)');
        lt.fillStyle = gr; lt.fillRect(x - L.r, y - L.r, L.r * 2, L.r * 2);
      }
    }
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.light, 0, 0);
    g.globalCompositeOperation = 'source-over';
    // 빛나는 창문·등 (조명 뒤에 = 어둠 속에서도 밝게)
    const gg = this.gg;
    gg.clearRect(0, 0, VW, VH);
    if (night > 0.01) {
      g.globalAlpha = night; gg.globalAlpha = night;
      for (const [img, x, y] of glowList) { g.drawImage(img, x, y); gg.drawImage(img, x, y); }
      g.globalAlpha = 1; gg.globalAlpha = 1;
    }
    game.drawGlow(g, gg, camX, camY, this.t, night);

    // 비
    if (rain) this.drawRain(g, dt);

    // ── 화면 출력 + HD-2D 후처리 ──
    const ctx = this.ctx, sc = this.scale;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const ox = -Math.round(fracX * sc), oy = -Math.round(fracY * sc);
    ctx.drawImage(this.low, ox, oy, VW * sc, VH * sc);
    if (this.filterOK && this.fx.dof) {
      const bg = this.bg;
      bg.globalCompositeOperation = 'source-over';
      const bw = this.blurC.width, bh = this.blurC.height;
      bg.clearRect(0, 0, bw, bh);
      bg.filter = 'blur(0.6px)'; bg.drawImage(this.low, 0, 0, bw, bh); bg.filter = 'none';
      bg.globalCompositeOperation = 'destination-in'; bg.fillStyle = this.dofGrad; bg.fillRect(0, 0, bw, bh);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(this.blurC, ox, oy, VW * sc, VH * sc); ctx.imageSmoothingEnabled = false;
    }
    if (this.filterOK && this.fx.bloom) {
      const bl = this.bl, bw = this.bloomC.width, bh = this.bloomC.height;
      bl.globalCompositeOperation = 'source-over';
      bl.clearRect(0, 0, bw, bh);
      bl.filter = `brightness(${0.9 + night * 0.2}) contrast(${2.4 - night}) blur(1.5px)`; bl.drawImage(this.low, 0, 0, bw, bh);
      bl.filter = 'blur(2px)'; bl.globalCompositeOperation = 'lighter'; bl.drawImage(this.glowC, 0, 0, bw, bh); bl.drawImage(this.glowC, 0, 0, bw, bh);
      bl.filter = 'none';
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.2 + night * 0.35;
      ctx.drawImage(this.bloomC, ox, oy, VW * sc, VH * sc);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
    }
    if (this.fx.vignette) { ctx.fillStyle = this.vignette; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
  }

  drawRain(g, dt) {
    const VW = this.VW, VH = this.VH;
    while (this.rain.length < 160) this.rain.push({ x: Math.random() * (VW + 60), y: Math.random() * VH, v: 260 + Math.random() * 120, l: 5 + Math.random() * 4, gy: Math.random() * VH });
    g.globalAlpha = 0.18; g.fillStyle = '#3a4a78'; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1;
    g.fillStyle = 'rgba(190,220,255,0.55)';
    for (const r of this.rain) {
      r.y += r.v * dt; r.x -= r.v * dt * 0.28;
      if (r.y > r.gy) {
        g.fillStyle = 'rgba(210,235,255,0.6)'; g.fillRect(Math.round(r.x) - 1, Math.round(r.gy), 3, 1); g.fillStyle = 'rgba(190,220,255,0.55)';
        r.y = -10; r.x = Math.random() * (VW + 60); r.gy = Math.random() * VH;
      }
      for (let k = 0; k < r.l; k++) g.fillRect(Math.round(r.x + k * 0.28), Math.round(r.y - k), 1, 1);
    }
  }

  updateParticles(game, dt, night, camX, camY) {
    const VW = this.VW, VH = this.VH;
    // 떠다니는 빛 먼지(낮) · 떨어지는 잎
    if (night < 0.5 && Math.random() < dt * 6) this.particles.push({ kind: 'dust', x: camX + Math.random() * VW, y: camY + Math.random() * VH, vx: 3 + Math.random() * 4, vy: -2 - Math.random() * 3, life: 1, decay: 0.25 });
    if (Math.random() < dt * 0.8) this.particles.push({ kind: 'leaf', x: camX + Math.random() * VW, y: camY - 4, vx: 6 + Math.random() * 8, vy: 14 + Math.random() * 8, a: 0, life: 1, decay: 0.09, col: Math.random() < 0.5 ? `rgb(${rampRGB('fol', 4)})` : `rgb(${rampRGB('flowr', 3)})` });
    for (const p of game.takeParticles()) this.particles.push(p);
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.decay * dt;
      if (p.kind === 'leaf') { p.a += dt * 3; p.vx = 6 + Math.sin(p.a) * 14; }
      if (p.grav) p.vy += p.grav * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < camY + VH + 20).slice(-260);
  }

  /** 화면 좌표(CSS px) → 월드 타일 */
  screenToTile(cx, cy) {
    const dpr = this.canvas.width / innerWidth;
    const lx = (cx * dpr) / this.scale + (this.camFX ?? this.camX), ly = (cy * dpr) / this.scale + (this.camFY ?? this.camY);
    return { x: Math.floor(lx / T), y: Math.floor(ly / T), px: lx, py: ly };
  }
}
