import { josa } from '../game/sim/josa.js';
import { LAYOUT } from '../game/world.js';
import { HILLS } from '../game/terrain.js';
import { touchUI } from '../game/input.js';
import { BUSY_TRAVEL, BUSY_TOAST } from '../game/game_travel.js';
import { icoBitmap, ico } from './icons.js';

/** 빠른 이동 장소 (지도 아래 버튼) — x,z 는 도착 지점(길 위). name 은 알림용(이모지 포함), ico 는 버튼의 자체 아이콘 */
export const PLACES = [
  { id: 'farm', name: '🌱 농장', ico: 'sprout', x: 0, z: 6.5 },
  { id: 'market', name: '🛒 장터', ico: 'market', x: 0, z: -7 },
  { id: 'ranch', name: '🐄 목장', ico: 'cow', x: 14, z: 3 },
  { id: 'paddy', name: '🌾 논', ico: 'wheat', x: 0, z: -15.5 },
  { id: 'smartfarm', name: '📱 스마트팜', ico: 'flask', x: -15.5, z: -6 },
  { id: 'pond', name: '🌸 연못', ico: 'lotus', x: -7.3, z: 13.4 },
  { id: 'lake', name: '🎣 낚시터', ico: 'rod', x: -12.5, z: 22.4 },
  { id: 'field', name: '🚜 밭갈이', ico: 'tractor', x: 26, z: 15 },
  { id: 'koat', name: '🏢 KOAT 체험관', ico: 'koat', x: 25, z: -24 },
  { id: 'town', name: '🏗️ 새 마을', ico: 'hammer', x: -21.5, z: 4.6 },
  { id: 'home', name: '🏠 우리 집', ico: 'home', x: 2.6, z: 15.2 },
];

/** 버튼 글: 앞 이모지를 빼고 (이름은 알림에 그대로 씀) */
export const placeLabel = (pl) => pl.name.replace(/^\S+\s+/u, '');
/** 지도 아래 장소 버튼 HTML: 자체 아이콘 + 이름 */
export const placeChipHtml = (pl) => `${ico(pl.ico)}<span>${placeLabel(pl)}</span>`;

/** 지도 한 변의 세계 범위 (가장자리 여유 4m) */
export const mapScale = (S) => { const B = LAYOUT.bounds + 4; return { B, k: S / (B * 2) }; };

/** 지도 위 누른 점(요소 안 px, 요소 크기 w·h) → 세계 좌표. S: 지도 논리 크기 (화면 배율과 무관) */
export function mapToWorld(px, py, w, h, S) {
  const { B, k } = mapScale(S);
  return { x: (px / w) * S / k - B, z: (py / h) * S / k - B };
}

/** 캐릭터가 보는 방향(facing: atan2(dx, dz)) → 위(-y)를 향한 화살표를 돌릴 각도 (캔버스는 x 오른쪽, y 아래 = 세계 z) */
export const arrowAngle = (facing) => Math.PI - facing;

/** 캔버스 픽셀 배율: 화면 배율 × 기기 배율, 상한 2 (낮음 품질 1.5) */
export const mapDpr = (dpr, low) => Math.max(1, Math.min(dpr || 1, low ? 1.5 : 2));

const LABEL_TRY = ['below', 'above', 'right', 'left'];
/** 이름표가 제자리에서 이만큼(px) 넘게 떨어지면 가는 선으로 이어 줌 */
export const LEADER_PX = 20;
/**
 * 이름표 놓기: 앞 순서(중요한 곳)부터 (넓은 구역 inside 는 한가운데 먼저) 아래·위·오른쪽·왼쪽 순으로 자리를 찾고,
 * 이미 놓인 이름표·avoid 상자(나 화살표 등)와 겹치거나 지도 밖이면 건너뜀
 * labels: [{ text, x, y, r, inside }] (r: 표시 반지름, 이름표가 떨어질 거리), measure(text) → 너비, h: 글자 높이
 * @returns [{ text, x, y, w, h, ax, ay, lead }] (x·y: 글 가운데, ax·ay: 원래 자리, lead: 이어 줄 선이 필요함)
 */
