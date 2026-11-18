// 저장 보호 (src/game/save.js + game_save.js): 못 읽은 기록은 보관하고 백업으로, 새 버전 기록은 읽기 전용,
// 한 칸이 오류를 내도 나머지는 불러옴, 저장 공간 부족은 false + 한 번 알림, 다른 창이 저장하면 이 창은 멈춤
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
let failSet = null; // (key) => 던질 오류 (없으면 정상)
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => { const e = failSet?.(k); if (e) throw e; store.set(k, String(v)); },
  removeItem: (k) => store.delete(k),
};
const sstore = new Map();
globalThis.sessionStorage = { getItem: (k) => sstore.get(k) ?? null, setItem: (k, v) => sstore.set(k, String(v)), removeItem: (k) => sstore.delete(k) };
const listeners = {};
globalThis.window = { addEventListener: (k, f) => { (listeners[k] ||= []).push(f); } };
const quiet = console.warn;
console.warn = () => {}; // 일부러 낸 오류의 경고는 숨김

const S = await import('../src/game/save.js');
const { GameSave, TAKEOVER_KEY } = await import('../src/game/game_save.js');
const { SAVE_KEY, BAK_KEY, BROKEN_KEY, BROKEN_KEY2, CRASH_MARK, OWNER_KEY } = S;

const quota = () => Object.assign(new Error('저장 공간 부족'), { name: 'QuotaExceededError' });

/** 저장·불러오기에 필요한 칸만 있는 가짜 게임 */
function makeGame(over = {}) {
  const sec = (name) => ({ name, got: undefined, load(d) { this.got = d; }, toJSON() { return this.got ?? { name }; } });
  const g = Object.assign(Object.create(GameSave), {
    playerName: '유니', flags: {}, saveTimer: 0, toasts: [], shownFns: [], introCalled: 0,
    farm: { sim: sec('farm'), refreshAll() { this.refreshed = true; } },
    economy: { money: 150, load(d) { this.money = d?.money ?? 150; }, toJSON() { return { money: this.money }; } },
    quests: sec('quests'), ranch: sec('ranch'), rice: sec('rice'), nature: sec('nature'), villagers: sec('villagers'),
    collection: sec('collection'), koat: Object.assign(sec('koat'), { book: { rewarded: false } }), explore: sec('explore'),
    bees: sec('bees'), angling: sec('angling'), farmcraft: sec('farmcraft'), town: sec('town'), home: sec('home'),
    costume: sec('costume'), social: Object.assign(sec('social'), { newDay() {} }), decor: sec('decor'), pet: { ok: false },
    world: { time: 0, day: 1 },
    player: { position: { x: 0, z: 0, set(x, _y, z) { this.x = x; this.z = z; } }, setTitle() {} },
    ui: { toast: (t) => g.toasts.push(t) },
    whenShown(fn) { this.shownFns.push(fn); },
    applyLook() {},
    introCutscene() { this.introCalled++; this._introPending = false; },
  }, over);
  return g;
}
/** 로딩 화면이 걷힌 뒤 (whenShown + setTimeout) 까지 실행 */
function showAll(t, g) {
  for (const fn of g.shownFns) fn();
  t.mock.timers.tick(5000);
}
const reset = () => { store.clear(); sstore.clear(); failSet = null; S.setReadOnly(false); };
const saved = (o = {}) => JSON.stringify({ v: 1, at: 1, name: '유니', economy: { money: 777 }, player: { x: 5, z: -3 }, world: { time: 0.4, day: 9 }, flags: { intro: true }, ...o });

test('깨끗하게 불러오면 그 기록을 .bak 으로 (부팅마다 한 번) · 칸마다 불러옴', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reset();
  store.set(SAVE_KEY, saved());
  const g = makeGame();
  g.restore();
  assert.equal(store.get(BAK_KEY), store.get(SAVE_KEY));
  assert.equal(g.economy.money, 777);
  assert.deepEqual([g.player.position.x, g.player.position.z], [5, -3]);
  assert.equal(g.world.day, 9);
  assert.equal(g._introPending, undefined, '인트로 없음');
  assert.ok(g.farm.refreshed);
  showAll(t, g);
  assert.deepEqual(g.toasts, ['💾 저장된 농장을 불러왔어요']);
});

