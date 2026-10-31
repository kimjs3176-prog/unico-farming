/**
 * 사쿠나히메풍 벼농사 시뮬레이션 (렌더링 무관)
 * 단계: dry → 갈기(tilled) → 물 대기(flooded) → 모내기(growing: 모→분얼→이삭→황금) → 수확 → 탈곡(쌀 등급 결정)
 * - 물 높이(cm) 관리: 단계마다 적정 범위가 다르고, 증발로 줄고 비가 오면 늘어남
 * - 잡초: 물이 얕을수록 잘 자라고 품질을 깎음 → 뽑아야 함
 * - 물떼기: 황금 단계(익음)에 물을 빼 두면 품질 보너스
 * - 숙련도: 수확할수록 오르고, 품질 상승 폭과 수확량이 늘어남
 */
export const RICE_STAGES = [
  { name: '모', water: [2, 4], time: 50 },
  { name: '분얼기', water: [3, 6], time: 60 },
  { name: '이삭 패기', water: [5, 8], time: 60 },
  { name: '황금 들녘', water: [0, 1.5], time: 40 }, // 물떼기
];
export const WATER_MAX = 10;
export const EVAPORATION = 0.045; // cm/초
export const RAIN_GAIN = 0.35; // cm/초

export class RiceSim {
  constructor(count, rng = Math.random) {
    this.rng = rng;
    this.paddies = Array.from({ length: count }, () => fresh());
    this.skill = 0; // 숙련도 포인트
    this.listeners = [];
  }
  on(fn) { this.listeners.push(fn); }
  emit(t, i, x) { for (const l of this.listeners) l(t, i, x); }

  get skillLevel() { return 1 + Math.floor(Math.sqrt(this.skill / 20)); }

  actionsFor(i, hasSeed) {
    const p = this.paddies[i];
    if (p.state === 'dry') return [{ type: 'till', label: '논 갈기 (써레질)' }];
    if (p.state === 'tilled') return [{ type: 'flood', label: '논에 물 대기' }];
    if (p.state === 'flooded') return [hasSeed ? { type: 'plant', label: '모내기 (볍씨 1)' } : { type: 'need_seed', label: '볍씨가 필요해요 (장터)' }];
    if (p.state === 'ripe') return [{ type: 'harvest', label: '벼 베기 (수확)' }];
    if (p.state === 'growing') {
      const st = RICE_STAGES[p.stage];
      const acts = [];
      if (p.weeds > 0) acts.push({ type: 'weed', label: `잡초 뽑기 (${p.weeds})` });
      if (p.water < st.water[0]) acts.push({ type: 'water', label: `물 대기 (현재 ${p.water.toFixed(1)}cm, 적정 ${st.water[0]}~${st.water[1]})` });
      else if (p.water > st.water[1]) acts.push({ type: 'drain', label: `물 빼기 (현재 ${p.water.toFixed(1)}cm, 적정 ${st.water[0]}~${st.water[1]})` });
      if (!acts.length) acts.push({ type: 'check', label: `${st.name} · 물 ${p.water.toFixed(1)}cm 적정 · 품질 ${Math.round(p.quality)}` });
      return acts;
    }
    return [];
  }

  till(i) { const p = this.paddies[i]; if (p.state !== 'dry') return false; p.state = 'tilled'; this.emit('till', i); return true; }
  flood(i) { const p = this.paddies[i]; if (p.state !== 'tilled') return false; p.state = 'flooded'; p.water = 4; this.emit('flood', i); return true; }
  plant(i) {
    const p = this.paddies[i];
    if (p.state !== 'flooded') return false;
    Object.assign(p, { state: 'growing', stage: 0, progress: 0, quality: 50, weeds: 0 });
    this.emit('plant', i);
    return true;
  }
  water(i, amount = 2.5) { const p = this.paddies[i]; if (p.state !== 'growing' && p.state !== 'flooded') return false; p.water = Math.min(WATER_MAX, p.water + amount); this.emit('water', i); return true; }
  drain(i, amount = 2.5) { const p = this.paddies[i]; if (p.state !== 'growing') return false; p.water = Math.max(0, p.water - amount); this.emit('drain', i); return true; }
  weed(i) { const p = this.paddies[i]; if (!p.weeds) return false; p.weeds--; this.emit('weed', i); return true; }

  /** 수확: 벼 개수와 품질(0~100) 반환, 논은 dry 로 */
  harvest(i) {
    const p = this.paddies[i];
    if (p.state !== 'ripe') return null;
    const q = Math.max(0, Math.min(100, p.quality - p.weeds * 6));
    const amount = 3 + Math.floor(this.skillLevel / 2) + (q >= 80 ? 2 : q >= 60 ? 1 : 0);
    this.skill += Math.round(5 + q / 10);
    Object.assign(this.paddies[i], fresh());
    this.emit('harvest', i, { amount, quality: q });
    return { amount, quality: q };
  }

  /** 품질 → 쌀 등급 ★1~5 */
  static grade(q) { return q >= 90 ? 5 : q >= 75 ? 4 : q >= 55 ? 3 : q >= 35 ? 2 : 1; }

  tick(dt, { raining = false } = {}) {
    const lv = this.skillLevel;
    this.paddies.forEach((p, i) => {
      if (p.state === 'flooded' || p.state === 'growing' || p.state === 'ripe') {
        p.water = Math.max(0, Math.min(WATER_MAX, p.water - EVAPORATION * dt + (raining ? RAIN_GAIN * dt : 0)));
      }
      if (p.state !== 'growing') return;
      const st = RICE_STAGES[p.stage];
      const ok = p.water >= st.water[0] && p.water <= st.water[1];
      // 성장: 물이 아예 없으면(마지막 단계 제외) 크게 느려짐
      const dryPenalty = p.stage < 3 && p.water < 0.5 ? 0.25 : 1;
      p.progress += (dt / st.time) * dryPenalty;
      // 품질: 적정 수위면 오르고 벗어나면 내려감, 숙련도가 높을수록 잘 오름
      p.quality += (ok ? 0.35 + lv * 0.05 : -0.45) * dt;
      p.quality = Math.max(0, Math.min(100, p.quality));
      // 잡초: 얕은 물에서 잘 생김 (깊은 물은 잡초 억제)
      const weedChance = (p.water < 3 ? 0.03 : 0.008) * dt;
      if (p.stage < 3 && p.weeds < 5 && this.rng() < weedChance) { p.weeds++; this.emit('weedgrow', i); }
      if (p.progress >= 1) {
        p.progress = 0;
        if (p.stage < 3) { p.stage++; this.emit('stage', i, p.stage); }
        else { p.state = 'ripe'; this.emit('ripe', i); }
      }
    });
  }

  toJSON() { return { paddies: this.paddies, skill: this.skill }; }
  load(d) { if (!d) return; d.paddies?.forEach((p, i) => { if (this.paddies[i]) Object.assign(this.paddies[i], p); }); this.skill = d.skill || 0; }
}

function fresh() { return { state: 'dry', stage: 0, progress: 0, water: 0, quality: 50, weeds: 0 }; }

/** 탈곡: 연타 게이지(0~1) → 벼 → 쌀 변환 효율 */
export function thresh(paddyCount, gauge) {
  const eff = 0.6 + 0.4 * Math.max(0, Math.min(1, gauge));
  return Math.max(paddyCount > 0 ? 1 : 0, Math.round(paddyCount * eff));
}
