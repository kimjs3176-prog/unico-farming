import { CROPS } from './crops.js';

export const WATER_DURATION = 45; // 물 효과 지속(초)

/**
 * 경작지 시뮬레이션 (렌더링 무관)
 * 상태: empty -> tilled -> growing(progress 0..1) -> ready -> (harvest) -> tilled
 */
export class FarmSim {
  constructor(count) {
    this.plots = Array.from({ length: count }, () => ({ state: 'empty', crop: null, progress: 0, water: 0 }));
    this.boost = 1; // 스마트팜 보너스 등
    this.listeners = [];
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, idx, extra) { for (const l of this.listeners) l(type, idx, extra); }

  /** 현재 플롯에서 가능한 행동 (UI 힌트용) */
  actionFor(i, hasSeed) {
    const p = this.plots[i];
    if (p.state === 'empty') return { type: 'till', label: '밭 갈기' };
    if (p.state === 'tilled') return hasSeed ? { type: 'plant', label: '씨앗 심기' } : { type: 'need_seed', label: '씨앗이 필요해요 (장터)' };
    if (p.state === 'growing') return p.water > 0 ? { type: 'wait', label: `${CROPS[p.crop].name} 성장 중 ${Math.floor(p.progress * 100)}%` } : { type: 'water', label: '물 주기' };
    if (p.state === 'ready') return { type: 'harvest', label: `${CROPS[p.crop].name} 수확` };
    return null;
  }

  till(i) {
    const p = this.plots[i];
    if (p.state !== 'empty') return false;
    p.state = 'tilled';
    this.emit('till', i);
    return true;
  }

  plant(i, crop) {
    const p = this.plots[i];
    if (p.state !== 'tilled' || !CROPS[crop]) return false;
    Object.assign(p, { state: 'growing', crop, progress: 0, water: 0 });
    this.emit('plant', i, crop);
    return true;
  }

  water(i) {
    const p = this.plots[i];
    if (p.state !== 'growing') return false;
    p.water = WATER_DURATION;
    this.emit('water', i);
    return true;
  }

  harvest(i) {
    const p = this.plots[i];
    if (p.state !== 'ready') return null;
    const crop = p.crop;
    const amount = CROPS[crop].yield;
    Object.assign(p, { state: 'tilled', crop: null, progress: 0, water: 0 });
    this.emit('harvest', i, { crop, amount });
    return { crop, amount };
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
      const rate = (p.water > 0 ? 1 : 0.3) * this.boost;
      p.progress += (dt / CROPS[p.crop].growTime) * rate;
      p.water = Math.max(0, p.water - dt);
      if (p.progress >= 1) { p.progress = 1; p.state = 'ready'; this.emit('ready', i, p.crop); }
    });
  }

  toJSON() { return { plots: this.plots }; }
  load(data) {
    if (!data?.plots) return;
    data.plots.forEach((p, i) => { if (this.plots[i]) Object.assign(this.plots[i], p); });
  }
}
