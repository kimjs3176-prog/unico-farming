/**
 * 풀숲 인카운터 규칙 (렌더링 무관, tests/encounter.test.js)
 *  - 풀숲 칸을 한 칸(32px) 걸을 때마다 ENCOUNTER_RATE 확률로 야생 동물이 튀어나옴 (포켓몬처럼)
 *  - 배틀이 끝난 뒤 GRACE_STEPS 칸은 안전, 쑥 향주머니를 쓰면 REPEL_STEPS 칸 동안 안 나옴
 *  - 낮엔 까마귀·참새떼·고라니·두더지, 밤엔 산여우·늑대·멧돼지·고라니 (계절에 따라 무게가 다름)
 *  - 적 레벨: 플레이어 레벨 −1 ~ +1 (1 아래로 안 감), 드문 녀석은 +1
 */
export const ENCOUNTER_RATE = 0.09; // 풀숲 한 칸마다
export const GRACE_STEPS = 6;       // 배틀 뒤 안전한 칸 수
export const REPEL_STEPS = 120;     // 쑥 향주머니 한 개
export const REPEL_PRICE = 60;      // 쑥 향주머니 값 (장터)
export const FIRST_WIN_BONUS = 50;  // 처음 이긴 동물 보너스 코인

/** 나오는 동물과 무게 (time: day|night) */
export const TABLE = {
  day: [['sparrow', 34], ['crow', 26], ['gorani', 18], ['mole', 18], ['boar', 4]],
  night: [['fox', 30], ['wolf', 22], ['gorani', 22], ['boar', 16], ['mole', 10]],
};
/** 계절 배수: 겨울엔 두더지·참새가 드물고 늑대·멧돼지가 늘어남, 가을엔 멧돼지·고라니가 내려옴 */
export const SEASON_MULT = {
  spring: { sparrow: 1.3, mole: 1.3 },
  summer: { gorani: 1.2, crow: 1.2 },
  autumn: { boar: 1.8, gorani: 1.4, sparrow: 1.3 },
  winter: { mole: 0.3, sparrow: 0.5, wolf: 1.6, boar: 1.3 },
};
export const RARE = new Set(['boar', 'wolf']);

/** 이번 칸에서 튀어나오나 */
export function stepEncounter(rng = Math.random, rate = ENCOUNTER_RATE) { return rng() < rate; }

/** 누가 나오나 */
export function rollWild(rng = Math.random, { night = false, season = 'summer' } = {}) {
  const tbl = TABLE[night ? 'night' : 'day'], m = SEASON_MULT[season] || {};
  const w = tbl.map(([k, v]) => v * (m[k] ?? 1));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < tbl.length; i++) { x -= w[i]; if (x <= 0) return tbl[i][0]; }
  return tbl[0][0];
}

/** 적 레벨 */
export function wildLevel(rng = Math.random, playerLevel = 1, kind = '') {
  const lv = Math.max(1, playerLevel | 0) + Math.floor(rng() * 3) - 1 + (RARE.has(kind) ? 1 : 0);
  return Math.max(1, lv);
}

/** 인카운터 걸음 상태 (저장: { steps, grace, repel }) */
export class EncounterState {
  constructor() { this.dist = 0; this.grace = 0; this.repel = 0; this.steps = 0; }
  /**
   * 풀숲에서 px 만큼 걸음 → 새 칸에 들어설 때마다 추첨. 나오면 true
   * @param px 이번에 걸은 거리(px), tile 한 칸 크기
   */
  walk(px, rng = Math.random, tile = 32) {
    this.dist += px;
    let hit = false;
    while (this.dist >= tile && !hit) {
      this.dist -= tile; this.steps++;
      if (this.grace > 0) { this.grace--; continue; }
      if (this.repel > 0) { this.repel--; continue; }
      hit = stepEncounter(rng);
    }
    if (hit) this.dist = 0;
    return hit;
  }
  afterBattle() { this.grace = GRACE_STEPS; this.dist = 0; }
  useRepel() { this.repel += REPEL_STEPS; }
  toJSON() { return { grace: this.grace, repel: this.repel, steps: this.steps }; }
  load(d) { if (!d) return; this.grace = Math.max(0, d.grace | 0); this.repel = Math.max(0, d.repel | 0); this.steps = Math.max(0, d.steps | 0); }
}

/** 야생 동물 도감 기록: { kind: { seen, won, best } } */
export function recordWild(book, kind, { won = false, level = 1 } = {}) {
  const e = (book[kind] ||= { seen: 0, won: 0, best: 0 });
  e.seen++;
  const first = won && e.won === 0;
  if (won) { e.won++; e.best = Math.max(e.best, level); }
  return { first };
}
