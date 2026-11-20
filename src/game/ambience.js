/**
 * 장소·계절·집 안 환경음 (WebAudio 합성, 외부 파일 없음)
 * - 물가(호수·연못): 낮은 물결 소리 바닥(저역통과 노이즈 + 0.2Hz 출렁임) + 가끔 퐁당
 * - 봄·여름 밤 논·연못: 개구리 개굴개굴 (묶음 한 번씩, 계속 나는 소리 아님)
 * - 여름 낮: 매미 소리가 3~6초 차올랐다 잦아듦 (15~40초 쉼)
 * - 집 안 + 비: 지붕 빗소리 (2.5kHz 띠 노이즈 + 톡톡)
 * 게임 화면 갱신(music.setScene)에서 초당 4번만 계산. 바닥 소리는 낮은 품질 2개·그 밖 3개까지, 5초 조용하면 멈춤
 * 도트 판은 쓰지 않음 (boot.js 가 3D 판에만 붙임)
 */

/** r 안은 1, r+10 밖은 0, 사이는 부드럽게 */
export function zoneGain(d, r, fade = 10) {
  if (d <= r) return 1;
  if (d >= r + fade) return 0;
  const k = 1 - (d - r) / fade;
  return k * k * (3 - 2 * k);
}

/** 바닥 소리 개수 상한 */
export const bedCap = (low) => (low ? 2 : 3);

/** 바닥 소리 후보 [{ id, gain }] → 크기 큰 순으로 cap 개 (0 은 뺌) */
export function pickBeds(cands, cap) {
  return cands.filter((c) => c.gain > 0.001).sort((a, b) => b.gain - a.gain).slice(0, cap);
}

/** 바닥 소리 기준 크기 (주변 소리 버스 앞 게인, 물가에 서면 -36~-40dBFS) */
export const BED_LEVEL = { water: 0.15, roof: 0.45 };

/** LAYOUT → 환경음 자리 */
export function buildZones(L) {
  const z = [];
  if (L?.lake) z.push({ id: 'lake', kind: 'water', x: L.lake.x, z: L.lake.z, r: L.lake.r });
  if (L?.pond) z.push({ id: 'pond', kind: 'water', x: L.pond.x, z: L.pond.z, r: L.pond.r });
  const frogs = [];
  if (L?.paddy) {
    const p = L.paddy, w = p.cols * p.size + (p.cols + 1) * p.bund, h = p.rows * p.size + (p.rows + 1) * p.bund;
    frogs.push({ id: 'paddy', x: p.x0 + w / 2, z: p.z0 + h / 2, r: Math.max(w, h) / 2 });
  }
  if (L?.pond) frogs.push({ id: 'pond', x: L.pond.x, z: L.pond.z, r: L.pond.r + 1 });
  const trees = (L?.orchard || []).map((t) => ({ x: t.x, z: t.z }));
  return { beds: z, frogs, trees };
}

export class Ambience {
  /** @param o.layout world.js LAYOUT (boot.js 가 넘김) */
  constructor(audio, o = {}) {
    this.audio = audio;
    const Z = buildZones(o.layout);
    this.zones = Z.beds; this.frogZones = Z.frogs; this.trees = Z.trees;
    this.beds = new Map(); // id → 바닥 소리 { src, out, pan, lfo, silentAt }
    this.roof = null;
    this.last = -1;
    this.rng = Math.random;
    this.nextPlop = 4; this.nextFrog = 2; this.nextCicada = 8; this.nextTick = 0;
  }

  /** 지금 상태 읽기 (붙은 게임에서) */
  stateOf(g, scene) {
    const p = g.player?.position, inside = !!g.home?.inside;
    return {
      x: p?.x ?? 0, z: p?.z ?? 0, yaw: g.followCam?.yaw ?? 0,
      inside, season: g.season?.cur?.id, low: g.quality?.level === 'low',
      rain: scene?.kind === 'rain' || scene?.kind === 'storm', precip: scene?.precip || 0,
    };
  }

