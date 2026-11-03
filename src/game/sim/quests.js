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
  { id: 'rice1',     title: '첫 벼농사',            desc: '논을 갈고 물을 대고 모를 심으세요',        event: 'riceplant', goal: 1, reward: { money: 80, xp: 60 } },
  { id: 'riceharv',  title: '황금 들녘',            desc: '벼를 수확하고 탈곡해 쌀을 만드세요',        event: 'thresh',   goal: 1, reward: { money: 200, xp: 150 } },
  { id: 'fish1',     title: '첫 낚시',              desc: '연못에서 물고기를 낚으세요',               event: 'fish',     goal: 1, reward: { money: 50, xp: 40 } },
  { id: 'bug1',      title: '곤충 채집',            desc: '나비나 곤충을 잡아 보세요',                event: 'bug',      goal: 1, reward: { money: 40, xp: 30 } },
  { id: 'shake3',    title: '과일 나무',            desc: '과일 나무를 3번 흔들어 보세요',            event: 'shake',    goal: 3, reward: { money: 60, xp: 40 } },
  { id: 'friend2',   title: '이웃사촌',             desc: '주민 한 명과 하트 2개 친구가 되세요',       event: 'hearts',   goal: 2, reward: { money: 150, xp: 100 }, absolute: true },
  { id: 'book10',    title: '꼬마 박물학자',        desc: '도감에 10종을 등록하세요',                 event: 'book',     goal: 10, reward: { money: 300, xp: 200 }, absolute: true },
  { id: 'koat1',     title: 'KOAT 체험관 방문',      desc: '체험관 부스에서 체험해 첫 스탬프를 받으세요 (🏢 버튼)', event: 'koatstamp', goal: 1, reward: { money: 100, xp: 60 } },
  { id: 'koat6',     title: 'KOAT 스탬프 투어',      desc: '6개 본부 체험 스탬프를 모두 모으세요',    event: 'koatall',  goal: 6, reward: { money: 300, xp: 200 }, absolute: true },
  { id: 'explore4',  title: '언덕 탐험가',          desc: '언덕 꼭대기 전망대 4곳을 모두 올라 보세요', event: 'lookout',  goal: 4, reward: { money: 250, xp: 180 }, absolute: true },
  { id: 'chest3',    title: '보물 사냥꾼',          desc: '언덕·숲 가장자리의 숨은 보물 상자 3개 열기', event: 'chest',    goal: 3, reward: { money: 150, xp: 120 } },
  { id: 'shoo5',     title: '농장 지킴이',          desc: '밭의 까마귀·목장의 여우와 늑대를 5번 쫓아내기', event: 'shoo', goal: 5, reward: { money: 150, xp: 120 } },
  { id: 'petfeed3',  title: '좋은 보호자',          desc: '반려견에게 간식이나 작물을 3번 먹이기',   event: 'petfeed', goal: 3, reward: { money: 80, xp: 60 } },
  { id: 'egg30',     title: '달걀 받기 달인',       desc: '달걀 받기 미니게임에서 한 번에 30점 이상', event: 'eggcatch', goal: 30, reward: { money: 150, xp: 120 }, absolute: true },
  { id: 'herd6',     title: '양치기 유니코',        desc: '양 몰이에서 6마리를 모두 우리에 넣기',     event: 'herd',     goal: 6, reward: { money: 200, xp: 150 }, absolute: true },
  { id: 'honey3',    title: '꿀벌 친구',            desc: '서쪽 들꽃 옆 벌통에서 꿀을 3번 거두기',    event: 'honey',    goal: 3, reward: { money: 120, xp: 90 } },
  { id: 'swim1',     title: '첨벙첨벙',            desc: '남서쪽 낚시터 호수에 들어가 헤엄쳐 보세요', event: 'swim',     goal: 1, reward: { money: 50, xp: 40 } },
  { id: 'lake1',     title: '낚시터 첫 손맛',      desc: '낚시터(부두 끝이나 물가)에서 물고기를 낚으세요', event: 'lakefish', goal: 1, reward: { money: 80, xp: 60 } },
  { id: 'weed2',     title: '호미질 김매기',        desc: '밭에 난 잡초를 호미로 2번 매 주세요',       event: 'weed',     goal: 2, reward: { money: 60, xp: 50 } },
  { id: 'dive3',     title: '물속 보물찾기',        desc: '호수의 반짝이는 곳에서 잠수해 보물 3번 찾기', event: 'dive',     goal: 3, reward: { money: 120, xp: 90 } },
  { id: 'fight3',    title: '손맛 장인',            desc: '낚시터에서 힘겨루기 끝에 큰 물고기 3마리 낚기', event: 'fightwin', goal: 3, reward: { money: 200, xp: 150 } },
  { id: 'lakereq',   title: '낚시꾼의 의뢰',        desc: '기록판의 오늘의 의뢰를 달성하고 낚시꾼에게 보고하기', event: 'lakereq', goal: 1, reward: { money: 150, xp: 120 } },
  { id: 'fert3',     title: '기름진 흙',            desc: '밭에 퇴비를 3번 주세요 (장터에서 사거나 퇴비통에서 만들기)', event: 'fert', goal: 3, reward: { money: 80, xp: 60 } },
  { id: 'star3',     title: '특상품 농부',          desc: '물·김매기·퇴비로 잘 돌봐 ⭐⭐⭐ 특상품을 수확하세요', event: 'star3', goal: 1, reward: { money: 120, xp: 90 } },
  { id: 'process2',  title: '장독대 장인',          desc: '밭 서쪽 장독대에서 가공품 2개 만들기 (김치·주스·잼)', event: 'process', goal: 2, reward: { money: 150, xp: 120 } },
  { id: 'order3',    title: '로컬푸드 납품',        desc: '주문 게시판의 주문을 3건 납품하세요',          event: 'order',    goal: 3, reward: { money: 200, xp: 150 } },
  { id: 'giant1',    title: '대왕 작물',            desc: '아주 가끔 열리는 대왕 작물을 수확하세요 (퇴비 주면 확률 ↑)', event: 'giant', goal: 1, reward: { money: 300, xp: 200 } },
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
