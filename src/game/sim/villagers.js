import { ITEMS } from './items.js';
import { CROPS, PRODUCTS } from './crops.js';

/**
 * 동물의 숲풍 주민: 우정도(0~100, 하트 5개), 하루 한 번 인사, 선물, 오늘의 부탁
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
  { hearts: 5, title: true, text: '너는 이제 우리 마을의 단짝이야! 💕' },
];

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
  gift(id, item, day) {
    const s = this.state[id];
    if (s.lastGift === day) return { ok: false, reason: 'today' };
    s.lastGift = day;
    const liked = VILLAGERS[id].likes.includes(item);
    return { ok: true, liked, ...this.addFriend(id, liked ? 12 : 5) };
  }

  addFriend(id, n) {
    const s = this.state[id];
    const before = this.hearts(id);
    s.friendship = Math.min(100, s.friendship + n);
    const after = this.hearts(id);
    const rewards = [];
    while (s.claimed < after) { s.claimed++; rewards.push(HEART_REWARDS[s.claimed - 1]); }
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
