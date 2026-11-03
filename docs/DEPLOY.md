# 배포 가이드

## A. Node 서버 한 대 (가장 단순)
```bash
npm ci && npm run build
PORT=8787 MAX_PLAYERS_PER_ROOM=50 MAX_ROOMS=20 npm start
```
`server/index.js` 가 `dist/` 정적 파일과 `/ws` WebSocket, `/rooms` 를 함께 서빙합니다. Fly.io, Render, Railway 등 상시 프로세스를 지원하는 호스팅이면 그대로 동작합니다. HTTPS 리버스 프록시(nginx/Caddy) 뒤에 두면 `wss://` 가 자동으로 맞춰집니다. 정적 파일은 서버가 처음 요청 때 brotli/gzip 으로 압축해 메모리에 보관한 뒤 보내므로(ETag·304 지원), 프록시에서 따로 압축을 켜지 않아도 됩니다.

## B. 클라이언트 Vercel/Cloudflare Pages + 서버 Cloudflare Durable Objects (무료)
1. 서버 배포
   ```bash
   cd deploy/cloudflare
   npx wrangler login
   npx wrangler deploy      # → https://unico-farm-relay.<account>.workers.dev
   ```
2. 클라이언트 빌드 시 서버 주소 지정
   ```bash
   VITE_WS_URL=wss://unico-farm-relay.<account>.workers.dev/ws npm run build
   ```
3. `dist/` 를 Vercel(`vercel deploy --prebuilt` 또는 Git 연동, Output Directory=dist) 혹은 Cloudflare Pages 에 업로드

### 무료 플랜 한도 추정 (2025~26 기준, 변동 가능 — 공식 요금 페이지 확인 필요)
- Workers 무료: 하루 10만 요청. Durable Objects WebSocket 은 메시지 20개 = 요청 1개로 계산
- 플레이어 1명이 위치 5Hz 로 보내고 방 평균 10명이 받는다면 1인당 약 55 msg/s → 2,750 msg/s·room… 실제로는 변경 시에만 전송하므로 훨씬 적지만, 보수적으로 **하루 100 플레이어·시간** 정도로 보면 안전합니다
- 방당 50명은 DO 1개당 연결 한도(32,768) 안에서 여유

## C. 접속 규모를 늘리려면
- `MAX_PLAYERS_PER_ROOM` 을 줄이고 방을 늘리는 쪽이 체감 지연에 유리
- 위치 전송 주기(`SEND_HZ`, `TICK_MS`) 조절
- 관심 영역(AOI) 필터링: 가까운 플레이어만 전송
- 수천 명 이상: Colyseus / 자체 룸 서버 클러스터, 방을 서버별로 샤딩
