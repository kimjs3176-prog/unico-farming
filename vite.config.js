import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

const MODELS = 'public/models';
// 첫 화면에 꼭 필요한 큰 모델: 게임 코드가 실행되기 전부터 받기 시작 (index.html 만, 도트 판 제외, .gz 를 쓰는 브라우저만)
const PRELOAD = ['q_nature.glb', 'unico_biped.bin', 'q_farm.glb', 'villager_puppy.bin'];

/** 모델 파일별 내용 해시 앞 10자 → 바뀐 파일만 새 주소(?v=)로 받고, 그대로인 파일은 브라우저 캐시를 계속 씀 */
export function modelVersions(dir = MODELS) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (/\.(glb|bin)$/.test(f)) out[f] = crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, f))).digest('hex').slice(0, 10);
  }
  return out;
}

/**
 * 큰 모델 .gz 미리 받기 스크립트 본문 (주소는 src/game/fetch_gz.js 가 만드는 것과 글자 하나까지 같아야 재사용됨)
 *  - DecompressionStream 이 있을 때만 (없으면 fetchModel 이 원본을 받으므로 .gz 를 미리 받으면 두 번 받게 됨, 예: iOS 16.3 이하)
 *  - CSP(script-src 'self') 로 인라인 스크립트가 막혀 따로 된 파일로 둠
 */
export function preloadSource(hrefs) {
  return `if('DecompressionStream'in self)for(const h of ${JSON.stringify(hrefs)})document.head.append(Object.assign(document.createElement('link'),{rel:'preload',as:'fetch',crossOrigin:'anonymous',href:h}));\n`;
}

/** 빌드한 index.html 에 미리 받기 스크립트 (도트 판 제외). 파일 이름에 내용 해시 → /assets 오래 캐시 */
function modelPreload(versions) {
  let base = '/';
  const files = PRELOAD.filter((f) => versions[f]);
  const src = () => preloadSource(files.map((f) => `${base}models/${f}.gz?v=${versions[f]}`));
  const name = () => `assets/model-preload-${crypto.createHash('sha1').update(src()).digest('hex').slice(0, 8)}.js`;
  return {
    name: 'unico-model-preload',
    apply: 'build',
    configResolved(c) { base = c.base || '/'; },
    buildStart() {
      if (files.length) this.emitFile({ type: 'asset', fileName: name(), source: src() });
    },
    transformIndexHtml(html, ctx) {
      if (path.basename(ctx.filename) !== 'index.html' || !files.length) return html;
      // head 맨 앞의 일반(동기) 스크립트: 우선순위 높게 받고, 게임 모듈보다 반드시 먼저 실행 (화면은 어차피 CSS 를 기다림)
      return [{ tag: 'script', attrs: { src: `${base}${name()}` }, injectTo: 'head-prepend' }];
    },
  };
}

/** 도트 판 파일 (서비스 워커가 손대지 않음: 목록에 넣지 않고 요청도 그대로 통과) */
export const PIXEL_RE = /pixel|Galmuri/i;

/**
 * 서비스 워커 본문 (sw.js). c: { cache, base, core, modelsGz, modelsRaw, extra }
 *  - 설치: core 는 모두(addAll), 모델·초상화는 되는 만큼(allSettled). skipWaiting 은 설정의 '지금 새로 고침'(SKIP_WAITING)으로만
 *  - 켜질 때: 다른 'unico-*' 캐시 지우기 + 내비게이션 미리 받기
 *  - 화면(내비게이션)은 '/'·'/index.html' 만: 망 먼저, 끊기거나 4초 넘으면 캐시한 index.html (내비게이션 응답은 캐시에 쓰지 않음 → 캐시의 index.html 과 해시 파일이 늘 짝)
 *  - /assets/*·?v= 주소·/portraits/*: 캐시 먼저. 구글 글꼴 파일(fonts.gstatic.com): 캐시 주고 뒤에서 새로 받기. 글꼴 CSS·다른 출처·Range·/ws·도트 판은 그대로 통과
 */
