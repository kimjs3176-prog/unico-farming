import { decodeLook } from './sim/costume.js';
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
    this.ws.onopen = () => { this.connected = true; this.send({ t: 'join', name: this.game.playerName, l: this.game.look?.() || '' }); };
    this.ws.onmessage = (e) => { try { this.handle(JSON.parse(e.data)); } catch {} };
    this.ws.onclose = () => {
      this.connected = false; this.clearRemote(); this.game.ui.setOnline(0, '');
      if (!this.switching) this.reconnect = setTimeout(() => this.connect(this.wantRoom), this.retryDelay());
      this.switching = false;
    };
    this.ws.onerror = () => {};
  }

  /** 다시 접속할 때까지 기다릴 시간: 실패할수록 길게(5초→5분), 오늘 무료 사용량이 다 찼으면 초기화(한국 오전 9시) 뒤로 — 서버 요청 수 절약 */
  retryDelay() {
    const now = Date.now();
    if (this.blockedUntil > now) return this.blockedUntil - now + Math.random() * 300000;
    this.fails = (this.fails || 0) + 1;
    return Math.min(300000, 5000 * 2 ** Math.min(6, this.fails - 1)) * (0.8 + Math.random() * 0.4);
  }

  /** 다른 플레이어에게 상호작용 보내기 (인사·하이파이브·선물·친구) */
  sendAct(to, k, extra = {}) { if (this.connected) this.send({ t: 'act', to, k, ...extra }); }

  /** 가까운 다른 플레이어 안내 (E: 상호작용 창) */
  prompt(pp) {
    let best = null, bd = 2.4;
    for (const [id, r] of this.remote) {
      const p = r.unico.group.position, d = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (d < bd) { bd = d; best = [id, r]; }
    }
    if (!best) return null;
    const [id, r] = best;
    return { d: bd, label: `${this.game.social?.isFriend(r.name) ? '⭐' : '👤'} ${r.name} · 인사·하이파이브·선물`, key: 'player', onInteract: () => this.game.socialView.open(id) };
  }

  /** 이름표 (친구면 ⭐, 금색) */
  labelOf(r) {
    const fr = this.game.social?.isFriend(r.name);
    r.unico.setName(`${fr ? '⭐' : '👤'} ${r.name}`, '#ffffff', fr ? 'rgba(214,150,20,0.92)' : 'rgba(74,144,217,0.9)');
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
  /** 옷을 갈아입으면 다른 접속자에게 알림 */
  sendLook() { if (this.connected) this.send({ t: 'look', l: this.game.look() }); }

  sendChat(text) {
    if (!this.connected) { this.game.ui.chatLine(this.game.playerName, text, true); this.game.player.unico.say(text); return; }
    this.send({ t: 'chat', text });
  }

  handle(m) {
    const g = this.game;
    switch (m.t) {
      case 'welcome': this.fails = 0; this.id = m.id; this.room = m.room; this.count = m.count; g.ui.setOnline(m.count, m.room); for (const p of m.players) this.upsert(p); break;
      case 'joined': this.upsert(m.p); this.count = m.count; g.ui.setOnline(m.count, this.room); g.ui.toast(g.social?.isFriend(m.p.name) ? `⭐ 친구 ${m.p.name} 님이 들어왔어요!` : `🦄 ${m.p.name} 님이 입장했어요`); break;
      case 'left': this.removeRemote(m.id); this.count = m.count; g.ui.setOnline(m.count, this.room); break;
      case 'state': for (const p of m.players) this.upsert(p); break;
      case 'chat': { const r = this.remote.get(m.id); if (m.id === this.id) { g.ui.chatLine(g.playerName, m.text, true); g.player.unico.say(m.text); } else { g.ui.chatLine(m.name, m.text); r?.unico.say(m.text); } break; }
      case 'full': g.ui.toast('⚠️ 모든 방이 가득 찼어요. 혼자 플레이하다가 자리가 나면 다시 들어가요'); break;
      case 'quota': // 무료 서버의 오늘 사용량이 다 참 → 초기화 시각까지 다시 접속하지 않음
        this.blockedUntil = Math.max(Date.now() + 60000, +m.until || 0);
        if (!this.quotaShown) { this.quotaShown = true; g.ui.toast('🌙 오늘 멀티플레이 서버 사용량이 다 찼어요. 내일 오전 9시에 다시 열려요 (농장은 계속 혼자 플레이할 수 있어요)'); }
        break;
      case 'act': g.socialView?.onAct(m); break;
    }
  }

  upsert(p) {
    if (p.id === this.id) return;
    let r = this.remote.get(p.id);
    if (!r) {
      const u = new Unico(this.game.assets, { name: `👤 ${p.name}`, labelColor: '#ffffff', labelBg: 'rgba(74,144,217,0.9)', rig: 'biped', outfit: { scarf: ['red', 'green', 'blue'][p.id % 3] } });
      if (this.game.social?.isFriend(p.name)) setTimeout(() => this.labelOf(r), 0);
      this.game.world.scene.add(u.group);
      r = { unico: u, target: { x: p.x ?? 0, z: p.z ?? 9 }, name: p.name };
      u.group.position.set(r.target.x, 0, r.target.z);
      this.remote.set(p.id, r);
    }
    if (p.l && p.l !== r.l) { r.l = p.l; r.unico.setOutfit(decodeLook(p.l)); } // 정해진 옷 이름만 (decodeLook)
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
      r.unico.swimming = g.world.inSwimWater(r.unico.group.position.x, r.unico.group.position.z, 0.4);
      r.unico.update(dt, g.followCam.camera, g.world.daylight);
    }
    if (!this.connected) return;
    this.acc += dt;
    if (this.acc < 1 / SEND_HZ) return;
    this.acc = 0;
    const pos = g.tractor.driving ? g.tractor.riderGroup.position : g.home?.inside ? g.home.outPos : g.player.position; // 집 안이면 다른 사람에게는 문 앞으로
    const u = g.player.unico;
    const msg = { t: 'pos', x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), f: +u.facing.toFixed(2), a: u.action || '' };
    const key = JSON.stringify(msg);
    if (key !== this.last) { this.last = key; this.send(msg); }
  }
}
