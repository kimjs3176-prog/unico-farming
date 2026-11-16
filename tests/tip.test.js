// 한 번만 뜨는 팁: 한 번만·예전 표시(qualityTip·swimTip) 옮기기·바쁠 때 기다리기·15초 뒤 저절로 닫힘 (화면 없이)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TipQueue, TipUI, tipStore, tipBusy, splitIcon, TIP_MS, TIP_DELAY_MS, TIP_WAIT_MS } from '../src/ui/tip.js';
import { ToastUI } from '../src/ui/toast.js';

const run = (q, ms, busy = false, step = 250) => { const acts = []; for (let t = 0; t < ms; t += step) { const a = q.tick(step, busy); if (a) acts.push(a); } return acts; };

test('한 번만: 띄우는 순간 본 것으로 적고, 다음 부탁은 false', () => {
  const flags = {};
  const q = new TipQueue(() => flags);
  assert.equal(q.request('quality', '💡 물이 마르지 않게'), true);
  assert.equal(flags.tips?.quality, undefined, '부탁만으로는 본 것이 아님');
  assert.deepEqual(run(q, TIP_DELAY_MS + 250), ['show']);
  assert.equal(flags.tips.quality, true);
  assert.equal(flags.qualityTip, true, '예전 표시를 보는 곳도 같은 답');
  assert.equal(q.request('quality', '또'), false);
  // 저장을 다시 불러와도 (flags 가 새 객체) 본 기록을 따라감
  const loaded = { tips: { swim: true } };
  const q2 = new TipQueue(() => loaded);
  assert.equal(q2.request('swim', '🏊'), false);
  assert.equal(q2.request('crow', '🐦'), true);
});

test('예전 표시 qualityTip·swimTip 은 본 팁으로 옮김', () => {
  const flags = { qualityTip: true, swimTip: true };
  assert.deepEqual(tipStore(flags), { quality: true, swim: true });
  const q = new TipQueue(() => ({ swimTip: true }));
  assert.equal(q.request('swim', '🏊 첨벙!'), false);
  assert.equal(q.request('quality', '💡'), true);
});

test('바쁜 동안(컷신·대화·창·미니게임·오토플레이·낚시·스마트팜)은 기다렸다가 띄움, 너무 오래 못 띄우면 버림', () => {
  const flags = {};
  const q = new TipQueue(() => flags);
  q.request('quality', '💡 팁');
  assert.deepEqual(run(q, 5000, true), [], '바쁠 때는 안 띄움');
  assert.equal(flags.tips?.quality, undefined, '안 띄웠으니 본 것도 아님');
  assert.deepEqual(run(q, 500, false), ['show']);
  // 기다리는 팁은 차례로 (먼저 온 팁이 밀려 사라지지 않음), 3개 넘으면 가장 오래된 것을 버림
  const q2 = new TipQueue(() => ({}));
  q2.request('a', 'A'); q2.request('b', 'B');
  run(q2, 1000, false);
  assert.equal(q2.cur.id, 'a');
  assert.equal(q2.pending.id, 'b');
  q2.dismiss();
  assert.deepEqual(run(q2, TIP_DELAY_MS - 300, false), [], '앞 카드가 닫히고 조금 뒤에');
  assert.deepEqual(run(q2, 500, false), ['show']);
  assert.equal(q2.cur.id, 'b');
  const q5 = new TipQueue(() => ({}));
  for (const id of ['a', 'b', 'c', 'd']) q5.request(id, id);
  assert.equal(q5.request('c', 'C2'), true, '같은 팁은 글만 새로');
  assert.deepEqual(q5.queue.map((x) => x.id + x.text), ['bb', 'cC2', 'dd']);
  // 2분 넘게 못 띄우면 버림 (본 것으로 적지 않으니 다음 기회에 다시)
  const f3 = {};
  const q3 = new TipQueue(() => f3);
  q3.request('crow', '🐦');
  run(q3, TIP_WAIT_MS + 1000, true, 1000);
  assert.equal(q3.pending, null);
  assert.equal(f3.tips?.crow, undefined);
  assert.equal(q3.request('crow', '🐦'), true);
});

test('15초 보이면 저절로 닫힘, 바빠서 숨은 동안은 시간이 멈춤, 알겠어요로 바로 닫힘', () => {
  const q = new TipQueue(() => ({}));
  q.request('quality', '💡 팁');
  run(q, TIP_DELAY_MS + 250);
  assert.ok(q.cur);
  assert.deepEqual(run(q, TIP_MS - 1000), []);
  assert.deepEqual(run(q, 2000, true), ['away'], '창이 열리면 잠깐 숨음');
  assert.deepEqual(run(q, 250), ['back']);
  assert.deepEqual(run(q, 1500), ['hide'], '숨은 2초는 세지 않음');
  assert.equal(q.cur, null);
  q.request('crow', '🐦 까마귀');
  run(q, 1000);
  assert.equal(q.dismiss(), true);
  assert.equal(q.cur, null);
});

