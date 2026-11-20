import { josa } from '../sim/josa.js';
import * as THREE from 'three';
import { Unico } from '../unico.js';
import { LAYOUT } from '../world.js';
import { VILLAGERS } from '../sim/villagers.js';
import { CROPS } from '../sim/crops.js';
import { VILLAGER_SPECIES, villagerName } from '../species.js';
import { talkShot, speakerShot, cheatYaw, liftFor, hudFrac } from '../cutscene.js';
import { setHeroLabel, setLabelOccluders } from '../label.js';
import { heightAt } from '../terrain.js';
import { pickLine, remember, REACT, OUT_OF_LINES, OUT_OF_LINES_BY, WAKE, FESTIVAL_LINES } from '../sim/villager_lines.js';
import { festivalAt, festState, takeFood } from '../sim/festival.js';
import { ITEMS, inSeason } from '../sim/items.js';
import { slotAt, legOf, hourOf, isNight, canDepart, ROUTINE_CHECK } from '../sim/routine.js';
import { seasonOf } from '../sim/season.js';

const ROLE_ICON = { merchant: '🛒', researcher: '🔬', guide: '📣', granny: '🌾', kid: '🦋', fisher: '🎣' };
/** 대화창 이름표 색 (역할별) */
const NPC_COLOR = { merchant: '#f28c28', researcher: '#8e7cc3', guide: '#6dbb4f', granny: '#a07e5c', kid: '#f28bb0', fisher: '#3170c9' };
const BYE = { merchant: '좋은 거래였어! 또 와~', researcher: '데이터가 쌓이면 또 알려 줄게!', guide: '궁금한 거 있으면 언제든 불러 줘!', granny: '조심히 가거라, 아가.', kid: '다음에 또 같이 놀자!', fisher: '물 조심하고, 손맛 좋은 하루 되렴 🎣' };

/** 대체 유니콘 주민(동물 메시를 못 받았을 때)의 옷 */
const OUTFITS = {
  merchant: { hat: 'straw', scarf: 'red' },
  researcher: { goggles: true, scarf: 'blue', sprout: true },
  guide: { scarf: 'green', sprout: true },
  granny: { hat: 'straw', scarf: 'blue' },
  kid: { scarf: 'red', sprout: true },
  fisher: { hat: 'straw', scarf: 'blue' },
};

const STARTLE = ['깜짝이야!', '으악! 트랙터다!', '조심해~!', '어이쿠!'];
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** 시선: 이만큼(m) 안이면 플레이어 얼굴을 봄, 이만큼 밖으로 2초 지나면 그만 봄. 몸은 고개 한계(1.1rad)를 1.2초 넘게 넘어야 돌림 */
const LOOK_IN = 6, LOOK_OUT = 7, LOOK_OUT_T = 2, BODY_TURN = 1.1, BODY_TURN_T = 1.2, HERO_LOOK = 3.5;
/** 일과 걷기: 속도(m/s), 카메라에서 이만큼 멀면 걷지 않고 바로 옮김, 밤에 플레이어가 이만큼 멀면 졸기 */
const WALK_SPD = 1.6, SNAP_FAR = 30;
/** 밤 졸기: 플레이어가 7m 밖에 3초 넘게 있으면 졸고, 5m 안으로 오면 깸 (경계를 오가도 깜빡이지 않게). 깨며 하는 한마디는 하룻밤 한 번 */
export const DOZE_FAR = 7, WAKE_NEAR = 5, DOZE_WAIT = 3;
/** 💤 말풍선이 보이는 카메라 거리 (낮음 품질은 가까이만 — 그리기 수) */
const ZZZ_FAR = { low: 15, other: 30 };
/** 대화 상대 고르기: 2.6m 안에서 거리 + 보는 방향 벌점(등 뒤 주민일수록 덜 고름) */
export const TALK_R = 2.6, TALK_FACE_W = 2;
export const talkScore = (d, fx, fz, dx, dz) => d + TALK_FACE_W * (1 - (fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1));
/** 일하는 자리 효과는 카메라에서 이만큼(m) 안에서만: 호미질 흙먼지·반딧불이 */
const FX_NEAR = 15;
const FIREFLY_N = 5;
/** 같은 자리인가 (일과 자리는 좌표로 비교 — 밤 12시를 넘을 때 같은 벤치가 다른 칸이어도 움직이지 않게) */
const sameSpot = (a, b) => a === b || (!!a && !!b && a.x === b.x && a.z === b.z);
/** 비 올 때 우산 색 (두 색 줄무늬): 여우 주황, 강아지 노랑, 할머니 꽃분홍, 너구리 보라, 토끼 하늘, 고양이 파랑 */
const UMB_COLORS = { merchant: [0xf28c28, 0xffe2b8], researcher: [0x8e7cc3, 0xe6defa], guide: [0xf6c63c, 0xfff3c4], granny: [0xe86a92, 0xfff0f4], kid: [0x6cc4ec, 0xffffff], fisher: [0x3170c9, 0xd6e6fb] };
/** 가로 화면 대화 구도: 카메라 높이·시선 높이 상한 — 아래 대화창(선택지 6개면 화면 아래 약 64%)이 얼굴을 가리지 않게
 *  얼굴 가운데를 화면 위 30% 안에 둠 (세로 화면은 cutscene.talkShot 이 이미 시선을 더 낮춤 — 그대로) */
const TALK_CAM_Y = 2.0, TALK_LOOK_Y = 0;
/** 앞모습 대화 구도: 말하는 주민 정면에서 돈 각도(지금 카메라 쪽 먼저, 55° 넘으면 쓰지 않음), 두 얼굴 최소 간격(화면 너비 비율),
 *  구도를 정한 뒤 몸을 카메라 쪽으로 살짝 돌리는 양 (주민 17°, 나 12° — 작아서 어색하지 않고 옆모습·뒤통수가 줄어듦) */
const FRONT_THETA = [35, 45, 25, 55].map((d) => (d * Math.PI) / 180), FRONT_SEP = 0.15;
const CHEAT_NPC = (17 * Math.PI) / 180, CHEAT_ME = (12 * Math.PI) / 180;
/** 대화 구도에서 카메라→시선 선에 이만큼(m) 가까운 다른 캐릭터가 있으면 다른 구도, 카메라에서 이만큼(m) 안의 캐릭터는 이름표를 숨김 */
const TALK_CLEAR = 1.2, TALK_HIDE = 6;
/** 내 이름표 흐리게: 내 뒤(카메라에서 더 먼 쪽) 5m 안 주민이 카메라→내 이름표 방향 12° 안에 있고, 화면에서 그 얼굴·이름표가 내 이름표에 겹칠 때 */
const PL_FADE_R = 5, PL_FADE_COS = Math.cos((12 * Math.PI) / 180), PL_FADE_A = 0.35;
const _lv = new THREE.Vector3(), _nv = new THREE.Vector3();
/** 대화 구도 화면 검사: 대화창 윗변 가정(선택지 5개 + 설명 줄, 화면 위에서 비율 — 가로 0.42 · 세로 0.46 · 낮은 가로폰 0.48),
 *  이름 칩은 창 위로 28px, 주민 턱(얼굴 - 0.25m)은 그보다 0.04(NDC 0.08) 위, 내 몸 너비는 화면 28% 까지 (좁은 세로 폰은 40%), 화면 끝에 40% 넘게 잘리면 안 됨 */
