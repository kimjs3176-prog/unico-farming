import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, textOn, luminance, INK } from '../src/ui/contrast.js';

test('명암 대비: 흰색/검정 21:1, 같은 색 1:1, 잘못된 색은 null', () => {
  assert.equal(Math.round(contrast('#ffffff', '#000000')), 21);
  assert.equal(contrast('#30b6aa', '#30b6aa'), 1);
  assert.equal(luminance('teal'), null);
  assert.equal(contrast('#fff', '#000'), null); // 6자리만 받음
});

test('이름표 글자색: 밝은 배경은 진한 글자, 어두운 배경은 흰 글자, 결과는 늘 4.5:1 이상', () => {
  assert.equal(textOn('#30b6aa'), INK);   // 청록: 흰 글자 2.5:1 → 진한 글자
  assert.equal(textOn('#e39a4a'), INK);   // 강아지 주황
  assert.equal(textOn('#3170c9'), '#fff'); // 낚시꾼 파랑
  assert.equal(textOn('#231916'), '#fff');
  // 대화에 쓰는 이름표 색 전부 (주민 NPC_COLOR · 강아지 · 안내 · 나) — 선택지 번호(13px)도 읽히게 4.5:1
  for (const bg of ['#f28c28', '#8e7cc3', '#6dbb4f', '#a07e5c', '#f28bb0', '#3170c9', '#30b6aa', '#e39a4a', '#5a3a1a']) {
    const fg = textOn(bg) === '#fff' ? '#ffffff' : INK;
    assert.ok(contrast(fg, bg) >= 4.5, `${bg} 위 ${fg}: ${contrast(fg, bg).toFixed(2)}`);
  }
});

test('테마의 흰 글자용 청록은 그라데이션 가장 밝은 곳에서도 4.5:1 이상', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/ui/theme.css', import.meta.url), 'utf8');
  const hi = /--teal-t-hi:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
  assert.ok(hi, '--teal-t-hi 가 있어야 함');
  assert.ok(contrast('#ffffff', hi) >= 4.5, `흰 글자 / ${hi} = ${contrast('#ffffff', hi).toFixed(2)}`);
});
