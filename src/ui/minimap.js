import { LAYOUT } from '../game/world.js';
import { HILLS } from '../game/terrain.js';

/** 빠른 이동 장소 (지도 아래 버튼) — x,z 는 도착 지점(길 위) */
export const PLACES = [
  { id: 'farm', name: '🌱 농장', x: 0, z: 6.5 },
  { id: 'market', name: '🛒 장터', x: 0, z: -7 },
  { id: 'ranch', name: '🐄 목장', x: 14, z: 3 },
  { id: 'paddy', name: '🌾 논', x: 0, z: -15.5 },
  { id: 'smartfarm', name: '📱 스마트팜', x: -15.5, z: -6 },
  { id: 'pond', name: '🪷 연못', x: -7.3, z: 13.4 },
  { id: 'lake', name: '🎣 낚시터', x: -12.5, z: 22.4 },
  { id: 'field', name: '🚜 밭갈이', x: 26, z: 15 },
  { id: 'koat', name: '🏢 KOAT 체험관', x: 25, z: -24 },
];

/** 우상단 미니맵 (2D 캔버스). 누르면 큰 지도가 열리고, 큰 지도에서 원하는 곳을 누르면 그곳으로 이동 */
export class Minimap {
  constructor(game, root) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = this.canvas.height = 150;
    this.canvas.title = '지도 열기 (M)';
    this.canvas.addEventListener('click', () => this.openBig());
    root.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.acc = 0;
    this.big = null;
  }

  update(dt) {
    this.acc += dt;
    if (this.acc < 0.2) return;
    this.acc = 0;
    this.draw(this.ctx, 150, 1);
    if (this.big && this.game.ui.panel?.dataset.kind === 'map') this.draw(this.big.getContext('2d'), this.big.width, 2.2);
    else this.big = null;
  }

  /** 월드 ↔ 지도 좌표 */
  scale(S) { const B = LAYOUT.bounds + 4; return { B, k: S / (B * 2) }; }

  draw(c, S, ui) {
    const { B, k } = this.scale(S);
    const X = (x) => (x + B) * k, Z = (z) => (z + B) * k;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#8ccf5a';
    c.beginPath(); c.roundRect(0, 0, S, S, 16 * ui); c.fill();
    const L = LAYOUT;
    const rect = (x0, z0, x1, z1, col) => { c.fillStyle = col; c.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); };
    // 언덕: 등고선처럼 겹친 원 + 꼭대기 전망대
    for (const H of HILLS) {
      for (let ring = 3; ring >= 1; ring--) {
        c.fillStyle = `rgba(${70 + ring * 6}, ${120 + ring * 8}, 60, ${0.14 + (3 - ring) * 0.08})`;
        c.beginPath(); c.arc(X(H.x), Z(H.z), H.r * (ring / 3) * k, 0, 7); c.fill();
      }
      const seen = this.game.explore?.seen?.[H.id];
      c.font = `${10 * ui}px sans-serif`; c.textAlign = 'center'; c.fillStyle = '#000';
      c.fillText(seen ? '🔭' : '⛰️', X(H.x), Z(H.z) + 4 * ui);
      if (ui > 1) { c.fillStyle = '#3d5a2a'; c.font = `bold ${8 * ui}px Jua, sans-serif`; c.fillText(H.name, X(H.x), Z(H.z) + 16 * ui); }
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
    c.fillStyle = '#6fc3e8'; c.beginPath(); c.arc(X(L.pond.x), Z(L.pond.z), L.pond.r * k, 0, 7); c.fill();
    c.beginPath(); c.arc(X(L.lake.x), Z(L.lake.z), L.lake.r * k, 0, 7); c.fill();
    for (const b of L.lake.pier) rect(b.x0, b.z0, b.x1, b.z1, '#b08457');
    rect(L.craft.jars.x - 1.7, L.craft.jars.z - 0.8, L.craft.jars.x + 1.7, L.craft.jars.z + 0.8, '#5a3523');
    rect(L.craft.compost.x - 0.6, L.craft.compost.z - 0.6, L.craft.compost.x + 0.6, L.craft.compost.z + 0.6, '#4a3322');
    rect(L.lake.shop.x - 1.2, L.lake.shop.z - 1.2, L.lake.shop.x + 1.2, L.lake.shop.z + 1.2, '#3a8fd8');
    const pd = L.paddy; rect(pd.x0, pd.z0, pd.x0 + pd.cols * (pd.size + pd.bund) + pd.bund, pd.z0 + pd.rows * (pd.size + pd.bund) + pd.bund, '#5fa3b0');
    const kr = L.koat.rect; rect(kr[0], kr[1], kr[2], kr[3], 'rgba(48,182,170,0.55)');
    c.fillStyle = '#e0413a'; for (const o of L.orchard) { c.beginPath(); c.arc(X(o.x), Z(o.z), 2.2 * ui, 0, 7); c.fill(); }
    // 주민 (역할 색)
    const npcCol = { merchant: '#f28c28', researcher: '#8e7cc3', guide: '#6dbb4f', granny: '#a3a9b0', kid: '#f28bb0', fisher: '#3a7bd5' };
    for (const e of this.game.npcs.list) { const p = e.u.group.position; c.fillStyle = npcCol[e.id] || '#fff'; c.beginPath(); c.arc(X(p.x), Z(p.z), 2.6 * ui, 0, 7); c.fill(); }
    // 해로운 동물 (빨간 점)
    c.fillStyle = '#e8495a';
    for (const q of this.game.pests?.markers() || []) { c.beginPath(); c.arc(X(q.x), Z(q.z), 3.2 * ui, 0, 7); c.fill(); }
    // 다른 플레이어
    c.fillStyle = '#4a90d9';
    for (const r of this.game.net.remote.values()) { const p = r.unico.group.position; c.beginPath(); c.arc(X(p.x), Z(p.z), 2.5 * ui, 0, 7); c.fill(); }
    // 나 (바라보는 방향 표시)
    const p = this.game.tractor.driving ? this.game.tractor.riderGroup.position : this.game.player.position;
    c.fillStyle = '#fac03e'; c.strokeStyle = '#231916'; c.lineWidth = 1.5 * ui;
    c.beginPath(); c.arc(X(p.x), Z(p.z), 4 * ui, 0, 7); c.fill(); c.stroke();
    // 라벨
    c.fillStyle = '#231916'; c.font = `bold ${9 * ui}px Jua, sans-serif`; c.textAlign = 'center';
    c.fillText('농장', X(f.origin.x), Z(f.origin.z) + 3 * ui);
    c.fillText('목장', X((L.ranch.x0 + L.ranch.x1) / 2), Z(L.ranch.z1 - 2));
    c.fillText('스마트팜', X(L.smartfarm.x), Z(L.smartfarm.z + 7));
    c.fillText('장터', X(L.market.x), Z(L.market.z - 2));
    c.fillText('밭갈이', X(fd.x0 + fd.cols), Z(fd.z0 + fd.rows + 4));
    c.fillText('논', X(0), Z(pd.z0 - 1.5));
    c.fillText('KOAT', X((kr[0] + kr[2]) / 2), Z((kr[1] + kr[3]) / 2) + 3 * ui);
    c.fillText('과수원', X(9), Z(-11.5));
    if (ui > 1) c.fillText('연못', X(L.pond.x), Z(L.pond.z + L.pond.r + 2.5));
    c.fillText('낚시터', X(L.lake.x), Z(L.lake.z + L.lake.r + 2.6));
    // 큰 지도: 가려는 곳 표시
    if (ui > 1 && this.pick) {
      c.strokeStyle = '#e8495a'; c.lineWidth = 3;
      c.beginPath(); c.arc(X(this.pick.x), Z(this.pick.z), 9, 0, 7); c.stroke();
    }
  }

  /** 큰 지도 패널 */
  openBig() {
    const g = this.game, ui = g.ui;
    if (ui.panel?.dataset.kind === 'map') return ui.closePanel();
    const p = ui.openPanel('🗺️ 지도 — 가고 싶은 곳을 누르세요');
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
      b.textContent = pl.name;
      b.onclick = () => this.travel(pl.x, pl.z, pl.name);
      chips.append(b);
    }
    p.append(chips);
    const tip = document.createElement('p');
    tip.className = 'map-tip';
    tip.textContent = '지도를 누르면 그 자리로 바로 이동해요 (M 키로 열고 닫기)';
    p.append(tip);
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const { B, k } = this.scale(cv.width);
      const x = ((e.clientX - r.left) / r.width) * cv.width / k - B;
      const z = ((e.clientY - r.top) / r.height) * cv.height / k - B;
      this.travel(x, z);
    });
    this.big = cv;
    this.draw(cv.getContext('2d'), cv.width, 2.2);
  }

  /** 지정한 곳으로 이동 (막힌 곳이면 가장 가까운 빈자리로) */
  travel(x, z, name) {
    const g = this.game;
    if (g.tractor.driving || g.smartfarm.active || g.nature.fishing || g.rice.threshing || g.lake?.diving || g.farm.job) return g.ui.toast('지금은 이동할 수 없어요');
    const pos = g.findOpenSpot(x, z);
    this.pick = pos;
    g.teleport(pos.x, pos.z);
    g.ui.toast(name ? `${name}(으)로 이동했어요` : '✨ 이동했어요');
  }
}
