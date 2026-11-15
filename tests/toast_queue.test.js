// 알림 차례: 보여 주는 시간·같은 열쇠 합치기(×N·합계)·넘칠 때 밀어내는 차례·좁은 화면 3장 (화면 없이)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToastQueue, toastMs, toastCap, inferType, NARROW_Q, ToastUI } from '../src/ui/toast.js';
import { RULES, mediaMatches } from './lib/css_env.js';

test('보여 주는 시간: 2.2초 + 글자당 0.055초, 2.8~7초, 오토플레이 중 보상은 2.8초', () => {
  assert.equal(toastMs('짧음'), 2800);
  const mid = '가'.repeat(40);
  assert.equal(toastMs(mid), 2200 + 55 * 40);
  assert.equal(toastMs('가'.repeat(200)), 7000);
  // 그림 글자 하나는 한 글자로 셈 (UTF-16 길이가 아님)
  assert.equal(toastMs('🥕'.repeat(20)), toastMs('가'.repeat(20)));
  assert.equal(toastMs(mid, { type: 'reward', autoplay: true }), 2800);
  assert.equal(toastMs(mid, { type: 'info', autoplay: true }), 2200 + 55 * 40, '보상만 짧게');
  assert.equal(toastMs(mid, { ms: 1234 }), 1234, '직접 정하면 그대로');
  // 예전 고정 3.2초보다 긴 안내는 더 오래 (품질 팁 길이)
  assert.ok(toastMs('💡 물이 마르지 않게, 잡초 없이, 퇴비까지 주면 ⭐⭐⭐ 특상품이 나와요 (수확량 +1, 물을 안 주면 -1)') > 5000);
});

test('같은 열쇠는 한 장으로: 같은 글은 ×N, 금액은 합계, 시간은 다시 처음부터', () => {
  const q = new ToastQueue();
  const a = q.push('🥕 당근을 수확했어요', { type: 'reward', key: 'harvest' });
  assert.equal(a.merged, false);
  const b = q.push('🥕 당근을 수확했어요', { type: 'reward', key: 'harvest' });
  assert.equal(b.merged, true);
  assert.equal(b.entry, a.entry);
  assert.equal(b.entry.text, '🥕 당근을 수확했어요 ×2');
  assert.equal(q.live.length, 1);
  // 열쇠가 같아도 글이 바뀌면 새 글 (×N 없이)
  q.push('🥔 감자를 수확했어요', { type: 'reward', key: 'harvest' });
  assert.equal(a.entry.text, '🥔 감자를 수확했어요');
  // 금액 합계 + 글 다시 쓰기
  const fmt = ({ amount, count }) => `💰 +${amount} 코인 (${count}번)`;
  q.push('💰 +120 코인', { type: 'reward', key: 'sell', amount: 120, fmt });
  const s = q.push('💰 +80 코인', { type: 'reward', key: 'sell', amount: 80, fmt });
  assert.equal(s.entry.text, '💰 +200 코인 (2번)');
  assert.equal(s.entry.n, 1, 'fmt 가 있으면 ×N 을 붙이지 않음');
  // 열쇠가 없어도 같은 종류·같은 글이 연달아 오면 합침, 다른 글은 따로
  const q2 = new ToastQueue();
  q2.push('씨앗이 없어요');
  const r = q2.push('씨앗이 없어요');
  assert.equal(r.merged, true);
  assert.equal(r.entry.text, '씨앗이 없어요 ×2');
  q2.push('사료가 없어요');
  assert.equal(q2.live.length, 2);
  // 합친 장은 글이 길어진 만큼 다시 잼
  assert.equal(r.entry.ms, toastMs('씨앗이 없어요 ×2'));
});

