// 농장 옮기기: 농장 코드 내보내기/읽기·가져오기 (src/game/save.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCode, parseCode, importSave, saveGame, setReadOnly, saveSummary, fnv1a, takeImportMark, CODE_MAX, QR_MAX, SAVE_KEY, BAK_KEY } from '../src/game/save.js';

/** W4 칸까지 든 저장 기록 (마을 별·계절 도전·편지·집 꾸미기·꾸미기 창고·의상 색·축제 엽전) */
function sampleSave() {
  return {
    v: 2, at: 1_763_600_000_000, name: '별님',
    farm: { plots: [{ crop: 'carrot', stage: 2, watered: true }], level: 3 },
    economy: { money: 3450, inventory: { crops: { carrot: 4 }, products: {}, items: { fest_token: 7 }, seeds: { carrot: 2 } } },
    world: { time: 0.4, day: 12 },
    player: { x: 1.5, z: 8.25 },
    flags: { intro: true, townStar: 2, title: '이웃사촌', titles: ['이웃사촌'], letters: { read: ['harvest1'], box: ['build1'] }, festTokens: 7 },
    weekly: { key: 'w2', done: [0, 2], claimed: [0] },
    home: { level: 2, outfit: { hat: 'straw' }, style: { wall: 'mint', floor: 'oak' }, furniture: [{ id: 'lamp', x: 1, z: 2 }] },
    decor: { placed: [{ id: 'fence', x: 3, z: 4 }], store: { bench: 2 } },
    costume: { owned: ['farmer'], wearing: 'farmer', variants: { farmer: 'blue' } },
    town: { built: ['bakery'] }, social: { friends: ['a'] },
  };
}

/** 저장소 흉내 (각 테스트 안에서) */
function withStorage(t) {
  const store = new Map();
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  t.after(() => { globalThis.localStorage = real; setReadOnly(false); });
  return store;
}

test('농장 코드: 내보낸 코드를 읽으면 W4 칸까지 모두 그대로 (gzip, UF1. 머리)', async () => {
  const d = sampleSave();
  const code = await exportCode(JSON.stringify(d));
  assert.match(code, /^UF1\.g\.[0-9a-f]{8}\.[A-Za-z0-9_-]+$/);
  assert.ok(code.length <= QR_MAX, `QR 에 담김 (${code.length}자)`);
  const r = await parseCode(code);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, d);
  assert.deepEqual(r.summary, { name: '별님', day: 12, coins: 3450, at: d.at });
  const viaUrl = await parseCode(`https://farm.example/#farm=${code}`);
  assert.deepEqual(viaUrl.data, d, '#farm= 주소째 붙여 넣어도');
  const withSpaces = await parseCode(`  ${code.slice(0, 20)}\n${code.slice(20)}  `);
  assert.equal(withSpaces.ok, true, '줄바꿈·공백이 섞여도');
});

test('농장 코드: 파일로 저장한 JSON 도 읽음', async () => {
  const d = sampleSave();
  assert.deepEqual((await parseCode(JSON.stringify(d, null, 2))).data, d);
  assert.deepEqual((await parseCode(JSON.stringify({ unicoFarm: 1, save: d }))).data, d);
});

test('농장 코드: 잘린 코드·바뀐 체크섬·너무 큰 글·새 버전·핵심 칸 없음·빈 글은 까닭과 함께 거절', async () => {
  const d = sampleSave();
  const code = await exportCode(JSON.stringify(d));
  assert.equal((await parseCode(code.slice(0, code.length - 12))).reason, 'checksum', '잘림');
  const bad = code.replace(/^UF1\.g\.([0-9a-f]{8})/, (m, h) => `UF1.g.${h === '00000000' ? '11111111' : '00000000'}`);
  assert.equal((await parseCode(bad)).reason, 'checksum', '체크섬');
  assert.equal((await parseCode('x'.repeat(CODE_MAX + 1))).reason, 'toolong');
  assert.equal((await parseCode(await exportCode(JSON.stringify({ ...d, v: 99 })))).reason, 'newer');
  const { economy, ...noEco } = d;
  assert.equal((await parseCode(await exportCode(JSON.stringify(noEco)))).reason, 'missing');
  assert.equal((await parseCode('')).reason, 'empty');
  assert.equal((await parseCode('hello')).reason, 'format');
  assert.equal((await parseCode('{"a":')).reason, 'format');
});

test('농장 코드: 압축 없이 만든 코드(UF1.j.)도 읽고, 체크섬은 FNV-1a', async () => {
  const d = sampleSave(), json = JSON.stringify(d);
  const plain = `UF1.j.${fnv1a(json)}.${Buffer.from(json).toString('base64url')}`;
  assert.deepEqual((await parseCode(plain)).data, d);
  assert.equal(fnv1a(''), '811c9dc5');
});

test('가져오기: 지금 기록은 .bak 으로, 새 기록을 쓰고, 떠날 때 저장(pagehide)이 덮지 못하게 막음', (t) => {
  // 준비
  const store = withStorage(t);
  const mine = { ...sampleSave(), name: '이 기기' };
  store.set(SAVE_KEY, JSON.stringify(mine));
  const incoming = sampleSave();
  // 실행
  assert.equal(importSave(incoming), true);
  // 확인
  assert.deepEqual(JSON.parse(store.get(SAVE_KEY)), incoming);
  assert.equal(JSON.parse(store.get(BAK_KEY)).name, '이 기기');
  assert.equal(takeImportMark(), true, '다음 부팅은 .bak 을 덮지 않음');
  assert.equal(takeImportMark(), false, '한 번만');
  const game = { playerName: 'x', farm: { sim: { toJSON: () => ({}) } }, economy: { toJSON: () => ({ money: 1 }) }, quests: { toJSON: () => ({}) }, ranch: { toJSON: () => ({}) }, rice: { toJSON: () => ({}) }, nature: { toJSON: () => ({}) }, villagers: { toJSON: () => ({}) }, collection: { toJSON: () => ({}) }, koat: { toJSON: () => ({}) }, world: { time: 0, day: 1 }, player: { position: { x: 0, z: 0 } } };
  assert.equal(saveGame(game), false, '가져온 뒤 옛 게임의 저장은 막힘');
  assert.deepEqual(JSON.parse(store.get(SAVE_KEY)), incoming);
});

test('가져오기(부팅 중): 저장을 막지 않고 쓰기만', (t) => {
  const store = withStorage(t);
  assert.equal(importSave(sampleSave(), { reload: false }), true);
  assert.equal(JSON.parse(store.get(SAVE_KEY)).name, '별님');
  assert.equal(store.has(BAK_KEY), false, '이 기기에 기록이 없었으면 백업도 없음');
});

test('요약: 이상한 값은 기본값으로', () => {
  assert.deepEqual(saveSummary({ name: '', world: { day: 'x' }, economy: {} }), { name: '이름 없음', day: 1, coins: 0, at: 0 });
  assert.equal(saveSummary(null), null);
});
