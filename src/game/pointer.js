import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { LAYOUT } from './world.js';
import { IO } from './view/home_interior.js';
import { SURF } from './surface.js';

export const TOUCH_PICK_PX = 32; // 터치 탭: 작은 대상(곤충)은 화면에서 이만큼(CSS px) 빗나가도 잡음

/** 화면 좌표 후보 [{ x, y, t }] 중 (sx, sy) 에서 radius 안의 가장 가까운 것의 t (없으면 null) */
export function nearestOnScreen(cands, sx, sy, radius = TOUCH_PICK_PX) {
  let best = null, bd = radius;
  for (const c of cands) { const d = Math.hypot(c.x - sx, c.y - sy); if (d < bd) { bd = d; best = c.t; } }
  return best;
}

/**
 * 한 프레임의 안내 후보 고르기: 가장 가까운 안내(prompt, d 가 작을수록 먼저 — 진행 중인 미니게임은 d<0)와
 * 탭해서 걸어간 대상의 종류(key, 문자열 또는 배열)와 같은 안내 중 가장 가까운 것(wanted)
 */
export class PromptPick {
  constructor(key = null) { this.want = [].concat(key ?? []); this.prompt = null; this.wanted = null; }
  add(p) {
    if (!p) return;
    const d = p.d ?? 99;
    if (this.want.length && this.want.includes(p.key) && (!this.wanted || d < (this.wanted.d ?? 99))) this.wanted = p;
    if (!this.prompt || d < (this.prompt.d ?? 99)) this.prompt = p;
  }
  /** 이 안내만 (집 안: 가구 안내만 씀) */
  only(p) { this.prompt = p ?? null; this.wanted = p && this.want.includes(p.key) ? p : null; }
  /** 도착했을 때 자동으로 실행할 안내: 종류가 있는 대상은 그 대상만(옆 안내가 대신 실행되지 않게), 없으면(밭·동물) 가장 가까운 것 */
  arrival() { return this.want.length ? this.wanted : this.prompt; }
}

/**
 * 탭해 걸어가 도착했을 때 할 일 (arrivedAt: 도착한 이동 목표 { pos, stop, key, closer })
 *  { run: 안내 } 그 안내 실행 · { closer: true } 누른 대상의 안내가 아직 안 잡힘(바로 옆 시설이 더 가까움) → 한 번만 더 다가감 · {} 아무것도 안 함
 * 꾸미기 안내는 실행하지 않음 (도착하자마자 소품이 놓이거나 치워지지 않게, E·놓기 버튼으로만)
 */
export function arrivalStep(cand, arrivedAt) {
  const p = cand.arrival();
  if (p?.onInteract && p.key !== 'decor') return { run: p };
  if (!p && arrivedAt?.key && !arrivedAt.closer) return { closer: true };
  return {};
}

