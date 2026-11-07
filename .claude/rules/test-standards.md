---
paths:
  - "tests/**"
---

# 테스트 규칙 (`tests/*.test.js`, `node --test`)

원본: Claude-Code-Game-Studios `rules/test-standards.md` (MIT) 를 이 프로젝트(Node 내장 테스트, 한국어 이름)에 맞게 고침.

- **파일**: `tests/[시스템].test.js` (예: `ranch.test.js`). `import test from 'node:test'`, `import assert from 'node:assert/strict'`
- **이름은 한국어 한 문장으로 '상황 → 기대 결과'**: `test('사료가 없으면 사료 주기를 고르지 않고 장터로 감', …)`. `test1` 같은 이름 금지
- **준비 → 실행 → 확인** 순서가 보이게 (길면 `// 준비` `// 실행` `// 확인` 주석)
- **정확하게 확인**: `assert.ok(x < 100)` 보다 `assert.equal(x, 75)`. 실패 메시지에 값을 넣는다 (`assert.ok(r >= 4.5, \`대비 ${r}\`)`)
- **결정적으로**: 무작위는 고정 rng 를 주입(`new Economy(() => 0.5)`), 시간은 dt 를 넘겨 진행. 실제 시간·`setTimeout`·네트워크·브라우저에 기대지 않는다 (브라우저 확인은 `scripts/*` 점검으로)
- **테스트끼리 상태를 나누지 않음**: 객체는 각 테스트 안에서 만든다. 모듈 전역 값을 바꿨으면 되돌린다
- **sim 은 화면 없이 시험**: `src/game/sim/*` 은 three.js·DOM 없이 import 되어야 한다. 화면 코드의 규칙 부분은 sim 으로 빼서 시험한다 (예: `sim/path.js`, `ui/contrast.js`)
- **버그를 고치면 그 버그를 잡는 테스트를 같이 — 그리고 고치기 전 코드에서 먼저 실패하는 것을 본다.** 새 테스트를 고치기 전 코드로 돌려 실패를 확인하고, 고친 뒤 통과를 확인한다. 통과하는 모습만 본 회귀 테스트는 무엇을 잡는지 모른다 (예: 막힌 자리 옆 목표 길찾기 — `tests/path.test.js`)
- **성능·수치 기준을 시험하면 기준값을 이름 붙여** 둔다 (예: `--teal-t-hi` 대비 4.5:1 이상)
- 실행: `npm test` (전체), `node --test tests/ranch.test.js` (하나)
