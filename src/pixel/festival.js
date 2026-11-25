import { festivalAt, festState, takeFood, saleTokens, actTokens, ACT_TOKEN_CAP, SALE_TOKEN_CAP, SALE_COINS, festivalTomorrow } from '../game/sim/festival.js';
import { pickLine, remember, OUT_OF_LINES, OUT_OF_LINES_BY, FESTIVAL_LINES, WAKE, REACT } from '../game/sim/villager_lines.js';
import { isNight } from '../game/sim/routine.js';
import { ITEMS } from '../game/sim/items.js';
import { withJosa } from '../game/sim/josa.js';
import { FEST_DECOR_BY_ID } from '../ui/panels/festival_data.js'; // 축제 한정 꾸미기를 꾸미기 표에 등록 (3D 판과 같은 표)

/**
 * 계절 축제 (3D 판 sim/festival.js 그대로) + 주민 대사 (sim/villager_lines.js 그대로)
 *  - 계절 7일째 아침 6시 ~ 다음 날 6시: 장터 앞 마당에 오방색 깃발 줄·가판대, 밤엔 연등 불빛
 *  - 가판대에서 E: 절기 이야기 · 축제 놀이(받기 놀이, 별만큼 엽전) · 축제 음식 · 엽전 장터(한정 꾸미기)
 *  - 축제 날 판매 200코인마다 엽전, 축제 음식은 주민이 축제마다 한 번 나눠 줌
 *  - 주민 대사: 계절·날씨·밤·하트에 맞는 말을 고르고 최근 말은 되풀이하지 않음. 밤 9시~새벽 5시엔 졸다가 말 걸면 깸
 */
const T = 32;
export const FEST_YARD = { x: 18, y: 19, w: 9, h: 4 }; // 장터 앞 축제 마당 (칸)
const STALL = { x: 22, y: 19 };

export function initFestival(game) {
  game.flags ||= {};
  game.festNow = null;
  game.talkMemo = {}; // 주민별 최근 대사 · 그날 첫 대화
}

