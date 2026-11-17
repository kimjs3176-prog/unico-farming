// HUD 단계적 공개: 새 농장은 적게 시작해 하나씩 열림, 예전 기록·행사 모드는 바로
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GATED, NET_KEYS, initHud, revealsFor, newReveals, isVisible, autoAllowed, hudParams } from '../src/game/sim/hud_reveal.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('새 농장은 빈 목록, 예전 기록(인트로를 봤고 hud 없음)은 모두 열림, 이미 있으면 그대로', () => {
  assert.deepEqual(initHud({}, true), []);
  assert.deepEqual(initHud({ intro: true }, false), GATED);
  const hud = ['market'];
  assert.equal(initHud({ hud }, false), hud);
});

test('공개 순서: 판매 → 장터, 도감 → 도감, 첫 수확 → 체험관, Lv3 → 꾸미기, 두 보상 → 자동', () => {
  assert.deepEqual(revealsFor({}), []);
  assert.deepEqual(revealsFor({ progress: { sell10: 1 } }), ['market']);
  assert.deepEqual(revealsFor({ book: 1 }), ['book']);
  assert.deepEqual(revealsFor({ progress: { harvest5: 1 } }), ['koat']);
  assert.deepEqual(revealsFor({ level: 3 }), ['decor']);
  assert.deepEqual(revealsFor({ progress: { decor1: 1 } }), ['decor']);
  // 자동: 첫 수확·첫 판매 보상을 모두 받아야 (진행만으로는 아님)
  assert.ok(!revealsFor({ progress: { harvest5: 5, sell10: 10 } }).includes('auto'));
  assert.ok(revealsFor({ claimed: { harvest5: true, sell10: true } }).includes('auto'));
});

test('행사 모드: ?koat=1 은 체험관, ?kiosk=1 은 체험관·자동을 바로', () => {
  assert.deepEqual(hudParams('?koat=1'), { koat: true, kiosk: false });
  assert.deepEqual(hudParams('?kiosk'), { koat: false, kiosk: true });
  assert.deepEqual(hudParams('?kiosk=0'), { koat: false, kiosk: false });
  assert.deepEqual(revealsFor({ params: hudParams('?koat=1') }), ['koat']);
  assert.deepEqual(revealsFor({ params: hudParams('?kiosk=1') }), ['koat', 'auto']);
  assert.equal(autoAllowed({ hud: [] }, { kiosk: true }), true);
});

test('newReveals: 이미 열린 것은 빼고 차례대로', () => {
  assert.deepEqual(newReveals(['koat'], { progress: { harvest5: 1, sell10: 1 } }), ['market']);
  assert.deepEqual(newReveals(GATED, { level: 9 }), []);
});

test('보이기: 늘 보이는 버튼, 열린 버튼, 접속 중일 때만 말하기·행동·농장 방', () => {
  assert.equal(isVisible(undefined, [], false), true, '소리·찰칵·전체 화면은 늘');
  assert.equal(isVisible('market', [], false), false);
  assert.equal(isVisible('market', ['market'], false), true);
  assert.equal(isVisible('market', undefined, false), true, '아직 정하지 않았으면(예전 기록) 보임');
  for (const k of NET_KEYS) {
    assert.equal(isVisible(k, GATED, false), false, `${k} 오프라인 숨김`);
    assert.equal(isVisible(k, [], true), true, `${k} 접속 중 보임`);
  }
});

test('오토플레이: 열리기 전에는 버튼도 P 키도 못 켬 (toggle 안에서 막음)', () => {
  assert.equal(autoAllowed({ hud: [] }), false);
  assert.equal(autoAllowed({ hud: ['auto'] }), true);
  assert.equal(autoAllowed({}), true, 'hud 가 없으면(예전 기록·시험) 허용');
  const src = read('src/game/autoplay.js');
  const t = src.slice(src.indexOf('  toggle('), src.indexOf('_stopMove()'));
  assert.match(t, /autoAllowed\(g\.flags, hudParams\(/);
  assert.match(t, /return;/);
});

test('행동 막대: 공개 대상 버튼에 data-k, 1초 틱은 actionbar.js 안 (main.js 를 건드리지 않음), 오프라인이면 채팅 숨김', () => {
  const src = read('src/ui/actionbar.js');
  for (const k of [...GATED, ...NET_KEYS]) assert.match(src, new RegExp(`'${k}'\\)`), k);
  assert.match(src, /setInterval\(\(\) => this\.hudTick\(false\), 1000\)/);
  assert.match(src, /classList\.toggle\('net-off', !net\)/);
  assert.doesNotMatch(read('src/main.js'), /hudTick/);
});

test('도움말이 공개 순서를 알려 줌', () => {
  const src = read('src/ui/panels/settings.js');
  assert.match(src, /첫 수확을 하면 하단 🏢 버튼이 열려요/);
  assert.match(src, /🤖 자동\(첫 수확·첫 판매 보상을 받으면/);
});