export function placeLabels(labels, measure, h, S, pad = 2, avoid = []) {
  const out = [];
  const hit = (a) => out.concat(avoid).some((b) => Math.abs(a.x - b.x) * 2 < a.w + b.w + pad * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + pad * 2);
  for (const L of labels) {
    const w = measure(L.text), r = L.r ?? 4;
    for (const side of L.inside ? ['center', ...LABEL_TRY] : LABEL_TRY) {
      const c = side === 'center' ? { x: L.x, y: L.y }
        : side === 'below' ? { x: L.x, y: L.y + r + h / 2 }
          : side === 'above' ? { x: L.x, y: L.y - r - h / 2 }
            : side === 'right' ? { x: L.x + r + w / 2 + 2, y: L.y } : { x: L.x - r - w / 2 - 2, y: L.y };
      const a = { text: L.text, x: c.x, y: c.y, w, h, ax: L.x, ay: L.y };
      if (a.x - w / 2 < 1 || a.x + w / 2 > S - 1 || a.y - h / 2 < 1 || a.y + h / 2 > S - 1) continue;
      if (hit(a)) continue;
      a.lead = Math.hypot(a.x - L.x, a.y - L.y) > LEADER_PX;
      out.push(a);
      break;
    }
  }
  return out;
}

/** 화면 배율 (글자 크기 설정 zoom 등): 테두리 포함 실제 폭 / 테두리 포함 레이아웃 폭. hover 확대(transform)는 offsetWidth 에 들어가지 않음 */
export function mapZoom(rectW, offsetW) {
  return rectW > 0 && offsetW > 0 ? rectW / offsetW : 1;
}

/** 작은 지도에서 이보다 작게(px) 보이는 잔 시설은 그리지 않음 (뜻 없는 점이 되므로) */
export const MIN_PROP_PX = 6;

/**
 * 물가 모양: world.shoreShape(id) 가 주는 점 목록([[x,z]…] 또는 [{x,z}…])을 [[x,z]…] 로, 없거나 너무 적으면 null (동그라미로 그림)
 */
export function shorePoints(shape) {
  if (!Array.isArray(shape) || shape.length < 3) return null;
  const pts = shape.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p?.x, p?.z]));
  return pts.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)) ? pts : null;
}