export const FestivalMethods = {
  festTick() {
    const f = festivalAt(this.day, this.time);
    const was = this.festNow;
    this.festNow = f;
    if (f && was?.key !== f.key && this.flags.festOpen !== f.key) {
      this.flags.festOpen = f.key;
      this.ui.toast(`${f.name}가 열렸어요! 장터 앞 축제 마당 가판대에서 놀이하고 엽전을 모아요`, 'star');
      this.audio.play('levelup', 0.5);
      this.report('festival');
    }
  },
  festNewDay() {
    const f = festivalTomorrow(this.day);
    if (f) this.ui.toast(`내일은 ${f.name}! 장터 앞이 들썩일 거예요`, 'star');
  },
  festState() { const f = this.festNow; return f ? (this.flags.fest = festState(this.flags.fest, f.key)) : null; },
  /** 장터 판매 → 축제 날이면 엽전 */
  festOnSale(coins) {
    if (!this.econ.festival || !this.festNow) return;
    const n = saleTokens(this.festState(), coins);
    if (n > 0) { this.econ.addItem('fest_token', n); this.ui.toast(`축제 날 판매 보너스! 축제 엽전 +${n}`, 'coin'); }
  },
  festTarget(x, y) {
    if (!this.festNow || x !== STALL.x || y !== STALL.y + 1) return null;
    return { label: `${this.festNow.name.replace(/^\S+\s/, '')} 가판대`, run: () => this.festMenu() };
  },
  festMenu() {
    const f = this.festNow; if (!f) return;
    const e = this.econ;
    this.ui.openMenu({
      title: f.name.replace(/^\S+\s/, ''),
      build: () => {
        const st = this.festState(), tokens = e.count('fest_token'), food = ITEMS[f.food];
        const items = [
          { icon: 'star', label: `▶ ${f.skin.title} (별만큼 엽전)`, right: `${st.act}/${ACT_TOKEN_CAP}`, onPick: () => { this.ui.closeMenu(); this.festPlay(); } },
          { icon: 'gift', label: `절기 이야기`, right: '', onPick: () => { this.ui.closeMenu(); this.ui.say('절기 이야기', f.fact); } },
          { icon: 'heart', label: `축제 음식: ${food.name}`, right: st.food ? '받았어요' : '주민에게', disabled: true, onPick: () => {} },
        ];
        for (const id of f.stall) {
          const d = FEST_DECOR_BY_ID[id]; if (!d) continue;
          items.push({ img: this.S.decorIcon(id), label: `${d.name} (이번 축제 한정)`, right: `엽전 ${d.tokens}`, disabled: tokens < d.tokens, onPick: () => {
            if (!e.useItem('fest_token', d.tokens)) return;
            this.decor.store(id, 1); this.audio.play('coin');
            this.ui.toast(`${withJosa(d.name, '을/를')} 받았어요! 꾸미기(B) 보관함에서 놓을 수 있어요`, 'gift');
          } });
        }
        return { sub: `${f.desc} · 엽전 <b>${tokens}</b>개 · 판매 보너스 ${st.saleTok}/${SALE_TOKEN_CAP} (${SALE_COINS}코인마다)`, items };
      },
    });
  },
  /** 축제 받기 놀이 (20초): ←→ 로 바구니, 좋은 것·금빛은 받고 나쁜 것은 피하기 */
  async festPlay() {
    const f = this.festNow; if (!f) return;
    const r = await catchGame(this, f);
    const th = [15, 30, 45];
    const stars = r >= th[2] ? 3 : r >= th[1] ? 2 : r >= th[0] ? 1 : 0;
    const n = actTokens(this.festState(), stars);
    if (n > 0) this.econ.addItem('fest_token', n);
    this.report('festplay', r);
    await this.ui.say(`${f.skin.title} 결과`, `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${r}점 · ${n > 0 ? `축제 엽전 +${n}` : '오늘 받을 수 있는 엽전은 다 받았어요'}`, ['한 번 더', '그만']).then((c) => { if (c === 0) this.festPlay(); });
  },

  /* ── 주민 대사 ── */
  npcAsleep(n) { return !n.woke && isNight(this.time * 24) && !this.indoors; },
  talkCtx(id) {
    return { season: this.season.id, weather: this.raining ? (this.season.id === 'winter' ? 'snow' : 'rain') : null, night: this.night > 0.5, hearts: this.villagers.hearts(id), festival: this.festNow?.id || null, done: this.quests.claimed, species: true };
  },
  /** 첫마디: 졸던 주민은 깨는 말, 축제 날엔 축제 인사 + 음식, 아니면 상황에 맞는 말 */
  async greetLine(n) {
    const id = n.id, memo = (this.talkMemo[id] ||= { recent: [], day: 0 });
    if (this.npcAsleep(n)) { n.woke = true; return WAKE[id] || '하암… 깜빡 졸았네!'; }
    const f = this.festNow;
    if (f) {
      const st = this.festState(), food = takeFood(st, f);
      if (food) { this.econ.addItem(food, 1); this.audio.play('win', 0.5); this.ui.toast(`축제 음식 ${withJosa(ITEMS[food].name, '을/를')} 받았어요!`, 'gift'); }
      if (FESTIVAL_LINES[id]?.[f.id] && memo.festKey !== f.key) { memo.festKey = f.key; return FESTIVAL_LINES[id][f.id]; }
    }
    const first = memo.day !== this.day; memo.day = this.day;
    const ln = pickLine(id, this.talkCtx(id), memo.recent, Math.random, { prefer: first });
    if (!ln) return OUT_OF_LINES_BY[id] || OUT_OF_LINES;
    remember(memo.recent, ln.t);
    return ln.t;
  },
  moreLine(id) {
    const memo = (this.talkMemo[id] ||= { recent: [], day: this.day });
    const ln = pickLine(id, this.talkCtx(id), memo.recent, Math.random);
    if (!ln) return OUT_OF_LINES_BY[id] || OUT_OF_LINES;
    remember(memo.recent, ln.t);
    return ln.t;
  },
  reactLine(id, kind) { return REACT[id]?.[kind]; },

  /* ── 그리기: 깃발 줄·가판대·연등 ── */
  pushFestDrawables(out) {
    const f = this.festNow; if (!f || this.indoors) return;
    const S = this.S;
    const st = S.festStall(f.id);
    out.push({ img: st, x: STALL.x * T - 16, y: (STALL.y + 1) * T - st.height + 4, sy: (STALL.y + 1) * T - 2, tall: true, shadow: 'l', sx: STALL.x * T + 16, shy: (STALL.y + 1) * T - 4 });
  },
  drawFestOverlay(g, camX, camY, t) {
    const f = this.festNow; if (!f || this.indoors) return;
    const cols = f.colors.map((c) => `#${c.toString(16).padStart(6, '0')}`).concat(['#2f5fb0', '#d8443e', '#f6c63c', '#ffffff', '#222222']);
    const Y = FEST_YARD;
    // 줄 두 가닥: 마당 위를 가로질러 축 처지게, 세모 깃발
    for (let k = 0; k < 2; k++) {
      const x0 = Y.x * T - camX, x1 = (Y.x + Y.w) * T - camX, y0 = (Y.y + 1 + k * 2) * T - 30 - camY;
      if (x1 < -10 || x0 > 2000 || y0 < -60 || y0 > 2000) continue;
      g.fillStyle = '#4a3a2a';
      for (let x = x0; x <= x1; x++) { const u = (x - x0) / (x1 - x0); g.fillRect(x, Math.round(y0 + Math.sin(u * Math.PI) * 12), 1, 1); }
      for (let i = 0, x = x0 + 6; x < x1 - 4; x += 10, i++) {
        const u = (x - x0) / (x1 - x0), y = Math.round(y0 + Math.sin(u * Math.PI) * 12) + 1;
        const sw = Math.round(Math.sin(t * 3 + i) * 1);
        g.fillStyle = cols[(i + k * 3) % cols.length];
        for (let r = 0; r < 6; r++) g.fillRect(x - 3 + Math.floor(r / 2) + sw * (r > 3 ? 1 : 0), y + r, 7 - Math.floor(r / 2) * 2, 1);
      }
    }
  },
  festLights() {
    const f = this.festNow; if (!f || !f.night) return [];
    const c = f.lantern, rgb = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const L = [];
    for (let i = 0; i < 4; i++) L.push({ x: (FEST_YARD.x + 1 + i * 2.3) * T, y: FEST_YARD.y * T - 30, r: 70, c: rgb, lamp: true });
    return L;
  },
};

