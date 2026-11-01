import { LAYOUT } from '../game/world.js';

/** 우상단 미니맵 (2D 캔버스) */
export class Minimap {
  constructor(game, root) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = this.canvas.height = 150;
    root.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.acc = 0;
  }

  update(dt) {
    this.acc += dt;
    if (this.acc < 0.2) return;
    this.acc = 0;
    const c = this.ctx, S = 150, B = LAYOUT.bounds + 4, k = S / (B * 2);
    const X = (x) => (x + B) * k, Z = (z) => (z + B) * k;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#8ccf5a';
    c.beginPath(); c.roundRect(0, 0, S, S, 16); c.fill();
    const L = LAYOUT;
    const rect = (x0, z0, x1, z1, col) => { c.fillStyle = col; c.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); };
    const f = L.farm, fw = f.cols * f.tile / 2, fh = f.rows * f.tile / 2;
    rect(f.origin.x - fw, f.origin.z - fh, f.origin.x + fw, f.origin.z + fh, '#8a5a3c');
    rect(L.ranch.x0, L.ranch.z0, L.ranch.x1, L.ranch.z1, 'rgba(255,255,255,0.25)');
    rect(L.barn.x - 2.5, L.barn.z - 3, L.barn.x + 2.5, L.barn.z + 3, '#d9534f');
    rect(L.smartfarm.x - 4, L.smartfarm.z - 4.5, L.smartfarm.x + 4, L.smartfarm.z + 4.5, '#eaf7ff');
    const fd = L.field; rect(fd.x0, fd.z0, fd.x0 + fd.cols * fd.cell, fd.z0 + fd.rows * fd.cell, '#b08a5a');
    rect(L.market.x - 1.5, L.market.z - 0.6, L.market.x + 1.5, L.market.z + 0.6, '#e35d5d');
    c.fillStyle = '#6fc3e8'; c.beginPath(); c.arc(X(L.pond.x), Z(L.pond.z), L.pond.r * k, 0, 7); c.fill();
    const pd = L.paddy; rect(pd.x0, pd.z0, pd.x0 + pd.cols * (pd.size + pd.bund) + pd.bund, pd.z0 + pd.rows * (pd.size + pd.bund) + pd.bund, '#5fa3b0');
    const kr = L.koat.rect; rect(kr[0], kr[1], kr[2], kr[3], 'rgba(48,182,170,0.55)');
    c.fillStyle = '#e0413a'; for (const o of L.orchard) { c.beginPath(); c.arc(X(o.x), Z(o.z), 2.2, 0, 7); c.fill(); }
    // 주민 (역할 색)
    const npcCol = { merchant: '#f28c28', researcher: '#8e7cc3', guide: '#6dbb4f', granny: '#a3a9b0', kid: '#f28bb0' };
    for (const e of this.game.npcs.list) { const p = e.u.group.position; c.fillStyle = npcCol[e.id] || '#fff'; c.beginPath(); c.arc(X(p.x), Z(p.z), 2.6, 0, 7); c.fill(); }
    // 다른 플레이어
    c.fillStyle = '#4a90d9';
    for (const r of this.game.net.remote.values()) { const p = r.unico.group.position; c.beginPath(); c.arc(X(p.x), Z(p.z), 2.5, 0, 7); c.fill(); }
    // 나
    const p = this.game.tractor.driving ? this.game.tractor.riderGroup.position : this.game.player.position;
    c.fillStyle = '#fac03e'; c.strokeStyle = '#231916'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(X(p.x), Z(p.z), 4, 0, 7); c.fill(); c.stroke();
    // 라벨
    c.fillStyle = '#231916'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
    c.fillText('농장', X(f.origin.x), Z(f.origin.z) + 3);
    c.fillText('목장', X((L.ranch.x0 + L.ranch.x1) / 2), Z(L.ranch.z1 - 2));
    c.fillText('스마트팜', X(L.smartfarm.x), Z(L.smartfarm.z + 7));
    c.fillText('장터', X(L.market.x), Z(L.market.z - 2));
    c.fillText('밭갈이', X(fd.x0 + fd.cols), Z(fd.z0 + fd.rows + 4));
    c.fillText('논', X(0), Z(pd.z0 - 1.5));
    c.fillText('KOAT', X((kr[0] + kr[2]) / 2), Z((kr[1] + kr[3]) / 2) + 3);
    c.fillText('과수원', X(9), Z(-11.5));
  }
}
