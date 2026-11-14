// 놀이 중 화면: 논 상태·탈곡·트랙터 미니게임·스마트팜 HUD
import { h, pct } from '../dom.js';
import { RICE_STAGES, WATER_MAX } from '../../game/sim/rice.js';

/** 논·탈곡·미니게임·스마트팜 HUD 메서드 (UI.prototype 에 합쳐짐) */
export const ActivityUI = {
  showRice(s, sim) {
    if (!this.ricePanel) { this.ricePanel = h('div', 'smart-panel rice-panel'); this.root.append(this.ricePanel); }
    const st = s.state === 'growing' ? RICE_STAGES[s.stage] : null;
    const names = { dry: '마른 논', tilled: '갈아 둔 논', flooded: '물 댄 논 (모내기 준비)', growing: st?.name, ripe: '황금 들녘 (수확!)' };
    const band = st ? `<div class="band" style="left:${(st.water[0] / WATER_MAX) * 100}%;width:${((st.water[1] - st.water[0]) / WATER_MAX) * 100}%"></div>` : '';
    const ok = !st || (s.water >= st.water[0] && s.water <= st.water[1]);
    const html = `<h3>🌾 ${names[s.state]}</h3>
      <div class="gauge${ok ? '' : ' bad'}"><div class="lbl"><span>물 높이</span><span>${s.water.toFixed(1)}cm${st ? `<small class="opt"> (적정 ${st.water[0]}~${st.water[1]})</small>` : ''}</span></div><div class="track">${band}<div class="pin" style="left:calc(${(s.water / WATER_MAX) * 100}% - 3px)"></div></div></div>
      ${s.state === 'growing' ? `<div class="gauge"><div class="lbl"><span>성장</span><span><small class="opt">${s.stage + 1}/4 단계 </small>${Math.round(s.progress * 100)}%</span></div><div class="track"><div class="band" style="left:0;width:${((s.stage + s.progress) / 4) * 100}%"></div></div></div>
      <div class="lbl-row">품질 ${Math.round(s.quality)} · 잡초 ${'🌿'.repeat(s.weeds) || '없음'}</div>` : ''}
      <div class="lbl-row">농사 숙련도 Lv.${sim.skillLevel}</div>`;
    if (html !== this.riceHtml) { this.ricePanel.innerHTML = html; this.riceHtml = html; }
  },

  hideRice() { this.ricePanel?.remove(); this.ricePanel = null; this.riceHtml = null; },

  showThresh(onMash, band = [0.55, 0.9]) {
    this.hideThresh();
    const p = h('div', 'thresh-panel');
    p.innerHTML = `<h3><span class="drum">⚙️</span> 탈곡 <small class="msg"></small></h3><div class="track big"><div class="band" style="left:${band[0] * 100}%;width:${(band[1] - band[0]) * 100}%"></div><div class="fill"></div></div><div class="t">남은 시간 <b class="sec"></b>초 · 효율 <span class="eff"></span>%</div>`;
    this._drumA = 0;
    // 매 프레임 찾지 않게 한 번만, 쓸 때는 바뀐 값만 (last)
    this._th = { fill: p.querySelector('.fill'), drum: p.querySelector('.drum'), msg: p.querySelector('.msg'), sec: p.querySelector('.sec'), eff: p.querySelector('.eff'), last: {} };
    const b = h('button', 'gold mash', '👊 연타!');
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); onMash(); });
    p.append(b);
    this.root.append(p);
    this.threshPanel = p;
  },

  updateThresh(gauge, left, s = {}) {
    const P = this.threshPanel, T = this._th;
    if (!P || !T) return;
    const L = T.last, set = (k, v, fn) => { if (L[k] !== v) { L[k] = v; fn(v); } };
    set('w', `${Math.round(gauge * 100)}%`, (v) => (T.fill.style.width = v));
    set('cls', `fill ${s.jam ? 'jam' : s.ok ? 'ok' : gauge > 0.9 ? 'hot' : ''}`, (v) => (T.fill.className = v));
    this._drumA = (this._drumA + gauge * 40) % 360;
    T.drum.style.transform = `rotate(${this._drumA}deg)`; // 계속 돌아가는 연출 (transform 은 합성만)
    set('msg', s.jam ? '🔥 과열!' : s.ok ? '좋아요!' : '', (v) => (T.msg.textContent = v));
    set('sec', Math.max(0, left).toFixed(1), (v) => (T.sec.textContent = v));
    set('eff', String(Math.round(Math.min(1, (s.eff || 0) / 0.75) * 100)), (v) => (T.eff.textContent = v));
    set('warn', !!s.warn, (v) => P.classList.toggle('warn', v));
    set('jam', !!s.jam, (v) => P.classList.toggle('jam', v));
  },

  hideThresh() { this.threshPanel?.remove(); this.threshPanel = null; this._th = null; },

  /** 탈것 운전 버튼 (마우스·터치, 누르고 있는 동안 동작). plow = 트랙터 쟁기 버튼 */
  showDrivePad({ plow: hasPlow = false } = {}) {
    this.hideDrivePad();
    const inp = this.game.input;
    const pad = h('div', 'drive-pad');
    const hold = (label, cls, on, off) => {
      const b = h('button', cls, label);
      const start = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('on'); on(); };
      const stop = () => { b.classList.remove('on'); off(); };
      b.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false }); // iOS 길게 누르기가 끼어들지 않게 (포인터 이벤트는 그대로 옴)
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
    if (hasPlow) {
      const plow = h('button', 'pad-small', '🪓 쟁기');
      plow.onclick = () => { this.game.ride.plowDown = !this.game.ride.plowDown; this.game.audio.play('click'); };
      extra.append(plow);
    }
    const exit = h('button', 'pad-small ghost', '🚪 내리기');
    exit.onclick = () => this.game.ride.dismount();
    extra.append(exit);
    pad.append(steer, extra, pedals);
    this.root.append(pad);
    this.drivePad = pad;
    this.bar.style.display = 'none';
    // 운전 중: 메뉴를 접고, E·☰ 버튼은 숨김 (CSS #ui.driving). ▼후진 바로 밑 E 를 잘못 눌러 내리지 않게
    this.setBarOpen(false);
    this.root.classList.add('driving');
  },

  hideDrivePad() {
    this.drivePad?.remove(); this.drivePad = null;
    this.game.input.virtual.x = this.game.input.virtual.y = 0;
    this.bar.style.display = '';
    this.root.classList.remove('driving');
  },

  showSmartfarm(sim, onAct) {
    this.hideSmartfarm();
    const p = h('div', 'smart-panel');
    p.append(h('h3', '', '📱 스마트팜 환경 제어'));
    this.gauges = {};
    for (const [k, v] of Object.entries(sim.vars)) {
      const g = h('div', 'gauge', `<div class="lbl"><span>${v.name}</span><span class="val"></span></div><div class="track"><div class="band" style="left:${pct(v.min, v)}%;width:${pct(v.max, v) - pct(v.min, v)}%"></div><div class="pin"></div></div>`);
      p.append(g);
      this.gauges[k] = { el: g, val: g.querySelector('.val'), pin: g.querySelector('.pin'), last: {} }; // 매 프레임 찾지 않게
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
  },

  /** 스마트팜 돌발 상황 알림 */
  smartEvent(text) {
    if (!this.smartEv) return;
    this.smartEv.textContent = text;
    this.smartEv.classList.remove('show'); void this.smartEv.offsetWidth; this.smartEv.classList.add('show');
  },

  updateSmartfarm(sim, warn = false) {
    if (!this.smart) return;
    if (this._smWarn !== warn) { this._smWarn = warn; this.smartTimer.classList.toggle('warn', warn); }
    if (this.smartEv && !sim.event && this.smartEv.classList.contains('show')) this.smartEv.classList.remove('show');
    // 값이 바뀔 때만 DOM 에 씀 (게이지 숫자·핀은 정수 % 라 1초에 몇 번뿐)
    for (const [k, v] of Object.entries(sim.vars)) {
      const g = this.gauges[k], L = g.last;
      const bad = !sim.inRange(v), txt = `${Math.round(v.value)}${v.unit} (목표 ${v.min}~${v.max})`, pp = pct(v.value, v);
      if (L.bad !== bad) { L.bad = bad; g.el.classList.toggle('bad', bad); }
      if (L.txt !== txt) { L.txt = txt; g.val.textContent = txt; }
      if (L.pct !== pp) { L.pct = pp; g.pin.style.left = `calc(${pp}% - 3px)`; }
    }
    const tt = `⏱ ${Math.ceil(sim.time)}초 · 적정 유지 ${sim.good.toFixed(1)}초`;
    if (this._smT !== tt) { this._smT = tt; this.smartTimer.textContent = tt; }
  },

  hideSmartfarm() { this.smart?.remove(); this.smart = null; this._smWarn = this._smT = undefined; },
};
