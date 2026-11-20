// 장터 창: 사기·팔기·의상·시설 탭
import { h } from '../dom.js';
import { josa } from '../../game/sim/josa.js';
import { COSTUMES } from '../../game/sim/costume.js';
import { CROPS, PRODUCTS, FEED_PRICE } from '../../game/sim/crops.js';
import { ITEMS } from '../../game/sim/items.js';
import { reward, BUY_SOUND } from '../../game/reward.js';
import { DECOR_BY_ID } from '../../game/sim/decor.js';
import { COSTUME } from '../../game/sim/costume.js';
import { todaySpecial, untilNextShelf, shelfTint } from '../../game/sim/shelf.js';

/** 설명 줄: 짧은 마디는 한 덩어리(줄바꿈은 마디 사이에서만) → '판매 42🪙' 가 쪼개지지 않음 */
const meta = (segs) => {
  const list = (Array.isArray(segs) ? segs : [segs]).filter(Boolean);
  if (!list.length) return '';
  // 짧은 마디(값·시간·'판매 42🪙')만 한 덩어리로 묶음 — 긴 설명 문장은 낱말 사이에서 줄바꿈
  return `<span class="meta">${list.map((t) => `<span${t.replace(/<[^>]*>/g, '').length <= 16 ? ' class="nw"' : ''}>${t}</span>`).join(' · ')}</span>`;
};
/** 잠긴 단추 글: 'Lv.3 해금' → 좁은 줄에서는 '🔒 Lv.3' 만 (뒷말은 .lk-x 로 숨김) */
const lockHtml = (t) => { const m = /^(Lv\.\d+)( 해금)$/.exec(t); return m ? `🔒 ${m[1]}<span class="lk-x">${m[2]}</span>` : `🔒 ${t}`; };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 장터 창 메서드 (UI.prototype 에 합쳐짐) */
export const MarketPanel = {
  /**
   * 장터: 탭 5개 (🌱 사기 · 💰 팔기 · ✨ 오늘 · 👗 의상 · 🛠️ 시설) — 제목·닫기·보유 코인·탭은 위에 고정, 팔기 탭은 '모두 판매' 막대가 아래에 고정
   * 팔기 탭은 가진 것만 먼저 보여 주고, '시세 전체 보기'로 오늘 시세를 모두 확인
   */
  openMarket(tab) {
    const g = this.game, eco = g.economy;
    const p = this.openPanel('🛒 농산물 장터');
    p.classList.add('market');
    this.marketTab = tab || this.marketTab || 'buy';
    const top = h('div', 'mk-top');
    p.append(top);
    const body = h('div', 'mk-body');
    p.append(body);
    const foot = h('div', 'mk-foot');
    p.append(foot);
    const TABS = [['buy', '🌱 사기'], ['sell', '💰 팔기'], ['today', '✨ 오늘'], ['cos', '👗 의상'], ['fac', '🛠️ 시설']];
    this._mkQty = new Map(); // 줄마다 지난번 개수 → 바뀐 줄만 숫자가 톡 (처음 열 때는 비교하지 않음)
    const saveSoon = () => { g.saveTimer = Math.max(g.saveTimer || 0, 9); }; // 사고판 뒤 1초 안에 저장 (연달아 눌러도 한 번만)
    const sellables = () => {
      const list = [];
      for (const [k, c] of Object.entries({ ...CROPS, ...PRODUCTS })) list.push([k, c]);
      for (const [k, n] of Object.entries(eco.inventory.items)) if (n > 0 && ITEMS[k] && ITEMS[k].cat !== 'seed' && k !== 'paddy') list.push([k, ITEMS[k]]);
      return list;
    };
    const ownedValue = () => sellables().reduce((a, [k]) => a + eco.count(k) * eco.sellPrice(k), 0);
    // 줄 모양: 그림 · 이름(보유) · 값 / 설명 줄 · 단추 (좁은 목록에서는 두 줄 격자, css/market.css)
    const row = (cls, key, have, ic, nm, pr, metaHtml = '') => {
      const r = h('div', `row mk-row ${cls}`.trim(), `<span class="ic">${ic}</span><span class="nm">${nm}</span><span class="pr">${pr}</span>${metaHtml}<span class="btns"></span>`);
      if (key) { r.dataset.k = key; r.dataset.have = have; }
      return r;
    };
    const btnsOf = (r) => r.querySelector('.btns');
    const buyRow = (key, emoji, name, have, price, opts, note = '', locked = '') => {
      const r = row('', key, have, emoji, `${name} <span class="qty">보유 ${have}</span>`, `${price}🪙`, meta(note));
      if (locked) { const bt = h('button', 'locked', lockHtml(locked)); bt.disabled = true; btnsOf(r).append(bt); return r; }
      for (const [n, fn] of opts) {
        const bt = h('button', '', `${n}개`);
        bt.disabled = eco.money < price * n;
        bt.onclick = () => { if (fn(n)) { g.audio.play(BUY_SOUND); saveSoon(); render(); } };
        btnsOf(r).append(bt);
      }
      return r;
    };
    // 판 순간: 금액에 따라 다른 소리 · 누른 단추 한가운데 '+N🪙' 알약 · 코인이 장터 위쪽 숫자로 날아감 (닿을 때마다 숫자가 오름)
    // 알림 장은 장터를 닫은 뒤에만 (장터 안에서는 창 위의 +N 이 그 몫)
    const gain = (got, rect) => {
      const p0 = this.panel;
      if (!p0?.classList.contains('market')) return;
      const pr = p0.getBoundingClientRect(), z = pr.width / (p0.offsetWidth || pr.width) || 1;
      const f = h('div', 'mk-gain', `+${got.toLocaleString()}🪙`);
      const cx = (rect.left + rect.width / 2 - pr.left) / z, w0 = p0.offsetWidth || pr.width / z;
      f.style.left = `${Math.max(56, Math.min(w0 - 56, cx))}px`; f.style.top = `${(rect.top + rect.height / 2 - pr.top) / z}px`; // 누른 단추 한가운데
      p0.append(f);
      f.addEventListener('animationend', () => f.remove());
      setTimeout(() => f.remove(), 1400);
    };
    const sold = (got, btn, all = false) => {
      if (!(got > 0)) return;
      g.audio.play('sale', 1, all ? { all: true, amount: got } : { amount: got });
      const rect = btn.getBoundingClientRect();
      gain(got, rect);
      const note = () => { if (this.panel?.classList.contains('market')) return; this.toast(`💰 +${got} 코인`, { type: 'reward', key: 'sell', amount: got, fmt: ({ amount }) => `💰 판매 +${amount.toLocaleString()} 코인` }); };
      if (this.flyToCoin && !reduced()) this.flyToCoin(got, rect, note); else note();
    };
    // 줄이 사라지는 판매(가진 것만 보기에서 전부 팔기): 줄이 접힌 뒤 다시 그림
    const soldOut = (rows) => {
      for (const r of rows) r.classList.add('sold');
      const p0 = this.panel;
      setTimeout(() => { if (body.isConnected && this.panel === p0 && this.marketTab === 'sell') render(); }, 290); // 0.12초 흐려짐 + 0.16초 접힘 뒤
    };
    const render = () => {
      const scroll = body.scrollTop;
      const cur = this.marketTab;
      top.innerHTML = '';
      const coin = h('div', 'mk-coin', `🪙 <b class="money">${Math.max(0, eco.money - (this.coinHold || 0)).toLocaleString()}</b> 코인${eco.festival ? ` <span class="mk-ev fest">${/^\p{Extended_Pictographic}/u.test(eco.festival.name || '') ? '' : '🎉 '}${(eco.festival.name || '축제').split('!')[0]} · 모두 ${eco.festival.mult}배</span>` : ''}${eco.event ? ` <span class="mk-ev">🔥 ${eco.event.name}</span>` : ''}`);
      const tabs = h('div', 'mk-tabs');
      for (const [id, label] of TABS) {
        const n = id === 'sell' ? sellables().filter(([k]) => eco.count(k) > 0).length : 0;
        const t = h('button', cur === id ? 'on' : '', `${label}${n ? ` <i>${n}</i>` : ''}`);
        t.onclick = () => { if (this.marketTab === id) return; this.marketTab = id; g.audio.play('click', 0.5); body.scrollTop = 0; render(); };
        tabs.append(t);
      }
      top.append(coin, tabs);
      body.innerHTML = ''; foot.innerHTML = '';
      foot.style.display = 'none';
      if (cur === 'buy') {
        body.append(h('h3', '', '🌱 씨앗 (레벨이 오르면 해금)'));
        const seeds = h('div', 'rows');
        for (const [k, c] of Object.entries(CROPS)) {
          const locked = g.quests.level < c.unlockLevel ? `Lv.${c.unlockLevel} 해금` : '';
          const segs = [g.season?.cur?.crops.includes(k) ? `${g.season.cur.icon} 제철` : '', `${c.growTime}초`, `판매 ${c.basePrice}🪙`, c.regrow ? `${c.regrow}번 더 열림` : ''];
          seeds.append(buyRow(`seed:${k}`, c.emoji, `${c.name} 씨앗`, eco.inventory.seeds[k] || 0, c.seedPrice, [[1, (n) => eco.buySeed(k, n)], [5, (n) => eco.buySeed(k, n)]], segs, locked));
        }
        body.append(seeds);
        body.append(h('h3', '', '🧺 농장 용품'));
        const goods = h('div', 'rows');
        goods.append(buyRow('feed', '🌾', '동물 사료', eco.inventory.feed, FEED_PRICE, [[1, (n) => eco.buyFeed(n)], [5, (n) => eco.buyFeed(n)]], '목장 동물에게 주거나 여물통에 채워요'));
        const cp = ITEMS.compost;
        goods.append(buyRow('compost', cp.emoji, cp.name, eco.count('compost'), cp.price, [[1, (n) => eco.buyItem('compost', n)], [5, (n) => eco.buyItem('compost', n)]], '퇴비통에서 직접 만들 수도 있어요'));
        const rs = ITEMS.rice_seed;
        goods.append(buyRow('rice_seed', rs.emoji, rs.name, eco.count('rice_seed'), rs.price, [[1, (n) => eco.buyItem('rice_seed', n)], [3, (n) => eco.buyItem('rice_seed', n)]], '논에 모내기'));
        const pt = ITEMS.pet_treat;
        goods.append(buyRow('pet_treat', pt.emoji, pt.name, eco.count('pet_treat'), pt.price, [[1, (n) => eco.buyItem('pet_treat', n)], [3, (n) => eco.buyItem('pet_treat', n)]], '콩이가 좋아해요'));
        body.append(goods);
      } else if (cur === 'sell') {
        const all = !!this.marketAll;
        const head = h('div', 'mk-sellhead', `<span>📈 오늘의 시세 <small>매일 변동 · 🔥 수요 이벤트는 2배</small></span>`);
        const tg = h('button', 'ghost', all ? '가진 것만' : '시세 전체 보기');
        tg.onclick = () => { this.marketAll = !all; render(); };
        head.append(tg);
        body.append(head);
        const rows = h('div', 'rows');
        let shown = 0;
        for (const [k, c] of sellables()) {
          const have = eco.count(k);
          if (!all && have <= 0) continue;
          shown++;
          const tr = eco.prices[k]?.trend || 0;
          const trend = tr > 0 ? '<span class="trend-up">▲</span>' : tr < 0 ? '<span class="trend-down">▼</span>' : '<span class="trend-flat">–</span>';
          const ev = eco.event?.item === k ? ' 🔥' : '';
          const r = row(have ? '' : 'none', `sell:${k}`, have, c.emoji, `${c.name}${ev} <span class="qty">보유 ${have}</span>`, `${eco.sellPrice(k)}🪙 ${trend}`);
          if (have > 1) { const b1 = h('button', '', '1개'); b1.onclick = () => { const got = eco.sell(k, 1); g.onEvent('sell', 1); sold(got, b1); saveSoon(); render(); }; btnsOf(r).append(b1); }
          const b = h('button', 'gold', have > 1 ? `전부 ${(eco.sellPrice(k) * have).toLocaleString()}` : '판매');
          b.disabled = have <= 0;
          b.onclick = () => {
            const got = eco.sell(k, have); g.onEvent('sell', have); sold(got, b); saveSoon();
            if (!all && got > 0) soldOut([r]); else render();
          };
          btnsOf(r).append(b);
          rows.append(r);
        }
        if (!shown) rows.append(h('div', 'mk-empty', '🧺 팔 물건이 없어요. 밭과 목장에서 수확해 오세요!<br><small>‘시세 전체 보기’로 오늘 시세를 볼 수 있어요</small>'));
        body.append(rows);
        const total = ownedValue();
        if (total > 0) {
          foot.style.display = '';
          foot.append(h('span', 'mk-total', `가방 속 판매 가능 <b>${total.toLocaleString()}🪙</b>`));
          const ab = h('button', 'gold', '🧺 모두 판매하기');
          ab.onclick = () => {
            const n = sellables().reduce((a, [k]) => a + eco.count(k), 0); const got = eco.sellAll(); g.onEvent('sell', n); sold(got, ab, true); saveSoon();
            if (!all && got > 0) soldOut(rows.querySelectorAll('.mk-row')); else render();
          };
          foot.append(ab);
        }
      } else if (cur === 'today') {
        // ✨ 오늘의 특별 상품: 날마다 바뀌는 색 바꾼 한정 소품·옷 (sim/shelf.js) — 카드 3장, 바탕은 그 물건의 색
        const day = g.world?.day || 1, cs = g.costume, dsim = g.decor?.sim;
        const left = () => untilNextShelf(g.world?.time ?? 0);
        const head = h('div', 'mk-todayhead', `<span>✨ 오늘의 특별 상품</span><span class="mk-clock nw" title="자정에 새 상품으로 바뀌어요">⏰ 다음 상품까지 <b>${left()}</b></span>`);
        body.append(head);
        body.append(h('p', 'mk-note mk-today', '🦊 여우 상인이 오늘만 들여온 물건이에요 · <b class="nw">자정이면 바뀌어요</b>'));
        // 남은 시간: 게임 시계를 따라 1초마다 (바뀔 때만 씀, 탭을 떠나거나 창이 닫히면 멈춤)
        clearInterval(this._mkClock);
        const clk = head.querySelector('.mk-clock b');
        this._mkClock = setInterval(() => { if (!clk.isConnected) { clearInterval(this._mkClock); return; } const v = left(); if (clk.textContent !== v) clk.textContent = v; }, 1000);
        const cards = h('div', 'mk-cards');
        for (const it of todaySpecial(day)) {
          const isDecor = it.kind === 'decor', d = isDecor ? DECOR_BY_ID[it.id] : COSTUME[it.id];
          if (!d || (isDecor && !dsim) || (!isDecor && !cs)) continue;
          const have = isDecor ? dsim.storedOf(it.id) + dsim.placed.filter((x) => x.id === it.id).length : cs.has(it.id) ? 1 : 0;
          const why = isDecor ? dsim.whyNotBuy(it.id, { money: eco.money, level: g.quests.level }) : cs.whyNotBuy(it.id, { money: eco.money, level: g.quests.level, shelf: true });
          const kind = isDecor ? '🪑 꾸미기 소품 · 보관함으로' : `👗 ${COSTUME[d.base]?.name || ''} 색 바꾼 판`;
          const perk = isDecor ? '놓을 때 무료' : `✨ ${d.perkText}`;
          const c = h('div', `mk-card${have ? ' owned' : ''}`, `<span class="mk-rib">${have ? '✓ 샀어요' : '오늘만'}</span><div class="mk-tile">${d.icon}</div>`
            + `<div class="mk-cinfo"><b class="nm">${d.name}</b><span class="mk-kind">${kind}</span><span class="mk-perk">${perk}${isDecor && have ? ` · 가진 것 ${have}` : ''}</span>`
            + `<span class="pr">${!isDecor && have ? '옷장에 있어요' : `${it.price.toLocaleString()}🪙`}</span></div><span class="btns"></span>`);
          c.dataset.k = `today:${it.id}`; c.dataset.have = have;
          const tint = shelfTint(d);
          if (tint) c.style.setProperty('--tint', tint);
          cards.append(c);
          const bx = c.querySelector('.btns');
          if (!isDecor && have) { const b = h('button', 'ghost', cs.wearing === it.id ? '입는 중' : '입기'); b.disabled = cs.wearing === it.id; b.onclick = () => { cs.wear(it.id); g.applyLook(); reward(g, 1); render(); }; bx.append(b); continue; }
          if (why && /Lv/.test(why)) { const bt = h('button', 'locked', lockHtml(`Lv.${d.lv} 해금`)); bt.disabled = true; bx.append(bt); continue; }
          const b = h('button', why ? '' : 'gold', have ? '하나 더 사기' : '사기');
          b.disabled = !!why;
          if (why) b.title = why;
          b.onclick = () => {
            if (isDecor) {
              const cost = dsim.buyToStore(it.id, { money: eco.money, level: g.quests.level });
              if (!cost) return;
              eco.spend(cost);
              this.toast(`${d.icon} ${d.name}${josa(d.name, '을/를')} 샀어요! 🪑 꾸미기 보관함에서 무료로 놓아요`);
            } else {
              const cost = cs.buy(it.id, { money: eco.money, level: g.quests.level, shelf: true });
              if (!cost) return;
              eco.spend(cost);
              cs.wear(it.id); g.applyLook();
              this.toast(`${d.icon} ${d.name}${josa(d.name, '을/를')} 샀어요! 바로 입었어요`);
              g.onEvent('costume', cs.owned.size);
            }
            g.audio.play(BUY_SOUND); reward(g, 2, { sound: null });
            saveSoon();
            render();
          };
          bx.append(b);
        }
        body.append(cards);
        body.append(h('p', 'mk-note', '🏠 집 책상에서는 벽지·바닥·가구를, 🪑 꾸미기의 ✨ 특별 탭에서는 큰 소품을 살 수 있어요'));
      } else if (cur === 'cos') {
        // 👗 의상: 코스튬 사기 · 바로 입기 (갈아입기·세트는 집 옷장)
        const cs = g.costume;
        body.append(h('h3', '', '👗 코스튬 (입고 있는 옷의 혜택만 적용)'));
        const rows = h('div', 'rows');
        for (const c of COSTUMES) {
          const owned = cs.has(c.id), wearing = cs.wearing === c.id;
          const why = cs.whyNotBuy(c.id, { money: eco.money, level: g.quests.level, festival: !!eco.festival });
          const price = c.unlock === 'stamps' ? '보상' : `${c.price}🪙`;
          const r = row(owned ? '' : 'none-soft', '', 0, c.icon, `${c.name}${wearing ? ' <span class="qty">입는 중</span>' : owned ? ' <span class="qty">보유</span>' : ''}`, owned ? '' : price, meta([`✨ ${c.perkText}`, c.desc]));
          if (owned) {
            const b = h('button', wearing ? 'ghost' : 'gold', wearing ? '벗기' : '입기');
            b.onclick = () => { cs.wear(wearing ? null : c.id); g.applyLook(); if (!wearing) { reward(g, 1); this.toast(`${c.icon} ${c.name} · ${c.perkText}`); } else g.audio.play('pop', 0.7); render(); };
            btnsOf(r).append(b);
          } else if (why && !/모자라요/.test(why)) {
            const b = h('button', 'locked', lockHtml(why.replace('부터 살 수 있어요', ' 해금').replace('체험관 스탬프 6개를 모으면 받아요', '스탬프 6개').replace('축제 날에만 팔아요', '축제 날에만')));
            b.disabled = true; btnsOf(r).append(b);
          } else {
            const b = h('button', '', '사기');
            b.disabled = !!why;
            b.onclick = () => {
              const cost = cs.buy(c.id, { money: eco.money, level: g.quests.level, festival: !!eco.festival });
              if (!cost) return;
              eco.spend(cost);
              cs.wear(c.id); g.applyLook();
              g.audio.play(BUY_SOUND); reward(g, 2); // 의상 사기: 중간 보상
              this.toast(`${c.icon} ${c.name}${josa(c.name, '을/를')} 샀어요! 바로 입었어요 · ${c.perkText}`);
              g.onEvent('costume', cs.owned.size);
              saveSoon();
              render();
            };
            btnsOf(r).append(b);
          }
          rows.append(r);
        }
        body.append(rows);
        body.append(h('p', 'mk-note', '🏠 집 옷장에서 코스튬·소품을 갈아입고, 자주 입는 옷차림을 세트로 저장할 수 있어요'));
      } else {
        const fc = g.farmcraft, sim = g.farm.sim;
        body.append(h('h3', '', '🛠️ 농장 시설'));
        const fac = h('div', 'rows');
        const SPR = [400, 800, 1300];
        const sr = sim.sprinklerRows;
        const spr = row('', '', 0, '💦', `스프링클러 <span class="qty">${sr}/3줄</span>`, sr < 3 ? `${SPR[sr]}🪙` : '완료', meta('설치한 줄은 물이 마르면 자동으로 물을 줘요'));
        if (sr < 3) { const bt = h('button', 'gold', `${sr + 1}번째 줄 설치`); bt.disabled = eco.money < SPR[sr]; bt.onclick = () => { if (eco.money < SPR[sim.sprinklerRows]) return; eco.spend(SPR[sim.sprinklerRows]); sim.sprinklerRows++; g.audio.play(BUY_SOUND); this.toast(`💦 밭 ${sim.sprinklerRows}번째 줄에 스프링클러를 설치했어요!`); g.onEvent('sprinkler', sim.sprinklerRows); saveSoon(); render(); }; btnsOf(spr).append(bt); }
        fac.append(spr);
        if (fc) {
          const jp = fc.proc.nextJarPrice;
          const jr = row('', '', 0, '🏺', `장독 추가 <span class="qty">${fc.proc.jars}/4개</span>`, jp ? `${jp}🪙` : '완료', meta('밭 서쪽 장독대에서 김치·잼·주스를 동시에 더 담가요'));
          if (jp) { const bt = h('button', 'gold', '장독 사기'); bt.disabled = eco.money < jp; bt.onclick = () => { if (eco.money < jp || !fc.proc.buyJar()) return; eco.spend(jp); g.audio.play(BUY_SOUND); this.toast('🏺 장독대에 장독을 하나 더 놓았어요!'); saveSoon(); render(); }; btnsOf(jr).append(bt); }
          fac.append(jr);
        }
        body.append(fac);
        body.append(h('p', 'mk-note', '🐄 가축 들이기·축사 넓히기는 목장의 <b>우리 목장</b>(축사 앞)에서 할 수 있어요'));
      }
      body.scrollTop = scroll;
      // 개수가 바뀐 줄만 '보유 N' 이 톡 (사기·팔기 1개)
      for (const r of body.querySelectorAll('.mk-row[data-k]')) {
        const k = r.dataset.k, n = +r.dataset.have, was = this._mkQty.get(k);
        if (was !== undefined && was !== n) r.querySelector('.qty')?.classList.add('pop');
        this._mkQty.set(k, n);
      }
    };
    render();
  },
};