export const TALK_FRAME = { chip: 28, room: 0.04, heroW: 0.24, heroWTall: 0.4, heroClip: 0.4, heroR: 0.6, heroTop: 1.85, lowH: 500, lowRoom: 0.12 };
export const talkBoxTop = (aspect, h) => (aspect < 1 ? 0.46 : h <= TALK_FRAME.lowH ? 0.48 : 0.42);
const _fc = new THREE.PerspectiveCamera(), _fr = new THREE.Vector3(), _fp = new THREE.Vector3();

/** 반딧불이 둥근 빛 (가운데 밝고 가장자리 투명, 32px) */
function glowDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** 점 (px, pz) 에서 선분 (ax, az)–(bx, bz) 까지 거리 (바닥 평면) */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

/** 마을 주민: 매일 인사, 선물, 부탁, 우정 하트 */
export class NPCs {
  constructor(game) {
    this.game = game;
    this.list = Object.entries(LAYOUT.npcs).map(([id, n]) => {
      // 3D 판은 동물 주민 (종·이름은 species.js, 도트판 이름은 sim/villagers.js 그대로). 메시가 없으면 Unico 가 유니콘으로 대체
      const u = new Unico(game.assets, { outfit: OUTFITS[id], palette: id, species: n.species ?? VILLAGER_SPECIES[id] });
      const name = u.species ? villagerName(id) ?? n.name : VILLAGERS[id]?.name ?? n.name;
      u.setName(`${ROLE_ICON[id] || ''} ${name}`, '#231916', 'rgba(255,248,225,0.92)');
      u.group.position.set(n.x, 0, n.z);
      u.facing = u.yaw = Math.atan2(0 - n.x, 9 - n.z); // 스폰 쪽을 바라봄
      game.world.scene.add(u.group);
      // 장애물은 주민마다 하나 (일과로 자리를 옮기면 같이 옮김, 걷는 동안은 r 0 = 꺼짐)
      const ob = n.wander ? null : { x: n.x, z: n.z, r: u.species?.obstacleR || 0.7 };
      if (ob) game.world.obstacles.push(ob);
      return {
        id, u, n, name, ob, obR: ob?.r ?? 0, recent: [], target: null, wait: 2, nextIdle: this._idleGap(u),
        home: { x: n.x, z: n.z }, homeFacing: u.facing, cur: null, route: null, checkT: 0,
        look: new THREE.Vector3(), glance: new THREE.Vector3(), farT: 0, turnT: 0, turnTo: null,
      };
    });
    this.talking = null; // 지금 대화 중인 주민
    this._heroLook = new THREE.Vector3();
    // 할머니 호미질: 내리찍을 때마다 흙먼지 (가까울 때만)
    for (const e of this.list) e.u.onHit = (k) => {
      if (k !== 'hoe' || e.cur?.act !== 'hoe' || !this._camNear(e)) return;
      const p = e.u.group.position, f = e.u.yaw;
      game.fx?.burst?.(p.x + Math.sin(f) * 0.7, 0.15, p.z + Math.cos(f) * 0.7, 0x7a5636, 3);
    };
    this._ff = null; // 꼬마 반딧불이 (처음 보일 때 만듦)
  }

  /** 주민의 지금 위치 (일과로 옮겨 다님 — 퀘스트 화살표·자동 진행이 씀) */
  posOf(id) { return this.list.find((e) => e.id === id)?.u.group.position ?? null; }

  /** 트랙터에 깜짝 놀람: 펄쩍 + ❗ + 말풍선, 돌아다니던 주민은 트랙터 반대쪽으로 비켜남 (4초에 한 번) */
  startle(e, from) {
    const now = performance.now() / 1000;
    if ((e.startleUntil || 0) > now) return false;
    e.startleUntil = now + 4;
    const p = e.u.group.position;
    e.u.facing = Math.atan2(from.x - p.x, from.z - p.z); // 트랙터 쪽을 돌아봄
    e.u.playAction('startle', 1.3);
    const say = [...STARTLE, ...(e.u.species?.startle || [])];
    this._wake(e, false); // 💤 를 먼저 내리고 놀란 말
    e.u.say(say[Math.floor(Math.random() * say.length)], 1.8);
    e.idle = 0;
    if (e.n.wander && !e.route) { const dx = p.x - from.x, dz = p.z - from.z, l = Math.hypot(dx, dz) || 1; e.target = { x: p.x + (dx / l) * 2.5, z: p.z + (dz / l) * 2.5 }; e.wait = 0; e.spd = 3.5; }
    this.game.audio.play('startle', 0.35);
    return true;
  }

  /** 다음 대기 동작까지 시간 (종마다 간격이 다름) */
  _idleGap(u) {
    const r = u.species?.idleEvery || [8, 12];
    return r[0] + Math.random() * (r[1] - r[0]);
  }

