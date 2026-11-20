// 설치형 앱: 빌드가 만드는 서비스 워커(sw.js) 목록·규칙, 등록 조건, 설정 창 단추
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { swSource, swLists, PIXEL_RE } from '../vite.config.js';
import { modelQuery } from '../src/game/fetch_gz.js';
import { swAllowed, Pwa, playBusy, UPDATE_TOAST } from '../src/game/sw_register.js';

const VERS = { 'q_nature.glb': 'aaaaaaaaaa', 'unico_biped.bin': 'bbbbbbbbbb' };
/** vite 번들 흉내: 3D 판 입구 + three + 낚시(동적) + 도트 판 */
const BUNDLE = {
  'assets/main-1.js': { type: 'chunk', isEntry: true, name: 'main', facadeModuleId: '/x/index.html', fileName: 'assets/main-1.js', imports: ['assets/three-1.js'], dynamicImports: ['assets/fishing-1.js'], viteMetadata: { importedCss: new Set(['assets/main-1.css']) } },
  'assets/three-1.js': { type: 'chunk', fileName: 'assets/three-1.js', imports: [], dynamicImports: [] },
  'assets/fishing-1.js': { type: 'chunk', fileName: 'assets/fishing-1.js', imports: ['assets/three-1.js'], dynamicImports: [] },
  'assets/pixel-1.js': { type: 'chunk', isEntry: true, name: 'pixel', facadeModuleId: '/x/pixel.html', fileName: 'assets/pixel-1.js', imports: ['assets/three-1.js'], dynamicImports: [], viteMetadata: { importedCss: new Set(['assets/pixel-1.css']) } },
  'assets/Galmuri11-1.woff2': { type: 'asset', fileName: 'assets/Galmuri11-1.woff2' },
  'assets/model-preload-1.js': { type: 'asset', fileName: 'assets/model-preload-1.js' },
};

test('sw 목록: 3D 판 청크·CSS·미리 받기 + 모델은 fetch_gz 가 쓰는 주소 그대로, 도트 판·아이템 아이콘 판은 없음', () => {
  const L = swLists(BUNDLE, VERS, '/');
  for (const f of ['/', '/index.html', '/manifest.webmanifest', '/font-css.js', '/assets/main-1.js', '/assets/main-1.css', '/assets/three-1.js', '/assets/fishing-1.js', '/assets/model-preload-1.js']) assert.ok(L.core.includes(f), f);
  // fetch_gz.js: `${url}.gz${modelQuery(url)}` / `${url}${modelQuery(url)}`
  assert.ok(L.modelsGz.includes(`/models/q_nature.glb.gz${modelQuery('/models/q_nature.glb', VERS)}`));
  assert.ok(L.modelsRaw.includes(`/models/unico_biped.bin${modelQuery('/models/unico_biped.bin', VERS)}`));
  const all = [...L.core, ...L.modelsGz, ...L.modelsRaw, ...L.extra];
  assert.deepEqual(all.filter((u) => PIXEL_RE.test(u)), [], '도트 판 파일');
  assert.deepEqual(all.filter((u) => /\/ui\/items/.test(u)), [], '아이템 아이콘 판은 창을 열 때 받음');
  // 하위 경로 배포
  assert.ok(swLists(BUNDLE, VERS, '/farm/').modelsGz.every((u) => u.startsWith('/farm/models/')));
});

