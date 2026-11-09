# 생성물 검사 (`tests/gen/*.check.mjs`)

콘텐츠를 바꿀 때마다 **다시 만들어야 하는 결과물**이 지금 코드와 맞는지 보는 검사를 여기에 둡니다.
예: 문서의 수치 표(`docs/BALANCE.md`)가 `scripts/balance.mjs` 결과와 같은지, 아이콘·아이템 아틀라스가 모든 아이템을 담는지.

## 규칙

- 파일 이름은 `<이름>.check.mjs`. 그냥 `node --test`(= `npm test`)는 `*.test.js` 만 찾으므로 이 파일들은 **배포를 막지 않습니다**.
- 실행: `npm run check:gen` (`scripts/check-gen.mjs` 가 이 폴더의 `*.check.mjs` 만 `node --test` 로 돌림. 검사가 하나도 없으면 바로 통과).
- CI(`.github/workflows/ci.yml`)의 `gen-check` 작업이 push·PR 마다 돌지만 `continue-on-error` 라 실패해도 표시만 됩니다.
- 순수 단위 테스트(입력 → 결과가 늘 같은 것)는 여기가 아니라 `tests/*.test.js` 에 둡니다.
- 검사 파일 머리 주석에 **다시 만드는 명령**을 적고, 같은 명령을 `docs/DEPLOY.md` 의 '생성물 다시 만들기' 표에도 적습니다.

## 예시

아래의 `node scripts/balance.mjs --md` 는 **아직 없는 옵션**입니다 (지금은 콘솔 표만 출력). 표 검사를 추가할 때 그 옵션도 함께 만듭니다.

```js
// 문서 수치 표 = balance.mjs 결과 (다시 만들기: node scripts/balance.mjs --md)
import test from 'node:test';
import assert from 'node:assert/strict';

test('BALANCE.md 표가 지금 수치와 같음', async () => {
  // 생성 결과와 문서를 읽어 비교
  assert.ok(true);
});
```
