// 가방·도감·씨앗 고르기 창
import { h } from '../dom.js';
import { CROPS, PRODUCTS } from '../../game/sim/crops.js';
import { ITEMS, CATEGORY_NAMES, itemsOf } from '../../game/sim/items.js';
import { BOOK_CATS, COMPLETE_REWARD } from '../../game/sim/collection.js';

/** 가방·도감·씨앗 창 메서드 (UI.prototype 에 합쳐짐) */
export const BagPanel = {
  openBook(cat = 'fish') {
    const g = this.game, c = g.collection;
    const p = this.openPanel('📖 유니코 도감');
    const tabs = h('div', 'book-tabs');
    for (const k of BOOK_CATS) {
      const pr = c.progress(k);
      const t = h('button', k === cat ? '' : 'ghost', `${CATEGORY_NAMES[k]} ${pr.got}/${pr.total}`);
      t.onclick = () => this.openBook(k);
      tabs.append(t);
    }
    p.append(tabs);
    const grid = h('div', 'book-grid');
    for (const k of itemsOf(cat)) {
      const it = ITEMS[k], e = c.entries[k];
      grid.append(h('div', `book-cell${e ? '' : ' locked'}`, e
        ? `<span class="em">${it.emoji}</span><b>${it.name}</b><small>${e.count}마리·개${e.best ? ` · 최대 ${e.best}cm` : ''}</small><small>${'⭐'.repeat(it.rarity || 1)}</small>`
        : `<span class="em">❔</span><b>???</b><small>${'⭐'.repeat(it.rarity || 1)}</small>`));
    }
    p.append(grid);
    const pr = c.progress(cat);
    p.append(h('h3', '', pr.got === pr.total ? `🏅 ${CATEGORY_NAMES[cat]} 도감 완성! (보상 ${COMPLETE_REWARD[cat]}🪙 지급됨)` : `모두 모으면 보상 ${COMPLETE_REWARD[cat]}🪙 · 힌트: ${cat === 'fish' ? '비 오는 날·밤에 희귀한 물고기 · 남서쪽 낚시터에만 사는 물고기도 있어요' : cat === 'bug' ? '밤에는 반딧불이, 나무를 흔들면 풍뎅이' : '과수원 나무는 하루 한 번'}`));
  },

  openInventory() {
    const eco = this.game.economy;
    const p = this.openPanel('🎒 가방');
    const rows = h('div', 'rows');
    const add = (emoji, name, n) => rows.append(h('div', 'row', `<span>${emoji}</span><span class="nm">${name}</span><span class="qty">×${n}</span>`));
    add('🪙', '코인', eco.money.toLocaleString());
    for (const [k, n] of Object.entries(eco.inventory.seeds)) if (n) add(CROPS[k].emoji, CROPS[k].name + ' 씨앗', n);
    for (const [k, n] of Object.entries(eco.inventory.crops)) if (n) add(CROPS[k].emoji, CROPS[k].name, n);
    for (const [k, n] of Object.entries(eco.inventory.products)) if (n) add(PRODUCTS[k].emoji, PRODUCTS[k].name, n);
    add('🌾', '사료', eco.inventory.feed);
    for (const [k, n] of Object.entries(eco.inventory.items)) if (n) add(ITEMS[k].emoji, ITEMS[k].name, n);
    p.append(rows);
    p.append(h('h3', '', `🥕 밭농사 숙련도 Lv.${this.game.farm.sim.level} (${this.game.farm.sim.xp}점) · 🌾 논농사 숙련도 Lv.${this.game.rice.sim.skillLevel} (${this.game.rice.sim.skill}점) · 📖 도감 ${BOOK_CATS.map((c) => { const pr = this.game.collection.progress(c); return `${CATEGORY_NAMES[c]} ${pr.got}/${pr.total}`; }).join(' · ')}`));
    const s = eco.stats;
    p.append(h('h3', '', `누적 수입 ${s.earned.toLocaleString()} · 지출 ${s.spent.toLocaleString()} · 판매 ${s.sold}개`));
  },

  openSeedPicker(onPick, { fert = 0 } = {}) {
    const g = this.game, eco = g.economy;
    const p = this.openPanel('🌱 어떤 씨앗을 심을까요?');
    let useFert = fert > 0;
    if (fert > 0) {
      const tg = h('label', 'row', `<span>🟫</span><span class="nm">퇴비도 함께 주기 <span class="qty">보유 ${fert}</span><br><small>30% 빨리 자라고 품질 ↑</small></span>`);
      const cb = h('input'); cb.type = 'checkbox'; cb.checked = true; cb.onchange = () => { useFert = cb.checked; };
      tg.append(cb);
      const wrap = h('div', 'rows'); wrap.append(tg); p.append(wrap);
    }
    const grid = h('div', 'seed-grid');
    for (const [k, c] of Object.entries(CROPS)) {
      const n = eco.inventory.seeds[k] || 0;
      if (!n) continue;
      const b = h('button', '', `${c.emoji} ${c.name}<span class="q">${n}개 · ${c.growTime}초 · ${c.basePrice}🪙</span>`);
      b.onclick = () => { this.closePanel(); onPick(k, useFert); };
      grid.append(b);
    }
    p.append(grid);
  },
};
