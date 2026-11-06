import { CROPS } from './crops.js';

export const WATER_DURATION = 45; // 물 효과 지속(초)
/** 밭농사 숙련도: 레벨별 누적 경험치 */
export const FARM_LEVELS = [0, 40, 120, 260, 480, 800, 1250, 1850];
export const GIANT_CHANCE = 0.04; // 다 익을 때 대왕 작물이 될 확률 (퇴비 주면 +0.04)
export const FERT_SPEED = 1.3;    // 퇴비 준 밭 성장 배수

/** 관리 점수(0~1+) → 별 (1: 보통, 2: 상품, 3: 특상품) */
export const starsOf = (q) => (q >= 0.95 ? 3 : q >= 0.72 ? 2 : 1);

/**
 * 경작지 시뮬레이션 (렌더링 무관)
 * 상태: empty -> tilled -> growing(progress 0..1) -> ready -> (harvest) -> tilled
 */
export class FarmSim {
  constructor(count, cols = 6) {
    this.cols = cols;
    this.plots = Array.from({ length: count }, () => ({ state: 'empty', crop: null, progress: 0, water: 0 }));
    this.xp = 0; // 밭농사 숙련도 경험치
    this.sprinklerRows = 0; // 스프링클러가 깔린 줄 수 (앞줄부터): 물이 마르면 자동으로 뿌림
    this.boost = 1; // 스마트팜 보너스 등
    this.weatherMult = 1; // 날씨 영향 (눈 오면 느려짐)
    this.buildMult = 1; // 마을 건물 (유리 온실) 성장 배수
    this.waterMult = 1; // 마을 건물 (물탱크) 물 지속 배수
    this.weedChance = 0; // 초당 잡초가 날 확률 (자라는 밭마다). 0 이면 잡초 없음 (테스트 기본값)
    this.rng = Math.random;
    this.listeners = [];
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, idx, extra) { for (const l of this.listeners) l(type, idx, extra); }

  get level() { let lv = 1; for (let i = 1; i < FARM_LEVELS.length; i++) if (this.xp >= FARM_LEVELS[i]) lv = i + 1; return lv; }
  get nextXp() { return FARM_LEVELS[Math.min(this.level, FARM_LEVELS.length - 1)]; }

  /** 지금까지의 관리 점수: 물이 있었던 시간 비율(잡초가 있으면 덜 쳐줌) + 퇴비 + 숙련도 */
  care(i) {
    const p = this.plots[i];
    const base = p.careT > 0 ? p.careOk / p.careT : 1;
    return base + (p.fert ? 0.2 : 0) + (this.level - 1) * 0.03;
  }

  /** 퇴비 주기 (갈아 둔 밭·자라는 밭, 한 번만) */
  fertilize(i) {
    const p = this.plots[i];
    if (p.fert || (p.state !== 'tilled' && p.state !== 'growing')) return false;
    p.fert = true;
    this.emit('fert', i);
    return true;
  }

  /** 현재 플롯에서 가능한 행동 (UI 힌트용) */
  actionFor(i, hasSeed, hasFert = false) {
    const p = this.plots[i];
    if (p.state === 'empty') return { type: 'till', label: '밭 갈기' };
    if (p.state === 'tilled') return hasSeed ? { type: 'plant', label: '씨앗 심기' } : { type: 'need_seed', label: '씨앗이 필요해요 (장터)' };
    if (p.state === 'growing' && p.weeds) return { type: 'weed', label: '🌿 호미로 김매기 (잡초가 자람을 방해해요)' };
    if (p.state === 'growing' && p.water <= 0) return { type: 'water', label: '물 주기' };
    if (p.state === 'growing' && !p.fert && hasFert) return { type: 'fert', label: `🧪 퇴비 주기 (${CROPS[p.crop].name} 성장 중 ${Math.floor(p.progress * 100)}%)` };
    if (p.state === 'growing') { const st = starsOf(this.care(i)); return { type: 'wait', label: `${CROPS[p.crop].name} 성장 중 ${Math.floor(p.progress * 100)}% · 관리 ${'★'.repeat(st)}${'☆'.repeat(3 - st)}${p.fert ? ' · 🧪' : ''}` }; }
    if (p.state === 'ready') return { type: 'harvest', label: `${p.giant ? '🎉 대왕 ' : ''}${CROPS[p.crop].name} 수확 (${'★'.repeat(starsOf(this.care(i)))})` };
    return null;
  }

  till(i) {
    const p = this.plots[i];
    if (p.state !== 'empty') return false;
    p.state = 'tilled';
    this.emit('till', i);
    return true;
  }

  /** 김매기: 잡초 제거 → 잠깐 더 빨리 자람(흙이 부드러워짐) */
  weed(i) {
    const p = this.plots[i];
    if (!p.weeds) return false;
    p.weeds = false;
    p.loose = 20; // 20초 동안 성장 +25%
    this.emit('weed', i);
    return true;
  }

