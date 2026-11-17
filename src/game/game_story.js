// Game 믹스인: 첫 접속 인트로·KOAT 체험관 첫 방문 컷신·처음 가는 곳 한 줄 안내
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)
// 컷신 스텝 목록은 따로 내보내는 함수(introSteps·koatSteps) → 화면 구도 시험(tests/cutscene_steps.test.js)이 그대로 돌려 봄
import * as THREE from 'three';
import { LAYOUT } from './world.js';
import { saveGame } from './save.js';

/** 반려견이 뛰어 들어오는 거리(m): 순간이동 따라가기(22m)보다 가깝게 */
export const PET_RUN_IN = 9;
/** 처음 목장 문 가까이(m) 오면 한 줄 안내 */
export const RANCH_TIP_R = 6;
/** 처음 체험관 문 가까이(m) 걸어 들어오면 KOAT 컷신 */
export const KOAT_GATE_R = 4;

/** '내 농장' 전경: 밭 가운데(목표 빛기둥)는 왼쪽 1/3 선, 집은 오른쪽 1/3 선, 둘 다 화면 위쪽 2/3 — 가로 화면은 서쪽에서, 세로 화면은 북쪽 위에서 (집이 위, 밭이 아래) */
export function farmShot(aspect) {
  if (aspect < 1) return [[-3.5, 16.8, -14.9], [0.5, 0, 4.9], 2.0];
  return [[-25.8, 11.2, 3.6], [-0.9, 0, 8], 2.0];
}

