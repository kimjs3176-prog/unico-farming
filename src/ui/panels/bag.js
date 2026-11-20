// 가방·도감·씨앗 고르기 창
import { h } from '../dom.js';
import { josa } from '../../game/sim/josa.js';
import { CROPS, PRODUCTS } from '../../game/sim/crops.js';
import { ITEMS, CATEGORY_NAMES, inSeason, seasonOnly } from '../../game/sim/items.js';
import { seasonOf, SEASON } from '../../game/sim/season.js';
import { BOOK_CATS_3D, COMPLETE_REWARD, listOf, milestoneReward } from '../../game/sim/collection.js';
import { DECOR_BY_ID } from '../../game/sim/decor.js';
import { ItemIconUI } from '../item_icons.js';

/** 도감 못 만난 칸 힌트: '여름 밤 풀숲', '봄 연못' 처럼 계절·때·곳 */
export function bookHint(it) {
  const when = (it.seasons || []).map((x) => SEASON[x]?.name).filter(Boolean).join('·');
  const time = it.night ? ' 밤' : it.rain ? ' 비 오는 날' : it.cold ? ' 추운 날' : '';
  const where = it.cat === 'fish' ? (it.where === 'pond' ? '연못' : it.where === 'lake' ? '낚시터 호수' : '연못·호수')
    : it.cat === 'bug' ? (it.ground ? '풀숲' : '꽃밭') : it.cat === 'fruit' ? '과수원' : '';
  return `${when}${time} ${where}`.trim();
}

/** 어디서 나는지 (가방 칸 설명·출하 도감 힌트) */
export function sourceOf(key) {
  if (key === 'feed') return '장터에서 사요 · 목장 동물 밥';
  if (key.startsWith('seed:')) return '장터 🌱 사기 탭 · 밭에 심어요';
  if (CROPS[key]) return '밭에서 길러 수확해요';
  if (PRODUCTS[key]) return '목장 동물이 매일 줘요';
  const it = ITEMS[key];
  if (!it) return '';
  if (key.startsWith('fest_')) return key === 'fest_token' ? '축제 놀이에서 받아요 · 축제 장터에서 써요' : '축제 날 주민이 나눠 줘요';
  if (key.startsWith('rice_') && key !== 'rice_seed') return '논 벼 탈곡 · 잘 돌볼수록 ★';
  const SRC = {
    rice_seed: '장터에서 사요 · 논에 모내기', paddy: '논에서 거둬요 · 방앗간에서 탈곡', bait: '낚시 가게에서 사요 · 입질이 빨라져요',
    compost: '퇴비통에서 만들거나 장터에서 사요', weed: '밭 김매기에서 나와요 · 퇴비 재료', pet_treat: '장터에서 사요 · 콩이 간식',
    clam: '호수에서 잠수해 주워요', pearl: '호수 깊은 곳 조개 속 보물',
  };
  if (SRC[key]) return SRC[key];
  if (it.cat === 'goods') return /cheese|yarn|castella|yogurt|butter|scarf/.test(key) ? '목장 공방에서 만들어요' : '장독대에서 담가요';
  if (it.cat === 'ranch') return '♥4 이상인 동물이 가끔 줘요';
  if (it.cat === 'fish') return `낚시 · ${bookHint(it) || '연못·호수'}`;
  if (it.cat === 'bug') return `곤충채 · ${bookHint(it) || '꽃밭·풀숲'}`;
  if (it.cat === 'fruit') return `과일나무 흔들기 · ${bookHint(it) || '과수원'}`;
  return '';
}

/** 출하 도감 못 만난 칸 힌트 (짧게) */
export function shipHint(key) {
  if (CROPS[key]) return `밭 · Lv.${CROPS[key].unlockLevel} 씨앗`;
  if (/^rice_\d$/.test(key)) return `★${key.slice(5)} 쌀 출하`;
  const it = ITEMS[key];
  if (it?.cat === 'ranch') return '♥4 동물이 가끔';
  if (it?.cat === 'goods') return /cheese|yarn|castella|yogurt|butter|scarf/.test(key) ? '목장 공방 가공' : '장독대 가공';
  return '';
}

