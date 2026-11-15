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

> **현재 배포 상태 (2026-11-06)**: 멀티플레이 서버가 `https://unico-farm-relay.kimjs1408.workers.dev` 에 올라가 있습니다 (`/health` → ok, `/rooms` → 방 목록).
> 게임 빌드는 저장소의 `.env.production` 에 적힌 `VITE_WS_URL=wss://unico-farm-relay.kimjs1408.workers.dev/ws` 로 자동 접속하므로 Vercel 환경변수는 없어도 됩니다 (넣으면 그 값이 우선).
> 게임 화면은 `https://unico-farming.vercel.app` 에 있고, 서버는 그 주소(Origin)에서 온 접속만 받습니다 (`wrangler.toml` `[vars] ALLOWED_ORIGINS`). 다른 주소(미리보기 배포 등)에서 열면 혼자 플레이(오프라인)로 동작하므로, 주소를 더 허용하려면 쉼표로 이어 적고 다시 배포하세요.
> 서버(`deploy/cloudflare/worker.js`)를 고치면 다시 배포해야 합니다: 아래 1단계의 `npx wrangler deploy`, 또는 API 토큰을 `CLOUDFLARE_API_TOKEN` 으로 주고 `npx wrangler deploy`.

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

### 4단계(권장). 배포 전 확인 — CI·빌드 번호
- **CI** (`.github/workflows/ci.yml`): 모든 브랜치 push 와 PR 마다 `npm ci` → `npm test`(단위 테스트, 약 10초) → `npm run build`. `docs/` 만 바뀐 push 는 건너뛰지만, PR 은 문서만 고쳐도 늘 돕니다 (필수 검사가 건너뛰어지면 '대기 중' 으로 남아 합칠 수 없게 되므로).
  - 실패한 변경을 아예 못 합치게 하려면: GitHub 저장소 **Settings → Branches → Add branch ruleset**(또는 Branch protection rule) → 대상 브랜치(main 등) → **Require status checks to pass** 에 `test` 를 추가. 저장소 관리자만 바꿀 수 있는 설정이라 코드로는 켜지 않았습니다.
  - Vercel 배포 자체도 테스트로 막고 싶다면(선택, 아직 적용 안 함): `vercel.json` 의 `"buildCommand"` 를 `"npm test && npm run build"` 로 바꾸면 테스트가 실패한 커밋은 배포되지 않습니다 (배포마다 약 10초 더 걸림).
- **브라우저 연기 시험** (`scripts/smoke.mjs`): Actions 탭 → CI → **Run workflow** 로 실행하면 `test` 다음에 `smoke` 작업이 돕니다 (소프트웨어 WebGL 이라 몇 분). 휴대폰 크기(412x839, 낮음)로 입장 20초 동안 오류 없음, 게임 루프가 돎, 인트로 '건너뛰기' 가 5초 안에 풀림, 저장 → 새로 고침 → '저장된 농장을 불러왔어요', 낚시터·KOAT 체험관·우리 집으로 순간이동해도 컷신·대화가 5초 안에 풀림을 보고, 이어서 데스크톱(1280x800, 높음·화면 효과 켜짐)으로 따로 입장해 10초 동안 오류가 없는지 확인합니다. 바깥 주소(글꼴·날씨·릴레이 서버)는 모두 막고 돌립니다.
  - 내 컴퓨터에서: `VITE_WS_URL= npm run build && npm i --no-save playwright && npx playwright install chromium && npm run smoke`