export function swSource(c) {
  return `// 유니코 팜 서비스 워커 (vite.config.js 가 빌드 때 만듦 — 고치지 말 것)
const CACHE = ${JSON.stringify(c.cache)}, BASE = ${JSON.stringify(c.base)};
const CORE = ${JSON.stringify(c.core)};
const MODELS_GZ = ${JSON.stringify(c.modelsGz)}, MODELS_RAW = ${JSON.stringify(c.modelsRaw)}, EXTRA = ${JSON.stringify(c.extra)};
const PIXEL = ${PIXEL_RE};
const CORE_SET = new Set(CORE);
const NAV_MS = 4000;
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    const models = 'DecompressionStream' in self ? MODELS_GZ : MODELS_RAW;
    await Promise.allSettled(models.concat(EXTRA).map((u) => c.add(u)));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('unico-') && k !== CACHE) await caches.delete(k);
    try { await self.registration.navigationPreload?.enable(); } catch (_) { /* 없으면 그냥 */ }
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
const cachedIndex = async () => (await caches.match(BASE + 'index.html', { cacheName: CACHE })) || caches.match(BASE, { cacheName: CACHE });
async function nav(e) {
  const net = (async () => (await e.preloadResponse) || fetch(e.request))();
  net.catch(() => {});
  let timer;
  const late = new Promise((r) => { timer = setTimeout(r, NAV_MS, 'late'); });
  try {
    const r = await Promise.race([net, late]);
    if (r !== 'late') return r;
    return (await cachedIndex()) || (await net);
  } catch (err) {
    const c = await cachedIndex();
    if (c) return c;
    throw err;
  } finally { clearTimeout(timer); }
}
async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200) c.put(req, res.clone()).catch(() => {});
  return res;
}
async function netFirst(req) {
  try { return await fetch(req); } catch (err) { const hit = await caches.match(req, { cacheName: CACHE }); if (hit) return hit; throw err; }
}
async function staleWhile(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()).catch(() => {}); return res; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) {
    if (u.hostname === 'fonts.gstatic.com') e.respondWith(staleWhile(req));
    return;
  }
  if (!u.pathname.startsWith(BASE)) return;
  const p = '/' + u.pathname.slice(BASE.length);
  if (p.startsWith('/ws') || PIXEL.test(p)) return;
  if (req.mode === 'navigate') {
    if (p === '/' || p === '/index.html') e.respondWith(nav(e));
    return;
  }
  if (p.startsWith('/assets/') || p.startsWith('/portraits/') || u.searchParams.has('v')) e.respondWith(cacheFirst(req));
  else if (CORE_SET.has(u.pathname)) e.respondWith(netFirst(req));
});
`;
}

/** 서비스 워커에 미리 넣을 목록: 3D 판 첫 화면(index.html)이 쓰는 청크·CSS + 공용 파일 + 모델(.gz·원본) + 초상화. 도트 판·아이템 아이콘 판은 뺌 */
export function swLists(bundle, versions, base = '/', publicDir = 'public') {
  const chunks = Object.values(bundle);
  const main = chunks.find((x) => x.type === 'chunk' && x.isEntry && x.facadeModuleId && /index\.html$/.test(x.facadeModuleId))
    || chunks.find((x) => x.type === 'chunk' && x.isEntry && x.name === 'main');
  const files = new Set();
  const walk = (name, seen = new Set()) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    const ch = bundle[name];
    if (!ch || ch.type !== 'chunk') return;
    files.add(ch.fileName);
    for (const css of ch.viteMetadata?.importedCss || []) files.add(css);
    for (const n of [...(ch.imports || []), ...(ch.dynamicImports || [])]) walk(n, seen);
  };
  if (main) walk(main.fileName);
  for (const x of chunks) if (x.type === 'asset' && /^assets\/model-preload-/.test(x.fileName)) files.add(x.fileName);
  const pub = (p) => fs.existsSync(path.join(publicDir, p));
  const core = ['', 'index.html', 'manifest.webmanifest', 'font-css.js', 'fonts/unico-coin.woff2',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'portraits/cheer.webp']
    .filter((p) => p === '' || p === 'index.html' || pub(p))
    .concat([...files].sort())
    .filter((p) => !PIXEL_RE.test(p))
    .map((p) => base + p);
  const names = Object.keys(versions).sort();
  const modelsGz = names.map((f) => `${base}models/${f}.gz?v=${versions[f]}`);
  const modelsRaw = names.map((f) => `${base}models/${f}?v=${versions[f]}`);
  const portraits = fs.existsSync(path.join(publicDir, 'portraits'))
    ? fs.readdirSync(path.join(publicDir, 'portraits')).filter((f) => /\.webp$/.test(f) && f !== 'cheer.webp').sort().map((f) => `${base}portraits/${f}`) : [];
  return { core, modelsGz, modelsRaw, extra: portraits };
}

/** 빌드 때 sw.js 를 만듦: 목록·캐시 이름을 본문에 넣어서 → 무엇이든 바뀌면 sw.js 글자가 바뀌어 브라우저가 새 버전을 알아챔 */
function serviceWorker(versions) {
  let base = '/';
  return {
    name: 'unico-sw',
    apply: 'build',
    configResolved(c) { base = c.base || '/'; },
    generateBundle(_, bundle) {
      const lists = swLists(bundle, versions, base);
      const html = bundle['index.html']?.source || '';
      const cache = 'unico-' + crypto.createHash('sha1').update(JSON.stringify(lists) + String(html) + swSource({ cache: '', base, ...lists })).digest('hex').slice(0, 8);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource({ cache, base, ...lists }) });
    },
  };
}

