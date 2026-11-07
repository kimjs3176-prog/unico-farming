---
paths:
  - "src/ui/**"
  - "src/game/view/**"
---

# 화면 코드 (`src/ui/`, `src/game/view/`)

원본: Claude-Code-Game-Studios `rules/ui-code.md` (MIT) 를 이 프로젝트(DOM HUD + three.js 장면, 한국어, PC·폰 터치)에 맞게 고침.

- **게임 상태는 `sim/` 이 가진다**: 화면 코드는 보여 주고, 바꿀 때는 sim 메서드를 부른다. `eco.money -= …`, `eco.inventory.x[k] = …` 처럼 필드를 직접 고치지 않는다 → `eco.spend(cost)`, `eco.addSeeds(k, n)`, `eco.addItem(id, n)`, `eco.take(id, n)`. 필요한 메서드가 없으면 sim 에 만들고 테스트를 단다
- **값이 바뀔 때만 DOM 에 씀**: 매 프레임 `innerHTML`/`style` 을 쓰지 않는다 (`ui.updateHud` 의 `put` 처럼 이전 값과 비교)
- **한국어 문장**: 사람에게 보이는 글은 한국어. 이름 뒤 조사는 `josa()` 로 (`을(를)` 하드코딩 금지). 다국어 계획은 없으므로 번역 시스템은 쓰지 않음
- **마우스·키보드·터치 모두**: 누를 수 있는 것은 클릭·탭 둘 다 되고, 자주 쓰는 것은 키(E·Q·I·M·P·Esc·숫자)도. 길게 누르기·두 손가락만으로 되는 조작은 다른 방법도 둔다
- **접근성 (`unico-a11y-check` 스킬)**: 글자 명암 4.5:1(큰 글자 3:1) — 흰 글자 위 청록은 `--teal-t-*`, 색 배경 위 글자는 `textOn()`(`src/ui/contrast.js`). 폰 터치 대상 최소 24px(권장 44px). 아이콘만 보이는 버튼은 `aria-label`. 색만으로 상태를 알리지 않음(아이콘·글자 함께)
- **글자 크기 설정과 좁은 화면**: 환경설정 '아주 크게'(×1.3)와 폰 세로(360px)·가로에서 잘리거나 겹치지 않게. `#ui` 의 zoom 안에서는 `vw` 도 배율이 곱해지니 `calc(100vw / var(--ui-zoom, 1) …)`
- **움직임**: 화면 흔들림·반복 애니메이션은 `prefers-reduced-motion` 을 따른다. 대사는 탭으로 건너뛸 수 있게
- **전체 화면 레이어는 클릭을 막지 않게**: 장식용 겹침(컷신 띠·카운트다운)은 `pointer-events: none`
- **매 프레임 함수에서 객체를 만들지 않음**: `update()` 안의 `new THREE.Vector3/Color` 는 재사용(`this._v ||= …`)이나 모듈 상수로 (`unico-perf-budget` 스킬)
- UI 를 바꾼 뒤: `npm run a11y` (필수 0건), 폰·PC 스크린샷으로 직접 확인
