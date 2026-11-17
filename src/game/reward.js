// 보상 등급: 작은 보상(끄덕) · 중간(주먹 불끈) · 큰 보상(만세) — 동작·소리·반짝임을 한 표로
// 내 캐릭터가 받는 보상에만 씀 (주민이 기뻐하는 연기는 그대로)

/** 등급별 동작·길이·소리·반짝임 수(높음/낮음 품질) */
export const TIERS = {
  1: { act: 'glad', dur: 0.6, sound: 'pickup', burst: 0, burstLow: 0 },
  2: { act: 'fistpump', dur: 1.0, sound: 'win', burst: 10, burstLow: 6 },
  3: { act: 'cheer', dur: 1.6, sound: 'levelup', burst: 24, burstLow: 12 },
};

/** 수확 등급: 거대 작물 3, 별 셋 2, 나머지 1 */
export const harvestTier = (r) => (r?.giant ? 3 : r?.stars === 3 ? 2 : 1);
/** 수확 소리: 별 셋까지는 수확 소리, 거대 작물만 큰 팡파르 */
export const harvestSound = (r) => (r?.giant ? 'levelup' : 'harvest');
/** 미니게임 결과 등급: 별 셋이나 새 기록이면 3, 통과(별 하나 이상)면 2, 아니면 0(보상 없음) */
export const minigameTier = (stars, isNew) => (stars >= 3 || (isNew && stars > 0) ? 3 : stars >= 1 ? 2 : 0);
/** 사기·넓히기 소리 (의상 사기는 2단계 보상) */
export const BUY_SOUND = 'buy';

/**
 * 보상 한 번: 동작 + 소리 + 반짝임 (+ 3단계는 화면 손맛·배경음 낮춤)
 * @param g 게임
 * @param tier 1 · 2 · 3
 * @param o { x, z: 반짝임 위치(없으면 내 머리 위) · label: 머리 위에 떠오를 글 · burstColor · sound: 바꿀 소리(null 이면 소리 없음) · act: false 면 동작 없음 }
 */
export function reward(g, tier, o = {}) {
  const T = TIERS[tier];
  if (!T || !g) return;
  const u = g.player?.unico, P = g.player?.position;
  const low = g.quality?.level === 'low';
  // 동작: 탈것·수영·컷신 중에는 하지 않음 (자세가 깨지지 않게)
  if (o.act !== false && u && !u.riding && !u.swimming && !g.cinema?.locked && !g.ride?.driving) {
    u.playAction(T.act, T.dur);
    u.happyUntil = Math.max(u.happyUntil || 0, (u.t || 0) + T.dur + 0.8);
  }
  const sound = o.sound === undefined ? T.sound : o.sound;
  if (sound) g.audio?.play(sound);
  const x = o.x ?? P?.x, z = o.z ?? P?.z;
  const n = low ? T.burstLow : T.burst;
  if (n && x !== undefined) g.fx?.burst(x, (o.y ?? (P?.y || 0)) + 1.6, z, o.burstColor ?? 0xffd75a, n);
  if (o.label && x !== undefined) g.fx?.pop(x, z, o.label, { y: (P?.y || 0) + 2.2, vy: 0.6 });
  if (tier === 3) {
    g.juice?.feedback?.(3, P || null);
    g.audio?.duck?.(0.6, 1.5);
  }
}
