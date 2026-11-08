// 주민 동물 종의 런타임 표 (모양 SDF 는 scripts/lib/species_shapes.mjs 에서 bin 으로 구움, 여기는 색·얼굴 부품 크기·옷·움직임)
// 3D 판 이름은 여기서만 바꿈. 도트판(src/pixel)은 sim/villagers.js 의 이름을 그대로 씀

export const SPECIES_IDS = ['fox', 'raccoon', 'puppy', 'bear', 'cat', 'rabbit'];

/** 주민 id → 종 */
export const VILLAGER_SPECIES = { merchant: 'fox', researcher: 'raccoon', guide: 'puppy', granny: 'bear', fisher: 'cat', kid: 'rabbit' };
/** 3D 판 주민 이름 (모두 모음으로 끝나 조사는 '와') */
export const VILLAGER_NAMES = { merchant: '장터 여우', researcher: '연구원 너구리', guide: '안내 강아지', granny: '곰 할머니', fisher: '낚시꾼 고양이', kid: '꼬마 토끼' };
export const villagerName = (id) => VILLAGER_NAMES[id];
export const speciesOf = (id) => SPECIES[VILLAGER_SPECIES[id]] || null;

// 얼굴 공통: 큰 광택 검은 눈 + 분홍 볼 + 가는 입선 (유니코와 같은 얼굴 가족)
const EYE = 0x1b1513, LINE = 0x5b4434, NOSE = 0x2a1d18;

