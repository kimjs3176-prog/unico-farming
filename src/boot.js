// 부팅: WebGL2 확인 → 모델·글꼴 받기 → 닉네임 입력 → 입장(게임 만들기·셰이더 미리 준비·로딩 화면 걷기)
// main.js 가 boot(Game) 으로 부름 (Game 클래스는 main.js). 어느 단계든 실패하면 로딩 카드가 오류 안내로 바뀜 (멈춘 채 두지 않음)
import { Assets } from './game/assets.js';
import { LAYOUT } from './game/world.js';
import { isSubmitEnter } from './game/input.js';
import { Audio } from './game/audio.js';
import { Ambience } from './game/ambience.js';
import { loadSaveInfo, loadBackup } from './game/save.js';
import { record, copyDiag } from './game/crash.js';
import { onFetchRetry } from './game/fetch_gz.js';
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
const FRIEND_COLOR = { merchant: '#f28c28', researcher: '#8e7cc3', guide: '#6dbb4f', granny: '#a07e5c', fisher: '#3170c9', kid: '#f28bb0' };
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

/**
 * WebGL2 를 켤 수 있는지: 버리는 캔버스로 확인하고 바로 놓음 (모델 3MB 를 받기 전에)
 * #game 에 먼저 부르면 그 캔버스의 설정이 굳어 three 의 antialias 요청이 무시되므로 따로 만든 캔버스로
 */
export function probeWebGL2(doc = document) {
  let why = '';
  try {
    const c = doc.createElement('canvas');
    c.addEventListener?.('webglcontextcreationerror', (e) => { why = e?.statusMessage || why; });
    const gl = c.getContext('webgl2');
    if (!gl) return { ok: false, why };
    gl.getExtension?.('WEBGL_lose_context')?.loseContext();
    return { ok: true, why: '' };
  } catch (e) { return { ok: false, why: e?.message || String(e) }; }
}

/** 부팅 오류 코드 → 로딩 카드 문구 */
export const BOOT_ERR = {
  'E-GL': { text: '이 기기에서는 3D 화면을 켤 수 없어요', sub: '브라우저를 최신으로 바꾸면 3D로 즐길 수 있어요. 지금은 도트(2.5D) 버전으로 바로 놀 수 있어요.' },
  'E-NET': { text: '농장을 불러오지 못했어요', sub: '인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 시도해요.', subOnline: '연결이 불안정해 받다가 멈췄어요. 잠시 뒤 다시 시도해 주세요.' },
  'E-BOOT': { text: '농장을 여는 중에 문제가 생겼어요', sub: '다시 시도하면 대부분 해결돼요. 농장 기록은 그대로예요.' },
  'E-START': { text: '농장을 만드는 중에 문제가 생겼어요', sub: '다시 시도하면 대부분 해결돼요. 농장 기록은 그대로예요.' },
};

/** 실패 → 오류 코드 (망 끊김 · WebGL · 그 밖) */
export function bootCode(e, stage = 'load') {
  if (e?.code === 'E-NET' || globalThis.navigator?.onLine === false) return 'E-NET';
  if (/WebGL/i.test(String(e?.message || ''))) return 'E-GL';
  return stage === 'start' ? 'E-START' : 'E-BOOT';
}

/** 다른 기기에서 열 수 없는 내 컴퓨터 주소인가 (접속 QR 을 숨김) */
export function isLocalHost(host = '') {
  return /^(localhost|127\.|\[?::1\]?$)/.test(String(host));
}

/** 줄 끝에서 쪼개지면 어색한 말 (도트(2.5D) 버전 등) */
const NOWRAP = /도트\(2\.5D\) 버전/g;

/**
 * 로딩 카드를 오류 안내로 바꿈: 진행 막대·닉네임·기능 칩·조작 안내를 숨기고 큰 단추는 [다시 시도](새로고침) — WebGL2 가 없으면 [도트(2.5D) 버전으로 하기]
 * E-NET 이면 망이 돌아올 때 저절로 새로고침 (카드를 거두면 그 듣기도 뗌)
 * @param opt.onTry3d 있으면 작은 [그래도 3D로 시도] 단추
 * @returns 카드를 원래대로 되돌리는 함수
 */
