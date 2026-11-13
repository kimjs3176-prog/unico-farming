import { withJosa as josaW } from '../game/sim/josa.js';
import { rollBug } from '../game/sim/fishing.js';
import { ITEMS } from '../game/sim/items.js';
import { Spr } from './pxl.js';

/**
 * 곤충 채집 (3D 판과 같은 rollBug: 낮·밤·비에 따라 종류가 바뀜)
 * 꽃밭·언덕 위를 날아다니거나(나비·잠자리·매미…) 땅에서 톡톡 뛰는(메뚜기·귀뚜라미…) 곤충에게 가까이 가서 E → 곤충채
 */
const T = 32;
const MAX = 8;
/** 기존 곤충 색 (새 곤충은 ITEMS.color) */
const COL = { bug_butterfly: 0xf4f4f0, bug_swallowtail: 0xf6d64a, bug_dragonfly: 0xe0413a, bug_ladybug: 0xd93025, bug_beetle: 0x5a3a22, bug_firefly: 0xd8ff6a };
const GROUND = new Set(['bug_ladybug', 'bug_beetle']);
export const isGround = (k) => GROUND.has(k) || !!ITEMS[k]?.ground;
const hex = (n) => `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;

export function initBugs(g) {
  // 곤충이 나오는 곳: 꽃밭 + 언덕·연못가
  g.bugSpots = g.map.objs.filter((o) => o.type === 'flowers' || o.type === 'reeds').map((o) => ({ x: o.x * T + 16, y: o.y * T + 22 }));
  g.bugs = [];
  g.bugT = 1;
}

/** 곤충 한 마리 그림 (8×7, 날개 펄럭 2프레임) → 캔버스 */
export function bugSprite(kind, f) {
  const c = document.createElement('canvas'); c.width = 9; c.height = 8;
  const g = c.getContext('2d');
  const col = hex(COL[kind] ?? ITEMS[kind]?.color ?? 0xffffff);
  const px = (x, y, cc = col) => { g.fillStyle = cc; g.fillRect(x, y, 1, 1); };
  if (isGround(kind)) {
    g.fillStyle = col; g.fillRect(2, 3, 5, 3); g.fillRect(3, 2, 3, 1);
    px(1, 6, '#2a2140'); px(7, 6, '#2a2140'); px(3, 6, '#2a2140'); px(5, 6, '#2a2140');
    px(7, 3, '#140f22'); if (f) { px(1, 2, '#2a2140'); px(8, 1, '#2a2140'); }
    if (kind === 'bug_ladybug') { px(3, 4, '#140f22'); px(5, 3, '#140f22'); }
  } else {
    px(4, 2, '#2a2140'); px(4, 3, '#2a2140'); px(4, 4, '#2a2140'); px(4, 5, '#2a2140');
    const up = f === 0;
    g.fillStyle = col;
    if (kind === 'bug_dragonfly' || kind === 'bug_damselfly') { g.fillRect(0, up ? 2 : 3, 4, 1); g.fillRect(5, up ? 2 : 3, 4, 1); px(4, 6, col); px(4, 7, col); }
    else { g.fillRect(1, up ? 0 : 2, 3, 3); g.fillRect(5, up ? 0 : 2, 3, 3); if (!up) { px(2, 5); px(6, 5); } }
    if (kind === 'bug_swallowtail') { px(2, up ? 1 : 3, '#140f22'); px(6, up ? 1 : 3, '#140f22'); }
    if (kind === 'bug_honeybee') { px(4, 3, '#f2b233'); px(4, 5, '#f2b233'); }
  }
  return c;
}

export const BugMethods = {
  bugTick(dt, busy) {
    if (busy) return;
    const night = this.night > 0.6;
    // 밤·낮이 바뀌면 맞지 않는 곤충은 천천히 사라짐
    for (const b of this.bugs) { const nightBug = b.kind === 'bug_firefly' || !!ITEMS[b.kind]?.night; if (nightBug !== night && Math.random() < dt * 0.05) b.gone = true; }
    this.bugs = this.bugs.filter((b) => !b.gone);
    this.bugT -= dt;
    if (this.bugT <= 0 && this.bugs.length < MAX && this.bugSpots.length && this.player.y < 70) {
      this.bugT = 4 + Math.random() * 6;
      // 주인공 근처(화면 안쪽) 꽃밭 중 하나
      const near = this.bugSpots.filter((s) => Math.hypot(s.x - this.player.wx, s.y - this.player.wy) < 520);
      const sp = (near.length ? near : this.bugSpots)[Math.floor(Math.random() * (near.length || this.bugSpots.length))];
      const kind = rollBug(Math.random, { night, raining: this.raining });
      this.bugs.push({ kind, hx: sp.x + (Math.random() - 0.5) * 30, hy: sp.y + (Math.random() - 0.5) * 16, ph: Math.random() * 6, x: sp.x, y: sp.y, h: 0, hop: 0 });
    }
    for (const b of this.bugs) {
      b.ph += dt;
      if (isGround(b.kind)) {
        // 톡톡 뛰며 기어 다님
        if (b.hop <= 0 && Math.random() < dt * 0.6) { b.hop = 0.35; b.tx = b.hx + (Math.random() - 0.5) * 30; b.ty = b.hy + (Math.random() - 0.5) * 14; }
        if (b.hop > 0) { b.hop -= dt; b.x += ((b.tx ?? b.x) - b.x) * Math.min(1, dt * 6); b.y += ((b.ty ?? b.y) - b.y) * Math.min(1, dt * 6); b.h = Math.sin((b.hop / 0.35) * Math.PI) * 5; }
        else b.h = 0;
      } else {
        // 8 자로 팔랑팔랑 (잠자리는 넓고 빠르게)
        const fast = b.kind === 'bug_dragonfly' || b.kind === 'bug_damselfly' ? 1.8 : 1;
        b.x = b.hx + Math.sin(b.ph * 0.9 * fast) * 22 * fast; b.y = b.hy + Math.sin(b.ph * 1.8 * fast) * 8;
        b.h = 14 + Math.sin(b.ph * 2.3) * 5;
      }
    }
  },

  bugNear() {
    const pl = this.player;
    const fx = pl.wx + ({ left: -16, right: 16 }[pl.dir] || 0), fy = pl.wy - 6 + ({ up: -16, down: 16 }[pl.dir] || 0);
    let best = null, bd = 34;
    for (const b of this.bugs) { const d = Math.hypot(b.x - fx, b.y - fy); if (d < bd) { bd = d; best = b; } }
    return best;
  },

  catchBug(b) {
    const ok = Math.random() < (isGround(b.kind) ? 0.9 : 0.8);
    this.audio.play('shoo', 0.6);
    this.startAct('net', { ok });
    this.bugs.splice(this.bugs.indexOf(b), 1);
    if (!ok) { this.ui.toast('휙! 아깝게 놓쳤어요', 'bug'); return; }
    this.econ.addItem(b.kind);
    const r = this.book.add(b.kind, { day: this.day });
    this.report('bug'); this.audio.play('harvest');
    this.popIcon('bug', b.x, b.y - b.h - 8);
    this.ui.toast(`${josaW(ITEMS[b.kind].name, '을/를')} 잡았어요!${r.isNew ? ' (도감 등록!)' : ''}`, 'bug');
    this.checkBook?.();
  },

  drawBugs(g, camX, camY, t) {
    const S = this.S;
    S.bugImg ||= {};
    for (const b of this.bugs) {
      const f = isGround(b.kind) ? (b.hop > 0 ? 1 : 0) : Math.floor(t * (b.kind === 'bug_dragonfly' ? 20 : 10) + b.ph) % 2;
      const key = b.kind + f;
      const img = (S.bugImg[key] ||= bugSprite(b.kind, f));
      const x = Math.round(b.x - camX), y = Math.round(b.y - camY);
      if (x < -10 || y < -30 || x > 4000 || y > 4000) continue;
      if (b.h > 2) { g.fillStyle = 'rgba(20,15,40,0.25)'; g.fillRect(x - 2, y, 5, 1); }
      g.drawImage(img, x - 4, y - 6 - Math.round(b.h));
      if (b.kind === 'bug_firefly') { g.fillStyle = 'rgba(232,255,144,0.9)'; g.fillRect(x - 1, y - 5 - Math.round(b.h), 3, 2); }
    }
  },
};
