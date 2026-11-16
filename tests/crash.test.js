// 오류 기록 (src/game/crash.js): 같은 메시지 묶기·최근 20건·저장소가 고장 나도 안전·프레임 오류 세기·창 오류 듣기
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
let broken = false;
globalThis.localStorage = {
  getItem: (k) => { if (broken) throw new Error('SecurityError'); return store.get(k) ?? null; },
  setItem: (k, v) => { if (broken) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
  removeItem: (k) => store.delete(k),
};
/** 새 모듈 (이번 접속 기록이 비어 있는 상태) */
const fresh = (tag) => import(`../src/game/crash.js?${tag}`);

test('같은 메시지는 한 건으로 묶고 횟수만 올림 · 처음 볼 때만 true (다시 알리기는 한 번)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  store.clear();
  const C = await fresh('dedupe');
  const e = new Error('밭이 없어요');
  assert.equal(C.record(e, 'logic'), true);
  assert.equal(C.record(e, 'logic'), false);
  assert.equal(C.sessionCrashes()[0].n, 2);
  assert.equal(C.readCrashes()[0].n, 1, '매 프레임 같은 오류: 저장은 2초에 한 번만');
  t.mock.timers.tick(2001);
  C.record(e, 'logic');
  assert.equal(C.readCrashes().length, 1);
  assert.equal(C.readCrashes()[0].n, 3);
  assert.equal(C.record(e, 'render'), true, '다른 곳의 같은 메시지는 따로');
  const c = C.readCrashes()[0];
  assert.deepEqual(Object.keys(c).sort(), ['build', 'msg', 'n', 'q', 'stack', 't', 'ua', 'where'], '닉네임·채팅 칸 없음');
  assert.ok(c.stack.length > 0 && c.stack.length <= 6, '스택은 6줄까지');
  assert.equal(c.build, 'dev', '개발·시험에는 빌드 meta 없음');
});

test('최근 20건만 (오래된 것부터 버림) · 지난 접속의 같은 메시지는 횟수를 이어 셈', async () => {
  store.clear();
  const C = await fresh('ring');
  for (let i = 0; i < 25; i++) C.record(new Error(`오류 ${i}`), 'logic');
  const list = C.readCrashes();
  assert.equal(list.length, 20);
  assert.equal(list[0].msg, '오류 5');
  assert.equal(list.at(-1).msg, '오류 24');
  const C2 = await fresh('ring2'); // 다음 접속
  C2.record(new Error('오류 24'), 'logic');
  assert.equal(C2.readCrashes().at(-1).n, 2);
  assert.equal(C2.readCrashes().length, 20);
  assert.ok(C.record(new Error('x'.repeat(900)), 'logic'));
  assert.equal(C.readCrashes().at(-1).msg.length, 300, '긴 메시지는 자름');
});

test('저장소가 막혀도(읽기·쓰기 오류) 던지지 않고 이번 접속 기록에는 남음', async () => {
  store.clear();
  const C = await fresh('broken');
  broken = true;
  try {
    assert.doesNotThrow(() => C.record(new Error('저장소 없음'), 'window'));
    assert.deepEqual(C.readCrashes(), []);
    assert.equal(C.sessionCrashes().length, 1);
    assert.match(C.diagText(), /저장소 없음/, '진단 정보는 이번 접속 기록으로');
  } finally { broken = false; }
  store.set(C.CRASH_KEY, '{망가짐');
  assert.deepEqual(C.readCrashes(), [], '망가진 기록은 빈 목록');
  C.record('문자열 오류', 'promise');
  assert.equal(C.readCrashes().at(-1).msg, '문자열 오류');
});

test('진단 정보: 빌드·기기·화질·오류 목록 (화질은 setCrashContext 로)', async () => {
  store.clear();
  const C = await fresh('diag');
  C.setCrashContext(() => ({ q: 'low' }));
  C.record(new Error('그리기 실패'), 'render');
  const txt = C.diagText();
  assert.match(txt, /빌드: dev/);
  assert.match(txt, /화질: low/);
  assert.match(txt, /\[render\] 그리기 실패/);
  assert.equal(C.readCrashes()[0].q, 'low');
  C.setCrashContext(() => { throw new Error('아직 없음'); });
  assert.doesNotThrow(() => C.record(new Error('상태를 못 읽음'), 'logic'));
  assert.equal(C.showOverlay({ id: 'x', title: 't' }), null, '문서가 없으면(시험) 아무것도 안 함');
});

test('프레임 오류 세기: 가끔은 넘기고, 10초 안에 5번이거나 60프레임 연속이면 멈춤', async () => {
  const { FailGate } = await fresh('gate');
  const g = new FailGate();
  let t = 0;
  for (let i = 0; i < 4; i++) assert.equal(g.frame(true, (t += 16)), false);
  assert.equal(g.frame(true, (t += 16)), true, '5번째');
  const g2 = new FailGate();
  t = 0;
  for (let i = 0; i < 20; i++) { assert.equal(g2.frame(true, (t += 3000)), false, '3초에 한 번은 넘김'); g2.frame(false, t + 16); }
  const g3 = new FailGate(1000, 10000, 60); // 횟수 한도는 크게: 연속 한도만 보기
  t = 0;
  for (let i = 0; i < 59; i++) assert.equal(g3.frame(true, (t += 16)), false);
  assert.equal(g3.frame(true, (t += 16)), true, '60프레임 연속');
  g3.frame(false, t);
  assert.equal(g3.run, 0, '성공한 프레임이면 연속은 다시 0');
});

test('창 오류 듣기: error·unhandledrejection 을 기록, 다시 알린 오류(__unicoSeen)는 두 번 세지 않음, 부팅 전 오류는 안내', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  store.clear();
  const C = await fresh('win');
  const on = {};
  const win = { addEventListener: (k, f) => { on[k] = f; } };
  C.installCrashHandlers(win);
  C.installCrashHandlers(win); // 두 번 불러도 한 번만
  assert.equal(typeof on.error, 'function');
  win.__unicoBooted = true;
  on.error({ error: new Error('클릭 처리 실패') });
  on.unhandledrejection({ reason: new Error('약속 실패') });
  const seen = new Error('이미 기록함');
  seen.__unicoSeen = true;
  on.error({ error: seen });
  assert.deepEqual(C.readCrashes().map((c) => `${c.where}:${c.msg}`), ['window:클릭 처리 실패', 'promise:약속 실패']);
  assert.equal(win.__unicoCrashes.length, 2, '화면 점검용 목록');
  win.__unicoCrash('E-NET', new Error('모델 못 받음'));
  assert.equal(C.readCrashes().at(-1).where, 'E-NET');
  win.__unicoBooted = false; // 모듈을 읽다가 난 오류: 부팅 함수가 못 돌았으므로 안내 (문서가 없으면 조용히)
  on.error({ message: 'Script error.' });
  assert.doesNotThrow(() => t.mock.timers.tick(4000));
});

test('다시 알리기: reportError 가 있으면 그것으로, 없으면 다음 차례에 던짐 (표시를 남겨 두 번 세지 않음)', async (t) => {
  const C = await fresh('rethrow');
  const got = [];
  const keep = globalThis.reportError;
  globalThis.reportError = (e) => got.push(e);
  try {
    const e = new Error('한 번만');
    C.rethrowLater(e);
    assert.deepEqual(got, [e]);
    assert.equal(e.__unicoSeen, true);
  } finally {
    if (keep) globalThis.reportError = keep; else delete globalThis.reportError;
  }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const e2 = new Error('다음 차례');
  C.rethrowLater(e2);
  assert.throws(() => t.mock.timers.tick(1), /다음 차례/);
});
