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

// 개발 중에는 멀티플레이 서버(server/index.js, 기본 8787 포트)로 WebSocket 을 프록시
export default defineConfig(({ command }) => {
  const versions = command === 'build' ? modelVersions() : null; // 개발 서버는 버전 없이 (파일을 고쳐도 바로 반영)
  const build = versions ? buildId() : null;
  return {
    // __BUILD__: 같은 빌드 번호 (쓰는 청크는 커밋마다 해시가 바뀜 → 브라우저 코드는 meta 를 먼저). 개발 서버에는 없음 → typeof 로 확인
    define: versions ? { __MODEL_V__: JSON.stringify(versions), __BUILD__: JSON.stringify(build) } : {},
    plugins: versions ? [modelPreload(versions), buildMeta(build)] : [],
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
        output: { manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined) } },
    },
  };
});
