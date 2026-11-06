/**
 * 코스튬 (렌더링 무관, 테스트: tests/costume.test.js)
 *  - 몸 전체 옷차림 6벌: 장터에서 사기 / 체험관 스탬프 투어 완주 / 수확 축제 날에만 살 수 있는 것
 *  - 입고 있으면 작은 혜택 하나씩 (어느 하나가 늘 정답이 되지 않게 서로 다른 활동에 +5~50%)
 *  - 옷장 세트 3칸: 코스튬 + 소품(모자·스카프·고글·새싹)을 한 번에 저장·불러오기
 *  - 다른 접속자에게 보낼 '모습 문자열'(look) 만들기·검사 (정해진 이름만 받아들임)
 */
export const COSTUMES = [
  { id: 'overalls', name: '농부 멜빵바지', icon: '👖', price: 600, lv: 1, perk: { sell_crop: 1.05 }, perkText: '밭 작물 판매가 +5%', desc: '튼튼한 청 멜빵바지. 주머니에 호미가 쏙' },
  { id: 'raincoat', name: '노란 비옷', icon: '🧥', price: 900, lv: 2, perk: { speed_wet: 1.1 }, perkText: '비·눈 오는 날 걷기 속도 +10%', desc: '노란 비옷과 장화, 챙 넓은 비 모자' },
  { id: 'beekeeper', name: '양봉 모자', icon: '🐝', price: 1200, lv: 3, perk: { honey: 1.2 }, perkText: '벌통에 꿀이 20% 빨리 차요', desc: '망사가 달린 흰 모자와 흰 장갑' },
  { id: 'chef', name: '요리사 앞치마', icon: '👨‍🍳', price: 1500, lv: 3, perk: { jar: 1.2 }, perkText: '장독 가공 20% 빨리', desc: '높은 요리사 모자와 하얀 앞치마' },
  { id: 'koat', name: '체험관 조끼', icon: '🏢', unlock: 'stamps', perk: { koat_coins: 1.2 }, perkText: '체험관 미니게임 코인 +20%', desc: '청록 조끼와 사원증. 체험관 스탬프 6개를 모두 모으면 받아요' },
  { id: 'hanbok', name: '고운 한복', icon: '🎎', price: 800, festival: true, perk: { friend: 1.5 }, perkText: '주민 선물 우정 +50%', desc: '색동 소매 저고리와 치마. 수확 축제 날에만 장터에서 팔아요' },
];
export const COSTUME = Object.fromEntries(COSTUMES.map((c) => [c.id, c]));
export const SET_SLOTS = 3;
const HATS = [null, 'straw', 'helmet'], SCARVES = [null, 'red', 'green', 'blue'];

export class CostumeSim {
  constructor() {
    this.owned = new Set();
    this.wearing = null;        // 입고 있는 코스튬 id (없으면 기본 유니코)
    this.sets = Array.from({ length: SET_SLOTS }, () => null); // { costume, hat, scarf, goggles, sprout }
  }

  has(id) { return this.owned.has(id); }

  /** 살 수 없는 이유 (없으면 null) */
  whyNotBuy(id, { money = 0, level = 99, festival = false } = {}) {
    const c = COSTUME[id];
    if (!c) return '없는 옷이에요';
    if (this.has(id)) return '이미 가지고 있어요';
    if (c.unlock === 'stamps') return '체험관 스탬프 6개를 모으면 받아요';
    if (c.festival && !festival) return '수확 축제 날에만 팔아요';
    if (level < (c.lv || 1)) return `Lv.${c.lv}부터 살 수 있어요`;
    if (money < c.price) return `코인이 ${c.price - money} 모자라요`;
    return null;
  }

  /** 사기 → 든 비용 (못 사면 0) */
  buy(id, ctx) {
    if (this.whyNotBuy(id, ctx)) return 0;
    this.owned.add(id);
    return COSTUME[id].price;
  }

  /** 조건을 채운 코스튬 자동 지급 → 새로 받은 id 목록 */
  autoUnlock({ stamps = 0, stampsTotal = 6 } = {}) {
    const got = [];
    for (const c of COSTUMES) if (c.unlock === 'stamps' && !this.has(c.id) && stamps >= stampsTotal) { this.owned.add(c.id); got.push(c.id); }
    return got;
  }

  wear(id) {
    if (id === null) { this.wearing = null; return true; }
    if (!this.has(id)) return false;
    this.wearing = id;
    return true;
  }

  /** 지금 입은 옷의 혜택 배율 (해당 없으면 1) */
  mult(key) { return (this.wearing && COSTUME[this.wearing].perk[key]) || 1; }

  saveSet(i, outfit = {}) {
    if (i < 0 || i >= SET_SLOTS) return false;
    this.sets[i] = cleanSet({ ...outfit, costume: this.wearing });
    return true;
  }

  /** 세트 불러오기 → { costume, hat, scarf, goggles, sprout } (빈 칸·잃어버린 옷이면 null) */
  loadSet(i) {
    const s = this.sets[i];
    if (!s) return null;
    if (s.costume && !this.has(s.costume)) return null;
    this.wearing = s.costume;
    return { ...s };
  }

  toJSON() { return { owned: [...this.owned], wearing: this.wearing, sets: this.sets }; }
  load(d) {
    if (!d) return;
    this.owned = new Set((Array.isArray(d.owned) ? d.owned : []).filter((id) => COSTUME[id]));
    this.wearing = COSTUME[d.wearing] && this.owned.has(d.wearing) ? d.wearing : null;
    this.sets = Array.from({ length: SET_SLOTS }, (_, i) => (d.sets?.[i] ? cleanSet(d.sets[i], this.owned) : null));
  }
}

function cleanSet(s, owned) {
  const costume = COSTUME[s.costume] && (!owned || owned.has(s.costume)) ? s.costume : null;
  return { costume, hat: HATS.includes(s.hat) ? s.hat : null, scarf: SCARVES.includes(s.scarf) ? s.scarf : null, goggles: !!s.goggles, sprout: s.sprout === undefined ? true : !!s.sprout };
}

/** 다른 접속자에게 보낼 모습: "코스튬.모자.스카프.고글.새싹" (없으면 '-') */
export function encodeLook({ costume = null, hat = null, scarf = null, goggles = false, sprout = true } = {}) {
  return [costume || '-', hat || '-', scarf || '-', goggles ? 1 : 0, sprout === false ? 0 : 1].join('.');
}

/** 받은 모습 문자열 검사 → 정해진 값만 (이상한 값은 기본값) */
export function decodeLook(s) {
  const [c, h, sc, gg, sp] = String(s || '').slice(0, 48).split('.');
  return {
    costume: COSTUME[c] ? c : null,
    hat: HATS.includes(h) ? h : null,
    scarf: SCARVES.includes(sc) ? sc : null,
    goggles: gg === '1',
    sprout: sp !== '0',
  };
}