/** 가방 칸 묶음: 씨앗 / 작물·생산물 / 수집품 / 기타 */
const BAG_SECTION = { seed: 'seed', crop: 'crop', product: 'crop', rice: 'crop', goods: 'crop', ranch: 'crop', fish: 'col', bug: 'col', fruit: 'col', treasure: 'col' };
const SECTIONS = [['seed', '🌱 씨앗'], ['crop', '🧺 작물·생산물'], ['col', '🐟 수집품'], ['etc', '🎒 기타']];
const ETC_SEED = new Set(['bait', 'compost', 'weed', 'pet_treat', 'fest_token']); // cat 'seed' 이지만 씨앗이 아닌 소모품

/** 가방 속 모든 칸: [열쇠, 개수, 묶음, 분류] */
function bagEntries(eco) {
  const out = [];
  for (const [k, n] of Object.entries(eco.inventory.seeds)) if (n > 0 && CROPS[k]) out.push([`seed:${k}`, n, 'seed', 'seed']);
  for (const [k, n] of Object.entries(eco.inventory.crops)) if (n > 0 && CROPS[k]) out.push([k, n, 'crop', 'crop']);
  for (const [k, n] of Object.entries(eco.inventory.products)) if (n > 0 && PRODUCTS[k]) out.push([k, n, 'crop', 'product']);
  if (eco.inventory.feed > 0) out.push(['feed', eco.inventory.feed, 'etc', 'feed']);
  for (const [k, n] of Object.entries(eco.inventory.items)) {
    const it = ITEMS[k];
    if (!(n > 0) || !it) continue;
    const sec = ETC_SEED.has(k) ? 'etc' : BAG_SECTION[it.cat] || 'etc';
    out.push([k, n, sec, it.cat]);
  }
  return out;
}

const nameOf = (key) => (key === 'feed' ? '동물 사료' : key.startsWith('seed:') ? `${CROPS[key.slice(5)].name} 씨앗` : CROPS[key]?.name ?? PRODUCTS[key]?.name ?? ITEMS[key]?.name ?? key);
/** 품질·희귀 점: 쌀은 ★ 등급, 물고기·곤충은 희귀도 (2 이상만) */
const pipOf = (key) => {
  const g = /^rice_(\d)$/.exec(key);
  if (g) return { n: +g[1], cls: 'q' };
  const r = ITEMS[key]?.rarity || 0;
  return r >= 2 ? { n: r, cls: `r${Math.min(4, r)}` } : null;
};

