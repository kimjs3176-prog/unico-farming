import { ITEMS } from './items.js';
import { CROPS, PRODUCTS } from './crops.js';

/**
 * 마을 주민: 우정도(0~100, 하트 5개), 하루 한 번 인사, 선물, 오늘의 부탁
 */
export const VILLAGERS = {
  merchant: { name: '장터 유니코', likes: ['fruit_apple', 'tomato', 'egg'], personality: '활발' },
  researcher: { name: '연구원 유니코', likes: ['strawberry', 'fish_catfish', 'bug_beetle', 'rice_5'], personality: '똑똑' },
  guide: { name: '안내 유니코', likes: ['carrot', 'milk', 'fruit_peach'], personality: '다정' },
  granny: { name: '할머니 유니코', likes: ['rice_3', 'rice_4', 'rice_5', 'fruit_persimmon', 'cabbage'], personality: '느긋' },
  fisher: { name: '낚시꾼 유니코', likes: ['fish_trout', 'fish_mandarin', 'fruit_pear', 'clam'], personality: '느긋' },
  kid: { name: '꼬마 유니코', likes: ['bug_butterfly', 'bug_ladybug', 'fish_goldfish', 'corn'], personality: '장난' },
};

export const HEART_REWARDS = [
  { hearts: 1, money: 50, text: '고마워! 이거 받아' },
  { hearts: 2, seeds: { strawberry: 3 }, text: '딸기 씨앗 좀 나눠줄게!' },
  { hearts: 3, item: { rice_seed: 5 }, text: '우리 집 볍씨야. 논에 심어 봐!' },
  { hearts: 4, money: 300, text: '항상 고마워. 작은 선물이야' },
  { hearts: 5, money: 200, title: true, text: '너는 이제 우리 마을의 단짝이야! 💕' },
];

/**
 * 주민마다 다른 하트 보상 (없는 칸은 HEART_REWARDS). 모든 칸에 돈·씨앗·아이템 중 하나는 꼭 (도트 판 applyHeart 도 무언가 줌).
 * ♥5 title = 그 주민이 붙여 주는 칭호 (3D 판 이름표). 말투는 docs/CHARACTERS.md §말투
 */
export const VILLAGER_HEART_REWARDS = {
  merchant: [
    { hearts: 1, money: 80, text: '단골 손님 첫 인사야! 받아 둬~' },
    { hearts: 2, seeds: { tomato: 3 }, text: '토마토 씨앗 남은 거야. 잘 키워서 팔러 와!' },
    { hearts: 3, item: { compost: 3 }, text: '퇴비 몇 포대 얹어 줄게. 장사는 정이지!' },
    { hearts: 4, money: 300, text: '이번 장사가 잘돼서 나눠 주는 거야~' },
    { hearts: 5, money: 200, title: '장터의 단골', text: '이제 너는 장터의 단골이야! 💕' },
  ],
  researcher: [
    { hearts: 1, item: { compost: 2 }, text: '실험하고 남은 퇴비야. 밭에 주면 잘 자라거든!' },
    { hearts: 2, seeds: { strawberry: 3 }, text: '딸기 씨앗이야. 자라는 걸 기록해 봐!' },
    { hearts: 3, item: { rice_seed: 5 }, text: '연구용 볍씨야. 물 높이를 잘 맞춰 봐!' },
    { hearts: 4, money: 300, text: '연구비가 조금 남았거든. 너한테 쓰는 게 제일이지!' },
    { hearts: 5, item: { compost: 5 }, title: '꼬마 연구원', text: '오늘부터 너는 꼬마 연구원이야! 💕' },
  ],
  guide: [
    { hearts: 1, money: 50, text: '고마워! 이거 받아!' },
    { hearts: 2, item: { pet_treat: 3 }, text: '콩이 간식이야! 강아지들은 이거 정말 좋아해!' },
    { hearts: 3, seeds: { carrot: 6 }, text: '당근 씨앗 넉넉히 줄게. 같이 키우자!' },
    { hearts: 4, money: 300, text: '항상 고마워. 작은 선물이야!' },
    { hearts: 5, money: 200, title: '마을 안내 단짝', text: '너는 이제 우리 마을 안내 단짝이야! 💕' },
  ],
  granny: [
    { hearts: 1, item: { rice_seed: 3 }, text: '할미가 아끼던 볍씨란다. 잘 심어 보거라.' },
    { hearts: 2, seeds: { cabbage: 3 }, text: '양배추 씨앗이란다. 김치 담글 때 쓰거라.' },
    { hearts: 3, item: { rice_seed: 5 }, text: '올해 받은 볍씨란다. 논에 심어 보거라.' },
    { hearts: 4, money: 300, text: '얼마 안 되지만 맛있는 거 사 먹거라.' },
    { hearts: 5, item: { rice_5: 2 }, title: '곰 할머니의 손주', text: '이제 너는 이 할미 손주나 다름없단다 💕' },
  ],
  fisher: [
    { hearts: 1, item: { bait: 3 }, text: '떡밥 좀 나눠 주지. 입질이 빨라질 거야.' },
    { hearts: 2, money: 100, text: '낚싯줄 값에 보태렴.' },
    { hearts: 3, item: { bait: 6 }, text: '희귀한 녀석은 떡밥을 좋아하지. 아껴 쓰렴.' },
    { hearts: 4, money: 300, text: '좋은 낚싯대 사는 데 보태렴.' },
    { hearts: 5, item: { bait: 10 }, title: '호수의 낚시 친구', text: '너는 이제 내 낚시 친구지 💕' },
  ],
  kid: [
    { hearts: 1, money: 50, text: '내 저금통에서 꺼냈어! 받아!' },
    { hearts: 2, seeds: { strawberry: 3 }, text: '딸기 씨앗! 나중에 같이 먹자!' },
    { hearts: 3, seeds: { corn: 4 }, text: '옥수수 씨앗이야! 엄청 크게 자란대!' },
    { hearts: 4, money: 300, text: '내 보물 중에 제일 반짝이는 거야!' },
    { hearts: 5, money: 200, title: '꼬마 토끼의 단짝', text: '우리 이제 진짜 단짝이야! 💕' },
  ],
};
/** id 주민의 하트 n 보상 (주민별 → 없으면 공통) */
export const heartReward = (id, n) => VILLAGER_HEART_REWARDS[id]?.[n - 1] ?? HEART_REWARDS[n - 1];