const inBox = (b, x, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;

/**
 * 집 안 가구 자리마다 그 가구 상자(solid)를 짝지음: 자리 바로 앞(1.3m 안)에 있고 한 축이 겹치는 상자
 * (문은 벽에 붙어 상자가 없음. 옆 스탠드 조명과 짝지으면 조명을 눌러도 밖으로 나가 버림)
 */
export function roomSpotSolids(room) {
  const pairs = new Map();
  for (const sp of room.spots) {
    if (sp.key === 'door') continue;
    let best = null, bd = 1.3;
    for (const b of room.solids) {
      const inX = sp.x > b.x0 - 0.1 && sp.x < b.x1 + 0.1, inZ = sp.z > b.z0 - 0.1 && sp.z < b.z1 + 0.1;
      if (!inX && !inZ) continue;
      const d = inX ? Math.max(b.z0 - sp.z, sp.z - b.z1, 0) : Math.max(b.x0 - sp.x, sp.x - b.x1, 0);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) pairs.set(sp, best);
  }
  return pairs;
}

/** (x, z) 를 담은 짝 상자의 자리. 가구가 겹쳐 놓인 곳이면 상자 가운데가 가까운 쪽 */
function pairedAt(pairs, x, z) {
  let best = null, bd = Infinity;
  for (const [sp, b] of pairs) {
    if (!inBox(b, x, z, 0.0501)) continue; // 0.0001: 벽면처럼 딱 경계에 놓인 점이 소수점 오차로 갈리지 않게
    const d = Math.hypot((b.x0 + b.x1) / 2 - x, (b.z0 + b.z1) / 2 - z);
    if (d < bd) { bd = d; best = sp; }
  }
  return best;
}

/** 짝 상자를 그 자리까지 늘린 상자 중 (x, z) 를 담은 것의 자리 (책상 앞 의자처럼 상자 밖, 자리 앞에 놓인 딸린 가구) */
function stretchedAt(pairs, x, z) {
  for (const [sp, b] of pairs) {
    const ext = { x0: Math.min(b.x0, sp.x), x1: Math.max(b.x1, sp.x), z0: Math.min(b.z0, sp.z), z1: Math.max(b.z1, sp.z) };
    if (inBox(ext, x, z, 0.05)) return sp;
  }
  return null;
}

/**
 * 집 안에서 누른 곳(방 기준 lx, lz)이 어느 가구 자리인가 → spot 또는 null(그냥 걸어감)
 * mid: 맞힌 메시의 가운데 {x, z} (있으면 먼저 봄: 가구 앞면을 눌러도 맞힌 점은 상자 가장자리라 옆 가구와 헷갈림)
 *  1) 가구 상자(침대·책상·옷장·책장)를 누르면 그 가구
 *  2) 짝 없는 꾸밈 가구(탁자·조명·부엌 등)는 아무것도 안 함
 *  3) 가구와 그 자리 사이에 놓인 것(책상 의자)은 그 가구
 *  4) 벽에 붙은 것(달력·문)은 그 근처 벽을 눌렀을 때만
 *  5) 바닥은 자리 바로 위를 눌렀을 때만
 */
export function roomSpotAt(room, lx, lz, onFloor, pairs = roomSpotSolids(room), mid = null) {
  const own = (mid && pairedAt(pairs, mid.x, mid.z)) || pairedAt(pairs, lx, lz);
  if (own) return own;
  if (!onFloor) {
    const paired = new Set(pairs.values());
    const deco = (x, z) => room.solids.some((b) => !paired.has(b) && inBox(b, x, z, 0.12));
    if ((mid && deco(mid.x, mid.z)) || deco(lx, lz)) return null;
    const near = stretchedAt(pairs, mid?.x ?? lx, mid?.z ?? lz);
    if (near) return near;
    // 벽(뒤 벽·옆 벽) 가까이를 맞혔을 때만 벽에 붙은 달력·문
    if (!(lz < -room.D / 2 + 0.3 || Math.abs(lx) > room.W / 2 - 0.3)) return null;
  }
  let best = null, bd = onFloor ? 0.6 : 1.2;
  for (const sp of room.spots) {
    if (!onFloor && pairs.has(sp)) continue;
    const d = Math.hypot(sp.x - lx, sp.z - lz);
    if (d < bd) { bd = d; best = sp; }
  }
  return best;
}

/** 화면에 보이는 물체인가 (광선은 숨긴 물체도 맞히므로 조상까지 확인) */
const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

/**
 * 시야 구멍 안의 점인가 (surface.js 셰이더와 같은 식: 카메라→캐릭터 선분 둘레, 거의 다 비쳐 보이는 안쪽 0.82)
 * 광선은 셰이더가 버린 조각도 맞히므로, 구멍으로 비쳐 보이는 곳을 누르면 그 뒤의 땅·대상을 고르게 함
 */
export function inSeeHole(p, cam = SURF.seeCam.value, tgt = SURF.seeTarget.value, on = SURF.seeOn.value) {
  if (on < 0.5 || p.y <= 0.35) return false;
  const sx = tgt.x - cam.x, sy = tgt.y - cam.y, sz = tgt.z - cam.z, L = Math.hypot(sx, sy, sz);
  if (L < 1e-3) return false;
  const rx = p.x - cam.x, ry = p.y - cam.y, rz = p.z - cam.z;
  const st = (rx * sx + ry * sy + rz * sz) / L;
  if (st <= 0 || st >= L - 0.5) return false;
  const k = st / L;
  return Math.hypot(rx - sx * k, ry - sy * k, rz - sz * k) < (1.3 + 1.5 * k) * 0.82;
}

/** 시야 구멍 셰이더가 붙은 재질인가 (enhanceMaterial 의 캐시 키 'surf-종류-…'. 털 재질은 구멍 없음, 복제한 재질은 셰이더가 빠짐) */
const holeMat = (m) => { const k = m?.customProgramCacheKey?.(); return typeof k === 'string' && k.startsWith('surf-') && !k.startsWith('surf-fur-'); };
/** 광선이 맞힌 곳이 시야 구멍으로 비쳐 보여 실제로는 안 보이는 면인가 */
const seenThrough = (h) => {
  const m = Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex ?? 0] : h.object.material;
  return holeMat(m) && inSeeHole(h.point);
};