  update(dt, playerPos) {
    let hit = null, hd = TALK_R, hs = Infinity;
    const g = this.game, W = g.world, cam = g.followCam.camera;
    const pf = g.player?.unico?.facing ?? 0, pfx = Math.sin(pf), pfz = Math.cos(pf);
    // 트랙터가 빠르게 스쳐 지나가면 가까운 주민이 놀람
    const tr = g.ride, tv = tr?.driving ? tr.vehicle : null;
    // 일과: 시각·비 (1초마다 자리 확인), 플레이어 얼굴 높이
    const hour = hourOf(W.time ?? 0.3), night = isNight(hour), rain = W.weatherKind === 'rain' || W.weatherKind === 'storm';
    const fest = festivalAt(W.day ?? 1, W.time ?? 0.3)?.id ?? null; // 축제 마당이 열려 있으면 네 주민이 모임
    const pHeadY = (g.player?.position?.y ?? 0) + (g.player?.unico?.headH ?? 1.2);
    for (const e of this.list) {
      const p = e.u.group.position, u = e.u;
      if (tv && Math.abs(tv.speed) > 1.2 && Math.hypot(p.x - tv.x, p.z - tv.z) < 2.9 && !((e.bellUntil || 0) > performance.now() / 1000)) this.startle(e, tv); // 자전거 종을 들었으면 안 놀람
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      const talking = this.talking === e;
      this._routine(e, dt, d, hour, rain, talking, cam, fest);
      // 비: 우산 (바뀔 때만)
      if (!!e.umb !== rain) { e.umb = rain; u.setUmbrella(rain, UMB_COLORS[e.id]); }
      if (e.route) this._walkRoute(e, dt);
      // 꼬마는 들판을 돌아다님 (플레이어가 가까우면 멈춰서 바라봄, 비 오면 좁은 곳에서만)
      else if (e.n.wander && !e.cur?.at && d > 3 && !talking) this._wander(e, dt, rain);
      else {
        u.moving = false;
        e.spd = 0;
      }
      const walking = u.moving;
      // ---- 시선: 6m 안이면 고개로 플레이어를 봄 (몸은 그대로), 고개 한계를 1.2초 넘게 넘으면 그때 몸을 돌림 ----
      if (walking) { u.lookTarget = null; e.turnT = 0; e.turnTo = null; }
      else {
        if (talking || (d < LOOK_IN && !e.dozing)) { u.lookTarget = e.look.set(playerPos.x, pHeadY, playerPos.z); e.farT = 0; }
        else if (u.lookTarget && (d > LOOK_OUT || e.dozing)) { e.farT += dt; if (e.farT > LOOK_OUT_T || e.dozing) u.lookTarget = null; }
        const toP = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        if (u.faceLock != null) { u.facing = u.faceLock; e.turnTo = null; } // 대화 구도에서 카메라 쪽으로 살짝 돈 방향 (cinema.release 가 풂)
        else if (!e.n.wander || e.cur?.at || d <= 3) {
          if (u.lookTarget && !talking) {
            if (Math.abs(wrapA(toP - u.yaw)) > BODY_TURN) e.turnT += dt; else e.turnT = 0;
            if (e.turnT > BODY_TURN_T) { e.turnTo = toP; e.turnT = 0; }
          } else if (!u.lookTarget) { e.turnT = 0; e.turnTo = null; }
          // 몸 돌리기는 천천히 (휙 돌지 않게), 아무도 안 보면 원래 보던 쪽(가판대 등)으로 돌아감 (꼬마는 들판에선 그대로)
          const want = e.turnTo ?? (u.lookTarget || e.n.wander && !e.cur?.at ? null : e.restFacing ?? e.homeFacing);
          if (want != null) u.facing += wrapA(want - u.facing) * (1 - Math.exp(-dt * (e.turnTo != null ? 3 : 1.5)));
        }
      }
      // 플레이어를 보는 정도(귀 쫑긋·꼬리·눈인사), 우정 하트, 플레이어 쪽 상대 각도
      u.attention += ((d < 5 ? 1 : 0) - u.attention) * (1 - Math.exp(-4 * dt));
      if (u.species) {
        u.hearts = g.villagers.hearts(e.id);
        u.attnYaw = wrapA(Math.atan2(playerPos.x - p.x, playerPos.z - p.z) - u.yaw);
        // 처음 가까이 오면 반응: 강아지 갸웃, 친한 여우는 꼬리 흔들며 손 인사 (인사하면 몸도 플레이어 쪽으로)
        if (d < 4 && !e.near) {
          e.near = true;
          if (!u.action && !u.moving && !e.dozing) {
            if (u.species.id === 'puppy') { u.playAction('tilt', 1.3); e.turnTo = Math.atan2(playerPos.x - p.x, playerPos.z - p.z); }
            else if (u.species.id === 'fox' && u.hearts >= 3) { u.playAction('wave', 1.5); e.turnTo = Math.atan2(playerPos.x - p.x, playerPos.z - p.z); }
          }
        } else if (d > 6) e.near = false;
      }
      // 밤: 플레이어가 멀면 꾸벅꾸벅 (💤), 가까이 오면 깸 (밤낚시·반딧불이 자리는 깨어 있음)
      if (!e.dozing && night && d > DOZE_FAR && !walking && !talking && (!u.action || u.action === e.cur?.act) && !e.cur?.awake) {
        e.dozeT = (e.dozeT || 0) + dt;
        if (e.dozeT > DOZE_WAIT) { e.dozing = true; e.dozeT = 0; u.playAction('doze', 0); u.say('💤', 1e6, ZZZ_FAR[g.quality?.level === 'low' ? 'low' : 'other']); e.zzz = u.bubble; } // 하던 일(돈 세기 등)은 멈추고 졸기
      } else if (!e.dozing) e.dozeT = 0;
      else if (!night || d <= WAKE_NEAR || talking || walking || e.cur?.awake) {
        const nightKey = hour >= 12 ? W.day : W.day - 1; // 밤 12시를 넘어도 같은 밤
        const say = night && d <= WAKE_NEAR && !talking && e.wokeNight !== nightKey;
        if (say) e.wokeNight = nightKey;
        this._wake(e, say);
      }
      // 대기 동작: 일하는 자리면 그 일(낚시·호미질·태블릿…)을 자주, 아니면 성격 동작
      e.idle = (e.idle || 0) + dt;
      if (e.idle > e.nextIdle && !u.moving && !e.dozing && !talking) {
        e.idle = 0;
        const work = e.cur?.act;
        if (work && d > 3.5) { u.playAction(work, 3 + Math.random() * 2); e.nextIdle = 2.8 + Math.random(); }
        else {
          e.nextIdle = this._idleGap(u);
          const pool = [e.n.pose, ...(u.species?.idles || [])];
          u.playAction(pool[Math.floor(Math.random() * pool.length)], 2);
        }
      }
      u.update(dt, cam);
      if (d < TALK_R) { const sc = talkScore(d, pfx, pfz, p.x - playerPos.x, p.z - playerPos.z); if (sc < hs) { hs = sc; hd = d; hit = e; } }
    }
    this._heroGaze(playerPos);
    this._fadePlayerLabel(dt, playerPos);
    this._fireflies(dt, hour);
    this.lookAt = g.player?.unico?.lookTarget ?? null;
    if (!hit) return null;
    const v = g.villagers;
    const hearts = v.hearts(hit.id);
    return { d: hd, label: `💬 ${hit.name}${josa(hit.name, '와/과')} 대화 ${'❤️'.repeat(hearts)}${'🤍'.repeat(5 - hearts)}`, key: 'npc', onInteract: () => this.talk(hit) };
  }

  /** 내 캐릭터 시선: 대화 중이면 말하는 주민 얼굴, 아니면 3.5m 안 가장 가까운 주민 얼굴 (없으면 두리번) */
  _heroGaze(pp) {
    const hu = this.game.player?.unico;
    if (!hu) return;
    let best = this.talking, bd = HERO_LOOK;
    if (!best && !this.game.home?.inside && !hu.riding) for (const e of this.list) { const q = e.u.group.position, d = Math.hypot(q.x - pp.x, q.z - pp.z); if (d < bd) { bd = d; best = e; } }
    if (!best) { hu.lookTarget = null; return; }
    const q = best.u.group.position;
    hu.lookTarget = this._heroLook.set(q.x, q.y + best.u.headH, q.z);
  }

  /** 카메라에서 FX_NEAR 안인가 */
  _camNear(e) {
    const c = this.game.followCam?.camera;
    return !!c && c.position.distanceTo(e.u.group.position) < FX_NEAR;
  }