const nameOf = (k) => (CROPS[k] || PRODUCTS[k] || ITEMS[k])?.name || k;

export class Villagers {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.state = {};
    for (const id of Object.keys(VILLAGERS)) this.state[id] = { friendship: 0, lastTalk: 0, lastGift: 0, request: null, claimed: 0 };
  }

  hearts(id) { return Math.min(5, Math.floor(this.state[id].friendship / 20)); }

  /** 하루 첫 대화 +3 */
  talk(id, day) {
    const s = this.state[id];
    if (s.lastTalk === day) return { gained: 0 };
    s.lastTalk = day;
    return this.addFriend(id, 3);
  }

  /** 선물: 좋아하는 것 +12, 그 외 +5. 하루 1회 */
  /** mult: 우정 배율 (코스튬 혜택: 고운 한복) */
  gift(id, item, day, mult = 1) {
    const s = this.state[id];
    if (s.lastGift === day) return { ok: false, reason: 'today' };
    s.lastGift = day;
    const liked = VILLAGERS[id].likes.includes(item);
    return { ok: true, liked, ...this.addFriend(id, Math.round((liked ? 12 : 5) * mult)) };
  }

  addFriend(id, n) {
    const s = this.state[id];
    const before = this.hearts(id);
    s.friendship = Math.min(100, s.friendship + n);
    const after = this.hearts(id);
    const rewards = [];
    while (s.claimed < after) { s.claimed++; rewards.push(heartReward(id, s.claimed)); }
    return { gained: n, heartUp: after > before, rewards };
  }

  /** 오늘의 부탁 (하루 하나): 특정 아이템 n개 가져오기 */
  requestFor(id, day, pool) {
    const s = this.state[id];
    if (!s.request || s.request.day !== day) {
      const item = pool[Math.floor(this.rng() * pool.length)];
      s.request = { day, item, n: 1 + Math.floor(this.rng() * 3), done: false, reward: 0 };
      s.request.reward = 60 + s.request.n * 30;
    }
    return s.request;
  }

  fulfill(id) {
    const r = this.state[id].request;
    if (!r || r.done) return null;
    r.done = true;
    return { reward: r.reward, ...this.addFriend(id, 8) };
  }

  describeRequest(r) { return `${nameOf(r.item)} ${r.n}개만 가져다 줄래? (보상 ${r.reward}🪙)`; }

  toJSON() { return { state: this.state }; }
  load(d) { if (d?.state) for (const k of Object.keys(this.state)) if (d.state[k]) Object.assign(this.state[k], d.state[k]); }
}
