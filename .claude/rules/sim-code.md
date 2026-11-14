---
paths:
  - "src/game/sim/**"
---

# 게임 규칙 코드 (`src/game/sim/`)

원본: Claude-Code-Game-Studios `rules/gameplay-code.md` (MIT) 를 이 프로젝트에 맞게 고침.
`sim/` 은 렌더링·화면과 떨어진 **순수 게임 규칙**이다. 3D 판(`src/game/view/`)과 도트 판(`src/pixel/`)이 함께 쓴다.

- **three.js·DOM·브라우저 API 금지**: `THREE`, `document`, `window`, `localStorage`, `performance.now` 를 쓰지 않는다. 그래서 `node --test` 로 바로 시험할 수 있다
- **수치는 데이터 모듈에**: 가격·시간·확률·보상은 `crops.js`·`items.js` 같은 데이터 표나 파일 맨 위의 이름 붙은 상수(`const SELL_AT = 24; // 설명`)에 둔다. 함수 안에 의미 없는 숫자를 흩어 놓지 않는다. 밸런스를 바꾸면 `docs/BALANCE.md`·`scripts/balance.mjs` 도 확인
- **시간은 dt(초)로**: 매 프레임 진행은 `tick(dt)`/`update(dt)` 로 받은 경과 시간에 비례. 프레임 수를 세지 않는다
- **무작위는 주입**: `constructor(rng = Math.random)` 또는 함수 인자 `rng = Math.random` 로 받아 `this.rng()` 를 쓴다 (테스트에서 고정값 주입). `Math.random()` 을 직접 부르지 않는다
- **상태 변경은 메서드로**: 바깥(화면 코드)이 필드를 직접 고치지 않아도 되게, 할 수 있는 일은 메서드로 연다 (예: 돈은 `economy.spend(cost)`, 씨앗은 `economy.addSeeds(crop, n)`). 실패하면 아무것도 바꾸지 않고 `false`/`null` 을 돌려준다
- **저장 가능**: 상태는 `toJSON()`/`load()` 로 왕복되게. 구조를 바꾸면 `src/game/save.js` 의 마이그레이션도
- **테스트 함께**: 새 규칙·버그 수정은 `tests/` 에 시험을 더한다 (`tests/` 규칙 참고)
- 사람에게 보이는 한국어 문장에 이름을 넣을 때는 조사를 `josa()` (`sim/josa.js`) 로

**좋은 예**
```js
export const TROUGH_MAX = 12;                // 여물통 최대 사료 수
export class RanchSim {
  constructor(rng = Math.random) { this.rng = rng; this.trough = 0; }
  tick(dt) { for (const a of this.animals) a.fedTimer = Math.max(0, a.fedTimer - dt); }
  fillTrough(n) { const k = Math.min(n, TROUGH_MAX - this.trough); this.trough += k; return k; }
}
```
**나쁜 예**
```js
tick() { this.timer -= 1 / 60; }             // 프레임 수에 묶임 (dt 를 써야 함)
if (Math.random() < 0.3) …                   // 주입받은 rng 를 써야 함
document.querySelector('.hud').textContent = …  // sim 은 화면을 모름
```
