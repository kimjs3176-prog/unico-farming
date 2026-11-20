// 가방·도감·씨앗 고르기 창
import { h } from '../dom.js';
import { josa } from '../../game/sim/josa.js';
import { CROPS, PRODUCTS } from '../../game/sim/crops.js';
import { ITEMS, CATEGORY_NAMES, itemsOf, inSeason, seasonOnly } from '../../game/sim/items.js';
import { seasonOf, SEASON } from '../../game/sim/season.js';
import { BOOK_CATS, COMPLETE_REWARD } from '../../game/sim/collection.js';

/** 도감 못 만난 칸 힌트: '여름 밤 풀숲', '봄 연못' 처럼 계절·때·곳 */
export function bookHint(it) {
  const when = (it.seasons || []).map((x) => SEASON[x]?.name).filter(Boolean).join('·');
  const time = it.night ? ' 밤' : it.rain ? ' 비 오는 날' : it.cold ? ' 추운 날' : '';
  const where = it.cat === 'fish' ? (it.where === 'pond' ? '연못' : it.where === 'lake' ? '낚시터 호수' : '연못·호수')
    : it.cat === 'bug' ? (it.ground ? '풀숲' : '꽃밭') : it.cat === 'fruit' ? '과수원' : '';
  return `${when}${time} ${where}`.trim();
}

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
    // 지금 계절: 제철인데 아직 못 모은 것 수 (철이 지나면 잘 안 나오니 지금 모으기)
    const now = seasonOf(g.world.day ?? 1), list = itemsOf(cat);
    const inNow = list.filter((k) => ITEMS[k].seasons?.includes(now.id)), left = inNow.filter((k) => !c.entries[k]).length;
    const note = !inNow.length ? `${now.name}엔 제철 ${CATEGORY_NAMES[cat]}${josa(CATEGORY_NAMES[cat], '이/가')} 없어요 · 사철 나는 것과 드문 것만 가끔 보여요`
      : left ? `제철인데 아직 못 만난 ${CATEGORY_NAMES[cat]} <b>${left}종</b> · ⏳ 표시는 이 계절에만 나와요` : '이 계절 제철은 다 모았어요! 🎉';
    p.append(h('div', 'book-season', `<span class="bs-chip">${now.icon} 지금은 ${now.name}</span><span>${note}</span>`));
    const grid = h('div', 'book-grid');
    for (const k of list) {
      const it = ITEMS[k], e = c.entries[k];
      // 계절 알약: 계절마다 색 (지금 계절은 진하게, 나머지는 흐리게), 한 계절에만 나오면 ⏳ · 못 만난 칸엔 어디서 찾는지 힌트
      const on = !!(it.seasons && inSeason(k, now.id)), only = on && seasonOnly(k);
      const pills = it.seasons ? `<span class="bk-pills">${it.seasons.map((x) => `<span class="bk-pill s-${x}${x === now.id ? ' now' : ''}">${only && x === now.id ? '⏳ ' : ''}${SEASON[x].name}</span>`).join('')}</span>` : '';
      const hint = !e && it.seasons ? `<small class="bk-hint">${bookHint(it)}</small>` : '';
      grid.append(h('div', `book-cell${e ? '' : ' locked'}${on ? ' in-season' : it.seasons ? ' off-season' : ''}`, e
        ? `<span class="em">${it.emoji}</span><b>${it.name}</b><small>${e.count}마리·개${e.best ? ` · 최대 ${e.best}cm` : ''}</small><small>${'⭐'.repeat(it.rarity || 1)}</small>${pills}`
        : `<span class="em">❔</span><b>???</b><small>${'⭐'.repeat(it.rarity || 1)}</small>${pills}${hint}`));
    }
    p.append(grid);
    const pr = c.progress(cat);
    p.append(h('h3', '', pr.got === pr.total ? `🏅 ${CATEGORY_NAMES[cat]} 도감 완성! (보상 ${COMPLETE_REWARD[cat]}🪙 지급됨)` : `모두 모으면 보상 ${COMPLETE_REWARD[cat]}🪙 · 힌트: ${cat === 'fish' ? '계절마다 잘 잡히는 물고기가 달라요 · 비 오는 날·밤에 희귀한 물고기 · 남서쪽 낚시터에만 사는 물고기도 있어요' : cat === 'bug' ? '반딧불이·매미는 여름 밤낮에, 고추잠자리·귀뚜라미는 가을에 · 나무를 흔들면 풍뎅이' : '복숭아는 여름, 사과·배·감은 가을 (겨울엔 홍시) · 나무는 하루 한 번'}`));
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