test('못 읽는 기록(잘린 JSON): 원본은 .broken 에 보관하고 .bak 을 불러옴 — 덮어써도 원본은 남음', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reset();
  const raw = saved().slice(0, 40); // 잘린 기록
  store.set(SAVE_KEY, raw);
  store.set(BAK_KEY, saved({ economy: { money: 500 } }));
  assert.equal(S.loadSaveInfo().status, 'broken');
  assert.equal(S.loadSave(), null, '예전 함수는 null');
  const g = makeGame();
  g.restore();
  assert.equal(store.get(BROKEN_KEY), raw);
  assert.equal(g.economy.money, 500, '백업에서');
  assert.equal(g._introPending, undefined, '못 읽은 기록 위에서 인트로를 시작하지 않음');
  showAll(t, g);
  assert.equal(g.toasts.length, 1, '불러왔어요 알림 없이 백업 안내만 (서로 엇갈려 보이지 않게)');
  assert.match(g.toasts[0], /손상되어 최근 백업\(9일차\)에서 농장을 불러왔어요/, '얼마나 빠졌는지 알게 백업의 날짜');
  assert.equal(g.save(), true);
  assert.equal(JSON.parse(store.get(SAVE_KEY)).economy.money, 500);
  assert.equal(store.get(BROKEN_KEY), raw, '원본은 그대로');
});

test('못 읽는 기록 + 백업 없음: 원본을 보관한 뒤에야 새 농장(인트로) · 보관을 못 하면 이번 접속은 저장 안 함', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reset();
  store.set(SAVE_KEY, '{"v":1,"name":');
  let g = makeGame();
  g.restore();
  assert.equal(store.get(BROKEN_KEY), '{"v":1,"name":');
  assert.equal(g._introPending, true);
  showAll(t, g);
  assert.equal(g.introCalled, 1);
  assert.ok(g.toasts.some((x) => /이전 기록은 따로 보관/.test(x)));
  assert.equal(g.save(), true, '인트로 뒤 새 농장 저장');
  assert.equal(store.get(BROKEN_KEY), '{"v":1,"name":', '덮어써도 원본 보관본은 남음');
  // 두 번째 사고: 처음 보관본은 그대로, 새 원본은 broken2 에
  store.set(SAVE_KEY, '[1,2');
  makeGame().restore();
  assert.equal(store.get(BROKEN_KEY), '{"v":1,"name":');
  assert.equal(store.get(BROKEN_KEY2), '[1,2');
  // 보관할 자리가 없음 (저장 공간 부족): 이번 접속은 읽기 전용
  reset();
  store.set(SAVE_KEY, 'null-ish{');
  failSet = (k) => (k.startsWith(BROKEN_KEY) ? quota() : null);
  g = makeGame();
  g.restore();
  showAll(t, g);
  assert.equal(S.saveBlocked(), true);
  failSet = null;
  g._introPending = false;
  assert.equal(g.save(), false);
  assert.equal(store.get(SAVE_KEY), 'null-ish{', '지킬 수 없는 원본은 덮어쓰지 않음');
  assert.ok(g.toasts.some((x) => /이번에는 저장하지 않아요/.test(x)));
});

