# 배포 가이드

## A. Node 서버 한 대 (가장 단순)
```bash
npm ci && npm run build
PORT=8787 MAX_PLAYERS_PER_ROOM=50 MAX_ROOMS=20 npm start
```
`server/index.js` 가 `dist/` 정적 파일과 `/ws` WebSocket, `/rooms` 를 함께 서빙합니다. Fly.io, Render, Railway 등 상시 프로세스를 지원하는 호스팅이면 그대로 동작합니다. HTTPS 리버스 프록시(nginx/Caddy) 뒤에 두면 `wss://` 가 자동으로 맞춰집니다. 같은 기계의 프록시(127.0.0.1)에서 온 접속은 `X-Forwarded-For` 의 마지막 값으로 IP당 접속 수(기본 6)를 세고, 다른 기계의 프록시 뒤(Fly.io·Render 등)라면 `TRUST_PROXY=1` 을 함께 지정하세요 (지정하지 않으면 모두 프록시 주소 하나로 보여 6명까지만 들어옵니다). 정적 파일은 서버가 처음 요청 때 brotli/gzip 으로 압축해 메모리에 보관한 뒤 보내므로(ETag·304 지원), 프록시에서 따로 압축을 켜지 않아도 됩니다.

## B. 게임 화면은 Vercel, 멀티플레이 서버는 Cloudflare (무료로 시작)

```
브라우저 ──(게임 파일 HTML·JS·모델)──▶ Vercel  (dist/)
   └──────(실시간 위치·채팅 wss://…/ws)──▶ Cloudflare Workers + Durable Objects (deploy/cloudflare)
```
농장 진행(밭·목장·돈)은 각자 브라우저에 저장되고, 서버는 같은 방 사람들의 위치·동작·채팅만 중계합니다.

### 1단계. Cloudflare에 멀티플레이 서버 올리기 (약 5분)
1. https://dash.cloudflare.com 에서 무료 계정을 만듭니다 (카드 등록 불필요).
2. 터미널에서:
   ```bash
   cd deploy/cloudflare
   npm ci                 # wrangler 설치
   npx wrangler login     # 브라우저가 열리면 Cloudflare 계정으로 허용
   npx wrangler deploy
   ```
3. 마지막에 나오는 주소를 적어 둡니다. 예: `https://unico-farm-relay.<내계정>.workers.dev`
4. 확인: 브라우저로 `https://unico-farm-relay.<내계정>.workers.dev/health` → `ok`, `/rooms` → 방 목록 JSON

> 처음 배포할 때 workers.dev 하위 도메인을 정하라고 하면 원하는 이름을 입력하면 됩니다.

### 2단계. Vercel에 게임 화면 올리기 (약 5분)
1. https://vercel.com 에 GitHub 계정으로 로그인 → **Add New… → Project** → 이 저장소 **Import**
2. 설정은 저장소의 `vercel.json` 이 자동으로 채웁니다 (Framework Vite, Build `npm run build`, Output `dist`)
3. **Environment Variables** 에 하나 추가 (Production·Preview 모두 체크):
   | 이름 | 값 |
   |---|---|
   | `VITE_WS_URL` | `wss://unico-farm-relay.<내계정>.workers.dev/ws` |
   (http**s** 가 아니라 **wss**, 끝에 **/ws**)
4. **Deploy** → `https://<프로젝트>.vercel.app` 주소가 나옵니다.
5. 확인: 그 주소로 들어가 게임을 시작하면 왼쪽 아래가 `🟢 접속 1명 · 1번 농장` 으로 바뀝니다. 다른 기기·창으로 하나 더 들어가면 서로 보이고 채팅이 됩니다.
   `⚪ 오프라인 모드` 로 나오면 `VITE_WS_URL` 값(wss, /ws)을 확인하고 **Redeploy** 하세요 (환경변수는 빌드할 때 들어가므로 바꾼 뒤 다시 배포해야 반영).

> **브랜치**: 지금 작업은 `claude/elegant-knuth-xk5s5s` 브랜치에 있습니다. Vercel은 기본 브랜치(main)를 정식(Production) 주소로 배포하므로, main 으로 합치거나 Vercel **Settings → Git → Production Branch** 를 이 브랜치로 바꾸세요. 다른 브랜치는 미리보기(Preview) 주소로 배포됩니다.

### 3단계(선택). 자동 배포
- **게임 화면**: Vercel과 GitHub을 연결해 두면 push 할 때마다 자동으로 다시 배포됩니다.
- **서버**: `.github/workflows/deploy-relay.yml` 이 `deploy/cloudflare/` 가 바뀌어 main 에 올라오면 자동 배포합니다. GitHub 저장소 **Settings → Secrets and variables → Actions** 에 추가:
  - `CLOUDFLARE_API_TOKEN`: Cloudflare 대시보드 → My Profile → API Tokens → **Create Token → "Edit Cloudflare Workers" 템플릿**
  - `CLOUDFLARE_ACCOUNT_ID`: 대시보드 Workers 화면 오른쪽의 Account ID
  - Actions 탭에서 **Run workflow** 로 직접 배포할 수도 있습니다.

### 내 컴퓨터에서 미리 시험하기
```bash
cd deploy/cloudflare && npm run dev          # 로컬 서버 http://127.0.0.1:8787
```
```bash
VITE_WS_URL=ws://127.0.0.1:8787/ws npm run dev   # 다른 터미널, 저장소 루트에서
```
브라우저 창 두 개로 접속하면 서로 보입니다.

### 서버 동작 (deploy/cloudflare/worker.js)
- 방 = Durable Object 하나, 방당 50명, 최대 20개 방. 원하는 방이 차 있거나 없으면 자리가 있는 가장 낮은 번호 방으로, 모두 차면 `full` 을 보내고 클라이언트는 오프라인으로 플레이
- WebSocket Hibernation: 메시지가 없을 때는 잠들어 무료 사용량을 거의 쓰지 않음 (깨어나도 접속 번호가 겹치지 않게 처리)
- 이름·채팅 특수문자 제거, 채팅 10초에 5번 제한, 4KB 넘는 메시지·맵 밖 좌표 무시

### 무료 플랜 한도 추정 (2025~26 기준, 변동 가능 — 공식 요금 페이지 확인 필요)
- Workers 무료: 하루 10만 요청. Durable Objects WebSocket 은 메시지 20개 = 요청 1개로 계산
- 플레이어 1명이 위치 5Hz 로 보내고 방 평균 10명이 받는다면 1인당 약 55 msg/s → 2,750 msg/s·room… 실제로는 변경 시에만 전송하므로 훨씬 적지만, 보수적으로 **하루 100 플레이어·시간** 정도로 보면 안전합니다
- 방당 50명은 DO 1개당 연결 한도(32,768) 안에서 여유

## C. 접속 규모를 늘리려면
- `MAX_PLAYERS_PER_ROOM` 을 줄이고 방을 늘리는 쪽이 체감 지연에 유리
- 위치 전송 주기(`SEND_HZ`, `TICK_MS`) 조절
- 관심 영역(AOI) 필터링: 가까운 플레이어만 전송
- 수천 명 이상: Colyseus / 자체 룸 서버 클러스터, 방을 서버별로 샤딩
