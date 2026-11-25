import { Spr } from './pxl.js';

/**
 * 첫 화면 (3D 판 첫 화면 새 단장을 도트로)
 *  - 배경: 코드로 찍은 도트 풍경 (해·구름·겹친 언덕·밭 이랑·헛간과 사일로·흩날리는 꽃잎), 낮은 해상도로 그려 크게 키움
 *  - 카드: 나무 액자 테두리 · 유니코 배지 · 외곽선 로고 · 리본 · 마을 친구 초상 줄 · 준비 막대 · 시작 단추
 *  - 노란 나비: 마우스·손가락을 따라 팔랑이며 맴돎 (움직임 줄이기 설정이면 안 나옴)
 */
const BW = 240, BH = 135;

/** 배경 풍경 한 장 (꽃잎은 따로 움직임) */
function paintBackdrop(season = 'spring') {
  const s = new Spr(BW, BH);
  // 하늘 (위 → 아래 밝게, 줄무늬 디더)
  for (let y = 0; y < 70; y++) for (let x = 0; x < BW; x++) {
    const k = y / 70 + ((x + y) % 4 === 0 ? 0.04 : 0);
    s.set(x, y, 'water', k < 0.35 ? 4 : k < 0.8 ? 5 : 5);
  }
  for (let y = 0; y < 26; y++) for (let x = 0; x < BW; x++) if ((x + y) % 2 === 0 && y < 12) s.set(x, y, 'water', 4);
  // 해 + 빛무리
  for (let y = 4; y < 42; y++) for (let x = 172; x < 212; x++) { const d = Math.hypot(x - 192, y - 22); if (d < 18 && d > 11 && (x + y) % 3 === 0) s.set(x, y, 'gold', 4); } // 빛무리
  s.ell(192, 22, 10, 10, 'gold', { level: 3 }); s.ell(190, 20, 6, 6, 'gold', { level: 4 });
  // 구름
  for (const [cx, cy, w] of [[40, 22, 18], [112, 14, 14], [150, 34, 10]]) { s.ell(cx, cy, w, 5, 'white', { lo: 3, hi: 4 }); s.ell(cx - w * 0.4, cy - 3, w * 0.5, 4, 'white', { level: 4 }); s.ell(cx + w * 0.4, cy - 2, w * 0.45, 4, 'white', { level: 4 }); }
  // 먼 언덕 → 가까운 언덕 (겹)
  const hill = (base, amp, freq, ph, r, lv) => { for (let x = 0; x < BW; x++) { const h = base - amp * Math.sin(x / freq + ph) - amp * 0.4 * Math.sin(x / (freq * 0.43) + ph * 2); for (let y = Math.round(h); y < BH; y++) s.set(x, y, r, lv); } };
  hill(70, 7, 30, 1.2, 'pine', 2);
  hill(80, 6, 24, 3.1, 'grass', 2);
  hill(90, 5, 40, 0.4, 'grass', 3);
  // 밭 이랑 (원근: 아래로 갈수록 넓게)
  for (let y = 100; y < BH; y++) {
    const w = (y - 100) * 3 + 40, x0 = 30 - (y - 100) * 1.2;
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(BW, x0 + w); x++) {
      const row = Math.floor((x - x0) / (4 + (y - 100) * 0.12));
      s.set(x, y, row % 2 ? 'soil' : 'cabbage', row % 2 ? 2 : (y % 3 === 0 ? 3 : 2));
    }
  }
  // 헛간 + 사일로
  s.rect(150, 70, 30, 22, 'barn', 3); s.poly([148, 71, 165, 58, 182, 71], 'roof', { level: 2 }); s.hline(148, 182, 71, 'white', 4);
  s.rect(160, 78, 10, 14, 'wood', 1); s.line(160, 78, 169, 91, 'white', 4); s.line(169, 78, 160, 91, 'white', 4);
  s.rect(184, 56, 12, 36, 'silver', 3); s.vline(184, 56, 91, 'silver', 2); s.ell(190, 56, 6, 4, 'roofb', { lo: 2, hi: 3 });
  // 울타리
  for (let x = 120; x < 240; x += 6) s.vline(x, 88, 94, 'wood', 4);
  s.hline(120, 239, 90, 'wood', 3);
  // 나무 몇 그루 (계절 색)
  const leaf = season === 'autumn' ? 'autumn' : season === 'winter' ? 'silver' : 'fol';
  for (const [x, y, r] of [[20, 80, 10], [36, 86, 7], [222, 84, 9]]) { s.rect(x - 1, y, 3, 10, 'bark', 2); s.ell(x, y - 2, r, r * 0.9, leaf, { lo: 2, hi: season === 'spring' ? 4 : 4 }); if (season === 'spring') for (let k = 0; k < 6; k++) s.set(x - r + 2 + k * 3, y - 4 + (k % 3), 'rose', 3); }
  // 들꽃
  for (let i = 0; i < 40; i++) { const x = (i * 53) % BW, y = 93 + ((i * 17) % 8); if (y < 100) s.set(x, y, ['flowr', 'flowy', 'floww', 'flowp'][i % 4], 2); }
  return s;
}

