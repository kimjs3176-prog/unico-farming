import { CROPS, PRODUCTS, FEED_PRICE } from '../game/sim/crops.js';

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
    this.btnBag = h('button', 'ghost', '🎒 가방 <span class="hint-kbd">(I)</span>');
    this.btnQuest = h('button', 'ghost', '📜 퀘스트 <span class="hint-kbd">(Q)</span>');
    this.btnHelp = h('button', 'ghost', '❔');
    this.btnBag.onclick = () => this.openInventory();
    this.btnQuest.onclick = () => this.openQuests();
    this.btnHelp.onclick = () => this.openHelp();
    right.append(this.btnBag, this.btnQuest, this.btnHelp);
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
    this.bar.append(h('div', 'sep'));
    mk('🏡', '농장 방', () => this.openRooms());
    this.soundBtn = mk('🔊', '소리', () => { game.audio.enabled = !game.audio.enabled; this.soundBtn.firstChild.textContent = game.audio.enabled ? '🔊' : '🔇'; });
    mk('📸', '찰칵', () => this.snapshot());
    root.append(this.bar);
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
        const b = h('button', room.name === g.net.room ? 'cur' : '', `${room.name}<small>${room.count} / ${room.max}명${room.name === g.net.room ? ' · 현재' : ''}</small>`);
        b.disabled = room.count >= room.max;
        b.onclick = () => { g.net.switchRoom(room.name); this.closePanel(); };
        list.append(b);
      }
    } catch {
      list.append(h('div', 'row', '서버에 연결되어 있지 않아요 (오프라인 모드). 혼자서도 농장은 즐길 수 있어요!'));
    }
  }

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
  updateHud() {
    const g = this.game;
    this.moneyChip.querySelector('.money').textContent = g.economy.money.toLocaleString();
    this.clockChip.querySelector('span').textContent = g.world.clockText();
    const q = g.quests;
    this.levelChip.querySelector('.lv').textContent = q.level;
    const prev = q.level > 1 ? (q.nextXp === q.xp ? q.xp : LEVEL_PREV(q)) : 0;
    const pct = Math.min(100, Math.round(((q.xp - prev) / Math.max(1, q.nextXp - prev)) * 100));
    this.levelChip.querySelector('.xpbar i').style.width = pct + '%';
    this.levelChip.querySelector('.xp').textContent = `${q.xp}/${q.nextXp}`;
    const bl = g.smartfarm.boostLeft;
    this.boostChip.style.display = bl > 0 ? '' : 'none';
    if (bl > 0) this.boostChip.querySelector('span').textContent = `×${g.farm.sim.boost} ${Math.ceil(bl)}초`;
    const ev = g.economy.event;
    this.banner.style.display = ev ? '' : 'none';
    if (ev) this.banner.textContent = '📈 ' + ev.name;
    const n = q.active().filter((x) => x.complete).length;
    this.btnQuest.innerHTML = `📜 퀘스트${n ? ` <b style="color:#d9534f">(${n})</b>` : ''} <span class="hint-kbd">(Q)</span>`;
  }

  setPrompt(p) {
    this.currentPrompt = p;
    if (!p) { this.prompt.classList.add('hidden'); return; }
    this.prompt.classList.remove('hidden');
    this.prompt.classList.toggle('clickable', !!p.onInteract);
    const html = (p.onInteract ? '<kbd>E</kbd> ' : '') + p.label + (p.onInteract ? ' <span class="tapme">👆</span>' : '');
    if (html !== this.promptHtml) { this.prompt.innerHTML = html; this.promptHtml = html; }
  }

  toast(text) {
    const t = h('div', 'toast', text);
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

  openMarket() {
    const g = this.game, eco = g.economy;
    const p = this.openPanel('🛒 농산물 장터');
    const render = () => {
      p.querySelectorAll('.body').forEach((e) => e.remove());
      const body = h('div', 'body');
      body.append(h('div', 'chip', `🪙 보유 <span class="money">${eco.money.toLocaleString()}</span> 코인`));
      body.append(h('h3', '', '🌱 씨앗 구매 (레벨에 따라 해금)'));
      const seeds = h('div', 'rows');
      for (const [k, c] of Object.entries(CROPS)) {
        const locked = g.quests.level < c.unlockLevel;
        const r = h('div', 'row', `<span>${c.emoji}</span><span class="nm">${c.name} 씨앗 <span class="qty">보유 ${eco.inventory.seeds[k] || 0}</span></span><span class="pr">${c.seedPrice}🪙</span>`);
        const b1 = h('button', '', locked ? `Lv.${c.unlockLevel} 해금` : '1개');
        const b5 = h('button', '', '5개');
        b1.disabled = locked || eco.money < c.seedPrice; b5.disabled = locked || eco.money < c.seedPrice * 5;
        b1.onclick = () => { eco.buySeed(k, 1); g.audio.play('coin'); render(); };
        b5.onclick = () => { eco.buySeed(k, 5); g.audio.play('coin'); render(); };
        r.append(b1, b5);
        seeds.append(r);
      }
      const fr = h('div', 'row', `<span>🌾</span><span class="nm">동물 사료 <span class="qty">보유 ${eco.inventory.feed}</span></span><span class="pr">${FEED_PRICE}🪙</span>`);
      const fb = h('button', '', '1개'); fb.disabled = eco.money < FEED_PRICE; fb.onclick = () => { eco.buyFeed(1); g.audio.play('coin'); render(); };
      const fb5 = h('button', '', '5개'); fb5.disabled = eco.money < FEED_PRICE * 5; fb5.onclick = () => { eco.buyFeed(5); g.audio.play('coin'); render(); };
      fr.append(fb, fb5);
      seeds.append(fr);
      body.append(seeds);
      body.append(h('h3', '', '📈 오늘의 시세 · 판매 (매일 변동, 수요 이벤트 시 2배)'));
      const sells = h('div', 'rows');
      let any = false;
      for (const [k, c] of Object.entries({ ...CROPS, ...PRODUCTS })) {
        const have = (eco.inventory.crops[k] || eco.inventory.products[k] || 0);
        const tr = eco.prices[k].trend;
        const trend = tr > 0 ? '<span class="trend-up">▲</span>' : tr < 0 ? '<span class="trend-down">▼</span>' : '–';
        const ev = eco.event?.item === k ? ' 🔥' : '';
        const r = h('div', 'row', `<span>${c.emoji}</span><span class="nm">${c.name}${ev} <span class="qty">보유 ${have}</span></span><span class="pr">${eco.sellPrice(k)}🪙 ${trend}</span>`);
        const b = h('button', 'gold', '전부 판매');
        b.disabled = have <= 0;
        b.onclick = () => { const got = eco.sell(k, have); g.onEvent('sell', have); g.audio.play('coin'); this.toast(`+${got} 코인`); render(); };
        r.append(b);
        sells.append(r);
        any = any || have > 0;
      }
      body.append(sells);
      if (any) { const all = h('button', 'gold', '🧺 모두 판매하기'); all.style.marginTop = '10px'; all.onclick = () => { const n = Object.values(eco.inventory.crops).reduce((a, b) => a + b, 0) + Object.values(eco.inventory.products).reduce((a, b) => a + b, 0); const got = eco.sellAll(); g.onEvent('sell', n); g.audio.play('coin'); this.toast(`+${got} 코인`); render(); }; body.append(all); }
      p.append(body);
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
    p.append(rows);
    const s = eco.stats;
    p.append(h('h3', '', `누적 수입 ${s.earned.toLocaleString()} · 지출 ${s.spent.toLocaleString()} · 판매 ${s.sold}개`));
  }

  openQuests() {
    const g = this.game;
    const p = this.openPanel('📜 퀘스트');
    const render = () => {
      p.querySelectorAll('.rows').forEach((e) => e.remove());
      const rows = h('div', 'rows');
      for (const q of g.quests.active()) {
        const r = h('div', `row quest${q.complete ? ' done' : ''}`, `<div style="flex:1"><div class="nm">${q.title}</div><div class="desc">${q.desc}</div><div class="bar"><i style="width:${Math.round((q.count / q.goal) * 100)}%"></i></div></div><span class="qty">${q.count}/${q.goal}</span>`);
        const b = h('button', q.complete ? 'gold' : 'ghost', q.complete ? `보상 +${q.reward.money}🪙` : `+${q.reward.money}🪙 ${q.reward.xp}XP`);
        b.disabled = !q.complete;
        b.onclick = () => { g.claimQuest(q.id); render(); };
        r.append(b);
        rows.append(r);
      }
      if (!rows.children.length) rows.append(h('div', 'row', '🎉 모든 퀘스트를 완료했어요!'));
      p.append(rows);
    };
    render();
  }

  openSeedPicker(onPick) {
    const g = this.game, eco = g.economy;
    const p = this.openPanel('🌱 어떤 씨앗을 심을까요?');
    const grid = h('div', 'seed-grid');
    for (const [k, c] of Object.entries(CROPS)) {
      const n = eco.inventory.seeds[k] || 0;
      if (!n) continue;
      const b = h('button', '', `${c.emoji} ${c.name}<span class="q">${n}개 · ${c.growTime}초 · ${c.basePrice}🪙</span>`);
      b.onclick = () => { this.closePanel(); onPick(k); };
      grid.append(b);
    }
    p.append(grid);
  }

  openHelp() {
    const p = this.openPanel('❔ 유니코 팜 도움말');
    p.append(h('div', 'rows', [
      '🚶 <b>이동</b> 키보드 WASD/방향키 · 마우스 클릭 또는 터치 탭으로 그 자리까지 이동 · 모바일 왼쪽 조이스틱',
      '👆 <b>상호작용</b> E 키 · 밭/동물/NPC/트랙터를 클릭·탭하면 걸어가서 자동 실행 · 하단 안내 말풍선을 눌러도 실행',
      '🎥 <b>시점</b> 마우스 드래그(왼쪽/오른쪽) 또는 오른쪽 화면 드래그로 회전 · 휠 또는 두 손가락으로 확대/축소',
      '🌱 <b>농사</b> 밭 근처에서 E: 갈기 → 씨앗 심기 → 물 주기 → 수확. 물을 주면 3배 빨리 자라요',
      '🛒 <b>장터</b> 북쪽 장터 유니코에게 씨앗·사료를 사고 작물을 팔아요. 시세는 매일 바뀌고 수요 이벤트가 생겨요',
      '🚜 <b>트랙터</b> 60초 밭갈이 미니게임. 키보드 W/S/A/D·SPACE 또는 화면의 ◀ ▶ ▲ ▼·쟁기 버튼 (바위 주의)',
      '📱 <b>스마트팜</b> 서쪽 비닐하우스 센서에서 환경제어 미니게임 → 성공하면 작물 성장 부스트',
      '🐄 <b>목장</b> 동쪽 울타리 안 동물에게 사료를 주면 달걀·우유·양털이 생겨요',
      '📜 <b>퀘스트</b> Q 키. 보상을 받으면 레벨이 오르고 새 작물이 해금돼요',
      '🌦️ <b>날씨</b> 내 위치의 실제 날씨가 반영돼요. 비가 오면 밭에 자동으로 물이 뿌려지고, 눈이 오면 작물이 천천히 자라요 (상단 날씨 칩을 눌러 확인·체험)',
      '🌐 <b>메타버스</b> 같은 서버의 다른 유니코가 보이고 채팅할 수 있어요 (좌하단)',
      '💾 자동 저장(10초) · 로컬 브라우저 저장',
    ].map((t) => `<div class="row">${t}</div>`).join('')));
    const reset = h('button', 'ghost', '🗑 저장 데이터 초기화');
    reset.style.marginTop = '10px';
    reset.onclick = () => { if (confirm('저장된 농장을 지우고 처음부터 시작할까요?')) this.game.resetSave(); };
    p.append(reset);
  }

  result(title, lines) {
    const p = this.openPanel(title);
    p.append(h('div', 'rows', lines.map((t) => `<div class="row">${t}</div>`).join('')));
    const b = h('button', '', '확인');
    b.style.marginTop = '10px';
    b.onclick = () => this.closePanel();
    p.append(b);
  }

  // ---------------------------------------------------------------- 미니게임 HUD
  showMinigame(kind, s) {
    this.hideMinigame();
    this.miniHud = h('div', 'mini-hud', `<div><small>남은 시간</small><span class="t">${Math.ceil(s.time)}</span>s</div><div><small>갈아낸 칸</small><span class="s">${s.score}</span>/${s.max}</div>`);
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
  updateMinigame(s) { if (this.miniHud) { this.miniHud.querySelector('.t').textContent = Math.ceil(s.time); this.miniHud.querySelector('.s').textContent = s.score; } }
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
    this.smartTimer = h('div', 'smart-timer', '');
    p.append(this.smartTimer);
    this.root.append(p);
    this.smart = p;
    this.updateSmartfarm(sim);
  }
  updateSmartfarm(sim) {
    if (!this.smart) return;
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
