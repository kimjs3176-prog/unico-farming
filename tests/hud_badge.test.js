// HUD 배지·지갑·달력: 경험치 고리 값, 계절 줄, 받을 퀘스트 보상, 코인 날리기(닿을 때마다 숫자가 오름)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HudUI, xpPct, claimableCount, seasonLine, coinCount, splitCoins, coinArc, COIN_SAFETY, COIN_STAGGER, COIN_FLIGHT, LV_CHEER_AT, LV_CARD_AFTER } from '../src/ui/hud.js';
import { RIBBON_MS } from '../src/ui/levelup.js';
import { Quests, QUESTS } from '../src/game/sim/quests.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('경험치 고리 %: 이번 레벨 시작점부터, 0~100', () => {
  const q = new Quests();
  assert.equal(xpPct(q), 0);
  q.xp = 50; assert.equal(xpPct(q), 50);
  q.xp = 100; assert.equal(q.level, 2); assert.equal(xpPct(q), 0);
  q.xp = 175; assert.equal(xpPct(q), 50);
  // updateHud 는 --xp 를 배지에 씀 (CSS 고리가 읽음)
  assert.match(read('src/ui/hud.js'), /put\('xpv', this\.badge, '--xp', String\(pct\)\)/);
});

test("달력 계절 줄: setSeason → '🌸 봄 1일' + 주 안 날짜 '1/7' (폰은 CSS 가 1/7 을 숨김)", () => {
  assert.equal(seasonLine('🌸', '봄', 1), '🌸 봄 1일');
  const s = { textContent: '' }, w = { textContent: '' };
  const ui = { ...HudUI, calendar: { querySelector: (q) => (q === '.cal-s' ? s : q === '.cal-w' ? w : null) } };
  ui.setSeason('🍁', '가을', 3);
  assert.equal(s.textContent, '🍁 가을 3일');
  assert.equal(w.textContent, '3/7');
  // 계절 화면은 글을 직접 쓰지 않고 setSeason 을 부름
  assert.match(read('src/game/view/season_view.js'), /ui\.setSeason\?\.\(this\.cur\.icon, this\.cur\.name, this\.cur\.dayIn\)/);
});

test('받을 퀘스트 보상: hasClaimable (☰ 메뉴 빨간 점용)', () => {
  const q = new Quests();
  const ui = { ...HudUI, game: { quests: q } };
  assert.equal(ui.hasClaimable(), false);
  const first = QUESTS[0];
  q.report(first.event, first.goal);
  assert.equal(claimableCount(q), 1);
  assert.equal(ui.hasClaimable(), true);
  q.claim(first.id);
  assert.equal(ui.hasClaimable(), false);
});

test('코인 개수: 15코인마다 하나, 높음 8개·낮음 4개까지, 나눈 합은 정확히 금액', () => {
  assert.equal(coinCount(5, false), 1);
  assert.equal(coinCount(45, false), 3);
  assert.equal(coinCount(1000, false), 8);
  assert.equal(coinCount(1000, true), 4);
  for (const [a, n] of [[45, 3], [100, 7], [7, 1], [1000, 4]]) {
    const p = splitCoins(a, n);
    assert.equal(p.length, n);
    assert.equal(p.reduce((x, y) => x + y, 0), a);
    assert.ok(Math.max(...p) - Math.min(...p) <= 1);
  }
});

function fakeDom() {
  const made = [];
  const el = () => {
    const e = { style: {}, className: '', innerHTML: '', classList: { add() {}, remove() {}, contains: () => false }, remove() { e.gone = true; }, getBoundingClientRect: () => ({ left: 10, top: 10, width: 60, height: 24, right: 70 }), closest: () => null, offsetWidth: 1 };
    made.push(e);
    return e;
  };
  const prev = { document: globalThis.document, raf: globalThis.requestAnimationFrame, iw: globalThis.innerWidth, ih: globalThis.innerHeight };
  globalThis.document = { hidden: false, body: { append() {} }, createElement: el };
  globalThis.requestAnimationFrame = (f) => f();
  globalThis.innerWidth = 800; globalThis.innerHeight = 600;
  return { made, el, restore() { Object.assign(globalThis, { document: prev.document, requestAnimationFrame: prev.raf, innerWidth: prev.iw, innerHeight: prev.ih }); if (!prev.document) delete globalThis.document; } };
}