test('tipBusy: 컷신·대화·창·오토플레이·낚시·스마트팜·양몰이·꾸미기·미니게임 중이면 바쁨, g.busy() 가 있으면 함께 봄', () => {
  const base = () => ({ cinema: { locked: false }, dialogue: { active: false }, ui: { panel: null, root: { querySelector: () => null } }, autoplay: { on: false }, nature: { fishing: null }, smartfarm: { active: false }, herding: { active: false }, decor: { mode: null }, ride: { driving: false } });
  assert.equal(tipBusy(base()), false);
  const cases = [
    (g) => { g.cinema.locked = true; }, (g) => { g.dialogue.active = true; }, (g) => { g.ui.panel = {}; }, (g) => { g.autoplay.on = true; },
    (g) => { g.nature.fishing = { phase: 'cast' }; }, (g) => { g.smartfarm.active = true; }, (g) => { g.herding.active = true; },
    (g) => { g.decor.mode = {}; }, (g) => { g.ui.root.querySelector = (s) => (s.includes('.mg-wrap') ? {} : null); }, (g) => { g.busy = () => true; },
  ];
  for (const f of cases) { const g = base(); f(g); assert.equal(tipBusy(g), true, String(f)); }
  const g = base(); g.busy = () => false;
  assert.equal(tipBusy(g), false);
  // 탈것은 자유롭게 돌아다니는 것이라 팁을 막지 않음
  const r = base(); r.ride.driving = true;
  assert.equal(tipBusy(r), false);
});

test('글 맨 앞 그림 글자는 카드 머리 그림으로', () => {
  assert.deepEqual(splitIcon('💡 물이 마르지 않게'), { icon: '💡', body: '물이 마르지 않게' });
  assert.deepEqual(splitIcon('🐦‍⬛ 까마귀'), { icon: '🐦‍⬛', body: '까마귀' });
  assert.deepEqual(splitIcon('⚠️ 조심'), { icon: '⚠️', body: '조심' });
  assert.deepEqual(splitIcon('그냥 글'), { icon: '💡', body: '그냥 글' });
});

// ---- 화면 쪽 (가짜 DOM): ui.tip 이 UI 에 붙어 있고, HUD 갱신에서 띄우고, 알림을 카드 아래로(--tip-h)
function fakeEl() {
  const kids = {};
  const el = {
    className: '', style: { setProperty(k, v) { el.style[k] = v; } }, attrs: {}, children: [],
    classList: {
      add(...c) { const s = new Set(el.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); el.className = [...s].join(' '); },
      remove(...c) { el.className = el.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
      contains(c) { return el.className.split(/\s+/).includes(c); },
      toggle(c, on) { if (on) el.classList.add(c); else el.classList.remove(c); },
    },
    setAttribute(k, v) { el.attrs[k] = v; },
    set innerHTML(v) { el._html = v; },
    querySelector(sel) { return sel.includes('.mg-') ? null : (kids[sel] ||= Object.assign(fakeEl(), { sel })); },
    addEventListener(t, f) { (el.on ||= {})[t] = f; },
    append(c) { el.children.push(c); },
    getBoundingClientRect: () => ({ height: 64 }),
    offsetWidth: 0,
  };
  return el;
}

test('ui.tip: 알림 메서드와 함께 UI 에 붙고, HUD 갱신에서 띄움 → 알림 자리를 비켜 줌', () => {
  const origDoc = globalThis.document, origGcs = globalThis.getComputedStyle;
  globalThis.document = { createElement: () => fakeEl() };
  globalThis.getComputedStyle = () => ({ zoom: '1' });
  try {
    assert.equal(typeof ToastUI.tip, 'function', 'toast.js 를 거쳐 UI.prototype 에 붙음');
    const game = { flags: {}, cinema: { locked: false }, dialogue: { active: true }, audio: { play() {} } };
    const ui = { ...TipUI, root: fakeEl(), game };
    game.ui = ui;
    ui.buildTip();
    assert.equal(ui.tip('quality', '💡 물이 마르지 않게'), true);
    ui.updateTip(1000);
    assert.ok(ui.tipEl.classList.contains('hidden'), '대화 중에는 안 뜸');
    game.dialogue.active = false;
    ui.updateTip(1000);
    assert.ok(!ui.tipEl.classList.contains('hidden'));
    assert.equal(ui.tipEl.querySelector('.tip-tx').textContent, '물이 마르지 않게');
    assert.equal(ui.tipEl.querySelector('.tip-ic').textContent, '💡');
    assert.equal(ui.root.style['--tip-h'], '72px');
    assert.ok(ui.root.classList.contains('tip-on'));
    assert.equal(game.flags.tips.quality, true);
    // 창이 열리면 숨고 알림 자리도 돌려줌
    ui.panel = {};
    ui.updateTip(250);
    assert.ok(ui.tipEl.classList.contains('away'));
    assert.equal(ui.root.style['--tip-h'], '0px');
    ui.panel = null;
    ui.updateTip(250);
    // 알겠어요
    ui.tipEl.querySelector('.tip-ok').on.click({ stopPropagation() {} });
    assert.ok(ui.tipEl.classList.contains('hidden'));
    assert.equal(ui.root.style['--tip-h'], '0px');
    assert.equal(ui.tip('quality', '또'), false);
  } finally {
    globalThis.document = origDoc;
    globalThis.getComputedStyle = origGcs;
  }
});