test('새 버전(v:3)으로 저장된 기록: 불러오되 읽기 전용 (옛 판이 빠진 칸째로 덮어쓰지 않게), 인트로 없음', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reset();
  const raw = saved({ v: 3, economy: { money: 999 } });
  store.set(SAVE_KEY, raw);
  assert.equal(S.loadSaveInfo().status, 'newer');
  const g = makeGame();
  g.restore();
  assert.equal(g.economy.money, 999);
  assert.equal(g._introPending, undefined);
  assert.equal(g.save(), false);
  assert.equal(store.get(SAVE_KEY), raw);
  assert.equal(store.get(BAK_KEY), undefined, '새 버전 기록은 백업으로 옮기지 않음');
  showAll(t, g);
  assert.ok(g.toasts.some((x) => /새 버전으로 저장된 농장/.test(x)));
  assert.ok(!g.toasts.some((x) => /저장하지 못했어요/.test(x)), '막힌 저장은 실패 알림 없음');
});

test('한 칸이 오류를 내도 나머지는 불러오고, 원본은 다음 자동 저장 전에 보관 · 한 번만 알림', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reset();
  const raw = saved();
  store.set(SAVE_KEY, raw);
  const g = makeGame();
  g.ranch.load = () => { throw new Error('목장 칸 오류'); };
  assert.doesNotThrow(() => g.restore(), 'Game 생성자 밖으로 던지지 않음');
  assert.equal(g.economy.money, 777, '다른 칸은 그대로');
  assert.equal(g.world.day, 9);
  assert.equal(g.decor.got, undefined, '없는 칸은 undefined 그대로');
  assert.equal(store.get(BROKEN_KEY), raw);
  assert.equal(store.get(BAK_KEY), undefined, '깨끗하지 않은 기록은 백업으로 옮기지 않음');
  showAll(t, g);
  assert.equal(g.toasts.filter((x) => /일부 기록을 불러오지 못했어요/.test(x)).length, 1);
  assert.equal(S.loadSaveInfo().status, 'ok');
});

test('저장 공간 부족(QuotaExceeded): saveGame 은 false, 알림은 접속마다 한 번 · 다시 되면 한 번 알림', () => {
  reset();
  const g = makeGame();
  failSet = (k) => (k === SAVE_KEY ? quota() : null);
  assert.equal(S.saveGame(g), false);
  assert.equal(S.lastSaveError(), 'quota');
  assert.equal(g.save(), false);
  assert.equal(g.save(), false);
  assert.deepEqual(g.toasts, ['⚠️ 저장 공간이 부족해 농장을 저장하지 못했어요']);
  failSet = null;
  assert.equal(g.save(), true);
  assert.equal(g.save(), true);
  assert.deepEqual(g.toasts.slice(1), ['💾 이제 다시 저장돼요']);
  failSet = (k) => (k === SAVE_KEY ? Object.assign(new Error('막힘'), { name: 'SecurityError' }) : null);
  assert.equal(S.saveGame(g), false);
  assert.equal(S.lastSaveError(), 'denied');
});

test('이상한 상태(위치·코인이 숫자가 아님)는 저장하지 않음 · 오류 직전 저장(crash)은 지금 기록을 .bak 으로 먼저', () => {
  reset();
  const g = makeGame();
  assert.equal(S.saveGame(g), true);
  const good = store.get(SAVE_KEY);
  g.player.position.x = NaN;
  assert.equal(S.saveGame(g), false);
  assert.equal(S.lastSaveError(), 'state');
  g.player.position.x = 1;
  g.economy.money = Infinity;
  assert.equal(S.saveGame(g, { crash: true }), false);
  assert.equal(store.get(SAVE_KEY), good, '좋은 기록을 덮지 않음');
  g.economy.money = 42;
  assert.equal(S.saveGame(g, { crash: true }), true);
  assert.equal(store.get(BAK_KEY), good, '오류 직전 저장 전에 지금 기록을 백업');
  assert.equal(JSON.parse(store.get(SAVE_KEY)).economy.money, 42);
  // 지금 기록이 못 읽는 것이면 좋은 백업을 덮지 않음 (백업에서 불러온 직후 오류)
  store.set(SAVE_KEY, '{"v":1,"name":');
  store.set(BAK_KEY, good);
  assert.equal(S.saveGame(g, { crash: true }), true);
  assert.equal(store.get(BAK_KEY), good, '못 읽은 기록은 백업으로 옮기지 않음');
});

