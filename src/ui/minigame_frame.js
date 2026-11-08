/**
 * 미니게임 공통 연출 (밭갈이·탈곡·스마트팜·양 몰이·달걀 받기)
 *  - mgIntro: 시작 전 규칙·조작 카드 + 최고 기록·별 기준 → [시작] (E·Enter·스페이스)
 *  - mgCountdown: 3 · 2 · 1 · 시작! (소리와 함께)
 *  - mgResult: 점수 카운트업, 별 3개가 하나씩 켜짐, 신기록 리본, 꽃가루, [다시 하기]
 *  - mgTick: 남은 시간 5초부터 째깍 소리 + 빨간 깜빡임
 */
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/** 기존에 따로 저장하던 기록 키는 그대로 사용 */
const LEGACY = { egg: 'unico.egg.best', herd: 'unico.herd.best' };
const keyOf = (id) => LEGACY[id] || `unico.mg.${id}`;
export function bestOf(id) { try { return +(localStorage.getItem(keyOf(id)) || 0); } catch { return 0; } }
function saveBest(id, v) { try { localStorage.setItem(keyOf(id), String(v)); } catch { /* 무시 */ } }

/** 별 개수 (thresholds 오름차순 3개) */
export const starsFor = (v, [a, b, c]) => (v >= c ? 3 : v >= b ? 2 : v >= a ? 1 : 0);
export const GRADE = ['아쉬워요', '좋아요!', '훌륭해요!', '완벽해요!'];
/** 미니게임 목록 (기록 화면용) */
export const MINIGAMES = [
  { id: 'tractor', icon: '🚜', title: '트랙터 밭갈이', unit: '칸', th: [15, 30, 45] },
  { id: 'thresh', icon: '⚙️', title: '탈곡', unit: '%', th: [40, 70, 90] },
  { id: 'smart', icon: '📱', title: '스마트팜 환경 제어', unit: '점', th: [50, 70, 90] },
  { id: 'herd', icon: '🐑', title: '양 몰이', unit: '마리', th: [3, 5, 6] },
  { id: 'egg', icon: '🥚', title: '달걀 받기', unit: '점', th: [15, 30, 45] },
];

export function starsHtml(n, on = true) {
  return `<span class="mg-stars">${[0, 1, 2].map((i) => `<i class="${on && i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
}

/**
 * 시작 카드
 * @param o { id, icon, title, rules: [[emoji, text]...], controls: [text...], th: 별 기준 3개, unit, onStart }
 */
export function mgIntro(g, o) {
  const ui = g.ui;
  const p = ui.openPanel(`${o.icon} ${o.title}`);
  p.classList.add('mg-intro');
  const rules = h('div', 'mg-rules');
  for (const [em, t] of o.rules) rules.append(h('div', 'mg-rule', `<span>${em}</span><p>${t}</p>`));
  p.append(rules);
  if (o.controls?.length) p.append(h('div', 'mg-keys', o.controls.map((c) => `<span>${c}</span>`).join('')));
  const best = bestOf(o.id);
  p.append(h('div', 'mg-goal', `${starsHtml(1)} ${o.th[0]}${o.unit} · ${starsHtml(2)} ${o.th[1]}${o.unit} · ${starsHtml(3)} ${o.th[2]}${o.unit}<br><b>내 최고 기록 ${best}${o.unit}</b> ${starsHtml(starsFor(best, o.th))}`));
  const go = h('button', 'gold mg-go', '▶ 시작 <small class="hint-kbd">(E · 스페이스)</small>'); // 터치 화면에서는 키 안내 숨김 (CSS)
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    window.removeEventListener('keydown', key, true);
    ui.closePanel();
    if (o.countdown === false) o.onStart(); else mgCountdown(g).then(() => o.onStart());
  };
  const key = (e) => {
    if (ui.panel !== p) { window.removeEventListener('keydown', key, true); return; }
    if (['KeyE', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); start(); }
  };
  window.addEventListener('keydown', key, true);
  go.onclick = start;
  p.append(go);
  return p;
}

