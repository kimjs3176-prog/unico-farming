import { josa } from '../sim/josa.js';
import * as THREE from 'three';
import { Unico } from '../unico.js';
import { LAYOUT } from '../world.js';
import { VILLAGERS } from '../sim/villagers.js';
import { CROPS } from '../sim/crops.js';
import { VILLAGER_SPECIES, villagerName } from '../species.js';
import { talkShot } from '../cutscene.js';

const ROLE_ICON = { merchant: '🛒', researcher: '🔬', guide: '📣', granny: '🌾', kid: '🦋', fisher: '🎣' };
/** 대화창 이름표 색 (역할별) */
const NPC_COLOR = { merchant: '#f28c28', researcher: '#8e7cc3', guide: '#6dbb4f', granny: '#a07e5c', kid: '#f28bb0', fisher: '#3a7bd5' };
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

/** 성격별 대사 (매일 조금씩 다른 말) */
const LINES = {
  merchant: ['신선한 농산물 삽니다~ 씨앗도 팔아요!', '오늘 시세 봤어? 매일 바뀐다구!', '볍씨도 들여놨어. 논농사 해 볼래?'],
  researcher: ['스마트팜은 센서로 온도·습도를 관리해요.', '벼는 단계마다 알맞은 물 높이가 달라요. 익으면 물을 빼 주세요!', '얕은 물에선 잡초가 잘 자라요. 깊게 대면 잡초가 줄어요.'],
  guide: ['유니코 팜에 온 걸 환영해요! 퀘스트(Q)를 확인해 보세요.', '연못에서 낚시를 해 봤어요? 비 오는 날엔 희귀한 물고기가!', '과일 나무는 하루에 한 번 흔들 수 있어요.'],
  granny: ['쌀 한 톨에도 정성이 담겨야 한단다.', '모내기 철엔 물을 얕게, 이삭이 패면 깊게 대거라.', '탈곡은 힘껏! 빠르게 밟아야 낟알이 잘 떨어져.'],
  fisher: ['큰 녀석은 서두르면 안 돼. 줄이 빨개지면 놓아 주고, 지치면 감는 거야.', '밤에는 뱀장어가 나온단다. 비 오는 날엔 산천어가 잘 물지.', '호수 한가운데 반짝이는 곳 봤니? 헤엄쳐 가서 잠수하면 조개가 있어.', '전설의 철갑상어… 황금 낚싯대라면 혹시 모르지.'],
  kid: ['나비 잡으러 가자! 밤엔 반딧불이도 있어!', '황금 잉어 본 적 있어? 엄청 희귀하대!', '나무를 흔들면 가끔 장수풍뎅이가 떨어져!'],
};
/** 동물 주민만 하는 대사 (종 특징) */
const SPECIES_LINES = {
  merchant: ['밤에 닭장 노리는 건 산여우야. 난 장사만 한다구!', '꼬리 털 손질에만 아침 한 시간이라구~'],
  researcher: ['생각할 땐 앞발을 비비게 돼요. 집중이 잘 되거든요!'],
  guide: ['꼬리가 저절로 흔들려요! 반가워서 그런가 봐요 🐾'],
  granny: ['아이고, 우리 강아지 왔구나. 밥은 먹었니?'],
  fisher: ['물고기 냄새만 맡아도 어디 있는지 알지. 고양이 코는 못 속여.'],
  kid: ['깡충깡충! 나 잡아 봐라~'],
};
const STARTLE = ['깜짝이야!', '으악! 트랙터다!', '조심해~!', '어이쿠!'];
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** 가로 화면 대화 구도: 카메라 높이·시선 높이 상한 — 아래 대화창(선택지 6개면 화면 아래 약 64%)이 얼굴을 가리지 않게
 *  얼굴 가운데를 화면 위 30% 안에 둠 (세로 화면은 cutscene.talkShot 이 이미 시선을 더 낮춤 — 그대로) */
