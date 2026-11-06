import { CROPS, PRODUCTS, FEED_PRICE } from '../game/sim/crops.js';
import { ITEMS, CATEGORY_NAMES, itemsOf } from '../game/sim/items.js';
import { BOOK_CATS, COMPLETE_REWARD } from '../game/sim/collection.js';
import { VILLAGERS } from '../game/sim/villagers.js';
import { RICE_STAGES, WATER_MAX } from '../game/sim/rice.js';

const anyItem = (k) => CROPS[k] || PRODUCTS[k] || ITEMS[k];
import { recordsHtml } from './minigame_frame.js';
import { installKoatUI } from './koat_ui.js';
import { PRESETS, PRESET_INFO, SHADOWS, applyPreset, UI_SCALES, uiScaleOf } from '../game/quality.js';

/** 세부 항목이 어느 프리셋과 똑같은지 (아니면 사용자 지정) */
function matchPreset(s) {
  const keys = Object.keys(PRESETS.high);
  return Object.keys(PRESETS).find((p) => keys.every((k) => PRESETS[p][k] === s[k])) || 'custom';
}

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/** DOM 기반 HUD / 패널 */
export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.panel = null;
    root.innerHTML = '';
    // 상단 HUD
    this.top = h('div', 'hud-top');
    this.moneyChip = h('div', 'chip', '🪙 <span class="money">0</span>');
    this.clockChip = h('div', 'chip', '🕒 <span>1일차 08:00</span>');
    this.levelChip = h('div', 'chip', 'Lv.<span class="lv">1</span> <div class="xpbar"><i></i></div><small class="xp"></small>');
    this.weatherChip = h('button', 'chip weather-chip', '🌤️ <span>날씨 확인 중…</span>');
    this.weatherChip.onclick = () => this.openWeather();
    this.boostChip = h('div', 'chip', '🌱 성장 부스트 <span></span>');
    this.boostChip.style.display = 'none';
    const right = h('div', 'hud-right');
    this.btnBag = h('button', 'ghost', '🎒<span class="lbl"> 가방</span> <span class="hint-kbd">(I)</span>');
    this.btnQuest = h('button', 'ghost', '📜<span class="lbl"> 퀘스트</span> <span class="hint-kbd">(Q)</span>');
    this.btnHelp = h('button', 'ghost', '❔');
    this.btnSettings = h('button', 'ghost', '⚙️');
    this.btnSettings.title = '환경설정 (그래픽 품질)';
    this.btnSettings.onclick = () => this.openSettings();
    this.btnBag.onclick = () => this.openInventory();
    this.btnQuest.onclick = () => this.openQuests();
    this.btnHelp.onclick = () => this.openHelp();
    right.append(this.btnBag, this.btnQuest, this.btnSettings, this.btnHelp);
    this.fpsChip = h('div', 'fps-chip', '');
    root.append(this.fpsChip);
    this.top.append(this.moneyChip, this.clockChip, this.weatherChip, this.levelChip, this.boostChip, right);
    root.append(this.top);
    this.banner = h('div', 'event-banner', '');
    this.banner.style.display = 'none';
    root.append(this.banner);
    this.toasts = h('div', 'toasts');
    root.append(this.toasts);
    this.prompt = h('div', 'prompt hidden', '');
    this.prompt.addEventListener('pointerdown', (e) => { if (this.currentPrompt?.onInteract) { e.preventDefault(); game.input.interactTap = true; } });
    root.append(this.prompt);
    // 모바일
    this.joy = h('div', 'joystick', '<i></i>');
    root.append(this.joy);
    this.touchBtn = h('button', 'touch-btn', 'E');
    this.touchBtn.addEventListener('touchstart', (e) => { e.preventDefault(); game.input.interactTap = true; });
    this.touchBtn.addEventListener('click', () => (game.input.interactTap = true));
    root.append(this.touchBtn);
    game.input.onJoystick = (active, cx, cy, dx, dy) => {
      this.joy.style.display = active ? 'block' : 'none';
      if (active) { this.joy.style.left = cx - 60 + 'px'; this.joy.style.top = cy - 60 + 'px'; this.joy.firstChild.style.transform = `translate(${dx}px, ${dy}px)`; }
    };
    // 채팅
    this.chat = h('div', 'chat');
    this.online = h('div', 'online', '🟢 오프라인 모드');
    this.chatLog = h('div', 'log');
    this.chatInput = h('input');
    this.chatInput.placeholder = '채팅 (Enter)';
    this.chatInput.maxLength = 80;
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const t = this.chatInput.value.trim(); if (t) game.net.sendChat(t); this.chatInput.value = ''; this.chatInput.blur(); }
      if (e.key === 'Escape') this.chatInput.blur();
      e.stopPropagation();
    });
    this.chat.append(this.online, this.chatLog, this.chatInput);
    root.append(this.chat);
    this.miniHud = null;
    this.smart = null;
    // 하단 액션바 (참고: 감정표현 / 말하기 / 찰칵 / 소리 / 방)
    this.bar = h('div', 'actionbar');
    const mk = (icon, label, fn) => { const b = h('button', '', `<span>${icon}</span>${label}`); b.onclick = fn; this.bar.append(b); return b; };
    mk('🦄', '행동', () => this.toggleEmotes());
    mk('💬', '말하기', () => this.chatInput.focus());
    mk('🛒', '장터', () => this.openMarket());
    mk('📖', '도감', () => this.openBook());
    mk('🏢', '체험관', () => game.goKoat());
    this.bar.append(h('div', 'sep'));
    mk('🏡', '농장 방', () => this.openRooms());
    this.soundBtn = mk('🔊', '소리', () => {
      const st = game.audio.cycle();
      if (st !== 'off') game.music.start();
      this.soundBtn.firstChild.textContent = { all: '🔊', sfx: '🎵', off: '🔇' }[st];
      this.toast({ all: '🔊 음악·효과음 켜짐', sfx: '🎵 음악 끔 (효과음만)', off: '🔇 소리 끔' }[st]);
    });
    mk('📸', '찰칵', () => this.snapshot());
    this.autoBtn = mk('🤖', '자동', () => game.autoplay.toggle());
    this.autoBtn.title = '오토플레이 (P)';
    root.append(this.bar);
    // 모바일: 행동 막대는 ☰ 버튼 하나로 접어 두고, 누르면 펼침 (버튼을 고르면 다시 접힘)
    this.barToggle = h('button', 'bar-toggle', '☰');
    this.barToggle.title = '메뉴';
    this.barToggle.onclick = () => this.setBarOpen(!this.root.classList.contains('bar-open'));
    root.append(this.barToggle);
    this.bar.addEventListener('click', (e) => { if (e.target.closest('button')) this.setBarOpen(false); });
    this.emoteMenu = null;
  }

  setWeather(w, svc) {
    this.weatherInfo = { w, svc };
    const place = svc.loc?.name ? ` <small>${esc(svc.loc.name)}</small>` : '';
    this.weatherChip.innerHTML = `${w.emoji} <span>${w.temperature != null ? Math.round(w.temperature) + '°' : ''} ${w.label}</span>${place}`;
    if (this.panel?.dataset.kind === 'weather') this.openWeather();
  }

  openWeather() {
    const info = this.weatherInfo;
    const p = this.openPanel('🌦️ 우리 동네 날씨');
    p.dataset.kind = 'weather';
    if (!info) { p.append(h('div', 'row', '날씨를 불러오는 중이에요…')); return; }
    const { w, svc } = info;
    const src = { live: '실시간 (Open-Meteo)', manual: '수동 설정', offline: '연결 실패 · 맑음으로 표시', default: '기본값' }[svc.source] || svc.source;
    const rows = [
      `${w.emoji} <b>${w.label}</b>${w.temperature != null ? ` · ${Math.round(w.temperature)}°C` : ''}`,
      `📍 ${esc(svc.loc?.name || '-')}  <small>(위치 권한을 거부하면 기본 위치를 사용해요)</small>`,
      `💨 바람 ${Math.round(w.windKmh || 0)} km/h · ☁️ 구름 ${Math.round(w.cloud * 100)}%`,
      `🔄 출처: ${src} · 15분마다 갱신`,
      `🌱 게임 효과: ${w.autoWater ? '비가 와서 밭에 자동으로 물이 뿌려져요' : w.kind === 'snow' ? '눈 때문에 작물 성장이 40% 느려져요 (스마트팜은 영향 없음)' : w.kind === 'fog' ? '안개로 시야가 짧아져요' : '맑은 날엔 직접 물을 줘야 해요'}`,
    ];
    p.append(h('div', 'rows', rows.map((t) => `<div class="row">${t}</div>`).join('')));
    p.append(h('h3', '', '날씨 바꿔 보기 (체험용)'));
    const grid = h('div', 'room-list');
    const live = h('button', svc.source === 'live' ? 'cur' : '', '📡 실시간 날씨<small>현재 위치 기준</small>');
    live.onclick = () => { svc.useLive(); this.toast('📡 현재 위치 날씨를 불러와요'); };
    grid.append(live);
    for (const [k, label] of [['clear', '☀️ 맑음'], ['cloudy', '☁️ 흐림'], ['rain', '🌧️ 비'], ['storm', '⛈️ 뇌우'], ['snow', '❄️ 눈'], ['fog', '🌫️ 안개']]) {
      const b = h('button', svc.source === 'manual' && w.kind === k ? 'cur' : '', label);
      b.onclick = () => svc.setPreset(k);
      grid.append(b);
    }
    p.append(grid);
  }

  /** 목표 안내 칩 */
  setObjective(q, dist, ang) {
    if (!this.objective) {
      this.objective = h('div', 'objective');
      this.objective.onclick = () => this.openQuests();
      this.root.append(this.objective);
    }
    if (!q) { this.objective.style.display = 'none'; return; }
    this.objective.style.display = '';
    this.objective.classList.toggle('done', q.complete);
    const key = `${q.id}|${q.complete}|${q.count}|${dist === null ? '' : Math.round(dist)}`;
    if (key !== this.objKey) {
      this.objKey = key;
      this._objDeg = null; // 새로 그린 화살표에 방향 다시 적용
      this.objective.innerHTML = `<span class="ic">${q.complete ? '🎁' : '🎯'}</span><div class="tt">${q.complete ? '보상 받기: ' : ''}${q.title}<small>${q.complete ? '눌러서 퀘스트 창 열기 (Q)' : q.desc}${!q.complete && dist !== null ? ` · ${Math.round(dist)}m` : ''}</small><div class="bar"><i style="width:${Math.round((q.count / q.goal) * 100)}%"></i></div></div>${dist !== null && !q.complete ? '<span class="dir">▲</span>' : q.complete ? '<span class="dir">✓</span>' : ''}`;
    }
    const dir = this.objective.querySelector('.dir');
    const deg = Math.round(ang / 3) * 3; // 3도 단위로만 갱신
    if (dir && !q.complete && deg !== this._objDeg) { this._objDeg = deg; dir.style.transform = `rotate(${deg}deg)`; }
  }

  /** 월드 위치에서 가방 버튼으로 아이콘이 날아감 */
  flyToBag(text, worldPos) {
    const g = this.game;
    const v = worldPos.clone().project(g.camera);
    if (v.z > 1) return;
    const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    const bag = this.btnBag.getBoundingClientRect();
    const el = h('div', 'fly', text);
    el.style.left = `${x - 15}px`; el.style.top = `${y - 15}px`;
    document.body.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transform = `translate(${bag.left + bag.width / 2 - x}px, ${bag.top + bag.height / 2 - y}px) scale(0.5)`;
      el.style.opacity = '0.2';
    }));
    setTimeout(() => { el.remove(); this.btnBag.classList.add('bump'); setTimeout(() => this.btnBag.classList.remove('bump'), 400); g.audio.play('pop'); }, 760);
  }

  toggleEmotes() {
    if (this.emoteMenu) { this.emoteMenu.remove(); this.emoteMenu = null; return; }
    const EMOTES = [['cheer', '🙌', '깡총'], ['wave', '👋', '인사'], ['heart', '❤️', '하트'], ['think', '🤔', '생각'], ['present', '📊', '발표'], ['megaphone', '📣', '외치기']];
    const m = h('div', 'emote-menu');
    for (const [pose, icon, name] of EMOTES) {
      const b = h('button', '', `${icon}<small>${name}</small>`);
      b.onclick = () => { this.game.player.unico.playAction(pose, 2.5); this.game.audio.play('click'); m.remove(); this.emoteMenu = null; };
      m.append(b);
    }
    const hat = h('button', '', `👒<small>모자</small>`);
    hat.onclick = () => { const u = this.game.player.unico; u.setOutfit({ hat: u.outfit.hat === 'straw' ? null : 'straw' }); m.remove(); this.emoteMenu = null; };
    m.append(hat);
    this.root.append(m);
    this.emoteMenu = m;
  }

  async openRooms() {
    const g = this.game;
    const p = this.openPanel('🏡 어느 농장으로 갈까요?');
    p.append(h('p', '', '농장을 옮겨도 내 밭·가방·퀘스트는 그대로예요. 방마다 최대 50명이 함께 지내요.'));
    const list = h('div', 'room-list');
    p.append(list);
    try {
      const base = (import.meta.env?.VITE_WS_URL || '').replace(/^ws/, 'http').replace(/\/ws$/, '');
      const r = await fetch(`${base}/rooms`);
      const d = await r.json();
      const rooms = d.rooms.length ? d.rooms : [{ name: '1번 농장', count: 0, max: d.maxPlayers }];
      const nextIdx = rooms.length + 1;
      if (rooms.every((x) => x.count >= x.max)) rooms.push({ name: `${nextIdx}번 농장`, count: 0, max: d.maxPlayers });
      for (const room of rooms) {
        const b = h('button', room.name === g.net.room ? 'cur' : '', `${esc(room.name)}<small>${+room.count || 0} / ${+room.max || 0}명${room.name === g.net.room ? ' · 현재' : ''}</small>`);
        b.disabled = room.count >= room.max;
        b.onclick = () => { g.net.switchRoom(room.name); this.closePanel(); };
        list.append(b);
      }
    } catch {
      list.append(h('div', 'row', '서버에 연결되어 있지 않아요 (오프라인 모드). 혼자서도 농장은 즐길 수 있어요!'));
    }
  }

  // ---------------------------------------------------------------- 주민 대화
  openVillager(e, line) {
    const g = this.game, v = g.villagers, id = e.id, info = VILLAGERS[id];
    const p = this.openPanel(`🦄 ${e.n.name}`);
    const render = () => {
      p.querySelectorAll('.body').forEach((x) => x.remove());
      const body = h('div', 'body');
      const hearts = v.hearts(id);
      body.append(h('div', 'villager-line', `“${esc(line)}”`));
      body.append(h('div', 'row', `<span class="nm">우정 ${'❤️'.repeat(hearts)}${'🤍'.repeat(5 - hearts)}</span><span class="qty">${v.state[id].friendship}/100 · 성격 ${info.personality}</span>`));
      const req = v.requestFor(id, g.world.day, g.npcs.requestPool());
      const acts = h('div', 'room-list');
      if (!req.done) {
        const have = g.economy.count(req.item);
        const b = h('button', have >= req.n ? 'cur' : '', `📝 부탁: ${v.describeRequest(req)}<small>보유 ${have}/${req.n}</small>`);
        b.disabled = have < req.n;
        b.onclick = () => {
          if (!g.economy.take(req.item, req.n)) return;
          const r = v.fulfill(id);
          g.economy.earn(r.reward);
          g.audio.play('coin');
          this.toast(`🙏 ${e.n.name}: 고마워! +${r.reward}🪙, 우정 +${r.gained}`);
          g.npcs.applyRewards(e, r);
          render();
        };
        acts.append(b);
      } else acts.append(h('button', '', `✅ 오늘 부탁 완료<small>내일 또 놀러 와!</small>`));
      const gift = h('button', '', `🎁 선물하기<small>좋아하는 것: ${info.likes.map((k) => anyItem(k)?.emoji || '').join(' ')}</small>`);
      gift.disabled = v.state[id].lastGift === g.world.day;
      gift.onclick = () => this.openGiftPicker(e);
      acts.append(gift);
      if (id === 'merchant') { const m = h('button', '', '🛒 장터 열기<small>사고 팔기</small>'); m.onclick = () => this.openMarket(); acts.append(m); }
      if (id === 'guide') { const q = h('button', '', '📜 퀘스트<small>할 일 보기</small>'); q.onclick = () => this.openQuests(); acts.append(q); }
      body.append(acts);
      p.append(body);
    };
    render();
  }

  openGiftPicker(e) {
    const g = this.game, eco = g.economy;
    const p = this.openPanel(`🎁 ${e.n.name}에게 무엇을 줄까요?`);
    const grid = h('div', 'seed-grid');
    const all = { ...eco.inventory.crops, ...eco.inventory.products, ...eco.inventory.items };
    let any = false;
    for (const [k, n] of Object.entries(all)) {
      if (!n || ITEMS[k]?.cat === 'seed') continue;
      any = true;
      const it = anyItem(k);
      const liked = VILLAGERS[e.id].likes.includes(k);
      const b = h('button', '', `${it.emoji} ${it.name}${liked ? ' 💕' : ''}<span class="q">${n}개</span>`);
      b.onclick = () => {
        if (!eco.take(k, 1)) return;
        const r = g.villagers.gift(e.id, k, g.world.day);
        e.u.playAction(r.liked ? 'cheer' : 'heart', 1.8);
        e.u.say(r.liked ? '와아! 이거 정말 좋아해! 💕' : '고마워, 잘 쓸게!', 3);
        g.audio.play(r.liked ? 'win' : 'coin');
        this.toast(`🎁 ${it.name} 선물! 우정 +${r.gained}${r.liked ? ' (아주 좋아해요!)' : ''}`);
        g.npcs.applyRewards(e, r);
        this.closePanel();
      };
      grid.append(b);
    }
    if (!any) grid.append(h('div', 'row', '줄 수 있는 물건이 없어요. 작물·과일·물고기를 모아 보세요!'));
    p.append(grid);
  }

  // ---------------------------------------------------------------- 도감
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
  }

  // ---------------------------------------------------------------- 논 상태 / 탈곡
  showRice(s, sim) {
    if (!this.ricePanel) { this.ricePanel = h('div', 'smart-panel rice-panel'); this.root.append(this.ricePanel); }
    const st = s.state === 'growing' ? RICE_STAGES[s.stage] : null;
    const names = { dry: '마른 논', tilled: '갈아 둔 논', flooded: '물 댄 논 (모내기 준비)', growing: st?.name, ripe: '황금 들녘 (수확!)' };
    const band = st ? `<div class="band" style="left:${(st.water[0] / WATER_MAX) * 100}%;width:${((st.water[1] - st.water[0]) / WATER_MAX) * 100}%"></div>` : '';
    const ok = !st || (s.water >= st.water[0] && s.water <= st.water[1]);
    const html = `<h3>🌾 ${names[s.state]}</h3>
      <div class="gauge${ok ? '' : ' bad'}"><div class="lbl"><span>물 높이</span><span>${s.water.toFixed(1)}cm${st ? ` (적정 ${st.water[0]}~${st.water[1]})` : ''}</span></div><div class="track">${band}<div class="pin" style="left:calc(${(s.water / WATER_MAX) * 100}% - 3px)"></div></div></div>
      ${s.state === 'growing' ? `<div class="gauge"><div class="lbl"><span>성장</span><span>${s.stage + 1}/4 단계 ${Math.round(s.progress * 100)}%</span></div><div class="track"><div class="band" style="left:0;width:${((s.stage + s.progress) / 4) * 100}%"></div></div></div>
      <div class="lbl-row">품질 ${Math.round(s.quality)} · 잡초 ${'🌿'.repeat(s.weeds) || '없음'}</div>` : ''}
      <div class="lbl-row">농사 숙련도 Lv.${sim.skillLevel}</div>`;
    if (html !== this.riceHtml) { this.ricePanel.innerHTML = html; this.riceHtml = html; }
  }
  hideRice() { this.ricePanel?.remove(); this.ricePanel = null; this.riceHtml = null; }

  showThresh(onMash, band = [0.55, 0.9]) {
    this.hideThresh();
    const p = h('div', 'thresh-panel');
    p.innerHTML = `<h3><span class="drum">⚙️</span> 탈곡 <small class="msg"></small></h3><div class="track big"><div class="band" style="left:${band[0] * 100}%;width:${(band[1] - band[0]) * 100}%"></div><div class="fill"></div></div><div class="t"></div>`;
    this._drumA = 0;
    const b = h('button', 'gold mash', '👊 연타!');
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); onMash(); });
    p.append(b);
    this.root.append(p);
    this.threshPanel = p;
  }
  updateThresh(gauge, left, s = {}) {
    const P = this.threshPanel;
    if (!P) return;
    const f = P.querySelector('.fill');
    f.style.width = `${Math.round(gauge * 100)}%`;
    f.className = `fill ${s.jam ? 'jam' : s.ok ? 'ok' : gauge > 0.9 ? 'hot' : ''}`;
    this._drumA = (this._drumA + gauge * 40) % 360;
    P.querySelector('.drum').style.transform = `rotate(${this._drumA}deg)`;
    const msg = s.jam ? '🔥 과열!' : s.ok ? '좋아요!' : '';
    const m = P.querySelector('.msg'); if (m.textContent !== msg) m.textContent = msg;
    P.querySelector('.t').innerHTML = `남은 시간 <b>${Math.max(0, left).toFixed(1)}</b>초 · 효율 ${Math.round(Math.min(1, (s.eff || 0) / 0.75) * 100)}%`;
    P.classList.toggle('warn', !!s.warn);
    P.classList.toggle('jam', !!s.jam);
  }
  hideThresh() { this.threshPanel?.remove(); this.threshPanel = null; }

  snapshot() {
    const g = this.game;
    g.postfx.render();
    const url = g.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = `unico-farm-${Date.now()}.png`; a.click();
    g.audio.play('click');
    this.toast('📸 찰칵! 스크린샷을 저장했어요');
  }

  // ---------------------------------------------------------------- HUD
  /** 위쪽 막대(HUD)가 끝나는 높이를 CSS 변수로: 글자 크기를 키워 버튼이 두 줄이 돼도 미니맵·목표·알림이 그 아래로 */
  syncHudBottom() {
    const r = this.top.getBoundingClientRect();
    const z = +getComputedStyle(this.top).zoom || 1;
    const b = Math.round(r.bottom / z);
    if (b !== this._hudB && b > 0) { this._hudB = b; this.root.style.setProperty('--hud-b', `${b}px`); }
  }

  updateHud() {
    const now = performance.now();
    if (!(now - (this._hudSync || 0) < 500)) { this._hudSync = now; this.syncHudBottom(); }
    const g = this.game;
    // 코인: 숫자가 굴러가며 바뀜
    const target = g.economy.money;
    if (this.shownMoney === undefined) this.shownMoney = target;
    if (this.shownMoney !== target) {
      const diff = target - this.shownMoney;
      this.shownMoney += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.18));
      if (Math.abs(target - this.shownMoney) < 1) this.shownMoney = target;
      const el = this.moneyChip.querySelector('.money');
      if (diff > 0 && !el.classList.contains('bump')) { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 400); }
    }
    // 값이 바뀔 때만 DOM 에 씀 (매 프레임 쓰면 스타일 재계산·레이아웃이 계속 일어남)
    const el = (this._el ||= {
      money: this.moneyChip.querySelector('.money'), clock: this.clockChip.querySelector('span'), lv: this.levelChip.querySelector('.lv'),
      bar: this.levelChip.querySelector('.xpbar i'), xp: this.levelChip.querySelector('.xp'), boost: this.boostChip.querySelector('span'),
    });
    const put = (key, node, prop, v) => { if (this._hv?.[key] !== v) { (this._hv ||= {})[key] = v; if (prop === 'text') node.textContent = v; else if (prop === 'html') node.innerHTML = v; else node.style[prop] = v; } };
    put('money', el.money, 'text', Math.round(this.shownMoney).toLocaleString());
    put('clock', el.clock, 'text', g.world.clockText());
    const q = g.quests;
    put('lv', el.lv, 'text', String(q.level));
    const prev = q.level > 1 ? (q.nextXp === q.xp ? q.xp : LEVEL_PREV(q)) : 0;
    const pct = Math.min(100, Math.round(((q.xp - prev) / Math.max(1, q.nextXp - prev)) * 100));
    put('bar', el.bar, 'width', pct + '%');
    put('xp', el.xp, 'text', `${q.xp}/${q.nextXp}`);
    const bl = g.smartfarm.boostLeft;
    put('boostShow', this.boostChip, 'display', bl > 0 ? '' : 'none');
    if (bl > 0) put('boost', el.boost, 'text', `×${g.farm.sim.boost} ${Math.ceil(bl)}초`);
    const ev = g.economy.event, fest = g.economy.festival;
    put('banShow', this.banner, 'display', ev || fest ? '' : 'none');
    if (ev || fest) put('ban', this.banner, 'text', [fest?.name, ev && '📈 ' + ev.name].filter(Boolean).join('  ·  '));
    if (this._fest !== !!fest) { this._fest = !!fest; this.banner.classList.toggle('fest', !!fest); }
    const n = q.active().filter((x) => x.complete).length;
    put('quest', this.btnQuest, 'html', `📜<span class="lbl"> 퀘스트</span>${n ? ` <b style="color:#d9534f">(${n})</b>` : ''} <span class="hint-kbd">(Q)</span>`);
  }

  setBarOpen(open) {
    this.root.classList.toggle('bar-open', open);
    this.barToggle.textContent = open ? '✕' : '☰';
  }

  /** 오토플레이 상태 표시: text=null 이면 숨김 */
  setAuto(text, on) {
    this.autoBtn?.classList.toggle('on', !!on);
    if (!this.autoChip) {
      this.autoChip = h('div', 'auto-chip hidden');
      this.autoChip.onclick = () => this.game.autoplay.toggle(false);
      this.autoChip.title = '눌러서 오토플레이 끄기';
      document.getElementById('ui').append(this.autoChip);
    }
    this.autoChip.classList.toggle('hidden', !text);
    const html = text ? `<b>🤖 자동</b> ${text} <i>✕</i>` : '';
    if (html !== this.autoHtml) { this.autoChip.innerHTML = html; this.autoHtml = html; }
  }

  setPrompt(p) {
    this.currentPrompt = p;
    if (!p) { this.prompt.classList.add('hidden'); return; }
    this.prompt.classList.remove('hidden');
    this.prompt.classList.toggle('clickable', !!p.onInteract);
    const html = (p.onInteract ? '<kbd>E</kbd> ' : '') + esc(p.label) + (p.onInteract ? ' <span class="tapme">👆</span>' : ''); // 동물·반려견 이름 등 사용자가 정한 글자
    if (html !== this.promptHtml) { this.prompt.innerHTML = html; this.promptHtml = html; }
  }

  toast(text) {
    const t = h('div', 'toast');
    t.textContent = text; // 다른 플레이어 이름·방 이름·지명이 섞여도 HTML 로 해석하지 않음
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3200);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
  }

  setOnline(count, room) { this.online.textContent = count > 0 ? `🟢 접속 ${count}명 · ${room}` : '⚪ 오프라인 모드 (서버 없음)'; }
  chatLine(name, text, mine = false) {
    const d = h('div', '', `<b>${esc(name)}</b> ${esc(text)}`);
    if (mine) d.style.background = '#e4f7f4';
    this.chatLog.append(d);
    while (this.chatLog.children.length > 30) this.chatLog.firstChild.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  // ---------------------------------------------------------------- 패널
  closePanel() { this.panel?.remove(); this.panel = null; this.game.input.enabled = true; this.game.player.frozen = this.game.tractor.driving || this.game.smartfarm.active; }
  openPanel(title) {
    this.closePanel();
    this.game.input.enabled = false;
    this.game.player.frozen = true;
    const p = h('div', 'panel');
    const head = h('h2', '', `${title} <button class="ghost close">✕</button>`);
    head.querySelector('.close').onclick = () => this.closePanel();
    p.append(head);
    this.root.append(p);
    this.panel = p;
    return p;
  }

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
    const TABS = [['buy', '🌱 사기'], ['sell', '💰 팔기'], ['fac', '🛠️ 시설']];
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
        bt.onclick = () => { if (fn(n)) { g.audio.play('coin'); render(); } };
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
          seeds.append(buyRow(c.emoji, `${c.name} 씨앗`, eco.inventory.seeds[k] || 0, c.seedPrice, [[1, (n) => eco.buySeed(k, n)], [5, (n) => eco.buySeed(k, n)]], `${c.growTime}초 · 판매 ${c.basePrice}🪙${c.regrow ? ` · ${c.regrow}번 더 열림` : ''}`, locked));
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
          if (have > 1) { const b1 = h('button', '', '1개'); b1.onclick = () => { const got = eco.sell(k, 1); g.onEvent('sell', 1); g.audio.play('coin'); this.toast(`+${got} 코인`); render(); }; r.append(b1); }
          const b = h('button', 'gold', have > 1 ? `전부 ${(eco.sellPrice(k) * have).toLocaleString()}` : '판매');
          b.disabled = have <= 0;
          b.onclick = () => { const got = eco.sell(k, have); g.onEvent('sell', have); g.audio.play('coin'); this.toast(`+${got} 코인`); render(); };
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
          ab.onclick = () => { const n = sellables().reduce((a, [k]) => a + eco.count(k), 0); const got = eco.sellAll(); g.onEvent('sell', n); g.audio.play('coin'); this.toast(`+${got} 코인`); render(); };
          foot.append(ab);
        }
      } else {
        const fc = g.farmcraft, sim = g.farm.sim;
        body.append(h('h3', '', '🛠️ 농장 시설'));
        const fac = h('div', 'rows');
        const SPR = [400, 800, 1300];
        const sr = sim.sprinklerRows;
        const spr = h('div', 'row mk-row', `<span class="ic">💦</span><span class="nm">스프링클러 <span class="qty">${sr}/3줄</span><br><small>설치한 줄은 물이 마르면 자동으로 물을 줘요</small></span><span class="pr">${sr < 3 ? `${SPR[sr]}🪙` : '완료'}</span>`);
        if (sr < 3) { const bt = h('button', 'gold', `${sr + 1}번째 줄 설치`); bt.disabled = eco.money < SPR[sr]; bt.onclick = () => { if (eco.money < SPR[sim.sprinklerRows]) return; eco.money -= SPR[sim.sprinklerRows]; eco.stats.spent += SPR[sim.sprinklerRows]; sim.sprinklerRows++; g.audio.play('levelup'); this.toast(`💦 밭 ${sim.sprinklerRows}번째 줄에 스프링클러를 설치했어요!`); g.onEvent('sprinkler', sim.sprinklerRows); render(); }; spr.append(bt); }
        fac.append(spr);
        if (fc) {
          const jp = fc.proc.nextJarPrice;
          const jr = h('div', 'row mk-row', `<span class="ic">🏺</span><span class="nm">장독 추가 <span class="qty">${fc.proc.jars}/4개</span><br><small>밭 서쪽 장독대에서 김치·잼·주스를 동시에 더 담가요</small></span><span class="pr">${jp ? `${jp}🪙` : '완료'}</span>`);
          if (jp) { const bt = h('button', 'gold', '장독 사기'); bt.disabled = eco.money < jp; bt.onclick = () => { if (eco.money < jp || !fc.proc.buyJar()) return; eco.money -= jp; eco.stats.spent += jp; g.audio.play('levelup'); this.toast('🏺 장독대에 장독을 하나 더 놓았어요!'); render(); }; jr.append(bt); }
          fac.append(jr);
        }
        body.append(fac);
        body.append(h('p', 'mk-note', '🐄 가축 들이기·축사 넓히기는 목장의 <b>우리 목장</b>(축사 앞)에서 할 수 있어요'));
      }
      body.scrollTop = scroll;
    };
    render();
  }

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
  }

  openQuests() {
    const g = this.game;
    const p = this.openPanel('📜 퀘스트');
    const rec = h('div', 'mg-records', `<h3>🎮 미니게임 최고 기록</h3><div class="rows">${recordsHtml()}</div>`);
    const render = () => {
      p.querySelectorAll('.qrows').forEach((e) => e.remove());
      const rows = h('div', 'rows qrows');
      for (const q of g.quests.active()) {
        const r = h('div', `row quest${q.complete ? ' done' : ''}`, `<div style="flex:1"><div class="nm">${q.title}</div><div class="desc">${q.desc}</div><div class="bar"><i style="width:${Math.round((q.count / q.goal) * 100)}%"></i></div></div><span class="qty">${q.count}/${q.goal}</span>`);
        const b = h('button', q.complete ? 'gold' : 'ghost', q.complete ? `보상 +${q.reward.money}🪙` : `+${q.reward.money}🪙 ${q.reward.xp}XP`);
        b.disabled = !q.complete;
        b.onclick = () => { g.claimQuest(q.id); render(); };
        r.append(b);
        rows.append(r);
      }
      if (!rows.children.length) rows.append(h('div', 'row', '🎉 모든 퀘스트를 완료했어요!'));
      p.insertBefore(rows, rec);
    };
    p.append(rec);
    render();
  }

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
  }

  /** 화면 초당 프레임 표시 (환경설정에서 켜기) */
  updateFps(fps) {
    if (fps !== undefined) this.lastFps = fps;
    const on = !!this.game.gfx?.showFps;
    this.fpsChip.style.display = on ? 'block' : 'none';
    const f = Math.round(this.lastFps || 0);
    if (on) this.fpsChip.textContent = `${f} FPS · ${PRESET_INFO[this.game.quality.level]?.name || ''}`;
    const live = this.panel?.querySelector('.gfx-fps');
    if (live) live.textContent = f ? `지금 ${f} FPS` : '측정 중…';
  }

  /** 환경설정: 그래픽 품질 프리셋 + 세부 항목 (바로 적용, 브라우저에 저장) */
  openSettings() {
    const g = this.game;
    const p = this.openPanel('⚙️ 환경설정');
    p.dataset.kind = 'settings';
    const render = () => {
      const s = g.gfx;
      const cur = s.preset;
      const lvl = cur === 'auto' ? s.autoLevel : cur;
      const presetBtns = ['auto', 'low', 'medium', 'high'].map((k) => `<button class="gfx-preset ${cur === k ? 'on' : ''}" data-p="${k}"><b>${PRESET_INFO[k].name}</b>${k === 'auto' && cur === 'auto' ? `<small>지금: ${PRESET_INFO[s.autoLevel].name}</small>` : ''}</button>`).join('');
      p.querySelector('.gfx-body')?.remove();
      const body = h('div', 'gfx-body', `
        <h3>🖥️ 그래픽 품질 <span class="gfx-fps">측정 중…</span></h3>
        <div class="gfx-presets">${presetBtns}</div>
        <p class="gfx-desc">${PRESET_INFO[cur]?.desc || ''}${cur === 'custom' ? '' : lvl === 'low' ? ' · 저사양 PC 는 이 단계를 권장해요' : ''}</p>
        <h3>세부 설정</h3>
        <label class="gfx-row">해상도 <input type="range" min="50" max="100" step="5" data-k="scale" value="${Math.round(s.scale * 100)}"><span>${Math.round(s.scale * 100)}%</span></label>
        <label class="gfx-row">그림자 <select data-k="shadows">${Object.entries(SHADOWS).map(([k, v]) => `<option value="${k}" ${s.shadows === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
        <label class="gfx-row">풀·들꽃 양 <input type="range" min="0" max="100" step="5" data-k="grass" value="${Math.round(s.grass * 100)}"><span>${Math.round(s.grass * 100)}%</span></label>
        <label class="gfx-row check"><input type="checkbox" data-k="post" ${s.post ? 'checked' : ''}> 화면 효과 (빛 번짐·계단 현상 제거·색 보정)</label>
        <label class="gfx-row check"><input type="checkbox" data-k="ao" ${s.ao ? 'checked' : ''} ${s.post ? '' : 'disabled'}> 주변광 차폐 (구석 그늘, 가장 무거움)</label>
        <label class="gfx-row check"><input type="checkbox" data-k="tiltShift" ${s.tiltShift ? 'checked' : ''} ${s.post ? '' : 'disabled'}> 미니어처 초점 (위·아래 흐림)</label>
        <label class="gfx-row check"><input type="checkbox" data-k="showFps" ${s.showFps ? 'checked' : ''}> 화면에 FPS 표시</label>
        <h3>🔤 글자·버튼 크기</h3>
        <div class="gfx-presets ui-scales">${UI_SCALES.map((u) => `<button class="gfx-preset ${uiScaleOf(s) === u.v ? 'on' : ''}" data-ui="${u.v}" style="font-size:${Math.round(14 * u.v)}px"><b>${u.name}</b></button>`).join('')}</div>
        <p class="gfx-tip">💡 끊긴다면: 품질 '낮음' → 해상도 낮추기 → 그림자 끄기 순으로 시도해 보세요. 설정은 이 브라우저에 저장돼요.</p>`);
      p.append(body);
      body.querySelectorAll('.gfx-preset[data-p]').forEach((b) => (b.onclick = () => { g.setGraphics(applyPreset(g.gfx, b.dataset.p)); render(); }));
      body.querySelectorAll('[data-ui]').forEach((b) => (b.onclick = () => { g.setGraphics({ ...g.gfx, uiScale: +b.dataset.ui }); g.audio.play('click'); render(); }));
      body.querySelectorAll('[data-k]').forEach((el) => {
        const k = el.dataset.k;
        const commit = () => {
          let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value / 100 : el.value;
          const next = { ...g.gfx, [k]: v };
          if (k !== 'showFps') next.preset = matchPreset(next);
          g.setGraphics(next);
          render();
        };
        if (el.type === 'range') el.oninput = () => (el.nextElementSibling.textContent = el.value + '%');
        el.onchange = commit;
      });
      this.updateFps();
    };
    render();
  }

  openHelp() {
    const p = this.openPanel('❔ 유니코 팜 도움말');
    p.append(h('div', 'rows', [
      '🚶 <b>이동</b> 키보드 WASD/방향키 · 마우스 클릭 또는 터치 탭으로 그 자리까지 이동 · 모바일 왼쪽 조이스틱',
      '👆 <b>상호작용</b> E 키 · 밭/동물/NPC/트랙터를 클릭·탭하면 걸어가서 자동 실행 · 하단 안내 말풍선을 눌러도 실행',
      '🎥 <b>시점</b> 마우스 드래그(왼쪽/오른쪽) 또는 오른쪽 화면 드래그로 회전 · 휠 또는 두 손가락으로 확대/축소 · 나무·건물이 가리면 그 부분만 투명해져요',
      '⚙️ <b>환경설정</b> 오른쪽 위 ⚙️ 버튼 → 그래픽 품질(자동·낮음·보통·높음)과 해상도·그림자·풀 양 조절. 화면이 끊기면 \'낮음\'을 골라 보세요',
      '🗺️ <b>지도</b> 오른쪽 위 미니맵을 누르거나 M 키 → 큰 지도에서 원하는 곳이나 장소 버튼을 누르면 바로 이동',
      '🌱 <b>농사</b> 밭 근처에서 E: 갈기 → 씨앗 심기 → 물 주기 → 수확. 물을 주면 3배 빨리 자라요',
      '🛒 <b>장터</b> 북쪽 장터 유니코에게 씨앗·사료를 사고 작물을 팔아요. 시세는 매일 바뀌고 수요 이벤트가 생겨요',
      '🚜 <b>트랙터</b> 60초 밭갈이 미니게임. 키보드 W/S/A/D·SPACE 또는 화면의 ◀ ▶ ▲ ▼·쟁기 버튼 (바위 주의)',
      '📱 <b>스마트팜</b> 서쪽 비닐하우스 센서에서 환경제어 미니게임 → 성공하면 작물 성장 부스트',
      '🐄 <b>목장</b> 동쪽 울타리 안 동물에게 사료를 주면 달걀·우유·양털이 생겨요. 말·당나귀·알파카와 반려견 콩이는 쓰다듬을 수 있어요',
      '📜 <b>퀘스트</b> Q 키. 보상을 받으면 레벨이 오르고 새 작물이 해금돼요',
      '🌦️ <b>날씨</b> 내 위치의 실제 날씨가 반영돼요. 비가 오면 밭에 자동으로 물이 뿌려지고, 눈이 오면 작물이 천천히 자라요 (상단 날씨 칩을 눌러 확인·체험)',
      '🏢 <b>KOAT 체험관</b> 하단 🏢 버튼 또는 북동쪽 광장. 6개 본부(기술사업·벤처창업·종자사업·스마트농업·농기계검정·농업환경분석) 부스에서 미니게임으로 하는 일을 체험하고 스탬프를 모아요',
      '🌐 <b>메타버스</b> 같은 서버의 다른 유니코가 보이고 채팅할 수 있어요 (좌하단)',
      '💾 자동 저장(10초) · 로컬 브라우저 저장',
    ].map((t) => {
      const m = t.match(/^(\S+)\s+<b>(.*?)<\/b>\s*(.*)$/);
      return m ? `<div class="row help-row"><span class="ic">${m[1]}</span><b>${m[2]}</b><span class="ds">${m[3]}</span></div>` : `<div class="row">${t}</div>`;
    }).join('')));
    const reset = h('button', 'ghost', '🗑 저장 데이터 초기화');
    reset.style.marginTop = '10px';
    reset.onclick = () => { if (confirm('저장된 농장을 지우고 처음부터 시작할까요?')) this.game.resetSave(); };
    p.append(reset);
  }

  result(title, lines) {
    const p = this.openPanel(title);
    p.dataset.kind = 'result'; // 오토플레이 중에는 잠시 보여 준 뒤 자동으로 닫음
    p.append(h('div', 'rows', lines.map((t) => `<div class="row">${t}</div>`).join('')));
    const b = h('button', '', '확인');
    b.style.marginTop = '10px';
    b.onclick = () => this.closePanel();
    p.append(b);
  }

  // ---------------------------------------------------------------- 미니게임 HUD
  showMinigame(kind, s) {
    this.hideMinigame();
    this.miniHud = h('div', 'mini-hud', `<div class="tm"><small>남은 시간</small><span class="t">${Math.ceil(s.time)}</span>s</div><div><small>갈아낸 칸</small><span class="s">${s.score}</span>/${s.max}<i class="prog"><b></b></i></div><div class="stk"><small>연속</small><span class="k">0</span>🔥</div>`);
    this.miniMax = s.max;
    this.root.append(this.miniHud);
    // 마우스/터치용 운전 버튼 (누르고 있는 동안 동작)
    const inp = this.game.input;
    const pad = h('div', 'drive-pad');
    const hold = (label, cls, on, off) => {
      const b = h('button', cls, label);
      const start = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('on'); on(); };
      const stop = () => { b.classList.remove('on'); off(); };
      b.addEventListener('pointerdown', start);
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointercancel', stop);
      b.addEventListener('lostpointercapture', stop);
      return b;
    };
    const steer = h('div', 'pad-steer');
    steer.append(hold('◀', 'pad-btn', () => (inp.virtual.x = -1), () => inp.virtual.x === -1 && (inp.virtual.x = 0)),
      hold('▶', 'pad-btn', () => (inp.virtual.x = 1), () => inp.virtual.x === 1 && (inp.virtual.x = 0)));
    const pedals = h('div', 'pad-pedals');
    pedals.append(hold('▲<small>전진</small>', 'pad-btn gas', () => (inp.virtual.y = -1), () => inp.virtual.y === -1 && (inp.virtual.y = 0)),
      hold('▼<small>후진</small>', 'pad-btn', () => (inp.virtual.y = 1), () => inp.virtual.y === 1 && (inp.virtual.y = 0)));
    const extra = h('div', 'pad-extra');
    const plow = h('button', 'pad-small', '🪓 쟁기');
    plow.onclick = () => { this.game.tractor.plowDown = !this.game.tractor.plowDown; this.game.audio.play('click'); };
    const exit = h('button', 'pad-small ghost', '🚪 내리기');
    exit.onclick = () => this.game.tractor.dismount(false);
    extra.append(plow, exit);
    pad.append(steer, extra, pedals);
    this.root.append(pad);
    this.drivePad = pad;
    this.bar.style.display = 'none';
  }
  updateMinigame(s) {
    const H = this.miniHud;
    if (!H) return;
    const t = Math.ceil(s.time), k = s.streak || 0;
    if (t !== this._mgT) { this._mgT = t; H.querySelector('.t').textContent = t; }
    if (s.score !== this._mgS) { this._mgS = s.score; H.querySelector('.s').textContent = s.score; H.querySelector('.prog b').style.width = `${Math.min(100, (s.score / (this.miniMax || 1)) * 100)}%`; }
    if (k !== this._mgK) { this._mgK = k; const el = H.querySelector('.k'); el.textContent = k; H.querySelector('.stk').classList.toggle('hot', k >= 10); el.classList.remove('bump'); void el.offsetWidth; if (k > 1) el.classList.add('bump'); }
    H.querySelector('.tm').classList.toggle('warn', !!s.warn);
  }
  hideMinigame() {
    this.miniHud?.remove(); this.miniHud = null;
    this.drivePad?.remove(); this.drivePad = null;
    this.game.input.virtual.x = this.game.input.virtual.y = 0;
    this.bar.style.display = '';
  }

  showSmartfarm(sim, onAct) {
    this.hideSmartfarm();
    const p = h('div', 'smart-panel');
    p.append(h('h3', '', '📱 스마트팜 환경 제어'));
    this.gauges = {};
    for (const [k, v] of Object.entries(sim.vars)) {
      const g = h('div', 'gauge', `<div class="lbl"><span>${v.name}</span><span class="val"></span></div><div class="track"><div class="band" style="left:${pct(v.min, v)}%;width:${pct(v.max, v) - pct(v.min, v)}%"></div><div class="pin"></div></div>`);
      p.append(g);
      this.gauges[k] = g;
    }
    const acts = h('div', 'smart-actions');
    for (const [k, a] of Object.entries(sim.actions)) { const b = h('button', '', a.name); b.onclick = () => onAct(k); acts.append(b); }
    p.append(acts);
    this.smartEv = h('div', 'smart-ev', '');
    p.append(this.smartEv);
    this.smartTimer = h('div', 'smart-timer', '');
    p.append(this.smartTimer);
    this.root.append(p);
    this.smart = p;
    this.updateSmartfarm(sim);
  }
  /** 스마트팜 돌발 상황 알림 */
  smartEvent(text) {
    if (!this.smartEv) return;
    this.smartEv.textContent = text;
    this.smartEv.classList.remove('show'); void this.smartEv.offsetWidth; this.smartEv.classList.add('show');
  }
  updateSmartfarm(sim, warn = false) {
    if (!this.smart) return;
    this.smartTimer.classList.toggle('warn', warn);
    if (this.smartEv && !sim.event && this.smartEv.classList.contains('show')) this.smartEv.classList.remove('show');
    for (const [k, v] of Object.entries(sim.vars)) {
      const g = this.gauges[k];
      g.classList.toggle('bad', !sim.inRange(v));
      g.querySelector('.val').textContent = `${Math.round(v.value)}${v.unit} (목표 ${v.min}~${v.max})`;
      g.querySelector('.pin').style.left = `calc(${pct(v.value, v)}% - 3px)`;
    }
    this.smartTimer.textContent = `⏱ ${Math.ceil(sim.time)}초 · 적정 유지 ${sim.good.toFixed(1)}초`;
  }
  hideSmartfarm() { this.smart?.remove(); this.smart = null; }
}

function pct(x, v) { return Math.round(((x - v.lo) / (v.hi - v.lo)) * 100); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
import { LEVELS } from '../game/sim/quests.js';
function LEVEL_PREV(q) { return LEVELS[q.level - 1] || 0; }

installKoatUI(UI);