test('다른 창이 같은 기록을 저장·초기화하면 이 창은 멈춤 (저장 막힘·입력·루프 멈춤), 다른 키는 무시', () => {
  reset();
  const loops = [];
  const g = makeGame({
    input: { enabled: true, reset() { this.wasReset = true; } },
    renderer: { setAnimationLoop: (f) => loops.push(f) },
    net: { detach() { this.detached = true; }, connect() { throw new Error('다시 붙으면 안 됨'); } },
  });
  g.watchOtherTabs();
  const fire = (e) => listeners.storage.forEach((f) => f(e));
  fire({ key: 'unico-gfx', newValue: '{}' });
  fire({ key: S.BAK_KEY, newValue: '{}' });
  assert.equal(S.saveBlocked(), false, '설정·백업 키는 무시');
  fire({ key: SAVE_KEY, newValue: saved() });
  assert.equal(S.saveBlocked(), true);
  assert.equal(g._stale, true);
  assert.equal(g.input.enabled, false);
  assert.ok(g.input.wasReset);
  assert.deepEqual(loops, [null], '루프 멈춤');
  assert.ok(g.net.detached);
  assert.doesNotThrow(() => g.net.connect(), '멈춘 창은 다시 접속하지 않음');
  assert.equal(g.save(), false, '자동 저장·떠날 때 저장도 막힘');
  assert.deepEqual(g.toasts, [], '막힌 저장은 실패 알림 없음');
  fire({ key: null, newValue: null });
  assert.deepEqual(loops, [null], '두 번 멈추지 않음');
});

test('초기화(clearSave): 기록과 백업을 지우고 떠날 때 저장을 막음 (보관본은 남김)', () => {
  reset();
  const g = makeGame();
  S.saveGame(g);
  store.set(BAK_KEY, 'b');
  store.set(BROKEN_KEY, 'x');
  S.clearSave();
  assert.equal(store.get(SAVE_KEY), undefined);
  assert.equal(store.get(BAK_KEY), undefined);
  assert.equal(store.get(BROKEN_KEY), 'x');
  assert.equal(S.saveGame(g), false);
  assert.equal(S.loadSaveInfo().status, 'empty');
});

test('백업·일부 실패 안내는 닫을 때까지 남는 작은 창으로 (창을 열 수 있으면)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  reset();
  store.set(SAVE_KEY, '{"v":1');
  store.set(BAK_KEY, saved({ world: { day: 5 } }));
  const made = [];
  const keepDoc = globalThis.document;
  globalThis.document = { createElement: (tag) => ({ tag, dataset: {}, style: {}, textContent: '' }) };
  try {
    const panel = { dataset: {}, kids: [], append(...n) { this.kids.push(...n); } };
    const g = makeGame();
    g.ui = { toast: (x) => g.toasts.push(x), openPanel: (title) => { made.push(title); return panel; }, closePanel() { this.closed = true; } };
    g.restore();
    showAll(t, g);
    assert.deepEqual(g.toasts, []);
    assert.deepEqual(made, ['💾 백업에서 불러왔어요']);
    assert.match(panel.kids[0].textContent, /최근 백업\(5일차\)/);
    panel.kids[1].onclick();
    assert.ok(g.ui.closed, '[확인] 으로 닫음');
  } finally { globalThis.document = keepDoc; }
});