  /** 꼬마가 연못가에서 곤충채를 들면 반딧불이 다섯 마리가 둘레를 맴돎 (가까울 때만, 그리기 1번) */
  _fireflies(dt, hour) {
    const k = this.list.find((e) => e.id === 'kid');
    const on = !!k && k.cur?.act === 'net' && !k.route && (hour >= 19 || hour < 5) && this._camNear(k);
    if (!on) { if (this._ff) this._ff.visible = false; return; }
    if (!this._ff) {
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(FIREFLY_N * 3), 3));
      const mat = new THREE.PointsMaterial({ color: 0xe4ff7a, size: 0.22, map: glowDot(), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
      this._ff = new THREE.Points(geo, mat);
      this._ff.frustumCulled = false;
      this._ffT = 0;
      this.game.world.scene.add(this._ff);
    }
    const ff = this._ff, pos = ff.geometry.attributes.position, c = k.u.group.position;
    ff.visible = true;
    this._ffT += dt;
    for (let i = 0; i < FIREFLY_N; i++) {
      const a = this._ffT * (0.5 + i * 0.13) + i * 1.3, r = 0.7 + 0.35 * Math.sin(this._ffT * 0.7 + i);
      pos.setXYZ(i, c.x + Math.sin(a) * r, c.y + 0.7 + 0.45 * Math.sin(this._ffT * 1.1 + i * 2), c.z + Math.cos(a) * r);
    }
    pos.needsUpdate = true;
    ff.material.opacity = 0.65 + 0.3 * Math.sin(this._ffT * 3);
  }

  /** 졸던 주민 깨우기 (say = 하품하며 한마디) */
  _wake(e, say) {
    if (!e.dozing) return;
    e.dozing = false;
    const u = e.u;
    if (u.action === 'doze') u.clearAction();
    if (u.bubble && u.bubble === e.zzz) u.bubbleUntil = u.t; // 💤 말풍선만 내림 (그사이 다른 말풍선이면 그대로)
    e.zzz = null;
    if (say) { u.playAction(u.species?.id === 'cat' ? 'stretch' : 'think', 1.4); u.say(WAKE[e.id] || '하암…', 2.5); }
  }

