/**
 * 미니게임: 달걀 받기 (닭장)
 *  횃대 위 암탉들이 낳는 달걀을 바구니로 받기. 마우스/터치로 끌거나 ←→ / A·D 키.
 *  흰·갈색 달걀 +1, 황금 달걀 +5(반짝), 썩은 달걀 -3(콤보 끊김). 10연속부터 콤보 ×2, 20연속 ×3.
 *  45초 동안 점점 빨라짐. 결과: 달걀(점수/5) + 코인(점수×2), 최고 기록 저장.
 */
export function playEggCatch(game) {
  return new Promise((resolve) => {
    const W = 720, H = 460, DUR = 45;
    const wrap = document.createElement('div');
    wrap.className = 'mg-wrap';
    wrap.innerHTML = `<div class="mg-box"><canvas width="${W}" height="${H}"></canvas><button class="mg-close">✕</button></div>`;
    document.getElementById('ui').append(wrap);
    const cv = wrap.querySelector('canvas'), c = cv.getContext('2d');
    game.player.frozen = true;
    const best = +(localStorage.getItem('unico.egg.best') || 0);
    const hens = [0, 1, 2, 3, 4].map((i) => ({ x: 90 + i * 135, bob: Math.random() * 6, lay: 0 }));
    const st = { t: 0, score: 0, combo: 0, maxCombo: 0, caught: 0, basket: W / 2, bv: 0, eggs: [], fx: [], spawn: 1, started: false, over: false, keys: new Set() };
    let raf = 0, last = performance.now();
    const snd = (f, d = 0.12) => game.audio.pluck(f, 0.5, 0, undefined, d);

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
      st.eggs.push({ x: h.x + (Math.random() - 0.5) * 20, y: 112, vy: 60 + lvl * 120 + Math.random() * 40, kind, rot: 0 });
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
          if (e.kind === 'rotten') { st.score = Math.max(0, st.score - 3); st.combo = 0; burst(e.x, e.y, '#8bbf4a', 14); text(e.x, e.y - 20, '-3 으악!', '#6a8f2a'); game.audio.play('bump', 0.5); }
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
    function egg(e) {
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
      for (const e of st.eggs) egg(e);
      // 바구니
      const sq = st.squash > 0 ? Math.sin(st.squash / 0.18 * Math.PI) * 0.12 : 0;
      c.save(); c.translate(st.basket, H - 58); c.scale(1 + sq, 1 - sq);
      c.fillStyle = '#b07a4a'; c.beginPath(); c.moveTo(-56, -14); c.lineTo(56, -14); c.lineTo(44, 22); c.lineTo(-44, 22); c.closePath(); c.fill();
      c.strokeStyle = '#7a5230'; c.lineWidth = 3; for (let i = -40; i <= 40; i += 16) { c.beginPath(); c.moveTo(i, -12); c.lineTo(i * 0.8, 20); c.stroke(); }
      c.beginPath(); c.moveTo(-58, -14); c.lineTo(58, -14); c.lineWidth = 6; c.strokeStyle = '#8a5a32'; c.stroke();
      c.restore();
      for (const f of st.fx) {
        c.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
        if (f.txt) { c.fillStyle = f.col; c.font = '22px Jua, sans-serif'; c.textAlign = 'center'; c.fillText(f.txt, f.x, f.y); }
        else { c.fillStyle = f.col; c.beginPath(); c.arc(f.x, f.y, 4, 0, 7); c.fill(); }
      }
      c.globalAlpha = 1;
      // HUD
      c.fillStyle = 'rgba(255,250,240,0.92)'; c.beginPath(); c.roundRect(14, 12, 220, 46, 14); c.fill();
      c.fillStyle = '#6b4a2e'; c.font = '22px Jua, sans-serif'; c.textAlign = 'left'; c.fillText(`🥚 ${st.score}점`, 28, 43);
      if (st.combo >= 3) { c.fillStyle = st.combo >= 20 ? '#e8495a' : st.combo >= 10 ? '#f28c28' : '#299d93'; c.fillText(`${st.combo} 연속!`, 132, 43); }
      const left = Math.max(0, DUR - st.t);
      c.fillStyle = 'rgba(255,250,240,0.92)'; c.beginPath(); c.roundRect(W - 234, 12, 220, 46, 14); c.fill();
      c.fillStyle = '#e8d6b8'; c.fillRect(W - 220, 30, 150, 12); c.fillStyle = left < 10 ? '#e8495a' : '#30b6aa'; c.fillRect(W - 220, 30, 150 * left / DUR, 12);
      c.fillStyle = '#6b4a2e'; c.textAlign = 'right'; c.fillText(`${Math.ceil(left)}초`, W - 24, 43);
      if (!st.started) panel('🥚 달걀 받기', ['암탉이 낳는 달걀을 바구니로 받으세요!', '마우스·터치로 끌거나 ← → 키', '🟡 황금 달걀 +5 · 🟢 썩은 달걀은 피하기', '10연속 ×2, 20연속 ×3', '움직이면 시작!'], `최고 기록 ${best}점`);
      if (st.over) panel('🎉 끝!', [`점수 ${st.score}점 (최대 ${st.maxCombo} 연속)`, `보상: 달걀 ${Math.floor(st.score / 5)}개 + ${st.score * 2}🪙`, st.score > best ? '🏆 새 최고 기록!' : `최고 기록 ${best}점`], '클릭하거나 E 로 마치기');
    }
    function panel(title, lines, foot) {
      c.fillStyle = 'rgba(35,25,22,0.45)'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fffaf0'; c.beginPath(); c.roundRect(W / 2 - 230, 90, 460, 70 + lines.length * 32, 24); c.fill();
      c.textAlign = 'center'; c.fillStyle = '#299d93'; c.font = '30px Jua, sans-serif'; c.fillText(title, W / 2, 135);
      c.fillStyle = '#6b4a2e'; c.font = '19px Jua, sans-serif'; lines.forEach((l, i) => c.fillText(l, W / 2, 172 + i * 30));
      c.fillStyle = '#a07e5c'; c.font = '15px Jua, sans-serif'; c.fillText(foot, W / 2, 172 + lines.length * 30 + 4);
    }
    function finish() {
      if (st.closed) return; st.closed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true);
      wrap.remove();
      game.player.frozen = false;
      const res = { score: st.score, eggs: st.over ? Math.floor(st.score / 5) : 0, coins: st.over ? st.score * 2 : 0, best: Math.max(best, st.score), prev: best, over: st.over, maxCombo: st.maxCombo };
      if (st.over) try { localStorage.setItem('unico.egg.best', String(res.best)); } catch { /* 무시 */ }
      resolve(res);
    }
    raf = requestAnimationFrame(step);
  });
}
