/** 방/플레이어 관리 (전송 계층 독립 - 테스트 가능) */
const ADJ = ['부지런한', '느긋한', '씩씩한', '상냥한', '엉뚱한', '졸린', '반짝이는', '호기심많은', '용감한', '수줍은'];
const NOUN = ['당근', '토마토', '옥수수', '딸기', '양배추', '새싹', '트랙터', '밀짚모자', '우유', '달걀'];

export function randomName(rng = Math.random) {
  return `${ADJ[Math.floor(rng() * ADJ.length)]} ${NOUN[Math.floor(rng() * NOUN.length)]}`;
}

export function sanitizeName(name) {
  const s = String(name ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, 12);
  return s || randomName();
}

/** 옷차림(모습) 문자열: 영문 소문자·숫자·점·하이픈만, 48자까지 (클라이언트가 다시 정해진 이름만 골라 씀) */
export function sanitizeLook(s) {
  return String(s ?? '').replace(/[^a-z0-9.-]/g, '').slice(0, 48);
}

/** 플레이어끼리 상호작용 (인사·하이파이브·선물·친구): 정해진 종류·값만, 받는 사람에게만 전달 */
export const ACTS = ['wave', 'five', 'five_ok', 'gift', 'friend', 'friend_ok'];
export const ACT_LIMIT = 8; // 10초에 8번까지
export function sanitizeAct(m) {
  const k = String(m?.k ?? '');
  const to = Number(m?.to);
  if (!ACTS.includes(k) || !Number.isInteger(to) || to < 1 || to > 1e9) return null;
  if (k !== 'gift') return { to, k };
  const item = String(m.item ?? '');
  const n = Number(m.n);
  if (!/^[a-z0-9_]{1,24}$/.test(item) || !Number.isInteger(n) || n < 1 || n > 5) return null;
  return { to, k, item, n };
}
/** 선물 번호 (보낸 사람이 붙임): 전하지 못하면 이 번호로 알려 줘서 돌려받게. 없거나 이상하면 0 (옛 클라이언트) */
export function sanitizeGid(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 1e9 ? n : 0;
}
/** 옷 갈아입기 간격: 이 안에 또 오면 버리지 않고 마지막 것을 간격이 지난 뒤 전함 */
export const LOOK_MS = 1000;

export function sanitizeChat(text) {
  return String(text ?? '').replace(/[<>]/g, '').trim().slice(0, 80);
}

let nextId = 1;

export class Player {
  constructor(ws, name, room) {
    this.id = nextId++;
    this.ws = ws;
    this.name = name;
    this.room = room;
    this.x = 0; this.z = 9; this.f = 0; this.a = ''; this.l = ''; this.lookAt = -1e9; this.lookNext = null;
    this.dirty = true;
    this.chatTimes = [];
    this.actTimes = [];
  }
  public() { return { id: this.id, name: this.name, x: this.x, z: this.z, f: this.f, a: this.a, l: this.l }; }
  send(obj) { try { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); } catch {} }
}

export class Room {
  constructor(name, maxPlayers) {
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.players = new Map();
  }
  get size() { return this.players.size; }
  get full() { return this.players.size >= this.maxPlayers; }
  snapshot() { return [...this.players.values()].map((p) => p.public()); }
  broadcast(obj, exceptId = null) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) if (p.id !== exceptId) { try { if (p.ws.readyState === 1) p.ws.send(s); } catch {} }
  }
}

export class Rooms {
  constructor({ maxPlayers = 50, maxRooms = 20, now = () => Date.now() } = {}) {
    this.maxPlayers = maxPlayers;
    this.maxRooms = maxRooms;
    this.rooms = new Map();
    this.now = now;
  }

  roomName(i) { return `${i}번 농장`; }

