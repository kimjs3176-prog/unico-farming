import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { makeLabel } from './label.js';
import { SURF } from './surface.js';

/** 이보다 먼(카메라 기준, m) 작은 배경 효과(별 6개 이하: 익은 밭·굴뚝·공사장 먼지, 걸음 먼지)는 만들지 않음 — 화면에 2~3픽셀이라 안 보임 */
const FAR = 40;
/** 다 쓴 입자를 종류별로 이만큼까지 모아 두었다가 다시 씀 (재질·메시를 매번 새로 만들지 않게) */
const KEEP = 96;
/** 동시에 떠 있는 입자(별·먼지·물방울) 상한: 낮음 품질은 적게 (넘치면 더 만들지 않음) */
export const fxCap = (q) => (q?.level === 'low' ? 48 : 128);
/** 불꽃놀이 단계별 발 수·한 발의 별 수 (낮음은 작은 한 발) */
export const FIREWORKS = { low: { shots: 1, n: 18 }, medium: { shots: 3, n: 28 }, high: { shots: 5, n: 32 } };
const SHELL_COLORS = [0xffb000, 0xff4f8b, 0x2fa8ff, 0x63d14a, 0xff7a1a]; // 낮 하늘에서도 보이게 진한 색

/**
 * 덮어쓰기 재질로 그리는 패스(주변광 차폐 GTAO 의 법선·깊이)에서는 글자 스프라이트를 그리지 않음:
 * 투명한 사각형이 깊이로 들어가 글자 둘레에 검은 판이 생김 → 그 패스에서만 크기를 0 으로 (다음 렌더에서 다시 계산됨)
 */
export function skipOverride(renderer, scene) {
  if (scene?.overrideMaterial) this.matrixWorld.makeScale(0, 0, 0);
}

/** 수확물 보여 주기 시간 (초): 흙 → 머리 위 / 머리 위에서 / 너무 멀어지면 바로 가방으로 (m)
 * lift: 머리 뼈보다 이만큼(m) 위 (뿔에 겹치지 않게), turn: 솟는 동안 카메라 쪽으로 이만큼(라디안)까지 돌아섬 */
export const ITEM_GET = { arc: 0.3, hold: 0.45, far: 14, lift: 1.15, turn: Math.PI / 3 };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** 카메라 쪽으로 최대 turn 만큼 돌린 방향 (facing 은 atan2(dx, dz)) */
export function faceToward(facing, px, pz, cx, cz, turn = ITEM_GET.turn) {
  const want = Math.atan2(cx - px, cz - pz), d = wrapA(want - facing);
  return facing + Math.max(-turn, Math.min(turn, d));
}
const easeOutBack = (k) => { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };

/** 간단 이펙트: 떠오르는 이모지, 물방울 */
export class FX {
  constructor(scene, quality = null) {
    this.scene = scene;
    this.items = [];
    this.live = 0; // 지금 떠 있는 입자 수
    this.shells = []; // 기다리는 불꽃 (fireworks)
    this.rockets = []; // 올라가거나 터진 불꽃
    this.setQuality(quality);
    // 입자는 이 묶음 안에서 보이기만 껐다 켬 (장면에 넣고 빼기를 반복하지 않음)
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.pool = { star: [], dust: [], drop: [] };
    this.dropGeo = new THREE.SphereGeometry(0.06, 6, 5);
    this.dropMat = new THREE.MeshBasicMaterial({ color: 0x6fc3e8, transparent: true, opacity: 0.9 });
  }

  /** 카메라에서 먼 곳인가 (카메라 위치는 매 프레임 SURF.seeCam 에 들어옴) */
  _far(x, y, z) {
    const c = SURF.seeCam.value, dx = c.x - x, dy = c.y - y, dz = c.z - z;
    return dx * dx + dy * dy + dz * dz > FAR * FAR;
  }

  /** 품질을 바꿀 때 (입자 상한) */
  setQuality(q) { this.cap = fxCap(q); }

  /** 풀에서 꺼내거나 새로 만들기. 상한을 넘으면 null */
  _take(kind, make) {
    if (this.live >= this.cap) return null;
    const m = this.pool[kind].pop() || make();
    if (m.parent !== this.group) this.group.add(m);
    m.visible = true;
    this.live++;
    return m;
  }

