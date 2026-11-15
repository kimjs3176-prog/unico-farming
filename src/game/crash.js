// 오류 기록·치명 오류 안내 카드: main.js 가 맨 먼저 import (다른 모듈을 읽는 중의 오류부터 들음)
// 기록은 localStorage 'unico.crash' 에 최근 20건 (같은 메시지는 횟수만 올림). 닉네임·채팅 글은 넣지 않음
// 안내 카드는 ui.js 와 무관한 순수 DOM (화면 UI 자체가 고장 나도 뜨게)

export const CRASH_KEY = 'unico.crash';
const MAX = 20;
/** 이번 접속에서 생긴 기록 (window.__unicoCrashes — 화면 점검 스크립트용) */
const session = [];
/** 이번 접속에서 본 메시지 → { e: 기록, w: 마지막 저장 시각 } (다시 알리기는 한 번만, 같은 오류가 쏟아져도 저장은 2초에 한 번) */
const seen = new Map();
let context = null;

const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };

/** 빌드 번호: 배포판 HTML 의 <meta name="unico-build"> (JS 상수로 넣으면 큰 청크 해시가 커밋마다 바뀜) */
export function buildId() {
  try { return globalThis.document?.querySelector?.('meta[name="unico-build"]')?.content || 'dev'; } catch { return 'dev'; }
}

/** 기록에 덧붙일 상태 (화질 등) — fn() 은 { q } 를 돌려줌 */
export function setCrashContext(fn) { context = fn; }

