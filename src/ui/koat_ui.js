import { starsHtml, starsFor, mgCountdown, confetti } from './minigame_frame.js';
import {
  DIVISIONS, PASS_SCORE, TOUR_REWARD, makeMatchRound, scoreMatch, makeStagesRound, SEED_KINDS,
  makeInspectRound, makeCarbonRound, scoreRun, scoreConveyor, makeConveyor,
} from '../game/sim/koat.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/** UI 클래스에 KOAT 체험관 패널들을 추가 */
export function installKoatUI(UI) {
  /** 부스: 본부 소개 → 체험 시작 */
  UI.prototype.openKoatBooth = function (d) {
    const g = this.game, book = g.koat.book;
    const p = this.openPanel(`${d.emoji} ${d.name}`);
    p.classList.add('koat');
    p.style.setProperty('--div', hex(d.color));
    p.append(h('div', 'koat-summary', d.summary));
    p.append(h('div', 'koat-teams', d.teams.map((t) => `<span>${t}</span>`).join('')));
    p.append(h('div', 'koat-game', `<b>🎮 ${d.game.title}</b><br>${d.game.how}`));
    const best = book.best[d.id];
    p.append(h('div', 'koat-meta', `${book.stamps[d.id] ? '✅ 스탬프 획득' : d.game.type === 'link' ? '⬜ 체험하면 스탬프' : `⬜ ${PASS_SCORE}점 이상이면 스탬프`}${best !== undefined && d.game.type !== 'link' ? ` · 최고 ${best}점` : ''} · 스탬프 ${book.count}/${DIVISIONS.length}`));
    if (d.game.type === 'link') { // 외부 체험 페이지: 새 창(탭)으로 열고, 처음 누르면 체험 완료 → 스탬프
      const a = h('a', 'button gold koat-go koat-link', `${d.emoji} ${d.game.title} <small>↗ 새 창</small>`);
      a.href = d.game.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.onclick = () => {
        g.audio.play('click');
        if (!book.stamps[d.id]) { g.koat.record(d.id, 100); this.toast(`🏷️ ${d.name} 스탬프 획득! (${book.count}/${DIVISIONS.length}) · 새 창에서 특허 체험을 즐겨 보세요`); }
        else this.toast('🔗 새 창에서 특허 체험 페이지를 열었어요');
        setTimeout(() => { if (this.panel === p) this.openKoatBooth(d); }, 50); // 스탬프 표시 갱신
      };
      p.append(a);
      p.append(h('div', 'koat-meta', `<small>연결 주소: ${d.game.url.replace(/^https?:\/\//, '')}</small>`));
      return;
    }
    const go = h('button', 'gold koat-go', '체험 시작 ▶');
    go.onclick = () => this.startKoatGame(d);
    p.append(go);
  };

  UI.prototype.startKoatGame = function (d) {
    const fn = { match: this.koatMatch, stages: this.koatStages, sort: this.koatSort, inspect: this.koatInspect, carbon: this.koatCarbon, smartfarm: this.koatSmart, link: this.openKoatBooth }[d.game.type];
    fn.call(this, d);
  };

  /** 결과 화면 공통: 점수 카운트업 → 별 → (처음 통과하면) 스탬프 쾅! */
  UI.prototype.koatResult = function (d, score, lines = []) {
    const g = this.game;
    const prev = g.koat.book.best[d.id];
    const r = g.koat.record(d.id, score);
    const p = this.openPanel(`${d.emoji} ${d.game.title} 결과`);
    p.classList.add('koat', 'koat-result');
    p.style.setProperty('--div', hex(d.color));
    if (prev !== undefined && score > prev) p.append(h('div', 'mg-ribbon', '🏆 새 최고 점수!'));
    const sc = h('div', `koat-score ${r.passed ? 'pass' : 'fail'}`, `<b>0</b><small>점</small>`);
    p.append(sc);
    const stars = starsFor(score, [PASS_SCORE, 85, 100]);
    const st = h('div', 'mg-starrow koat-stars', starsHtml(stars, false));
    p.append(st);
    const meta = h('div', 'koat-meta', r.passed ? (r.newStamp ? `🎉 ${d.name} 스탬프 획득! (${g.koat.book.count}/${DIVISIONS.length})` : '👍 통과!') : `조금만 더! ${PASS_SCORE}점 이상이면 스탬프를 받아요`);
    p.append(meta);
    if (lines.length) p.append(h('div', 'rows koat-review', lines.map((t) => `<div class="row">${t}</div>`).join('')));
    const row = h('div', 'koat-btns');
    const again = h('button', 'ghost', '🔁 다시 하기'); again.onclick = () => this.startKoatGame(d);
    const book = h('button', '', '🏷️ 스탬프 투어'); book.onclick = () => this.openKoatDesk();
    row.append(again, book);
    p.append(row);
    // 연출
    const b = sc.querySelector('b'), t0 = performance.now();
    const up = (now) => {
      const k = Math.min(1, (now - t0) / 700);
      b.textContent = Math.round(score * (1 - (1 - k) ** 3));
      if (k < 1 && p.isConnected) return requestAnimationFrame(up);
      const icons = st.querySelectorAll('i');
      for (let i = 0; i < stars; i++) setTimeout(() => { icons[i].classList.add('on', 'pop'); g.audio.pluck([1047, 1319, 1568][i], 0.6, 0, undefined, 0.3); }, 200 * i + 100);
      setTimeout(() => {
        if (r.newStamp) { // 스탬프가 위에서 쾅 찍힘
          const stamp = h('div', 'koat-stampfx', `<span>${d.emoji}</span><b>${d.name.replace('본부', '')}</b><small>KOAT</small>`);
          p.append(stamp);
          setTimeout(() => { g.audio.play('bump', 0.8); g.juice.shake(0.2); confetti(p, 36); }, 330);
          g.player.unico.playAction('cheer', 1.6);
        } else if (stars >= 2) confetti(p, 18);
      }, 200 * stars + 250);
    };
    requestAnimationFrame(up);
    if (g.koat.book.complete && !g.koat.book.rewarded) this.toast('🏅 모든 스탬프를 모았어요! 안내데스크에서 보상을 받으세요');
  };

  /** 체험 패널 공통 머리: 본부 색, 설명 */
  const koatPanel = (ui, d, title, how) => {
    const p = ui.openPanel(`${d.emoji} ${title || d.game.title}`);
    p.classList.add('koat'); p.style.setProperty('--div', hex(d.color));
    if (how) p.append(h('p', 'koat-how', how));
    return p;
  };
  /** 패널이 닫히면 저절로 빠지는 키 입력 */
  const panelKeys = (ui, p, fn) => {
    const k = (e) => { if (ui.panel !== p) { window.removeEventListener('keydown', k, true); return; } if (fn(e)) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('keydown', k, true);
  };

  /**
   * 하나씩 빠르게 판단하는 체험 (창업 레이스·안전 검정·저탄소 인증 공통)
   * o: { title, how, items, timePer, render(item, el), choices(item): [{ label, value, key, cls }], correct(item, v), why(item, ok), review(item, ok, v) }
   */
  UI.prototype.koatRun = function (d, o) {
    const g = this.game, results = [];
    let i = 0, combo = 0, timer = 0, locked = false;
    const p = koatPanel(this, d, o.title, o.how);
    const head = h('div', 'koat-runhead', `<div class="koat-progress"></div><span class="combo"></span>`);
    const bar = h('div', 'koat-timer', '');
    const stage = h('div', 'koat-runbody');
    const acts = h('div', 'koat-choices');
    const why = h('div', 'koat-why', '');
    p.append(head, bar, stage, acts, why);
    const paintProgress = () => { head.querySelector('.koat-progress').innerHTML = o.items.map((_, k) => `<i class="${k < i ? (results[k]?.ok ? 'on' : 'miss') : k === i ? 'cur' : ''}"></i>`).join(''); head.querySelector('.combo').innerHTML = combo >= 2 ? `🔥 ${combo} 연속!` : ''; };
    const answer = (v) => {
      if (locked) return;
      locked = true;
      clearInterval(timer);
      const it = o.items[i], ok = v !== undefined && o.correct(it, v);
      results[i] = { ok, left: Math.max(0, left / o.timePer), v };
      combo = ok ? combo + 1 : 0;
      acts.querySelectorAll('button').forEach((b) => { const bv = b.dataset.v; if (o.correct(it, bv === 'true' ? true : bv === 'false' ? false : isNaN(+bv) ? bv : +bv)) b.classList.add('right'); else if (String(v) === bv) b.classList.add('wrong'); b.disabled = true; });
      g.audio.play(ok ? 'coin' : 'bump', ok ? 0.7 : 0.5);
      if (ok && combo >= 3) g.audio.pluck(1568, 0.5, 0, undefined, 0.2);
      why.innerHTML = `${ok ? '⭕' : v === undefined ? '⏰ 시간 초과!' : '❌'} ${o.why(it, ok)}`;
      why.className = `koat-why show ${ok ? 'ok' : 'ng'}`;
      p.classList.toggle('shake', !ok);
      i++;
      paintProgress();
      setTimeout(next, ok ? 1100 : 1700);
    };
    let left = o.timePer;
    const next = () => {
      if (!p.isConnected) return;
      p.classList.remove('shake');
      if (i >= o.items.length) {
        const score = scoreRun(results);
        return this.koatResult(d, score, o.items.map((it, k) => o.review(it, results[k].ok, results[k].v)).concat(o.footer ? [o.footer] : []));
      }
      const it = o.items[i];
      locked = false;
      why.className = 'koat-why';
      stage.innerHTML = '';
      stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
      o.render(it, stage);
      acts.innerHTML = '';
      for (const c of o.choices(it)) {
        const b = h('button', `koat-opt ${c.cls || ''}`, `${c.key ? `<kbd>${c.key}</kbd> ` : ''}${c.label}`);
        b.dataset.v = String(c.value);
        b.onclick = () => answer(c.value);
        acts.append(b);
      }
      left = o.timePer;
      timer = setInterval(() => {
        if (!p.isConnected) return clearInterval(timer);
        left -= 0.1;
        bar.innerHTML = `⏱ ${Math.max(0, left).toFixed(1)}초 <i style="width:${(left / o.timePer) * 100}%"></i>`;
        bar.classList.toggle('warn', left <= 3);
        if (left <= 0) answer(undefined);
      }, 100);
      paintProgress();
    };
    panelKeys(this, p, (e) => {
      const cs = o.items[i] ? o.choices(o.items[i]) : [];
      const c = cs.find((x) => x.code?.includes(e.code));
      if (c && !locked) { answer(c.value); return true; }
      return false;
    });
    mgCountdown(g).then(next);
  };

  // ---------------------------------------------------------- 기술사업: 기술이전 매칭 (연결선 + 제한 시간)
  UI.prototype.koatMatch = function (d) {
    const g = this.game, round = makeMatchRound(), T = 45;
    const ans = {};
    let sel = null, left = T, ended = false;
    const p = koatPanel(this, d, null, '① 왼쪽 <b>기술</b>을 누르고 ② 오른쪽에서 그 기술이 필요한 <b>기업</b>을 누르세요. 빨리 맺을수록 보너스!');
    const timer = h('div', 'koat-timer', '');
    p.append(timer);
    const grid = h('div', 'koat-match');
    const L = h('div', 'col'), R = h('div', 'col');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('koat-lines');
    const colors = ['#f2a33a', '#30b6aa', '#e35d5d', '#8e7cc3'];
    const lines = () => { // 맺은 계약을 곡선으로 이음
      const gr = grid.getBoundingClientRect();
      svg.setAttribute('width', gr.width); svg.setAttribute('height', gr.height);
      svg.innerHTML = Object.entries(ans).map(([t, by]) => {
        const a = L.querySelector(`[data-t="${CSS.escape(t)}"]`)?.getBoundingClientRect(), b = R.querySelector(`[data-b="${CSS.escape(by)}"]`)?.getBoundingClientRect();
        if (!a || !b) return '';
        const x1 = a.right - gr.left, y1 = a.top + a.height / 2 - gr.top, x2 = b.left - gr.left, y2 = b.top + b.height / 2 - gr.top, mx = (x1 + x2) / 2;
        const ci = round.techs.indexOf(t), col = ended ? (round.answer[t] === by ? '#4f9a33' : '#e35d5d') : colors[ci];
        return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="${col}" stroke-width="4" fill="none" stroke-linecap="round" class="draw"/>`;
      }).join('');
    };
    const paint = () => {
      L.querySelectorAll('button').forEach((b) => { const t = b.dataset.t; b.classList.toggle('sel', sel === t); b.style.borderColor = ans[t] ? colors[round.techs.indexOf(t)] : ''; });
      R.querySelectorAll('button').forEach((b) => { const owner = Object.keys(ans).find((t) => ans[t] === b.dataset.b); b.style.borderColor = owner ? colors[round.techs.indexOf(owner)] : ''; b.classList.toggle('used', !!owner); });
      done.disabled = Object.keys(ans).length < round.techs.length;
      lines();
    };
    for (const t of round.techs) { const b = h('button', 'pick', t); b.dataset.t = t; b.onclick = () => { if (ended) return; sel = t; g.audio.play('click'); paint(); }; L.append(b); }
    for (const by of round.buyers) {
      const b = h('button', 'pick', by); b.dataset.b = by;
      b.onclick = () => { if (!sel || ended) return; for (const k of Object.keys(ans)) if (ans[k] === by) delete ans[k]; ans[sel] = by; sel = null; g.audio.play('plant'); paint(); };
      R.append(b);
    }
    grid.append(L, h('div', 'arrow', '➡️'), R, svg);
    p.append(grid);
    const done = h('button', 'gold koat-go', '기술이전 계약 체결 ✍️');
    const finish = () => {
      if (ended) return;
      ended = true; clearInterval(iv); paint();
      const acc = scoreMatch(round, ans);
      const score = Math.min(100, Math.round(acc * 0.85 + (acc === 100 ? (left / T) * 15 : (left / T) * 15 * (acc / 100))));
      setTimeout(() => this.koatResult(d, score, round.techs.map((t) => `${ans[t] === round.answer[t] ? '✅' : '❌'} ${t} → <b>${round.answer[t]}</b>`).concat([`⏱ 남은 시간 ${left.toFixed(1)}초`, '기술사업본부는 특허 창출 → 기술이전 → 사업화 자금·마케팅까지 함께 지원해요.'])), 1200);
    };
    done.onclick = finish;
    p.append(done);
    let iv = 0;
    mgCountdown(g).then(() => {
      iv = setInterval(() => { if (!p.isConnected) return clearInterval(iv); left -= 0.1; timer.innerHTML = `⏱ ${Math.max(0, left).toFixed(1)}초 <i style="width:${(left / T) * 100}%"></i>`; timer.classList.toggle('warn', left <= 5); if (left <= 0) { left = 0; finish(); } }, 100);
    });
    paint();
  };

  // ---------------------------------------------------------- 벤처창업: 단계별 지원 (스타트업 로켓이 단계마다 올라감)
  UI.prototype.koatStages = function (d) {
    const round = makeStagesRound();
    this.koatRun(d, {
      how: '스타트업에 지금 가장 필요한 지원을 골라 단계를 올려 주세요! (숫자 키 1·2·3)',
      items: round, timePer: 10,
      render: (s, el) => {
        const k = round.indexOf(s);
        el.innerHTML = `<div class="koat-rocket"><div class="track">${round.map((x, j) => `<span class="${j < k ? 'past' : j === k ? 'now' : ''}">${x.stage}</span>`).join('')}</div><i style="left:${(k / (round.length - 1)) * 88}%">🚀</i></div><div class="koat-stage"><span class="tag">${s.stage} 단계</span> ${s.situation}</div>`;
      },
      choices: (s) => s.options.map((o, k) => ({ label: o, value: k, key: k + 1, code: [`Digit${k + 1}`, `Numpad${k + 1}`] })),
      correct: (s, v) => v === s.answer,
      why: (s) => s.why || '',
      review: (s, ok) => `${ok ? '✅' : '❌'} <b>${s.stage}</b>: ${s.options[s.answer]}`,
      footer: '전국 6개 농식품벤처창업센터(서울·경기·강원·충청·호남·영남)가 단계별로 원스톱 지원해요.',
    });
  };

  // ---------------------------------------------------------- 종자사업: 컨베이어 정선 (불량만 집어내기)
  UI.prototype.koatSort = function (d) {
    const g = this.game, DUR = 22, seq = makeConveyor();
    const p = koatPanel(this, d, null, `흘러오는 종자 중 <b>불량</b> ${Object.values(SEED_KINDS).filter((k) => k.bad).map((k) => k.emoji).join(' ')} 만 눌러 빼내세요. 좋은 종자 🌰 를 빼면 감점!`);
    const hud = h('div', 'koat-runhead', '<span class="sc">✔ 0 · ✖ 0 · 놓침 0</span><span class="combo"></span>');
    const timer = h('div', 'koat-timer', '');
    const belt = h('div', 'koat-belt', '<div class="rollers"></div>');
    p.append(hud, timer, belt);
    const st = { t: 0, hit: 0, wrong: 0, miss: 0, combo: 0, next: 0, k: 0, live: [], over: false, bads: 0 };
    const W = () => belt.clientWidth;
    const pop = (x, y, txt, cls) => { const f = h('span', `koat-float ${cls}`, txt); f.style.left = `${x}px`; f.style.top = `${y}px`; belt.append(f); setTimeout(() => f.remove(), 700); };
    const spawn = () => {
      const it = seq[st.k++ % seq.length];
      const kind = SEED_KINDS[it.kind];
      const lane = Math.floor(Math.random() * 3);
      const b = h('button', `seed lane${lane}`, kind.emoji);
      belt.append(b);
      const s = { b, kind, x: W() + 30, y: 18 + lane * 52, done: false };
      b.style.top = `${s.y}px`;
      b.onpointerdown = (e) => {
        e.preventDefault();
        if (s.done || st.over) return;
        s.done = true;
        b.classList.add(kind.bad ? 'got' : 'oops');
        if (kind.bad) { st.hit++; st.combo++; g.audio.pluck(880 + Math.min(st.combo, 10) * 60, 0.5, 0, undefined, 0.1); pop(s.x, s.y, st.combo >= 3 ? `+${st.combo}🔥` : '✔', 'ok'); }
        else { st.wrong++; st.combo = 0; g.audio.play('bump', 0.5); pop(s.x, s.y, '좋은 종자!', 'ng'); belt.classList.add('shake'); setTimeout(() => belt.classList.remove('shake'), 250); }
        setTimeout(() => b.remove(), 260);
      };
      st.live.push(s);
    };
    let last = performance.now(), raf = 0;
    const step = (now) => {
      if (!p.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      st.t += dt;
      const lvl = st.t / DUR, speed = 120 + lvl * 120;
      st.next -= dt;
      if (st.next <= 0 && st.t < DUR - 1.5) { spawn(); st.next = 0.75 - lvl * 0.35; }
      for (const s of st.live) {
        s.x -= speed * dt;
        s.b.style.transform = `translateX(${s.x}px) rotate(${s.x * 0.6}deg)`;
        if (!s.done && s.x < -40) { s.done = true; s.b.remove(); if (s.kind.bad) { st.miss++; st.combo = 0; pop(10, s.y, '놓침', 'ng'); } }
      }
      st.live = st.live.filter((s) => s.b.isConnected);
      const left = Math.max(0, DUR - st.t);
      timer.innerHTML = `⏱ ${left.toFixed(1)}초 <i style="width:${(left / DUR) * 100}%"></i>`;
      timer.classList.toggle('warn', left <= 5);
      hud.querySelector('.sc').textContent = `✔ 골라냄 ${st.hit} · ✖ 실수 ${st.wrong} · 놓침 ${st.miss}`;
      hud.querySelector('.combo').innerHTML = st.combo >= 3 ? `🔥 ${st.combo} 연속!` : '';
      belt.querySelector('.rollers').style.backgroundPositionX = `${-st.t * speed}px`;
      if (st.t >= DUR) {
        st.over = true;
        const total = st.hit + st.miss + st.live.filter((s) => !s.done && s.kind.bad).length;
        const score = scoreConveyor(st.hit, st.wrong, total);
        return this.koatResult(d, score, [`불량 ${total}개 중 ${st.hit}개 골라냄 · 놓침 ${total - st.hit}개`, `좋은 종자를 잘못 뺀 횟수 ${st.wrong}번`, '종자종합처리센터에서는 정선(골라내기)·검사·소독을 거쳐 품질 좋은 보급종을 농가에 공급하고, QR코드로 유통을 관리해요.']);
      }
      raf = requestAnimationFrame(step);
    };
    mgCountdown(g).then(() => { last = performance.now(); raf = requestAnimationFrame(step); });
    void raf;
  };

  // ---------------------------------------------------------- 스마트농업: 실증 테스트 (돌발 상황 포함)
  UI.prototype.koatSmart = function (d) {
    this.closePanel();
    const sf = this.game.smartfarm;
    sf.onFinish = (r) => this.koatResult(d, r.score, [`적정 환경 유지율 ${r.score}%`, '김제·상주 스마트팜 혁신밸리 실증단지에서 기업의 스마트팜 기자재와 기술을 실제 온실에서 시험해요.']);
    mgCountdown(this.game).then(() => sf.start({ events: true }));
  };

  // ---------------------------------------------------------- 농기계검정: 검정 라인 (측정값 게이지를 보고 판정)
  UI.prototype.koatInspect = function (d) {
    const round = makeInspectRound();
    const gauge = (it) => {
      if (typeof it.value !== 'number') return `<div class="koat-meter text"><span>${it.value === '장착' ? '🛡️' : '⚠️'}</span><b>${it.value}</b></div>`;
      const lim = parseFloat(it.std.replace(/[^\d.]/g, '')), le = it.std.includes('≤');
      const max = Math.max(lim * 1.6, it.value * 1.15), pos = (v) => Math.min(100, (v / max) * 100);
      return `<div class="koat-meter"><div class="scale"><i class="ok" style="${le ? `left:0;width:${pos(lim)}%` : `left:${pos(lim)}%;right:0`}"></i><i class="lim" style="left:${pos(lim)}%"></i><i class="needle" style="--to:${pos(it.value)}%"></i></div><div class="read"><b>${it.value.toLocaleString()}</b> ${it.unit}</div></div>`;
    };
    this.koatRun(d, {
      how: '검정 라인에 올라온 트랙터의 측정값을 기준과 비교해 판정하세요. (← 적합 · → 부적합)',
      items: round, timePer: 8,
      render: (it, el) => { el.innerHTML = `<div class="koat-insp1"><div class="nm">🚜 ${it.name}</div><div class="std">기준 ${it.std}${it.unit ? ' ' + it.unit : ''}</div>${gauge(it)}</div>`; },
      choices: () => [{ label: '✅ 적합', value: true, key: '←', code: ['ArrowLeft', 'KeyA'], cls: 'okc' }, { label: '⛔ 부적합', value: false, key: '→', code: ['ArrowRight', 'KeyD'], cls: 'ngc' }],
      correct: (it, v) => v === it.pass,
      why: (it) => `${it.name} ${typeof it.value === 'number' ? it.value.toLocaleString() : it.value}${it.unit ? ' ' + it.unit : ''} → 기준 ${it.std} ${it.pass ? '만족: 적합' : '벗어남: 부적합'}`,
      review: (it, ok) => `${ok ? '✅' : '❌'} ${it.name}: ${it.pass ? '적합' : '부적합'}`,
      footer: '농기계검정본부는 농업기계 검정·시험평가와 자율주행 농기계 성능시험, OECD 트랙터 시험을 수행해요.',
    });
  };

  // ---------------------------------------------------------- 농업환경분석: 저탄소 인증 (카드 분류)
  UI.prototype.koatCarbon = function (d) {
    const round = makeCarbonRound();
    this.koatRun(d, {
      how: '영농 방법 카드가 한 장씩 나와요. 온실가스를 줄이면 <b>🌿 감축</b>, 늘리면 <b>💨 배출</b>! (← · →)',
      items: round, timePer: 7,
      render: (c, el) => { el.innerHTML = `<div class="koat-bigcard">${c.text}</div>`; },
      choices: () => [{ label: '🌿 감축', value: true, key: '←', code: ['ArrowLeft', 'KeyA'], cls: 'okc' }, { label: '💨 배출 증가', value: false, key: '→', code: ['ArrowRight', 'KeyD'], cls: 'ngc' }],
      correct: (c, v) => v === c.good,
      why: (c) => `${c.good ? '감축' : '배출 증가'}: ${c.why}`,
      review: (c, ok) => `${ok ? '✅' : '❌'} ${c.text} — ${c.good ? '감축' : '배출 증가'}`,
      footer: '농업환경분석본부는 토양·잔류농약 분석, 온실가스 감축사업, 저탄소 농축산물 인증을 운영해요.',
    });
  };

  // ---------------------------------------------------------- 안내데스크: 기관 소개 + 스탬프 투어
  UI.prototype.openKoatDesk = function () {
    const g = this.game, book = g.koat.book;
    const p = this.openPanel('🏢 KOAT 체험관 안내데스크');
    p.classList.add('koat'); p.style.setProperty('--div', '#30b6aa');
    p.append(h('div', 'koat-summary', '한국농업기술진흥원(KOAT)은 농업 R&D 성과가 현장과 시장에서 쓰이도록 기술 사업화·창업·종자·스마트농업·검정·환경분석을 지원하는 기관이에요. 기획운영본부는 경영전략·인사·안전·예산으로 각 본부를 뒷받침해요. 6개 본부 부스를 돌며 체험하고 스탬프를 모아 보세요!'));
    const grid = h('div', 'koat-stamps');
    for (const d of DIVISIONS) {
      const got = book.stamps[d.id];
      const cell = h('button', `stamp ${got ? 'got' : ''}`, `<span class="em">${got ? d.emoji : '⬜'}</span><b>${d.name}</b><small>${d.game.title}${book.best[d.id] !== undefined && d.game.type !== 'link' ? ` · ${book.best[d.id]}점` : ''}</small>`);
      cell.style.setProperty('--div', hex(d.color));
      cell.onclick = () => this.openKoatBooth(d);
      grid.append(cell);
    }
    p.append(grid);
    p.append(h('div', 'koat-meta', `스탬프 ${book.count}/${DIVISIONS.length} · 모두 모으면 ${TOUR_REWARD.money}🪙 + ${TOUR_REWARD.xp}XP + 칭호 “${TOUR_REWARD.title}”`));
    if (book.complete) {
      const b = h('button', 'gold koat-go', book.rewarded ? `🏅 ${TOUR_REWARD.title}` : '🎁 투어 완주 보상 받기');
      b.disabled = book.rewarded;
      b.onclick = () => {
        const r = book.claim();
        if (!r) return;
        g.economy.earn(r.money);
        g.quests.xp += r.xp;
        g.player.setTitle?.(r.title);
        g.audio.play('levelup');
        g.player.unico.playAction('cheer', 2);
        this.toast(`🏅 칭호 “${r.title}” 획득! +${r.money}🪙 +${r.xp}XP`);
        this.openKoatDesk();
      };
      p.append(b);
    }
    const go = h('div', 'koat-meta', '💡 부스 앞에서 E 를 누르거나 부스를 클릭하면 체험이 시작돼요. 출처: koat.or.kr 조직도·주요사업');
    p.append(go);
  };
}
