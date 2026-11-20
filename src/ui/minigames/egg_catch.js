import { touchUI } from '../../game/input.js';
import { josa } from '../../game/sim/josa.js';

/**
 * 미니게임: 달걀 받기 (닭장) · 축제 놀이 (skin 을 주면 같은 규칙에 계절 그림: sim/festival.js FESTIVALS[id].skin)
 *  skin: { title, icon, sky:[위, 아래], ground, branch, bloom, deco('azalea'|'iris'|'persimmon'|'snow'), hills, moon?, good:[이모지…], gold, bad, goodName, goldName, badName }
 *  횃대 위 암탉들이 낳는 달걀을 바구니로 받기. 마우스/터치로 끌거나 ←→ / A·D 키.
 *  흰·갈색 달걀 +1, 황금 달걀 +5(반짝), 썩은 달걀 -3(콤보 끊김). 10연속부터 콤보 ×2, 20연속 ×3.
 *  45초 동안 점점 빨라짐. 결과: 달걀(점수/5) + 코인(점수×2), 최고 기록 저장.
 */
export function playEggCatch(game, skin = null) {
  return new Promise((resolve) => {
    const W = 720, H = 460, DUR = 45, S = skin;
    const BEST_KEY = S ? 'unico.mg.fest' : 'unico.egg.best';
    const T = touchUI(); // 터치 화면: 캔버스 안내 글자에 키보드 안내 대신 손가락 안내
    const wrap = document.createElement('div');
    wrap.className = 'mg-wrap';
    wrap.innerHTML = `<div class="mg-box"><canvas width="${W}" height="${H}"></canvas><button class="mg-close">✕</button></div>`;
    document.getElementById('ui').append(wrap);
    const cv = wrap.querySelector('canvas'), c = cv.getContext('2d');
    game.player.frozen = true;
    let best = 0;
    try { best = +(localStorage.getItem(BEST_KEY) || 0); } catch { /* 무시 */ }
    const hens = [0, 1, 2, 3, 4].map((i) => ({ x: 90 + i * 135, bob: Math.random() * 6, lay: 0 }));
    const st = { t: 0, score: 0, combo: 0, maxCombo: 0, caught: 0, basket: W / 2, bv: 0, eggs: [], fx: [], spawn: 1, started: false, over: false, keys: new Set() };
    let raf = 0, last = performance.now();
    const snd = (f, d = 0.12) => game.audio.play('catch', 1, { freq: f, dur: d });

    const pos = (e) => { const r = cv.getBoundingClientRect(); return ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * (W / r.width); };
    const move = (e) => { if (st.over) return; st.started = true; st.target = pos(e); };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerdown', (e) => { move(e); if (st.over) finish(); });
    cv.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
    const kd = (e) => { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { st.keys.add(e.code); st.started = true; st.target = null; e.preventDefault(); } if (e.code === 'Escape') finish(); if (st.over && ['Space', 'Enter', 'KeyE'].includes(e.code)) finish(); };
    const ku = (e) => st.keys.delete(e.code);
    window.addEventListener('keydown', kd, true); window.addEventListener('keyup', ku, true);
    wrap.querySelector('.mg-close').onclick = () => finish();

    function layEgg() {
      const h = hens[Math.floor(Math.random() * hens.length)];
      const r = Math.random(), lvl = st.t / DUR;
      const kind = r < 0.07 ? 'gold' : r < 0.07 + 0.08 + lvl * 0.1 ? 'rotten' : r < 0.6 ? 'white' : 'brown';
      h.lay = 0.3;
      const em = S ? (kind === 'gold' ? S.gold : kind === 'rotten' ? S.bad : S.good[kind === 'white' ? 0 : 1]) : null;
      st.eggs.push({ x: h.x + (Math.random() - 0.5) * 20, y: 112, vy: 60 + lvl * 120 + Math.random() * 40, kind, rot: 0, em });
    }
    function burst(x, y, col, n = 10) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 60 + Math.random() * 160; st.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.6, col }); } }
    function text(x, y, s, col) { st.fx.push({ x, y, vx: 0, vy: -50, life: 0.9, txt: s, col }); }

    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (st.started && !st.over) {
        st.t += dt;
        if (st.t >= DUR) { st.over = true; game.audio.play('win'); setTimeout(finish, 1400); }
        st.spawn -= dt;
        const lvl = st.t / DUR;
        if (st.spawn <= 0) { layEgg(); if (Math.random() < lvl * 0.5) layEgg(); st.spawn = 0.95 - lvl * 0.55; }
      }
      // 바구니: 목표 x 로 부드럽게 (키보드는 가속)
      if (st.keys.size) { const dir = (st.keys.has('ArrowRight') || st.keys.has('KeyD') ? 1 : 0) - (st.keys.has('ArrowLeft') || st.keys.has('KeyA') ? 1 : 0); st.bv += (dir * 620 - st.bv) * Math.min(1, dt * 10); st.basket += st.bv * dt; }
      else if (st.target != null) { const nb = st.basket + (st.target - st.basket) * Math.min(1, dt * 14); st.bv = (nb - st.basket) / Math.max(dt, 1e-3); st.basket = nb; }
      st.basket = Math.max(50, Math.min(W - 50, st.basket));
      // 달걀
      for (const e of st.eggs) {
        e.vy += 260 * dt; e.y += e.vy * dt; e.rot += dt * 3;
        if (!e.done && e.y > H - 78 && e.y < H - 50 && Math.abs(e.x - st.basket) < 54) {
          e.done = true;
          if (e.kind === 'rotten') { st.score = Math.max(0, st.score - 3); st.combo = 0; burst(e.x, e.y, S ? '#8a8a8a' : '#8bbf4a', 14); text(e.x, e.y - 20, '-3 으악!', '#6a8f2a'); game.audio.play('deny'); }
          else {
            st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo); st.caught++;
            const mult = st.combo >= 20 ? 3 : st.combo >= 10 ? 2 : 1, pts = (e.kind === 'gold' ? 5 : 1) * mult;
            st.score += pts;
            burst(e.x, e.y, e.kind === 'gold' ? '#ffd23a' : '#fff6e0', e.kind === 'gold' ? 18 : 8);
            text(e.x, e.y - 20, `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, e.kind === 'gold' ? '#e0a800' : '#5a3a1a');
            snd(e.kind === 'gold' ? 1568 : 880 + Math.min(st.combo, 20) * 30, e.kind === 'gold' ? 0.5 : 0.15);
            st.squash = 0.18;
          }
        }
        if (!e.done && e.y > H - 30) { e.done = true; e.splat = 1.2; if (e.kind !== 'rotten') { st.combo = 0; game.audio.play('pop', 0.4); } }
      }
      st.eggs = st.eggs.filter((e) => (e.done ? (e.splat ? (e.splat -= dt) > 0 : false) : true));
      for (const f of st.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; if (!f.txt) f.vy += 400 * dt; }
      st.fx = st.fx.filter((f) => f.life > 0);
      if (st.squash > 0) st.squash -= dt;
      for (const h of hens) { h.bob += dt * 4; if (h.lay > 0) h.lay -= dt; }
      draw();
      raf = requestAnimationFrame(step);
    }

    function hen(x, y, h) {
      const squat = h.lay > 0 ? Math.sin(h.lay / 0.3 * Math.PI) * 6 : 0, b = Math.sin(h.bob) * 2;
      c.save(); c.translate(x, y + b + squat);
      c.fillStyle = '#fffaf0'; c.beginPath(); c.ellipse(0, 0, 34, 26 - squat * 0.5, 0, 0, 7); c.fill();
      c.beginPath(); c.ellipse(-26, -6, 14, 18, -0.6, 0, 7); c.fill(); // 꼬리
      c.beginPath(); c.arc(22, -22, 15, 0, 7); c.fill(); // 머리
      c.fillStyle = '#e0413a'; for (const [dx, r] of [[16, 6], [22, 7], [28, 6]]) { c.beginPath(); c.arc(dx, -37, r, 0, 7); c.fill(); }
      c.beginPath(); c.ellipse(34, -14, 4, 7, 0, 0, 7); c.fill();
      c.fillStyle = '#f2a33a'; c.beginPath(); c.moveTo(36, -24); c.lineTo(46, -20); c.lineTo(36, -17); c.fill();
      c.fillStyle = '#231916'; c.beginPath(); c.arc(25, -25, 2.6, 0, 7); c.fill();
      c.fillStyle = '#efe6d4'; c.beginPath(); c.ellipse(-4, 2, 18, 11, -0.2, 0, 7); c.fill(); // 날개
      c.restore();
    }
    /** 축제: 떨어지는 것 (이모지 1.3배), 금빛(+5)은 반짝이 꼬리, 땅에 떨어지면 흐려지며 사라짐 */
    function festItem(e) {
      if (e.kind === 'gold' && !e.splat) { // 반짝이 꼬리: 지나온 자리 위로 작은 별
        for (let i = 1; i <= 5; i++) { const y = e.y - i * 13, a = 0.5 - i * 0.08, r = 4.5 - i * 0.6; c.fillStyle = `rgba(255,214,90,${a})`; star(e.x + Math.sin(st.t * 9 + i) * 5, y, r); }
      }
      c.save(); c.translate(e.x, e.y);
      if (e.splat) c.globalAlpha = Math.min(1, e.splat) * 0.5;
      else c.rotate(Math.sin(e.rot) * 0.35);
      c.font = `${e.kind === 'gold' ? 44 : 36}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (e.kind === 'gold' && !e.splat) { c.fillStyle = 'rgba(255,230,120,0.5)'; c.beginPath(); c.arc(0, 0, 28 + Math.sin(st.t * 8) * 4, 0, 7); c.fill(); }
      c.fillText(e.em, 0, 0);
      c.restore();
    }
    /** 네 꼭지 반짝 별 */
    function star(x, y, r) { c.beginPath(); c.moveTo(x, y - r * 2); c.lineTo(x + r * 0.5, y - r * 0.5); c.lineTo(x + r * 2, y); c.lineTo(x + r * 0.5, y + r * 0.5); c.lineTo(x, y + r * 2); c.lineTo(x - r * 0.5, y + r * 0.5); c.lineTo(x - r * 2, y); c.lineTo(x - r * 0.5, y - r * 0.5); c.fill(); }
    /** 먼 산 능선 + 초가 지붕 실루엣 (계절 색) */
    function festHills() {
      c.fillStyle = S.hills || 'rgba(0,0,0,0.15)';
      c.globalAlpha = 0.55;
      c.beginPath(); c.moveTo(0, H - 40);
      for (let x = 0; x <= W; x += 40) c.lineTo(x, H - 120 - Math.sin(x / 130) * 30 - Math.sin(x / 47 + 1) * 10);
      c.lineTo(W, H - 40); c.fill();
      c.globalAlpha = 0.85;
      for (const [x, w] of [[90, 120], [560, 140]]) { // 초가집: 둥근 지붕 + 벽
        c.beginPath(); c.ellipse(x, H - 92, w / 2, 26, 0, Math.PI, 0); c.fill();
        c.fillRect(x - w / 2 + 14, H - 92, w - 28, 52);
      }
      c.globalAlpha = 1;
      if (S.deco === 'snow') { c.fillStyle = 'rgba(255,255,255,0.9)'; for (const [x, w] of [[90, 120], [560, 140]]) { c.beginPath(); c.ellipse(x, H - 108, w / 2 - 6, 12, 0, Math.PI, 0); c.fill(); } }
    }
    /** 가지 장식 (계절마다): 봄 진달래 · 여름 창포 잎 · 가을 감·단풍 · 겨울 눈 쌓인 가지 */
    function festDeco(sh) {
      const d = S.deco;
      if (d === 'iris') { // 길쭉한 창포 잎 셋 + 보라 꽃 하나
        c.fillStyle = '#4fa34a';
        for (const [dx, a] of [[-8, -0.35], [0, 0], [8, 0.35]]) { c.save(); c.rotate(a); c.beginPath(); c.ellipse(dx, -20, 4, 22, 0, 0, 7); c.fill(); c.restore(); }
        c.fillStyle = '#7a5cc8'; c.beginPath(); c.arc(0, -40, 7, 0, 7); c.fill();
      } else if (d === 'persimmon') { // 단풍 잎 둘 + 주황 감 둘 (꼭지 초록)
        c.fillStyle = '#c9542a'; for (const [dx, dy] of [[-14, -14], [12, -18]]) { c.save(); c.translate(dx, dy); c.rotate(sh * 0.05 + dx); c.beginPath(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; c.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); c.lineTo(Math.cos(a + 0.6) * 4, Math.sin(a + 0.6) * 4); } c.fill(); c.restore(); }
        for (const [dx, dy] of [[-3, -2], [9, 4]]) { c.fillStyle = '#f08a24'; c.beginPath(); c.arc(dx, dy, 10, 0, 7); c.fill(); c.fillStyle = '#4e7a2a'; c.fillRect(dx - 4, dy - 12, 8, 3); }
      } else if (d === 'snow') { // 가지 위 눈 덩이
        c.fillStyle = '#ffffff'; for (const [dx, dy, r] of [[-10, -8, 9], [4, -12, 10], [14, -6, 7]]) { c.beginPath(); c.arc(dx, dy, r, Math.PI, 0); c.fill(); }
        c.fillStyle = 'rgba(180,200,230,0.8)'; c.fillRect(-14, -8, 30, 3);
      } else { // 진달래: 분홍 다섯 잎 꽃 셋
        for (const [dx, dy, r] of [[-12, -12, 10], [10, -16, 11], [0, -28, 9]]) {
          c.fillStyle = S.bloom;
          for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; c.beginPath(); c.arc(dx + Math.cos(a) * r * 0.55, dy + Math.sin(a) * r * 0.55, r * 0.5, 0, 7); c.fill(); }
          c.fillStyle = '#fff2f6'; c.beginPath(); c.arc(dx, dy, r * 0.25, 0, 7); c.fill();
        }
      }
    }
    /** 축제 배경: 하늘·땅·나뭇가지(꽃)·연등 줄 */
    function festBg() {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.sky[0]); g.addColorStop(1, S.sky[1]);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (S.moon) { c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(W - 120, 160, 46, 0, 7); c.fill(); c.fillStyle = 'rgba(255,243,196,0.18)'; c.beginPath(); c.arc(W - 120, 160, 70, 0, 7); c.fill(); }
      // 연등 줄
      c.strokeStyle = 'rgba(90,58,26,0.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 30); c.quadraticCurveTo(W / 2, 70, W, 30); c.stroke();
      const cols = ['#e8495a', '#fac03e', '#30b6aa', '#8e7cc3', '#f28bb0'];
      for (let i = 1; i < 12; i++) { const x = (i * W) / 12, y = 30 + Math.sin((i / 12) * Math.PI) * 32; c.fillStyle = cols[i % cols.length]; c.beginPath(); c.moveTo(x - 9, y); c.lineTo(x + 9, y); c.lineTo(x, y + 18); c.fill(); }
      festHills();
      c.fillStyle = S.ground; c.fillRect(0, H - 40, W, 40);
      c.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < 40; i++) c.fillRect((i * 97) % W, H - 34 + (i * 13) % 26, 10, 3);
      // 나뭇가지 (암탉 자리): 가지 + 꽃송이, 떨어뜨릴 때 흔들림
      c.strokeStyle = S.branch; c.lineWidth = 10; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 96); c.quadraticCurveTo(W / 2, 128, W, 96); c.stroke();
      for (const h of hens) {
        const sh = h.lay > 0 ? Math.sin((h.lay / 0.3) * Math.PI) * 5 : 0, b = Math.sin(h.bob) * 1.5;
        c.save(); c.translate(h.x + sh, 100 + b);
        c.strokeStyle = S.branch; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 6); c.lineTo(0, -14); c.stroke();
        festDeco(sh);
        c.restore();
      }
    }
    function egg(e) {
      if (S) return festItem(e);
      c.save(); c.translate(e.x, e.y);
      if (e.splat) {
        c.globalAlpha = Math.min(1, e.splat);
        c.fillStyle = e.kind === 'rotten' ? '#9bbf5a' : '#fff6e0'; c.beginPath(); c.ellipse(0, 6, 26, 8, 0, 0, 7); c.fill();
        c.fillStyle = e.kind === 'rotten' ? '#6a8f2a' : '#ffc53a'; c.beginPath(); c.arc(0, 4, 7, 0, 7); c.fill();
      } else {
        c.rotate(Math.sin(e.rot) * 0.3);
        const col = { white: '#fffdf5', brown: '#e9c08f', gold: '#ffd23a', rotten: '#a9c46a' }[e.kind];
        c.fillStyle = col; c.strokeStyle = 'rgba(90,58,26,0.35)'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(0, 0, 11, 14, 0, 0, 7); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-3, -5, 3, 5, -0.4, 0, 7); c.fill();
        if (e.kind === 'gold') { c.strokeStyle = 'rgba(255,240,150,0.9)'; for (let i = 0; i < 4; i++) { const a = st.t * 3 + i * 1.57; c.beginPath(); c.moveTo(Math.cos(a) * 16, Math.sin(a) * 18); c.lineTo(Math.cos(a) * 22, Math.sin(a) * 24); c.stroke(); } }
        if (e.kind === 'rotten') { c.fillStyle = '#5a6f2a'; c.beginPath(); c.arc(3, 3, 2.5, 0, 7); c.arc(-4, -2, 2, 0, 7); c.fill(); }
      }
      c.restore();
    }
    function draw() {
      if (S) festBg(); else henBg();
      for (const e of st.eggs) egg(e);
      drawRest();
    }
    function henBg() {
      // 배경: 닭장 안 나무 벽 + 창문 햇살 + 짚 바닥
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f6d9a8'); g.addColorStop(1, '#e8b978');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(140,90,40,0.18)'; c.lineWidth = 2;
      for (let x = 0; x < W; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
      c.fillStyle = 'rgba(255,250,220,0.35)'; c.beginPath(); c.moveTo(560, 0); c.lineTo(660, 0); c.lineTo(520, H); c.lineTo(400, H); c.fill();
      c.fillStyle = '#d8a659'; c.fillRect(0, H - 40, W, 40);
      c.strokeStyle = '#c08a3a'; for (let i = 0; i < 70; i++) { const x = (i * 97) % W, y = H - 36 + (i * 13) % 30; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 14, y - 4); c.stroke(); }
      // 횃대 + 암탉
      c.fillStyle = '#8a5a32'; c.fillRect(30, 104, W - 60, 12); c.fillStyle = '#6e4626'; c.fillRect(30, 114, W - 60, 4);
      for (const h of hens) hen(h.x, 78, h);
    }
    function drawRest() {
      // 바구니
      const sq = st.squash > 0 ? Math.sin(st.squash / 0.18 * Math.PI) * 0.12 : 0;
      c.save(); c.translate(st.basket, H - 58); c.scale(1 + sq, 1 - sq);
      c.fillStyle = '#b07a4a'; c.beginPath(); c.moveTo(-56, -14); c.lineTo(56, -14); c.lineTo(44, 22); c.lineTo(-44, 22); c.closePath(); c.fill();
      c.strokeStyle = '#7a5230'; c.lineWidth = 3; for (let i = -40; i <= 40; i += 16) { c.beginPath(); c.moveTo(i, -12); c.lineTo(i * 0.8, 20); c.stroke(); }
      c.beginPath(); c.moveTo(-58, -14); c.lineTo(58, -14); c.lineWidth = 6; c.strokeStyle = '#8a5a32'; c.stroke();
      c.restore();
      for (const f of st.fx) {
        c.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
        if (f.txt) { c.fillStyle = f.col; c.font = "22px 'Unico Coin', Jua, sans-serif"; c.textAlign = 'center'; c.fillText(f.txt, f.x, f.y); }
        else { c.fillStyle = f.col; c.beginPath(); c.arc(f.x, f.y, 4, 0, 7); c.fill(); }
      }
      c.globalAlpha = 1;
      // HUD
      c.fillStyle = 'rgba(255,250,240,0.92)'; c.beginPath(); c.roundRect(14, 12, 220, 46, 14); c.fill();
      c.fillStyle = '#6b4a2e'; c.font = "22px 'Unico Coin', Jua, sans-serif"; c.textAlign = 'left'; c.fillText(`${S ? S.icon : '🥚'} ${st.score}점`, 28, 43);
      if (st.combo >= 3) { c.fillStyle = st.combo >= 20 ? '#e8495a' : st.combo >= 10 ? '#f28c28' : '#299d93'; c.fillText(`${st.combo} 연속!`, 132, 43); }
      const left = Math.max(0, DUR - st.t);
      c.fillStyle = 'rgba(255,250,240,0.92)'; c.beginPath(); c.roundRect(W - 234, 12, 220, 46, 14); c.fill();
      c.fillStyle = '#e8d6b8'; c.fillRect(W - 220, 30, 150, 12); c.fillStyle = left < 10 ? '#e8495a' : '#30b6aa'; c.fillRect(W - 220, 30, 150 * left / DUR, 12);
      c.fillStyle = '#6b4a2e'; c.textAlign = 'right'; c.fillText(`${Math.ceil(left)}초`, W - 24, 43);
      const move = T ? '화면을 손가락으로 끌어 바구니 옮기기' : '마우스·터치로 끌거나 ← → 키';
      if (!st.started) {
        if (S) panel(`${S.icon} ${S.title}`, [`떨어지는 ${S.goodName}${josa(S.goodName, '을/를')} 바구니로 받으세요!`, move, `${S.gold} ${S.goldName} +5 · ${S.bad} ${S.badName}${josa(S.badName, '은/는')} 피하기`, '10연속 ×2, 20연속 ×3 · 별만큼 축제 엽전', '움직이면 시작!'], `최고 기록 ${best}점`);
        else panel('🥚 달걀 받기', ['암탉이 낳는 달걀을 바구니로 받으세요!', move, '🟡 황금 달걀 +5 · 🟢 썩은 달걀은 피하기', '10연속 ×2, 20연속 ×3', '움직이면 시작!'], `최고 기록 ${best}점`);
      }
      if (st.over) panel('🎉 끝!', [`점수 ${st.score}점 (최대 ${st.maxCombo} 연속)`, S ? '별 개수만큼 축제 엽전을 받아요' : `보상: 달걀 ${Math.floor(st.score / 5)}개 + ${st.score * 2}🪙`, st.score > best ? '🏆 새 최고 기록!' : `최고 기록 ${best}점`], T ? '화면을 눌러 마치기' : '클릭하거나 E 로 마치기');
    }
    function panel(title, lines, foot) {
      c.fillStyle = 'rgba(35,25,22,0.45)'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fffaf0'; c.beginPath(); c.roundRect(W / 2 - 230, 90, 460, 70 + lines.length * 32, 24); c.fill();
      c.textAlign = 'center'; c.fillStyle = '#299d93'; c.font = "30px 'Unico Coin', Jua, sans-serif"; c.fillText(title, W / 2, 135);
      c.fillStyle = '#6b4a2e'; c.font = "19px 'Unico Coin', Jua, sans-serif"; lines.forEach((l, i) => c.fillText(l, W / 2, 172 + i * 30));
      c.fillStyle = '#a07e5c'; c.font = "15px 'Unico Coin', Jua, sans-serif"; c.fillText(foot, W / 2, 172 + lines.length * 30 + 4);
    }
    function finish() {
      if (st.closed) return; st.closed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true);
      wrap.remove();
      game.player.frozen = false;
      const res = { score: st.score, eggs: st.over ? Math.floor(st.score / 5) : 0, coins: st.over ? st.score * 2 : 0, best: Math.max(best, st.score), prev: best, over: st.over, maxCombo: st.maxCombo };
      if (st.over) try { localStorage.setItem(BEST_KEY, String(res.best)); } catch { /* 무시 */ }
      resolve(res);
    }
    raf = requestAnimationFrame(step);
  });
}