/**
 * 빌드 번호 '<커밋 앞 7자> <빌드 날짜(한국 시간)>': 플레이어 오류 제보를 어느 배포인지 잇기 위해
 * 커밋은 Vercel·GitHub Actions 환경변수 → git → 없으면 'dev' (Vercel 빌드에는 .git 이 없을 수 있음)
 */
export function buildId(env = process.env, now = new Date(), gitHead = readGitHead) {
  let sha = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || '';
  if (!sha) { try { sha = gitHead(); } catch { sha = ''; } }
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return `${/^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : 'dev'} ${day}`;
}
function readGitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim();
}

/**
 * 빌드한 HTML(3D 판·도트 판)에 <meta name="unico-build"> 를 넣음.
 * 게임 코드는 이 meta 를 읽을 것: JS 상수로 넣으면 문서만 바뀐 커밋에도 큰 main 청크 해시가 바뀌어 폰이 다시 받음 (index.html 은 오래 캐시하지 않음)
 */
function buildMeta(id) {
  return {
    name: 'unico-build-id',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'unico-build', content: id }, injectTo: 'head' }];
    },
  };
}

/** 제목 화면(index.html)이 쓰는 자체 아이콘 */
export const TITLE_ICONS = ['wheat', 'rod', 'flask', 'koat', 'dice', 'gamepad', 'help'];

/**
 * 그림 묶음(icons.svg)에서 몇 개만 골라 '#t-이름' 으로 바꾼 작은 SVG (게임의 '#i-이름' 과 id 가 겹치지 않게)
 * 없는 이름이 있으면 오류 (아이콘 이름을 바꾸면 빌드가 알려 줌)
 */
export function titleIconsSvg(sprite, names = TITLE_ICONS) {
  const out = names.map((n) => {
    const m = String(sprite).match(new RegExp(`<symbol id="i-${n}" (viewBox="[^"]+")>([\\s\\S]*?)</symbol>`));
    if (!m) throw new Error(`제목 아이콘 '${n}' 이 src/ui/icons.svg 에 없음`);
    return `<symbol id="t-${n}" ${m[1]}>${m[2]}</symbol>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" id="title-icons" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${out.join('')}</svg>`;
}

/** index.html 의 <!--title-icons--> 자리에 제목 아이콘을 넣음 (개발 서버·빌드 모두) */
function titleIcons() {
  return {
    name: 'unico-title-icons',
    transformIndexHtml(html, ctx) {
      if (path.basename(ctx.filename) !== 'index.html' || !html.includes('<!--title-icons-->')) return html;
      return html.replace('<!--title-icons-->', titleIconsSvg(fs.readFileSync('src/ui/icons.svg', 'utf8')));
    },
  };
}

// 개발 중에는 멀티플레이 서버(server/index.js, 기본 8787 포트)로 WebSocket 을 프록시
const LAZY_THREE = /\/(GTAOPass|GTAOShader|PoissonDenoiseShader|SMAAPass|SMAAShader|UnrealBloomPass|LuminosityHighPassShader|HorizontalTiltShiftShader|VerticalTiltShiftShader)\.js$/;

export default defineConfig(({ command }) => {
  const versions = command === 'build' ? modelVersions() : null; // 개발 서버는 버전 없이 (파일을 고쳐도 바로 반영)
  const build = versions ? buildId() : null;
  return {
    // __BUILD__: 같은 빌드 번호 (쓰는 청크는 커밋마다 해시가 바뀜 → 브라우저 코드는 meta 를 먼저). 개발 서버에는 없음 → typeof 로 확인
    define: versions ? { __MODEL_V__: JSON.stringify(versions), __BUILD__: JSON.stringify(build) } : {},
    plugins: [titleIcons(), ...(versions ? [modelPreload(versions), buildMeta(build), serviceWorker(versions)] : [])],
    server: {
      port: 5173,
      proxy: {
        '/ws': { target: 'ws://localhost:8787', ws: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      // three.js 는 따로 묶어 둠: 게임 코드만 바뀐 업데이트에서는 브라우저 캐시의 three 청크를 그대로 재사용
      rollupOptions: {
        // 3D 판(index.html)과 도트 판(pixel.html) 두 페이지
        input: { main: 'index.html', pixel: 'pixel.html' },
        // three 는 한 청크로 묶되, 보통·높음 화질에서만 쓰는 무거운 화면 효과(GTAO·블룸·SMAA·틸트시프트)는 빼서
        // postfx_passes.js 를 부를 때 따로 받게 함 → 저사양 폰의 첫 화면 내려받기가 줄어듦
        output: { manualChunks: (id) => (id.includes('node_modules/three') && !LAZY_THREE.test(id) ? 'three' : undefined) } },
    },
  };
});
