import { BattleSim, UNICO_SKILLS, PET_SKILLS, TYPES, BOOST_MAX } from './battle_sim.js';
import { rampRGB } from './pxl.js';

/**
 * 농장 지킴이 배틀 화면 (옥토패스풍 약점·브레이크·부스트, 포켓몬풍 화면 전환)
 *  - 저해상도(320×180) 도트 캔버스에 배경·적·유니코·콩이·피해 숫자를 그리고, 명령·상태는 도트 UI
 *  - 조작: ↑↓ 기술 고르기 · ←→ 부스트 0~3 · E 결정 · Esc 뒤로 (화면 버튼도 됨)
 */
const W = 320, H = 180;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Battle {
  constructor(game, pest) {
    this.g = game; this.pest = pest;
    this.sim = new BattleSim(pest.kind, { level: game.level, petHearts: game.pet.hearts });
    this.t = 0; this.fx = []; this.shake = 0; this.flash = {}; this.lunge = {};
    this.phase = 'intro'; this.who = 0; this.sel = 0; this.boost = 0; this.msg = '';
    this.night = pest.kind !== 'crow';
    this.buildDom();
    this.bg = this.makeBg();
    game.audio.play('bump', 0.6);
    setTimeout(() => game.audio.play(pest.kind === 'wolf' ? 'howl' : 'caw', 0.8), 400);
    this.run();
  }

  /* ── 화면 ── */
  buildDom() {
    const root = document.createElement('div');
    root.className = 'battle';
    root.innerHTML = `<canvas width="${W}" height="${H}"></canvas><div class="wipe"></div>
      <div class="b-enemy panel"><b class="en"></b><div class="hpbar"><i></i></div><div class="shield"></div></div>
      <div class="b-party panel"></div>
      <div class="b-cmd panel hidden"><div class="who"></div><div class="list"></div><div class="boost"><button data-b="-">◀</button><span></span><button data-b="+">▶</button></div><div class="tip">↑↓ 고르기 · ←→ 부스트 · E 결정 · Esc 뒤로</div></div>
      <div class="b-msg panel hidden"></div>`;
    document.getElementById('ui').appendChild(root);
    this.root = root;
    this.cv = root.querySelector('canvas'); this.cx = this.cv.getContext('2d'); this.cx.imageSmoothingEnabled = false;
    root.querySelector('[data-b="-"]').onclick = () => this.key('left');
    root.querySelector('[data-b="+"]').onclick = () => this.key('right');
    root.querySelector('.b-msg').onclick = () => this.key('ok');
    this.syncHud();
  }

  makeBg() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), N = this.night;
    // 하늘 (위로 갈수록 짙게)
    for (let y = 0; y < 100; y++) { const k = y / 100; g.fillStyle = N ? `rgb(${18 + k * 30 | 0},${20 + k * 34 | 0},${52 + k * 50 | 0})` : `rgb(${110 + k * 90 | 0},${170 + k * 60 | 0},${225 + k * 20 | 0})`; g.fillRect(0, y, W, 1); }
    if (N) { g.fillStyle = '#fff6c8'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % W, (i * 53) % 70, 1, 1); g.beginPath(); g.fillStyle = '#fff2b0'; g.arc(260, 28, 12, 0, 7); g.fill(); g.fillStyle = 'rgb(36,40,90)'; g.beginPath(); g.arc(266, 24, 11, 0, 7); g.fill(); }
    else { g.fillStyle = '#fffbe6'; for (const [x, y, r] of [[60, 30, 10], [74, 26, 12], [90, 31, 9], [230, 40, 9], [244, 36, 11]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }
    // 먼 숲 줄 (실루엣 2겹)
    for (const [y0, col] of [[78, N ? '#15233a' : '#5e9a6a'], [88, N ? '#0f1b2c' : '#3d7a4c']]) {
      g.fillStyle = col;
      for (let x = 0; x < W; x += 2) { const h = 8 + Math.sin(x * 0.11 + y0) * 4 + Math.sin(x * 0.37) * 2; g.fillRect(x, y0 - h, 2, h + 14); }
    }
    // 땅
    const grass = (l) => `rgb(${rampRGB('grass', l)})`;
    for (let y = 96; y < H; y++) { g.fillStyle = N ? `rgb(${28 + (y - 96) * 0.3 | 0},${48 + (y - 96) * 0.4 | 0},${48 + (y - 96) * 0.3 | 0})` : grass(y < 110 ? 3 : 4); g.fillRect(0, y, W, 1); }
    // 소품: 낮은 밭 이랑 / 밤은 목장 울타리
    if (!N) { for (let r = 0; r < 4; r++) { const y = 118 + r * 14; g.fillStyle = `rgb(${rampRGB('soil', 2)})`; g.fillRect(0, y, 140 - r * 6, 6); g.fillStyle = `rgb(${rampRGB('soil', 3)})`; g.fillRect(0, y, 140 - r * 6, 2); for (let x = 6; x < 130 - r * 6; x += 14) { g.fillStyle = `rgb(${rampRGB('leaf', 3)})`; g.fillRect(x, y - 3, 1, 3); g.fillRect(x - 1, y - 4, 1, 1); g.fillRect(x + 1, y - 4, 1, 1); } } }
    else { g.fillStyle = '#3a2a24'; for (let x = 4; x < W; x += 26) g.fillRect(x, 92, 3, 16); g.fillRect(0, 96, W, 2); g.fillRect(0, 103, W, 2); }
    // 풀잎 다발
    for (let i = 0; i < 70; i++) { const x = (i * 71) % W, y = 100 + (i * 37) % 76; g.fillStyle = N ? '#3e6a5a' : grass(5); g.fillRect(x, y, 1, 2); g.fillRect(x - 1, y + 1, 1, 1); g.fillRect(x + 1, y + 1, 1, 1); }
    return c;
  }

  syncHud() {
    const S = this.sim, E = S.enemy, R = this.root;
    R.querySelector('.en').textContent = `${E.name}${E.broken ? '  BREAK!' : ''}`;
    R.querySelector('.hpbar i').style.width = `${(E.hp / E.max) * 100}%`;
    const weak = E.weak.map((t) => (E.known.has(t) ? TYPES[t].icon : '?'));
    R.querySelector('.shield').innerHTML = `<span class="sh${E.broken ? ' br' : ''}">방패 ${E.broken ? 0 : E.shield}</span> 약점 ${weak.map((w) => `<i class="${w === '?' ? 'q' : ''}">${w}</i>`).join('')}`;
    R.querySelector('.b-party').innerHTML = S.party.map((m, i) => `<div class="pm${this.phase === 'cmd' && this.who === i ? ' on' : ''}${m.hp <= 0 ? ' down' : ''}"><b>${m.name}</b><div class="hpbar ${i ? 'pet' : ''}"><i style="width:${(m.hp / m.max) * 100}%"></i></div><span class="hp">${m.hp}/${m.max}</span><span class="bp">${'●'.repeat(m.bp)}${'○'.repeat(5 - m.bp)}</span></div>`).join('');
  }

  skillsOf(who) { return who === 0 ? [...UNICO_SKILLS, { id: 'flee', name: '도망치기', type: null }] : PET_SKILLS; }

  renderCmd() {
    const el = this.root.querySelector('.b-cmd');
    el.classList.toggle('hidden', this.phase !== 'cmd');
    if (this.phase !== 'cmd') return;
    const S = this.sim, list = this.skillsOf(this.who);
    el.querySelector('.who').textContent = `${S.party[this.who].name}의 차례`;
    el.querySelector('.list').innerHTML = list.map((s, i) => {
      const weak = s.type && S.enemy.known.has(s.type);
      return `<div class="row${i === this.sel ? ' sel' : ''}" data-i="${i}"><i class="cur">▶</i><span class="lb">${s.name}</span><span class="rt">${s.type ? TYPES[s.type].icon : ''}${weak ? ' <em>약점!</em>' : ''}</span></div>`;
    }).join('');
    el.querySelectorAll('.row').forEach((r) => { r.onclick = () => { this.sel = +r.dataset.i; this.key('ok'); }; });
    const mb = S.maxBoost(this.who);
    el.querySelector('.boost span').innerHTML = `부스트 ${'◆'.repeat(this.boost)}${'◇'.repeat(Math.max(0, mb - this.boost))} <small>(${1 + this.boost}번 공격)</small>`;
  }

  say(text, ms = 900) {
    const el = this.root.querySelector('.b-msg');
    el.textContent = text; el.classList.remove('hidden');
    return wait(ms);
  }
  hideMsg() { this.root.querySelector('.b-msg').classList.add('hidden'); }

  /* ── 진행 ── */
  async run() {
    await wait(650); // 화면 전환
    await this.say(`앗! ${this.sim.enemy.name}이(가) ${this.night ? '목장을 노리고 있다!' : '밭을 쪼아 먹고 있다!'}`, 1300);
    this.hideMsg();
    while (this.sim.state === 'fight') {
      // 파티 명령
      this.picks = [];
      for (this.who = 0; this.who < 2; this.who++) {
        if (this.sim.party[this.who].hp <= 0) { this.picks.push(null); continue; }
        const pick = await this.choose();
        if (pick === 'back') { this.who = -1; this.picks = []; continue; }
        this.picks.push(pick);
        if (pick.skill.id === 'flee') break;
      }
      this.phase = 'anim'; this.renderCmd(); this.syncHud();
      // 실행
      for (let i = 0; i < this.picks.length && this.sim.state === 'fight'; i++) {
        const p = this.picks[i]; if (!p) continue;
        if (p.skill.id === 'flee') {
          if (this.sim.flee()) { await this.say('살금살금… 도망쳤어요!', 1000); break; }
          await this.say('도망치지 못했어요!', 800); continue;
        }
        await this.perform(i, p.skill, p.boost);
      }
      if (this.sim.state !== 'fight') break;
      // 적 차례
      const ev = this.sim.enemyTurn();
      await this.enemyAnim(ev);
      this.syncHud();
    }
    await this.finish();
  }

  /** 한 명의 명령 고르기 → { skill, boost } | 'back' */
  choose() {
    this.hideMsg();
    this.phase = 'cmd'; this.sel = 0; this.boost = 0;
    this.syncHud(); this.renderCmd();
    return new Promise((res) => { this.pending = res; });
  }

  key(k) {
    if (this.phase === 'end' && k === 'ok') { this.endOk?.(); return; }
    if (this.phase !== 'cmd') return;
    const list = this.skillsOf(this.who);
    if (k === 'up') this.sel = (this.sel + list.length - 1) % list.length;
    else if (k === 'down') this.sel = (this.sel + 1) % list.length;
    else if (k === 'left') this.boost = Math.max(0, this.boost - 1);
    else if (k === 'right') this.boost = Math.min(this.sim.maxBoost(this.who), this.boost + 1, BOOST_MAX);
    else if (/^[1-9]$/.test(k) && +k <= list.length) this.sel = +k - 1;
    else if (k === 'ok') { const r = this.pending; this.pending = null; this.g.audio.play('click'); r?.({ skill: list[this.sel], boost: list[this.sel].id === 'flee' || list[this.sel].id === 'guard' ? 0 : this.boost }); return; }
    else if (k === 'back') { if (this.who > 0) { const r = this.pending; this.pending = null; r?.('back'); } return; }
    else return;
    this.g.audio.play('click', 0.4);
    this.renderCmd();
  }

  async perform(who, skill, boost) {
    const S = this.sim, name = S.party[who].name;
    if (boost) { this.g.audio.play('levelup', 0.5); await this.say(`${name}의 부스트 ×${boost + 1}!`, 500); }
    await this.say(`${name}의 ${skill.name}!`, 450);
    const ev = S.act(who, skill, boost);
    this.lunge[who === 0 ? 'unico' : 'pet'] = 0.35;
    if (skill.id === 'guard') { this.g.audio.play('pop'); await this.say('콩이가 앞을 막아섰다! (다음 피해 절반)', 800); this.syncHud(); return; }
    this.g.audio.play(skill.type === 'water' ? 'water' : skill.type === 'sound' ? (who ? 'bark' : 'shoo') : skill.type === 'light' ? 'pop' : 'stroke');
    for (const e of ev) {
      if (e.kind !== 'hit') continue;
      this.flash.enemy = 0.18; this.shake = e.broke ? 0.5 : e.weak ? 0.22 : 0.12;
      this.fx.push({ text: String(e.dmg), x: 92 + (Math.random() - 0.5) * 20, y: 92, t: 0, col: e.weak ? '#ffd870' : '#ffffff', big: e.weak });
      if (e.weak) this.fx.push({ text: '약점!', x: 92, y: 70, t: 0, col: '#ff8670' });
      if (e.broke) { this.fx.push({ text: 'BREAK!', x: 96, y: 56, t: 0, col: '#ffd870', huge: true }); this.g.audio.play('bump', 0.9); }
      this.g.audio.play('dig', 0.4);
      this.syncHud();
      await wait(e.broke ? 600 : 260);
    }
    if (S.state === 'win') return;
    await wait(200);
  }

  async enemyAnim(ev) {
    for (const e of ev) {
      if (e.kind === 'stunned') { await this.say(`${this.sim.enemy.name}은(는) 브레이크 상태라 움직이지 못한다!`, 1000); continue; }
      if (e.kind === 'recover') { this.fx.push({ text: '방패 회복', x: 92, y: 60, t: 0, col: '#c8ea80' }); await this.say(`${this.sim.enemy.name}이(가) 정신을 차렸다!`, 700); continue; }
      if (e.kind === 'enemy') {
        this.lunge.enemy = 0.4;
        await this.say(`${this.sim.enemy.name}의 ${e.move}!`, 450);
        if (e.buff) { this.g.audio.play('howl', 0.7); await this.say('늑대가 사나워졌다! (공격력 ↑)', 800); continue; }
        this.g.audio.play('bump', 0.5);
        const tgt = e.target === 0 ? 'unico' : 'pet';
        this.flash[tgt] = 0.2; this.shake = 0.15;
        this.fx.push({ text: String(e.dmg), x: e.target === 0 ? 236 : 270, y: 104, t: 0, col: '#ff8670' });
        this.syncHud();
        if (e.rattle) await this.say('깜짝 놀라 부스트 포인트가 1 줄었다!', 700);
        await wait(350);
      }
      if (e.kind === 'lose') await wait(200);
    }
  }

  async finish() {
    const g = this.g, S = this.sim, P = this.pest;
    this.phase = 'end'; this.renderCmd();
    if (S.state === 'win') {
      const coins = S.reward();
      this.fx.push({ text: '도망갔다!', x: 92, y: 70, t: 0, col: '#c8ea80' });
      g.audio.play('win');
      g.econ.earn(coins); g.report('shoo');
      await this.say(`${S.enemy.name}을(를) 쫓아냈어요! 밭과 목장을 지켰어요 · +${coins}코인`, 300);
    } else if (S.state === 'lose') {
      g.audio.play('bump');
      await this.say(P.kind === 'crow' ? '기운이 다 빠졌어요… 까마귀가 작물을 쪼아 먹고 날아갔어요' : `기운이 다 빠졌어요… ${S.enemy.name}이(가) 동물들을 놀라게 하고 숲으로 갔어요`, 300);
      if (P.kind === 'crow') { const pl = g.farm.plots[P.plot]; if (pl.state === 'ready') { pl.state = 'growing'; pl.progress = 0.5; } else if (pl.state === 'growing') pl.progress = Math.max(0, pl.progress - 0.3); }
      else for (const a of g.ranch.animals) { a.aff = Math.max(0, a.aff - 4); if (a.fedTimer > 0) a.fedTimer += 30; }
    }
    await new Promise((r) => { this.endOk = r; setTimeout(r, 4000); });
    this.close();
  }

  close() {
    const g = this.g, P = this.pest;
    this.root.classList.add('out');
    setTimeout(() => this.root.remove(), 400);
    g.battle = null;
    if (this.sim.state === 'fled') { P.inBattle = false; P.cool = 3; } else g.pestFlee(P);
    g.player.vx = g.player.vy = 0;
  }

  /* ── 매 프레임 그리기 ── */
  update(dt) {
    this.t += dt;
    const g = this.cx, S = this.g.S, Sm = this.sim;
    let sx = 0, sy = 0;
    if (this.shake > 0) { this.shake -= dt; sx = Math.round((Math.random() - 0.5) * 6 * this.shake * 4); sy = Math.round((Math.random() - 0.5) * 4 * this.shake * 4); }
    g.setTransform(1, 0, 0, 1, sx, sy);
    g.drawImage(this.bg, 0, 0);
    for (const k of Object.keys(this.flash)) this.flash[k] -= dt;
    for (const k of Object.keys(this.lunge)) this.lunge[k] -= dt;
    const ln = (k, dir) => (this.lunge[k] > 0 ? Math.round(Math.sin((this.lunge[k] / 0.35) * Math.PI) * 14 * dir) : 0);
    // 그림자
    g.fillStyle = 'rgba(10,8,30,0.35)';
    for (const [x, y, w] of [[92, 140, 46], [236, 146, 30], [276, 150, 22]]) { g.beginPath(); g.ellipse(x, y, w, w * 0.22, 0, 0, 7); g.fill(); }
    // 적 (2배, 숨 쉬듯 위아래 · 브레이크면 쓰러져 깜빡)
    const E = Sm.enemy, kind = this.pest.kind;
    const set = S.pest[kind];
    const fr = kind === 'crow' ? (Sm.state === 'win' ? 2 + (Math.floor(this.t * 12) % 2) : Math.floor(this.t * 2) % 2) : Math.floor(this.t * 2) % 2;
    const img = set[fr][0];
    const sc = kind === 'crow' ? 3 : 2;
    const ew = img.width * sc, eh = img.height * sc;
    let ex = 92 - ew / 2 + ln('enemy', 1), ey = 140 - eh + Math.round(Math.sin(this.t * 3) * 1.5);
    if (Sm.state === 'win') { const k = Math.min(1, (this.t - (this.winT ||= this.t)) / 1.2); ex -= k * 180; ey -= kind === 'crow' ? k * 80 : 0; }
    g.save();
    if (E.broken) { g.globalAlpha = Math.floor(this.t * 6) % 2 ? 0.75 : 1; }
    g.drawImage(img, Math.round(ex), Math.round(ey + (E.broken ? 6 : 0)), ew, eh);
    if (this.flash.enemy > 0) { g.globalCompositeOperation = 'source-atop'; }
    g.restore();
    if (this.flash.enemy > 0) { g.save(); g.globalAlpha = 0.7; g.filter = 'brightness(3)'; g.drawImage(img, Math.round(ex), Math.round(ey), ew, eh); g.restore(); }
    if (E.broken) { for (let k = 0; k < 3; k++) { const a = this.t * 4 + k * 2.1; g.fillStyle = '#ffd870'; g.fillRect(Math.round(92 + Math.cos(a) * 18), Math.round(ey + 2 + Math.sin(a) * 4), 2, 2); } }
    // 파티 (왼쪽 보기, 1.5배)
    const party = [['unico', S.char('player', { scarf: 'scarf' }, 'left', Sm.party[0].hp > 0 ? (Math.floor(this.t * 2) % 2 ? 0 : 0) : 0), 236, 148, 1.5, 0], ['pet', S.shiba.left[Math.floor(this.t * 3) % 2], 276, 152, 1.5, 1]];
    for (const [k, im, x, y, s2, idx] of party) {
      const down = Sm.party[idx].hp <= 0;
      const w = im.width * s2, h = im.height * s2;
      const px = Math.round(x - w / 2 - ln(k, 1)), py = Math.round(y - h + (down ? 8 : Math.round(Math.sin(this.t * 2.4 + idx) * 1)));
      g.save(); if (down) g.globalAlpha = 0.45;
      g.drawImage(im, px, py, w, h);
      if (this.flash[k] > 0) { g.globalAlpha = 0.6; g.filter = 'brightness(3) saturate(0)'; g.drawImage(im, px, py, w, h); }
      g.restore();
      if (this.phase === 'cmd' && this.who === idx) { g.fillStyle = '#ffd870'; const ay = py - 6 + Math.round(Math.sin(this.t * 6)); g.fillRect(x - 2, ay, 5, 2); g.fillRect(x - 1, ay + 2, 3, 1); g.fillRect(x, ay + 3, 1, 1); }
    }
    // 떠오르는 숫자·글자
    g.textAlign = 'center';
    for (const f of this.fx) {
      f.t += dt;
      const a = Math.max(0, 1 - f.t / 1.1), y = f.y - f.t * 20;
      g.globalAlpha = a;
      g.font = f.huge ? 'bold 22px Galmuri11, monospace' : f.big ? 'bold 14px Galmuri11, monospace' : '11px Galmuri11, monospace';
      g.fillStyle = '#140f22'; g.fillText(f.text, f.x + 1, y + 1); g.fillStyle = f.col; g.fillText(f.text, f.x, y);
      g.globalAlpha = 1;
    }
    this.fx = this.fx.filter((f) => f.t < 1.1);
    // 화면 전환: 시작할 때 점점이 사라지는 격자 (포켓몬풍) · 밤이면 푸른 기운
    if (this.t < 0.65) {
      const k = this.t / 0.65;
      g.fillStyle = '#07050f';
      for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) { const th = ((x / 8 + y / 8) % 4) / 4 * 0.5 + (Math.abs(x - W / 2) / W) * 0.5; if (k < th + 0.25) g.fillRect(x, y, 8, 8); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}
