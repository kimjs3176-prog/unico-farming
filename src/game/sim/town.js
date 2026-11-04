/**
 * 마을 건설 (렌더링 무관, 테스트: tests/town.test.js)
 *  - 서쪽 '새 마을 부지'에 건설 부지가 있고, 코인을 내면 공사가 시작돼 시간이 지나면 건물이 완성됨
 *  - 건물마다 하나씩만 지을 수 있고, 완성되면 농장 전체에 효과
 *    쉼터 정자: 매일 아침 주민 선물 · 물탱크: 물 준 밭이 오래 촉촉 · 직판장: 판매가 ↑
 *    유리 온실: 밭 작물 성장 ↑ · 풍차 방앗간: 매일 아침 임대 수입
 *  - 공사 중에 코인을 더 내면 바로 완성 (남은 시간 1초당 2코인)
 */
export const BUILDINGS = {
  pavilion:   { name: '쉼터 정자',   emoji: '⛩️', price: 350,  time: 40,  lv: 1, desc: '매일 아침 주민이 쉼터에 작은 선물을 두고 가요', effect: { gift: 1 } },
  tank:       { name: '물탱크',      emoji: '💧', price: 800,  time: 60,  lv: 1, desc: '물 준 밭이 1.5배 오래 촉촉해요', effect: { waterMult: 1.5 } },
  stand:      { name: '농산물 직판장', emoji: '🏪', price: 1200, time: 75,  lv: 2, desc: '장터 판매가가 10% 올라요', effect: { sellMult: 1.1 } },
  glasshouse: { name: '유리 온실',   emoji: '🌿', price: 1800, time: 90,  lv: 3, desc: '밭 작물이 15% 빨리 자라요', effect: { growMult: 1.15 } },
  mill:       { name: '풍차 방앗간', emoji: '🌬️', price: 2400, time: 120, lv: 3, desc: '매일 아침 방앗간 임대 수입 +80 코인', effect: { daily: 80 } },
};
export const RUSH_PER_SEC = 2;
/** 쉼터 정자 선물 후보 (아이템 id, 개수) */
export const GIFTS = [['compost', 1], ['fruit_apple', 2], ['fruit_peach', 2], ['pet_treat', 1], ['rice_seed', 1], ['fruit_pear', 2]];

export class TownSim {
  constructor(sites = 5) {
    this.sites = Array.from({ length: sites }, () => ({ type: null, state: 'empty', left: 0 }));
  }

  /** 이 건물이 (공사 중 포함) 이미 있는가 */
  has(type) { return this.sites.some((s) => s.type === type); }
  built(type) { return this.sites.some((s) => s.type === type && s.state === 'done'); }
  get doneCount() { return this.sites.filter((s) => s.state === 'done').length; }

  /** 지을 수 없는 이유 (없으면 null) */
  whyNot(i, type, money, level = 99) {
    const s = this.sites[i], B = BUILDINGS[type];
    if (!s || !B) return '알 수 없는 건물';
    if (s.state !== 'empty') return '이미 건물이 있는 부지예요';
    if (this.has(type)) return '이미 지었어요';
    if (level < B.lv) return `Lv.${B.lv}부터 지을 수 있어요`;
    if (money < B.price) return `코인이 ${B.price - money} 모자라요`;
    return null;
  }

  /** 공사 시작 → 든 비용 (못 지으면 0) */
  build(i, type, money, level = 99) {
    if (this.whyNot(i, type, money, level)) return 0;
    Object.assign(this.sites[i], { type, state: 'building', left: BUILDINGS[type].time });
    return BUILDINGS[type].price;
  }

  /** 바로 완성 비용 */
  rushCost(i) { const s = this.sites[i]; return s?.state === 'building' ? Math.ceil(s.left) * RUSH_PER_SEC : 0; }
  rush(i) { const s = this.sites[i]; if (s?.state !== 'building') return false; s.left = 0; s.state = 'done'; return true; }

  /** 공사 진행 → 이번에 완성된 부지 번호들 */
  tick(dt) {
    const done = [];
    this.sites.forEach((s, i) => {
      if (s.state !== 'building') return;
      s.left -= dt;
      if (s.left <= 0) { s.left = 0; s.state = 'done'; done.push(i); }
    });
    return done;
  }

  progress(i) { const s = this.sites[i]; if (!s?.type) return 0; return s.state === 'done' ? 1 : 1 - s.left / BUILDINGS[s.type].time; }

  /** 완성된 건물 효과 합치기 */
  effects() {
    const e = { sellMult: 1, growMult: 1, waterMult: 1, daily: 0, gift: 0 };
    for (const s of this.sites) {
      if (s.state !== 'done') continue;
      const f = BUILDINGS[s.type].effect;
      if (f.sellMult) e.sellMult *= f.sellMult;
      if (f.growMult) e.growMult *= f.growMult;
      if (f.waterMult) e.waterMult *= f.waterMult;
      e.daily += f.daily || 0;
      e.gift += f.gift || 0;
    }
    return e;
  }

  /** 새 날: 임대 수입과 선물 → { coins, gifts: [[id, n]...] } */
  newDay(rng = Math.random) {
    const e = this.effects();
    const gifts = [];
    for (let k = 0; k < e.gift; k++) gifts.push(GIFTS[Math.floor(rng() * GIFTS.length) % GIFTS.length]);
    return { coins: e.daily, gifts };
  }

  toJSON() { return { sites: this.sites.map((s) => ({ ...s })) }; }
  load(d) {
    if (!d?.sites) return;
    d.sites.forEach((s, i) => {
      if (!this.sites[i] || (s.type && !BUILDINGS[s.type])) return;
      this.sites[i] = { type: s.type || null, state: s.type ? (s.state === 'building' ? 'building' : 'done') : 'empty', left: Math.max(0, +s.left || 0) };
    });
  }
}