- **빌드 번호**: 빌드한 `index.html`·`pixel.html` 에 `<meta name="unico-build" content="<커밋 앞 7자> <빌드 날짜>">` 가 들어갑니다 (Vercel 은 `VERCEL_GIT_COMMIT_SHA`, Actions 는 `GITHUB_SHA`, 그 밖에는 `git rev-parse`, 모두 없으면 `dev`). 오류 제보를 받으면 브라우저 콘솔에서 `document.querySelector('meta[name=unico-build]').content` 로 어느 배포인지 확인하세요. 아직은 게임 화면 어디에도 나오지 않습니다 — 설정 창 아래 작은 글씨(`빌드 1a2b3c4 · 2026-11-09`)와 오류 제보·진단 복사 문구가 이 meta 를 읽게 할 예정입니다. 그때도 빌드 상수 `__BUILD__` 대신 meta 를 읽습니다 (`__BUILD__` 를 JS 에서 쓰면 커밋마다 큰 main 청크 이름이 바뀌어 휴대폰이 다시 받음).
- **생성물 검사** (`npm run check:gen`, `tests/gen/*.check.mjs`): 문서의 수치 표·아이콘 아틀라스처럼 콘텐츠를 바꿀 때마다 다시 만들어야 하는 것. CI 의 `gen-check` 작업에서 돌지만 실패해도 배포·합치기를 막지 않습니다 (규칙은 `tests/gen/README.md`). 어긋났다고 나오면 아래 명령으로 다시 만들어 커밋하세요. 지금은 검사가 하나도 없어 늘 통과하고, 아래 두 명령도 **아직 없습니다** (검사를 추가할 때 함께 생김).

  | 생성물 | 다시 만드는 명령 | 검사 |
  |---|---|---|
  | `docs/BALANCE.md` 수치 표 | `node scripts/balance.mjs --md` — **아직 없음** (지금 `balance.mjs` 는 `--md` 를 모르고 콘솔 표만 출력) | 표 검사와 함께 추가 예정 |
  | 아이템 아이콘·아틀라스 | `npm run bake:icons` — **아직 없음** (package.json 에 스크립트 없음) | 아이콘 굽기와 함께 추가 예정 |

### 내 컴퓨터에서 미리 시험하기
```bash
cd deploy/cloudflare && npm run dev          # 로컬 서버 http://127.0.0.1:8787
```
```bash
VITE_WS_URL=ws://127.0.0.1:8787/ws npm run dev   # 다른 터미널, 저장소 루트에서
```
브라우저 창 두 개로 접속하면 서로 보입니다.

### 과금 방지와 무료 플랜 확인

**청구액 0원을 위한 전제는 Cloudflare 계정의 Workers Free 플랜 유지입니다.**
애플리케이션의 카운터나 지출 한도는 공급자의 청구 상한이 아닙니다. Paid 플랜의 기본 구독료·저장 용량·다른 서비스 비용을 없애지 못하고, 차단 처리 자체에도 요청이 발생합니다.

- Cloudflare → Workers & Pages → Plans 및 Billing → Subscriptions에서 **Workers Free**인지 확인합니다. Free 플랜은 무료 한도 초과 시 해당 작업이 실패하며 자동으로 Paid로 전환하지 않습니다.
- `cd deploy/cloudflare && npm run deploy`는 먼저 `scripts/verify-free-plan.mjs`를 실행합니다. 결제 조회 실패(403 포함), 불완전한 응답, 무료로 확인되지 않은 활성 구독이면 **배포를 중단**합니다. 요금제나 구독을 변경하는 API는 호출하지 않습니다.
- GitHub Actions에는 기존 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 외에 해당 계정의 **Billing Read** 권한만 가진 `CLOUDFLARE_BILLING_READ_TOKEN` Secret을 설정합니다. 별도 토큰이 없으면 기존 API 토큰으로 조회하며, 조회 권한이 없으면 배포하지 않습니다. 토큰을 소스·채팅에 적지 않습니다.
- 검사는 보수적으로 계정의 활성 구독 전체를 확인합니다. 다른 유료 제품이나 알 수 없는 구독도 있으면 사람이 확인하도록 배포를 막습니다. `npx wrangler deploy` 직접 실행은 이 검사를 우회하므로 사용하지 않습니다.
- 배포 직전 검사 이후에 관리자가 요금제를 바꾸면 이 검사로 막을 수 없습니다. 계정 플랜을 계속 Free로 유지해야 합니다.