  /**
   * 하루 일과: 1초마다 지금 있을 자리를 보고, 자리가 바뀌었으면 (플레이어가 4m 밖이고 대화 중이 아닐 때) 걸어서 옮김.
   * 카메라에서 30m 넘게 멀거나 처음(불러온 직후)이면 걷지 않고 바로 그 자리로
   */
  _routine(e, dt, d, hour, rain, talking, cam, fest = null) {
    e.checkT -= dt;
    if (e.checkT > 0) return;
    e.checkT = ROUTINE_CHECK;
    // 두리번거릴 때 가끔 볼 곳: 12m 안 가장 가까운 다른 주민
    const p = e.u.group.position;
    let gb = null, gd = 12;
    for (const o of this.list) { if (o === e) continue; const q = o.u.group.position, dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < gd) { gd = dd; gb = q; } }
    e.u.glanceAt = gb ? e.glance.set(gb.x, gb.y + 1.2, gb.z) : null;
    const want = slotAt(e.id, hour, rain, fest);
    if (!want || e.route) return;
    const curAt = e.cur?.at ?? null, wantAt = want.at ?? null;
    if (e.cur && sameSpot(curAt, wantAt)) { e.cur = want; return; }
    if (!e.cur && !wantAt) { e.cur = want; e.placed = true; return; }
    const far = !e.placed || !cam?.position || cam.position.distanceTo(p) > SNAP_FAR;
    if (!far && !canDepart(d, talking || !!this.game.dialogue?.active)) return;
    // 경로: (지금 자리 → 제자리) + (제자리 → 새 자리). 꼬마의 제자리는 들판이라 마지막 경유점에서 다시 뛰어다님
    const pts = [];
    if (curAt) pts.push(...legOf(e.home, e.cur, true).slice(1));
    else if (!e.n.wander) pts.push({ x: e.home.x, z: e.home.z });
    if (wantAt) pts.push(...legOf(e.home, want).slice(e.n.wander && !curAt ? 1 : 1));
    else if (e.n.wander && pts.length > 1) pts.pop();
    e.wantSlot = want;
    if (far || !pts.length) { const last = pts[pts.length - 1]; if (last) { p.x = last.x; p.z = last.z; } this._arrive(e); e.placed = true; return; }
    e.placed = true;
    e.route = pts; e.wait = 0;
    if (e.ob) e.ob.r = 0; // 걷는 동안 장애물 끔 (자기 자신에 걸리지 않게)
    this._wake(e, false);
    e.u.lookTarget = null;
    if (e.u.action && e.u.action !== 'talk') e.u.clearAction();
  }

  /** 자리에 닿음: 장애물을 새 자리로, 그 자리 방향·일 */
  _arrive(e) {
    const p = e.u.group.position, s = e.wantSlot;
    e.route = null; e.cur = s; e.u.moving = false; e.spd = 0;
    if (e.ob) { e.ob.x = p.x; e.ob.z = p.z; e.ob.r = e.obR; }
    e.restFacing = s?.at ? s.face : e.homeFacing;
    if (s?.at) e.u.facing = s.face;
    e.idle = e.nextIdle; // 바로 일 시작
  }

  /** 경유점 따라 걷기 (꼬마 걸음과 같은 식: 붙는 속도·도착 감속·소품 밀어내기·오래 막히면 경유점으로) */
  _walkRoute(e, dt) {
    const t = e.route[0];
    if (this._stepToward(e, t.x, t.z, dt, WALK_SPD, e.route.length === 1)) {
      e.route.shift();
      if (!e.route.length) this._arrive(e);
    } else if (e.blocked > 2) { const p = e.u.group.position; p.x = t.x; p.z = t.z; e.blocked = 0; }
  }

  /** (tx, tz) 쪽으로 한 걸음. 닿으면 true */
  _stepToward(e, tx, tz, dt, top, brake = true) {
    const p = e.u.group.position, dx = tx - p.x, dz = tz - p.z, len = Math.hypot(dx, dz);
    if (len < 0.25) return true;
    // 출발할 때 천천히 붙는 속도, 도착할 때 감속 (도착 0.8m 전부터)
    const want = top * (brake ? Math.min(1, len / 0.8 + 0.25) : 1);
    e.spd = (e.spd || 0) + (want - (e.spd || 0)) * (1 - Math.exp(-dt * 6));
    const step = Math.min(len, e.spd * dt);
    const nv = (this._nv ||= new THREE.Vector3()).set(p.x + (dx / len) * step, 0, p.z + (dz / len) * step);
    this.game.world.resolveCollision(nv, 0.4); // 소품을 통과하지 않게
    if (Math.hypot(nv.x - p.x, nv.z - p.z) < step * 0.3) e.blocked = (e.blocked || 0) + dt; else e.blocked = 0;
    p.x = nv.x; p.z = nv.z;
    e.u.facing = Math.atan2(dx, dz);
    e.u.moving = e.spd > 0.4;
    return false;
  }

  /** 꼬마 들판 뛰어다니기 (비 오면 들판 가운데 좁은 곳에서만) */
  _wander(e, dt, rain) {
    const p = e.u.group.position, W0 = e.n.wander;
    if (!e.target || Math.hypot(e.target.x - p.x, e.target.z - p.z) < 0.3) {
      e.wait -= dt;
      e.spd = 0;
      e.u.moving = false;
      if (e.wait <= 0) {
        const k = rain ? 0.3 : 1, cx = (W0.x0 + W0.x1) / 2, cz = (W0.z0 + W0.z1) / 2, hx = ((W0.x1 - W0.x0) / 2) * k, hz = ((W0.z1 - W0.z0) / 2) * k;
        // 화분·수레·가로등 같은 장애물 위는 피해서 목적지 고르기
        for (let i = 0; i < 10; i++) { const t = { x: cx - hx + Math.random() * hx * 2, z: cz - hz + Math.random() * hz * 2 }; if (!this.game.world.isBlocked(t.x, t.z, 0.8)) { e.target = t; break; } }
        e.wait = 2 + Math.random() * 4;
      }
      return;
    }
    if (this._stepToward(e, e.target.x, e.target.z, dt, 2.2)) e.target = null;
    if (e.blocked > 1.5) { e.blocked = 0; e.target = null; e.wait = 0.5; }
  }

  /**
   * 내 이름표 흐리게: 주민에게 곧장 걸어가면 내 이름표가 뒤에 선 주민의 얼굴·이름표를 덮음 →
   * 내 뒤 5m 안 주민이 카메라→내 이름표 방향 12° 안에 들면 0.35 로 (부드럽게, 벗어나면 다시 또렷하게)
   */
  _fadePlayerLabel(dt, pp) {
    const g = this.game, lb = g.player?.unico?.label, cam = g.followCam?.camera;
    setHeroLabel(lb); // 이름표 겹침 정리에서 내 이름표가 먼저 자리를 잡음 (label.js)
    const placed = g.world?.placed; // 건물 뒤 이름표 흐리게 (label.js): 건물을 새로 지으면 다시 알려 줌
    if (placed && placed.length !== this._occN) { this._occN = placed.length; setLabelOccluders(placed.map((o) => ({ ...o, y0: heightAt(o.x, o.z) }))); }
    if (!lb || !cam?.position) return;
    const c = cam.position, ly = (g.player.unico.group?.position.y ?? 0) + (g.player.unico.labelY ?? 2.3);
    const lx = pp.x - c.x, lyy = ly - c.y, lz = pp.z - c.z, ll = Math.hypot(lx, lyy, lz) || 1;
    // 화면에서 내 이름표 반 크기 (NDC): 이름표 크기(m) / (거리 × 시야 탄젠트)
    const tv = Math.tan(((cam.fov ?? 45) * Math.PI) / 360), th = tv * (cam.aspect ?? 1);
    const hw = (lb.scale.x / 2) / (ll * th), hh = (lb.scale.y / 2) / (ll * tv);
    const proj = !!cam.projectionMatrix && !!cam.matrixWorldInverse;
    if (proj) _lv.set(pp.x, ly, pp.z).project(cam);
    let behind = false;
    for (const e of this.list) {
      const p = e.u.group.position;
      if (Math.hypot(p.x - pp.x, p.z - pp.z) > PL_FADE_R) continue;
      const nx = p.x - c.x, ny = p.y + 1.4 * e.u.scale - c.y, nz = p.z - c.z, nl = Math.hypot(nx, ny, nz) || 1;
      if (!(nl > ll && (nx * lx + ny * lyy + nz * lz) / (nl * ll) > PL_FADE_COS)) continue;
      if (!proj) { behind = true; break; }
      // 얼굴(머리 높이)이나 그 주민 이름표가 내 이름표 사각형(+ 머리 크기 여유)에 들어오면
      const mx = hw + 0.35 / (nl * th), my = hh + 0.35 / (nl * tv);
      for (const y of [p.y + 1.35 * e.u.scale, p.y + (e.u.labelY ?? 2.3)]) {
        _nv.set(p.x, y, p.z).project(cam);
        if (Math.abs(_nv.x - _lv.x) < mx && Math.abs(_nv.y - _lv.y) < my) { behind = true; break; }
      }
      if (behind) break;
    }
    const a0 = lb.material.opacity ?? 1, want = behind ? PL_FADE_A : 1;
    lb.material.opacity = a0 + (want - a0) * (1 - Math.exp(-dt * 8));
  }

  /** 대화 구도에서 신경 쓸 다른 캐릭터들 (주민·KOAT 담당·안내데스크·다른 접속자·반려견) */
  _others(e) {
    const g = this.game, out = [];
    for (const o of this.list) if (o !== e) out.push(o.u);
    for (const b of g.koat?.booths || []) if (b.npc) out.push(b.npc);
    if (g.koat?.desk) out.push(g.koat.desk);
    for (const r of g.net?.remote?.values?.() || []) if (r.unico) out.push(r.unico);
    // 반려견 콩이: 이름표만 (대화가 끝나면 cutscene 이 labelAlways 인 것의 이름표를 다시 켬). 키가 작아 거의 수평인 앞모습 구도의 시선은 가리지 않음 (short)
    if (g.pet?.label && g.pet.e?.m) out.push({ group: g.pet.e.m, label: g.pet.label, labelAlways: true, short: true });
    return out;
  }

  /** 카메라→시선 선(시선 쪽 15% 는 빼고)이 지나는 건물·소품 칸 수 (0.25m 마다, 두 사람 1.6m 안 소품은 셈하지 않음) */
  _blockedOnSegment(pos, look, a, b) {
    const W = this.game.world;
    if (!W) return 0;
    const near = (o) => Math.hypot(o.x - a.x, o.z - a.z) < 1.6 || Math.hypot(o.x - b.x, o.z - b.z) < 1.6;
    const obs = (W.obstacles || []).filter((o) => !near(o)), boxes = W.boxes || [];
    const L = Math.hypot(look[0] - pos[0], look[2] - pos[2]), n = Math.max(2, Math.ceil((L * 0.85) / 0.25));
    let hit = 0;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * 0.85, x = pos[0] + (look[0] - pos[0]) * t, z = pos[2] + (look[2] - pos[2]) * t;
      if (obs.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.15) || boxes.some((q) => x > q.x0 - 0.2 && x < q.x1 + 0.2 && z > q.z0 - 0.2 && z < q.z1 + 0.2)) hit++;
    }
    return hit;
  }

  /** 카메라→주민 얼굴 선을 가리는 소품 수 (우체통·가로등이 내 옆에 있어도 셈, 주민 0.6m 안은 빼고) */
  _propsOnFace(pos, b) {
    const W = this.game.world;
    if (!W) return 0;
    let hit = 0;
    for (const o of W.obstacles || []) {
      if (o.r > 0.8 || Math.hypot(o.x - b.x, o.z - b.z) < 0.6 + o.r) continue;
      if (segDist(o.x, o.z, pos[0], pos[2], b.x, b.z) < o.r + 0.2) hit++;
    }
    return hit;
  }

  /** 옛 대화 구도 후보: 두 사람을 잇는 선의 옆에서 (지금 카메라 쪽 → 반대쪽, 각각 ±25° 돌린 것). 가로 화면은 카메라·시선을 낮춰 얼굴이 대화창 위 */
  _sideShots(a, b) {
    const cam = this.game.camera, shots = [];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, d = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / d, nz = (b.x - a.x) / d;
    const here = (cam.position.x - mx) * nx + (cam.position.z - mz) * nz >= 0 ? 1 : -1;
    for (const side of [here, -here]) {
      const s0 = talkShot(a, b, { x: mx + nx * side * 5, z: mz + nz * side * 5 }, cam.fov, cam.aspect);
      for (const rot of [0, 0.44, -0.44]) {
        const c = Math.cos(rot), sn = Math.sin(rot), ox = s0.pos[0] - mx, oz = s0.pos[2] - mz;
        const wide = !(cam.aspect < 1);
        shots.push({ pos: [mx + ox * c - oz * sn, wide ? TALK_CAM_Y : s0.pos[1], mz + ox * sn + oz * c], look: [s0.look[0], wide ? Math.min(s0.look[1], TALK_LOOK_Y) : s0.look[1], s0.look[2]], lift: 0 });
      }
    }
    return shots;
  }

  /**
   * 대화 구도가 화면에서 어떻게 보이나 (렌즈 올림까지): chinGap = 이름 칩 아래 여유 - 주민 턱 위치, head = 대화창 윗변 - 주민 얼굴,
   * heroW = 내 몸 너비(화면 비율), heroClip = 내 몸이 화면 끝에 잘린 비율 (0 = 다 보임, 1 = 다 밖)
   */
  talkFrame(shot, a, b, sc, aspect, fov, h = typeof innerHeight === 'number' ? innerHeight : 800) {
    const F = TALK_FRAME, box = talkBoxTop(aspect, h), cam = _fc;
    cam.fov = fov; cam.aspect = aspect; cam.near = 0.1; cam.far = 600;
    cam.position.set(...shot.pos); cam.lookAt(...shot.look);
    if (shot.lift === true) cam.setViewOffset(aspect, 1, 0, liftFor(box, hudFrac(h)), aspect, 1); else cam.clearViewOffset();
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const yf = (p, y) => (1 - _fp.set(p.x, y, p.z).project(cam).y) / 2;
    const face = 1.3 * sc;
    _fr.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize().multiplyScalar(F.heroR);
    let x0 = Infinity, x1 = -Infinity;
    for (const s of [-1, 1]) for (const y of [0.2, F.heroTop]) {
      _fp.set(a.x + _fr.x * s, y, a.z + _fr.z * s).project(cam);
      x0 = Math.min(x0, _fp.x); x1 = Math.max(x1, _fp.x);
    }
    const w = Math.max(1e-6, x1 - x0), out = Math.max(0, x1 - 1) + Math.max(0, -1 - x0);
    const fx = _fp.set(b.x, face, b.z).project(cam).x;
    // cover: 내 몸(화면 가로 구간)이 주민 얼굴 가운데를 덮음 (어깨 너머 구도에서 내 등이 얼굴 위로 오면 안 됨)
    return { chinGap: box - F.chip / h - yf(b, face - 0.25 * sc), head: box - yf(b, face), heroW: w / 2, heroClip: Math.min(1, out / w), cover: fx > x0 - 0.06 && fx < x1 + 0.06 };
  }

  /** 화면 검사 통과: 턱이 이름 칩 위, (낮은 가로폰은 얼굴이 창 위로 12% 이상), 내 몸은 좁고 다 보이거나 아예 밖 */
  _frameOk(m, aspect, h) {
    const F = TALK_FRAME;
    if (m.chinGap < F.room) return false;
    if (!(aspect < 1) && h <= F.lowH && m.head < F.lowRoom) return false;
    if (m.heroClip >= 0.999) return true;
    if (m.cover) return false;
    return m.heroW <= (aspect < 1 ? F.heroWTall : F.heroW) && m.heroClip <= F.heroClip;
  }

  /**
   * 앞모습 대화 구도 후보 (cutscene.speakerShot): 말하는 주민 b 정면에서 35°·45°·25°·55° (지금 카메라 쪽 먼저), 두 얼굴이 너무 붙는 것은 뺌
   * 각 각도에서 화면 검사(_frameOk)를 통과할 때까지 0.4m 씩 물러남 (6.5m 까지). 통과하면 fit = true
   */
  _frontShots(a, b, e) {
    const cam = this.game.camera, sc = e?.u?.scale ?? 1, face = 1.3 * sc, tall = cam.aspect < 1;
    const h = typeof innerHeight === 'number' ? innerHeight : 800, lowLand = !tall && h <= TALK_FRAME.lowH;
    const fx = a.x - b.x, fz = a.z - b.z, d = Math.hypot(fx, fz) || 1;
    const here = (cam.position.x - b.x) * (-fz / d) + (cam.position.z - b.z) * (fx / d) >= 0 ? 1 : -1;
    // 세로 폰은 조금 더 물러나 시작 (얼굴이 위 HUD 에 붙지 않고 내 몸이 화면을 덜 덮게), 낮은 가로폰은 가깝고 낮게 (얼굴이 작지 않게)
    const opts = { fov: cam.fov, aspect: cam.aspect, faceS: face, faceL: 1.35, camY: lowLand ? Math.min(1.3, face) : face + 0.3, lookY: face * 0.7 + 1.35 * 0.3 - 0.05, fit: tall ? 0.75 : 0.8, maxD: 6.5 };
    const D0 = tall ? 5.4 : lowLand ? 4.0 : 5.2;
    const shots = [];
    for (const side of [here, -here]) for (const theta of FRONT_THETA) {
      let s = null;
      for (let D = D0; ; D = Math.min(6.5, D + 0.4)) {
        s = speakerShot(a, b, side, { ...opts, theta, D });
        s.frame = this.talkFrame(s, a, b, sc, cam.aspect, cam.fov, h);
        s.fit = this._frameOk(s.frame, cam.aspect, h);
        if (s.fit || s.dist >= 6.5 - 1e-6) break;
      }
      if (s.sep >= FRONT_SEP) shots.push({ ...s, front: true });
    }
    return shots;
  }

  /**
   * 대화 구도 { pos, look, lift, near, front? }: 후보 중 카메라→시선 선 1.2m 안에 다른 캐릭터가 없고 건물·소품을 지나지 않는 첫 구도
   * (모두 가리면 가장 덜 가리는 것). near = 카메라 6m 안 캐릭터 (이름표 숨김)
   *  front: 말하는 주민(b)의 얼굴을 3/4 앞에서 (렌즈 올림 lift 로 얼굴을 대화창 위에) → 모두 가리면 옛 옆 구도
   *  front 없이: 옛 옆 구도만 (카메라를 낮춰 얼굴을 대화창 위에 — 렌즈 올림 없음)
   */
  talkCamera(a, b, e, { front = false } = {}) {
    const others = this._others(e).filter((u) => u?.group);
    const pass = (shots) => {
      let best = null;
      for (const s of shots) {
        s.clear = Infinity;
        for (const u of others) { if (s.front && u.short) continue; const p = u.group.position; s.clear = Math.min(s.clear, segDist(p.x, p.z, s.pos[0], s.pos[2], s.look[0], s.look[2])); }
        s.block = this._blockedOnSegment(s.pos, s.look, a, b) + (s.front ? this._propsOnFace(s.pos, b) : 0);
        if (s.clear >= TALK_CLEAR && !s.block) return { best: s, ok: true };
        if (!best || s.block < best.block || (s.block === best.block && s.clear > best.clear)) best = s;
      }
      return { best, ok: false };
    };
    let r = { best: null, ok: false };
    if (front) { // 화면 검사를 통과한 것 먼저, 그것들이 모두 가리면 통과 못 한 것 중 트인 것
      const fs = this._frontShots(a, b, e);
      r = pass(fs.filter((s) => s.fit));
      if (!r.ok) { const r2 = pass(fs); if (r2.ok || !r.best) r = r2; }
    }
    if (!r.ok) {
      const side = pass(this._sideShots(a, b));
      const fb = r.best, sb = side.best; // 둘 다 조금씩 가리면: 덜 막힌 쪽, 같으면 앞모습 (옆 구도가 훨씬 트였을 때만 옆)
      if (side.ok || !fb || sb.block < fb.block || (sb.block === fb.block && sb.clear > fb.clear + 0.3)) r = side;
    }
    const best = r.best;
    best.near = others.filter((u) => Math.hypot(u.group.position.x - best.pos[0], u.group.position.z - best.pos[2]) < TALK_HIDE);
    return best;
  }

  /** 대화창으로 대화: 서로 마주 보고, 카메라는 대화 구도로. 선택지로 부탁·선물·장터·퀘스트 */
  async talk(e) {
    const g = this.game;
    if (g.dialogue.active) return;
    const pp = g.player.position, np = e.u.group.position;
    this.talking = e; // 대화 동안: 서로 얼굴을 보고, 일과로 자리를 뜨지 않음
    this._wake(e, false);
    if (e.u.action && e.u.action !== 'talk') e.u.clearAction(); // 하던 일(낚시·호미질)을 멈추고 돌아봄
    e.u.facing = Math.atan2(pp.x - np.x, pp.z - np.z);
    g.player.unico.facing = Math.atan2(np.x - pp.x, np.z - pp.z);
    const shot = this.talkCamera(pp, np, e, { front: true });
    g.cinema.shot(shot.pos, shot.look, 0.7, { lift: shot.lift });
    if (shot.front) { // 서로 마주 보되 카메라 쪽으로 살짝 (얼굴이 3/4 앞으로)
      g.cinema.faceLock(e.u, cheatYaw(np, pp, shot.pos, CHEAT_NPC));
      g.cinema.faceLock(g.player.unico, cheatYaw(pp, np, shot.pos, CHEAT_ME));
    }
    g.cinema.hideLabelsOf(g.player.unico, e.u, ...shot.near);
    try { await this._talkLoop(e); } finally { g.cinema.release(); this.talking = null; e.turnTo = null; } // 도중에 오류가 나도 카메라·렌즈·몸 방향은 풀림
  }

  /** 대화 내용: 첫 인사 보상 → 선택지(부탁·선물·장터·퀘스트·이야기) 반복 → 끝나면 고른 창 열기 */
  async _talkLoop(e) {
    const g = this.game;
    const r = g.villagers.talk(e.id, g.world.day);
    if (r.gained) g.ui.toast(`💕 ${e.name}${josa(e.name, '와/과')} 오늘 첫 인사! 우정 +${r.gained}`);
    this.applyRewards(e, r);
    const id = e.id, color = NPC_COLOR[id] || '#30b6aa';
    // 우정 하트: 이름표 옆 작은 글씨(sub)로 ♥/♡ (hearts/heartsMax 도 함께 넘김)
    const who = () => { const h = g.villagers.hearts(id); return { speaker: e.u, name: `${ROLE_ICON[id] || ''} ${e.name}`, color, sub: `${'♥'.repeat(h)}${'♡'.repeat(5 - h)}`, hearts: h, heartsMax: 5 }; };
    // 오늘 할 말: 계절·날씨·밤·하트·축제·한 일에 맞는 줄 (그날 첫 대화는 지금 상황에 맞는 줄 먼저), 이 대화에서 한 말은 다시 안 함
    const said = [];
    const next = (prefer = false) => {
      const ln = pickLine(id, this.lineCtx(e), [...(e.recent ||= []), ...said], Math.random, { prefer });
      if (!ln) return null;
      said.push(ln.t); remember(e.recent, ln.t);
      return ln.t;
    };
    let line = next(r.gained > 0) ?? OUT_OF_LINES_BY[id] ?? OUT_OF_LINES, out = false;
    // 축제 마당: 축제마다 주민별 첫마디 + 축제 음식 한 번 (먼저 말 건 주민이 나눠 줌)
    const W = g.world, fest = festivalAt(W.day ?? 1, W.time ?? 0.3);
    const festLine = fest && e.festSaid !== fest.key ? FESTIVAL_LINES[id]?.[fest.id] : null;
    if (festLine) {
      e.festSaid = fest.key;
      line = festLine;
      const fl = (g.flags ||= {}), food = takeFood((fl.fest = festState(fl.fest, fest.key)), fest);
      if (food) this._giveFood(e, food);
    }
    // 장터 여우 첫 대화: 장터 쓰는 법 한 줄 (한 번만)
    else if (id === 'merchant' && !g.flags.marketTip) { g.flags.marketTip = true; line = '처음 왔구나! 여기서 씨앗·사료를 사고 키운 작물을 팔 수 있어. 시세는 매일 바뀌니까 잘 보고 팔아!'; }
    // 안내 강아지: 받을 보상·할 일이 있으면 그 귀띔부터
    else if (id === 'guide') { const h = g.guide?.hint?.(); if (h) line = h; }
    let after = null;
    for (let guard = 0; guard < 8; guard++) {
      const req = g.villagers.requestFor(id, g.world.day, this.requestPool());
      const v = g.villagers.state[id];
      const choices = [];
      const have = req.done ? 0 : g.economy.count(req.item);
      // 아직 모자란 부탁: 잠긴 줄(locked)로 보여 주고, 누르면 몇 개 더 필요한지 알려 줌
      if (!req.done) choices.push(have < req.n ? { label: '🔒 📝 부탁 들어주기', note: `${g.villagers.describeRequest(req)} 지금 ${have}/${req.n}개 있어!`, value: 'req', locked: true } : { label: '📝 부탁 들어주기', note: `${g.villagers.describeRequest(req)} · 보유 ${have}/${req.n}`, value: 'req' });
      choices.push({ label: '🎁 선물하기', note: v.lastGift === g.world.day ? '오늘은 이미 선물했어요' : '', value: 'gift', disabled: v.lastGift === g.world.day });
      if (id === 'merchant') choices.push({ label: '🛒 장터 열기', value: 'market' });
      if (fest && g.festival?.open) choices.push({ label: `${fest.icon} 축제 마당 보기`, value: 'festival' });
      if (id === 'guide') {
        if (typeof g.guide?.whereTo === 'function') choices.push({ label: '📍 어디로 가면 돼?', value: 'where' });
        choices.push({ label: '📜 할 일(퀘스트) 보기', value: 'quests' });
      }
      if (id === 'fisher') {
        const lr = g.angling.today(g.world.day);
        if (lr.done && !lr.claimed) choices.unshift({ label: '📋 의뢰 보고하기', note: `보상 ${lr.reward}🪙 + 떡밥 ${lr.bait}`, value: 'lakereq' });
        choices.push({ label: '🎣 낚시 가게', value: 'lakeshop' }, { label: '🏆 기록판 보기', value: 'lakeboard' });
      }
      if (!out) choices.push({ label: '💬 이야기 더 하기', value: 'more' }); // 할 얘기를 다 했으면 숨김 (같은 말 되풀이 안 함)
      choices.push({ label: '👋 안녕!', value: 'bye' });
      const c = await g.dialogue.say({ ...who(), text: line, choices: choices.slice(0, 4).concat(choices.length > 4 ? choices.slice(4) : []) });
      if (c === 'more') { const t = next(); if (t) line = t; else { line = OUT_OF_LINES_BY[id] ?? OUT_OF_LINES; out = true; } continue; }
      if (c === 'lakereq') { g.lake.claimRequest(); e.u.playAction('cheer', 1.2); g.villagers.addFriend(id, 5); line = '역시! 네 솜씨는 알아줘야 해. 내일 의뢰도 기대하렴 🎣'; continue; }
      if (c === 'req') {
        if (have < req.n) { line = `${g.villagers.describeRequest(req)} 지금 ${have}/${req.n}개 있어!`; continue; }
        if (g.economy.take(req.item, req.n)) {
          const rr = g.villagers.fulfill(id);
          g.economy.earn(rr.reward);
          const ep = e.u.group.position;
          if (g.reward) g.reward(2, { x: ep.x, z: ep.z, label: '🙏' }); else g.audio.play('coin');
          e.u.playAction('cheer', 1.2);
          this.applyRewards(e, rr);
          await g.dialogue.say({ ...who(), text: `${REACT[id]?.thanks ?? '정말 고마워! 덕분에 살았어 🙏'} (+${rr.reward}🪙, 우정 +${rr.gained})`, emote: 'heart' });
        }
        continue;
      }
      if (c === 'bye') await g.dialogue.say({ ...who(), text: BYE[id] || '또 놀러 와!', emote: 'wave' });
      else after = c;
      break;
    }
    g.cinema.release(); // 창을 열기 전에 카메라를 돌려놓음 (talk 의 finally 에서 한 번 더 불러도 같음)
    if (after === 'gift') g.ui.openGiftPicker(e);
    else if (after === 'market') g.ui.openMarket();
    else if (after === 'festival') g.festival.open();
    else if (after === 'quests') g.ui.openQuests();
    else if (after === 'where') g.guide.whereTo?.();
    else if (after === 'lakeshop') g.lake.openShop();
    else if (after === 'lakeboard') g.lake.openBoard();
  }

  /** 주민 대사 고르기용 지금 상황: 계절·날씨·밤·하트·축제·받은 퀘스트·동물 주민인가 */
  lineCtx(e) {
    const g = this.game, W = g.world, day = W.day ?? 1, k = W.weatherKind;
    return {
      season: seasonOf(day).id, weather: k === 'rain' || k === 'storm' ? 'rain' : k === 'snow' ? 'snow' : null,
      night: isNight(hourOf(W.time ?? 0.3)), hearts: g.villagers.hearts(e.id), festival: festivalAt(day, W.time ?? 0.3)?.id ?? false,
      done: g.quests?.claimed || {}, species: !!e.u.species,
    };
  }

  /** 칭호 받기: 가진 칭호 목록·지금 칭호는 flags 에 (저장됨, 불러오면 game_save 가 다시 붙임) */
  grantTitle(title) {
    const g = this.game, f = (g.flags ||= {});
    const own = (f.titles ||= []);
    if (!own.includes(title)) own.push(title);
    f.title = title;
    g.player?.setTitle?.(title);
  }

  /** 축제 음식 나눠 주기 (축제마다 한 번): 가방에 넣고 주민 머리 위에서 가방으로 날아감 */
  _giveFood(e, food) {
    const g = this.game, it = ITEMS[food], p = e.u.group.position;
    g.economy.addItem(food, 1);
    e.u.playAction('present', 1.4);
    g.fx?.pop?.(p.x, p.z, it.emoji, { to: 'bag' });
    g.ui.toast(`${it.emoji} ${e.name}에게 ${it.name}${josa(it.name, '을/를')} 받았어요! 축제 날 별미예요`);
    g.audio.play('pop');
  }

  /** 하트 단계 보상 지급 */
  applyRewards(e, r) {
    const g = this.game, list = r?.rewards || [];
    for (const rw of list) this._giveReward(e, rw);
    if (list.length) { // 불러오기 등으로 여러 칸이 한꺼번에 오르면 알림·효과는 한 번만
      g.ui.toast(list.length > 1 ? `🎁 ${e.name}: 선물 ${list.length}개 받음` : `🎁 ${e.name}: "${list[0].text}"`);
      const ep = e.u.group.position;
      if (g.reward) g.reward(3, { x: ep.x, z: ep.z, label: '💕' }); else g.audio.play('levelup');
    }
    const max = Math.max(...Object.keys(VILLAGERS).map((id) => g.villagers.hearts(id)));
    g.onEvent('hearts', max);
  }

  /** 하트 보상 하나 주기 (알림 없이) */
  _giveReward(e, rw) {
    const g = this.game;
    if (rw.money) g.economy.earn(rw.money);
    if (rw.seeds) for (const [k, n] of Object.entries(rw.seeds)) g.economy.addSeeds(k, n);
    if (rw.item) for (const [k, n] of Object.entries(rw.item)) g.economy.addItem(k, n);
    if (rw.title) this.grantTitle(rw.title === true ? `${e.name}의 단짝` : rw.title);
  }

  /** 오늘의 부탁 후보: 플레이어가 구할 수 있는 것 위주 */
  requestPool() {
    const lv = this.game.quests.level;
    const season = seasonOf(this.game.world.day ?? 1).id; // 철 지난 과일·곤충은 부탁하지 않음
    return [...Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= lv), 'egg', 'milk', 'fish_crucian', ...['fruit_apple', 'fruit_peach', 'fruit_persimmon', 'bug_butterfly', 'bug_ladybug'].filter((k) => inSeason(k, season)).slice(0, 2)];
  }
}
