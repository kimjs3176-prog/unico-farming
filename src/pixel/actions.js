/**
 * 상호작용 동작 (도구를 손에 들고 휘두르는 짧은 애니메이션)
 *  - 낚싯대: 던지기(뒤로 젖혔다 휙) → 기다리며 살랑 → 입질에 끝이 톡톡 → 물면 크게 휘며 덜덜 →
 *            힘겨루기 중엔 텐션만큼 휘고 몸부림에 흔들림 → 당기면 어깨 뒤로 확 젖힘
 *  - 곤충채: 바라보는 쪽으로 크게 휘두르고 바람 자국
 *  - 괭이(갈기·김매기), 물뿌리개(기울여 붓기), 씨앗 심기(쪼그려 앉기), 수확(쑥 뽑고 폴짝),
 *    나무 흔들기(밀며 들썩), 가축 돌보기(몸 기울이기)
 * 그림은 매 프레임 1px 선으로 바로 찍음 (도구마다 스프라이트를 만들 필요 없음)
 */

const ACT_LEN = { cast: 0.6, pull: 0.45, net: 0.42, hoe: 0.4, water: 0.7, plant: 0.4, harvest: 0.42, push: 0.5, pet: 0.4 };
const FWD = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
/** 손 위치 (캐릭터 발밑 기준) */
const HAND = { right: [9, -15], left: [-9, -15], down: [10, -14], up: [-10, -18] };
const ROD_L = 34;

const COL = {
  grip: '#4a2c18', rod: '#8a5a2c', rodHi: '#c9935a', tip: '#f2d7a0',
  reel: '#9399ac', reelHi: '#e6e8f2', line: 'rgba(240,240,255,0.75)',
  netRim: '#d9a441', net: 'rgba(236,240,255,0.55)', stick: '#8a5a2c',
  hoe: '#9399ac', hoeHi: '#e6e8f2', can: '#5c8fd6', canHi: '#a9d0ff', canLo: '#30508f', drop: 'rgba(170,220,255,0.9)',
  whoosh: 'rgba(255,255,255,', seed: '#7a4f28',
};

const ease = (u) => 1 - (1 - u) * (1 - u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));