export function bootErrorCard(code, err, opt = {}) {
  record(err ?? code, `boot:${code}`);
  const card = document.querySelector('#loading .loading-card');
  if (!card) return () => {};
  const info = BOOT_ERR[code] || BOOT_ERR['E-BOOT'];
  const lt = document.getElementById('loading-text'), btn = document.getElementById('start-btn');
  const pixelHint = code === 'E-GL' ? card.querySelector('a[href="./pixel.html"]')?.closest('.hint') : null; // 큰 단추와 겹치는 작은 링크
  // 오류 안내와 겨루는 첫 화면 꾸밈(기능 칩·조작 안내)도 숨김
  const keys = card.querySelector('.hint.keys');
  const hidden = [card.querySelector('.bar'), card.querySelector('.name-row'), pixelHint, card.querySelector('.feature-row'), keys?.closest?.('.howto') || keys].filter(Boolean);
  const was = { text: lt?.textContent, css: lt?.style.cssText, label: btn?.textContent, onclick: btn?.onclick, disabled: btn?.disabled, disp: hidden.map((el) => el.style.display), card: card.style.cssText };
  for (const el of hidden) el.style.display = 'none';
  card.classList?.add('boot-error');
  const loadingEl = document.getElementById?.('loading');
  was.ready = !!loadingEl?.classList?.contains?.('ready');
  loadingEl?.classList?.remove('ready'); // 다시 시도 안내 중에는 '준비 완료' 모양을 거둠
  // 좁은 화면에서도 양옆 16px 여백 (기본 92vw + 안쪽 여백은 412px 화면에서 거의 끝까지 참)
  card.style.boxSizing = 'border-box';
  card.style.width = 'min(calc(100vw - 32px), 440px)';
  if ((globalThis.innerWidth ?? 999) < 480) card.style.padding = '20px 18px';
  const add = [];
  const make = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; add.push(n); return n; };
  let subEl = null;
  if (lt) {
    lt.textContent = info.text;
    lt.style.cssText = 'font-family:var(--display);font-size:21px;color:#c9671c;margin:12px 0 6px;word-break:keep-all;text-wrap:balance'; // 따뜻한 주황: 평소 로딩과 다르게 보이게
    const sub = make('p', 'margin:0 0 14px;font-size:13px;line-height:1.55;word-break:keep-all;overflow-wrap:break-word;text-wrap:pretty');
    sub.className = 'hint';
    // 망은 잡혀 있는데 받다가 멈춘 경우: 저절로 다시 하지 않으므로 그 말은 빼고
    const text = info.subOnline && globalThis.navigator?.onLine !== false ? info.subOnline : info.sub;
    let at = 0;
    for (const m of text.matchAll(NOWRAP)) {
      sub.append(text.slice(at, m.index));
      const keep = document.createElement('span');
      keep.style.whiteSpace = 'nowrap';
      keep.textContent = m[0];
      sub.append(keep);
      at = m.index + m[0].length;
    }
    sub.append(text.slice(at));
    lt.after(sub);
    subEl = sub;
  }
  let wait = null;
  if (btn) {
    btn.disabled = false;
    if (code === 'E-GL') { btn.textContent = '🎮 도트(2.5D) 버전으로 하기'; btn.onclick = () => { location.href = './pixel.html'; }; }
    else { btn.textContent = '🔄 다시 시도'; btn.onclick = () => location.reload(); }
    const row = make('div', 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px');
    const note = make('p', 'margin:6px 0 0');
    note.className = 'hint';
    const small = (label, run) => {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.style.cssText = 'font-size:14px;padding:7px 12px';
      b.textContent = label;
      b.onclick = run;
      row.append(b);
    };
    if (opt.onTry3d) small('그래도 3D로 시도', () => opt.onTry3d());
    small('📋 진단 정보 복사', () => copyDiag(note, note));
    // 오류 코드는 단추 아래 작은 회색 알약으로 (문장 속에 넣으면 딱딱해 보임)
    const pill = make('p', 'margin:10px 0 0');
    const tag = document.createElement('span');
    tag.style.cssText = 'display:inline-block;font-size:11px;color:#8a7a66;background:rgba(138,122,102,0.12);border-radius:999px;padding:2px 9px;white-space:nowrap';
    tag.textContent = `오류 코드 ${code}`;
    pill.append(tag);
    if (code === 'E-NET') {
      wait = make('p', 'margin:8px 0 0;font-size:13px;color:#8a7a66', '📶 연결을 기다리는 중…');
      wait.style.display = globalThis.navigator?.onLine === false ? '' : 'none';
    }
    btn.after(...[row, wait, pill, note].filter(Boolean));
  }
  // 망이 돌아오면 저절로 다시 (카드가 아직 떠 있을 때만)
  let shown = true;
  const onOnline = () => { if (shown) location.reload(); };
  const onOffline = () => { if (wait) wait.style.display = ''; if (subEl && info.subOnline) subEl.textContent = info.sub; }; // 이제는 연결되면 저절로 다시
  if (code === 'E-NET') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }
  return () => {
    shown = false;
    if (code === 'E-NET') {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    }
    for (const n of add) n.remove();
    hidden.forEach((el, i) => { el.style.display = was.disp[i]; });
    card.classList?.remove('boot-error');
    if (was.ready) loadingEl?.classList?.add('ready'); // 되돌릴 때 '준비 완료' 모양도 (진행 막대가 다시 나오지 않게)
    card.style.cssText = was.card;
    if (lt) { lt.textContent = was.text; lt.style.cssText = was.css; }
    if (btn) { btn.textContent = was.label; btn.onclick = was.onclick; btn.disabled = was.disabled; }
  };
}

