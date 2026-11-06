/**
 * 농장 지킴이 배틀 규칙 (렌더링 무관, tests/battle.test.js)
 *
 * 턴제: 유니코·콩이가 차례로 행동 → 적 행동. 매 턴 시작에 부스트 포인트(BP) +1 (최대 5)
 *  - 행동에 BP 를 0~3 실어 '부스트': 공격 횟수가 1+BP 번으로 늘어남
 *  - 적마다 약점 속성이 있고 처음엔 '?' (맞혀 보면 드러남). 약점을 맞히면 한 번에 방패 -1
 *  - 방패가 0 이 되면 브레이크: 적은 다음 차례를 쉬고, 그동안 받는 피해 2배. 차례가 지나면 방패가 다시 참
 *  - 적은 쫓아내는 것이 목표라 HP 가 0 이 되면 '도망'. 유니코의 기운이 0 이 되면 지고 적이 할 일을 함
 *  콩이: 하트가 많을수록 세고, 짖기(소리)·달려들기(몸)·지키기(다음 피해 절반)
 */

export const TYPES = {
  wave: { name: '휘두르기', icon: '손' },
  water: { name: '물', icon: '물' },
  sound: { name: '소리', icon: '소리' },
  light: { name: '빛', icon: '빛' },
  dash: { name: '몸통', icon: '몸' },
};

/** 적 정의 (3D 판과 같은 까마귀·여우·늑대) */
export const ENEMIES = {
  crow: { name: '까마귀', hp: 34, shield: 3, weak: ['water', 'sound'], reward: 25, moves: [{ name: '쪼기', dmg: [4, 6] }, { name: '날개 치기', dmg: [3, 5] }, { name: '깍깍 울기', dmg: [0, 0], fx: 'rattle' }] },
  fox: { name: '여우', hp: 52, shield: 4, weak: ['light', 'dash'], reward: 45, moves: [{ name: '할퀴기', dmg: [6, 9] }, { name: '꼬리 흔들어 홀리기', dmg: [2, 3], fx: 'rattle' }, { name: '덥석 물기', dmg: [8, 10] }] },
  wolf: { name: '늑대', hp: 84, shield: 5, weak: ['light', 'sound'], reward: 75, moves: [{ name: '물기', dmg: [9, 12] }, { name: '하울링', dmg: [0, 0], fx: 'howl' }, { name: '돌진', dmg: [11, 14] }] },
};

/** 유니코 기술 / 콩이 기술: 속성·위력 */
export const UNICO_SKILLS = [
  { id: 'wave', name: '손 휘두르기', type: 'wave', pow: 6 },
  { id: 'water', name: '물뿌리개', type: 'water', pow: 5 },
  { id: 'whistle', name: '호루라기', type: 'sound', pow: 4 },
  { id: 'lamp', name: '손전등', type: 'light', pow: 4 },
];
export const PET_SKILLS = [
  { id: 'bark', name: '멍멍 짖기', type: 'sound', pow: 4 },
  { id: 'dash', name: '달려들기', type: 'dash', pow: 6 },
  { id: 'guard', name: '지키기', type: null, pow: 0 },
];
export const BP_MAX = 5, BOOST_MAX = 3;

export class BattleSim {
  /**
   * @param kind 'crow'|'fox'|'wolf'
   * @param opt { level: 플레이어 레벨, petHearts: 0~5, rng }
   */
  constructor(kind, { level = 1, petHearts = 0, rng = Math.random } = {}) {
    const E = ENEMIES[kind];
    this.kind = kind; this.rng = rng;
    this.enemy = { name: E.name, hp: E.hp, max: E.hp, shield: E.shield, shieldMax: E.shield, weak: E.weak, known: new Set(), broken: 0, power: 1 };
    const hp = 36 + level * 4;
    this.party = [
      { id: 'unico', name: '유니코', hp, max: hp, bp: 1 },
      { id: 'pet', name: '콩이', hp: 24 + petHearts * 4, max: 24 + petHearts * 4, bp: 1, hearts: petHearts },
    ];
    this.level = level;
    this.turn = 1;
    this.guard = false;
    this.state = 'fight'; // fight | win | lose | fled
    this.log = [];
  }

