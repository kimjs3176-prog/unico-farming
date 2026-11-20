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

/**
 * 집 안 꾸미기 (꾸밈만, 수익 없음): 벽지·바닥 색 세트와 가구. 가진 것은 그대로 남고 언제든 바꿔 입힘
 *  wall/wallB: 벽 위·아랫단 색, floor/floorB: 널빤지 두 색, look: 견본 무늬(plank 널빤지·stripe 줄무늬·tile 타일·mat 장판) (home_interior.js 의 MAT 색만 바꿈 → 그리기 호출 그대로)
 */
export const WALLPAPERS = [
  { id: 'cream', name: '크림 벽지', icon: '🤍', price: 0, lv: 1, wall: 0xfff1dc, wallB: 0xf6dcc0 },
  { id: 'peach', name: '복숭아 벽지', icon: '🍑', price: 300, lv: 1, wall: 0xffe2d2, wallB: 0xf5b9a0 },
  { id: 'mint', name: '민트 벽지', icon: '🌿', price: 400, lv: 2, wall: 0xdff5ea, wallB: 0x9fd8bd },
  { id: 'sky', name: '하늘 벽지', icon: '☁️', price: 500, lv: 2, wall: 0xe0f0ff, wallB: 0x9cc8ec },
  { id: 'lemon', name: '레몬 벽지', icon: '🍋', price: 600, lv: 3, wall: 0xfff6c8, wallB: 0xf0d77a },
  { id: 'lilac', name: '라일락 벽지', icon: '💜', price: 800, lv: 3, wall: 0xefe4ff, wallB: 0xc4aee8 },
  { id: 'hanji', name: '한지 벽지', icon: '📜', price: 1000, lv: 4, wall: 0xf7efdc, wallB: 0xb98f5f },
  { id: 'forest', name: '숲속 벽지', icon: '🌲', price: 1500, lv: 5, wall: 0xd9ead2, wallB: 0x5f8f5a },
  { id: 'night', name: '밤하늘 벽지', icon: '🌙', price: 2000, lv: 6, wall: 0x3c4a78, wallB: 0x27315a },
];
export const FLOORS = [
  { id: 'oak', name: '참나무 마루', icon: '🪵', price: 0, lv: 1, floor: 0xc99a63, floorB: 0xb8875a, look: 'plank' },
  { id: 'pine', name: '밝은 소나무 마루', icon: '🌲', price: 300, lv: 1, floor: 0xe8c99a, floorB: 0xdcb784, look: 'plank' },
  { id: 'walnut', name: '호두나무 마루', icon: '🌰', price: 400, lv: 2, floor: 0x8a5a3a, floorB: 0x7a4c30, look: 'plank' },
  { id: 'check', name: '줄무늬 마루', icon: '🍬', price: 600, lv: 2, floor: 0xf6eee4, floorB: 0xe8a49a, look: 'stripe' },
  { id: 'jangpan', name: '노란 장판', icon: '🟨', price: 700, lv: 3, floor: 0xf2c46a, floorB: 0xe8b85a, look: 'mat' },
  { id: 'mintile', name: '민트 타일', icon: '🟩', price: 900, lv: 3, floor: 0xbfe8d6, floorB: 0x9ad6bd, look: 'tile' },
  { id: 'rose', name: '장미 마루', icon: '🌹', price: 1200, lv: 4, floor: 0xd9928a, floorB: 0xc77b74, look: 'plank' },
  { id: 'marble', name: '대리석', icon: '⬜', price: 1600, lv: 5, floor: 0xf2f0ec, floorB: 0xd8d4cc, look: 'tile' },
  { id: 'starry', name: '별빛 마루', icon: '✨', price: 2000, lv: 6, floor: 0x3d3a5c, floorB: 0x4b4870, look: 'plank' },
];
/** 집 안 가구 (방에 고정된 자리, 지나다니는 길을 막지 않음) */
export const FURNITURE = [
  { id: 'painting', name: '풍경화 액자', icon: '🖼️', price: 200, lv: 1, desc: '침대 위 벽에 거는 들판 그림' },
  { id: 'clock', name: '벽시계', icon: '🕰️', price: 300, lv: 1, desc: '책상 위 벽에서 똑딱' },
  { id: 'teddy', name: '곰 인형', icon: '🧸', price: 400, lv: 1, desc: '침대 베개 옆에 앉아 있어요' },
  { id: 'sillflower', name: '창가 꽃화분', icon: '🌸', price: 500, lv: 2, desc: '창틀에 놓는 꽃 세 송이' },
  { id: 'fishbowl', name: '금붕어 어항', icon: '🐠', price: 600, lv: 2, desc: '가운데 탁자 위의 둥근 어항' },
  { id: 'curtain', name: '꽃무늬 커튼', icon: '🪟', price: 700, lv: 2, desc: '창문 양옆 커튼' },
  { id: 'garland', name: '알록달록 가랜드', icon: '🎏', price: 800, lv: 3, desc: '뒤 벽 위를 가로지르는 깃발 줄' },
  { id: 'pendant', name: '펜던트 조명', icon: '💡', price: 900, lv: 3, desc: '탁자 위에 매달린 등' },
  { id: 'radio', name: '옛날 라디오', icon: '📻', price: 1200, lv: 4, desc: '책상 위 나무 라디오' },
  { id: 'bigrug', name: '꽃 러그', icon: '🧶', price: 1500, lv: 4, desc: '앞쪽 바닥에 까는 큰 꽃 깔개' },
  { id: 'statue', name: '금빛 유니코 조각상', icon: '🦄', price: 3000, lv: 6, desc: '받침대 위에서 반짝이는 유니코' },
];
const STYLE_LIST = { wall: WALLPAPERS, floor: FLOORS };
export const STYLE_BY_ID = { wall: Object.fromEntries(WALLPAPERS.map((x) => [x.id, x])), floor: Object.fromEntries(FLOORS.map((x) => [x.id, x])) };
export const FURNITURE_BY_ID = Object.fromEntries(FURNITURE.map((x) => [x.id, x]));

