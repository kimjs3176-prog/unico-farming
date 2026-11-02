import { Unico } from './unico.js';

const SEND_HZ = 5;

/** 멀티플레이 클라이언트: 위치/포즈/채팅 릴레이 (서버 없으면 오프라인) */
export class Net {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.id = null;
    this.room = '';
    this.remote = new Map();
    this.acc = 0;
    this.last = '';
    this.count = 0;
    this.connected = false;
  }

  connect(room = '') {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const base = import.meta.env?.VITE_WS_URL || `${proto}://${location.host}/ws`;
    const url = room ? `${base}?room=${encodeURIComponent(room)}` : base;
    this.wantRoom = room;
    try { this.ws = new WebSocket(url); } catch { return; }
    this.ws.onopen = () => { this.connected = true; this.send({ t: 'join', name: this.game.playerName }); };
    this.ws.onmessage = (e) => { try { this.handle(JSON.parse(e.data)); } catch {} };
    this.ws.onclose = () => { this.connected = false; this.clearRemote(); this.game.ui.setOnline(0, ''); if (!this.switching) this.reconnect = setTimeout(() => this.connect(this.wantRoom), 5000); this.switching = false; };
    this.ws.onerror = () => {};
  }

  switchRoom(name) {
    if (name === this.room) return;
    this.switching = true;
    clearTimeout(this.reconnect);
    try { this.ws?.close(); } catch {}
    this.clearRemote();
    this.connect(name);
    this.game.ui.toast(`🏡 ${name}으로 이동 중…`);
  }

  send(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }
  sendChat(text) {
    if (!this.connected) { this.game.ui.chatLine(this.game.playerName, text, true); this.game.player.unico.say(text); return; }
    this.send({ t: 'chat', text });
  }

  handle(m) {
    const g = this.game;
    switch (m.t) {
      case 'welcome': this.id = m.id; this.room = m.room; this.count = m.count; g.ui.setOnline(m.count, m.room); for (const p of m.players) this.upsert(p); break;
      case 'joined': this.upsert(m.p); this.count = m.count; g.ui.setOnline(m.count, this.room); g.ui.toast(`🦄 ${m.p.name} 님이 입장했어요`); break;
      case 'left': this.removeRemote(m.id); this.count = m.count; g.ui.setOnline(m.count, this.room); break;
      case 'state': for (const p of m.players) this.upsert(p); break;
      case 'chat': { const r = this.remote.get(m.id); if (m.id === this.id) { g.ui.chatLine(g.playerName, m.text, true); g.player.unico.say(m.text); } else { g.ui.chatLine(m.name, m.text); r?.unico.say(m.text); } break; }
      case 'full': g.ui.toast('⚠️ 모든 방이 가득 찼어요. 오프라인으로 플레이합니다.'); break;
    }
  }

  upsert(p) {
    if (p.id === this.id) return;
    let r = this.remote.get(p.id);
    if (!r) {
      const u = new Unico(this.game.assets, { name: `👤 ${p.name}`, labelColor: '#ffffff', labelBg: 'rgba(74,144,217,0.9)', rig: 'biped', outfit: { scarf: ['red', 'green', 'blue'][p.id % 3] } });
      this.game.world.scene.add(u.group);
      r = { unico: u, target: { x: p.x ?? 0, z: p.z ?? 9 }, name: p.name };
      u.group.position.set(r.target.x, 0, r.target.z);
      this.remote.set(p.id, r);
    }
    if (p.x !== undefined) { r.target.x = p.x; r.target.z = p.z; }
    if (p.f !== undefined) r.unico.facing = p.f;
    if (p.a !== undefined) { if (p.a) r.unico.playAction(p.a, 0); else r.unico.clearAction(); }
  }

  removeRemote(id) { const r = this.remote.get(id); if (r) { this.game.world.scene.remove(r.unico.group); r.unico.dispose(); this.remote.delete(id); } }
  clearRemote() { for (const id of [...this.remote.keys()]) this.removeRemote(id); }

  update(dt) {
    const g = this.game;
    for (const r of this.remote.values()) {
      const p = r.unico.group.position;
      const dx = r.target.x - p.x, dz = r.target.z - p.z, d = Math.hypot(dx, dz);
      // 위치는 초당 SEND_HZ 번 오므로, 남은 거리를 다음 수신까지 일정한 속도로 걸어감
      // (지수 보간은 받을 때마다 빨라졌다 느려져 고무줄처럼 보임). 너무 멀면 순간이동
      if (d > 8) { p.x = r.target.x; p.z = r.target.z; r.spd = 0; }
      else if (d > 0.001) {
        const want = Math.min(9, d * SEND_HZ * 1.1);
        r.spd = (r.spd || 0) + (want - (r.spd || 0)) * (1 - Math.exp(-dt * 10));
        const step = Math.min(d, Math.max(r.spd, 0.6) * dt);
        p.x += (dx / d) * step; p.z += (dz / d) * step;
      } else r.spd = 0;
      r.unico.moving = d > 0.08 && (r.spd || 0) > 0.4;
      r.unico.update(dt, g.followCam.camera, g.world.daylight);
    }
    if (!this.connected) return;
    this.acc += dt;
    if (this.acc < 1 / SEND_HZ) return;
    this.acc = 0;
    const pos = g.tractor.driving ? g.tractor.riderGroup.position : g.player.position;
    const u = g.player.unico;
    const msg = { t: 'pos', x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), f: +u.facing.toFixed(2), a: u.action || '' };
    const key = JSON.stringify(msg);
    if (key !== this.last) { this.last = key; this.send(msg); }
  }
}