/** 만든 sw.js 를 가짜 워커 환경에서 돌림 */
function runSw({ online = true } = {}) {
  const L = swLists(BUNDLE, VERS, '/');
  const src = swSource({ cache: 'unico-test1234', base: '/', ...L });
  const store = new Map([['unico-test1234', new Map([['https://farm.test/index.html', 'CACHED-INDEX']])], ['unico-old', new Map()]]);
  const caches = {
    open: async (n) => { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n); return { match: async (r) => m.get(r.url || r), put: async (r, v) => m.set(r.url || r, v), addAll: async () => {}, add: async () => {} }; },
    match: async (r, o = {}) => store.get(o.cacheName)?.get(typeof r === 'string' ? new URL(r, 'https://farm.test').href : r.url),
    keys: async () => [...store.keys()], delete: async (k) => store.delete(k),
  };
  const fetched = [];
  const h = {};
  const self = { addEventListener: (t, f) => { h[t] = f; }, location: { origin: 'https://farm.test' }, registration: {}, skipWaiting: () => { self.skipped = true; } };
  const ctx = { self, caches, URL, Promise, Set, setTimeout, clearTimeout, fetch: async (r) => { fetched.push(r.url); if (!online) throw new TypeError('offline'); return { status: 200, ok: true, clone() { return this; }, body: 'NET' }; } };
  vm.runInNewContext(src, ctx);
  const req = (url, mode = 'cors', headers = {}) => ({ url: new URL(url, 'https://farm.test').href, mode, method: 'GET', headers: { has: (k) => k in headers } });
  const fire = (r) => { let res = null; h.fetch({ request: r, preloadResponse: Promise.resolve(undefined), respondWith: (p) => { res = p; } }); return res; };
  return { src, h, store, fire, req, fetched, self };
}

test('sw: /pixel.html 화면은 캐시로 답하지 않음 (망이 끊겨도), 3D 판 화면은 끊기면 캐시한 index.html', async () => {
  const w = runSw({ online: false });
  assert.equal(w.fire(w.req('/pixel.html', 'navigate')), null, '도트 판은 손대지 않음');
  assert.equal(w.fire(w.req('/assets/pixel-1.js')), null);
  assert.equal(await w.fire(w.req('/', 'navigate')), 'CACHED-INDEX');
  assert.equal(await w.fire(w.req('/index.html', 'navigate')), 'CACHED-INDEX');
});

test('sw: 화면(내비게이션) 응답은 캐시에 쓰지 않음, 해시 파일은 캐시 먼저', async () => {
  const w = runSw();
  assert.equal((await w.fire(w.req('/', 'navigate'))).body, 'NET');
  assert.equal(w.store.get('unico-test1234').get('https://farm.test/'), undefined);
  await w.fire(w.req('/assets/main-1.js'));
  assert.ok(w.store.get('unico-test1234').has('https://farm.test/assets/main-1.js'));
  // 두 번째는 망에 가지 않음
  const n = w.fetched.length;
  await w.fire(w.req('/assets/main-1.js'));
  assert.equal(w.fetched.length, n);
});

test('sw: GET 이 아님·Range·/ws·다른 출처는 그대로 통과, 글꼴 파일(gstatic)만 받음', () => {
  const w = runSw();
  assert.equal(w.fire({ ...w.req('/assets/main-1.js'), method: 'POST' }), null);
  assert.equal(w.fire(w.req('/models/q_nature.glb?v=1', 'cors', { range: 1 })), null);
  assert.equal(w.fire(w.req('/ws')), null);
  assert.equal(w.fire(w.req('https://api.open-meteo.com/v1/forecast')), null);
  assert.equal(w.fire(w.req('https://fonts.googleapis.com/css2?family=Jua')), null, '글꼴 CSS 는 캐시 안 함');
  assert.notEqual(w.fire(w.req('https://fonts.gstatic.com/s/jua/x.woff2')), null);
});

test('sw: 켜질 때 다른 unico-* 캐시를 지우고, skipWaiting 은 SKIP_WAITING 메시지로만', async () => {
  const w = runSw();
  assert.doesNotMatch(w.src.replace(/self\.addEventListener\('message'[^\n]*/, ''), /skipWaiting/);
  let p; w.h.activate({ waitUntil: (x) => { p = x; } }); await p;
  assert.deepEqual([...w.store.keys()], ['unico-test1234']);
  w.h.message({ data: 'SKIP_WAITING' });
  assert.equal(w.self.skipped, true);
});

test('vercel.json: /sw.js 는 매번 확인 (no-cache), 등록은 배포 빌드·실제 브라우저에서만', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sw = v.headers.find((h) => h.source === '/sw.js');
  assert.equal(sw.headers.find((x) => x.key === 'Cache-Control').value, 'no-cache');
  const nav = { serviceWorker: {} };
  assert.equal(swAllowed({ prod: true, nav }), true);
  assert.equal(swAllowed({ prod: false, nav }), false, '개발 서버');
  assert.equal(swAllowed({ prod: true, nav: { ...nav, webdriver: true } }), false, '자동 시험 브라우저');
  assert.equal(swAllowed({ prod: true, nav, search: '?nosw' }), false);
  assert.equal(swAllowed({ prod: true, nav, search: '?sw=off' }), false);
  assert.equal(swAllowed({ prod: true, nav: {} }), false, '서비스 워커 없음');
});