  /** 별 반짝임 터지기 (가산 혼합) */
  burst(x, y, z, color = 0xffd75a, n = 12) {
    if (n <= 6 && this._far(x, y, z)) return; // 순간이동·집 넓히기처럼 큰 효과는 카메라가 아직 멀어도 그대로
    n = Math.min(n, this.cap - this.live); // 상한에 걸리면 개수를 줄여 고른 둥근 고리로 (앞쪽 각도만 나와 한쪽으로 쏠리지 않게)
    if (n <= 0) return;
    if (!this.starGeo) this.starGeo = new THREE.OctahedronGeometry(0.06, 0);
    const make = () => {
      const s = new THREE.Mesh(this.starGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.userData.v = new THREE.Vector3();
      return s;
    };
    for (let i = 0; i < n; i++) {
      const m = this._take('star', make);
      if (!m) break;
      m.material.color.set(color);
      m.material.opacity = 1;
      m.scale.setScalar(1);
      m.rotation.set(0, 0, 0);
      m.position.set(x, y, z);
      const a = (i / n) * Math.PI * 2, sp = 1.2 + Math.random() * 1.4;
      m.userData.v.set(Math.cos(a) * sp, 1.6 + Math.random() * 1.8, Math.sin(a) * sp);
      this.items.push({ obj: m, life: 0.7 + Math.random() * 0.3, vy: 0, star: true, kind: 'star' });
    }
  }

  /**
   * 떠오르는 글자. 기본은 떠오르기만 (하트·별·음표처럼 물건이 아닌 것)
   * o.to: 'bag' 이면 가방으로 날아감(가방에 실제로 들어온 물건만), 'coin' 이면 o.amount 코인이 지갑으로 날아감
   * o.y·o.vy 로 시작 높이·떠오르는 속도, o.burst:false 면 반짝임 없음
   */
  pop(x, z, text, o = {}) {
    const { to = null, y = 1.2, vy = 1.6, burst = true } = o;
    if (burst) this.burst(x, y - 0.2, z);
    if (to === 'bag') this.onPop?.(text, new THREE.Vector3(x, y, z), o);
    else if (to === 'coin') this.onCoin?.(o.amount || 0, new THREE.Vector3(x, y, z));
    const s = makeLabel(text, { bg: 'rgba(0,0,0,0)', size: 56, scale: 0.012 });
    s.material.depthWrite = false;
    s.onBeforeRender = skipOverride;
    s.position.set(x, y, z);
    this.scene.add(s);
    this.items.push({ obj: s, life: 1.2, vy, dispose: s.userData.dispose });
  }

  sprinkle(x, z) {
    const make = () => new THREE.Mesh(this.dropGeo, this.dropMat);
    for (let i = 0; i < 14; i++) {
      const m = this._take('drop', make);
      if (!m) break;
      m.position.set(x + (Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 0.5, z + (Math.random() - 0.5) * 1.6);
      this.items.push({ obj: m, life: 0.6 + Math.random() * 0.4, vy: -2 - Math.random() * 2, kind: 'drop' });
    }
  }

  /** 발밑 흙먼지 (걷기 착지마다) */
  dust(x, z) {
    if (!this.dustGeo) {
      this.dustGeo = new THREE.SphereGeometry(0.09, 6, 4);
      this.dustMat = new THREE.MeshBasicMaterial({ color: 0xe9dcc0, transparent: true, opacity: 0.7, depthWrite: false });
    }
    const y = heightAt(x, z) + 0.08;
    if (this._far(x, y, z)) return;
    const make = () => new THREE.Mesh(this.dustGeo, this.dustMat.clone()); // 알마다 따로 옅어지므로 재질은 하나씩 (다시 씀)
    for (let i = 0; i < 3; i++) {
      const m = this._take('dust', make);
      if (!m) break;
      m.material.opacity = 0.7;
      m.scale.setScalar(1);
      m.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
      this.items.push({ obj: m, life: 0.45, vy: 0.5, grow: 2.2, fade: true, kind: 'dust' });
    }
  }

  /**
   * 얻은 물건 보여 주기: mesh 가 from(없으면 지금 자리)에서 머리 위로 솟아 잠깐 머문 뒤 가방으로
   * 한 번에 하나만 (새로 부르면 앞의 것은 바로 끝냄). 모든 품질에서 같은 시간.
   * mesh 는 부른 쪽 것: 끝나면 장면에서 빼기만 하고 해제는 onDone 에서 (함께 쓰는 지오메트리를 지우지 않게)
   * @param player { position, unico: { headG, label, playAction }, arrow }
   * @param o { tier: 1~3 (2 이상이면 금빛 반짝임 많이), emoji: 가방으로 날릴 글자, scale, from,
   *   delay: 이만큼(초) 뒤에 솟음 (뽑기·줍기 동작이 먼저 보이게), onSpawn(), onApex(head), onDone(pos) }
   */
  itemGet(mesh, player, o = {}) {
    this.finishItem();
    const from = (o.from || mesh.position).clone();
    const s = o.scale ?? 1;
    mesh.position.copy(from);
    mesh.scale.setScalar(s * 0.4);
    if (mesh.parent !== this.scene) this.scene.add(mesh);
    const u = player?.unico;
    const hid = [u?.label, player?.arrow].filter((x) => x?.visible); // 이름표·화살표가 물건을 가리지 않게
    for (const x of hid) x.visible = false;
    this._clearEmote(u);
    const wait = (o.delay || 0) > 0;
    mesh.visible = !wait;
    this.item = { mesh, player, o, from, s, t: 0, phase: wait ? 'wait' : 'arc', hid, head: new THREE.Vector3(), start: player?.position?.clone?.() };
    if (!wait) this._spawn(this.item);
    return this.item;
  }

  /** 머리 위 감정 아이콘(🎉 등)은 물건과 겹치지 않게 바로 걷음 (unico 가 다음 프레임에 지움) */
  _clearEmote(u) { if (u?.emote) u.emoteUntil = -1; }

  /** 솟기 시작: 카메라 쪽으로 반쯤 돌아서서 들어 올리는 모습과 물건이 함께 보이게 */
  _spawn(it) {
    const u = it.player?.unico, P = it.player?.position, c = SURF.seeCam.value;
    if (u && P && Number.isFinite(u.facing) && !u.riding && !u.swimming) {
      it.face0 = u.facing;
      u.facing = it.faceSet = faceToward(u.facing, P.x, P.z, c.x, c.z);
    }
    it.o.onSpawn?.();
  }

  /** 진행 중인 물건 보여 주기를 바로 끝냄 (가방으로 날리고 onDone 한 번) */
  finishItem() {
    const it = this.item;
    if (!it) return;
    this.item = null;
    const pos = it.mesh.position.clone();
    it.mesh.parent?.remove(it.mesh);
    it.mesh.visible = true;
    for (const x of it.hid) x.visible = true;
    const u = it.player?.unico;
    if (u && it.faceSet !== undefined && u.facing === it.faceSet) u.facing = it.face0; // 그사이 걷지 않았으면 원래 보던 쪽으로
    if (it.o.emoji) this.onPop?.(it.o.emoji, pos, {});
    it.o.onDone?.(pos);
  }

  /** 머리 위 자리 */
  _headTop(P, out) {
    const hg = P?.unico?.headG;
    if (hg?.getWorldPosition) { hg.getWorldPosition(out); out.y += ITEM_GET.lift; }
    else if (P?.position) out.set(P.position.x, P.position.y + 2.7, P.position.z);
    return out;
  }

  _stepItem(dt) {
    const it = this.item;
    if (!it) return;
    it.t += dt;
    const P = it.player, m = it.mesh;
    if (it.start && P?.position && Math.hypot(P.position.x - it.start.x, P.position.z - it.start.z) > ITEM_GET.far) return this.finishItem();
    if (it.phase === 'wait') {
      if (it.t < it.o.delay) return;
      it.phase = 'arc'; it.t = 0; m.visible = true;
      this._clearEmote(P?.unico);
      this._spawn(it);
    }
    const head = this._headTop(P, it.head);
    if (it.phase === 'arc') {
      const k = Math.min(1, it.t / ITEM_GET.arc), e = easeOutBack(k);
      m.position.lerpVectors(it.from, head, e);
      m.position.y += Math.sin(k * Math.PI) * 0.5;
      m.scale.setScalar(it.s * (0.4 + 0.6 * Math.min(1, k * 1.6)));
      m.rotation.set(0.25, m.rotation.y + dt * 6, 0);
      if (k >= 1) {
        it.phase = 'hold'; it.t = 0;
        const big = (it.o.tier || 1) >= 2;
        this.burst(head.x, head.y, head.z, big ? 0xffd75a : 0xfff3a0, big ? 14 : 6);
        if (P?.unico?.playAction && !P.unico.riding && !P.unico.swimming) P.unico.playAction('lift', ITEM_GET.hold + 0.2);
        it.o.onApex?.(head);
        this._clearEmote(P?.unico);
      }
    } else {
      m.position.copy(head);
      m.position.y += Math.sin(it.t * 9) * 0.04;
      m.scale.setScalar(it.s * (1 + 0.15 * Math.max(0, 1 - it.t / 0.18))); // 닿는 순간 '짠'
      m.rotation.set(0.25, m.rotation.y + dt * 2.5, 0.3 + Math.sin(it.t * 7) * 0.12);
      if (it.t >= ITEM_GET.hold) this.finishItem();
    }
  }

  /** 수명이 끝난 효과: 입자는 풀로 돌려놓고, 글자는 해제 */
  _free(it) {
    const o = it.obj;
    if (!it.kind) { this.scene.remove(o); it.dispose?.(); return; }
    this.live--;
    const pool = this.pool[it.kind];
    if (pool.length < KEEP) { o.visible = false; pool.push(o); return; }
    this.group.remove(o);
    if (it.kind !== 'drop') o.material.dispose(); // 물방울 재질은 함께 쓰는 것
  }

  /**
   * 불꽃놀이 (함께 수확 목표 달성): 머리 위 3~4m 하늘에 둥근 불꽃 몇 발. 품질에 맞춰 — 낮음은 작은 한 발, 보통 3발, 높음 5발
   * 한 발 = 점 묶음(Points) 하나 → 그리기 한 번. 올라가는 꼬리 → 가운데 번쩍 → 색 구슬이 둥글게 퍼짐
   * 카메라 쪽으로 조금 당겨 3인칭 화면 위쪽에 들어오게
   */
  fireworks(x, z, level = 'medium') {
    const plan = FIREWORKS[level] || FIREWORKS.medium;
    const c = SURF.seeCam.value, dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz) || 1;
    const cx = x + (dx / d) * 1.2, cz = z + (dz / d) * 1.2; // 카메라 쪽으로 1.2m
    const ground = heightAt(x, z);
    for (let i = 0; i < plan.shots; i++) {
      const a = (i / plan.shots) * Math.PI * 2 + 0.6, r = i ? 2.4 : 0;
      const sx = cx + Math.cos(a) * r, sz = cz + Math.sin(a) * r;
      this.shells.push({ t: i * 0.38, x: sx, z: sz, y0: ground + 0.8, y: ground + 3.4 + (i % 2) * 0.7, color: SHELL_COLORS[i % SHELL_COLORS.length], n: plan.n });
    }
  }

  /** 둥근 빛 점 그림 (한 번 만들어 함께 씀) */
  _glowTex() {
    if (this._glow) return this._glow;
    const S = 64, data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
      const a = r >= 1 ? 0 : r < 0.35 ? 1 : Math.max(0, 1 - (r - 0.35) / 0.65) ** 1.6; // 가운데 꽉 찬 원 + 부드러운 빛 테두리
      const i = (y * S + x) * 4, wv = r < 0.25 ? 255 : 230; // 가운데는 하얗게
      data[i] = data[i + 1] = data[i + 2] = wv; data[i + 3] = Math.round(a * 255);
    }
    const t = new THREE.DataTexture(data, S, S);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    return (this._glow = t);
  }