test('넘치면 보통 < 보상 < 경고·팁 차례로, 같은 단계면 오래된 것부터 밀려남', () => {
  const q = new ToastQueue();
  const warn = q.push('⚠️ 방이 가득 찼어요', { type: 'warn' }).entry;
  const tip = q.push('💡 팁', { type: 'tip' }).entry;
  const i1 = q.push('보통 1').entry;
  const r1 = q.push('보상 1', { type: 'reward' }).entry;
  const r = q.push('보통 2');
  assert.deepEqual(r.evicted, [i1], '가장 오래된 보통 알림');
  assert.ok(q.live.includes(warn) && q.live.includes(tip));
  const r2 = q.push('보통 3');
  assert.equal(r2.evicted[0].base, '보통 2', '보상보다 보통 알림이 먼저 (오래된 보통)');
  assert.ok(q.live.includes(r1));
  // 보통이 방금 온 것뿐이면: 보상을 지키고 방금 온 보통이 밀려남
  const q5 = new ToastQueue();
  const keep = ['보상 a', '보상 b', '보상 c', '보상 d'].map((t) => q5.push(t, { type: 'reward' }).entry);
  const lone = q5.push('보통');
  assert.deepEqual(lone.evicted, [lone.entry]);
  assert.ok(keep.every((e) => q5.live.includes(e)));
  // 합친 장은 방금 온 것으로 → 밀려날 차례가 뒤로
  const q3 = new ToastQueue();
  const a = q3.push('가').entry; q3.push('나'); q3.push('다'); q3.push('라');
  q3.push('가'); // a 를 다시 → 가장 새것
  const ev = q3.push('마').evicted;
  assert.notEqual(ev[0], a);
  assert.equal(ev[0].base, '나');
  // 경고·팁만 가득하면: 새로 온 보통 알림이 밀려남 (경고는 지킴)
  const q4 = new ToastQueue();
  for (let i = 0; i < 4; i++) q4.push(`⚠️ 경고 ${i}`, { type: 'warn' });
  const late = q4.push('보통');
  assert.deepEqual(late.evicted, [late.entry]);
  assert.equal(q4.live.filter((e) => e.type === 'warn').length, 4);
  // 새 경고가 오면 가장 오래된 경고가 비킴
  const w5 = q4.push('⚠️ 경고 5', { type: 'warn' });
  assert.equal(w5.evicted[0].base, '⚠️ 경고 0');
});

test('좁은 화면은 3장: 10개를 한꺼번에 띄워도 3장 이하, 같은 열쇠는 ×N', () => {
  assert.equal(toastCap(true), 3);
  assert.equal(toastCap(false), 4);
  // 미디어 조건: 세로 폰(390)·480 이하·가로 폰은 좁음, 태블릿·데스크톱은 아님
  const narrow = (env) => mediaMatches(`@media ${NARROW_Q}`, env);
  assert.equal(narrow({ w: 412, h: 839, coarse: true }), true);
  assert.equal(narrow({ w: 480, h: 900, coarse: true }), true);
  assert.equal(narrow({ w: 844, h: 390, coarse: true }), true);
  assert.equal(narrow({ w: 820, h: 1180, coarse: true }), false);
  assert.equal(narrow({ w: 1280, h: 800, coarse: false }), false);
  const q = new ToastQueue();
  const opt = { cap: 3 };
  for (let i = 0; i < 4; i++) q.push('🥕 당근을 수확했어요', { type: 'reward', key: 'harvest' }, opt);
  for (let i = 0; i < 3; i++) q.push('💰 +120 코인', { type: 'reward', key: 'sell', amount: 120, fmt: ({ amount }) => `💰 +${amount} 코인` }, opt);
  q.push('🐦 까마귀가 밭에 내려앉았어요!', { type: 'warn' }, opt);
  q.push('🎉 퀘스트 완료: 첫 밭 갈기', {}, opt);
  q.push('⭐ 농사 기술이 2레벨이 됐어요', {}, opt);
  assert.ok(q.live.length <= 3);
  assert.ok(q.live.some((e) => e.type === 'warn'), '경고는 남음');
  assert.ok(q.live.some((e) => e.text === '💰 +360 코인'), '합친 판매 코인(보상)은 나중에 온 보통 알림보다 오래 남음');
  assert.ok(!q.live.some((e) => e.base.startsWith('⭐')), '보통 알림(기술 레벨)이 먼저 비킴');
  // 좁은 화면에 팁 카드가 떠 있으면 2장
  assert.equal(toastCap(true, true), 2);
  assert.equal(toastCap(false, true), 4);
  // 합친 장은 밀려나기 전까지 ×N·합계로 보였음
  const q2 = new ToastQueue();
  for (let i = 0; i < 4; i++) q2.push('🥕 당근을 수확했어요', { type: 'reward', key: 'harvest' }, opt);
  for (let i = 0; i < 3; i++) q2.push('💰 +120 코인', { type: 'reward', key: 'sell', amount: 120, fmt: ({ amount }) => `💰 +${amount} 코인` }, opt);
  assert.deepEqual(q2.live.map((e) => e.text), ['🥕 당근을 수확했어요 ×4', '💰 +360 코인']);
});

