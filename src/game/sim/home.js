/**
 * 유니코 집 (렌더링 무관, 테스트: tests/home.test.js)
 *  - 잠자기: 저녁 6시부터 새벽 6시 사이에 침대에서 자면 다음 날 아침 6시 30분에 일어남
 *    (자정 전이면 하루가 넘어가 새 날 처리, 자정 뒤면 같은 날 아침으로)
 *  - 푹 자고 일어나면 그날 하루 '개운함': 걷는 속도 +15%
 *  - 집 넓히기: 코인으로 3단계 (오두막 → 아늑한 집 → 2층 집). 단계가 오르면 매일 아침 우편함 선물
 */
export const SLEEP_FROM = 18 / 24;  // 저녁 6시부터
export const SLEEP_UNTIL = 6 / 24;  // 새벽 6시까지
export const WAKE_AT = 6.5 / 24;    // 아침 6시 30분에 일어남
export const RESTED_SPEED = 1.15;

export const HOME_LEVELS = [
  { name: '작은 오두막', price: 0, lv: 1, desc: '유니코의 첫 집. 침대에서 자면 아침이 와요' },
  { name: '아늑한 집', price: 1500, lv: 2, desc: '창문이 커지고 꽃밭·우편함이 생겨요. 매일 아침 우편함에 40코인' },
  { name: '2층 집', price: 4000, lv: 4, desc: '2층과 굴뚝, 정원 등불. 매일 아침 우편함에 100코인과 퇴비' },
];
/** 옷장에서 고를 수 있는 것 */
export const OUTFIT = { hat: [null, 'straw', 'helmet'], scarf: [null, 'red', 'green', 'blue'] };
/** 단계별 아침 우편함 선물 */
export const MAIL = [null, { coins: 40, items: [] }, { coins: 100, items: [['compost', 1]] }];

export class HomeSim {
  constructor() {
    this.level = 0;      // HOME_LEVELS 번호
    this.restedDay = 0;  // 개운한 날 (이 날짜까지 속도 보너스)
    this.sleeps = 0;     // 잠잔 횟수
    this.outfit = {};    // 옷장에서 고른 옷차림 { hat, scarf, goggles, sprout }
  }

  get info() { return HOME_LEVELS[this.level]; }
  get next() { return HOME_LEVELS[this.level + 1] || null; }

  canSleep(time) { return time >= SLEEP_FROM || time < SLEEP_UNTIL; }

  /** 잠자기 → { time, day, newDay } (잘 수 없는 시간이면 null) */
  sleep(time, day) {
    if (!this.canSleep(time)) return null;
    const newDay = time >= SLEEP_FROM; // 자정 전 → 다음 날로
    const d = newDay ? day + 1 : day;
    this.restedDay = d;
    this.sleeps++;
    return { time: WAKE_AT, day: d, newDay };
  }

  rested(day) { return this.restedDay === day; }
  speedMult(day) { return this.rested(day) ? RESTED_SPEED : 1; }

  /** 넓힐 수 없는 이유 (없으면 null) */
  whyNotUpgrade(money, playerLevel = 99) {
    const n = this.next;
    if (!n) return '이미 가장 큰 집이에요';
    if (playerLevel < n.lv) return `Lv.${n.lv}부터 넓힐 수 있어요`;
    if (money < n.price) return `코인이 ${n.price - money} 모자라요`;
    return null;
  }

  /** 넓히기 → 든 비용 (못 하면 0) */
  upgrade(money, playerLevel = 99) {
    if (this.whyNotUpgrade(money, playerLevel)) return 0;
    this.level++;
    return this.info.price;
  }

  /** 새 날 아침 우편함 */
  mail() { return MAIL[this.level] || null; }

  toJSON() { return { level: this.level, restedDay: this.restedDay, sleeps: this.sleeps, outfit: this.outfit }; }
  load(d) {
    if (!d) return;
    this.level = Math.max(0, Math.min(HOME_LEVELS.length - 1, d.level | 0));
    this.restedDay = d.restedDay | 0;
    this.sleeps = d.sleeps | 0;
    const o = d.outfit || {};
    this.outfit = { hat: OUTFIT.hat.includes(o.hat) ? o.hat : null, scarf: OUTFIT.scarf.includes(o.scarf) ? o.scarf : null, goggles: !!o.goggles, sprout: o.sprout === undefined ? undefined : !!o.sprout, ...(o.set ? { set: true } : {}) };
  }
}