  /** 부스트 가능한 최대 */
  maxBoost(who) { return Math.min(BOOST_MAX, this.party[who].bp); }

  /**
   * 한 명 행동 → 일어난 일 목록 [{ kind:'hit', who, dmg, weak, broke }, ...]
   * @param who 0 유니코, 1 콩이 · skill 기술 · boost 0~3
   */
  act(who, skill, boost = 0) {
    if (this.state !== 'fight') return [];
    const m = this.party[who], E = this.enemy;
    if (m.hp <= 0) return [];
    boost = Math.max(0, Math.min(boost, this.maxBoost(who)));
    m.bp -= boost;
    const out = [];
    if (skill.id === 'guard') { this.guard = true; out.push({ kind: 'guard', who }); return out; }
    const hits = 1 + boost;
    const power = who === 0 ? 1 + (this.level - 1) * 0.08 : 1 + m.hearts * 0.15;
    for (let k = 0; k < hits && E.hp > 0; k++) {
      const weak = E.weak.includes(skill.type);
      if (weak) E.known.add(skill.type);
      let broke = false;
      if (weak && !E.broken && E.shield > 0) { E.shield--; if (E.shield === 0) { E.broken = 2; broke = true; } }
      const base = skill.pow * power * (weak ? 1.5 : 1) * (E.broken ? 2 : 1) * (0.9 + this.rng() * 0.2);
      const dmg = Math.max(1, Math.round(base));
      E.hp = Math.max(0, E.hp - dmg);
      out.push({ kind: 'hit', who, dmg, weak, broke, type: skill.type });
    }
    if (E.hp <= 0) { this.state = 'win'; out.push({ kind: 'win' }); }
    return out;
  }

  /** 적 차례 → [{ kind:'enemy', move, target, dmg } | { kind:'stunned' } | { kind:'recover' }] */
  enemyTurn() {
    if (this.state !== 'fight') return [];
    const E = this.enemy, out = [];
    if (E.broken) {
      E.broken--;
      if (E.broken === 0) { E.shield = E.shieldMax; out.push({ kind: 'recover' }); }
      else { out.push({ kind: 'stunned' }); this.endRound(); return out; }
    }
    const moves = ENEMIES[this.kind].moves;
    const mv = moves[Math.floor(this.rng() * moves.length)];
    if (mv.fx === 'howl') { E.power = Math.min(1.6, E.power + 0.25); out.push({ kind: 'enemy', move: mv.name, buff: true }); this.endRound(); return out; }
    // 대상: 쓰러지지 않은 쪽, 유니코를 더 자주
    const alive = this.party.map((m, i) => (m.hp > 0 ? i : -1)).filter((i) => i >= 0);
    const target = alive.length > 1 && this.rng() < 0.35 ? 1 : alive[0];
    let dmg = Math.round((mv.dmg[0] + this.rng() * (mv.dmg[1] - mv.dmg[0])) * E.power);
    if (this.guard && dmg > 0) dmg = Math.ceil(dmg / 2);
    const m = this.party[target];
    m.hp = Math.max(0, m.hp - dmg);
    if (mv.fx === 'rattle') this.party.forEach((p) => (p.bp = Math.max(0, p.bp - 1)));
    out.push({ kind: 'enemy', move: mv.name, target, dmg, rattle: mv.fx === 'rattle' });
    if (this.party[0].hp <= 0) { this.state = 'lose'; out.push({ kind: 'lose' }); }
    this.endRound();
    return out;
  }

  /** 라운드 끝: 지키기 풀림, BP +1 */
  endRound() {
    this.guard = false;
    this.turn++;
    for (const m of this.party) if (m.hp > 0) m.bp = Math.min(BP_MAX, m.bp + 1);
  }

  /** 도망: 70% (적이 브레이크 중이면 100%) */
  flee() { const ok = this.enemy.broken > 0 || this.rng() < 0.7; if (ok) this.state = 'fled'; return ok; }

  reward() { return this.state === 'win' ? ENEMIES[this.kind].reward + (this.turn <= 3 ? 20 : 0) : 0; }
}