/** 우상단 미니맵 (2D 캔버스). 누르면 큰 지도가 열리고, 큰 지도에서 원하는 곳을 누르면 그곳으로 이동 */
export class Minimap {
  constructor(game, root) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = this.canvas.height = 150;
    this.canvas.title = '지도 열기 (M)';
    this.canvas.setAttribute?.('aria-label', '지도 열기');
    this.canvas.addEventListener('click', () => this.openBig());
    root.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.acc = 0;
    this.big = null;
    this.small = this._view(this.canvas, 150);
    this._watch(this.small);
  }

  /** 캔버스 하나의 그리기 상태 (논리 크기 S, 픽셀 배율 k, 고정 그림 캐시) */
  _view(cv, fallback) { return { cv, ctx: cv.getContext('2d'), fallback, S: 0, k: 0, cache: null, key: '' }; }

  /** 보이는 크기가 바뀌면 다시 맞춤 */
  _watch(v) {
    const RO = globalThis.ResizeObserver;
    if (RO) { v.ro = new RO(() => { v.S = 0; }); v.ro.observe(v.cv); }
    else globalThis.addEventListener?.('resize', () => { v.S = 0; });
  }

  /** 캔버스 픽셀 크기를 보이는 크기 × 배율로 (글자 크기 설정 zoom 포함) */
  _fit(v) {
    const cv = v.cv, css = cv.clientWidth || v.fallback;
    const ob = cv.offsetWidth || css; // 테두리 포함, transform 무시
    const zoom = mapZoom(cv.getBoundingClientRect?.().width || ob, ob);
    const low = this.game.quality?.level === 'low';
    const k = +(mapDpr((globalThis.devicePixelRatio || 1) * zoom, low)).toFixed(3);
    if (v.S === css && v.k === k) return;
    v.S = css; v.k = k; v.key = '';
    const px = Math.round(css * k);
    if (cv.width !== px) { cv.width = px; cv.height = px; }
  }

  update(dt) {
    this.acc += dt;
    if (this.acc < 0.2) return;
    this.acc = 0;
    if (globalThis.document?.body?.classList?.contains?.('cine')) return; // 컷신 중에는 숨겨져 있음
    this.render(this.small, false);
    if (this.big && this.game.ui.panel?.dataset.kind === 'map') this.render(this.bigV, true);
    else { this.bigV?.ro?.disconnect(); this.big = null; this.bigV = null; }
  }

  /** 지금 서 있는 곳 (운전 중이면 탈것, 집 안이면 집 앞) */
  _me() {
    const g = this.game;
    return g.ride?.driving ? g.ride.riderGroup.position : g.home?.inside ? g.home.outPos : g.player.position;
  }

  /** 고정 그림 캐시가 낡았는가: 크기·마을 공사·전망대 발견이 바뀌면 다시 그림 */
  _staticKey(v, big) {
    const g = this.game;
    let k = `${v.S}|${v.k}|${big ? 1 : 0}|${g.season?.season?.id ?? g.season?.cur ?? ''}|${this._icoGen || 0}|`;
    for (const [i] of LAYOUT.town.sites.entries()) k += g.town?.sim.sites[i]?.state === 'empty' || !g.town ? '0' : '1';
    if (big || v.S >= 120) for (const H of HILLS) k += g.explore?.seen?.[H.id] ? 'y' : 'n';
    return k;
  }

  render(v, big) {
    this._fit(v);
    const key = this._staticKey(v, big);
    if (key !== v.key || !v.cache) {
      v.key = key;
      v.cache ||= document.createElement('canvas');
      v.cache.width = v.cv.width; v.cache.height = v.cv.height;
      const cc = v.cache.getContext('2d');
      cc.setTransform(v.k, 0, 0, v.k, 0, 0);
      this.drawStatic(cc, v.S, big);
    }
    const c = v.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, v.cv.width, v.cv.height);
    c.drawImage(v.cache, 0, 0);
    c.setTransform(v.k, 0, 0, v.k, 0, 0);
    this.drawDynamic(c, v.S, big);
  }

  /** 지도 한 장에서 쓰는 크기 배율 (작은 지도 150px = 1, 큰 지도 440px = 2.2) */
  _ui(S, big) { return big ? S / 200 : Math.max(0.75, S / 150); }

  /** 바뀌지 않는 그림: 바탕·언덕·길·구역·새 마을 부지 (+큰 지도 이름표) */
  drawStatic(c, S, big) {
    const ui = this._ui(S, big);
    const { B, k } = mapScale(S);
    const X = (x) => (x + B) * k, Z = (z) => (z + B) * k;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#8ccf5a';
    c.beginPath(); c.roundRect(0, 0, S, S, 16 * ui); c.fill();
    const L = LAYOUT;
    const rect = (x0, z0, x1, z1, col) => { c.fillStyle = col; c.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); };
    // 잔 시설: 작은 지도에서 MIN_PROP_PX 보다 작으면 생략
    const prop = (x0, z0, x1, z1, col) => { if (big || Math.max(x1 - x0, z1 - z0) * k >= MIN_PROP_PX) rect(x0, z0, x1, z1, col); };
    // 언덕: 등고선처럼 겹친 원 (+ 작은 지도는 폰이 아니면 산 표시, 다녀온 곳은 깃발 꽂힌 산). 자체 아이콘 그림 (굵은 지도용)
    const hillIcon = big || S >= 120;
    const ipx = Math.round(12 * ui);
    for (const H of HILLS) {
      for (let ring = 3; ring >= 1; ring--) {
        c.fillStyle = `rgba(${70 + ring * 6}, ${120 + ring * 8}, 60, ${0.14 + (3 - ring) * 0.08})`;
        c.beginPath(); c.arc(X(H.x), Z(H.z), H.r * (ring / 3) * k, 0, 7); c.fill();
      }
      if (hillIcon) {
        const seen = this.game.explore?.seen?.[H.id];
        // 그림이 아직 안 읽혔으면 이번엔 건너뛰고, 읽히면 고정 그림을 다시 그림 (_staticKey 의 그림 준비 표시가 바뀜)
        const b = icoBitmap(seen ? 'pin-view' : 'pin-hill', Math.round(ipx * 2), () => { this._icoGen = (this._icoGen || 0) + 1; });
        if (b?.ready) c.drawImage(b.img, X(H.x) - ipx / 2, Z(H.z) - ipx / 2, ipx, ipx);
      }
    }
    // 흙길
    c.strokeStyle = 'rgba(232,210,160,0.9)'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const p of L.paths) { c.lineWidth = p.w * k; c.beginPath(); p.pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.stroke(); }
    const f = L.farm, fw = f.cols * f.tile / 2, fh = f.rows * f.tile / 2;
    rect(f.origin.x - fw, f.origin.z - fh, f.origin.x + fw, f.origin.z + fh, '#8a5a3c');
    rect(L.ranch.x0, L.ranch.z0, L.ranch.x1, L.ranch.z1, 'rgba(255,255,255,0.25)');
    rect(L.barn.x - 3, L.barn.z - 3, L.barn.x + 3, L.barn.z + 3, '#d9534f');
    rect(L.smartfarm.x - 4, L.smartfarm.z - 4.5, L.smartfarm.x + 4, L.smartfarm.z + 4.5, '#eaf7ff');
    const fd = L.field; rect(fd.x0, fd.z0, fd.x0 + fd.cols * fd.cell, fd.z0 + fd.rows * fd.cell, '#b08a5a');
    rect(L.market.x - 1.5, L.market.z - 0.6, L.market.x + 1.5, L.market.z + 0.6, '#e35d5d');
    // 연못·호수: 물가 모양이 있으면 그 모양, 없으면 동그라미
    c.fillStyle = '#6fc3e8';
    for (const [id, w] of [['pond', L.pond], ['lake', L.lake]]) {
      const pts = shorePoints(this.game.world?.shoreShape?.(id));
      c.beginPath();
      if (pts) { pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.closePath(); }
      else c.arc(X(w.x), Z(w.z), w.r * k, 0, 7);
      c.fill();
    }
    for (const b of L.lake.pier) rect(b.x0, b.z0, b.x1, b.z1, '#b08457');
    prop(L.ranchWork.x - 1.4, L.ranchWork.z - 1.4, L.ranchWork.x + 1.4, L.ranchWork.z + 1.4, '#f2c84b');
    prop(L.craft.jars.x - 1.7, L.craft.jars.z - 0.8, L.craft.jars.x + 1.7, L.craft.jars.z + 0.8, '#5a3523');
    prop(L.craft.compost.x - 0.6, L.craft.compost.z - 0.6, L.craft.compost.x + 0.6, L.craft.compost.z + 0.6, '#4a3322');
    prop(L.lake.shop.x - 1.2, L.lake.shop.z - 1.2, L.lake.shop.x + 1.2, L.lake.shop.z + 1.2, '#3a8fd8');
    const pd = L.paddy; rect(pd.x0, pd.z0, pd.x0 + pd.cols * (pd.size + pd.bund) + pd.bund, pd.z0 + pd.rows * (pd.size + pd.bund) + pd.bund, '#5fa3b0');
    const kr = L.koat.rect; rect(kr[0], kr[1], kr[2], kr[3], 'rgba(48,182,170,0.55)');
    rect(L.home.x - 2, L.home.z - 1.6, L.home.x + 2, L.home.z + 1.6, '#2fa89c'); // 유니코 집 (청록 지붕)
    // 새 마을 부지: 빈 부지는 옅은 흙색, 지은 건물은 주황
    for (const [i, st] of L.town.sites.entries()) { const done = this.game.town?.sim.sites[i]?.state !== 'empty' && this.game.town; prop(st.x - 1.8, st.z - 1.8, st.x + 1.8, st.z + 1.8, done ? '#f2a33a' : 'rgba(160,120,70,0.45)'); }
    if (big) { c.fillStyle = '#e0413a'; for (const o of L.orchard) { c.beginPath(); c.arc(X(o.x), Z(o.z), 2.2 * ui, 0, 7); c.fill(); } }
    else { c.fillStyle = 'rgba(224,65,58,0.22)'; for (const o of L.orchard) { c.beginPath(); c.arc(X(o.x), Z(o.z), 2.2 * k, 0, 7); c.fill(); } } // 작은 지도: 과수원은 옅은 빛만
  }

  /** 큰 지도 이름표: 중요한 곳부터 (넓은 구역은 한가운데 먼저), 겹치면 다른 쪽, 그래도 겹치면 생략. 크림색 테두리로 바탕 위에서도 읽히게
   * avoid: 이름표가 덮지 않을 상자 (나 화살표). 멀리 밀려난 이름표는 가는 선으로 제자리와 이음 */
  _labels(c, S, ui, X, Z, avoid = []) {
    const L = LAYOUT, f = L.farm, fd = L.field, pd = L.paddy, kr = L.koat.rect, k = mapScale(S).k;
    const at = (text, x, z, r, inside = false) => ({ text, x: X(x), y: Z(z), r: r * k, inside });
    const list = [
      at('농장', f.origin.x, f.origin.z, f.rows * f.tile / 2, true),
      at('장터', L.market.x, L.market.z, 1.2),
      at('목장', (L.ranch.x0 + L.ranch.x1) / 2, (L.ranch.z0 + L.ranch.z1) / 2, (L.ranch.z1 - L.ranch.z0) / 2, true),
      at('논', pd.x0 + pd.cols * (pd.size + pd.bund) / 2, pd.z0 + pd.rows * (pd.size + pd.bund) / 2, pd.rows * (pd.size + pd.bund) / 2, true),
      at('우리 집', L.home.x, L.home.z, 1.8),
      at('KOAT', (kr[0] + kr[2]) / 2, (kr[1] + kr[3]) / 2, 0.5, true),
      at('스마트팜', L.smartfarm.x, L.smartfarm.z, 4.6, true),
      at('낚시터', L.lake.x, L.lake.z, L.lake.r, true),
      at('밭갈이', fd.x0 + fd.cols * fd.cell / 2, fd.z0 + fd.rows * fd.cell / 2, fd.rows * fd.cell / 2, true),
      at('연못', L.pond.x, L.pond.z, L.pond.r),
      at('과수원', 9, -11.5, 1.5),
      at('새 마을', -28, 11, 2),
      ...HILLS.map((H) => at(H.name, H.x, H.z, 2.5)),
    ];
    const h = 9 * ui;
    c.font = `bold ${h}px 'Unico Coin', Jua, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const placed = placeLabels(list, (t) => c.measureText(t).width, h, S, 2, avoid);
    c.strokeStyle = 'rgba(35,25,22,0.55)'; c.lineWidth = 1;
    for (const p of placed) {
      if (!p.lead) continue;
      const ex = p.x + Math.sign(p.ax - p.x) * Math.min(Math.abs(p.ax - p.x), p.w / 2), ey = p.y + Math.sign(p.ay - p.y) * Math.min(Math.abs(p.ay - p.y), p.h / 2);
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(p.ax, p.ay); c.stroke();
    }
    for (const p of placed) {
      c.strokeStyle = 'rgba(255,247,225,0.92)'; c.lineWidth = 3.2 * ui / 2.2 * 1.6;
      c.strokeText(p.text, p.x, p.y);
      c.fillStyle = '#231916'; c.fillText(p.text, p.x, p.y);
    }
  }

  /** 움직이는 것: 주민·해로운 동물·다른 플레이어·목표 고리·나 (+큰 지도: 카메라 시야, 가려는 곳) */
  drawDynamic(c, S, big) {
    const g = this.game, ui = this._ui(S, big);
    const { B, k } = mapScale(S);
    const X = (x) => (x + B) * k, Z = (z) => (z + B) * k;
    const dot = (x, z, r) => { c.beginPath(); c.arc(X(x), Z(z), r, 0, 7); c.fill(); };
    // 주민 (역할 색)
    const npcCol = { merchant: '#f28c28', researcher: '#8e7cc3', guide: '#6dbb4f', granny: '#a3a9b0', kid: '#f28bb0', fisher: '#3170c9' };
    for (const e of g.npcs?.list || []) { const p = e.u.group.position; c.fillStyle = npcCol[e.id] || '#fff'; dot(p.x, p.z, 2.6 * ui); }
    c.fillStyle = '#e8495a';
    for (const q of g.pests?.markers?.() || []) dot(q.x, q.z, 3.2 * ui);
    c.fillStyle = '#4a90d9';
    for (const r of g.net?.remote?.values?.() || []) { const p = r.unico.group.position; dot(p.x, p.z, 2.5 * ui); }
    // 지금 목표 (밭 한 칸·장소): 금빛 겹고리, 천천히 숨 쉬듯 (지도 밖이면 표시 안 함)
    const t = g.guide?.target, me = this._me();
    if (t && Math.abs(t.x) < B && Math.abs(t.z) < B) {
      const near = Math.hypot(X(t.x) - X(me.x), Z(t.z) - Z(me.z)) < 8 * ui; // 목표가 바로 곁이면 화살표 뒤에 옅게
      if (near) c.globalAlpha = 0.4;
      const pulse = 0.5 + 0.5 * Math.sin((globalThis.performance?.now?.() || 0) / 260);
      c.strokeStyle = '#231916'; c.lineWidth = 2.6 * ui;
      c.beginPath(); c.arc(X(t.x), Z(t.z), (4.2 + pulse * 1.2) * ui, 0, 7); c.stroke();
      c.strokeStyle = '#ffd34d'; c.lineWidth = 1.5 * ui;
      c.beginPath(); c.arc(X(t.x), Z(t.z), (4.2 + pulse * 1.2) * ui, 0, 7); c.stroke();
      c.beginPath(); c.arc(X(t.x), Z(t.z), (7.4 + pulse * 1.6) * ui, 0, 7); c.globalAlpha *= 0.55; c.stroke(); c.globalAlpha = 1;
    }
    const p = me, px = X(p.x), pz = Z(p.z);
    // 큰 지도: 카메라가 보는 쪽 부채꼴 (60°)
    if (big && g.followCam) {
      const a = arrowAngle(g.followCam.yaw + Math.PI) - Math.PI / 2, half = Math.PI / 6, R = 26 * ui;
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.2; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(px, pz); c.arc(px, pz, R, a - half, a + half); c.closePath(); c.fill(); c.stroke();
    }
    // 큰 지도 이름표: 나 화살표 자리를 비워 두고 놓음 (나는 움직이니 고정 그림이 아니라 여기서)
    if (big) { const s0 = 5.5 * ui * 1.4; this._labels(c, S, ui, X, Z, [{ x: px, y: pz, w: s0 * 2, h: s0 * 2 }]); }
    // 나: 보는 쪽을 가리키는 금빛 화살표 (운전 중이면 탈것 방향)
    const facing = g.ride?.driving ? g.ride.vehicle?.heading : g.player?.unico?.facing;
    const s = (big ? 5.5 : 5.2) * ui;
    c.save();
    c.translate(px, pz);
    c.rotate(arrowAngle(Number.isFinite(facing) ? facing : Math.PI));
    c.beginPath(); c.moveTo(0, -s * 1.35); c.lineTo(s, s); c.lineTo(0, s * 0.45); c.lineTo(-s, s); c.closePath();
    c.fillStyle = '#fac03e'; c.strokeStyle = '#231916'; c.lineWidth = 1.4 * Math.min(ui, 1.6); c.lineJoin = 'round';
    c.fill(); c.stroke();
    c.restore();
    // 큰 지도: 가려는 곳 표시
    if (big && this.pick) {
      c.strokeStyle = '#e8495a'; c.lineWidth = 3;
      c.beginPath(); c.arc(X(this.pick.x), Z(this.pick.z), 9, 0, 7); c.stroke();
    }
  }

  /** 큰 지도 패널 */
  openBig() {
    const g = this.game, ui = g.ui;
    if (ui.panel?.dataset.kind === 'map') return ui.closePanel();
    if (g.busy?.()) return ui.toast(BUSY_TRAVEL, BUSY_TOAST);
    const p = ui.openPanel(`${ico('map')} 지도 — 가고 싶은 곳을 누르세요`);
    p.dataset.kind = 'map';
    p.classList.add('map-panel');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 440;
    cv.className = 'bigmap';
    p.append(cv);
    const chips = document.createElement('div');
    chips.className = 'map-places';
    for (const pl of PLACES) {
      const b = document.createElement('button');
      b.innerHTML = placeChipHtml(pl);
      b.onclick = () => this.travel(pl.x, pl.z, pl.name);
      chips.append(b);
    }
    p.append(chips);
    const tip = document.createElement('p');
    tip.className = 'map-tip';
    tip.textContent = `지도를 누르면 그 자리로 바로 이동해요${touchUI() ? '' : ' (M 키로 열고 닫기)'}`;
    p.append(tip);
    this.big = cv;
    this.bigV = this._view(cv, 440);
    this._watch(this.bigV);
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const { x, z } = mapToWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height, this.bigV?.S || 440);
      this.travel(x, z);
    });
    this.render(this.bigV, true);
  }

  /** 지정한 곳으로 이동 (막힌 곳이면 가장 가까운 빈자리로). 막는 조건·알림은 g.warpTo 가 봄 */
  travel(x, z, name) {
    const g = this.game;
    const pos = g.findOpenSpot(x, z);
    const started = g.warpTo(pos.x, pos.z, {}, { label: name || '🗺️ 지도에서 고른 곳', after: () => g.ui.toast(name ? `${name}${josa(name, '으로/로')} 이동했어요` : '✨ 이동했어요') });
    if (started) this.pick = pos;
    return started;
  }
}