  /**
   * 초당 4번까지: 듣는 자리·집 안 필터·바닥 소리·한 번씩 나는 소리
   * @param now 소리 장치 시각 (초)
   * @param s { x, z, yaw, inside, season, night, low, rain, rainLevel }
   */
  update(now, s) {
    const a = this.audio, c = a.ctx;
    if (!c || now - this.last < 0.25) return false;
    this.last = now;
    a.listener = { x: s.x, z: s.z, yaw: s.yaw };
    a.setIndoor?.(s.inside);
    if (!a.enabled || c.state !== 'running') return true;
    // 물가 바닥 소리 (집 안 플레이어는 멀리 있어 저절로 0)
    const want = pickBeds(this.zones.map((zn) => ({ id: zn.id, zn, gain: zoneGain(Math.hypot(s.x - zn.x, s.z - zn.z), zn.r) })), bedCap(s.low) - (s.inside && s.rain ? 1 : 0));
    const keep = new Set(want.map((w) => w.id));
    for (const w of want) this._bed(w.id, w.zn, w.gain, s, now);
    for (const [id, b] of this.beds) if (!keep.has(id)) this._fade(id, b, now);
    // 지붕 빗소리
    this._roof(s.inside && s.rain ? (s.rainLevel ?? 0.05) : 0, now);
    if (s.inside) return true;
    this._oneShots(now, s);
    return true;
  }

  /** 물가 바닥 소리 하나: 노이즈(시작 위치 무작위) → 저역통과 500Hz → 출렁임 → 좌우 → 크기 → 주변 소리 버스 */
  _bed(id, zn, gain, s, now) {
    const a = this.audio, c = a.ctx;
    let b = this.beds.get(id);
    if (!b) {
      const src = c.createBufferSource(); src.buffer = a.noiseBuf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.5;
      const am = c.createGain(); am.gain.value = 0.75;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.2 + this.rng() * 0.05;
      const depth = c.createGain(); depth.gain.value = 0.25;
      lfo.connect(depth).connect(am.gain);
      const out = c.createGain(); out.gain.value = 0;
      let tail = am;
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      if (pan) { am.connect(pan); tail = pan; }
      src.connect(lp).connect(am); tail.connect(out).connect(a.amb);
      src.start(c.currentTime, this.rng() * 2); lfo.start(c.currentTime);
      b = { src, lfo, out, pan, nodes: [src, lp, am, lfo, depth, out, pan].filter(Boolean), silentAt: -1 };
      this.beds.set(id, b);
    }
    const d = Math.hypot(zn.x - s.x, zn.z - s.z), t = c.currentTime;
    if (b.pan && d > 0.5) b.pan.pan.setTargetAtTime(Math.max(-0.7, Math.min(0.7, ((zn.x - s.x) * Math.cos(s.yaw) - (zn.z - s.z) * Math.sin(s.yaw)) / d)) * (1 - zoneGain(d, zn.r * 0.6, 4) * 0.7), t, 0.3);
    b.out.gain.setTargetAtTime(gain * BED_LEVEL.water, t, 0.4);
    b.silentAt = -1;
  }

  /** 줄이고 5초 조용하면 멈추고 끊음 */
  _fade(id, b, now) {
    const c = this.audio.ctx;
    if (b.silentAt < 0) { b.silentAt = now; b.out.gain.setTargetAtTime(0, c.currentTime, 0.4); return; }
    if (now - b.silentAt < 5) return;
    try { b.src.stop(c.currentTime); b.lfo.stop(c.currentTime); } catch { /* 이미 멈춤 */ }
    for (const n of b.nodes) { try { n.disconnect(); } catch { /* 이미 끊김 */ } }
    this.beds.delete(id);
  }

  /** 지붕 빗소리: 비 바닥(2.5kHz 띠) + 톡톡 (집 안 필터를 거치지 않고 바로 낮춤 버스로) */
  _roof(level, now) {
    const a = this.audio, c = a.ctx;
    if (level > 0 && !this.roof) {
      const src = c.createBufferSource(); src.buffer = a.noiseBuf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.8;
      const out = c.createGain(); out.gain.value = 0;
      src.connect(bp).connect(out).connect(a.ambDuck || a.amb);
      src.start(c.currentTime, this.rng() * 2);
      this.roof = { src, out, nodes: [src, bp, out], silentAt: -1 };
    }
    const R = this.roof;
    if (!R) return;
    if (level > 0) {
      R.silentAt = -1;
      R.out.gain.setTargetAtTime(level * BED_LEVEL.roof * a.volume.amb, c.currentTime, 0.5);
      // 톡톡: 초당 3번쯤 (다음 0.25초 안에 무작위)
      while (this.nextTick < now + 0.25) {
        if (this.nextTick >= now) a.noise(0.012, 0.035 * a.volume.amb * Math.min(1, level * 12), { type: 'highpass', freq: 3000 + this.rng() * 2000, q: 0.7, at: this.nextTick - now, out: a.ambDuck || a.amb });
        this.nextTick = Math.max(this.nextTick, now) + 0.12 + this.rng() * 0.5;
      }
    } else if (R.silentAt < 0) { R.silentAt = now; R.out.gain.setTargetAtTime(0, c.currentTime, 0.5); }
    else if (now - R.silentAt > 5) {
      try { R.src.stop(c.currentTime); } catch { /* 이미 멈춤 */ }
      for (const n of R.nodes) { try { n.disconnect(); } catch { /* 이미 끊김 */ } }
      this.roof = null;
    }
  }

