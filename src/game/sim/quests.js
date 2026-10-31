/** 퀘스트 / 레벨 / 업적 */
export const QUESTS = [
  { id: 'till1',     title: '첫 밭 갈기',          desc: '빈 밭에서 E 를 눌러 밭을 갈아보세요',      event: 'till',     goal: 1, reward: { money: 30, xp: 20 } },
  { id: 'plant3',    title: '당근 심기',            desc: '갈아둔 밭에 씨앗 3개를 심으세요',          event: 'plant',    goal: 3, reward: { money: 40, xp: 30 } },
  { id: 'water3',    title: '물 주기',              desc: '자라는 작물에 물을 3번 주세요',           event: 'water',    goal: 3, reward: { money: 30, xp: 25 } },
  { id: 'harvest5',  title: '첫 수확',              desc: '작물을 5개 수확하세요',                   event: 'harvest',  goal: 5, reward: { money: 80, xp: 60 } },
  { id: 'sell10',    title: '장터 거래',            desc: '장터에서 농산물 10개를 판매하세요',        event: 'sell',     goal: 10, reward: { money: 60, xp: 50 } },
  { id: 'tractor1',  title: '트랙터 운전 면허',     desc: '트랙터 밭갈이 미니게임을 완주하세요',      event: 'tractor',  goal: 1, reward: { money: 120, xp: 80 } },
  { id: 'smart1',    title: '스마트팜 점검',        desc: '스마트팜 환경제어 미니게임을 완료하세요',  event: 'smartfarm', goal: 1, reward: { money: 120, xp: 80 } },
  { id: 'feed3',     title: '목장 돌보기',          desc: '동물에게 사료를 3번 주세요',              event: 'feed',     goal: 3, reward: { money: 50, xp: 40 } },
  { id: 'collect5',  title: '신선한 생산물',        desc: '달걀/우유/양털을 5개 모으세요',           event: 'collect',  goal: 5, reward: { money: 100, xp: 70 } },
  { id: 'rich',      title: '천 원의 농부',         desc: '보유 금액 1,000 코인 달성',               event: 'money',    goal: 1000, reward: { money: 200, xp: 150 }, absolute: true },
  { id: 'plow30',    title: '밭갈이 달인',          desc: '트랙터 미니게임에서 한 번에 30칸 이상 갈기', event: 'plowbest', goal: 30, reward: { money: 250, xp: 200 }, absolute: true },
];

export const LEVELS = [0, 100, 250, 500, 900, 1500, 2400, 3600, 5200, 7500];

export class Quests {
  constructor() {
    this.progress = {}; // id -> count
    this.claimed = {};
    this.xp = 0;
    this.listeners = [];
  }

  on(fn) { this.listeners.push(fn); }

  get level() {
    let lv = 1;
    for (let i = 1; i < LEVELS.length; i++) if (this.xp >= LEVELS[i]) lv = i + 1;
    return lv;
  }
  get nextXp() { return LEVELS[Math.min(this.level, LEVELS.length - 1)]; }

  /** 게임 이벤트 보고 */
  report(event, amount = 1) {
    const done = [];
    for (const q of QUESTS) {
      if (q.event !== event || this.claimed[q.id]) continue;
      const before = this.progress[q.id] || 0;
      this.progress[q.id] = q.absolute ? Math.max(before, amount) : before + amount;
      if (before < q.goal && this.progress[q.id] >= q.goal) done.push(q);
    }
    return done;
  }

  isComplete(q) { return (this.progress[q.id] || 0) >= q.goal; }

  claim(id) {
    const q = QUESTS.find((x) => x.id === id);
    if (!q || this.claimed[id] || !this.isComplete(q)) return null;
    this.claimed[id] = true;
    const before = this.level;
    this.xp += q.reward.xp;
    const levelUp = this.level > before;
    return { reward: q.reward, levelUp, level: this.level };
  }

  /** 활성 퀘스트(미수령) 목록, 완료된 것 우선 */
  active() {
    return QUESTS.filter((q) => !this.claimed[q.id]).map((q) => ({ ...q, count: Math.min(q.goal, this.progress[q.id] || 0), complete: this.isComplete(q) }))
      .sort((a, b) => Number(b.complete) - Number(a.complete));
  }

  toJSON() { return { progress: this.progress, claimed: this.claimed, xp: this.xp }; }
  load(d) { if (d) Object.assign(this, { progress: d.progress || {}, claimed: d.claimed || {}, xp: d.xp || 0 }); }
}