export const ActionMethods = {
  /** 동작 시작 (같은 동작이 다시 와도 처음부터) */
  startAct(type, extra = {}) {
    this.act = { type, t: 0, dur: ACT_LEN[type] || 0.4, dir: this.player.dir, ...extra };
  },
  actTick(dt) {
    const A = this.act;
    if (A) { A.t += dt; if (A.t >= A.dur) this.act = null; }
    const f = this.fish;
    if (f && f.castT !== undefined && f.castT < ACT_LEN.cast) {
      const was = f.castT; f.castT += dt;
      // 찌가 물에 닿는 순간 첨벙
      if (was < ACT_LEN.cast * 0.78 && f.castT >= ACT_LEN.cast * 0.78) { this.audio.play('splash', 0.6); for (let k = 0; k < 6; k++) this.parts.push({ kind: 'drop', x: f.bx + (Math.random() - 0.5) * 8, y: f.by - 2, vx: (Math.random() - 0.5) * 50, vy: -50 - Math.random() * 40, grav: 260, life: 0.45, decay: 2 }); }
    }
  },
  /** 짧은 동작 중엔 발을 멈춤 */
  actLocked() { return !!this.act && ['hoe', 'water', 'plant', 'harvest', 'push', 'net', 'pull'].includes(this.act.type); },

  /** 몸 움직임 (주인공 그림을 몇 px 옮김) */
  actBody() {
    const A = this.act, p = this.player;
    let dx = 0, dy = 0;
    const [fx, fy] = FWD[p.dir];
    if (A) {
      const u = A.t / A.dur;
      switch (A.type) {
        case 'hoe': { const k = u < 0.55 ? -u / 0.55 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3; dy = k > 0 ? Math.round(k) : 0; dx = Math.round(fx * Math.max(0, k)); break; }
        case 'plant': dy = Math.round(Math.sin(Math.min(1, u * 1.4) * Math.PI) * 3); break;
        case 'harvest': dy = u < 0.35 ? Math.round(u / 0.35 * 2) : -Math.round(Math.sin(((u - 0.35) / 0.65) * Math.PI) * 4); dx = -Math.round(fx * (u > 0.35 ? 1 : 0)); break;
        case 'push': dx = Math.round(fx * 2 + Math.sin(A.t * 45) * (1 - u)); dy = Math.round(fy * 1); break;
        case 'pet': dx = Math.round(fx * Math.sin(u * Math.PI) * 2); dy = Math.round(Math.sin(u * Math.PI)); break;
        case 'net': dx = Math.round(fx * Math.sin(u * Math.PI) * 2); break;
        case 'pull': dx = -Math.round(fx * Math.sin(u * Math.PI) * 2); dy = -Math.round(Math.sin(u * Math.PI) * 1); break;
        case 'water': dx = Math.round(fx * 1); break;
        default: break;
      }
    }
    // 힘겨루기: 감을 때 뒤로 버팀, 몸부림이면 앞으로 끌려감
    if (this.fight) {
      const s = this.fight.sim;
      const k = s.surging ? 1 : this.reeling ? -1 : 0;
      dx += Math.round(fx * k + (s.surging ? Math.sin(performance.now() / 35) : 0));
    }
    return { dx, dy };
  },

  /** 낚싯대 자세: 각도(위로 몇 도) · 휨 · 떨림 · 줄 처짐 */
  rodPose() {
    const A = this.act, f = this.fish, F = this.fight, now = performance.now() / 1000;
    if (A?.type === 'pull') {
      const u = A.t / A.dur;
      const ang = u < 0.35 ? 35 + (u / 0.35) * 85 : 120 - ((u - 0.35) / 0.65) * 40;
      return { ang, bend: A.ok ? 0.5 * (1 - u) : 0, shake: 0, sag: 0, pull: true };
    }
    if (F) {
      const s = F.sim, tens = clamp01(s.tension);
      const ang = this.reeling ? 62 + Math.sin(now * 9) * 3 : 38;
      return { ang, bend: 0.35 + tens * 0.75, shake: s.surging ? 3 : tens > 0.75 ? 2 : 0.7, sag: 0 };
    }
    if (f) {
      if (f.castT !== undefined && f.castT < ACT_LEN.cast) {
        const u = f.castT / ACT_LEN.cast;
        // 머리 뒤로 젖혔다가(0~35%) 앞으로 휙(35~60%) 내려와 자리 잡기
        const ang = u < 0.35 ? 45 + (u / 0.35) * 75 : u < 0.6 ? 120 - ease((u - 0.35) / 0.25) * 110 : 10 + ease((u - 0.6) / 0.4) * 30;
        const bend = u < 0.35 ? -0.25 * (u / 0.35) : u < 0.6 ? 0.45 : 0.45 * (1 - (u - 0.6) / 0.4);
        return { ang, bend, shake: 0, sag: 8 };
      }
      if (f.state === 'bite') return { ang: 28, bend: 0.95, shake: 2.5, sag: 0 };
      if (f.dip > 0) return { ang: 38 - f.dip * 25, bend: 0.25 + f.dip * 1.2, shake: 1, sag: 5 };
      return { ang: 42 + Math.sin(now * 1.6) * 2.5, bend: 0.08 + Math.sin(now * 1.6 + 1) * 0.04, shake: 0, sag: 10 };
    }
    return null;
  },

  /** 낚싯대 점들 (화면 좌표) · 끝점 */
  rodPoints(camX, camY, pose, body) {
    const p = this.player, d = p.dir;
    const [fx, fy] = FWD[d], [hx0, hy0] = HAND[d];
    const hx = p.wx - camX + hx0 + body.dx, hy = p.wy - camY + hy0 + body.dy;
    const fk = fy ? 0.55 : 1; // 앞뒤로 향할 땐 짧아 보임 (원근)
    const side = fy ? (d === 'down' ? 0.45 : -0.45) : 0; // 위·아래 볼 땐 살짝 옆으로 벌려 잡음
    const a = (pose.ang * Math.PI) / 180;
    let tx = (Math.cos(a) * (fx + side) * fk) * ROD_L, ty = (Math.cos(a) * fy * fk - Math.sin(a)) * ROD_L;
    // 휨: 끝이 찌 쪽(앞·아래)으로 당겨짐
    const f = this.fish || this.fishFight;
    let bxv = fx, byv = 1;
    if (f) { const bx = f.bx - camX - hx, by = f.by - camY - hy, L = Math.hypot(bx, by) || 1; bxv = bx / L; byv = by / L; }
    const sh = pose.shake ? (Math.sin(performance.now() / 22) * pose.shake) : 0;
    const pts = [];
    const N = 10;
    for (let k = 0; k <= N; k++) {
      const u = k / N, b = pose.bend * u * u * ROD_L * 0.45;
      pts.push([hx + tx * u + bxv * b + (fy ? sh * u * u : 0), hy + ty * u + byv * b + (fy ? 0 : sh * u * u)]);
    }
    return { pts, hand: [hx, hy], tip: pts[N] };
  },

  drawRod(g, R) {
    const { pts, hand } = R;
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      g.fillStyle = k <= 3 ? COL.grip : k >= pts.length - 2 ? COL.tip : COL.rod;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps, x = Math.round(x0 + (x1 - x0) * u), y = Math.round(y0 + (y1 - y0) * u);
        g.fillRect(x, y, 1, 1);
        if (k <= 6) g.fillRect(x, y + 1, 1, 1); // 손잡이·밑동은 두껍게
      }
    }
    // 하이라이트 한 줄
    g.fillStyle = COL.rodHi;
    for (let k = 4; k < pts.length - 2; k += 2) g.fillRect(Math.round(pts[k][0]), Math.round(pts[k][1]) - 1, 1, 1);
    // 릴
    const [rx, ry] = [Math.round(pts[2][0]), Math.round(pts[2][1]) + 2];
    g.fillStyle = COL.reel; g.fillRect(rx - 1, ry, 3, 2);
    g.fillStyle = COL.reelHi; g.fillRect(rx - 1, ry, 1, 1);
    if (this.reeling && this.fight) { g.fillStyle = COL.reelHi; g.fillRect(rx + (Math.floor(performance.now() / 60) % 2 ? 2 : -2), ry + 1, 1, 1); }
    // 손 (주먹 1점)
    g.fillStyle = '#fff1d6'; g.fillRect(Math.round(hand[0]), Math.round(hand[1]), 2, 2);
  },

  /** 곤충채: 바라보는 쪽 앞을 크게 휘두름 */
  drawNet(g, camX, camY, body) {
    const A = this.act, p = this.player, d = A.dir;
    const [fx, fy] = FWD[d], [hx0, hy0] = HAND[d];
    const hx = p.wx - camX + hx0 + body.dx, hy = p.wy - camY + hy0 + body.dy;
    const u = ease(A.t / A.dur);
    // 옆을 볼 땐 위→아래로, 위·아래를 볼 땐 왼→오른쪽으로 쓸어냄
    const at = (v) => {
      const sw = -1.25 + v * 2.5;
      if (fx) return [fx * Math.cos(sw) * 28, Math.sin(sw) * 22 - 6];
      return [Math.sin(sw) * 28, fy * Math.cos(sw) * 16 - 8];
    };
    // 바람 자국 (지나온 길)
    for (let k = 1; k <= 7; k++) {
      const v = u - k * 0.05; if (v < 0) break;
      const [x, y] = at(v);
      g.fillStyle = COL.whoosh + (0.55 - k * 0.07).toFixed(2) + ')';
      { const l = Math.hypot(x, y) || 1; g.fillRect(Math.round(hx + (x / l) * 52), Math.round(hy + (y / l) * 52), 3, 2); }
    }
    const [ex, ey] = at(u);
    // 자루 → 테: 자루 방향 끝에 큰 고리 (반지름 R)
    const L = Math.hypot(ex, ey) || 1, ux = ex / L, uy = ey / L;
    const R = 11, reach = 30;
    const sx = hx + ux * reach, sy = hy + uy * reach; // 자루 끝 (테가 붙는 곳)
    const cx = sx + ux * R, cy = sy + uy * R;          // 테 중심
    const steps = reach;
    g.fillStyle = COL.stick;
    for (let s = 0; s <= steps; s++) { const v = s / steps; g.fillRect(Math.round(hx + ux * reach * v), Math.round(hy + uy * reach * v), 2, 2); }
    // 그물 자루: 휘두르는 반대쪽으로 바람에 불룩하게 처짐
    const [px, py] = at(Math.max(0, u - 0.12));
    const back = [ex - px, ey - py], bl = Math.hypot(back[0], back[1]) || 1;
    const bagX = cx - (back[0] / bl) * 9, bagY = cy - (back[1] / bl) * 9 + 3;
    g.fillStyle = COL.net;
    for (let j = -R - 9; j <= R + 9; j++) for (let i = -R - 9; i <= R + 9; i++) {
      const x = cx + i, y = cy + j;
      const inRim = i * i + j * j <= (R - 1) * (R - 1);
      const dbx = x - bagX, dby = y - bagY, inBag = dbx * dbx + dby * dby <= (R - 3) * (R - 3);
      if (!(inRim || inBag)) continue;
      // 그물코: 대각선 격자
      if ((((i + j) % 3) + 3) % 3 === 0 || (((i - j) % 3) + 3) % 3 === 0) g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    // 테: 두 겹 금속 고리 + 위쪽 하이라이트
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      g.fillStyle = '#7a4f1c'; g.fillRect(Math.round(cx + c * (R + 1)), Math.round(cy + sn * (R + 1)), 1, 1);
      g.fillStyle = sn < -0.3 ? '#ffe08a' : COL.netRim; g.fillRect(Math.round(cx + c * R), Math.round(cy + sn * R), 1, 1);
    }
    // 잡았으면 그물 안에 반짝
    if (A.ok && u > 0.6) { g.fillStyle = '#ffe08a'; g.fillRect(Math.round(bagX) - 1, Math.round(bagY), 3, 1); g.fillRect(Math.round(bagX), Math.round(bagY) - 1, 1, 3); }
    g.fillStyle = '#fff1d6'; g.fillRect(Math.round(hx), Math.round(hy), 2, 2);
  },

  /** 괭이: 머리 위로 들었다가 앞 땅을 콱 */
  drawHoe(g, camX, camY, body) {
    const A = this.act, p = this.player, d = A.dir;
    const [fx, fy] = FWD[d], [hx0, hy0] = HAND[d];
    const hx = p.wx - camX + hx0 + body.dx, hy = p.wy - camY + hy0 + body.dy;
    const u = A.t / A.dur;
    const ang = u < 0.55 ? 20 + (u / 0.55) * 95 : u < 0.72 ? 115 - ((u - 0.55) / 0.17) * 150 : -35;
    const a = (ang * Math.PI) / 180, L = 22, fk = fy ? 0.6 : 1;
    const side = fy ? (d === 'down' ? 0.4 : -0.4) : 0;
    const tx = Math.cos(a) * (fx + side) * fk * L, ty = (Math.cos(a) * fy * fk - Math.sin(a)) * L;
    g.fillStyle = COL.stick;
    for (let s = 0; s <= L; s++) { const v = s / L; g.fillRect(Math.round(hx + tx * v), Math.round(hy + ty * v), 1, 2); }
    // 날: 자루 끝에서 아래쪽으로 꺾인 쇠 (각도 따라)
    const ex = hx + tx, ey = hy + ty;
    const bx = -Math.sin(a) * (fx || 0.6) * 6, by = Math.cos(a) * 6;
    g.fillStyle = COL.hoe;
    for (let s = 0; s <= 6; s++) { const v = s / 6; g.fillRect(Math.round(ex + bx * v), Math.round(ey + by * v), 3, 2); }
    g.fillStyle = COL.hoeHi; g.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    // 내려찍는 순간 흙 튐
    if (u > 0.68 && u < 0.85) { g.fillStyle = '#8a5a2c'; for (let k = 0; k < 4; k++) g.fillRect(Math.round(ex + bx + (k - 1.5) * 3), Math.round(ey + by - 2 - (k % 2) * 2), 1, 1); }
    g.fillStyle = '#fff1d6'; g.fillRect(Math.round(hx), Math.round(hy), 2, 2);
  },

  /** 물뿌리개: 앞으로 기울여 졸졸 */
  drawCan(g, camX, camY, body, t) {
    const A = this.act, p = this.player, d = A.dir;
    const [fx, fy] = FWD[d], [hx0, hy0] = HAND[d];
    const hx = Math.round(p.wx - camX + hx0 + body.dx + fx * 3), hy = Math.round(p.wy - camY + hy0 + body.dy + 2 + fy * 2);
    const u = A.t / A.dur, tilt = u < 0.2 ? u / 0.2 : u > 0.85 ? (1 - u) / 0.15 : 1;
    const dir = fx || (d === 'down' ? 1 : -1);
    // 통 (6×5) + 손잡이 + 주둥이 (기울기에 따라 내려감)
    g.fillStyle = '#140f22'; g.fillRect(hx - 5, hy - 4 + Math.round(tilt), 11, 9);
    g.fillStyle = COL.canLo; g.fillRect(hx - 4, hy - 3 + Math.round(tilt), 9, 7);
    g.fillStyle = COL.can; g.fillRect(hx - 4, hy - 3, 8, 5);
    g.fillStyle = COL.canHi; g.fillRect(hx - 3, hy - 3, 4, 1);
    g.fillStyle = COL.canLo; g.fillRect(hx - 2 - dir * 2, hy - 6, 5, 1); g.fillRect(hx - 3 - dir * 2, hy - 5, 1, 2); g.fillRect(hx + 1 - dir * 2, hy - 5, 1, 2);
    const sx = hx + dir * 5, sy = hy - 1 + Math.round(tilt * 2);
    g.fillStyle = COL.can;
    for (let k = 0; k < 6; k++) g.fillRect(sx + dir * k, sy - k + Math.round(tilt * k * 1.2), 1, 2);
    // 물줄기
    if (tilt > 0.6) {
      const ox = sx + dir * 6, oy = sy - 5 + Math.round(tilt * 7);
      g.fillStyle = COL.drop;
      for (let k = 0; k < 8; k++) { const ph = (t * 14 + k * 0.7) % 6; g.fillRect(ox + dir * Math.round(ph * 0.6) + (k % 3) - 1, oy + Math.round(ph * 3), 1, 2); }
    }
  },

  /** 씨앗 심기: 쪼그려 앉아 손에서 씨앗 톡톡 */
  drawSeed(g, camX, camY, body) {
    const A = this.act, p = this.player, d = A.dir;
    const [fx, fy] = FWD[d];
    const u = A.t / A.dur;
    const x = Math.round(p.wx - camX + fx * 9), y = Math.round(p.wy - camY - 6 + fy * 6 + body.dy);
    g.fillStyle = COL.seed;
    for (let k = 0; k < 3; k++) { const v = clamp01(u * 2 - k * 0.25); if (v <= 0 || v >= 1) continue; g.fillRect(x + (k - 1) * 2, y + Math.round(v * 7), 1, 1); }
  },

  /** 그릴 것을 그림 목록에 넣음 (주인공보다 앞/뒤를 방향으로 정함) */
  pushActDrawables(out) {
    const p = this.player;
    const body = this.actBody();
    const behind = p.dir === 'up';
    const sy = p.wy + (behind ? -0.5 : 0.5);
    const pose = this.rodPose();
    if (pose) {
      out.push({ sy, draw: (g, camX, camY) => { const R = this.rodPoints(camX, camY, pose, body); this._rodTip = [R.tip[0] + camX, R.tip[1] + camY]; this._rodPull = pose.pull; this.drawRod(g, R); } });
    } else this._rodTip = null;
    const A = this.act;
    if (!A) return;
    const draws = { net: 'drawNet', hoe: 'drawHoe', water: 'drawCan', plant: 'drawSeed' };
    const fn = draws[A.type];
    if (fn) out.push({ sy: A.type === 'plant' ? p.wy + 0.5 : sy, draw: (g, camX, camY) => this[fn](g, camX, camY, body, performance.now() / 1000) });
  },

  /** 던지는 중인 찌의 위치 (낚싯대 끝에서 포물선으로 날아감) */
  bobberPos(f) {
    if (f.castT === undefined || f.castT >= ACT_LEN.cast * 0.78 || !this._rodTip) return null;
    const u0 = ACT_LEN.cast * 0.42;
    if (f.castT < u0) return { x: this._rodTip[0], y: this._rodTip[1], air: true };
    const u = clamp01((f.castT - u0) / (ACT_LEN.cast * 0.78 - u0));
    const [sx, sy] = this._rodTip;
    return { x: sx + (f.bx - sx) * u, y: sy + (f.by - sy) * u - Math.sin(u * Math.PI) * 26, air: true };
  },
};

export { ACT_LEN };
