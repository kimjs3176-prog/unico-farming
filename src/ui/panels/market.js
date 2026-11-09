// 장터 창: 사기·팔기·의상·시설 탭
import { h } from '../dom.js';
import { josa } from '../../game/sim/josa.js';
import { COSTUMES } from '../../game/sim/costume.js';
import { CROPS, PRODUCTS, FEED_PRICE } from '../../game/sim/crops.js';
import { ITEMS } from '../../game/sim/items.js';

/** 장터 창 메서드 (UI.prototype 에 합쳐짐) */
export const MarketPanel = {
  /**
   * 장터: 탭 3개 (🌱 사기 · 💰 팔기 · 🛠️ 시설) — 제목·닫기·보유 코인·탭은 위에 고정, 팔기 탭은 '모두 판매' 막대가 아래에 고정
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
    const TABS = [['buy', '🌱 사기'], ['sell', '💰 팔기'], ['cos', '👗 의상'], ['fac', '🛠️ 시설']];
    const saveSoon = () => { g.saveTimer = Math.max(g.saveTimer || 0, 9); }; // 사고판 뒤 1초 안에 저장 (연달아 눌러도 한 번만)
    const sellables = () => {
      const list = [];
      for (const [k, c] of Object.entries({ ...CROPS, ...PRODUCTS })) list.push([k, c]);
      for (const [k, n] of Object.entries(eco.inventory.items)) if (n > 0 && ITEMS[k] && ITEMS[k].cat !== 'seed' && k !== 'paddy') list.push([k, ITEMS[k]]);
      return list;
    };
    const ownedValue = () => sellables().reduce((a, [k]) => a + eco.count(k) * eco.sellPrice(k), 0);
    const buyRow = (emoji, name, have, price, opts, note = '', locked = '') => {
      const r = h('div', 'row mk-row', `<span class="ic">${emoji}</span><span class="nm">${name} <span class="qty">보유 ${have}</span>${note ? `<br><small>${note}</small>` : ''}</span><span class="pr">${price}🪙</span>`);
      if (locked) { const bt = h('button', 'locked', `🔒 ${locked}`); bt.disabled = true; r.append(bt); return r; }
      for (const [n, fn] of opts) {
        const bt = h('button', '', `${n}개`);
        bt.disabled = eco.money < price * n;
        bt.onclick = () => { if (fn(n)) { g.audio.play('coin'); saveSoon(); render(); } };
        r.append(bt);
      }
      return r;
    };
    const render = () => {
      const scroll = body.scrollTop;
      const cur = this.marketTab;
      top.innerHTML = '';
      const coin = h('div', 'mk-coin', `🪙 <b class="money">${eco.money.toLocaleString()}</b> 코인${eco.festival ? ` <span class="mk-ev fest">🎉 수확 축제 · 모두 ${eco.festival.mult}배</span>` : ''}${eco.event ? ` <span class="mk-ev">🔥 ${eco.event.name}</span>` : ''}`);
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
          seeds.append(buyRow(c.emoji, `${c.name} 씨앗`, eco.inventory.seeds[k] || 0, c.seedPrice, [[1, (n) => eco.buySeed(k, n)], [5, (n) => eco.buySeed(k, n)]], `${g.season?.cur?.crops.includes(k) ? `${g.season.cur.icon} 제철 · ` : ''}${c.growTime}초 · 판매 ${c.basePrice}🪙${c.regrow ? ` · ${c.regrow}번 더 열림` : ''}`, locked));
        }
        body.append(seeds);
        body.append(h('h3', '', '🧺 농장 용품'));
        const goods = h('div', 'rows');
        goods.append(buyRow('🌾', '동물 사료', eco.inventory.feed, FEED_PRICE, [[1, (n) => eco.buyFeed(n)], [5, (n) => eco.buyFeed(n)]], '목장 동물에게 주거나 여물통에 채워요'));
        const cp = ITEMS.compost;
        goods.append(buyRow(cp.emoji, cp.name, eco.count('compost'), cp.price, [[1, (n) => eco.buyItem('compost', n)], [5, (n) => eco.buyItem('compost', n)]], '퇴비통에서 직접 만들 수도 있어요'));
        const rs = ITEMS.rice_seed;
        goods.append(buyRow(rs.emoji, rs.name, eco.count('rice_seed'), rs.price, [[1, (n) => eco.buyItem('rice_seed', n)], [3, (n) => eco.buyItem('rice_seed', n)]], '논에 모내기'));
        const pt = ITEMS.pet_treat;
        goods.append(buyRow(pt.emoji, pt.name, eco.count('pet_treat'), pt.price, [[1, (n) => eco.buyItem('pet_treat', n)], [3, (n) => eco.buyItem('pet_treat', n)]], '콩이가 좋아해요'));
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
          const r = h('div', `row mk-row${have ? '' : ' none'}`, `<span class="ic">${c.emoji}</span><span class="nm">${c.name}${ev} <span class="qty">보유 ${have}</span></span><span class="pr">${eco.sellPrice(k)}🪙 ${trend}</span>`);
          if (have > 1) { const b1 = h('button', '', '1개'); b1.onclick = () => { const got = eco.sell(k, 1); g.onEvent('sell', 1); g.audio.play('coin'); this.toast(`+${got} 코인`); saveSoon(); render(); }; r.append(b1); }
          const b = h('button', 'gold', have > 1 ? `전부 ${(eco.sellPrice(k) * have).toLocaleString()}` : '판매');
          b.disabled = have <= 0;
          b.onclick = () => { const got = eco.sell(k, have); g.onEvent('sell', have); g.audio.play('coin'); this.toast(`+${got} 코인`); saveSoon(); render(); };
          r.append(b);
          rows.append(r);
        }
        if (!shown) rows.append(h('div', 'mk-empty', '🧺 팔 물건이 없어요. 밭과 목장에서 수확해 오세요!<br><small>‘시세 전체 보기’로 오늘 시세를 볼 수 있어요</small>'));
        body.append(rows);
        const total = ownedValue();
        if (total > 0) {
          foot.style.display = '';
          foot.append(h('span', 'mk-total', `가방 속 판매 가능 <b>${total.toLocaleString()}🪙</b>`));
          const ab = h('button', 'gold', '🧺 모두 판매하기');
          ab.onclick = () => { const n = sellables().reduce((a, [k]) => a + eco.count(k), 0); const got = eco.sellAll(); g.onEvent('sell', n); g.audio.play('coin'); this.toast(`+${got} 코인`); saveSoon(); render(); };
          foot.append(ab);
        }
      } else if (cur === 'cos') {
        // 👗 의상: 코스튬 사기 · 바로 입기 (갈아입기·세트는 집 옷장)
        const cs = g.costume;
        body.append(h('h3', '', '👗 코스튬 (입고 있는 옷의 혜택만 적용)'));
        const rows = h('div', 'rows');
        for (const c of COSTUMES) {
          const owned = cs.has(c.id), wearing = cs.wearing === c.id;
          const why = cs.whyNotBuy(c.id, { money: eco.money, level: g.quests.level, festival: !!eco.festival });
          const price = c.unlock === 'stamps' ? '보상' : `${c.price}🪙`;
          const r = h('div', `row mk-row${owned ? '' : ' none-soft'}`, `<span class="ic">${c.icon}</span><span class="nm">${c.name}${wearing ? ' <span class="qty">입는 중</span>' : owned ? ' <span class="qty">보유</span>' : ''}<br><small>✨ ${c.perkText} · ${c.desc}</small></span><span class="pr">${owned ? '' : price}</span>`);
          if (owned) {
            const b = h('button', wearing ? 'ghost' : 'gold', wearing ? '벗기' : '입기');
            b.onclick = () => { cs.wear(wearing ? null : c.id); g.applyLook(); g.audio.play('pop', 0.7); if (!wearing) { g.player.unico.playAction('cheer', 0.9); this.toast(`${c.icon} ${c.name} · ${c.perkText}`); } render(); };
            r.append(b);
          } else if (why && !/모자라요/.test(why)) {
            const b = h('button', 'locked', `🔒 ${why.replace('부터 살 수 있어요', ' 해금').replace('체험관 스탬프 6개를 모으면 받아요', '스탬프 6개').replace('수확 축제 날에만 팔아요', '축제 날에만')}`);
            b.disabled = true; r.append(b);
          } else {
            const b = h('button', '', '사기');
            b.disabled = !!why;
            b.onclick = () => {
              const cost = cs.buy(c.id, { money: eco.money, level: g.quests.level, festival: !!eco.festival });
              if (!cost) return;
              eco.money -= cost; eco.stats.spent += cost;
              cs.wear(c.id); g.applyLook();
              g.audio.play('levelup'); g.player.unico.playAction('cheer', 1.2);
              this.toast(`${c.icon} ${c.name}${josa(c.name, '을/를')} 샀어요! 바로 입었어요 · ${c.perkText}`);
              g.onEvent('costume', cs.owned.size);
              saveSoon();
              render();
            };
            r.append(b);
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
        const spr = h('div', 'row mk-row', `<span class="ic">💦</span><span class="nm">스프링클러 <span class="qty">${sr}/3줄</span><br><small>설치한 줄은 물이 마르면 자동으로 물을 줘요</small></span><span class="pr">${sr < 3 ? `${SPR[sr]}🪙` : '완료'}</span>`);
        if (sr < 3) { const bt = h('button', 'gold', `${sr + 1}번째 줄 설치`); bt.disabled = eco.money < SPR[sr]; bt.onclick = () => { if (eco.money < SPR[sim.sprinklerRows]) return; eco.money -= SPR[sim.sprinklerRows]; eco.stats.spent += SPR[sim.sprinklerRows]; sim.sprinklerRows++; g.audio.play('levelup'); this.toast(`💦 밭 ${sim.sprinklerRows}번째 줄에 스프링클러를 설치했어요!`); g.onEvent('sprinkler', sim.sprinklerRows); saveSoon(); render(); }; spr.append(bt); }
        fac.append(spr);
        if (fc) {
          const jp = fc.proc.nextJarPrice;
          const jr = h('div', 'row mk-row', `<span class="ic">🏺</span><span class="nm">장독 추가 <span class="qty">${fc.proc.jars}/4개</span><br><small>밭 서쪽 장독대에서 김치·잼·주스를 동시에 더 담가요</small></span><span class="pr">${jp ? `${jp}🪙` : '완료'}</span>`);
          if (jp) { const bt = h('button', 'gold', '장독 사기'); bt.disabled = eco.money < jp; bt.onclick = () => { if (eco.money < jp || !fc.proc.buyJar()) return; eco.money -= jp; eco.stats.spent += jp; g.audio.play('levelup'); this.toast('🏺 장독대에 장독을 하나 더 놓았어요!'); saveSoon(); render(); }; jr.append(bt); }
          fac.append(jr);
        }
        body.append(fac);
        body.append(h('p', 'mk-note', '🐄 가축 들이기·축사 넓히기는 목장의 <b>우리 목장</b>(축사 앞)에서 할 수 있어요'));
      }
      body.scrollTop = scroll;
    };
    render();
  },
};