  /** 원하는 방이 꽉 찼거나 없으면 자리가 있는 가장 낮은 번호 방, 없으면 새 방 */
  pick(wantRoom) {
    if (wantRoom && this.rooms.has(wantRoom) && !this.rooms.get(wantRoom).full) return this.rooms.get(wantRoom);
    for (let i = 1; i <= this.maxRooms; i++) {
      const name = this.roomName(i);
      if (wantRoom && wantRoom !== name && this.rooms.has(wantRoom)) continue;
      let r = this.rooms.get(name);
      if (!r) { r = new Room(name, this.maxPlayers); this.rooms.set(name, r); }
      if (!r.full) return r;
    }
    return null;
  }

  join(ws, name, wantRoom, look = '') {
    const room = this.pick(wantRoom);
    if (!room) return null;
    const p = new Player(ws, sanitizeName(name), room);
    p.l = sanitizeLook(look);
    room.players.set(p.id, p);
    return p;
  }

  leave(p) {
    const r = p.room;
    r.players.delete(p.id);
    r.broadcast({ t: 'left', id: p.id, count: r.size });
    if (r.size === 0 && r.name !== this.roomName(1)) this.rooms.delete(r.name);
  }

  handle(p, m) {
    switch (m.t) {
      case 'pos': {
        if (typeof m.x !== 'number' || typeof m.z !== 'number') return;
        p.x = clamp(m.x, -60, 60); p.z = clamp(m.z, -60, 60); p.f = clamp(Number(m.f) || 0, -20, 20); p.a = String(m.a || '').replace(/[^a-z_]/gi, '').slice(0, 12); // 동작 이름은 영문·밑줄만
        p.dirty = true;
        return;
      }
      case 'chat': {
        const t = this.now();
        p.chatTimes = p.chatTimes.filter((x) => t - x < 5000);
        if (p.chatTimes.length >= 5) return; // 5초에 5건 제한
        p.chatTimes.push(t);
        const text = sanitizeChat(m.text);
        if (text) p.room.broadcast({ t: 'chat', id: p.id, name: p.name, text });
        return;
      }
      case 'look': { // 옷 갈아입기: 1초에 한 번까지, 그 안에 또 오면 마지막 것만 남겨 두었다가 tick 에서 전함
        const l = sanitizeLook(m.l);
        const t = this.now();
        p.lookNext = null;
        if (l === p.l) return; // 같은 옷이면 보낼 것 없음 (미뤄 둔 것도 취소)
        if (t - p.lookAt < LOOK_MS) p.lookNext = l;
        else wear(p, l, t);
        return;
      }
      case 'act': {
        const a = sanitizeAct(m);
        if (!a) return;
        // 선물을 전하지 못하면(한도 초과·상대 없음) 보낸 사람에게 알려 가방에 돌려받게 (번호를 붙여 보낸 클라이언트에게만)
        const gid = a.k === 'gift' ? sanitizeGid(m.gid) : 0;
        const fail = (why) => { if (gid) p.send({ t: 'act_fail', k: 'gift', gid, why }); };
        const t = this.now();
        p.actTimes = p.actTimes.filter((x) => t - x < 10000);
        if (p.actTimes.length >= ACT_LIMIT) return fail('busy');
        p.actTimes.push(t);
        const target = p.room.players.get(a.to); // 같은 방 사람에게만
        if (!target || target === p) return fail('gone');
        target.send({ t: 'act', from: p.id, name: p.name, ...a, to: undefined });
        return;
      }
      case 'ping': return p.send({ t: 'pong' });
    }
  }

  /** 변경된 플레이어만 묶어 방마다 전송 */
  tick() {
    const t = this.now();
    for (const r of this.rooms.values()) {
      for (const p of r.players.values()) if (p.lookNext !== null && t - p.lookAt >= LOOK_MS) wear(p, p.lookNext, t); // 미뤄 둔 옷: 1초가 지나면 전함
      const changed = [...r.players.values()].filter((p) => p.dirty);
      if (!changed.length) continue;
      const msg = { t: 'state', players: changed.map((p) => p.public()) };
      r.broadcast(msg);
      for (const p of changed) p.dirty = false;
    }
  }

  summary() { return [...this.rooms.values()].map((r) => ({ name: r.name, count: r.size, max: r.maxPlayers })); }
}

function wear(p, l, t) { p.l = l; p.lookAt = t; p.lookNext = null; p.dirty = true; }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