test('코인 날리기: 날아오는 동안 HUD 는 그만큼 덜 보여 주고, 하나 닿을 때마다 풀고 소리가 반음씩 올라감', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dom = fakeDom();
  try {
    const sounds = [];
    const money = dom.el();
    const ui = { ...HudUI, panel: null, coinTarget: { querySelector: () => money }, game: { quality: { level: 'high' }, economy: { money: 545 }, audio: { play: (n, v, o) => sounds.push([n, o?.freq]) } } };
    ui.flyToCoin(45, { left: 100, top: 300, width: 40, height: 20 });
    assert.equal(ui.coinHold, 45, '처음엔 45 를 붙잡아 둠');
    const step = (ms) => { for (let k = 0; k < ms; k += 5) t.mock.timers.tick(5); };
    step(COIN_FLIGHT + 5);
    assert.equal(ui.coinHold, 30, '첫 코인이 닿으면 15 풀림');
    step(COIN_STAGGER * 2);
    assert.equal(ui.coinHold, 0);
    assert.equal(sounds.length, 3);
    assert.ok(sounds.every(([n]) => n === 'coin'));
    assert.ok(sounds[1][1] > sounds[0][1] && sounds[2][1] > sounds[1][1], '반음씩 높아짐');
    t.mock.timers.tick(COIN_SAFETY);
    assert.equal(ui.coinHold, 0, '안전 시간에 두 번 풀지 않음');
  } finally { dom.restore(); t.mock.timers.reset(); }
});

test('코인 날리기: 숨은 탭·화면 밖이어도 1.3초 안에 모두 풀어 줌, 낮음 품질은 코인 4개까지', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dom = fakeDom();
  try {
    globalThis.document.hidden = true;
    const purse = dom.el();
    const ui = { ...HudUI, panel: null, coinTarget: { querySelector: () => purse }, game: { quality: { level: 'low' }, economy: { money: 2000 }, audio: { play() {} } } };
    const before = dom.made.length;
    ui.flyToCoin(1000, null);
    for (let i = 0; i < 4; i++) t.mock.timers.tick(COIN_SAFETY / 4 + 2);
    assert.equal(ui.coinHold, 0);
    assert.ok(dom.made.length - before <= 2 + 1, '숨은 탭이면 코인 그림을 만들지 않음 (+N 하나만)');
    globalThis.document.hidden = false;
    const made0 = dom.made.length;
    ui.flyToCoin(1000, null);
    for (let i = 0; i < 4; i++) t.mock.timers.tick(COIN_SAFETY / 4 + 2);
    const coins = dom.made.slice(made0).filter((e) => e.className === 'fly coin').length;
    assert.equal(coins, 4, '낮음 품질은 4개');
  } finally { dom.restore(); t.mock.timers.reset(); }
});

