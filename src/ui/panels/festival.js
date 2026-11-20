// 🎪 축제 마당 창: 절기 이야기 · 축제 놀이 · 축제 음식 · 엽전 장터 (한정 꾸미기 + 한복)
import { h } from '../dom.js';
import { josa } from '../../game/sim/josa.js';
import { ITEMS } from '../../game/sim/items.js';
import { ACT_TOKEN_CAP, SALE_TOKEN_CAP, SALE_COINS, festState } from '../../game/sim/festival.js';
import { COSTUME } from '../../game/sim/costume.js';
import * as D from '../../game/sim/decor.js';

/**
 * 축제 한정 꾸미기 (엽전으로 바꿈): 모델은 festival_view 가 만들어 등록 (풍년 허수아비는 있는 허수아비 모델)
 * 모듈을 읽을 때 꾸미기 표에 넣음 → main.js 가 Game 을 만들기 전에 읽으므로, 놓아 둔 축제 소품이 불러오기에서 지워지지 않음
 * 꾸미기 창 탭(cat 'fest')에는 안 나오고 이 창에서만 바꿈 (코인으로는 못 삼)
 */
export const FEST_DECOR = [
  { id: 'fest_lantern', name: '연등', icon: '🏮', tokens: 6, model: 'fest_lantern', scale: 1, r: 0.3 },
  { id: 'fest_azalea', name: '진달래 화분', icon: '🌺', tokens: 5, model: 'fest_azalea', scale: 1, r: 0.4 },
  { id: 'fest_kite', name: '방패연 장대', icon: '🪁', tokens: 6, model: 'fest_kite', scale: 1, r: 0.2 },
  { id: 'fest_scarecrow', name: '풍년 허수아비', icon: '🌾', tokens: 8, model: 'scarecrow', scale: 1.15, r: 0.4 },
  { id: 'fest_snowman', name: '눈사람', icon: '⛄', tokens: 6, model: 'fest_snowman', scale: 1, r: 0.5 },
].map((d) => ({ price: 0, lv: 1, cat: 'fest', ...d }));
export const FEST_DECOR_BY_ID = Object.fromEntries(FEST_DECOR.map((d) => [d.id, d]));

// 꾸미기 표에 넣기 (registerDecor 가 있으면 그것으로, 없으면 표에 바로)
const register = D['registerDecor'] || ((d) => { if (D.DECOR_BY_ID[d.id]) return; D.DECOR.push(d); D.DECOR_BY_ID[d.id] = d; });
for (const d of FEST_DECOR) if (!D.DECOR_BY_ID[d.id]) register(d);

/** 엽전으로만 바꾸는 소품은 보관함에 있을 때만 놓을 수 있음 (값 0 이라 그냥 두면 끝없이 공짜로 놓임) */
export const TOKEN_ONLY_WHY = '축제 장터에서 엽전으로 바꿔요';
const P = D.DecorSim?.prototype;
if (P && !P.whyNot.festGuard) {
  const base = P.whyNot;
  P.whyNot = function whyNot(id, ctx) {
    const why = base.call(this, id, ctx);
    if (why || this.storedOf(id) > 0) return why;
    return D.DECOR_BY_ID[id]?.tokens ? TOKEN_ONLY_WHY : null;
  };
  P.whyNot.festGuard = true;
}

/** 엽전 그림 (가운데 네모 구멍 난 둥근 동전, css/festival.css) — 글자만 쓰는 알림은 ITEMS.fest_token.emoji */
export const FEST_COIN = '<i class="fest-coin" aria-hidden="true"></i>';

/** 꾸미기 보관함에 하나 넣기 (보관함 것은 놓을 때 무료) */
function store(sim, id) {
  if (typeof sim.store === 'function') return sim.store(id, 1);
  sim.stored[id] = sim.storedOf(id) + 1; // DecorSim 에 넣기 메서드가 생기면 위로 감
  return true;
}