  /** 불꽃 한 발 시작: 꼬리를 달고 올라감 (점 묶음 하나, 다 쓰면 모아 두었다가 다시 씀) */
  _shell(s) {
    const N = 32;
    let o = (this.shellPool ||= []).pop();
    if (!o) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const mat = new THREE.PointsMaterial({ size: 0.42, map: this._glowTex(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, fog: false });
      o = new THREE.Points(geo, mat);
      o.frustumCulled = false;
      o.onBeforeRender = skipOverride; // 주변광 차폐(덮어쓰기) 패스에서는 그리지 않음 (검은 판이 생김)
      o.userData.vel = new Float32Array(N * 3);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex(), color: 0xfff6d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      flash.onBeforeRender = skipOverride;
      o.userData.flash = flash;
    }
    const n = Math.min(N, s.n), geo = o.geometry, col = geo.attributes.color.array, base = new THREE.Color(s.color);
    for (let k = 0; k < N; k++) {
      // 넷 중 하나는 밝은 색(하양 섞음) → 반짝이는 느낌
      const w = k % 4 === 0 ? 0.55 : 0;
      col[k * 3] = base.r + (1 - base.r) * w; col[k * 3 + 1] = base.g + (1 - base.g) * w; col[k * 3 + 2] = base.b + (1 - base.b) * w;
    }
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, n);
    o.material.opacity = 1;
    o.material.size = 0.3;
    o.visible = true;
    if (o.parent !== this.group) this.group.add(o);
    const f = o.userData.flash;
    f.visible = false;
    if (f.parent !== this.group) this.group.add(f);
    this.rockets.push({ o, s, n, phase: 0, t: 0, rise: 0.45 });
  }

  /** 불꽃 한 프레임: 오름(꼬리) → 터짐(번쩍 + 구 모양으로 퍼지고 떨어지며 흐려짐) */
  _stepRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i], { o, s, n } = r, pos = o.geometry.attributes.position.array, vel = o.userData.vel, f = o.userData.flash;
      r.t += dt;
      if (r.phase === 0) {
        // 머리가 올라가고 나머지 점은 뒤로 줄지어 꼬리 (아래로 갈수록 흐린 대신 촘촘히)
        const k0 = Math.min(1, r.t / r.rise), head = s.y0 + (s.y - s.y0) * (1 - (1 - k0) ** 2);
        for (let k = 0; k < n; k++) {
          const back = (k / n) * Math.min(1.4, head - s.y0);
          pos[k * 3] = s.x; pos[k * 3 + 1] = head - back; pos[k * 3 + 2] = s.z;
        }
        o.material.size = 0.22;
        o.material.opacity = 0.85;
        if (k0 >= 1) { // 터짐
          r.phase = 1; r.t = 0; r.life = 1.5;
          for (let k = 0; k < n; k++) {
            const yv = 1 - (2 * (k + 0.5)) / n, rr = Math.sqrt(1 - yv * yv), th = k * 2.39996; // 피보나치 구
            const sp = 3.2 + ((k * 0.618034) % 1) * 0.5; // 별마다 다른 속도 (난수 대신 황금비: 퍼짐이 늘 고르게)
            vel[k * 3] = Math.cos(th) * rr * sp; vel[k * 3 + 1] = yv * sp + 0.6; vel[k * 3 + 2] = Math.sin(th) * rr * sp;
            pos[k * 3] = s.x; pos[k * 3 + 1] = s.y; pos[k * 3 + 2] = s.z;
          }
          f.position.set(s.x, s.y, s.z);
          f.visible = true;
        }
      } else {
        const drag = Math.exp(-2.2 * dt);
        for (let k = 0; k < n; k++) {
          vel[k * 3] *= drag; vel[k * 3 + 1] = vel[k * 3 + 1] * drag - 2.4 * dt; vel[k * 3 + 2] *= drag;
          pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
        }
        const left = 1 - r.t / r.life;
        o.material.size = 0.42 + 0.12 * Math.min(1, r.t * 4);
        o.material.opacity = Math.max(0, Math.min(1, left * 1.6));
        // 가운데 번쩍: 0.3초 동안 커지며 사라짐
        if (f.visible) {
          const fk = r.t / 0.3;
          if (fk >= 1) f.visible = false;
          else { f.scale.setScalar(1.2 + fk * 2.6); f.material.opacity = 1 - fk; }
        }
        if (left <= 0) {
          o.visible = false; f.visible = false;
          this.shellPool.push(o);
          this.rockets.splice(i, 1);
          continue;
        }
      }
      o.geometry.attributes.position.needsUpdate = true;
    }
  }

  update(dt) {
    if (this.shells.length) {
      for (const s of this.shells) s.t -= dt;
      while (this.shells.length && this.shells[0].t <= 0) this._shell(this.shells.shift());
    }
    if (this.rockets.length) this._stepRockets(dt);
    this._stepItem(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.obj.position.y += it.vy * dt;
      if (it.star) {
        const v = it.obj.userData.v;
        v.y -= 6 * dt;
        it.obj.position.addScaledVector(v, dt);
        it.obj.rotation.x += dt * 8; it.obj.rotation.y += dt * 6;
        it.obj.material.opacity = Math.min(1, it.life * 2);
        it.obj.scale.setScalar(0.6 + it.life);
      }
      if (it.grow) it.obj.scale.multiplyScalar(1 + it.grow * dt);
      if (it.fade) it.obj.material.opacity = Math.max(0, it.life * 1.5);
      if (it.obj.material && 'opacity' in it.obj.material && it.dispose) it.obj.material.opacity = Math.min(1, it.life);
      if (it.life <= 0 || it.obj.position.y < 0) { this._free(it); this.items.splice(i, 1); }
    }
  }
}