/** 가방·도감·씨앗 창 메서드 (UI.prototype 에 합쳐짐) */
export const BagPanel = {
  ...ItemIconUI,

  openBook(cat = 'fish') {
    const g = this.game, c = g.collection;
    const p = this.openPanel('📖 유니코 도감');
    p.classList.add('book');
    p.dataset.kind = 'book'; p.dataset.cat = cat; // 보상을 받은 뒤 다시 그리기 (refreshBook)
    // 아직 못 받은 이정표·완성 보상이 있으면 지금 받음 (보상 카드는 창을 닫은 뒤) → 아래 머리글은 받은 뒤 상태로 그림
    if (BOOK_CATS_3D.some((k) => c.nextMilestone?.(k)?.left === 0) || c.completed?.().some((k) => !c.rewarded[k])) {
      this._bookDrawing = true;
      try { g.afterCollect?.(); } finally { this._bookDrawing = false; }
    }
    const tabs = h('div', 'book-tabs');
    for (const k of BOOK_CATS_3D) {
      const pr = c.progress(k);
      const t = h('button', k === cat ? 'on' : 'ghost', `<b>${CATEGORY_NAMES[k]}${pr.got === pr.total ? ' 🏅' : ''}</b><small class="nw">${pr.got}/${pr.total}</small>`);
      t.setAttribute('aria-pressed', String(k === cat));
      t.onclick = () => this.openBook(k);
      tabs.append(t);
    }
    p.append(tabs);
    const list = listOf(cat), pr = c.progress(cat);
    // 진행 막대 + 다음 보상까지
    const nx = c.nextMilestone?.(cat);
    const nxText = pr.got === pr.total ? `🏅 완성! 보상 ${COMPLETE_REWARD[cat].toLocaleString()}🪙 받음 · 트로피는 집 책상 위 선반에`
      : nx ? `${nx.left ? `다음 보상까지 <b>${nx.left}종</b>` : '<b>보상 받을 차례!</b>'} <small>(${nx.at}종: ${giftText(milestoneReward(cat, nx.at))})</small>`
        : `다 모으면 <b>${COMPLETE_REWARD[cat].toLocaleString()}🪙</b> + 트로피`;
    p.append(h('div', 'book-prog', `<div class="bp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.total}" aria-valuenow="${pr.got}" aria-label="${CATEGORY_NAMES[cat]} 도감 ${pr.got}/${pr.total}"><i style="width:${pr.total ? (pr.got / pr.total) * 100 : 0}%"></i></div><span>${nxText}</span>`));
    const now = seasonOf(g.world.day ?? 1);
    if (cat !== 'ship') {
      // 지금 계절: 제철인데 아직 못 모은 것 수 (철이 지나면 잘 안 나오니 지금 모으기)
      const inNow = list.filter((k) => ITEMS[k].seasons?.includes(now.id)), left = inNow.filter((k) => !c.entries[k]).length;
      const note = !inNow.length ? `${now.name}엔 제철 ${CATEGORY_NAMES[cat]}${josa(CATEGORY_NAMES[cat], '이/가')} 없어요 · 사철 나는 것과 드문 것만 가끔 보여요`
        : left ? `제철인데 아직 못 만난 ${CATEGORY_NAMES[cat]} <b>${left}종</b> · ⏳ 표시는 이 계절에만 나와요` : '이 계절 제철은 다 모았어요! 🎉';
      p.append(h('div', 'book-season', `<span class="bs-chip">${now.icon} 지금은 ${now.name}</span><span>${note}</span>`));
    } else p.append(h('div', 'book-season', '<span class="bs-chip">📦 출하</span><span>장터에서 팔거나 주문서에 납품하면 채워져요</span>'));
    const grid = h('div', 'book-grid');
    grid.dataset.icoSet = '';
    const baked = this.itemIconsBaked(list);
    for (const k of list) {
      const it = ITEMS[k] || CROPS[k] || {}, e = c.entries[k];
      const ic = `<span class="bk-ic">${this.itemIcon(k, { size: 40, locked: !e, baked })}</span>`;
      if (cat === 'ship') {
        // 쌀은 등급마다 칸이 따로 → 못 만난 칸에도 ★ 등급, 그림은 등급 색 빛 (t-N)
        const tier = /^rice_(\d)$/.exec(k)?.[1];
        const tierTx = tier ? `<small class="bk-tier" aria-label="${tier}등급">${'★'.repeat(+tier)}</small>` : '';
        grid.append(h('div', `book-cell${e ? '' : ' locked'}${tier ? ` t-${tier}` : ''}`, e
          ? `${ic}<b>${nameOf(k)}</b><small>출하 ${e.count.toLocaleString()}개</small>`
          : `${ic}<b>???</b>${tierTx}<small class="bk-hint">${tier ? '논 → 탈곡' : shipHint(k)}</small>`));
        continue;
      }
      // 계절 알약: 계절마다 색 (지금 계절은 진하게, 나머지는 흐리게), 한 계절에만 나오면 ⏳ · 못 만난 칸엔 어디서 찾는지 힌트
      const on = !!(it.seasons && inSeason(k, now.id)), only = on && seasonOnly(k);
      const pills = it.seasons ? `<span class="bk-pills">${it.seasons.map((x) => `<span class="bk-pill s-${x}${x === now.id ? ' now' : ''}">${only && x === now.id ? '⏳ ' : ''}${SEASON[x].name}</span>`).join('')}</span>` : '';
      const hint = !e ? `<small class="bk-hint">${bookHint(it) || (it.legend ? '전설 · 아주 드물게' : it.cat === 'fish' ? '연못·호수 어디서나' : '어디서나')}</small>` : '';
      const stars = `<small class="bk-stars" aria-label="희귀도 ${it.rarity || 1}">${'⭐'.repeat(it.rarity || 1)}</small>`;
      grid.append(h('div', `book-cell${e ? '' : ' locked'}${on ? ' in-season' : it.seasons ? ' off-season' : ''}`, e
        ? `${ic}<b>${it.name}</b><small>${e.count}${cat === 'fish' ? '마리' : cat === 'bug' ? '마리' : '개'}${e.best ? ` · 최대 ${e.best}cm` : ''}</small>${stars}${pills}`
        : `${ic}<b>???</b>${stars}${pills}${hint}`));
    }
    p.append(grid);
    const tip = cat === 'fish' ? '계절마다 잘 잡히는 물고기가 달라요 · 비 오는 날·밤에 희귀한 물고기 · 남서쪽 낚시터에만 사는 물고기도 있어요'
      : cat === 'bug' ? '반딧불이·매미는 여름 밤낮에, 고추잠자리·귀뚜라미는 가을에 · 나무를 흔들면 풍뎅이'
        : cat === 'fruit' ? '복숭아는 여름, 사과·배·감은 가을 (겨울엔 홍시) · 나무는 하루 한 번'
          : '쌀은 등급마다 따로 · 가공품은 장독대와 목장 공방에서 · 황금 생산물은 ♥4 이상 동물이 가끔';
    p.append(h('p', 'mk-note', `💡 ${tip}`));
  },

  /** 열린 도감 창 다시 그리기 (보상을 받은 뒤 머리글 '다음 보상까지'를 맞춤). openBook 이 그리는 중이면 그대로 */
  refreshBook() {
    const p = this.panel;
    if (p?.dataset.kind === 'book' && !this._bookDrawing) this.openBook(p.dataset.cat || 'fish');
  },

  /**
   * 도감 보상 카드 하나: 받은 것 한 줄씩(그림 + 이름), 새 칭호는 작은 배지, 확인 하나
   * card: { head, rows: [{ ic: 그림 HTML, t: 글 HTML }], titles: [{ icon, name }], quests: [글] }
   */
  bookRewardCard({ head, rows = [], titles = [], quests = [] }) {
    const p = this.openPanel(head);
    p.dataset.kind = 'result'; // 오토플레이 중에는 잠시 보여 준 뒤 자동으로 닫음
    p.classList.add('book-reward');
    p.append(h('div', 'br-rows', rows.map((r) => `<div class="br-row"><span class="br-ic" aria-hidden="true">${r.ic}</span><span class="br-tx">${r.t}</span></div>`).join('')));
    if (titles.length) {
      p.append(h('div', 'br-titles', `<span class="br-lb">🏅 새 칭호</span>${titles.map((t) => `<span class="br-pill">${t.icon} ${t.name}</span>`).join('')}<small>집 옷장의 🏅 칭호 탭에서 달 수 있어요</small>`));
    }
    if (quests.length) p.append(h('p', 'mk-note br-quests', quests.join('<br>')));
    const b = h('button', 'gold br-ok', '확인');
    b.onclick = () => this.closePanel();
    p.append(b);
    return p;
  },

  openInventory() {
    const g = this.game, eco = g.economy;
    const p = this.openPanel('🎒 가방');
    p.classList.add('bag');
    const all = bagEntries(eco);
    const baked = this.itemIconsBaked(all.map(([k]) => k));
    const detail = h('div', 'bag-detail');
    detail.setAttribute('aria-live', 'polite');
    let picked = null;
    const show = (key, n, btn) => {
      if (picked) picked.classList.remove('on');
      picked = btn; btn.classList.add('on');
      const sellable = !key.startsWith('seed:') && key !== 'feed' && key !== 'paddy' && ITEMS[key]?.cat !== 'seed';
      const price = sellable ? eco.sellPrice(key) : 0;
      detail.innerHTML = `<span class="bd-ic">${this.itemIcon(key, { size: 44 })}</span><span class="bd-tx"><b>${nameOf(key)} <span class="qty">×${n.toLocaleString()}</span></b>`
        + `<small>${sellable ? `💰 오늘 ${price.toLocaleString()}🪙에 팔려요` : useText(key)}</small><small>📍 ${sourceOf(key)}</small></span>`;
      detail.classList.add('show');
    };
    if (!all.length) {
      p.append(h('div', 'bag-empty', '<span class="be-ic" aria-hidden="true">🧺</span><b>가방이 비었어요</b><small>밭에서 수확하거나 낚시·곤충 잡기로 채워 보세요!</small>'));
    }
    // 설명 카드는 맨 위 (폰에서 칸을 눌러도 화면 안에 보이게)
    if (all.length) { detail.innerHTML = '<small>칸을 누르면 이름·값·나는 곳을 보여 줘요</small>'; p.append(detail); }
    for (const [sec, title] of SECTIONS) {
      const items = all.filter((x) => x[2] === sec);
      if (!items.length) continue;
      p.append(h('h3', 'bag-h', `${title} <small>${items.length}칸</small>`));
      const grid = h('div', 'seed-grid bag-grid');
      grid.dataset.icoSet = '';
      for (const [key, n, , cat] of items) { // sec: 이 묶음
        const pip = pipOf(key);
        const b = h('button', `bag-slot c-${cat}${sec === 'seed' ? ' packet' : ''}`,
          `${this.itemIcon(key, { size: 34, baked })}<span class="nm" aria-hidden="true">${nameOf(key)}</span><span class="n">${n > 999 ? '999+' : n}</span>${pip ? `<span class="pip ${pip.cls}" aria-hidden="true">${'★'.repeat(Math.min(5, pip.n))}</span>` : ''}`);
        b.setAttribute('aria-label', `${nameOf(key)} ${n}개`);
        b.dataset.name = nameOf(key); // PC: 마우스를 올리면 이름 말풍선 (CSS)
        b.onclick = () => show(key, n, b);
        grid.append(b);
      }
      p.append(grid);
    }
    const c = g.collection;
    p.append(h('p', 'mk-note bag-foot', `🥕 밭농사 Lv.${g.farm.sim.level} · 🌾 논농사 Lv.${g.rice.sim.skillLevel} · 📖 도감 ${BOOK_CATS_3D.map((k) => { const pr = c.progress(k); return `${CATEGORY_NAMES[k]} ${pr.got}/${pr.total}`; }).join(' · ')}`));
    const s = eco.stats;
    p.append(h('p', 'mk-note bag-foot', `누적 수입 ${s.earned.toLocaleString()}🪙 · 지출 ${s.spent.toLocaleString()}🪙 · 판매 ${s.sold.toLocaleString()}개`));
  },

  openSeedPicker(onPick, { fert = 0 } = {}) {
    const g = this.game, eco = g.economy;
    const p = this.openPanel('🌱 어떤 씨앗을 심을까요?');
    let useFert = fert > 0;
    if (fert > 0) {
      const tg = h('label', 'row', `<span>${this.itemIcon('compost', { size: 22 })}</span><span class="nm">퇴비도 함께 주기 <span class="qty">보유 ${fert}</span><br><small>30% 빨리 자라고 품질 ↑</small></span>`);
      const cb = h('input'); cb.type = 'checkbox'; cb.checked = true; cb.onchange = () => { useFert = cb.checked; };
      tg.append(cb);
      const wrap = h('div', 'rows'); wrap.append(tg); p.append(wrap);
    }
    const grid = h('div', 'seed-grid');
    grid.dataset.icoSet = '';
    const keys = Object.keys(CROPS).filter((k) => eco.inventory.seeds[k] > 0);
    const baked = this.itemIconsBaked(keys);
    for (const k of keys) {
      const c = CROPS[k], n = eco.inventory.seeds[k];
      const b = h('button', 'seed-pick', `<span class="packet">${this.itemIcon(k, { size: 28, baked })}</span> ${c.name}<span class="q">${n}개 · ${c.growTime}초 · ${c.basePrice}🪙</span>`);
      b.onclick = () => { this.closePanel(); onPick(k, useFert); };
      grid.append(b);
    }
    p.append(grid);
  },
};

