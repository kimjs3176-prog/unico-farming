import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { defineConfig } from 'vite';

const MODELS = 'public/models';
// 첫 화면에 꼭 필요한 큰 모델: 게임 코드가 실행되기 전부터 받기 시작 (index.html 만, 도트 판 제외)
const PRELOAD = ['q_nature.glb', 'unico_biped.bin', 'unico_body.bin', 'q_farm.glb'];

/** 모델 파일별 내용 해시 앞 10자 → 바뀐 파일만 새 주소(?v=)로 받고, 그대로인 파일은 브라우저 캐시를 계속 씀 */
export function modelVersions(dir = MODELS) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (/\.(glb|bin)$/.test(f)) out[f] = crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, f))).digest('hex').slice(0, 10);
  }
  return out;
}

/** 빌드한 index.html 에 큰 모델 .gz 미리 받기 링크 (주소는 src/game/fetch_gz.js 가 만드는 것과 글자 하나까지 같아야 재사용됨) */
function modelPreload(versions) {
  let base = '/';
  return {
    name: 'unico-model-preload',
    apply: 'build',
    configResolved(c) { base = c.base || '/'; },
    transformIndexHtml(html, ctx) {
      if (path.basename(ctx.filename) !== 'index.html') return html;
      return PRELOAD.filter((f) => versions[f]).map((f) => ({
        tag: 'link',
        attrs: { rel: 'preload', as: 'fetch', crossorigin: 'anonymous', href: `${base}models/${f}.gz?v=${versions[f]}` },
        injectTo: 'head',
      }));
    },
  };
}

// 개발 중에는 멀티플레이 서버(server/index.js, 기본 8787 포트)로 WebSocket 을 프록시
export default defineConfig(({ command }) => {
  const versions = command === 'build' ? modelVersions() : null; // 개발 서버는 버전 없이 (파일을 고쳐도 바로 반영)
  return {
    define: versions ? { __MODEL_V__: JSON.stringify(versions) } : {},
    plugins: versions ? [modelPreload(versions)] : [],
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
