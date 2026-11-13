import { withJosa as josaW } from '../game/sim/josa.js';
import { Processor, RECIPES, RANCH_RECIPES, JAR_PRICES, WORKSHOP_PRICES, MAX_JARS, Composter, COMPOST_PER, COMPOST_MAX } from '../game/sim/farmcraft.js';
import { CROPS, PRODUCTS } from '../game/sim/crops.js';
import { ITEMS } from '../game/sim/items.js';

/**
 * 도트판 가공 (6차 산업): 밭 서쪽 장독대·퇴비통, 목장 앞 가공소(치즈 공방)
 * 규칙은 3D 판과 같은 farmcraft.js (Processor · Composter)
 */
const nameOf = (k) => (CROPS[k] || PRODUCTS[k] || ITEMS[k])?.name || k;
const T = 32;

export function initCraft(g) {
  g.jars = new Processor({ recipes: RECIPES, prices: JAR_PRICES, jars: 2 });
  g.workshop = new Processor({ recipes: RANCH_RECIPES, prices: WORKSHOP_PRICES, jars: 2 });
  g.composter = new Composter();
}
export const craftSave = (g) => ({ jars: g.jars.toJSON(), workshop: g.workshop.toJSON(), composter: g.composter.toJSON() });
export function craftLoad(g, d) { if (!d) return; g.jars.load(d.jars); g.workshop.load(d.workshop); g.composter.load(d.composter); }

