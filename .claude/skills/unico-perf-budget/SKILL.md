---
name: unico-perf-budget
description: 유니코 팜 3D 판의 성능 예산(드로우콜·삼각형·게임 로직 시간·JS 메모리·내려받기 크기·폰 프레임 시간)을 재고, 예산을 넘었을 때 원인을 찾을 때 사용. "성능 점검", "느려", "버벅여", "프레임", "드로우콜", "메모리", "용량", 새 모델·장면·시스템을 넣은 뒤, 배포 전 점검에 트리거.
---

# 유니코 팜 성능 예산

원본: [Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) `skills/perf-profile` · `agents/performance-analyst` (MIT) —
"합의한 예산과 비교", "예산이 없거나 못 잰 항목은 **판단 불가**(통과 아님)", 병목 순위 보고 형식을 이 프로젝트(바닐라 three.js, Vite, 모바일 웹)에 맞게 옮김.
엔진 설정 파일(project.yaml)·`_process/Update/Tick` 대신 `docs/perf/budget.json` · `requestAnimationFrame`/`renderer.info` 를 씀.

## 1. 재기

```bash
npm run build      # 내려받기 크기는 dist/ 를 잼
npm run dev        # 다른 터미널
npm run perf       # = node scripts/perf-budget.mjs http://localhost:5173/
node scripts/perf-budget.mjs http://localhost:5173/ --out docs/perf/$(date +%F).md   # 보고서 저장
node scripts/perf-budget.mjs --static   # 브라우저 없이 내려받기 크기만
```
Playwright 필요 (`npm i -D playwright && npx playwright install chromium` 또는 전역 설치).

| 항목 | 재는 법 | 비고 |
|---|---|---|
| 드로우콜·삼각형 (고·저사양) | 1280×800 스폰 화면, 10프레임 중 가장 무거운 한 프레임(그림자·후처리 포함) | GPU 부담의 대리 지표 |
| 게임 로직 평균·p95 | `loop()` 시간 − 그리기 시간, 120프레임 | 헤드리스 PC CPU. 폰은 대략 3~4배 |
| 오토플레이 중 로직 p95 | 오토플레이로 게임 시간 60초 | 길찾기·할 일 고르기 포함 |
| JS 메모리 / 1분 증가 | GC 후 `performance.memory` | 계속 늘면 새는 것 |
| 첫 화면 JS·CSS(gzip) / 모델(.gz) | `dist/` | 모바일 데이터 첫 접속 |
| 실제 폰 프레임 시간 | **스크립트로 못 잼** | 아래 3절 |

## 2. 예산 (`docs/perf/budget.json`)
- 숫자는 `budgets`, 근거는 `why` 에. 예산을 바꾸면 `updated` 와 `why` 도 함께 고친다. 근거 없이 '초과했으니 예산을 올림'은 안 됨
- `enforce`: `warn`(초과 = 경고, 기본) · `block`(초과 = 종료 코드 1 → 배포 전 점검에서 막을 때) · `off`(참고만)
- 예산이 `null` 이거나 잴 수 없으면 **판단 불가**. 보고서에서 지우거나 통과로 바꾸지 않는다
- 새 큰 기능(장면·모델·시스템)을 넣을 때는 넣기 전·후를 재어 늘어난 몫을 커밋 메시지나 `docs/DAILY_LOG.md` 에 적는다

## 3. 실제 폰에서 재기 (판단 불가를 없애려면)
1. 저가 안드로이드 폰(기준 기기)으로 배포 주소 접속 → 환경설정 그래픽 '저사양', 'FPS 표시' 켬
2. 스폰 화면 30초, 마을 한 바퀴, 오토플레이 1분 동안 FPS 칩 값을 봄 (가장 낮게 머무는 값)
3. `budget.json` 의 `measured.mobileFrameMs`(= 1000 ÷ FPS), `mobileDevice`(기기 이름·브라우저), `mobileMeasuredAt`(날짜)에 적음

## 4. 예산을 넘었을 때 — 원인 찾기 (three.js 점검표)
**그리기(드로우콜·삼각형)**
- [ ] 새 모델이 정적 병합(`world.staticObjs` → 재질별 병합)에 들어갔나, 움직이는 모델은 부품을 합쳤나
- [ ] 같은 모델이 여러 개면 `InstancedMesh` 인가
- [ ] 작은 소품(높이 0.7m 미만)·먼 캐릭터가 그림자를 그리지 않나, 캐릭터 LOD(16m/24m/40m)를 쓰나
- [ ] 투명 재질이 겹쳐 넘치지(overdraw) 않나, 후처리 패스가 늘지 않았나
- [ ] `renderer.info.render.calls` 를 장면 부분별로 껐다 켜며 범인 찾기

**로직(CPU)**
- [ ] 매 프레임 함수(`update`·`loop`·`_move`)에서 `new THREE.Vector3/Color/Quaternion…` 을 만들지 않나 → `(this._v ||= new THREE.Vector3())` 재사용, 상수 색은 모듈 상수로
  `grep -nE "new THREE\.(Vector3|Color|Quaternion|Matrix4)" src -r` 결과 중 update 안에 있는 것
- [ ] 모든 대상(동물·밭·장애물)을 매 프레임 이중 반복하지 않나 (거리 비교는 가까운 것만, 큰 계산은 0.3~0.5초마다)
- [ ] 길찾기 격자(`sim/path.js`)를 매 프레임 새로 만들지 않나 (막혔을 때만, 5초 간격)
- [ ] DOM 은 값이 바뀔 때만 씀 (`ui.updateHud` 의 `put` 처럼)

**메모리·내려받기**
- [ ] 장면에서 뺀 메시의 `geometry/material/texture.dispose()`
- [ ] 새 GLB 는 `npm run models:compress`(meshopt) 를 거쳤나, 텍스처는 2의 거듭제곱·필요한 크기인가
- [ ] 첫 화면에 꼭 필요 없는 코드는 `import()` 로 나중에 (예: 미니게임)

## 5. 보고 형식
`docs/perf/YYYY-MM-DD.md` (스크립트 `--out`) 아래에, 초과가 있으면 덧붙임:
```
## 병목 상위 (영향 큰 순)
| 순위 | 항목 | 측정 / 예산 | 원인(근거: 파일·줄, 껐다 켠 결과) | 고치는 법 | 예상 효과 |
```
- 원인은 **잰 근거**와 함께 (추측이면 '추정'이라고 씀). 고칠 것을 권하되, 고친 뒤 다시 재서 숫자로 확인
- 실제 폰 프레임 시간이 판단 불가면 그 줄을 남겨 둔다