/** 축제 마당 창 열기 (view = FestivalView) */
export function openFestival(g, view) {
  const f = view.cur, ui = g.ui, eco = g.economy;
  if (!f) return null;
  const p = ui.openPanel(`${f.icon} ${f.name.replace(/^\S+\s/, '')} 마당`);
  p.classList.add('festival');
  p.dataset.kind = 'festival';
  p.dataset.season = f.id;
  const st = festState(g.flags?.fest, f.key);
  const tokens = eco.count('fest_token');
  p.append(h('p', 'fest-desc', f.desc));
  p.append(h('div', 'fest-fact', `<b>📜 절기 이야기</b><span>${f.fact}</span>`));
  // 엽전 지갑 + 받는 법
  p.append(h('div', 'fest-purse', `<span class="fp-n">${FEST_COIN} <b>${tokens}</b> 엽전</span><small>놀이 ${st.act}/${ACT_TOKEN_CAP} · ${eco.festival ? `판매 ${st.saleTok}/${SALE_TOKEN_CAP} (${SALE_COINS}🪙 팔 때마다 1개)` : '판매 보너스는 축제 날 낮에만'}</small>`));
  // 놀이
  const play = h('button', 'gold fest-play', `▶ ${f.skin.title} <small>별만큼 엽전</small>`);
  play.onclick = () => view.play();
  p.append(play);
  // 축제 음식
  const food = ITEMS[f.food];
  p.append(h('div', 'fest-food', st.food ? `<span class="ff-ic">${food.emoji}</span> 오늘의 축제 음식 <b>${food.name}</b> · 받았어요 ✅` : `<span class="ff-ic">${food.emoji}</span> 오늘의 축제 음식 <b>${food.name}</b> · 마당에 모인 주민에게 말을 걸면 나눠 줘요`));
  // 엽전 장터: 이번 축제 한정 꾸미기 + 이미 가진 축제 소품 놓기
  p.append(h('h3', '', `🎪 축제 장터 <small>(${FEST_COIN} 엽전으로 바꿔요)</small>`));
  const rows = h('div', 'rows');
  const sim = g.decor?.sim;
  const owned = FEST_DECOR.filter((d) => (sim?.storedOf(d.id) || 0) > 0 && !f.stall.includes(d.id));
  for (const d of [...f.stall.map((id) => FEST_DECOR_BY_ID[id]).filter(Boolean), ...owned]) {
    const inStall = f.stall.includes(d.id), have = sim?.storedOf(d.id) || 0;
    const r = h('div', 'row fest-row', `<span class="ic">${d.icon}</span><span class="nm">${d.name}${inStall ? ' <span class="qty">이번 축제 한정</span>' : ''}${have ? `<br><small>🧺 보관함 ${have}개</small>` : ''}</span><span class="pr">${inStall ? `${FEST_COIN} ${d.tokens}` : ''}</span>`);
    if (inStall) {
      const b = h('button', '', '바꾸기');
      b.disabled = tokens < d.tokens || !sim;
      if (tokens < d.tokens) b.setAttribute('aria-label', `${d.name} 바꾸기 (엽전 ${d.tokens - tokens}개 모자라요)`);
      b.onclick = () => {
        if (!eco.useItem('fest_token', d.tokens)) { ui.toast(`엽전이 ${d.tokens - eco.count('fest_token')}개 모자라요`, { sfx: 'deny' }); return; }
        store(sim, d.id);
        g.audio.play('sale');
        ui.toast(`${d.icon} ${d.name}${josa(d.name, '을/를')} 받았어요! 보관함에 넣어 뒀어요 · '놓기'로 농장에 꾸며 보세요`);
        g.onEvent?.('festbuy', 1, d.id);
        openFestival(g, view);
      };
      r.append(b);
    }
    if (have > 0 && g.decor?.start) {
      const pl = h('button', 'ghost', '🪑 놓기');
      pl.onclick = () => { ui.closePanel(); g.decor.start(d.id); };
      r.append(pl);
    }
    rows.append(r);
  }
  // 축제 한복 (코인, 축제 마당이 열린 동안)
  const cs = g.costume, hb = COSTUME.hanbok;
  if (cs && hb && !cs.has('hanbok')) {
    const why = cs.whyNotBuy('hanbok', { money: eco.money, level: g.quests?.level ?? 99, festival: true });
    const r = h('div', 'row fest-row', `<span class="ic">${hb.icon}</span><span class="nm">${hb.name} <span class="qty">축제 때만</span><br><small>✨ ${hb.perkText}</small></span><span class="pr">${hb.price}🪙</span>`);
    const b = h('button', '', '사기');
    b.disabled = !!why;
    if (why) b.setAttribute('aria-label', `${hb.name} 사기 (${why})`);
    b.onclick = () => {
      const cost = cs.buy('hanbok', { money: eco.money, level: g.quests?.level ?? 99, festival: true });
      if (!cost || !eco.spend(cost)) return;
      cs.wear('hanbok'); g.applyLook?.();
      g.audio.play('sale');
      ui.toast(`${hb.icon} ${hb.name}${josa(hb.name, '을/를')} 샀어요! 바로 입었어요 · ${hb.perkText}`);
      g.onEvent?.('costume', cs.owned.size);
      openFestival(g, view);
    };
    r.append(b);
    rows.append(r);
  }
  p.append(rows);
  return p;
}