/** 아주 작은 가짜 DOM: 설정 칸 그리기용 */
function fakeDoc(mg = false) {
  const mk = (tag) => ({ tag, children: [], className: '', textContent: '', append(...c) { this.children.push(...c); }, replaceChildren() { this.children = []; }, get childElementCount() { return this.children.length; }, isConnected: true });
  const doc = { createElement: mk, querySelector: (q) => (mg && q === '#ui .mg-wrap' ? {} : null) };
  const el = mk('div'); el.ownerDocument = doc;
  return { doc, el };
}

test('새 버전: 알림은 한 번, 미니게임·컷신 중에는 새로 고침 단추가 꺼지고 눌러도 새로 고치지 않음', () => {
  const toasts = [], posted = [];
  const { doc, el } = fakeDoc(true);
  const win = { document: doc, navigator: { userAgent: 'Android' }, matchMedia: () => ({ matches: false }), location: { reload: () => { throw new Error('놀이 중 새로 고침'); } } };
  const game = { ui: { toast: (t) => toasts.push(t) }, busy: () => false, save: () => {} };
  const pwa = new Pwa(win, game);
  const w = { postMessage: (m) => posted.push(m) };
  pwa.setWaiting(w); pwa.setWaiting(w);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], new RegExp(UPDATE_TOAST));
  assert.equal(playBusy(game, doc), true);
  pwa.renderSettings(el);
  const btn = el.children.find((c) => c.className === 'pwa-update');
  assert.equal(btn.disabled, true);
  assert.equal(pwa.applyUpdate(), false);
  assert.deepEqual(posted, []);
});

test('새 버전 적용: 저장 → SKIP_WAITING → 주인이 바뀌면 한 번만 새로 고침', () => {
  const calls = [];
  let onChange = null;
  const { doc } = fakeDoc(false);
  const win = { document: doc, navigator: { serviceWorker: { addEventListener: (t, f, o) => { assert.equal(t, 'controllerchange'); assert.equal(o.once, true); onChange = f; } } }, location: { reload: () => calls.push('reload') } };
  const game = { busy: () => false, save: () => calls.push('save') };
  const pwa = new Pwa(win, game);
  pwa.waiting = { postMessage: (m) => calls.push(m) };
  assert.equal(pwa.applyUpdate(), true);
  assert.equal(pwa.applyUpdate(), false, '두 번 눌러도 한 번');
  onChange();
  assert.deepEqual(calls, ['save', 'SKIP_WAITING', 'reload']);
});

test("앱으로 설치: 설치 이벤트가 있고 앱으로 열리지 않았을 때만 단추, 아이폰은 '홈 화면에 추가' 안내", () => {
  const { doc, el } = fakeDoc();
  const win = { document: doc, navigator: { userAgent: 'Android' }, matchMedia: () => ({ matches: false }) };
  const pwa = new Pwa(win);
  pwa.renderSettings(el);
  assert.equal(el.hidden, true, '아무것도 없으면 칸을 숨김');
  pwa.prompt = { prompt() {}, userChoice: Promise.resolve({ outcome: 'accepted' }) };
  pwa.refresh();
  assert.equal(el.children[0].className, 'pwa-install');
  assert.match(el.children[0].textContent, /앱으로 설치/);
  win.matchMedia = () => ({ matches: true }); // 이미 앱으로 열림
  pwa.refresh();
  assert.equal(el.hidden, true);
  const ios = new Pwa({ document: doc, navigator: { userAgent: 'iPhone' }, matchMedia: () => ({ matches: false }) });
  const e2 = fakeDoc().el; ios.renderSettings(e2);
  assert.equal(e2.children[0].className, 'pwa-tip');
  assert.match(e2.children[0].textContent, /홈 화면에 추가/);
});