/**
 * 마우스 클릭 / 터치 탭 이동·상호작용
 * - 땅을 클릭하면 그 자리로 걸어감
 * - 밭·동물·NPC·트랙터·스마트팜 센서·시설을 클릭하면 걸어가서 도착하면 자동으로 상호작용
 * - 집 안에서는 방바닥을 걷고, 가구를 누르면 그 가구 앞으로
 * - 마우스를 올리면 상호작용 가능한 대상 위에서 손가락 커서
 */
export class PointerNav {
  constructor(game) {
    this.game = game;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.floorIn = new THREE.Plane(new THREE.Vector3(0, 1, 0), -IO.y); // 집 안 방바닥 (y = IO.y)
    this._v = new THREE.Vector3();
    this.hoverAcc = 0;
    // 목적지 표시 링
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 32),
      new THREE.MeshBasicMaterial({ color: 0xfac03e, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    game.world.scene.add(this.marker);
    this.markerT = 0;
  }

  /** 상호작용 대상 목록 { objs, pos(): Vector3, stop, key?, big? } — key 는 대상의 안내 종류(prompt.key, 여럿이면 배열).
   *  goTo 에 넘겨 도착하면 그 종류의 안내만 실행 (key 가 없으면 가장 가까운 안내) */
  targets() {
    const g = this.game, out = [], L = LAYOUT;
    const at = (x, z) => { const v = new THREE.Vector3(x, 0, z); return () => v; };
    for (const e of g.ranch.ents) out.push({ objs: [e.m], pos: () => e.m.position, stop: 1.7 });
    for (const e of g.ranch.visitors || []) out.push({ objs: [e.m], pos: () => e.m.position, stop: 1.7, key: 'pet' });
    for (const e of g.npcs.list) out.push({ objs: [e.u.group], pos: () => e.u.group.position, stop: 1.9, key: 'npc' });
    if (!g.tractor.driving) out.push({ objs: [g.tractor.model], pos: () => new THREE.Vector3(g.tractor.vehicle.x, 0, g.tractor.vehicle.z), stop: 2.7, key: 'tractor' });
    for (const tr of g.nature.trees) out.push({ objs: [tr.m], pos: () => new THREE.Vector3(tr.x, 0, tr.z), stop: 1.6 });
    for (const b of g.nature.bugs) if (b.g.visible) out.push({ objs: [b.g], pos: () => b.g.position.clone().setY(0), stop: 1.2, big: true, key: 'bug' });
    for (const b of g.koat.booths) out.push({ objs: [b.model, b.npc.group], pos: () => b.front, stop: 0.6, key: 'koat' });
    out.push({ objs: [g.koat.desk.group], pos: () => g.koat.desk.group.position, stop: 1.8, key: 'koat' });
    out.push({ objs: [g.rice.thresher], pos: at(L.thresher.x, L.thresher.z), stop: 1.8, key: 'thresh' });
    const sensor = g.world.smartfarmModel?.getObjectByName('SensorPole');
    if (sensor) out.push({ objs: [sensor], pos: at(L.sensor.x, L.sensor.z), stop: 1.8, key: 'smart' });
    // 반려견 · 다른 플레이어 (움직임)
    const pet = g.pet;
    if (pet?.ok && pet.e?.m) out.push({ objs: [pet.e.m], pos: () => pet.e.m.position, stop: 0.9, key: pet.sim?.found ? 'petfind' : 'pet' });
    for (const r of g.net?.remote?.values() || []) if (r.unico?.group) out.push({ objs: [r.unico.group], pos: () => r.unico.group.position, stop: 1.6, key: 'player' });
    // 시설: 걸어가 안내 자리(각 안내의 기준점)에서 실행
    const H = g.home;
    if (H?.house && L.home?.door) out.push({ objs: [H.house], pos: at(L.home.door.x, L.home.door.z), stop: 1.0, key: 'home' });
    const fc = g.farmcraft, C = L.craft;
    if (fc && C) {
      if (fc.heap?.parent) out.push({ objs: [fc.heap.parent], pos: at(C.compost.x, C.compost.z), stop: 1.3, key: 'compost' });
      if (fc.board) out.push({ objs: [fc.board], pos: at(C.board.x, C.board.z), stop: 1.1, key: 'orders' });
      if (fc.jars?.length) out.push({ objs: fc.jars.map((j) => j.m), pos: at(C.jars.x, C.jars.z), stop: 1.5, key: 'jars' });
    }
    const lk = g.lake, K = L.lake;
    if (lk && K) {
      if (lk.shop) out.push({ objs: [lk.shop], pos: at(K.shop.x, K.shop.z), stop: 1.8, key: 'lakeshop' });
      if (lk.board) out.push({ objs: [lk.board], pos: at(K.board.x, K.board.z), stop: 1.1, key: 'lakeboard' });
    }
    for (const s of g.town?.sites || []) out.push({ objs: [s.root], pos: at(s.p.x, s.p.z), stop: 2.7, key: ['build', 'rush', 'building'] });
    if (g.world.herdSign && L.herd?.sign && !g.herding?.active) out.push({ objs: [g.world.herdSign], pos: at(L.herd.sign.x, L.herd.sign.z), stop: 1.2, key: 'herd' });
    const rv = g.ranch, WS = L.ranchWork;
    if (rv.booth && WS) out.push({ objs: [rv.booth], pos: at(WS.x - 1.9, WS.z), stop: 1.2, key: 'workshop' });
    if (rv.hay && L.trough) out.push({ objs: [rv.hay], pos: at(L.trough.x, L.trough.z), stop: 1.0, key: 'trough' });
    return out;
  }

  /** 정적 병합으로 메시가 없는 건물(축사·닭장·벌통)은 배치 기록의 상자로 광선 판정 */
  boxTargets() {
    if (this._boxT) return this._boxT;
    const g = this.game, L = LAYOUT, placed = g.world.placed || [], out = [];
    const boxOf = (p) => new THREE.Box3(new THREE.Vector3(p.x - p.hx, 0, p.z - p.hz), new THREE.Vector3(p.x + p.hx, p.h, p.z + p.hz));
    const near = (name, x, z, r) => placed.filter((p) => p.name === name && Math.hypot(p.x - x, p.z - z) < r).map(boxOf);
    const add = (boxes, x, z, stop, key) => { if (boxes.length) out.push({ boxes, pos: () => new THREE.Vector3(x, 0, z), stop, key }); };
    if (L.coop) add(near('coop', L.coop.x, L.coop.z, 3), L.coop.x - 1.6, L.coop.z, 1.0, 'eggcatch');
    if (L.barn && L.ranchWork?.barn) add(near('barn', L.barn.x, L.barn.z, 4), L.ranchWork.barn.x, L.ranchWork.barn.z, 1.2, 'barn');
    for (const h of L.hives || []) add(near('beehive', h.x, h.z, 1), h.x, h.z, 1.1, ['honey', 'hive']);
    if (g.world.placed) this._boxT = out; // 배치가 끝난 뒤에만 고정
    return out;
  }

  pick(sx, sy, touch = false) {
    const g = this.game;
    this.ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, g.camera);
    if (g.home?.inside && g.home.room) return this.pickInside(g.home.room);
    const list = this.targets();
    const objs = list.flatMap((t) => t.objs);
    // 숨은 물체, 시야 구멍으로 비쳐 보이는 면(유니코를 가린 집 등)은 건너뜀
    const hit = this.ray.intersectObjects(objs, true).find((h) => shown(h.object) && !seenThrough(h));
    // 상자 대상이 메시 대상보다 가까우면 그쪽. 카메라가 상자 안에 있으면(건물 뒤에 선 유니코) 그 상자는 뺌:
    // 안에서 쏜 광선은 나가는 점을 돌려주므로 어디를 눌러도 그 건물이 됨
    const R = this.ray.ray;
    let boxT = null, bd = hit ? hit.distance : Infinity;
    for (const t of this.boxTargets()) for (const b of t.boxes) {
      if (b.containsPoint(R.origin)) continue;
      if (R.intersectBox(b, this._v) && !inSeeHole(this._v)) { const d = this._v.distanceTo(R.origin); if (d < bd) { bd = d; boxT = t; } }
    }
    if (boxT) return { target: boxT };
    if (hit) {
      let o = hit.object;
      while (o) { const t = list.find((x) => x.objs.includes(o)); if (t) return { target: t }; o = o.parent; }
    }
    // 터치: 곤충처럼 작은 대상은 손가락으로 정확히 맞히기 어려우니 화면에서 가까우면 잡음 (마우스·호버는 그대로 정밀하게)
    if (touch) {
      const cands = [];
      for (const t of list) {
        const o = t.objs[0];
        if (!t.big || !o || !shown(o)) continue;
        const v = o.getWorldPosition(this._v).project(g.camera); // pos() 는 땅 높이라 실제로 보이는 위치로
        if (v.z < -1 || v.z > 1) continue;
        cands.push({ x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, t });
      }
      const t = nearestOnScreen(cands, sx, sy);
      if (t) return { target: t };
    }
    // 언덕을 누르면 실제 지면 위치 (지면 메시와 교차), 없으면 평면
    const gh = g.world.groundMesh ? this.ray.intersectObject(g.world.groundMesh, false)[0] : null;
    const p = gh ? gh.point.clone() : new THREE.Vector3();
    if (!gh && !this.ray.ray.intersectPlane(this.ground, p)) return null;
    // 밭 칸 위를 누르면 그 칸이 대상
    const tile = g.farm.tiles.find((t) => Math.abs(p.x - t.x) < 1.15 && Math.abs(p.z - t.z) < 1.15);
    if (tile) return { target: { pos: () => new THREE.Vector3(tile.x, 0, tile.z), stop: 0.35 } };
    // 논
    const pi = g.rice.paddyAt(p.x, p.z, 0.2);
    if (pi >= 0) { const pd = g.rice.paddies[pi]; return { target: { pos: () => new THREE.Vector3(pd.x, 0, pd.z), stop: 1.0 } }; }
    // 연못 물을 누르면 가장 가까운 물가로 가서 낚시
    const P = LAYOUT.pond, dc = Math.hypot(p.x - P.x, p.z - P.z);
    if (dc < P.r + 0.3) {
      const pl = g.player.position, dir = new THREE.Vector3(pl.x - P.x, 0, pl.z - P.z).normalize();
      const rimPt = new THREE.Vector3(P.x + dir.x * (P.r + 0.6), 0, P.z + dir.z * (P.r + 0.6));
      return { target: { pos: () => rimPt, stop: 0.4, key: 'fish' } };
    }
    return { point: p };
  }