/** 저장된 기록 (오래된 것부터) */
export function readCrashes() {
  try {
    const a = JSON.parse(store()?.getItem(CRASH_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

/** 이번 접속 기록 (저장소를 못 쓰는 브라우저에서도 남음) */
export function sessionCrashes() { return session; }

function describe(e) {
  if (e && typeof e === 'object') {
    const msg = String(e.message || e.name || e.type || e);
    const stack = typeof e.stack === 'string' ? e.stack.split('\n').slice(0, 6).map((l) => l.trim().slice(0, 200)) : [];
    return { msg: msg.slice(0, 300), stack };
  }
  return { msg: String(e).slice(0, 300), stack: [] };
}

/**
 * 오류 하나 기록. 이번 접속에서 처음 본 메시지면 true (그때만 다시 알림)
 * @param where 어디서 (logic·render·window·promise·boot:E-NET …)
 */
export function record(e, where = '') {
  const { msg, stack } = describe(e);
  const key = `${where}|${msg}`;
  const now = Date.now();
  const had = seen.get(key);
  if (had) {
    had.e.n++;
    had.e.t = now;
    if (now - had.w < 2000) return false; // 매 프레임 같은 오류: 저장은 가끔만
    had.w = now;
    write(had.e);
    return false;
  }
  let extra = {};
  try { extra = context?.() || {}; } catch { /* 상태를 못 읽어도 기록은 남김 */ }
  const ua = String(globalThis.navigator?.userAgent || '').slice(0, 160);
  const entry = { t: now, msg, stack, where, build: buildId(), q: extra.q ?? null, ua, n: 1 };
  seen.set(key, { e: entry, w: now });
  session.push(entry);
  if (session.length > MAX) session.shift();
  write(entry, true);
  return true;
}

/** 저장소의 고리(20건)에 넣기: 같은 메시지는 지우고 맨 뒤에 (fresh 면 지난 접속 횟수를 이어 셈) */
function write(entry, fresh = false) {
  try {
    const s = store();
    if (!s) return;
    const list = readCrashes();
    const i = list.findIndex((x) => x && x.msg === entry.msg && x.where === entry.where);
    if (i >= 0) {
      const old = list.splice(i, 1)[0];
      if (fresh) entry.n += old.n || 1;
    }
    list.push(entry);
    while (list.length > MAX) list.shift();
    s.setItem(CRASH_KEY, JSON.stringify(list));
  } catch { /* 저장 공간이 없어도 게임은 계속 */ }
}

/** 다시 알리기: 콘솔·화면 점검(pageerror)이 오류를 보게 (창 오류 듣기가 같은 오류를 두 번 세지 않게 표시) */
export function rethrowLater(e) {
  try { if (e && typeof e === 'object') e.__unicoSeen = true; } catch { /* 얼린 객체 */ }
  if (typeof globalThis.reportError === 'function') {
    try { globalThis.reportError(e); return; } catch { /* 아래로 */ }
  }
  setTimeout(() => { throw e; }, 0);
}

/** 진단 정보 (복사용 글): 빌드·기기·화질·최근 오류 */
export function diagText() {
  const list = readCrashes();
  const all = list.length ? list : session;
  const q = (() => { try { return context?.()?.q ?? '-'; } catch { return '-'; } })();
  const lines = [
    '유니코 팜 진단 정보',
    `빌드: ${buildId()}`,
    `시각: ${new Date().toISOString()}`,
    `기기: ${String(globalThis.navigator?.userAgent || '-').slice(0, 200)}`,
    `화질: ${q}`,
    `오류 ${all.length}건 (최근이 아래)`,
  ];
  for (const c of all) {
    lines.push(`- ${new Date(c.t).toISOString()} [${c.where || '-'}] ${c.msg}${c.n > 1 ? ` (×${c.n})` : ''}`);
    for (const l of c.stack || []) lines.push(`    ${l}`);
  }
  return lines.join('\n');
}

/** 글을 클립보드로 (안 되면 숨은 입력칸으로 한 번 더) — 성공하면 true */
export async function copyText(text) {
  try {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch { /* 아래로 */ }
  try {
    const doc = globalThis.document;
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    doc.body.append(ta);
    ta.select();
    const ok = doc.execCommand?.('copy');
    ta.remove();
    return !!ok;
  } catch { return false; }
}

/**
 * 진단 정보 복사 단추 동작: 복사되면 note 에 '복사했어요', 안 되면 글을 고를 수 있는 입력칸을 보여 줌
 * @param note 결과 문구를 쓸 요소, box 입력칸을 붙일 곳
 */
export async function copyDiag(note, box) {
  const text = diagText();
  if (await copyText(text)) { if (note) note.textContent = '📋 진단 정보를 복사했어요. 문의할 때 붙여 넣어 주세요'; return true; }
  if (note) note.textContent = '아래 글을 길게 눌러 복사해 주세요';
  try {
    const ta = globalThis.document.createElement('textarea');
    ta.value = text;
    ta.readOnly = true;
    ta.style.cssText = 'width:100%;height:110px;margin-top:8px;font:12px/1.4 monospace;border:2px solid #ead9b8;border-radius:10px;padding:6px;user-select:text;-webkit-user-select:text';
    box?.append(ta);
    ta.select();
  } catch { /* 문구만 */ }
  return false;
}

/**
 * 화면 전체 안내 카드 (순수 DOM, body 맨 위)
 * @param o { id, icon, title, body, actions: [{ label, run, ghost }] }
 */
export function showOverlay(o) {
  const doc = globalThis.document;
  if (!doc?.body) return null;
  doc.getElementById(o.id)?.remove();
  const el = (tag, css, text) => {
    const n = doc.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  };
  const wrap = el('div', 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(35,25,22,0.5);touch-action:manipulation');
  wrap.id = o.id;
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');
  const card = el('div', 'word-break:keep-all;overflow-wrap:anywhere;width:min(92vw,400px);max-height:calc(100% - 8px);overflow:auto;background:var(--panel,#fffaf0);border:4px solid var(--panel-edge,#ead9b8);border-radius:26px;padding:20px 22px;text-align:center;color:var(--ink,#231916);box-shadow:0 6px 0 rgba(107,74,46,0.18),0 12px 28px rgba(35,25,22,0.16)');
  const title = el('h2', 'margin:2px 0 8px;font-size:23px;color:var(--teal-d,#299d93)', o.title);
  title.id = `${o.id}-t`;
  wrap.setAttribute('aria-labelledby', title.id);
  card.append(el('div', 'font-size:52px;line-height:1.1', o.icon || '🦄'), title);
  if (o.body) card.append(el('p', 'margin:0 0 12px;color:var(--brown,#6b4a2e);line-height:1.55;font-size:15px', o.body));
  const note = el('p', 'margin:8px 0 0;color:#8a7a66;font-size:13px;line-height:1.5;min-height:0');
  for (const a of o.actions || []) {
    const b = el('button', 'display:block;width:100%;margin-top:8px;font-size:17px;padding:11px', a.label);
    if (a.ghost) b.className = 'ghost';
    b.onclick = () => a.run(note, card);
    card.append(b);
  }
  card.append(note);
  wrap.append(card);
  doc.body.append(wrap);
  try { card.querySelector('button')?.focus(); } catch { /* 초점 없이도 됨 */ }
  return wrap;
}

/** 치명 오류 안내 (게임 루프를 멈춘 뒤): [다시 시작] [진단 정보 복사] */
export function showFatal(kind = 'loop', { saved = true } = {}) {
  const boot = kind === 'boot';
  return showOverlay({
    id: 'unico-fatal',
    icon: '🦄💦',
    title: boot ? '앗, 농장을 여는 중에 문제가 생겼어요' : '앗, 문제가 생겼어요',
    body: boot ? '다시 시작하면 대부분 해결돼요. 농장 기록은 그대로예요.'
      : saved ? '농장은 저장해 두었어요. 다시 시작하면 이어서 할 수 있어요.'
        : '마지막 자동 저장까지의 농장은 남아 있어요. 다시 시작해 주세요.',
    actions: [
      { label: '🔄 다시 시작', run: () => globalThis.location.reload() },
      { label: '📋 진단 정보 복사', ghost: true, run: (note, card) => copyDiag(note, card) },
    ],
  });
}

/**
 * 프레임 오류 세기: 10초 안에 5번, 또는 60프레임 연속이면 치명 (가끔 나는 오류는 넘기고 계속)
 * frame(bad, now) 가 true 면 루프를 멈출 때
 */
export class FailGate {
  constructor(max = 5, spanMs = 10000, runMax = 60) {
    this.max = max; this.spanMs = spanMs; this.runMax = runMax;
    this.times = [];
    this.run = 0;
  }
  frame(bad, now) {
    if (!bad) { this.run = 0; return false; }
    this.run++;
    this.times.push(now);
    while (this.times.length && now - this.times[0] > this.spanMs) this.times.shift();
    return this.times.length >= this.max || this.run >= this.runMax;
  }
}

/** 창 전체 오류 듣기 (import 하는 순간 한 번). 부팅 함수가 돌기 전(모듈을 읽다가)의 오류면 안내 카드 */
export function installCrashHandlers(win = globalThis.window) {
  if (!win?.addEventListener || win.__unicoCrashOn) return;
  win.__unicoCrashOn = true;
  // 모듈을 읽다 실패하면 boot() 가 영영 안 돎 → 4초 뒤에도 부팅 전이면 안내 (확장 프로그램 오류처럼 부팅이 곧 도는 경우는 띄우지 않음)
  const early = () => setTimeout(() => { if (!win.__unicoBooted) showFatal('boot'); }, 4000);
  win.addEventListener('error', (ev) => {
    const e = ev?.error ?? ev?.message ?? 'error';
    if (e?.__unicoSeen) return;
    record(e, 'window');
    if (!win.__unicoBooted) early();
  });
  win.addEventListener('unhandledrejection', (ev) => {
    const e = ev?.reason ?? 'rejection';
    if (e?.__unicoSeen) return;
    record(e, 'promise');
  });
  win.__unicoCrashes = session;
  win.__unicoCrash = (code, err) => record(err ?? code, code);
}

installCrashHandlers();