export class HomeSim {
  constructor() {
    this.level = 0;      // HOME_LEVELS 번호
    this.restedDay = 0;  // 개운한 날 (이 날짜까지 속도 보너스)
    this.sleeps = 0;     // 잠잔 횟수
    this.outfit = {};    // 옷장에서 고른 옷차림 { hat, scarf, goggles, sprout }
    this.style = { wall: 'cream', floor: 'oak' };      // 지금 입힌 벽지·바닥
    this.styles = { wall: ['cream'], floor: ['oak'] };  // 가진 벽지·바닥
    this.furniture = [];                                // 가진(방에 놓인) 가구 id
  }

  hasStyle(kind, id) { return !!this.styles[kind]?.includes(id); }

  /** 벽지·바닥 살 수 없는 이유 (없으면 null) */
  whyNotStyle(kind, id, money = 0, playerLevel = 99) {
    const x = STYLE_BY_ID[kind]?.[id];
    if (!x) return '없는 무늬예요';
    if (this.hasStyle(kind, id)) return '이미 가지고 있어요';
    if (playerLevel < x.lv) return `Lv.${x.lv}부터 살 수 있어요`;
    if (money < x.price) return `코인이 ${x.price - money} 모자라요`;
    return null;
  }

  /** 벽지·바닥 사서 바로 입히기 → 든 비용 (못 사면 -1, 공짜면 0) */
  buyStyle(kind, id, money, playerLevel = 99) {
    if (this.whyNotStyle(kind, id, money, playerLevel)) return -1;
    this.styles[kind].push(id);
    this.style[kind] = id;
    return STYLE_BY_ID[kind][id].price;
  }

  /** 가진 벽지·바닥으로 바꾸기 */
  setStyle(kind, id) {
    if (!this.hasStyle(kind, id)) return false;
    this.style[kind] = id;
    return true;
  }

  /** 지금 방 색 { wall, wallB, floor, floorB } (over 를 주면 그 무늬로 바꿔 본 색 — 사지 않고 미리보기) */
  colors(over = null) {
    const st = over ? { ...this.style, ...over } : this.style; // over: 미리보기 { wall?: id, floor?: id }
    const w = STYLE_BY_ID.wall[st.wall] || WALLPAPERS[0], f = STYLE_BY_ID.floor[st.floor] || FLOORS[0];
    return { wall: w.wall, wallB: w.wallB, floor: f.floor, floorB: f.floorB };
  }

  hasFurniture(id) { return this.furniture.includes(id); }
  whyNotFurniture(id, money = 0, playerLevel = 99) {
    const x = FURNITURE_BY_ID[id];
    if (!x) return '없는 가구예요';
    if (this.hasFurniture(id)) return '이미 놓았어요';
    if (playerLevel < x.lv) return `Lv.${x.lv}부터 살 수 있어요`;
    if (money < x.price) return `코인이 ${x.price - money} 모자라요`;
    return null;
  }
  /** 가구 사서 방에 놓기 → 든 비용 (못 사면 0) */
  buyFurniture(id, money, playerLevel = 99) {
    if (this.whyNotFurniture(id, money, playerLevel)) return 0;
    this.furniture.push(id);
    return FURNITURE_BY_ID[id].price;
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

  toJSON() { return { level: this.level, restedDay: this.restedDay, sleeps: this.sleeps, outfit: this.outfit, style: { ...this.style }, styles: { wall: [...this.styles.wall], floor: [...this.styles.floor] }, furniture: [...this.furniture] }; }
  load(d) {
    if (!d) return;
    this.level = Math.max(0, Math.min(HOME_LEVELS.length - 1, d.level | 0));
    this.restedDay = d.restedDay | 0;
    this.sleeps = d.sleeps | 0;
    const o = d.outfit || {};
    // 집 안 꾸미기 (옛 저장에는 없음 → 기본 벽지·바닥)
    for (const kind of ['wall', 'floor']) {
      const own = (Array.isArray(d.styles?.[kind]) ? d.styles[kind] : []).filter((id) => STYLE_BY_ID[kind][id]);
      const first = STYLE_LIST[kind][0].id;
      this.styles[kind] = [first, ...new Set(own.filter((id) => id !== first))];
      this.style[kind] = this.styles[kind].includes(d.style?.[kind]) ? d.style[kind] : first;
    }
    this.furniture = [...new Set((Array.isArray(d.furniture) ? d.furniture : []).filter((id) => FURNITURE_BY_ID[id]))];
    this.outfit = { hat: OUTFIT.hat.includes(o.hat) ? o.hat : null, scarf: OUTFIT.scarf.includes(o.scarf) ? o.scarf : null, goggles: !!o.goggles, sprout: o.sprout === undefined ? undefined : !!o.sprout, ...(o.set ? { set: true } : {}) };
  }
}
