// 문서 수치 표 = balance.mjs 결과 (다시 만들기: node scripts/balance.mjs --md 를 실행해 같은 이름의 <!-- gen:balance-* --> 칸에 붙이기)
// docs/GAME_DESIGN.md §3·§5·§7-2, docs/BALANCE.md '현재 수치'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { balanceBlocks, docBlock } from '../../scripts/balance.mjs';

const HINT = '\n→ node scripts/balance.mjs --md 결과로 이 칸을 바꿔 붙이세요';
const DOCS = { 'docs/GAME_DESIGN.md': ['crops', 'ranch', 'book'], 'docs/BALANCE.md': ['crops', 'rice', 'ranch', 'book'] };

for (const [file, keys] of Object.entries(DOCS)) {
  test(`${file} 수치 표가 지금 코드와 같음`, () => {
    const text = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const B = balanceBlocks();
    for (const k of keys) {
      const got = docBlock(text, k);
      assert.ok(got !== null, `${file} 에 <!-- gen:balance-${k} --> 칸이 없어요${HINT}`);
      assert.equal(got, B[k], `${file} 의 gen:balance-${k} 표가 코드와 달라요${HINT}`);
    }
  });
}