  /** 집 안: 방 메시(가구·벽·바닥)를 먼저 맞히고, 가구면 그 앞자리로, 아니면 방 안 그 자리로 */
  pickInside(room) {
    const o = room.group.position;
    const hit = this.ray.intersectObject(room.group, true).find((h) => shown(h.object));
    const p = hit ? hit.point.clone() : new THREE.Vector3();
    if (!hit && !this.ray.ray.intersectPlane(this.floorIn, p)) return null;
    const lx = p.x - o.x, lz = p.z - o.z;
    const onFloor = !hit || hit.point.y - o.y < 0.06;
    if (room !== this._room) { this._room = room; this._pairs = roomSpotSolids(room); } // 집을 넓히면 방이 바뀜
    const tag = hit && (() => { for (let m = hit.object; m && m !== room.group; m = m.parent) if (m.userData.spot) return m.userData.spot; return null; })();
    let mid = null;
    if (hit && !onFloor) {
      const pcs = hit.object.userData.mids; // 합친 메시: 맞힌 삼각형이 든 조각의 가운데 (home_interior.js mergeRoomMeshes)
      const pc = pcs && pcs.find((q) => (hit.faceIndex ?? 0) < q[0]);
      if (pc) mid = { x: pc[1], z: pc[2] };
      else if (!pcs) { const c = hit.object.getWorldPosition(this._v); mid = { x: c.x - o.x, z: c.z - o.z }; }
    }
    const sp = (tag && room.spots.find((s) => s.key === tag)) || roomSpotAt(room, lx, lz, onFloor, this._pairs, mid);
    if (sp) { const v = new THREE.Vector3(o.x + sp.x, o.y, o.z + sp.z); return { target: { pos: () => v, stop: 0.3, key: 'home_' + sp.key } }; }
    const { W, D } = room;
    p.set(o.x + THREE.MathUtils.clamp(lx, -W / 2 + 0.5, W / 2 - 0.5), o.y, o.z + THREE.MathUtils.clamp(lz, -D / 2 + 0.5, D / 2 - 0.3));
    return { point: p };
  }