test('치명 오류 직전 저장 뒤 다음 부팅은 .bak(오류 전 기록)을 덮지 않음 · 한동안 오류 없이 놀면 표시를 지움', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  reset();
  const good = saved({ economy: { money: 300 } });
  store.set(SAVE_KEY, good);
  const g = makeGame();
  g.economy.money = 999;
  assert.equal(S.saveGame(g, { crash: true }), true);
  assert.equal(store.get(BAK_KEY), good);
  assert.equal(store.get(CRASH_MARK), '1');
  // 다음 부팅: 오류 직전 기록은 읽히지만 .bak 은 오류 전 기록 그대로
  const g2 = makeGame();
  g2.restore();
  assert.equal(g2.economy.money, 999);
  assert.equal(store.get(BAK_KEY), good, '오류 직전 기록이 백업을 덮지 않음');
  assert.equal(g2.save(), true);
  assert.equal(store.get(CRASH_MARK), '1', '바로 지우지 않음');
  t.mock.timers.tick(30_000);
  g2._lastBadAt = Date.now(); // 또 오류
  t.mock.timers.tick(40_000);
  g2.save();
  assert.equal(store.get(CRASH_MARK), '1', '최근 60초 안에 오류가 있으면 그대로');
  t.mock.timers.tick(61_000);
  g2.save();
  assert.equal(store.get(CRASH_MARK), undefined, '오류 없이 60초 놀았으면 지움');
  // 그다음 부팅은 다시 깨끗한 기록을 백업으로
  makeGame().restore();
  assert.equal(store.get(BAK_KEY), store.get(SAVE_KEY));
  // 초기화하면 표시도 지움
  store.set(CRASH_MARK, '1');
  S.clearSave();
  assert.equal(store.get(CRASH_MARK), undefined);
});

test('인트로 전 저장은 하지 않으니 false (치명 오류 안내가 \'저장해 두었어요\' 라고 하지 않게)', () => {
  reset();
  const g = makeGame({ _introPending: true });
  assert.equal(g.save(), false);
  assert.equal(store.get(SAVE_KEY), undefined);
  assert.deepEqual(g.toasts, [], '실패 알림도 없음');
});

test('저장 실패 알림은 까닭마다 한 번 (공간 부족 뒤 회복했다가 다른 까닭으로 실패해도 알림)', () => {
  reset();
  const g = makeGame();
  failSet = (k) => (k === SAVE_KEY ? quota() : null);
  g.save();
  failSet = null;
  g.save();
  failSet = (k) => (k === SAVE_KEY ? Object.assign(new Error('막힘'), { name: 'SecurityError' }) : null);
  g.save(); g.save();
  failSet = (k) => (k === SAVE_KEY ? quota() : null);
  g.save();
  failSet = null;
  g.save();
  assert.deepEqual(g.toasts, [
    '⚠️ 저장 공간이 부족해 농장을 저장하지 못했어요', '💾 이제 다시 저장돼요',
    '⚠️ 이 브라우저 설정(사생활 보호 모드 등)에서는 농장을 저장할 수 없어요', '💾 이제 다시 저장돼요',
  ]);
});