/** 작은 도트 나비 (날개 펴기 / 접기) */
function butterflyFrames() {
  return [0, 1].map((f) => {
    const s = new Spr(11, 9);
    const w = f ? 2 : 4;
    s.ell(5.5 - w * 0.6, 3.5, w * 0.7, 2.6, 'corn', { lo: 2, hi: 3 }); s.ell(5.5 + w * 0.6, 3.5, w * 0.7, 2.6, 'corn', { lo: 2, hi: 3 });
    s.ell(5.5 - w * 0.5, 6, w * 0.5, 1.8, 'corn', { lo: 1, hi: 2 }); s.ell(5.5 + w * 0.5, 6, w * 0.5, 1.8, 'corn', { lo: 1, hi: 2 });
    s.vline(5, 2, 7, 'ink', 1); s.set(4, 1, 'ink', 1); s.set(6, 1, 'ink', 1);
    if (!f) { s.set(3, 3, 'apron', 2); s.set(7, 3, 'apron', 2); }
    s.outline();
    return s.toCanvas();
  });
}

export function setupTitle({ S, season = 'spring', onReady }) {
  const root = document.getElementById('title');
  if (!root) return { done() {} };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 배경 캔버스 (낮은 해상도 → CSS 로 크게, 픽셀 그대로)
  const bg = document.createElement('canvas'); bg.width = BW; bg.height = BH; bg.className = 'title-bg';
  const g = bg.getContext('2d');
  const base = paintBackdrop(season).toCanvas();
  root.prepend(bg);
  // 마을 친구 초상 줄
  const row = root.querySelector('.friends');
  if (row) {
    for (const sp of ['fox', 'raccoon', 'puppy', 'bear', 'cat', 'rabbit']) {
      const src = S.villager(sp, 'down', 0), c = document.createElement('canvas'); c.width = c.height = 32;
      const cg = c.getContext('2d'); cg.drawImage(src, 4, sp === 'rabbit' ? 0 : 2, 32, 32, 0, 0, 32, 32);
      const im = document.createElement('img'); im.src = c.toDataURL(); im.alt = ''; row.appendChild(im);
    }
  }
  // 배지 (유니코 얼굴)
  const badge = root.querySelector('.badge img');
  if (badge) { const src = S.char('player', { scarf: 'scarf' }, 'down', 0), c = document.createElement('canvas'); c.width = c.height = 34; c.getContext('2d').drawImage(src, 3, 0, 34, 34, 0, 0, 34, 34); badge.src = c.toDataURL(); }

  // 꽃잎 (봄) / 낙엽 / 눈
  const petals = Array.from({ length: 26 }, (_, i) => ({ x: (i * 37) % BW, y: (i * 23) % BH, v: 6 + (i % 5) * 2, ph: i }));
  const petalCol = season === 'autumn' ? '#e0802c' : season === 'winter' ? '#ffffff' : '#f8a6c4';
  // 나비
  const fly = reduce ? null : { img: butterflyFrames(), x: innerWidth * 0.7, y: innerHeight * 0.3, tx: innerWidth * 0.7, ty: innerHeight * 0.3, a: 0, idle: 0 };
  let flyEl = null;
  if (fly) {
    flyEl = document.createElement('canvas'); flyEl.width = 11; flyEl.height = 9; flyEl.className = 'title-fly'; root.appendChild(flyEl);
    const follow = (e) => { fly.tx = e.clientX; fly.ty = e.clientY; fly.idle = 0; };
    root.addEventListener('pointermove', follow); root.addEventListener('pointerdown', follow);
  }
  // 준비 막대: 자주 쓰는 그림을 미리 굽는 동안 차오름
  const bar = root.querySelector('.load i'), btn = root.querySelector('#start'), label = root.querySelector('.load span');
  let prog = 0, ready = false;
  const warm = [() => S.tractor(true, 0), () => S.ride('bike', 8), () => S.ride('cart', 8), ...['fox', 'raccoon', 'puppy', 'bear', 'cat', 'rabbit'].map((sp) => () => { for (const d of ['down', 'left', 'right', 'up']) S.villager(sp, d, 0); }), () => S.decor('bench')];
  let wi = 0;
  const t0 = performance.now();
  let raf = 0;
  const tick = (now) => {
    const t = Math.max(0, (now - t0) / 1000);
    // 준비
    if (!ready) {
      if (wi < warm.length) { try { warm[wi](); } catch { /* 없어도 진행 */ } wi++; }
      prog = Math.min(1, Math.max(wi / warm.length, t / 1.2) * (wi >= warm.length ? 1 : 0.95));
      if (bar) bar.style.width = `${Math.round(prog * 100)}%`;
      if (wi >= warm.length && t > 0.6) { ready = true; if (bar) bar.style.width = '100%'; if (label) label.textContent = '준비 완료!'; root.classList.add('ready'); btn.disabled = false; onReady?.(); }
    }
    // 배경
    g.drawImage(base, 0, 0);
    if (!reduce) {
      g.fillStyle = petalCol;
      for (const p of petals) {
        p.y += p.v / 60; p.x += Math.sin(t * 1.3 + p.ph) * 0.35 - 0.15;
        if (p.y > BH) { p.y = -2; p.x = Math.random() * BW; }
        if (p.x < -2) p.x = BW;
        g.fillRect(Math.round(p.x), Math.round(p.y), season === 'winter' ? 1 : 2, 1);
      }
    }
    // 나비: 손을 대지 않으면 그 자리를 빙글 맴돎
    if (fly) {
      fly.idle += 1 / 60;
      const orbit = Math.min(1, fly.idle / 1.5);
      const gx = fly.tx + Math.cos(t * 1.7) * 46 * orbit, gy = fly.ty + Math.sin(t * 2.3) * 30 * orbit - 18;
      fly.x += (gx - fly.x) * 0.05; fly.y += (gy - fly.y) * 0.05 + Math.sin(t * 9) * 0.6;
      const fc = flyEl.getContext('2d'); fc.clearRect(0, 0, 11, 9); fc.drawImage(fly.img[Math.floor(t * 10) % 2], 0, 0);
      flyEl.style.transform = `translate(${Math.round(fly.x)}px, ${Math.round(fly.y)}px) scale(${Math.max(2, Math.round(innerHeight / 260))}) scaleX(${gx < fly.x ? -1 : 1})`;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return { done() { cancelAnimationFrame(raf); }, get ready() { return ready; } };
}