공식 기준: [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/), [지출 한도의 범위와 한계](https://developers.cloudflare.com/billing/manage/spend-management/).

### 애플리케이션 안전선 (deploy/cloudflare/budget.js)

| 항목 | 기본 설정 |
| --- | --- |
| 방·인원 | 4개 방 × 30명, 최대 120명 |
| 하루 DO 요청 안전선 | 85,000건 (무료 요청 한도의 85%) |
| 하루 실행 시간 안전선 | 86,328초 (128MB 기준 무료 실행 시간의 85%) |
| 사용량 예약 | 방마다 최대 요청 256건·60초를 처리 전에 영속 장부에 기록 |
| 재개 시각 | UTC 00:00, 한국 오전 9시 |

- 환경변수 `BUDGET_REQUESTS`, `BUDGET_AWAKE_SEC`로 **낮출 수만 있습니다**. 큰 값·Infinity·잘못된 값으로 안전선을 올릴 수 없습니다.
- 방이 휴면·재시작돼도 이미 예약한 몫은 환급하지 않습니다. 실제 사용량보다 보수적인 값이라 일찍 차단될 수 있습니다. `/usage`는 청구서가 아닌 **예약 사용량**입니다.
- 장부가 불통이거나 잘못된 응답을 주면 새 입장과 메시지 처리를 중단합니다. 한도에 도달하면 연결을 닫고 혼자 플레이하도록 합니다. 보고 실패 후 계속 서비스하는 경로는 없습니다.
- 장부 갱신은 트랜잭션으로 처리합니다. 한도 소진 뒤에는 장부에 추가 쓰기를 하지 않습니다. ping·잘못된 메시지도 처리 전에 예약 몫에서 셉니다.
- 방 목록은 중간 방이 비어도 네 방을 모두 확인하고, 같은 Worker 인스턴스에서 15초 동안 조회를 합칩니다.
- 안전선은 DO 요청·실행 시간에 대한 보조 장치입니다. Worker HTTP 요청 전체, 플랫폼의 실제 시간·저장소 과금 등 모든 청구 항목을 정확하게 측정하지 않습니다. **무료 플랜의 공급자 한도가 최종 보호 장치입니다.**

### 서버 배포·호환성

- 자동 배포는 저장소의 실제 기본 브랜치에서만 실행됩니다. `deploy/cloudflare/**`, 공유 프로토콜 `server/rooms.js`, 무료 플랜 검사 변경이 대상입니다.
- 클라이언트와 릴레이를 함께 갱신해야 새 선물 프로토콜을 쓸 수 있습니다. 옛 릴레이·옛 클라이언트에게는 새 선물을 보내기 전에 새로고침 안내가 나옵니다.
- 선물은 차감과 미완료 거래를 먼저 저장하고, 상대의 수령 저장 확인 뒤 완료합니다. 연결이 끊겨도 같은 농장 식별자로 같은 방에서 만나면 10초 간격으로 재시도합니다. 이름이 같은 다른 농장으로 보내지 않습니다.
- 미완료 거래가 있는 동안 새 선물은 막습니다. 상대가 돌아오지 않거나 기록을 초기화한 경우 자동 환불하지 않습니다. 이미 수령한 거래를 중복 환불하는 것을 막기 위한 제한입니다. 수령 기록은 저장 파일과 함께 보관되므로 저장소를 지우거나 과거 백업을 복원한 경우까지 거래의 일관성을 보장하지는 않습니다.

## C. 접속 규모를 늘리려면
- `MAX_PLAYERS_PER_ROOM` 을 줄이고 방을 늘리는 쪽이 체감 지연에 유리
- 위치 전송 주기(`SEND_HZ`, `TICK_MS`) 조절
- 관심 영역(AOI) 필터링: 가까운 플레이어만 전송
- 수천 명 이상: Colyseus / 자체 룸 서버 클러스터, 방을 서버별로 샤딩
