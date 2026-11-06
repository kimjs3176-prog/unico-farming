import { defineConfig } from 'vite';

// 개발 중에는 멀티플레이 서버(server/index.js, 기본 8787 포트)로 WebSocket 을 프록시
export default defineConfig({
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
});