/** 받기 놀이: 작은 캔버스를 화면 가운데에 띄워 20초 (키·마우스·터치) */
function catchGame(game, f) {
  return new Promise((resolve) => {
    const W = 200, H = 140, scale = Math.max(2, Math.floor(Math.min(innerWidth / W, innerHeight / H) * 0.8));
    const wrap = document.createElement('div'); wrap.className = 'battle fest-game';
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.style.width = `${W * scale}px`; c.style.height = `${H * scale}px`; c.style.aspectRatio = 'auto';
    wrap.appendChild(c); document.body.appendChild(wrap);
    const g = c.getContext('2d');
    const cols = f.colors.map((x) => `#${x.toString(16).padStart(6, '0')}`);
    const sky = f.skin.sky;
    let x = W / 2, score = 0, combo = 0, t = 0, left = false, right = false, spawn = 0, done = false;
    const items = [];
    const key = (e, on) => { if (['ArrowLeft', 'KeyA'].includes(e.code)) left = on; if (['ArrowRight', 'KeyD'].includes(e.code)) right = on; if (on && e.code === 'Escape') finish(); };
    const kd = (e) => { e.stopPropagation(); key(e, true); }, ku = (e) => { e.stopPropagation(); key(e, false); };
    addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);
    const move = (e) => { const r = c.getBoundingClientRect(); x = ((e.clientX - r.left) / r.width) * W; };
    c.addEventListener('pointermove', move); c.addEventListener('pointerdown', move);
    let last = performance.now();
    const finish = () => { if (done) return; done = true; removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 400); resolve(score); };
    const frame = (now) => {
      if (done) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      if (t >= 20) { finish(); return; }
      x = Math.max(12, Math.min(W - 12, x + ((right ? 1 : 0) - (left ? 1 : 0)) * 150 * dt));
      spawn -= dt;
      if (spawn <= 0) { spawn = 0.45 - Math.min(0.2, t * 0.01); const r = Math.random(); items.push({ x: 10 + Math.random() * (W - 20), y: -6, v: 50 + Math.random() * 30 + t * 2, kind: r < 0.1 ? 'gold' : r < 0.28 ? 'bad' : 'good', c: cols[Math.floor(Math.random() * cols.length)] }); }
      // 그리기
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = f.skin.ground; g.fillRect(0, H - 14, W, 14);
      for (const it of items) {
        it.y += it.v * dt;
        if (!it.hit && it.y > H - 26 && it.y < H - 14 && Math.abs(it.x - x) < 14) {
          it.hit = true;
          if (it.kind === 'bad') { combo = 0; score = Math.max(0, score - 3); game.audio.play('bump', 0.4); }
          else { combo++; score += (it.kind === 'gold' ? 5 : 1) + Math.floor(combo / 5); game.audio.play(it.kind === 'gold' ? 'win' : 'pop', 0.35); }
        }
        if (it.hit) continue;
        const ix = Math.round(it.x), iy = Math.round(it.y);
        if (it.kind === 'bad') { g.fillStyle = '#2a2140'; g.fillRect(ix - 3, iy - 2, 7, 5); g.fillStyle = '#ff8670'; g.fillRect(ix - 2, iy - 1, 1, 1); g.fillRect(ix + 2, iy - 1, 1, 1); }
        else if (it.kind === 'gold') { g.fillStyle = '#a6621a'; g.fillRect(ix - 4, iy - 4, 9, 9); g.fillStyle = '#f7cf62'; g.fillRect(ix - 3, iy - 3, 7, 7); g.fillStyle = '#fff0ae'; g.fillRect(ix - 2, iy - 2, 2, 2); }
        else { g.fillStyle = it.c; g.fillRect(ix - 2, iy - 3, 5, 7); g.fillRect(ix - 3, iy - 2, 7, 5); g.fillStyle = '#ffffff'; g.fillRect(ix - 1, iy - 2, 1, 1); }
      }
      for (let i = items.length - 1; i >= 0; i--) if (items[i].hit || items[i].y > H) items.splice(i, 1);
      // 바구니
      const bx = Math.round(x);
      g.fillStyle = '#5c3a20'; g.fillRect(bx - 12, H - 24, 24, 9); g.fillStyle = '#a97142'; g.fillRect(bx - 11, H - 23, 22, 6); g.fillStyle = '#d29e62'; for (let k = -10; k < 11; k += 4) g.fillRect(bx + k, H - 23, 2, 6);
      // 점수·시간
      g.fillStyle = 'rgba(20,15,34,0.6)'; g.fillRect(0, 0, W, 12);
      g.fillStyle = '#fff1d6'; g.font = '8px Galmuri11, monospace'; g.textBaseline = 'top';
      g.fillText(`${f.skin.title}  ${score}점  ${combo > 1 ? combo + '연속' : ''}`, 4, 2);
      g.fillText(`${Math.ceil(20 - t)}초`, W - 24, 2);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