test('[여기서 이어 하기]: 표시를 남기고 새로고침 → 그 창은 넘겨받았다고 알려 다른 창을 먼저 멈춤 · 다른 창의 마지막 저장은 잠깐 무시', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 5_000_000 });
  reset();
  for (const k of Object.keys(listeners)) delete listeners[k];
  const fire = (e) => (listeners.storage || []).forEach((f) => f(e));
  const keep = [globalThis.location, globalThis.document];
  let reloaded = 0;
  globalThis.location = { reload: () => reloaded++ };
  // 멈춘 창 A: [여기서 이어 하기]
  const overlay = [];
  const doc = { body: { append: (n) => overlay.push(n) }, getElementById: () => null, createElement: (tag) => ({ tag, style: {}, setAttribute() {}, append() {}, querySelector: () => null }) };
  globalThis.document = doc;
  try {
    const stub = { input: { enabled: true }, renderer: { setAnimationLoop() {} } };
    const a = makeGame(stub);
    a.goStale('other');
    // 단추를 찾아 누름: 만든 요소 중 onclick 이 있는 것
    const made = [];
    doc.createElement = (tag) => { const n = { tag, style: {}, setAttribute() {}, append() {}, querySelector: () => null }; made.push(n); return n; };
    a._stale = false;
    a.goStale('other');
    const btn = made.find((n) => n.tag === 'button' && /여기서 이어 하기/.test(n.textContent));
    btn.onclick();
    assert.equal(sstore.get(TAKEOVER_KEY), '1');
    assert.equal(reloaded, 1);
    assert.ok(made.some((n) => n.textContent === '이 창은 닫아도 괜찮아요'), '닫아도 된다는 안내');
    // 새로고침한 창 B: 불러오며 넘겨받음
    S.setReadOnly(false);
    store.set(SAVE_KEY, saved());
    const b = makeGame(stub);
    b.watchOtherTabs();
    b.restore();
    assert.equal(sstore.get(TAKEOVER_KEY), undefined, '표시는 한 번만');
    assert.ok(store.get(OWNER_KEY), '넘겨받았다고 기록');
    // A 가 멈추기 직전에 쓴 저장은 무시 (B 가 다시 멈추지 않게)
    fire({ key: SAVE_KEY, newValue: saved() });
    assert.notEqual(b._stale, true);
    // 시간이 지나면 다시 다른 창 저장에 멈춤
    t.mock.timers.tick(6000);
    fire({ key: SAVE_KEY, newValue: saved() });
    assert.equal(b._stale, true);
    // 다른 창 C 가 넘겨받으면 (owner 키) 지금 창은 멈춤
    S.setReadOnly(false);
    const c = makeGame(stub);
    c.watchOtherTabs();
    listeners.storage.at(-1)({ key: OWNER_KEY, newValue: '{"id":"x"}' }); // C 의 듣기만
    assert.equal(c._stale, true);
  } finally {
    [globalThis.location, globalThis.document] = keep;
  }
});

test.after(() => { console.warn = quiet; });


test('일부 불러오기 실패 + 원본 보관 공간 부족: 자동 저장은 원본을 덮지 않음', () => {
  reset(); const raw = saved({ ranch: { animals: ['소'] } }); store.set(SAVE_KEY, raw);
  failSet = (k) => k.startsWith(BROKEN_KEY) ? quota() : null;
  const g = makeGame(); g.ranch.load = () => { throw new Error('목장 오류'); };
  g.restore();
  assert.equal(S.saveBlocked(), true);
  failSet = null;
  assert.equal(g.save(), false);
  assert.equal(store.get(SAVE_KEY), raw);
});

test('손상된 원본 보관 실패 + 읽을 수 있는 백업: 백업으로 놀더라도 원본 덮어쓰기 금지', () => {
  reset(); const raw = '{broken'; store.set(SAVE_KEY, raw); store.set(BAK_KEY, saved());
  failSet = (k) => k.startsWith(BROKEN_KEY) ? quota() : null;
  const g = makeGame(); g.restore();
  assert.equal(g.economy.money, 777);
  assert.equal(S.saveBlocked(), true);
  failSet = null; assert.equal(g.save(), false);
  assert.equal(store.get(SAVE_KEY), raw);
});

test('칭호: 주민 칭호 다음에 KOAT 투어 칭호를 달았으면 다시 불러와도 KOAT 칭호', async () => {
  // 준비: 주민 칭호를 먼저 받고(flags.title), KOAT 데스크가 player.setTitle 로 투어 칭호를 닮
  reset();
  const { TOUR_REWARD } = await import('../src/game/sim/koat.js');
  const g = makeGame({ _introPending: false });
  g.flags = { intro: true, titles: ['꼬마 토끼의 단짝'], title: '꼬마 토끼의 단짝' };
  g.player.title = TOUR_REWARD.title;
  g.koat.book.rewarded = true;
  // 실행: 저장 → 새 창에서 불러오기
  assert.equal(g.save(), true);
  let shown = null;
  const h = makeGame();
  h.koat.got = undefined; h.koat.load = function (d) { this.got = d; this.book = { rewarded: true }; };
  h.player.setTitle = (t) => { shown = t; };
  h.restore();
  // 확인
  assert.equal(shown, TOUR_REWARD.title);
});