test('레벨 축하: 레벨이 오른 것을 매 프레임 봄 (퀘스트·체험관 투어·그 밖 모두), 체험관 투어는 자기 팡파르를 겹치지 않음', () => {
  const hud = read('src/ui/hud.js');
  assert.match(hud, /else if \(lv > this\._lvSeen\) \{ const b = this\._lvSeen; this\._lvSeen = lv; this\.celebrateLevel\(b, lv\); \}/);
  assert.match(hud, /showUnlockCard\(this, p\.before, p\.after/);
  const koat = read('src/ui/koat_ui.js');
  assert.match(koat, /if \(g\.quests\.level === lv0\) reward\(g, 3\)/);
  assert.doesNotMatch(koat, /g\.quests\.xp \+= r\.xp;\s*\n\s*g\.player\.setTitle\?\.\(r\.title\);\s*\n\s*g\.audio\.play\('levelup'\)/);
});

test('코인 길: 출발 (0,0) → 지갑, 처음엔 위로 튀고, 크기 0.6 → 1.15 → 0.8', () => {
  const k = coinArc(300, -200, 0, 9);
  assert.equal(k.length, 10);
  const xy = (f) => f.transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/).slice(1).map(Number);
  assert.deepEqual(xy(k[0]), [0, 0, 0.6]);
  const [ex, ey, es] = xy(k[9]);
  assert.equal(ex, 300); assert.equal(ey, -200); assert.ok(Math.abs(es - 0.8) < 1e-6);
  assert.ok(Math.max(...k.map((f) => xy(f)[2])) >= 1.1, '가운데쯤 크게');
  // 지갑이 아래에 있어도 처음엔 위로 튐 (포물선)
  const down = coinArc(100, 150, 0, 9);
  assert.ok(xy(down[2])[1] < 0);
  assert.equal(k[9].offset, 1);
});

test('코인 날리기: 마지막 코인이 닿은 뒤 onDone 한 번 (장터 알림을 그때)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dom = fakeDom();
  try {
    let done = 0;
    const money = dom.el();
    const ui = { ...HudUI, panel: null, coinTarget: { querySelector: () => money }, game: { quality: { level: 'high' }, economy: { money: 500 }, audio: { play() {} } } };
    ui.flyToCoin(45, null, () => done++);
    t.mock.timers.tick(COIN_FLIGHT - 10);
    assert.equal(done, 0, '날아가는 동안은 아직');
    for (let k = 0; k < COIN_SAFETY; k += 5) t.mock.timers.tick(5);
    assert.equal(done, 1);
  } finally { dom.restore(); t.mock.timers.reset(); }
});

test('레벨업 차례: 리본 → 만세 → 리본이 사라진 뒤 카드, 컷신 중이면 리본도 끝난 뒤', () => {
  assert.ok(LV_CHEER_AT + LV_CARD_AFTER >= RIBBON_MS, '카드는 리본과 겹치지 않음');
  const hud = read('src/ui/hud.js');
  assert.match(hud, /if \(!cine\) this\._levelRibbon\(after\)/);
  assert.match(hud, /if \(p\.ribbon\) \{ p\.ribbon = false; this\._levelRibbon\(p\.after\)/);
  assert.match(hud, /if \(!p\.cheered\) \{ p\.cheered = true; reward\(g, 3/);
  assert.match(hud, /querySelector\('\.lvl-ribbon:not\(\.skill\)'\)\?\.remove\(\)/);
  // 컷신 중에는 리본도 숨김 (CSS)
  assert.match(read('src/ui/css/levelup.css'), /body\.cine \.lvl-card, body\.cine \.lvl-ribbon \{ opacity: 0/);
  // 숙련도 리본과 같은 말을 하는 알림은 리본이 없을 때만
  for (const f of ['src/game/view/farmcraft_view.js', 'src/game/view/ranch_view.js']) {
    assert.match(read(f), /if \(g\.ui\.skillLevelUp\) g\.ui\.skillLevelUp\([^\n]*\n\s*else \{ g\.audio\.play\('win'\); g\.ui\.toast\(/, f);
  }
});

test('도움말·설정 단추가 화면에 붙음 (폰은 CSS 가 도움말만 숨김), 배지 얼굴은 색이 바뀌면 다시 그림', () => {
  const hud = read('src/ui/hud.js');
  assert.match(hud, /right\.append\(this\.btnBag, this\.btnQuest, this\.btnSettings, this\.btnHelp\)/);
  assert.match(hud, /this\._facePal !== pu\.palette/);
});