/** 팔지 않는 물건의 쓰임 (가방 설명 카드): 씨앗은 자라는 시간·장터 값 */
export function useText(key) {
  if (key.startsWith('seed:')) {
    const c = CROPS[key.slice(5)];
    return c ? `🌱 심으면 ${c.growTime}초 뒤 수확 · 장터 씨앗 ${c.seedPrice}🪙` : '🌱 밭에 심어요';
  }
  const USE = {
    feed: '🐄 목장 동물에게 하루 한 번', paddy: '🌾 방앗간에서 탈곡하면 쌀', rice_seed: '🌱 논에 모내기 · 볍씨', bait: '🎣 낚시할 때 저절로 써요',
    compost: '🌱 심을 때 같이 주면 빨리 자라요', weed: '♻️ 퇴비통에 넣어요', pet_treat: '🐶 콩이에게 주면 좋아해요', fest_token: '🎉 축제 장터에서 써요',
  };
  return USE[key] || '🎁 모아 두는 물건';
}

/** 이정표 선물 글: '🪱 떡밥 5개' · '🪣 양동이' */
export function giftText(r) {
  if (!r) return '';
  if (r.decor) { const d = DECOR_BY_ID[r.decor]; return d ? `${d.icon} ${d.name}` : r.decor; }
  return Object.entries(r.item || {}).map(([k, n]) => `${ITEMS[k]?.emoji ?? ''} ${ITEMS[k]?.name ?? k} ${n}개`).join(' · ');
}
