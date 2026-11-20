// 새 이모지 바꿔 쓰기 표(src/ui/icons.js EMOJI_OVERRIDE)가 3D 판 코드의 Emoji 13 이후 글자를 모두 담는지
// 콘텐츠(아이템·꾸미기·화면 글)에 새 이모지를 넣을 때마다 표에 한 줄 더하기: '새글자': { alt: '옛 이모지' } 또는 { ico: '자체 아이콘', alt }
// (다시 만들기: src/ui/icons.js 의 EMOJI_OVERRIDE 를 손으로 고침. 자체 아이콘은 src/ui/icons.svg 에 <symbol id="i-…">)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMOJI_OVERRIDE, spriteNames } from '../../src/ui/icons.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Windows 10·옛 안드로이드·iOS 에 없는 글자 (Emoji 13 이후). 🪙 는 코인 글꼴이 맡음 */
const late = (c) => c !== 0x1FA99 && ((c >= 0x1FA70 && c <= 0x1FAFF && !((c >= 0x1FA70 && c <= 0x1FA73) || (c >= 0x1FA78 && c <= 0x1FA7A) || (c >= 0x1FA80 && c <= 0x1FA82) || (c >= 0x1FA90 && c <= 0x1FA95)))
  || [0x1F972, 0x1F978, 0x1F979, 0x1F90C, 0x1F6FB, 0x1F6FC, 0x1F6DD, 0x1F6DE, 0x1F6DF, 0x1F7F0, 0x1F9CC].includes(c));

function scan(dir, out = {}) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'pixel') scan(p, out); continue; } // 도트 판은 따로
    if (!/\.js$/.test(f)) continue;
    for (const ch of fs.readFileSync(p, 'utf8')) if (late(ch.codePointAt(0))) (out[ch] ||= new Set()).add(path.relative(root, p));
  }
  return out;
}

test('3D 판 코드의 새 이모지(Emoji 13+)는 모두 바꿔 쓰기 표에 있음', () => {
  const found = scan(path.join(root, 'src'));
  const miss = Object.keys(found).filter((ch) => !EMOJI_OVERRIDE[ch]).map((ch) => `${ch} (${[...found[ch]].join(', ')})`);
  assert.deepEqual(miss, [], '표에 없는 새 이모지');
});

test('바꿔 쓰기 표의 대체 글자는 오래된 기기에도 있고, 자체 아이콘은 그림 묶음에 있음', () => {
  const names = new Set(spriteNames(fs.readFileSync(path.join(root, 'src/ui/icons.svg'), 'utf8')));
  for (const [ch, o] of Object.entries(EMOJI_OVERRIDE)) {
    assert.ok(o.alt && ![...o.alt].some((c) => late(c.codePointAt(0))), `${ch} → ${o.alt}`);
    if (o.ico) assert.ok(names.has(o.ico), `${ch} → i-${o.ico}`);
  }
});