/** 3·2·1·시작! (약 2.6초) */
export function mgCountdown(g) {
  return new Promise((resolve) => {
    const el = h('div', 'mg-count');
    document.getElementById('ui').append(el);
    const steps = ['3', '2', '1', '시작!'];
    let i = 0;
    const next = () => {
      if (i >= steps.length) { el.remove(); resolve(); return; }
      el.innerHTML = `<span class="${i === 3 ? 'go' : ''}">${steps[i]}</span>`;
      g.audio.pluck(i === 3 ? 1568 : 784, 0.7, 0, undefined, i === 3 ? 0.5 : 0.2);
      i++;
      setTimeout(next, i === 4 ? 550 : 650);
    };
    next();
  });
}

/** 남은 시간 경고: 5초부터 1초마다 째깍. @returns 경고 중인가 */
export function mgTick(g, left, ref) {
  const s = Math.ceil(left);
  if (left > 0 && s <= 5 && s !== ref.last) { ref.last = s; g.audio.pluck(s <= 2 ? 1319 : 988, 0.45, 0, undefined, 0.08); }
  return left > 0 && left <= 5;
}

/**
 * 결과 카드
 * @param o { id, icon, title, score, unit, th, lines: [html...], prevBest?, onRetry?, onClose? }
 * @returns 별 개수
 */
export function mgResult(g, o) {
  const ui = g.ui;
  const prev = o.prevBest ?? bestOf(o.id);
  const isNew = o.score > prev;
  if (isNew) saveBest(o.id, o.score);
  const stars = starsFor(o.score, o.th);
  const p = ui.openPanel(`${o.icon} ${o.title}`);
  p.classList.add('mg-result');
  if (isNew && prev > 0) p.append(h('div', 'mg-ribbon', '🏆 새 최고 기록!'));
  const sc = h('div', 'mg-score', `<b>0</b><small>${o.unit}</small>`);
  p.append(sc);
  const st = h('div', 'mg-starrow', starsHtml(stars, false));
  p.append(st);
  const grade = h('div', 'mg-grade', '');
  p.append(grade);
  if (o.lines?.length) p.append(h('div', 'rows', o.lines.map((t) => `<div class="row">${t}</div>`).join('')));
  p.append(h('div', 'mg-best', `최고 기록 ${Math.max(prev, o.score)}${o.unit}`));
  const btns = h('div', 'mg-btns');
  if (o.onRetry) { const r = h('button', 'ghost', '🔁 다시 하기'); r.onclick = () => { ui.closePanel(); o.onRetry(); }; btns.append(r); }
  const ok = h('button', 'gold', '확인');
  ok.onclick = () => { ui.closePanel(); o.onClose?.(); };
  btns.append(ok);
  p.append(btns);
  // 점수 카운트업 → 별이 하나씩 → 등급
  const b = sc.querySelector('b'), t0 = performance.now(), D = 700;
  const up = (now) => {
    const k = Math.min(1, (now - t0) / D);
    b.textContent = Math.round(o.score * (1 - (1 - k) ** 3));
    if (k < 1 && p.isConnected) requestAnimationFrame(up);
    else {
      const icons = st.querySelectorAll('i');
      for (let i = 0; i < stars; i++) setTimeout(() => { icons[i].classList.add('on', 'pop'); g.audio.pluck([1047, 1319, 1568][i], 0.6, 0, undefined, 0.3); }, 220 * i + 100);
      setTimeout(() => {
        grade.textContent = GRADE[stars];
        grade.classList.add('show');
        if (stars >= 2) confetti(p, stars === 3 ? 40 : 20);
        if (isNew) g.audio.play('levelup');
      }, 220 * stars + 200);
    }
  };
  requestAnimationFrame(up);
  return stars;
}

/** 패널 위로 꽃가루 */
export function confetti(p, n) {
  const cols = ['#fac03e', '#30b6aa', '#e8495a', '#8e7cc3', '#6dbb4f', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const c = h('i', 'mg-confetti');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = cols[i % cols.length];
    c.style.animationDelay = `${Math.random() * 0.4}s`;
    c.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
    c.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    p.append(c);
    setTimeout(() => c.remove(), 2200);
  }
}

/** 미니게임 기록 목록 (퀘스트 창 아래) */
export function recordsHtml() {
  return MINIGAMES.map((m) => { const b = bestOf(m.id); return `<div class="row"><span>${m.icon}</span><span class="nm">${m.title}</span><span class="pr">${b}${m.unit} ${starsHtml(starsFor(b, m.th))}</span></div>`; }).join('');
}