test('종류를 안 정한 예전 알림은 맨 앞 그림·코인 글로 종류를 짐작', () => {
  assert.equal(inferType('⚠️ 모든 방이 가득 찼어요'), 'warn');
  assert.equal(inferType('🚫 여기에는 놓을 수 없어요'), 'warn');
  assert.equal(inferType('💡 물이 마르지 않게'), 'tip');
  assert.equal(inferType('🎁 +50 코인, +10 XP'), 'reward');
  assert.equal(inferType('📦 마을 가게에 당근 3개 납품! +120 코인'), 'reward');
  assert.equal(inferType('🌬️ 풍차 방앗간 임대 수입 +40🪙'), 'reward');
  assert.equal(inferType('씨앗이 없어요. 장터에서 씨앗을 구매하세요 🛒'), 'info');
  assert.equal(inferType('🎣 붕어를 낚았다!'), 'info');
  // 직접 정하면 짐작하지 않음
  const q = new ToastQueue();
  assert.equal(q.push('⚠️ 글', { type: 'info' }).entry.type, 'info');
  assert.equal(q.push('⚠️ 다른 글').entry.type, 'warn');
});

// ---- 화면 쪽 (가짜 DOM): 글만 넘겨도 되고, 나갈 때 .out 뒤 지움, 예전 3.2초 고정 타이머 없음
function fakeEl(tag) {
  const el = {
    tagName: tag, children: [], className: '', textContent: '', parent: null, listeners: {},
    classList: {
      add(c) { const s = new Set(el.className.split(/\s+/).filter(Boolean)); s.add(c); el.className = [...s].join(' '); },
      contains(c) { return el.className.split(/\s+/).includes(c); },
    },
    append(...k) { for (const c of k) { c.parent = el; el.children.push(c); } },
    get firstChild() { return el.children[0]; },
    get lastChild() { return el.children.at(-1); },
    remove() { const p = el.parent; if (p) p.children.splice(p.children.indexOf(el), 1); el.parent = null; },
    addEventListener(t, f) { (el.listeners[t] ||= []).push(f); },
  };
  return el;
}

