// 아이템 아이콘 아틀라스 = 지금 아이템 목록 (다시 만들기: npm run bake:icons)
// 다 구웠다고 적힌 분류(CATS_DONE)에 칸이 없는 아이템이 있으면 실패 → 아이템을 더한 뒤 다시 굽지 않은 것
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URLS, CELL, COLS, ROWS, CELLS, CATS_DONE } from '../../src/ui/item_icons.gen.js';
import { iconCats } from '../../src/game/iconmesh/index.js';

const MAX_KB = 250; // 장마다 내려받기 크기 한도
const HINT = ' → npm run bake:icons 로 다시 구우세요';

test('다 구운 분류의 모든 아이템에 아이콘 칸이 있음', () => {
  const cats = iconCats();
  for (const cat of CATS_DONE) {
    assert.ok(cats[cat], `없는 분류 ${cat}${HINT}`);
    const miss = cats[cat].filter((k) => !CELLS[k]);
    assert.deepEqual(miss, [], `${cat} 분류에 칸 없는 아이템 ${miss.join(', ')}${HINT}`);
  }
});

test('칸 위치가 아틀라스 안이고 서로 겹치지 않음', () => {
  const seen = new Set();
  for (const [k, [c, r, s = 0]] of Object.entries(CELLS)) {
    assert.ok(c >= 0 && c < COLS && r >= 0 && r < ROWS[s], `${k}: 칸 [${c}, ${r}, ${s}] 이 범위 밖${HINT}`);
    const id = `${s}:${c}:${r}`;
    assert.ok(!seen.has(id), `${k}: 다른 아이템과 같은 칸${HINT}`);
    seen.add(id);
  }
});

test(`아틀라스 그림이 있고 장마다 ${MAX_KB}KB 이하, 크기가 칸 수와 맞음`, () => {
  URLS.forEach((u, s) => {
    const file = new URL(`../../public${u.split('?')[0]}`, import.meta.url);
    assert.ok(fs.existsSync(file), `${u} 없음${HINT}`);
    const buf = fs.readFileSync(file);
    assert.ok(buf.length <= MAX_KB * 1024, `${u} ${(buf.length / 1024).toFixed(0)}KB`);
    // WebP(VP8X) 머리의 캔버스 크기
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.toString('ascii', 12, 16), 'VP8X');
    const w = 1 + buf.readUIntLE(24, 3), h = 1 + buf.readUIntLE(27, 3);
    assert.equal(w, CELL * COLS);
    assert.equal(h, CELL * ROWS[s]);
  });
});