  plant(i, crop) {
    const p = this.plots[i];
    if (p.state !== 'tilled' || !CROPS[crop]) return false;
    Object.assign(p, { state: 'growing', crop, progress: 0, water: 0, careT: 0, careOk: 0, giant: false, regrowLeft: CROPS[crop].regrow || 0 });
    this.emit('plant', i, crop);
    return true;
  }

  water(i) {
    const p = this.plots[i];
    if (p.state !== 'growing') return false;
    p.water = WATER_DURATION * this.waterMult;
    this.emit('water', i);
    return true;
  }

  /** 비: 자라는 작물 중 물이 마른 밭에 자동으로 물 주기. 물 준 밭 수 반환 */
  rain() {
    let n = 0;
    this.plots.forEach((p, i) => {
      if (p.state === 'growing' && p.water < 10) { p.water = WATER_DURATION * this.waterMult; this.emit('rainwater', i); n++; }
    });
    return n;
  }

  /**
   * 수확: 관리 점수로 별(품질)과 수확량이 정해짐. 대왕 작물은 3배.
   * 다시 열리는 작물(토마토·딸기)은 덜 자란 상태로 돌아가 다시 열림
   * @returns { crop, amount, stars, giant, regrow, xp, levelUp }
   */
  harvest(i) {
    const p = this.plots[i];
    if (p.state !== 'ready') return null;
    const crop = p.crop, C = CROPS[crop];
    const stars = starsOf(this.care(i));
    const giant = !!p.giant;
    const amount = Math.max(1, C.yield + (stars - 2)) * (giant ? 3 : 1); // ★ -1, ★★ 기본, ★★★ +1
    const lv = this.level;
    const xp = Math.round(amount * (2 + stars) * (C.growTime / 90));
    this.xp += xp;
    const regrow = p.regrowLeft > 0;
    if (regrow) Object.assign(p, { state: 'growing', progress: 0.5, regrowLeft: p.regrowLeft - 1, giant: false, careT: 0, careOk: 0 });
    else Object.assign(p, { state: 'tilled', crop: null, progress: 0, water: 0, weeds: false, loose: 0, fert: false, giant: false });
    const out = { crop, amount, stars, giant, regrow, left: regrow ? p.regrowLeft : 0, xp, levelUp: this.level > lv ? this.level : 0 };
    this.emit('harvest', i, out);
    return out;
  }

  stage(i) {
    const p = this.plots[i];
    if (p.state === 'ready') return 2;
    if (p.state !== 'growing') return -1;
    return Math.min(1, Math.floor(p.progress * 2)); // 0: 새싹, 1: 성장
  }

  tick(dt) {
    this.plots.forEach((p, i) => {
      if (p.state !== 'growing') return;
      if (!p.weeds && this.weedChance > 0 && p.progress > 0.08 && this.rng() < this.weedChance * dt) { p.weeds = true; this.emit('weeds', i); }
      // 스프링클러: 물이 마른 밭에 자동으로
      if (p.water <= 0 && Math.floor(i / this.cols) < this.sprinklerRows) { p.water = WATER_DURATION * this.waterMult; this.emit('sprinkle', i); }
      const rate = (p.water > 0 ? 1 : 0.3) * this.boost * this.weatherMult * this.buildMult * (p.weeds ? 0.5 : 1) * (p.loose > 0 ? 1.25 : 1) * (p.fert ? FERT_SPEED : 1);
      if (p.loose > 0) p.loose = Math.max(0, p.loose - dt);
      // 관리 점수: 물이 있었던 시간 (잡초가 있으면 절반만)
      p.careT = (p.careT || 0) + dt;
      p.careOk = (p.careOk || 0) + (p.water > 0 ? (p.weeds ? 0.5 : 1) : 0) * dt;
      p.progress += (dt / CROPS[p.crop].growTime) * rate * (this.growthMult ? this.growthMult(p.crop) : 1); // 계절 (3D판 view 에서 연결, 없으면 1)
      p.water = Math.max(0, p.water - dt);
      if (p.progress >= 1) {
        p.progress = 1; p.state = 'ready';
        if (!p.giant && this.rng() < GIANT_CHANCE + (p.fert ? 0.04 : 0) && p.regrowLeft === (CROPS[p.crop].regrow || 0)) { p.giant = true; this.emit('giant', i, p.crop); }
        this.emit('ready', i, p.crop);
      }
    });
  }

  toJSON() { return { plots: this.plots, xp: this.xp, sprinklerRows: this.sprinklerRows }; }
  load(data) {
    if (!data?.plots) return;
    data.plots.forEach((p, i) => { if (this.plots[i]) Object.assign(this.plots[i], p); });
    this.xp = data.xp || 0;
    this.sprinklerRows = data.sprinklerRows || 0;
  }
}
