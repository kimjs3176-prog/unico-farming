import { defineConfig } from 'vite';

// 개발 중에는 멀티플레이 서버(server/index.js, 기본 8787 포트)로 WebSocket 을 프록시
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1200 },
});