  click(sx, sy, touch = false) {
    const g = this.game;
    if (g.nature.fishing || g.rice.threshing) { g.input.interactTap = true; return; } // 낚시 중 클릭 = 당기기, 탈곡 중 = 연타
    if (g.dialogue?.active) { g.dialogue.advance(); return; } // 대화 중 화면을 누르면 다음 줄 (E 키와 같게)
    if (g.cinema?.locked || g.dialogue?.justClosed?.()) return;
    if (g.ui.panel || g.tractor.driving || g.smartfarm.active) return;
    const r = this.pick(sx, sy, touch);
    if (!r) return;
    if (r.target) g.player.goTo(r.target.pos, r.target.stop, !g.decor?.mode, r.target.key); // 꾸미기 중에는 걸어가기만
    else g.player.goTo(() => r.point, 0.15, false);
    const p = r.target ? r.target.pos() : r.point;
    const fy = g.home?.inside ? g.home.room.group.position.y : heightAt(p.x, p.z);
    this.marker.position.set(p.x, fy + 0.05, p.z);
    this.marker.visible = true;
    this.markerT = 0;
    g.audio.play('click', 0.4);
  }

  update(dt, input) {
    for (const c of input.clicks) this.click(c.x, c.y, !!c.touch);
    // 목적지 링: 맥동 후 사라짐
    if (this.marker.visible) {
      this.markerT += dt;
      const s = 1 + Math.sin(this.markerT * 8) * 0.12;
      this.marker.scale.set(s, s, s);
      this.marker.material.opacity = Math.max(0, 0.9 - this.markerT * 0.5);
      if (!this.game.player.moveTarget && this.markerT > 0.4) this.marker.visible = false;
    }
    // 마우스 커서: 상호작용 대상 위에서 pointer
    this.hoverAcc += dt;
    if (input.hover && this.hoverAcc > 0.12) {
      this.hoverAcc = 0;
      const r = this.pick(input.hover.x, input.hover.y);
      this.game.renderer.domElement.style.cursor = r?.target ? 'pointer' : input.drag.active ? 'grabbing' : 'default';
    }
  }
}