test('ui.toast(글) 은 예전처럼 동작하고, 시간이 다 되면 .out 을 붙였다가 지움', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const origDoc = globalThis.document;
  globalThis.document = { createElement: (tag) => fakeEl(tag) };
  try {
    const ui = { ...ToastUI, root: fakeEl('div'), game: { autoplay: { on: false } } };
    ui.toasts = fakeEl('div');
    const msg = '🥕 당근 3개를 수확했어요! 장터에 팔면 코인을 받아요';
    ui.toast(msg);
    assert.equal(ui.toasts.children.length, 1);
    const el = ui.toasts.children[0];
    assert.equal(el.className, 'toast info');
    assert.equal(el.children[0].textContent, '🥕', '맨 앞 그림은 그림 칸으로');
    assert.equal(el.children[1].textContent, msg.slice('🥕 '.length));
    ui.toast(msg);
    assert.equal(ui.toasts.children.length, 1, '같은 글은 한 장');
    assert.equal(el.lastChild.textContent, ' ×2');
    const ms = toastMs(`${msg} ×2`);
    assert.ok(ms > 3200);
    t.mock.timers.tick(3200);
    assert.equal(el.parent, ui.toasts, '3.2초에 사라지지 않음 (글 길이만큼)');
    t.mock.timers.tick(ms - 3200);
    assert.ok(el.className.includes('out'), '나가는 중');
    assert.equal(ui._toastQ.live.length, 0);
    el.listeners.animationend[0]({ target: el });
    assert.equal(el.parent, null, '나가는 애니메이션이 끝나면 지움');
    // 종류·열쇠
    ui.toast('💰 +120 코인', { type: 'reward', key: 'sell', amount: 120, fmt: ({ amount }) => `💰 +${amount} 코인` });
    ui.toast('💰 +30 코인', { type: 'reward', key: 'sell', amount: 30 });
    const s = ui.toasts.children.at(-1);
    assert.equal(s.className, 'toast reward');
    assert.equal(s.children[0].textContent, '💰');
    assert.equal(s.children[1].textContent, '+150 코인');
    // 그림이 없는 글은 종류별 그림
    ui.toast('씨앗이 없어요');
    assert.equal(ui.toasts.children.at(-1).children[0].textContent, '🔔');
    assert.equal(s.lastChild.textContent, '');
  } finally {
    globalThis.document = origDoc;
    t.mock.timers.reset();
  }
});

test('toast.css: 3.2초 고정 애니메이션이 없고, 들어오기 0.22초·나가기 0.26초', () => {
  const toast = RULES.filter((r) => r.media.length === 0 && r.sel === '.toast').flatMap((r) => r.decls).find(([p]) => p === 'animation');
  assert.match(toast[1], /^toast-in 0\.22s/);
  const out = RULES.find((r) => r.sel === '.toast.out').decls.find(([p]) => p === 'animation');
  assert.match(out[1], /^toast-out 0\.26s/);
  assert.ok(!RULES.some((r) => r.decls.some(([p, v]) => p === 'animation' && /3\.2s/.test(v))));
});

test('알림 자리: 데스크톱·가로 폰은 오른쪽 미니맵 아래(캐릭터를 가리지 않음), 세로 폰은 목표 칩 아래 가운데, 장마다 같은 폭', async () => {
  const { value, PHONE, LAND, DESK } = await import('./lib/css_env.js');
  assert.match(value(DESK, '.toasts', 'top'), /\+ 176px\)$/);
  assert.match(value(DESK, '.toasts', 'right'), /12px/);
  assert.equal(value(DESK, '.toasts', 'align-items'), 'flex-end');
  assert.equal(value(DESK, '.toasts', 'transform'), undefined);
  assert.equal(value(LAND, '.toasts', 'align-items'), 'flex-end');
  assert.match(value(LAND, '.toasts', 'top'), /^max\(/, '팁 카드가 떠 있으면 그 아래로');
  assert.match(value(LAND, '.toasts', 'max-height'), /40d?vh/);
  assert.equal(value(PHONE, '.toasts', 'align-items'), 'center');
  assert.equal(value(PHONE, '.toasts', 'left'), '50%');
  for (const env of [DESK, PHONE, LAND]) {
    assert.match(value(env, '.toast', 'min-width'), /^min\(/, '같은 폭');
    assert.equal(value(env, '.toast', 'text-align'), 'left');
  }
  assert.equal(value(DESK, '.toast .ic', 'flex'), 'none');
  assert.equal(value(DESK, '.tip-tx', 'text-wrap'), 'pretty', '끝줄에 낱말 하나만 남지 않게');
});