export const CraftMethods = {
  craftTick(dt) {
    for (const [P, label] of [[this.jars, '장독대'], [this.workshop, '목장 가공소']]) {
      for (const i of P.tick(dt)) { this.audio.play('pop'); this.ui.toast(`${label}: ${josaW(nameOf(P.slots[i].id), '이/가')} 다 됐어요!`, 'gift'); }
    }
    if (this.composter.tick(dt)) { this.audio.play('pop'); this.ui.toast('퇴비통: 퇴비가 다 익었어요!', 'compost'); }
  },

  craftTarget(o) {
    if (o.type === 'jars') { const n = this.jars.slots.slice(0, this.jars.jars).filter((s, i) => this.jars.isDone(i)).length; return { label: `장독대 (장독 ${this.jars.jars}개${n ? ` · 다 된 것 ${n}` : ''})`, run: () => this.procMenu('jars') }; }
    if (o.type === 'workshop') { const n = this.workshop.slots.slice(0, this.workshop.jars).filter((s, i) => this.workshop.isDone(i)).length; return { label: `목장 가공소 (치즈 공방${n ? ` · 다 된 것 ${n}` : ''})`, run: () => this.procMenu('workshop') }; }
    if (o.type === 'composter') { const C = this.composter; return { label: `퇴비통 (재료 ${C.mats}/${COMPOST_MAX}${C.ready ? ` · 퇴비 ${C.ready}개 완성` : C.brewing ? ` · 숙성 ${Math.floor(C.progress * 100)}%` : ''})`, run: () => this.composterMenu() }; }
    return undefined;
  },

  /** 장독대·가공소 공통 메뉴: 칸 상태 → 만들 수 있는 것 → 칸 늘리기 */
  procMenu(which) {
    const P = this[which], e = this.econ;
    const ranch = which === 'workshop';
    const lv = ranch ? this.ranch.level : this.farm.level;
    const title = ranch ? '목장 가공소 (치즈 공방)' : '장독대';
    const slotName = ranch ? '작업대' : '장독';
    this.ui.openMenu({
      title,
      build: () => {
        const items = [];
        for (let i = 0; i < P.jars; i++) {
          const s = P.slots[i];
          if (!s) items.push({ icon: 'quest', label: `${slotName} ${i + 1}: 비어 있어요`, right: '', onPick: () => {} });
          else if (P.isDone(i)) items.push({ icon: 'star', label: `${slotName} ${i + 1}: ${nameOf(s.id)} 완성!`, right: '꺼내기', onPick: () => {
            const id = P.collect(i); if (!id) return;
            e.addItem(id); this.audio.play('harvest'); this.report(ranch ? 'rprocess' : 'process');
            if (ranch) this.ranch.xp += 6; else this.farm.xp += 8;
            this.ui.toast(`${josaW(nameOf(id), '을/를')} 꺼냈어요 (장터에서 ${e.sellPrice(id)}코인)`, 'gift');
          } });
          else items.push({ icon: 'quest', label: `${slotName} ${i + 1}: ${nameOf(s.id)} 숙성 중`, right: `${Math.floor((s.t / P.recipes[s.id].time) * 100)}%`, onPick: () => {} });
        }
        const free = P.freeSlot();
        for (const [id, R] of Object.entries(P.recipes)) {
          const need = Object.entries(R.input).map(([k, n]) => `${nameOf(k)} ${e.count(k)}/${n}`).join(' · ');
          const lock = R.level > lv;
          const ok = !lock && free >= 0 && P.canMake(id, (k) => e.count(k));
          items.push({ icon: 'gift', label: `${nameOf(id)} ← ${need}${lock ? ` (숙련도 Lv.${R.level})` : ''}`, right: `${R.time}초 · ${ITEMS[id].price}`, disabled: !ok, onPick: () => {
            const f = P.freeSlot(); if (f < 0 || !P.canMake(id, (k) => e.count(k))) return;
            for (const [k, n] of Object.entries(R.input)) e.take(k, n);
            P.start(f, id); this.audio.play('plant');
            this.ui.toast(`${nameOf(id)} ${ranch ? '만들기' : '담그기'} 시작! (${R.time}초)`, 'gift');
          } });
        }
        const price = P.nextJarPrice;
        if (price !== null) items.push({ icon: 'coin', label: `${slotName} 하나 더 들이기 (${P.jars} → ${P.jars + 1}개)`, right: `${price}`, disabled: e.money < price, onPick: () => { if (e.money < price || !P.buyJar()) return; e.money -= price; e.stats.spent += price; this.audio.play('coin'); } });
        return {
          sub: `${ranch ? '목장' : '밭농사'} 숙련도 Lv.${lv} · ${slotName} ${P.jars}/${MAX_JARS}개 · 가공품은 재료보다 비싸게 팔려요${free < 0 ? ` · 빈 ${slotName}이 없어요` : ''}`,
          items,
        };
      },
    });
  },

  composterMenu() {
    const C = this.composter, e = this.econ;
    this.ui.openMenu({
      title: '퇴비통',
      build: () => {
        const items = [];
        if (C.ready) items.push({ icon: 'compost', label: `퇴비 ${C.ready}개 꺼내기`, right: '', onPick: () => { const n = C.take(); e.addItem('compost', n); this.audio.play('harvest'); this.ui.toast(`퇴비 ${n}개! 씨앗을 심을 때 자동으로 같이 줘요`, 'compost'); } });
        const room = COMPOST_MAX - C.mats;
        const w = e.inventory.items.weed || 0;
        items.push({ icon: 'compost', label: `잡초 넣기 (가진 것 ${w})`, right: room ? `+${Math.min(w, room)}` : '가득', disabled: !w || !room, onPick: () => { const k = C.add(Math.min(w, room)); e.useItem('weed', k); this.audio.play('dig', 0.5); } });
        for (const [k, n] of Object.entries(e.inventory.crops)) if (n > 0) items.push({ icon: k, label: `${nameOf(k)} 1개 넣기 (가진 것 ${n})`, right: room ? '+1' : '가득', disabled: !room, onPick: () => { if (!C.add(1)) return; e.take(k, 1); this.audio.play('dig', 0.4); } });
        return { sub: `잡초나 남는 작물 ${COMPOST_PER}개 = 퇴비 1개 · 재료 ${C.mats}/${COMPOST_MAX}${C.brewing ? ` · 숙성 ${Math.floor(C.progress * 100)}%` : ''} · 퇴비를 주면 30% 빨리 자라고 품질↑`, items };
      },
    });
  },
};

export { T };