const TALK_CAM_Y = 2.0, TALK_LOOK_Y = 0;
/** 대화 구도에서 카메라→시선 선에 이만큼(m) 가까운 다른 캐릭터가 있으면 다른 구도, 카메라에서 이만큼(m) 안의 캐릭터는 이름표를 숨김 */
const TALK_CLEAR = 1.2, TALK_HIDE = 6;
/** 내 이름표 흐리게: 내 뒤(카메라에서 더 먼 쪽) 5m 안 주민이 카메라→내 이름표 방향 12° 안에 있고, 화면에서 그 얼굴·이름표가 내 이름표에 겹칠 때 */
const PL_FADE_R = 5, PL_FADE_COS = Math.cos((12 * Math.PI) / 180), PL_FADE_A = 0.35;
const _lv = new THREE.Vector3(), _nv = new THREE.Vector3();

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
      const ob = n.wander ? null : { x: n.x, z: n.z, r: u.species?.obstacleR || 0.7 };
      if (ob) game.world.obstacles.push(ob);
      const lines = u.species ? [...LINES[id], ...(SPECIES_LINES[id] || [])] : LINES[id];
      return { id, u, n, name, lines, lineIdx: Math.floor(Math.random() * 3), target: null, wait: 2, nextIdle: this._idleGap(u) };
    });
  }

  /** 트랙터에 깜짝 놀람: 펄쩍 + ❗ + 말풍선, 돌아다니던 주민은 트랙터 반대쪽으로 비켜남 (4초에 한 번) */
  startle(e, from) {
    const now = performance.now() / 1000;
    if ((e.startleUntil || 0) > now) return false;
    e.startleUntil = now + 4;
    const p = e.u.group.position;
    e.u.facing = Math.atan2(from.x - p.x, from.z - p.z); // 트랙터 쪽을 돌아봄
    e.u.playAction('startle', 1.3);
    const say = [...STARTLE, ...(e.u.species?.startle || [])];
    e.u.say(say[Math.floor(Math.random() * say.length)], 1.8);
    e.idle = 0;
    if (e.n.wander) { const dx = p.x - from.x, dz = p.z - from.z, l = Math.hypot(dx, dz) || 1; e.target = { x: p.x + (dx / l) * 2.5, z: p.z + (dz / l) * 2.5 }; e.wait = 0; e.spd = 3.5; }
    this.game.audio.play('bump', 0.35);
    return true;
  }

  /** 다음 대기 동작까지 시간 (종마다 간격이 다름) */
  _idleGap(u) {
    const r = u.species?.idleEvery || [8, 12];
    return r[0] + Math.random() * (r[1] - r[0]);
  }

  update(dt, playerPos) {
    let hit = null, hd = 2.6;
    // 트랙터가 빠르게 스쳐 지나가면 가까운 주민이 놀람
    const tr = this.game.tractor, tv = tr?.driving ? tr.vehicle : null;
    for (const e of this.list) {
      const p = e.u.group.position;
      if (tv && Math.abs(tv.speed) > 1.2 && Math.hypot(p.x - tv.x, p.z - tv.z) < 2.9) this.startle(e, tv);
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      // 꼬마는 들판을 돌아다님 (플레이어가 가까우면 멈춰서 바라봄)
      if (e.n.wander && d > 3) {
        const W = e.n.wander;
        if (!e.target || Math.hypot(e.target.x - p.x, e.target.z - p.z) < 0.3) {
          e.wait -= dt;
          e.spd = 0;
          e.u.moving = false;
          if (e.wait <= 0) {
            // 화분·수레·가로등 같은 장애물 위는 피해서 목적지 고르기
            for (let k = 0; k < 10; k++) { const t = { x: W.x0 + Math.random() * (W.x1 - W.x0), z: W.z0 + Math.random() * (W.z1 - W.z0) }; if (!this.game.world.isBlocked(t.x, t.z, 0.8)) { e.target = t; break; } }
            e.wait = 2 + Math.random() * 4;
          }
        } else {
          const dx = e.target.x - p.x, dz = e.target.z - p.z, len = Math.hypot(dx, dz);
          // 출발할 때 천천히 붙는 속도, 도착할 때 감속 (도착 0.8m 전부터)
          const want = 2.2 * Math.min(1, len / 0.8 + 0.25);
          e.spd = (e.spd || 0) + (want - (e.spd || 0)) * (1 - Math.exp(-dt * 6));
          const step = Math.min(len, e.spd * dt);
          const nv = (this._nv ||= new THREE.Vector3()).set(p.x + (dx / len) * step, 0, p.z + (dz / len) * step);
          this.game.world.resolveCollision(nv, 0.4); // 소품을 통과하지 않게
          if (Math.hypot(nv.x - p.x, nv.z - p.z) < step * 0.3) e.blocked = (e.blocked || 0) + dt; else e.blocked = 0;
          p.x = nv.x; p.z = nv.z;
          if (e.blocked > 1.5) { e.blocked = 0; e.target = null; e.wait = 0.5; }
          e.u.facing = Math.atan2(dx, dz);
          e.u.moving = e.spd > 0.4;
        }
      } else {
        e.u.moving = false;
        e.spd = 0;
        if (d < 7) e.u.facing = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
      }
      // 플레이어를 보는 정도(귀 쫑긋·꼬리·눈인사), 우정 하트, 플레이어 쪽 상대 각도
      const u = e.u;
      u.attention += ((d < 5 ? 1 : 0) - u.attention) * (1 - Math.exp(-4 * dt));
      if (u.species) {
        u.hearts = this.game.villagers.hearts(e.id);
        u.attnYaw = wrapA(Math.atan2(playerPos.x - p.x, playerPos.z - p.z) - u.yaw);
        // 처음 가까이 오면 반응: 강아지 갸웃, 친한 여우는 꼬리 흔들며 손 인사
        if (d < 4 && !e.near) {
          e.near = true;
          if (!u.action && !u.moving) {
            if (u.species.id === 'puppy') u.playAction('tilt', 1.3);
            else if (u.species.id === 'fox' && u.hearts >= 3) u.playAction('wave', 1.5);
          }
        } else if (d > 6) e.near = false;
      }
      e.idle = (e.idle || 0) + dt;
      if (e.idle > e.nextIdle && !u.moving) {
        e.idle = 0;
        e.nextIdle = this._idleGap(u);
        const pool = [e.n.pose, ...(u.species?.idles || [])];
        u.playAction(pool[Math.floor(Math.random() * pool.length)], 2);
      }
      u.update(dt, this.game.followCam.camera);
      if (d < hd) { hd = d; hit = e; }
    }
    this._fadePlayerLabel(dt, playerPos);
    if (!hit) return null;
    const v = this.game.villagers;
    const hearts = v.hearts(hit.id);
    return { d: hd, label: `💬 ${hit.name}${josa(hit.name, '와/과')} 대화 ${'❤️'.repeat(hearts)}${'🤍'.repeat(5 - hearts)}`, key: 'npc', onInteract: () => this.talk(hit) };
  }

  /**
   * 내 이름표 흐리게: 주민에게 곧장 걸어가면 내 이름표가 뒤에 선 주민의 얼굴·이름표를 덮음 →
   * 내 뒤 5m 안 주민이 카메라→내 이름표 방향 12° 안에 들면 0.35 로 (부드럽게, 벗어나면 다시 또렷하게)
   */
  _fadePlayerLabel(dt, pp) {
    const g = this.game, lb = g.player?.unico?.label, cam = g.followCam?.camera;
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
    // 반려견 콩이: 이름표만 (대화가 끝나면 cutscene 이 labelAlways 인 것의 이름표를 다시 켬)
    if (g.pet?.label && g.pet.e?.m) out.push({ group: g.pet.e.m, label: g.pet.label, labelAlways: true });
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

  /**
   * 대화 구도 { pos, look, near }: 지금 카메라 쪽 → 반대쪽 → 각각 ±25° 돌린 것 중 카메라→시선 선 1.2m 안에 다른 캐릭터가 없고
   * 건물·소품을 지나지 않는 첫 구도 (모두 가리면 가장 덜 가리는 것). 가로 화면은 카메라·시선을 낮춰 얼굴이 대화창 위, near = 카메라 6m 안 캐릭터 (이름표 숨김)
   */
  talkCamera(a, b, e) {
    const cam = this.game.camera, others = this._others(e).filter((u) => u?.group);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, d = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / d, nz = (b.x - a.x) / d;
    const here = (cam.position.x - mx) * nx + (cam.position.z - mz) * nz >= 0 ? 1 : -1;
    const shots = [];
    for (const side of [here, -here]) {
      const s0 = talkShot(a, b, { x: mx + nx * side * 5, z: mz + nz * side * 5 }, cam.fov, cam.aspect);
      for (const rot of [0, 0.44, -0.44]) {
        const c = Math.cos(rot), sn = Math.sin(rot), ox = s0.pos[0] - mx, oz = s0.pos[2] - mz;
        const wide = !(cam.aspect < 1);
        shots.push({ pos: [mx + ox * c - oz * sn, wide ? TALK_CAM_Y : s0.pos[1], mz + ox * sn + oz * c], look: [s0.look[0], wide ? Math.min(s0.look[1], TALK_LOOK_Y) : s0.look[1], s0.look[2]] });
      }
    }
    let best = null;
    for (const s of shots) {
      s.clear = Infinity;
      for (const u of others) { const p = u.group.position; s.clear = Math.min(s.clear, segDist(p.x, p.z, s.pos[0], s.pos[2], s.look[0], s.look[2])); }
      s.block = this._blockedOnSegment(s.pos, s.look, a, b);
      if (s.clear >= TALK_CLEAR && !s.block) { best = s; break; }
      if (!best || s.block < best.block || (s.block === best.block && s.clear > best.clear)) best = s;
    }
    best.near = others.filter((u) => Math.hypot(u.group.position.x - best.pos[0], u.group.position.z - best.pos[2]) < TALK_HIDE);
    return best;
  }

  /** 대화창으로 대화: 서로 마주 보고, 카메라는 대화 구도로. 선택지로 부탁·선물·장터·퀘스트 */
  async talk(e) {
    const g = this.game;
    if (g.dialogue.active) return;
    const pp = g.player.position, np = e.u.group.position;
    e.u.facing = Math.atan2(pp.x - np.x, pp.z - np.z);
    g.player.unico.facing = Math.atan2(np.x - pp.x, np.z - pp.z);
    const shot = this.talkCamera(pp, np, e);
    g.cinema.shot(shot.pos, shot.look, 0.7);
    g.cinema.hideLabelsOf(g.player.unico, e.u, ...shot.near);
    const r = g.villagers.talk(e.id, g.world.day);
    if (r.gained) g.ui.toast(`💕 ${e.name}${josa(e.name, '와/과')} 오늘 첫 인사! 우정 +${r.gained}`);
    this.applyRewards(e, r);
    const id = e.id, color = NPC_COLOR[id] || '#30b6aa';
    const who = () => ({ speaker: e.u, name: `${ROLE_ICON[id] || ''} ${e.name}`, color, sub: `우정 ${'❤️'.repeat(g.villagers.hearts(id))}${'🤍'.repeat(5 - g.villagers.hearts(id))}` });
    let line = e.lines[e.lineIdx++ % e.lines.length];
    let after = null;
    for (let guard = 0; guard < 8; guard++) {
      const req = g.villagers.requestFor(id, g.world.day, this.requestPool());
      const v = g.villagers.state[id];
      const choices = [];
      if (!req.done) { const have = g.economy.count(req.item); choices.push({ label: `📝 부탁 들어주기`, note: `${g.villagers.describeRequest(req)} · 보유 ${have}/${req.n}`, value: 'req', disabled: have < req.n }); }
      choices.push({ label: '🎁 선물하기', note: v.lastGift === g.world.day ? '오늘은 이미 선물했어요' : '', value: 'gift', disabled: v.lastGift === g.world.day });
      if (id === 'merchant') choices.push({ label: '🛒 장터 열기', value: 'market' });
      if (id === 'guide') choices.push({ label: '📜 할 일(퀘스트) 보기', value: 'quests' });
      if (id === 'fisher') {
        const lr = g.angling.today(g.world.day);
        if (lr.done && !lr.claimed) choices.unshift({ label: '📋 의뢰 보고하기', note: `보상 ${lr.reward}🪙 + 떡밥 ${lr.bait}`, value: 'lakereq' });
        choices.push({ label: '🎣 낚시 가게', value: 'lakeshop' }, { label: '🏆 기록판 보기', value: 'lakeboard' });
      }
      choices.push({ label: '💬 이야기 더 하기', value: 'more' }, { label: '👋 안녕!', value: 'bye' });
      const c = await g.dialogue.say({ ...who(), text: line, choices: choices.slice(0, 4).concat(choices.length > 4 ? choices.slice(4) : []) });
      if (c === 'more') { line = e.lines[e.lineIdx++ % e.lines.length]; continue; }
      if (c === 'lakereq') { g.lake.claimRequest(); e.u.playAction('cheer', 1.2); g.villagers.addFriend(id, 5); line = '역시! 네 솜씨는 알아줘야 해. 내일 의뢰도 기대하렴 🎣'; continue; }
      if (c === 'req') {
        if (g.economy.take(req.item, req.n)) {
          const rr = g.villagers.fulfill(id);
          g.economy.earn(rr.reward);
          g.audio.play('coin');
          e.u.playAction('cheer', 1.2);
          this.applyRewards(e, rr);
          await g.dialogue.say({ ...who(), text: `정말 고마워! 덕분에 살았어 🙏 (+${rr.reward}🪙, 우정 +${rr.gained})`, emote: 'heart' });
        }
        continue;
      }
      if (c === 'bye') await g.dialogue.say({ ...who(), text: BYE[id] || '또 놀러 와!', emote: 'wave' });
      else after = c;
      break;
    }
    g.cinema.release();
    if (after === 'gift') g.ui.openGiftPicker(e);
    else if (after === 'market') g.ui.openMarket();
    else if (after === 'quests') g.ui.openQuests();
    else if (after === 'lakeshop') g.lake.openShop();
    else if (after === 'lakeboard') g.lake.openBoard();
  }

  /** 하트 단계 보상 지급 */
  applyRewards(e, r) {
    const g = this.game;
    for (const rw of r?.rewards || []) {
      if (rw.money) g.economy.earn(rw.money);
      if (rw.seeds) for (const [k, n] of Object.entries(rw.seeds)) g.economy.inventory.seeds[k] = (g.economy.inventory.seeds[k] || 0) + n;
      if (rw.item) for (const [k, n] of Object.entries(rw.item)) g.economy.addItem(k, n);
      g.ui.toast(`🎁 ${e.name}: "${rw.text}"`);
      g.audio.play('levelup');
    }
    const max = Math.max(...Object.keys(VILLAGERS).map((id) => g.villagers.hearts(id)));
    g.onEvent('hearts', max);
  }

  /** 오늘의 부탁 후보: 플레이어가 구할 수 있는 것 위주 */
  requestPool() {
    const lv = this.game.quests.level;
    return [...Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= lv), 'egg', 'milk', 'fruit_apple', 'fish_crucian', 'bug_butterfly'];
  }
}