  /** 좌우 패너 하나 (주변 소리 버스로) — 가까울수록 크게 */
  _spot(x, z, s, maxD = 30) {
    const a = this.audio, c = a.ctx, d = Math.hypot(x - s.x, z - s.z);
    if (d > maxD) return null;
    const g = c.createGain(); g.gain.value = 1 / (1 + d / 8);
    let head = g;
    if (c.createStereoPanner && d > 0.5) {
      const p = c.createStereoPanner(); p.pan.value = Math.max(-0.7, Math.min(0.7, ((x - s.x) * Math.cos(s.yaw) - (z - s.z) * Math.sin(s.yaw)) / d));
      g.connect(p); head = p;
    }
    head.connect(a.amb);
    return g;
  }

  /** 퐁당 · 개구리 · 매미 */
  _oneShots(now, s) {
    const a = this.audio, r = this.rng;
    // 물가 퐁당 (4~10초마다, 가까운 물가에서)
    if (now > this.nextPlop) {
      this.nextPlop = now + 4 + r() * 6;
      const zn = this.zones.find((w) => Math.hypot(s.x - w.x, s.z - w.z) < w.r + 8);
      if (zn) {
        const ang = r() * Math.PI * 2, rr = zn.r * (0.3 + r() * 0.6);
        const out = this._spot(zn.x + Math.cos(ang) * rr, zn.z + Math.sin(ang) * rr, s);
        if (out) { a.tone(700 + r() * 300, 0.09, 'sine', 0.05, -350, { rev: 0.25, out }); a.noise(0.05, 0.02, { freq: 1200, q: 1.2, at: 0.01, out }); }
      }
    }
    const springSummer = s.season === 'spring' || s.season === 'summer' || !s.season;
    // 봄·여름 밤: 논·연못 개구리 (한 묶음 3~6번 개굴, 2~6초마다)
    if (s.night && springSummer && now > this.nextFrog) {
      this.nextFrog = now + 2 + r() * 4;
      const fz = this.frogZones.find((f) => Math.hypot(s.x - f.x, s.z - f.z) < f.r + 14);
      if (fz) {
        const out = this._spot(fz.x + (r() - 0.5) * fz.r * 2, fz.z + (r() - 0.5) * fz.r * 2, s);
        if (out) this.frog(out, 3 + Math.floor(r() * 4), s.rain ? 1.3 : 1);
      }
    }
    // 여름 낮: 매미 (3~6초 차올랐다 잦아듦, 15~40초 쉼), 과수원 나무 곁이면 더 크게
    if (s.season === 'summer' && !s.night && !s.rain && now > this.nextCicada) {
      this.nextCicada = now + 15 + r() * 25;
      let best = null, bd = 1e9;
      for (const t of this.trees) { const d = Math.hypot(s.x - t.x, s.z - t.z); if (d < bd) { bd = d; best = t; } }
      const near = best && bd < 18;
      const x = near ? best.x : s.x + (r() - 0.5) * 40, z = near ? best.z : s.z + (r() < 0.5 ? -1 : 1) * 18;
      const out = this._spot(x, z, s, 40);
      if (out) this.cicada(out, 3 + r() * 3, near ? 1 : 0.5);
    }
  }

  /** 개구리: 280Hz 사각파 25ms 두 번 → 900Hz 띠통과 */
  frog(out, n = 4, k = 1) {
    const a = this.audio, c = a.ctx, r = this.rng;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
    bp.connect(out);
    let at = 0;
    const f0 = 260 + r() * 50;
    for (let i = 0; i < n; i++) {
      for (const dt of [0, 0.045]) a.tone(f0, 0.025, 'square', 0.25 * k, -20, { at: at + dt, rev: 0.1, lp: 3000, out: bp });
      at += 0.22 + r() * 0.12;
    }
  }

  /** 매미: 5.5kHz 띠 노이즈를 14Hz 로 떨게 하고 dur 초 동안 차올랐다 잦아듦 */
  cicada(out, dur = 4, k = 1) {
    const a = this.audio, c = a.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = a.noiseBuf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5500; bp.Q.value = 4;
    const am = c.createGain(); am.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 14;
    const depth = c.createGain(); depth.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.2 * k, t + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(am).connect(env).connect(out);
    src.start(t, this.rng() * 2); lfo.start(t);
    src.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }
}
