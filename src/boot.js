// 부팅: 모델·글꼴 받기 → 닉네임 입력 → 입장(게임 만들기·셰이더 미리 준비·로딩 화면 걷기)
// main.js 가 boot(Game) 으로 부름 (Game 클래스는 main.js)
import { Assets } from './game/assets.js';
import { LAYOUT } from './game/world.js';
import { isSubmitEnter } from './game/input.js';
import { Audio } from './game/audio.js';
import { loadSave } from './game/save.js';
import { randomName } from './game/names.js';
import { isMobileDevice } from './game/quality.js';
import { joinQrBox } from './ui/join_qr.js';
import { HILLS } from './game/terrain.js';
import { VILLAGER_SPECIES, VILLAGER_NAMES } from './game/species.js';
import { speciesSVG } from './ui/portrait_species.js';

/** 뒤로 가기용 기록 하나 끼워 두기 (주소·쿼리는 그대로) */
export function pushBackGuard() {
  try { if (!history.state?.unicoBack) history.pushState({ unicoBack: 1 }, ''); } catch { /* 무시 */ }
}
/** 캔버스로 굽는 이름표·표지판 글자: Jua 한글 조각을 미리 받아 대체 글꼴로 굳지 않게 */
const LABEL_TEXT = [
  ...Object.values(LAYOUT.npcs).map((n) => n.name), ...HILLS.map((h) => h.name),
  '유니코 팜 스마트팜 목장 밭갈이 트랙터 체험 양 몰이 우리에 넣어요 전망대 올라와 보세요 오늘의 주문서 로컬푸드 직매장 납품',
  '낚시터 기록판 의뢰 최대어 새 마을 부지 코인으로 건물을 지어요 KOAT 체험관 콩이 명예 연구원',
].join(' ');

// 첫 화면 아래 마을 친구들 줄 (2D 초상화, 3D 모델을 받기 전에 바로 보임)
const FRIEND_COLOR = { merchant: '#f28c28', researcher: '#8e7cc3', guide: '#6dbb4f', granny: '#a07e5c', fisher: '#3a7bd5', kid: '#f28bb0' };
function titleFriends() {
  const box = document.querySelector('#loading .title-friends');
  if (!box || box.childElementCount) return;
  box.innerHTML = Object.keys(VILLAGER_SPECIES).map((id, i) =>
    `<figure style="animation-delay:${0.15 + i * 0.08}s"><svg viewBox="0 0 200 200">${speciesSVG(VILLAGER_SPECIES[id], FRIEND_COLOR[id], 'cheer', `tf_${id}_`)}</svg><figcaption>${VILLAGER_NAMES[id]}</figcaption></figure>`).join('');
}