/** '이 밭이랑 저 집' 짚기: 목표 빛기둥을 통통 키웠다 줄이고, 집 문 앞에 금빛 고리를 잠깐 (컷신 동안만, 끝나면 치움) */
export function farmCallout(g, sec = 2.6) {
  if (typeof requestAnimationFrame !== 'function') return;
  const m = g.guide?.marker, H = LAYOUT.home, scene = g.world?.scene;
  let ring = null;
  if (scene) {
    ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.85, 40), new THREE.MeshBasicMaterial({ color: 0xfac03e, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(H.door.x, 0.08, H.door.z);
    scene.add(ring);
  }
  const t0 = performance.now();
  const tick = (now) => {
    const t = (now - t0) / 1000, k = Math.abs(Math.sin(t * Math.PI * 1.5));
    if (t > sec || g.cinema?.skipping) {
      m?.scale.setScalar(1);
      if (ring) { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); }
      return;
    }
    m?.scale.setScalar(1 + 0.5 * k);
    if (ring) { ring.scale.setScalar(1 + 0.25 * k); ring.material.opacity = 0.5 + 0.4 * k; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 첫 접속 인트로: 마을 전경 → 안내 강아지 인사 → 내 밭과 집 → 씨앗 선물 → 반려견 이름 카드 → 밭으로 (탭 4번 + 이름 카드) */
export function introSteps(g) {
  const ge = g.npcs.list.find((e) => e.id === 'guide'), guide = ge?.u;
  const G = { speaker: guide, name: ge?.name ?? LAYOUT.npcs.guide.name, color: '#6dbb4f', emote: 'megaphone' };
  const me = g.player.unico, pet = g.pet?.ok ? g.pet : null;
  const gp = () => guide?.group.position ?? g.player.position;
  // 안내 강아지 손 위치 (나 쪽으로 0.35m, 허리 높이): 씨앗이 여기서 가방으로 날아감
  const hand = () => {
    const p = gp(), q = g.player.position, d = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    return new THREE.Vector3(p.x + ((q.x - p.x) / d) * 0.35, 1.0 * (guide?.scale ?? 1), p.z + ((q.z - p.z) / d) * 0.35);
  };
  const steps = [
    // 첫 장면: 비스듬한 마을 전경 (정면 높은 전경보다 그리기 25% 가벼움 — 인트로 첫 몇 초 끊김 완화)
    { cam: [[10, 22, 30], [0, 0, 0], 0.01], hold: 0 },
    { cam: [[16, 16, 26], [0, 0, 0], 3.2] },
    { face: guide, with: me, emote: 'wave' }, // 3/4 앞 얼굴 + 내 어깨 (가장자리)
    { say: [{ ...G, emote: 'wave', text: `안녕, ${g.playerName}! 유니코 팜에 온 걸 환영해 🦄` }] },
    { cam: farmShot(g.camera.aspect) },
    { run: () => farmCallout(g) }, // 밭 빛기둥·집 문 앞 고리를 짚음
    { say: [{ ...G, text: '오늘부터 이 밭이랑 저 집이 네 거야!' }] },
    { face: guide, with: me, emote: 'present', profile: true }, // 건네주기: 두 사람을 옆에서
    { run: () => { // 실제 시작 씨앗(당근 3개)을 손에서 가방으로 + 받는 쪽은 기뻐함
      g.ui.flyToBag?.('🥕', hand());
      g.ui.toast('🎁 당근 씨앗 3개를 받았어요');
      g.audio?.play?.('coin');
      me?.playAction?.('cheer', 0.9);
    } },
    { say: [{ ...G, emote: 'present', text: '이건 선물! 당근 씨앗 3개야 🥕 이 호미로 밭을 갈고 씨앗을 심어 봐.' }] },
  ];
  if (pet) {
    steps.push(
      { run: () => g.petEntrance() },
      { wait: 6, until: () => { const a = pet.e?.m?.position, b = g.player.position; return !a || (Math.hypot(a.x - b.x, a.z - b.z) < 2.6 && pet.vel < 0.3); } }, // 뛰어 들어와 내 곁에 설 때까지 (느린 기기도)
      { run: () => pet.settle?.(1e9) }, // 이름 카드가 끝날 때까지 그 자리에 (구도를 벗어나지 않게)
      { face: pet, with: me, avoid: guide }, // 콩이를 낮게 가까이, 카메라를 봄 (안내 강아지는 화면 밖으로)
      {
        ask: { ...G, emote: 'heart', text: '이 아이는 네 강아지야. 이름 지어 줄래?', input: { value: pet.sim.name, max: 6, icon: '🐕', onShow: () => pet.cheer?.() } },
        then: (v) => { pet.rename(v, { quiet: v === pet.sim.name }); pet.cheer?.(); pet.settle?.(1.2); },
      },
    );
  }
  steps.push(
    { face: guide, toward: [0, 0], emote: 'wave' }, // 마무리: 안내 강아지 얼굴 + 뒤로 밭
    { say: [{ ...G, emote: 'wave', text: '먼저 밭부터 갈아 보자! KOAT 체험관은 지도에서 언제든 갈 수 있어 😊' }] },
    { run: () => {
      // 끝나면 내 뒤에서 밭(북쪽)을 바라봄
      if (me) me.facing = Math.PI;
      if (g.followCam) g.followCam.yaw = 0;
      if (pet) pet.settle?.(0);
      g.flags.petIntro = true;
      g.ui.toast('🎯 왼쪽 위 목표를 따라가 보세요');
      saveGame(g);
    } },
  );
  return steps;
}

/** KOAT 체험관 첫 방문: 안내데스크가 본관을 등지고 인사 → 부스 → 스탬프 설명 */
export function koatSteps(g) {
  const desk = g.koat.desk, K = LAYOUT.koat;
  const D = { speaker: desk, name: '안내데스크 (기획운영본부)', color: '#30b6aa', emote: 'talk' };
  return [
    { cam: [[25, 7, -12], [25, 2, -30], 2.4] },
    { face: desk, toward: [K.hq.x, K.hq.z], emote: 'wave' },
    { say: [{ ...D, emote: 'wave', text: '한국농업기술진흥원(KOAT) 체험관에 온 걸 환영해요!' }] },
    { cam: [[19.5, 3.4, -24], [17.2, 1.3, -27], 1.8] },
    { say: [{ ...D, text: '왼쪽은 기술사업화·벤처창업·종자사업, 오른쪽은 스마트농업·농기계검정·농업환경분석 본부 부스예요.' }] },
    { cam: [[25, 2.6, -26.2], [25, 1.3, -29.3], 1.6] },
    { say: [{ ...D, emote: 'present', text: '부스마다 미니게임을 통과하면 스탬프를 드려요. 여섯 개를 모아 오면 \'KOAT 명예 연구원\' 칭호를 드릴게요!' }] },
    { run: () => { g.flags.koatIntro = true; } }, // 건너뛰어도 실행 (끝까지 못 보고 오류가 나면 다음에 다시)
  ];
}

export const GameStory = {
  /** 처음 접속: 내 밭·집을 보여 주고 씨앗·반려견을 맡김 */
  introCutscene() {
    this.flags.intro = true;
    this._introPending = false; // 이제부터 저장 (다음 접속은 인트로 없이 이어 하기)
    return this.cinema.play(introSteps(this));
  },

  /** KOAT 체험관 첫 방문 */
  koatCutscene() {
    this._koatCine = true; // 대기열에 들어간 동안 또 부르지 않게
    return this.cinema.play(koatSteps(this)).finally(() => { this._koatCine = false; });
  },

  /** 인트로의 반려견 등장: 안내 강아지 뒤쪽 9m 빈자리에 두면 따라오기 동작이 뛰어 들어옴 */
  petEntrance() {
    const pet = this.pet, m = pet?.e?.m;
    if (!m) return;
    const pp = this.player.position, gp = this.npcs.list.find((e) => e.id === 'guide')?.u.group.position ?? pp;
    const base = Math.atan2(gp.x - pp.x, gp.z - pp.z);
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
      const a = base + off, x = pp.x + Math.sin(a) * PET_RUN_IN, z = pp.z + Math.cos(a) * PET_RUN_IN;
      let clear = true;
      for (let k = 1; k <= 6 && clear; k++) { const t = k / 6; clear = !this.world.isBlocked?.(pp.x + (x - pp.x) * t, pp.z + (z - pp.z) * t, 0.4); }
      if (!clear) continue;
      m.position.set(x, m.position.y, z);
      m.rotation.y = a + Math.PI;
      return;
    }
  },

  /** 처음 가는 곳 한 줄 안내 (카메라는 잡지 않음): 목장 문 가까이 → 팁, 체험관 문으로 걸어 들어오면 KOAT 컷신 */
  storyTick(pp) {
    const f = this.flags;
    if (!f.intro || this.cinema.locked || this.dialogue.active || this.ui.panel) return;
    const R = LAYOUT.ranch.gate;
    if (!f.ranchTip && !this.ride?.driving && Math.hypot(pp.x - R.x, pp.z - R.z) < RANCH_TIP_R) {
      f.ranchTip = true;
      const t = '🐄 여기는 목장이에요! 사료를 주면 우유·달걀이 생기고, 사료는 장터에서 살 수 있어요';
      if (this.ui.tip) this.ui.tip('ranch', t); else this.ui.toast(t);
    }
    const K = LAYOUT.koat.gate;
    if (!f.koatIntro && !this._koatCine && !this.ride?.driving && Math.hypot(pp.x - K.x, pp.z - K.z) < KOAT_GATE_R) this.koatCutscene();
  },
};