export async function boot(Game) {
  window.__unicoBooted = true; // crash.js: 이제부터 부팅 오류는 여기서 안내
  const canvas = document.getElementById('game');
  const bar = document.getElementById('loading-bar');
  const btn = document.getElementById('start-btn');
  const nick = document.getElementById('nickname');
  titleFriends();
  titleButterfly();
  const lt = document.getElementById('loading-text');
  // 단계: load(받는 중) → ready(닉네임 고르는 중) → start(입장 중) → done(화면이 보임)
  let stage = 'load', ticks = 0, undo = null, soft = false;
  const fail = (code, err, opt) => { if (!undo) undo = bootErrorCard(code, err, opt); };
  const unfail = () => { const u = undo; undo = null; soft = false; u?.(); };
  const bump = () => { ticks++; if (soft) unfail(); }; // 잠깐 멈췄다가 다시 진행되면 안내를 거둠
  // 놓친 오류(기다리던 약속이 영영 안 끝나는 경우): 오류 뒤 12초 동안 진행이 없으면 안내 (닉네임 고르는 동안·화면이 보인 뒤에는 안 띄움)
  const onEarly = (ev) => {
    if (undo || stage === 'ready' || stage === 'done') return;
    const at = ticks, err = ev?.error ?? ev?.reason ?? ev?.message;
    setTimeout(() => {
      if (ticks !== at || undo || stage === 'ready' || stage === 'done' || document.hidden) return;
      fail(bootCode(err, stage), err);
      soft = true;
    }, 12000);
  };
  window.addEventListener('error', onEarly);
  window.addEventListener('unhandledrejection', onEarly);
  // 느린 망: 모델을 다시 받으면 '연결이 느려요…' (파일 50개가 한꺼번에 알려도 문구는 가끔만, 8초 조용하면 원래대로)
  let slowT = 0, slowAt = 0;
  onFetchRetry(() => {
    if (stage !== 'load' || undo || !lt) return;
    clearTimeout(slowT);
    slowT = setTimeout(() => { if (stage === 'load' && !undo) lt.textContent = '농장 준비 중…'; }, 8000);
    if (Date.now() - slowAt < 1500) return;
    slowAt = Date.now();
    lt.textContent = '📶 연결이 느려요… 다시 받는 중';
  });

  let assets, saved;
  try {
    const gl = probeWebGL2();
    if (!gl.ok) {
      // WebGL2 없음: 도트 판을 권하고, 그래도 3D 를 고르면 이어서 받음
      await new Promise((resolve) => fail('E-GL', new Error(`WebGL2 를 만들 수 없음${gl.why ? `: ${gl.why}` : ''}`), { onTry3d: resolve }));
      unfail();
    }
    const info = loadSaveInfo();
    saved = info.data ?? (info.status === 'broken' ? loadBackup()?.data : null); // 못 읽은 기록이면 백업의 이름·위치
    nick.value = saved?.name || randomName();
    // 🎲: 이름 아무거나 (눌러도 입력칸 글자만 바뀜)
    const dice = document.getElementById('nick-dice');
    if (dice) dice.onclick = () => {
      nick.value = randomName();
      dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
    };
    assets = new Assets();
    // 글자를 넘겨야 그 글자가 든 한글 조각을 받음 (글자 없이 부르면 라틴 조각만 받아 이름표가 대체 글꼴로 구워짐)
    const fontReady = Promise.race([Promise.all([document.fonts?.load?.('40px Jua', `${LABEL_TEXT} ${nick.value}`), document.fonts?.load?.("20px 'Unico Coin'", '🪙')]).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
    await Promise.all([assets.loadAll((p) => { bump(); bar.style.width = Math.round(p * 100) + '%'; }), fontReady]);
  } catch (e) {
    fail(bootCode(e, 'load'), e);
    return;
  }
  stage = 'ready';
  clearTimeout(slowT);
  assets.loadDeferred(saved?.player).catch(() => {}); // 첫 화면에 필요 없는 모델(늑대·산여우·주민 원본 몸·KOAT 네 발 원본)은 닉네임을 고르는 동안 뒤에서, 원본 몸은 저장 위치에서 가까운 주민부터
  if (lt) lt.textContent = '준비 완료! 닉네임을 정하고 입장하세요';
  document.getElementById('loading')?.classList.add('ready'); // 다 받음: 진행 막대를 접고 입장 단추를 앞으로
  // 로그인 화면 접속 QR (휴대폰으로 같은 게임에 바로 들어오기, 좁은 화면·터치 기기에서는 숨김)
  // 내 컴퓨터 주소(localhost·127.x·::1)는 다른 기기에서 열 수 없으므로 QR 을 띄우지 않음
  if (!isLocalHost(location.hostname)) {
    try { const q = joinQrBox(); q.classList.add('login-qr'); document.getElementById('loading')?.append(q); } catch { /* QR 없이도 입장 가능 */ }
  }
  btn.disabled = false;
  btn.textContent = '입장하기';
  let started = false;
  const start = async () => {
    if (started || undo) return;
    started = true;
    stage = 'start';
    bump();
    const ld = document.getElementById('loading');
    try {
      // iOS: 소리 장치는 탭 처리 안에서(첫 await 전에) 만들고 켜야 함
      const audio = new Audio({ prefs: true }); // 저장된 소리 설정(끔·크기)을 되살림
      audio.unlock();
      if (isMobileDevice()) pushBackGuard(); // 뒤로 가기 기록도 탭 처리 안에서 (사용자 동작 없이 넣은 기록은 브라우저가 건너뜀)
      const name = (nick.value.trim() || randomName()).slice(0, 12);
      btn.disabled = true;
      if (lt) lt.textContent = '농장을 만드는 중…';
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // 문구가 먼저 그려지게 (월드 만들기는 한 번에 실행돼 화면이 잠시 멈춤)
      await Promise.race([Promise.resolve(document.fonts?.load?.('40px Jua', name)).catch(() => {}), new Promise((r) => setTimeout(r, 800))]); // 바꾼 닉네임 글자
      window.game = new Game(canvas, assets, name, audio);
      bump();
      window.game.audio.play('click'); // 입장 소리 (소리 장치는 위에서 탭 처리 안에 이미 켬)
      // 3D 판만: 상태·계절별 테마 음악 + 장소 환경음 (도트 판은 예전 음악 그대로)
      window.game.music.attach?.(window.game, { themes: true, ambience: new Ambience(audio, { layout: LAYOUT }) });
      if (audio.enabled) window.game.music.start(); // 소리를 꺼 두었으면 켤 때(소리 버튼·N 키) 시작
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
      bump();
      await Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 1500))]);
    } catch (e) {
      // 게임을 만들다 실패 (WebGL 컨텍스트 등): 멈춘 '농장을 만드는 중…' 대신 안내, 다시 시도는 새로고침 (반쯤 만든 게임을 다시 쓰지 않음)
      started = false;
      btn.disabled = false;
      fail(bootCode(e, 'start'), e);
      return;
    }
    stage = 'done';
    window.removeEventListener('error', onEarly);
    window.removeEventListener('unhandledrejection', onEarly);
    ld.classList.add('out');
    setTimeout(() => ld.remove(), 650);
    window.game.shown();
  };
  btn.onclick = start;
  nick.addEventListener('keydown', (e) => { if (isSubmitEnter(e)) start(); }); // 한글 조합 중 Enter 로 이름 끝 글자가 빠진 채 입장하지 않게
  if (new URLSearchParams(location.search).has('autostart')) start();
}
