// 집 창 (책상: 집·벽지·바닥·가구 탭) · 옷장 창: 처음 열 때 받음 (사양 최적화 — 첫 화면 내려받기에서 뺌)
// HomeView.prototype 에 lazyMethods 로 붙음 (home_view.js). 3D 집·방은 home_view.js 에 그대로
import { josa } from '../sim/josa.js';
import { WALLPAPERS, FLOORS, FURNITURE } from '../sim/home.js';
import { COSTUMES, COSTUME, COSTUME_VARIANTS } from '../sim/costume.js';
import { applyRoomStyle } from './home_interior.js';
import { ITEMS } from '../sim/items.js';
import { TITLES } from '../sim/titles.js';
import { saveGame } from '../save.js';
import { reward, BUY_SOUND } from '../reward.js';

export const HomePanels = {
  /** 잠김 표시: UI 아이콘 세트가 있으면 그 자물쇠 */
  _lk() { return this.game.ui?.ico?.('lock') ?? '🔒'; },

  /** 옷장: 🧥 코스튬 · 🎩 소품 · 💾 세트 · 🏅 칭호. 창은 옆에 붙고 카메라가 유니코 앞으로 다가가 입은 모습을 보여 줌 */
  openWardrobe(tab = this._wdTab || 'cos') {
    const g = this.game, ui = g.ui, cs = g.costume, cam = g.followCam;
    const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
    const p = ui.openPanel('👗 옷장');
    p.classList.add('wardrobe');
    // 미리보기 카메라 (창을 닫으면 _updateInside 가 되돌림)
    if (!this._wdCam) this._wdCam = { yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance, lookOffsetY: cam.lookOffsetY || 0 };
    this._wdPanel = p;
    cam.yaw = -0.35; cam.pitch = 0.28; cam.distance = 4.6;
    // 세로 폰: 창이 화면 아래 절반을 덮으므로 조금 물러나 바라보는 점을 낮춤 → 유니코가 창 위쪽에 보임
    if (typeof matchMedia !== 'undefined' && matchMedia('(max-width: 600px)').matches) { cam.distance = 6.5; cam.lookOffsetY = -1.25; }
    g.player.unico.facing = cam.yaw + 0.35;
    const body = el('div', 'wd');
    p.append(body);
    const render = () => {
      this._wdTab = tab;
      body.innerHTML = '';
      const tabs = el('div', 'mk-tabs wd-tabs');
      for (const [id, label] of [['cos', '🧥 코스튬'], ['acc', '🎩 소품'], ['set', '💾 세트'], ['title', '🏅 칭호']]) {
        const t = el('button', tab === id ? 'on' : '', label);
        t.onclick = () => { tab = id; g.audio.play('click', 0.5); render(); };
        tabs.append(t);
      }
      body.append(tabs);
      const o = g.outfitNow();
      if (tab === 'cos') {
        const grid = el('div', 'cos-grid');
        const slot = (id, icon, name, sub, state, onclick) => {
          const b = el('button', `cos-slot ${state}`, `<span class="ic">${icon}</span><b>${name}</b><small>${sub}</small>${state === 'on' ? '<i>입는 중</i>' : ''}`);
          b.disabled = state === 'locked';
          b.onclick = onclick;
          grid.append(b);
        };
        slot(null, '🦄', '기본 유니코', '아무것도 입지 않은 모습', cs.wearing ? 'own' : 'on', () => { cs.wear(null); this._applyCos(); render(); });
        for (const c of COSTUMES) {
          const owned = cs.has(c.id);
          const how = c.unlock === 'stamps' ? '🏢 체험관 스탬프 6개' : c.festival ? `🎉 축제 날 장터 ${c.price}🪙` : `🛒 장터 ${c.price}🪙 · Lv.${c.lv}`;
          slot(c.id, c.icon, c.name, owned ? `✨ ${c.perkText}` : `${this._lk()} ${how}`, !owned ? 'locked' : cs.wearing === c.id ? 'on' : 'own', () => { cs.wear(c.id); this._applyCos(c); render(); });
        }
        // 색 바꾼 판은 가진 것만 (오늘의 특별 상품·레벨 보상으로 얻음)
        for (const c of COSTUME_VARIANTS) if (cs.has(c.id)) slot(c.id, c.icon, c.name, `🎨 색 바꾼 판 · ✨ ${c.perkText}`, cs.wearing === c.id ? 'on' : 'own', () => { cs.wear(c.id); this._applyCos(c); render(); });
        body.append(grid);
        body.append(el('p', 'mk-note', '코스튬은 장터의 👗 의상 탭에서 사요. 입고 있는 옷의 혜택만 적용돼요'));
      } else if (tab === 'acc') {
        const cover = cs.wearing ? COSTUME[cs.wearing] : null;
        const group = (title, opts, keyName) => {
          body.append(el('h3', '', title));
          const row = el('div', 'wd-row');
          for (const [val, label] of opts) {
            const b = el('button', o[keyName] === val ? 'gold' : 'ghost', label);
            b.onclick = () => { this.wear({ [keyName]: val }); g.audio.play('pop', 0.6); render(); };
            row.append(b);
          }
          body.append(row);
        };
        group('🎩 모자', [[null, '없음'], ['straw', '👒 밀짚모자'], ['helmet', '⛑️ 안전모']], 'hat');
        group('🧣 스카프', [[null, '없음'], ['red', '🔴 빨강'], ['green', '🟢 초록'], ['blue', '🔵 파랑']], 'scarf');
        group('🥽 고글', [[false, '안 씀'], [true, '씀']], 'goggles');
        group('🌱 머리 새싹 (모자를 쓰면 가려져요)', [[true, '있음'], [false, '없음']], 'sprout');
        if (cover) body.append(el('p', 'mk-note', `${cover.icon} ${cover.name}${josa(cover.name, '을/를')} 입는 동안에는 옷에 따라 모자·스카프가 가려질 수 있어요`));
      } else if (tab === 'title') {
        // 🏅 칭호: 가진 칭호를 골라 내 이름표에. 못 연 칭호는 여는 방법
        g.checkTitles?.({ quiet: true });
        const f = (g.flags ||= {}), own = new Set(f.titles || []), cur = g.player.title;
        const grid = el('div', 'cos-grid title-grid');
        const pick = (name) => {
          f.title = name; g.player.setTitle(name); g.applyLook?.();
          reward(g, 1, { sound: 'pickup' }); ui.toast(`🏅 “${name}” 칭호를 달았어요`); saveGame(g); render();
        };
        const slot = (icon, name, sub, state, fn) => {
          const b = el('button', `cos-slot ${state}`, `<span class="ic">${icon}</span><b>${state === 'locked' ? '???' : name}</b><small>${sub}</small>${state === 'on' ? '<i>다는 중</i>' : ''}`);
          b.disabled = state === 'locked';
          if (fn) b.onclick = fn;
          grid.append(b);
        };
        const known = new Set(TITLES.map((t) => t.name));
        for (const t of TITLES) {
          const has = own.has(t.name);
          slot(t.icon, t.name, has ? t.desc : `${this._lk()} ${t.desc}`, !has ? 'locked' : cur === t.name ? 'on' : 'own', () => pick(t.name));
        }
        for (const name of own) if (!known.has(name)) slot('💌', name, '받은 칭호', cur === name ? 'on' : 'own', () => pick(name));
        body.append(el('p', 'mk-note', `가진 칭호 ${own.size}개 · 도감·출하·우정·체험관으로 더 모아요. 고른 칭호는 내 이름표에 달려요`));
        body.append(grid);
      } else {
        const rows = el('div', 'rows');
        const desc = (st) => st ? [st.costume ? `${COSTUME[st.costume].icon} ${COSTUME[st.costume].name}` : '🦄 기본', st.hat ? { straw: '👒', helmet: '⛑️' }[st.hat] : '', st.scarf ? { red: '🔴', green: '🟢', blue: '🔵' }[st.scarf] : '', st.goggles ? '🥽' : ''].filter(Boolean).join(' ') : '비어 있음';
        cs.sets.forEach((st, i) => {
          const r = el('div', 'row', `<span class="ic">${i + 1}</span><span class="nm">세트 ${i + 1}<br><small>${desc(st)}</small></span>`);
          const save = el('button', 'ghost', '💾 지금 옷 저장');
          save.onclick = () => { cs.saveSet(i, o); g.audio.play('pop', 0.6); ui.toast(`💾 세트 ${i + 1}에 저장했어요`); render(); };
          const load = el('button', '', '입기');
          load.disabled = !st;
          load.onclick = () => { const v = cs.loadSet(i); if (!v) return ui.toast('🔒 그 옷을 아직 가지고 있지 않아요'); this.wear({ hat: v.hat, scarf: v.scarf, goggles: v.goggles, sprout: v.sprout }); this._applyCos(v.costume && COSTUME[v.costume]); render(); };
          r.append(save, load);
          rows.append(r);
        });
        body.append(rows);
        body.append(el('p', 'mk-note', '자주 입는 옷차림을 저장해 두고 한 번에 갈아입어요'));
      }
    };
    render();
  },

  /** 코스튬을 바꾼 뒤: 입히기·접속자 알림·저장, 반짝 효과 */
  _applyCos(c) {
    const g = this.game;
    g.applyLook();
    reward(g, 1, { sound: c ? 'pickup' : 'pop' }); // 옷 갈아입기: 작은 보상
    if (c) g.ui.toast(`${c.icon} ${c.name} · ${c.perkText}`);
    g.onEvent('outfit');
    saveGame(g);
  },

  /** 집 창: 🏠 집(잠자기·넓히기) · 🎨 벽지·바닥 · 🛋️ 가구 */
  open(tab = this._homeTab || 'home') {
    const g = this.game, ui = g.ui, w = g.world, S = this.sim, eco = g.economy;
    this._homeTab = tab;
    const p = ui.openPanel(`🏠 ${S.info.name}`);
    p.classList.add('home-desk');
    const add = (cls, html, to = p) => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; to.append(e); return e; };
    const tabs = add('mk-tabs', '');
    for (const [id, label] of [['home', '🏠 집'], ['style', '🎨 벽지·바닥'], ['furn', '🛋️ 가구']]) {
      const t = document.createElement('button'); t.className = id === tab ? 'on' : ''; t.textContent = label;
      t.onclick = () => { if (id !== tab) { g.audio.play('click', 0.5); this.open(id); } };
      tabs.append(t);
    }
    if (tab === 'style') return this._openStyle(p, add);
    if (tab === 'furn') return this._openFurniture(p, add);
    add('mk-note', `${S.info.desc}${S.rested(w.day) ? '<br>😊 오늘은 푹 자서 개운해요 (걷는 속도 +15%)' : ''}`);
    const rows = document.createElement('div'); rows.className = 'rows'; p.append(rows);
    // 잠자기
    const can = S.canSleep(w.time);
    const sr = document.createElement('div'); sr.className = 'row mk-row';
    sr.innerHTML = `<span class="ic">🛏️</span><span class="nm">잠자기<br><small>${can ? '자고 나면 아침 6시 30분 · 하루 동안 걷는 속도 +15%' : `저녁 6시부터 잘 수 있어요 (지금 ${w.clockText ? w.clockText().split(' ')[1] : ''})`}</small></span>`;
    const sb = document.createElement('button'); sb.className = can ? 'gold' : ''; sb.textContent = can ? '잠자기 💤' : '아직 일러요'; sb.disabled = !can;
    sb.onclick = () => this.sleep();
    sr.append(sb); rows.append(sr);
    // 집 넓히기
    const n = S.next;
    const ur = document.createElement('div'); ur.className = 'row mk-row';
    if (n) {
      const why = S.whyNotUpgrade(eco.money, g.quests.level);
      ur.innerHTML = `<span class="ic">🏡</span><span class="nm">${n.name}으로 넓히기<br><small>${n.desc}</small></span><span class="pr">${n.price.toLocaleString()}🪙</span>`;
      const ub = document.createElement('button'); ub.className = why ? '' : 'gold'; ub.disabled = !!why; ub.innerHTML = why && /Lv/.test(why) ? `${this._lk()} ${why.split('부터')[0]}` : '넓히기'; if (why) ub.title = why;
      ub.onclick = () => this.upgrade();
      ur.append(ub);
    } else ur.innerHTML = '<span class="ic">🏡</span><span class="nm">가장 큰 집이에요<br><small>매일 아침 우편함에 선물이 와요</small></span>';
    rows.append(ur);
    if (S.mail()) add('mk-note', `📬 우편함: 매일 아침 ${S.mail().coins}🪙${S.mail().items.length ? ` + ${S.mail().items.map(([id, k]) => `${ITEMS[id]?.emoji || ''}${ITEMS[id]?.name || id} ${k}개`).join(', ')}` : ''}`);
    add('mk-note', '🎨 벽지·바닥과 🛋️ 가구로 방을 꾸밀 수 있어요 (위 탭)');
  },

  /** 벽지·바닥: 색 견본 칸. 산 것은 눌러서 바로 바꿈, 안 산 것은 눌러서 미리보기(색만 잠깐) → 사기/취소 */
  _openStyle(p, add) {
    const g = this.game, S = this.sim, eco = g.economy, lv = g.quests.level;
    p.classList.add('home-style');
    const pv = this._pv; // { kind, id } 미리보기 중인 무늬
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    if (pv) {
      const x = (pv.kind === 'wall' ? WALLPAPERS : FLOORS).find((y) => y.id === pv.id);
      const why = S.whyNotStyle(pv.kind, pv.id, eco.money, lv);
      const bar = add('pv-bar', `<span>👀 미리보기 중 · <b>${x.icon} ${x.name}</b></span>`);
      const buy = document.createElement('button');
      buy.className = why ? '' : 'gold';
      buy.textContent = `사기 ${x.price.toLocaleString()}🪙`;
      buy.disabled = !!why;
      if (why) buy.title = why;
      buy.onclick = () => {
        const cost = S.buyStyle(pv.kind, pv.id, eco.money, lv);
        if (cost < 0) return;
        if (cost > 0) eco.spend(cost);
        this._pv = null;
        g.audio.play(BUY_SOUND); reward(g, 1, { sound: null });
        g.ui.toast(`${x.icon} ${x.name}${josa(x.name, '으로/로')} 방을 꾸몄어요!`);
        applyRoomStyle(S.colors());
        saveGame(g);
        this.open('style');
      };
      const no = document.createElement('button');
      no.className = 'ghost'; no.textContent = '취소';
      no.onclick = () => { this._pv = null; applyRoomStyle(S.colors()); g.audio.play('pop', 0.5); this.open('style'); };
      bar.append(buy, no);
      if (why && !/Lv/.test(why)) add('mk-note pv-why', `🪙 ${why}`, bar);
    }
    // 바닥 견본: 실제 무늬처럼 (널빤지·줄무늬·타일·장판)
    const floorBg = (x) => {
      const A = hex(x.floor), B = hex(x.floorB);
      if (x.look === 'stripe') return `repeating-linear-gradient(90deg, ${A} 0 9px, ${B} 9px 18px)`;
      if (x.look === 'tile') return `conic-gradient(${A} 25%, ${B} 0 50%, ${A} 0 75%, ${B} 0) 0 0 / 20px 20px`;
      if (x.look === 'mat') return `repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0 1px, transparent 1px 14px), linear-gradient(135deg, ${A}, ${B})`;
      return `repeating-linear-gradient(90deg, ${A} 0 13px, rgba(0,0,0,0.18) 13px 14px, ${B} 14px 27px, rgba(0,0,0,0.18) 27px 28px)`;
    };
    for (const [kind, title, list] of [['wall', '🎨 벽지', WALLPAPERS], ['floor', '🪵 바닥', FLOORS]]) {
      add('', `<h3>${title}</h3>`);
      const grid = add('cos-grid style-grid', '');
      for (const x of list) {
        const own = S.hasStyle(kind, x.id), on = S.style[kind] === x.id, why = own ? null : S.whyNotStyle(kind, x.id, eco.money, lv);
        const lock = !!(why && /Lv/.test(why)), seeing = pv && pv.kind === kind && pv.id === x.id;
        const sub = on ? '쓰는 중' : own ? '가진 것' : lock ? `${this._lk()} Lv.${x.lv}` : `${x.price.toLocaleString()}🪙`;
        const bg = kind === 'wall' ? `linear-gradient(180deg, ${hex(x.wall)} 0 60%, ${hex(x.wallB)} 60% 100%)` : floorBg(x);
        const btn = document.createElement('button');
        btn.className = `cos-slot${on ? ' on' : ''}${lock ? ' locked' : ''}${seeing ? ' seeing' : ''}`;
        btn.innerHTML = `<span class="swatch" style="background:${bg}"></span><b>${x.name}</b><small>${sub}</small>${on ? '<i>✓</i>' : seeing ? '<i>👀</i>' : ''}`;
        btn.disabled = lock;
        if (why) btn.title = lock ? why : `${why} · 눌러서 미리보기`;
        btn.onclick = () => {
          if (own) { this._pv = null; S.setStyle(kind, x.id); g.audio.play('pop', 0.6); applyRoomStyle(S.colors()); saveGame(g); }
          else { this._pv = seeing ? null : { kind, id: x.id }; g.audio.play('click', 0.5); applyRoomStyle(S.colors(this._pv ? { [kind]: x.id } : null)); }
          this.open('style');
        };
        grid.append(btn);
      }
    }
    add('mk-note', '안 산 무늬는 눌러서 방에 먼저 입혀 볼 수 있어요 · 산 벽지·바닥은 언제든 다시 바꿀 수 있어요');
    // 미리보기는 창이 닫히거나 다른 탭으로 가면 되돌림
    clearInterval(this._pvWatch);
    if (pv) this._pvWatch = setInterval(() => {
      if (p.isConnected) return;
      clearInterval(this._pvWatch);
      if (g.ui.panel?.classList.contains('home-style')) return; // 같은 탭을 다시 그림
      this._pv = null; applyRoomStyle(S.colors());
    }, 200);
  },

  /** 가구: 사면 창을 닫고 방에 놓인 자리에서 반짝 (벽에 걸거나 가구 위에 올려 길을 막지 않음). 놓은 것은 아래로 */
  _openFurniture(p, add) {
    const g = this.game, S = this.sim, eco = g.economy, lv = g.quests.level;
    add('mk-note', `방에 놓은 가구 <b>${S.furniture.length}/${FURNITURE.length}</b> · 사면 바로 방에 생겨요`);
    const rows = add('rows furn-rows', '');
    const list = [...FURNITURE].sort((x, y) => S.hasFurniture(x.id) - S.hasFurniture(y.id));
    for (const x of list) {
      const own = S.hasFurniture(x.id), why = own ? null : S.whyNotFurniture(x.id, eco.money, lv);
      const r = add(`row mk-row furn${own ? ' owned' : ''}`, `<span class="ic">${x.icon}</span><span class="nm">${x.name}<br><small>${x.desc}</small></span><span class="pr">${own ? '' : `${x.price.toLocaleString()}🪙`}</span>`, rows);
      if (own) { r.append(Object.assign(document.createElement('span'), { className: 'furn-done', textContent: '✓ 놓음' })); continue; }
      const b = document.createElement('button');
      b.className = why ? (/Lv/.test(why) ? 'locked' : '') : 'gold';
      b.innerHTML = why && /Lv/.test(why) ? `${this._lk()} Lv.${x.lv}` : '사기';
      b.disabled = !!why;
      if (why) b.title = why;
      b.onclick = () => {
        const cost = S.buyFurniture(x.id, eco.money, lv);
        if (!cost) return;
        eco.spend(cost);
        this.buildRoom();
        g.audio.play(BUY_SOUND); reward(g, 2, { sound: null });
        g.ui.toast(`${x.icon} ${x.name}${josa(x.name, '이/가')} 방에 놓였어요! ✨`);
        saveGame(g);
        // 창을 닫아 방을 보여 주고, 놓인 자리에서 반짝
        g.ui.closePanel();
        const at = this.room?.furnAt?.[x.id], gp = this.room?.group.position;
        if (at && gp) for (const [t, n] of [[0, 18], [260, 10]]) setTimeout(() => g.fx?.burst?.(gp.x + at.x, gp.y + at.y, gp.z + at.z, 0xfff3a0, n), t);
      };
      r.append(b);
    }
  }
};
