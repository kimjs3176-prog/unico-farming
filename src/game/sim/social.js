/**
 * 다른 플레이어와 상호작용 규칙 (렌더링·네트워크 무관, 테스트: tests/social.test.js)
 *  - 👋 인사 · 🙌 하이파이브(상대가 받으면 둘 다 축하, 오늘 처음 하이파이브한 사람마다 코인, 하루 3명까지)
 *  - 🎁 선물: 내 가방 물건을 1~5개, 하루 10번까지 보냄 / 받을 때는 정해진 물건·개수만 받아들임
 *  - ⭐ 친구: 서로 수락하면 이름으로 저장 (접속 번호는 접속할 때마다 바뀌므로), 50명까지
 *  - 요청(하이파이브·친구)은 12초 안에 받아야 함
 */
export const FIVE_BONUS = 10, FIVE_PER_DAY = 3, GIFTS_PER_DAY = 10, GIFT_MAX = 5, FRIEND_MAX = 50, REQ_TTL = 12;

export class SocialSim {
  constructor() {
    this.friends = [];      // 친구 이름
    this.day = 0;
    this.gifts = 0;         // 오늘 보낸 선물 횟수
    this.fives = [];        // 오늘 코인을 받은 하이파이브 상대 이름
    this.pending = {};      // 내가 보낸 요청: { 'five:3': 만료 시각(초) }
    this.stats = { waves: 0, fives: 0, giftsSent: 0, giftsGot: 0 };
  }

  newDay(day) { if (day !== this.day) { this.day = day; this.gifts = 0; this.fives = []; } }

  isFriend(name) { return this.friends.includes(name); }
  addFriend(name) {
    if (!name || this.isFriend(name)) return false;
    if (this.friends.length >= FRIEND_MAX) this.friends.shift();
    this.friends.push(name);
    return true;
  }
  removeFriend(name) { const n = this.friends.length; this.friends = this.friends.filter((x) => x !== name); return this.friends.length < n; }

  /** 요청 보내기 기록 (하이파이브·친구): 받는 쪽 ok 가 이 시간 안에 와야 인정 */
  request(kind, id, now) { this.pending[`${kind}:${id}`] = now + REQ_TTL; }
  /** 상대가 받았을 때: 내가 보낸 요청이 살아 있었나 */
  accepted(kind, id, now) {
    const k = `${kind}:${id}`, t = this.pending[k];
    delete this.pending[k];
    return t !== undefined && now <= t;
  }

  /** 하이파이브 성공 → 받을 코인 (오늘 처음인 상대, 하루 3명까지) */
  highFive(name) {
    this.stats.fives++;
    if (this.fives.includes(name) || this.fives.length >= FIVE_PER_DAY) return 0;
    this.fives.push(name);
    return FIVE_BONUS;
  }

  whyNotGift(have, n = 1) {
    if (this.gifts >= GIFTS_PER_DAY) return `오늘은 선물을 ${GIFTS_PER_DAY}번 다 보냈어요`;
    if (!Number.isInteger(n) || n < 1 || n > GIFT_MAX) return `한 번에 1~${GIFT_MAX}개까지`;
    if (have < n) return '가진 게 모자라요';
    return null;
  }
  noteGift() { this.gifts++; this.stats.giftsSent++; }

  toJSON() { return { friends: this.friends, day: this.day, gifts: this.gifts, fives: this.fives, stats: this.stats }; }
  load(d) {
    if (!d) return;
    this.friends = (Array.isArray(d.friends) ? d.friends : []).filter((x) => typeof x === 'string' && x.length <= 12).slice(-FRIEND_MAX);
    this.day = d.day | 0; this.gifts = Math.max(0, d.gifts | 0);
    this.fives = (Array.isArray(d.fives) ? d.fives : []).filter((x) => typeof x === 'string').slice(0, FIVE_PER_DAY);
    this.stats = { ...this.stats, ...(d.stats || {}) };
  }
}

/** 받은 선물 검사: 아는 물건(catalog 에 있는 것)이고 1~5개일 때만 */
export function validGift(item, n, catalog) {
  return typeof item === 'string' && Object.prototype.hasOwnProperty.call(catalog, item) && Number.isInteger(n) && n >= 1 && n <= GIFT_MAX;
}