export const SPECIES = {
  fox: {
    id: 'fox', koName: '여우', emoji: '🦊', scale: 1, obstacleR: 0.6, shadow: [0.95, 1.2, -0.18],
    palette: { body: 0xe8843c, snout: 0xfff3e2, mane: 0xfff8ef, maneD: 0x5a3a2e, hoof: 0x5a3a2e },
    face: {
      eye: { r: 0.066, s: [0.95, 1.05, 0.42], tilt: 0.22, shine: [0.024, 0.011], hl3: false, open: 1 },
      happy: EYE, lids: { color: 0x5a3a2e, r: 0.008 },
      nose: { kind: 'oval', r: 0.04, s: [1.2, 0.8, 0.8], color: NOSE },
      mouth: { r: 0.009, color: LINE }, cheek: { r: 0.085, color: 0xf7a1b5, a: 0.5 },
    },
    wear: ['headband:e35d5d', 'belt:34495e', 'pouch:f28c28', 'brooch'], props: {},
    motion: {
      gait: 'sashay',
      ears: { k: 180, c: 11, flick: [4, 8], flickV: -8, perk: 0.12, startle: { x: -0.6 } },
      // restYaw·restX: 붓꼬리를 몸 옆으로 비켜 살짝 들어 둠 (마주 본 정면에서도 흰 끝이 어깨 옆으로 보이게), 쓸기는 그 둘레로
      tail: { mode: 'sweep', k: [60, 50, 40], c: [6, 5, 4], amp: 0.18, hz: 1.1, walk: 0.22, puff: [1.25, 0.4], restYaw: 0.7, restX: 0.25 },
      trans: 0.3,
    },
    idles: ['count', 'earflick'], idleEvery: [8, 12],
    startle: ['꼬리 밟을 뻔했잖아!'],
  },
  raccoon: {
    id: 'raccoon', koName: '너구리', emoji: '🦝', scale: 0.96, obstacleR: 0.65, shadow: [1, 1.05, -0.1],
    palette: { body: 0x9a8d7e, snout: 0xf1ebe1, mane: 0x8a7c6d, maneD: 0x3f3631, hoof: 0x3f3631 },
    face: {
      eye: { r: 0.07, s: [0.92, 1.05, 0.42], tilt: 0, shine: [0.032, 0.014], hl3: false, open: 1 },
      ring: 0x8c847c, happy: 0xf1ebe1,
      nose: { kind: 'oval', r: 0.042, s: [1.2, 0.85, 0.8], color: NOSE },
      mouth: { r: 0.008, color: 0x3f3631 },
      whiskers: { kind: 'line', color: 0x3f3631, r: 0.004, len: 0.12 },
    },
    wear: ['goggles:8e7cc3', 'scarf:8e7cc3', 'brooch'], props: { lab: 'tablet', tablet: 'tablet' },
    rest: 'trex',
    motion: {
      gait: 'shuffle',
      ears: { k: 180, c: 12, flick: [6, 10], flickV: 4, both: true, perk: 0.1, startle: { x: -0.3 } },
      tail: { mode: 'low', k: [80, 65, 50], c: [7, 6, 5], amp: 0.12, hz: 0.8, walk: 0.15, base: 0.1, puff: [1.25, 0.5] },
      trans: 0.3,
    },
    idles: ['rub', 'goggle'], idleEvery: [8, 12],
    startle: ['실험 데이터가 날아갈 뻔!'],
  },
  puppy: {
    id: 'puppy', koName: '강아지', emoji: '🐶', scale: 0.94, obstacleR: 0.6, shadow: [0.95, 0.9, 0],
    palette: { body: 0xf0d09a, snout: 0xfffaf1, mane: 0xfffaf1, maneD: 0xa96a3f, hoof: 0xfffaf1 },
    face: {
      eye: { r: 0.085, s: [0.9, 1.05, 0.42], tilt: 0, shine: [0.03, 0.013], hl3: true, open: 1 },
      happy: EYE,
      nose: { kind: 'oval', r: 0.06, s: [1.2, 0.75, 0.75], color: NOSE, shine: true },
      mouth: { r: 0.009, color: LINE, tongue: 0xf27c8c }, cheek: { r: 0.09, color: 0xf7a1b5, a: 0.7 },
      whiskers: { kind: 'dot', color: 0xa96a3f, r: 0.008 },
      brows: { kind: 'dot', color: 0xa96a3f, r: 0.028, move: 0.02 },
    },
    wear: ['scarf:7ac943', 'brooch'], props: { megaphone: 'megaphone' },
    motion: {
      gait: 'trot',
      ears: { floppy: true, k: 45, c: 4.5, perk: 0 },
      tail: { mode: 'wag', k: [300, 300, 300], c: [14, 14, 14] },
      trans: 0.3,
    },
    idles: ['tilt', 'wag'], idleEvery: [7, 10],
    startle: ['왈! 깜짝이야!'],
  },
  bear: {
    id: 'bear', koName: '곰', emoji: '🐻', scale: 1, obstacleR: 0.75, shadow: [1.15, 1, 0],
    palette: { body: 0x4f423b, snout: 0xc9a27c, mane: 0xf3e6cc, maneD: 0x8a7464, hoof: 0x3a302b },
    face: {
      eye: { r: 0.062, s: [0.95, 1.05, 0.42], tilt: 0, shine: [0.022, 0.01], hl3: false, open: 1 },
      happy: EYE, idleHappy: 0.7, crinkle: { color: 0x3a302b, r: 0.006 },
      nose: { kind: 'oval', r: 0.06, s: [1.17, 0.83, 0.7], color: NOSE, shine: true },
      mouth: { r: 0.009, color: 0x3a302b, open: { r: 0.045, color: 0x4a2a24, tongue: 0xf27c8c } }, cheek: { r: 0.09, color: 0xf2a0a0, a: 0.75 },
      brows: { kind: 'flat', color: 0xf3e6cc, r: 0.05 },
    },
    wear: ['kerchief:f3e9d2', 'glasses:c9a23e', 'momppe', 'brooch'], props: {}, kerchiefDot: 0xe86a7a, // 머릿수건: 무표백 면 + 연한 잔꽃 점
    rest: 'backhand',
    motion: {
      gait: 'waddle',
      ears: { k: 240, c: 15, flick: [10, 16], flickV: 3, both: true, perk: 0.06, startle: { x: -0.3 } },
      tail: { mode: 'stub', k: [300, 300, 300], c: [16, 16, 16], amp: 0.15 },
      trans: 0.45, blinkHold: 0.2,
    },
    idles: ['backpat', 'nod'], idleEvery: [10, 14],
    startle: ['아이고 깜짝이야!'],
  },
  cat: {
    id: 'cat', koName: '고양이', emoji: '🐱', scale: 0.98, obstacleR: 0.55, shadow: [0.9, 1, -0.1],
    palette: { body: 0x9ba7b7, snout: 0xfbf8f2, mane: 0xf2b5c4, maneD: 0x5f6b7d, hoof: 0xfbf8f2 },
    face: {
      // 호박색은 눈 안에: 검은 눈(가는 테두리) 앞에 호박색 홍채 원판, 그 앞에 세로로 긴 검은 동공, 맨 앞 반짝임 (초상화와 같은 고양이 눈)
      eye: { r: 0.08, s: [0.92, 1.05, 0.5], tilt: 0.1, shine: [0.024, 0.011], hl3: false, open: 0.85 },
      iris: 0xc9a33a, irisR: 0.068, irisZ: 0.3, pupil: { r: 0.045, s: [0.62, 1, 0.3] }, happy: EYE,
      nose: { kind: 'tri', r: 0.03, color: 0xf09aa8 },
      mouth: { r: 0.007, color: LINE }, cheek: { r: 0.075, color: 0xf7a1b5, a: 0.5 },
      whiskers: { kind: 'line', color: 0xf3f3f3, r: 0.0045, len: 0.17 },
    },
    wear: ['strawhat:3a7bd5', 'scarf:3a7bd5', 'brooch'], props: {},
    motion: {
      gait: 'tiptoe',
      ears: { k: 200, c: 11, flick: [3, 6], flickV: -8, perk: 0.1, turn: 0.35, startle: { x: -0.3, out: 0.6 } },
      // 물음표 꼬리를 몸 옆으로 비켜(restYaw) 둘째 마디를 살짝 눕혀(rest2X) 정면에서도 어깨 옆으로 고리가 보이게
      tail: { mode: 'swave', k: [80, 60, 45], c: [6, 4.5, 3.5], amp: 0.25, hz: 0.8, puff: [1.3, 0.5], restYaw: 0.8, rest2X: -0.2 },
      trans: 0.3,
    },
    idles: ['groom', 'stretch', 'fishwait'], idleEvery: [8, 12],
    startle: ['냐앗! 털 다 섰잖아!'],
  },
  rabbit: {
    id: 'rabbit', koName: '토끼', emoji: '🐰', scale: 0.85, obstacleR: 0, shadow: [0.85, 0.85, -0.05],
    palette: { body: 0xddbba0, snout: 0xfffaf3, mane: 0xf6b8c8, maneD: 0xb88f6c, hoof: 0xf4e4cf },
    face: {
      eye: { r: 0.085, s: [0.9, 1.05, 0.42], tilt: 0, shine: [0.03, 0.013], hl3: true, open: 1 },
      happy: EYE,
      nose: { kind: 'Y', r: 0.025, s: [1.2, 0.8, 0.6], color: 0xf09aa8 },
      mouth: { r: 0.007, color: LINE }, cheek: { r: 0.08, color: 0xf7a1b5, a: 0.9 },
      whiskers: { kind: 'line', color: 0xf3f3f3, r: 0.004, len: 0.13 },
      teeth: 0xffffff,
    },
    wear: ['overalls:f28bb0', 'bow:f28bb0', 'brooch'], props: {}, overallsHem: 0xe2779f,
    motion: {
      gait: 'hop',
      ears: { k: 90, c: 7, tipK: 60, tipC: 5, flick: [5, 9], flickV: 3, both: true, perk: 0.1, startle: { x: 0.15, stiff: true } },
      tail: { mode: 'pom', k: [200, 200, 200], c: [10, 10, 10] },
      trans: 0.25,
    },
    idles: ['hop', 'nose', 'net'], idleEvery: [5, 8],
    startle: ['으앗! 귀가 쫑긋!'],
  },
};

/** 이름표·감정 아이콘·말풍선 높이 (§4.7). 종은 굽힌 키(meta.top)로, 유니콘은 예전 값 */
export function labelHeights(sp, top) {
  const label = Math.max(2.0, Math.round((top * sp.scale + 0.28) * 100) / 100);
  return { label, emote: label + 0.3, bubble: label + 0.7 };
}