// 첫 화면: 마우스(손가락)를 따라 팔랑팔랑 날아다니는 노란 나비 — 로딩 화면이 사라지면 스스로 멈춤
const BUTTERFLY = '<svg viewBox="-24 -20 48 40"><g class="wl"><path d="M-2 -2C-10 -20 -24 -16 -21 -4C-19 4 -9 3 -2 0Z" fill="#ffd84a" stroke="#c98a12" stroke-width="2"/><path d="M-2 1C-12 4 -17 15 -9 17C-4 18 -1 9 -1 3Z" fill="#ffe887" stroke="#c98a12" stroke-width="2"/><circle cx="-13" cy="-8" r="2.6" fill="#f08a24"/></g><g class="wr"><path d="M2 -2C10 -20 24 -16 21 -4C19 4 9 3 2 0Z" fill="#ffd84a" stroke="#c98a12" stroke-width="2"/><path d="M2 1C12 4 17 15 9 17C4 18 1 9 1 3Z" fill="#ffe887" stroke="#c98a12" stroke-width="2"/><circle cx="13" cy="-8" r="2.6" fill="#f08a24"/></g><rect x="-1.8" y="-9" width="3.6" height="22" rx="1.8" fill="#5a3b1e"/><path d="M-1 -9Q-5 -17 -8 -18M1 -9Q5 -17 8 -18" stroke="#5a3b1e" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>';
function titleButterfly() {
  const ld = document.getElementById('loading');
  if (!ld || ld.querySelector('.title-butterfly') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const b = document.createElement('div');
  b.className = 'title-butterfly';
  b.setAttribute('aria-hidden', 'true');
  b.innerHTML = BUTTERFLY;
  ld.append(b);
  // 처음에는 화면 위쪽을 한가로이 날다가, 포인터가 움직이면 그 곁으로 (커서를 가리지 않게 살짝 위·옆에서 맴돎)
  let x = innerWidth * 0.3, y = innerHeight * 0.25, tx = x, ty = y, ang = 0, t = 0, last = performance.now(), idle = 99;
  const onMove = (e) => { tx = e.clientX; ty = e.clientY; idle = 0; };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onMove, { passive: true });
  const step = (now) => {
    if (!ld.isConnected || ld.classList.contains('out')) { removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onMove); b.remove(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; idle += dt;
    // 멈춰 있으면 포인터 둘레를 맴돌고, 오래 멈추면 더 넓게 노님
    const orbit = idle > 2.5 ? 70 : 34;
    const gx = tx + Math.cos(t * 1.3) * orbit + 18, gy = ty - 26 + Math.sin(t * 2.1) * orbit * 0.6;
    const k = 1 - Math.exp(-dt * 3.2);
    const vx = (gx - x) * k, vy = (gy - y) * k;
    x += vx; y += vy + Math.sin(t * 9) * 0.6; // 날갯짓에 맞춰 살짝 오르내림
    const want = Math.max(-0.6, Math.min(0.6, vx * 0.05));
    ang += (want - ang) * Math.min(1, dt * 6);
    b.style.transform = `translate(${x - 22}px, ${y - 18}px) rotate(${ang}rad)`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export async function boot(Game) {
  const canvas = document.getElementById('game');
  const bar = document.getElementById('loading-bar');
  const btn = document.getElementById('start-btn');
  const nick = document.getElementById('nickname');
  const saved = loadSave();
  nick.value = saved?.name || randomName();
  titleFriends();
  titleButterfly();
  const assets = new Assets();
  // 글자를 넘겨야 그 글자가 든 한글 조각을 받음 (글자 없이 부르면 라틴 조각만 받아 이름표가 대체 글꼴로 구워짐)
  const fontReady = Promise.race([Promise.all([document.fonts?.load?.('40px Jua', `${LABEL_TEXT} ${nick.value}`), document.fonts?.load?.("20px 'Unico Coin'", '🪙')]).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
  await Promise.all([assets.loadAll((p) => (bar.style.width = Math.round(p * 100) + '%')), fontReady]);
  assets.loadDeferred(saved?.player).catch(() => {}); // 첫 화면에 필요 없는 모델(늑대·산여우·주민 원본 몸·KOAT 네 발 원본)은 닉네임을 고르는 동안 뒤에서, 원본 몸은 저장 위치에서 가까운 주민부터
  const lt = document.getElementById('loading-text');
  if (lt) lt.textContent = '준비 완료! 닉네임을 정하고 입장하세요';
  // 로그인 화면 접속 QR (휴대폰으로 같은 게임에 바로 들어오기, 좁은 화면·터치 기기에서는 숨김)
  try { const q = joinQrBox(); q.classList.add('login-qr'); document.getElementById('loading')?.append(q); } catch { /* QR 없이도 입장 가능 */ }
  btn.disabled = false;
  btn.textContent = '입장하기';
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    // iOS: 소리 장치는 탭 처리 안에서(첫 await 전에) 만들고 켜야 함
    const audio = new Audio();
    audio.unlock();
    if (isMobileDevice()) pushBackGuard(); // 뒤로 가기 기록도 탭 처리 안에서 (사용자 동작 없이 넣은 기록은 브라우저가 건너뜀)
    const name = (nick.value.trim() || randomName()).slice(0, 12);
    const ld = document.getElementById('loading');
    btn.disabled = true;
    if (lt) lt.textContent = '농장을 만드는 중…';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // 문구가 먼저 그려지게 (월드 만들기는 한 번에 실행돼 화면이 잠시 멈춤)
    await Promise.race([Promise.resolve(document.fonts?.load?.('40px Jua', name)).catch(() => {}), new Promise((r) => setTimeout(r, 800))]); // 바꾼 닉네임 글자
    window.game = new Game(canvas, assets, name, audio);
    window.game.audio.play('click'); // 입장 소리 (소리 장치는 위에서 탭 처리 안에 이미 켬)
    window.game.music.start();
    // 첫 화면 끊김 방지: 로딩 화면 뒤에서 셰이더를 미리 컴파일(가능하면 병렬)하고 두 프레임 그린 뒤 보여 줌
    if (lt) lt.textContent = '화면 준비 중…';
    await new Promise((r) => requestAnimationFrame(r)); // '화면 준비 중' 문구가 먼저 보이게
    // 셰이더 미리 준비: 지원 브라우저(KHR_parallel_shader_compile)는 병렬로, 화면을 멈추지 않고 기다림.
    // 일부 환경에서 compileAsync 가 끝나지 않는 일이 있어 최대 5초만 기다림 (남은 것은 첫 프레임에)
    // 닉네임을 고르는 동안 받아 둔 동물도 여기서 함께 (로딩 화면이 사라지는 순간에 컴파일이 몰리지 않게)
    const R = window.game.renderer, sc = window.game.world.scene, cm = window.game.camera;
    try {
      try { await Promise.race([Promise.all([R.compileAsync(sc, cm), window.game.warmDeferred()]), new Promise((r) => setTimeout(r, 5000))]); }
      catch { try { R.compile(sc, cm); } catch { /* 첫 프레임에 컴파일 */ } }
      window.game.warmUp?.();
    } finally { window.game.startLoop(); } // 이제부터 루프: 아래 두 프레임은 로딩 화면 뒤에서 실제로 그려짐
    await Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 1500))]);
    ld.classList.add('out');
    setTimeout(() => ld.remove(), 650);
    window.game.shown();
  };
  btn.onclick = start;
  nick.addEventListener('keydown', (e) => { if (isSubmitEnter(e)) start(); }); // 한글 조합 중 Enter 로 이름 끝 글자가 빠진 채 입장하지 않게
  if (new URLSearchParams(location.search).has('autostart')) start();
}
