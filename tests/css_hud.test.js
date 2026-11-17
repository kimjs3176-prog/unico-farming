// 위쪽 HUD CSS: 칩·막대 크기가 화면 크기별로 맞게 (테마가 모바일 압축 값을 다시 덮지 않음), 휴대폰 글자 아래한도, 칩 한 줄
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { value, read, PHONE, LAND, DESK, DESK2, WIDE, TABLET } from './lib/css_env.js';

const px = (v) => parseFloat(String(v ?? '').replace(/^calc\(/, '')) || 0;

test('테마(theme.css)가 모바일 압축 값을 다시 덮지 않음: 배지·지갑·달력·미니맵 크기', () => {
  for (const env of [PHONE, LAND]) {
    assert.equal(value(env, '.p-badge .pb-face', 'width'), '40px', '폰 얼굴 40px');
    assert.equal(value(env, '.purse .money', 'font-size'), '16px');
    assert.equal(value(env, '.hud-top .calendar', 'width'), '86px');
    assert.equal(value(env, '.minimap', 'width'), '86px', '달력과 미니맵 폭이 같음 (한 액자)');
    assert.equal(value(env, '.calendar .cal-w', 'display'), 'none', "폰은 '봄 1일' 만 (1/7 없음)");
    assert.equal(value(env, '.minimap', 'border-width'), '2px');
    assert.equal(value(env, '.hud-top .calendar', 'border-width'), '2px');
    assert.equal(value(env, '.actionbar', 'padding'), '3px');
    // 폰: 가방·설정이 미니맵 아래 (퀘스트는 목표 칩, 도움말은 넓은 화면만) — 설정은 폰에서 그래픽 품질·소리로 가는 길이라 숨기지 않음
    assert.equal(value(env, '.hud-right .quest-btn', 'display'), 'none');
    assert.equal(value(env, '.hud-right .help-btn', 'display'), 'none');
    assert.equal(value(env, '.hud-right .set-btn', 'display'), undefined, '폰에서도 설정 단추가 보임');
    assert.equal(value(env, '.hud-right', 'width'), '86px', '두 단추가 미니맵 폭 안에');
    assert.ok(2 * px(value(env, '.hud-right .hud-btn', 'width')) <= 86);
    assert.equal(value(env, '.calendar .cal-temp', 'display'), 'none', '폰 달력은 시각·날씨 그림만 (잘리지 않게)');
    assert.match(value(env, '.hud-right', 'top'), /var\(--map-b/);
  }
  for (const env of [DESK, WIDE]) {
    assert.equal(value(env, '.p-badge .pb-face', 'width'), '44px', '넓은 화면 얼굴 44px');
    assert.equal(value(env, '.purse .money', 'font-size'), '20px');
    assert.equal(value(env, '.hud-top .calendar', 'width'), '150px');
    assert.equal(value(env, '.minimap', 'width'), '150px');
    assert.equal(value(env, '.calendar .cal-w', 'display'), undefined);
    assert.equal(value(env, '.hud-right .quest-btn', 'display'), undefined);
    assert.equal(value(env, '.hud-right .hud-btn', 'width'), '44px');
  }
  // 경험치 고리: 0 XP 에도 옅은 금빛 바탕 고리, 채움은 --xp % (조금이라도 있으면 hud.js 가 3% 부터), 지갑 숫자는 최소 폭(ch)·고정폭 숫자
  assert.match(value(DESK, '.p-badge .pb-ring', 'background'), /conic-gradient\(var\(--leaf\) calc\(var\(--xp, 0\) \* 1%\), rgba\(255,206,84,0\.5\) 0\)/);
  assert.match(read('src/ui/hud.js'), /pct = pct0 > 0 \? Math\.max\(3, pct0\) : 0/);
  // 이름표는 고리와 30% 쯤만 겹침 (고리 52px, 배지 64px)
  assert.equal(value(DESK, '.hud-top .p-badge', 'height'), '64px');
  // 키 안내(.hint-kbd)는 터치 화면에서 숨김 (미니게임 시작 단추)
  assert.equal(value(PHONE, '.hint-kbd', 'display'), 'none');
  assert.equal(value(TABLET, '.hint-kbd', 'display'), 'none');
  assert.equal(value(DESK, '.hint-kbd', 'display'), undefined);
  assert.match(value(DESK, '.purse .money', 'min-width'), /^\dch$/);
  assert.match(value(PHONE, '.purse .money', 'min-width'), /^\dch$/);
  assert.equal(value(DESK, '.purse .money', 'font-variant-numeric'), 'tabular-nums');
  // 미니맵은 달력 바로 아래 (달력 아래 끝 --cal-b)
  for (const env of [DESK, PHONE]) assert.match(value(env, '.minimap', 'top'), /^calc\(var\(--cal-b/);
  // 단축키 글자는 올리거나 키보드로 고를 때만
  assert.equal(value(DESK, '.hud-btn .kc', 'opacity'), '0');
  assert.equal(value(DESK, '.hud-btn:focus-visible .kc', 'opacity'), '1');
  // 컷신에는 배지·달력·버튼을 숨기는 규칙이 hud.css 에
  assert.equal(value(DESK, 'body.cine .calendar', 'opacity'), '0');
});

test('휴대폰 글자 아래한도: HUD 숫자 14px 이상 · 다른 글 12px 이상, 데스크톱은 더 큼', () => {
  for (const env of [PHONE, LAND, { w: 360, h: 800, coarse: true }, { w: 800, h: 360, coarse: true }]) {
    assert.ok(px(value(env, '.purse .money', 'font-size')) >= 14, `${env.w}x${env.h} 지갑`);
    assert.ok(px(value(env, '.calendar .cal-t', 'font-size')) >= 14, '시각');
    assert.ok(px(value(env, '.calendar .cal-s', 'font-size')) >= 13, '계절 줄');
    assert.ok(px(value(env, '.calendar .cal-temp', 'font-size')) >= 12, '기온');
    assert.ok(px(value(env, '.p-badge .pb-lv', 'font-size')) >= 12, '레벨 이름표');
  }
  for (const env of [DESK, DESK2]) {
    assert.equal(value(env, '.purse .money', 'font-size'), '20px');
    assert.equal(value(env, '.calendar .cal-t', 'font-size'), '22px');
  }
});

// 글자 대략 너비(em): 이 게임 글꼴(Jua)로 잰 너비보다 조금 넉넉하게
const EM = (ch) => (/[️‍]/.test(ch) ? 0 : /[가-힣]/.test(ch) ? 0.97 : /\p{Extended_Pictographic}/u.test(ch) ? 1.32
  : /[0-9A-Za-z]/.test(ch) ? 0.55 : /[/°]/.test(ch) ? 0.4 : 0.27);
const textW = (s, fs) => [...s].reduce((a, ch) => a + EM(ch) * fs, 0);
const padX = (v) => { const p = String(v || 0).split(/\s+/).map(px); return p.length === 1 ? p[0] * 2 : p[1] + (p[3] ?? p[1]); };

/** 위쪽 한 줄: 배지 + 지갑(12,345) + 달력 */
function topRow(env, big) {
  const badge = px(value(env, '.hud-top .p-badge', 'width'));
  const mfs = px(value(env, '.purse .money', 'font-size'));
  const money = Math.max(textW('12,345', mfs), parseFloat(value(env, '.purse .money', 'min-width')) * 0.55 * mfs);
  const purse = 4 + padX(value(env, '.purse', 'padding')) + textW('🪙', px(value(env, '.purse .coin-ico', 'font-size'))) + px(value(env, '.purse', 'gap')) + money;
  const cal = px(value(env, '.hud-top .calendar', 'width'));
  const gap = px((big && value(env, 'body.ui-big .hud-top', 'gap')) || value(env, '.hud-top', 'gap'));
  return badge + purse + cal + gap * 2;
}

test('휴대폰 위쪽 한 줄: 360x800·800x360 에서 글자 1배·1.25배 모두 배지·지갑·달력이 한 줄', () => {
  for (const [w, h] of [[360, 800], [800, 360]]) {
    const env = { w, h, coarse: true };
    for (const zoom of [1, 1.25]) {
      const room = w / zoom - px(value(env, '.hud-top', 'left')) - px(value(env, '.hud-top', 'right'));
      const row = topRow(env, zoom > 1);
      assert.ok(row <= room, `${w}x${h} 글자 ${zoom}배: 줄 ${row.toFixed(1)}px > 자리 ${room.toFixed(1)}px`);
    }
  }
});

test('달력 두 줄이 폭 안에 들어감: 폰 86px (08:00 ☀️ 22°), 넓은 화면 150px (🌸 봄 7일 7/7 · 08:00 ☀️ 22°)', () => {
  for (const env of [PHONE, LAND, DESK]) {
    const w = px(value(env, '.hud-top .calendar', 'width'));
    const bw = px(value(env, '.hud-top .calendar', 'border-width') || '3px');
    const inner = w - 2 * bw - padX(value(env, '.hud-top .calendar', 'padding'));
    const g2 = px(value(env, '.calendar .cal-l2', 'gap'));
    const temp = value(env, '.calendar .cal-temp', 'display') === 'none' ? 0 : textW('22°', px(value(env, '.calendar .cal-temp', 'font-size'))) + g2;
    const l2 = textW('08:00', px(value(env, '.calendar .cal-t', 'font-size'))) + textW('☀', px(value(env, '.calendar .cal-wx', 'font-size'))) + temp + g2;
    assert.ok(l2 <= inner + 0.5, `${env.w}: 둘째 줄 ${l2.toFixed(1)} > ${inner.toFixed(1)}`);
    const wk = value(env, '.calendar .cal-w', 'display') === 'none' ? 0 : textW('7/7', px(value(env, '.calendar .cal-w', 'font-size'))) + 6;
    const l1 = textW('🌸 봄 7일', px(value(env, '.calendar .cal-s', 'font-size'))) + wk;
    assert.ok(l1 <= inner + 0.5, `${env.w}: 첫 줄 ${l1.toFixed(1)} > ${inner.toFixed(1)}`);
  }
});

test('덜 중요한 글은 #7a5536: 칩 바탕과 4.5:1 이상, 본문 갈색보다 옅음', () => {
  for (const env of [DESK, PHONE]) assert.equal(value(env, '.chip small', 'color'), '#7a5536');
  const lum = (hex) => {
    const c = hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const bg of ['#f6efe0', '#fffdf7']) assert.ok(ratio('#7a5536', bg) >= 4.5, bg);
  assert.ok(lum('#7a5536') > lum('#6b4a2e'), '--brown(본문)보다 옅어야 위계가 남음');
});

test('HUD 에 개발용 글이 없음: 오프라인 모드·기본 위치 글은 칩·접속 줄에 나오지 않음', () => {
  const hud = read('src/ui/hud.js');
  assert.doesNotMatch(hud, /['`][^'`\n]*오프라인 모드/, '오프라인 모드 글을 화면에 쓰지 않음');
  assert.doesNotMatch(read('src/game/weather.js'), /name: '[^']*기본 위치/);
  // 날씨 칩은 지명을 넣지 않음 (날씨 창에서만 '(기본 위치)')
  const setWeather = hud.slice(hud.indexOf('setWeather('), hud.indexOf('openWeather('));
  assert.doesNotMatch(setWeather, /loc/);
});

test('setOnline: 붙어 있다가 끊기면 2.5초 뒤 알림 한 번, 바로 다시 붙으면(방 이동) 조용히, 끊긴 뒤 다시 붙으면 알림', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { HudUI, NET_LOST_MS } = await import('../src/ui/hud.js');
    const toasts = [];
    const ui = { ...HudUI, online: null, toast: (s, o) => toasts.push([s, o?.key]) };
    ui.setOnline(0, '');
    t.mock.timers.tick(NET_LOST_MS + 10);
    assert.deepEqual(toasts, [], '처음부터 혼자·서버 없음이면 조용히');
    ui.setOnline(2, '1번 농장');
    ui.setOnline(0, '');
    ui.setOnline(3, '2번 농장'); // 방 이동
    t.mock.timers.tick(NET_LOST_MS + 10);
    assert.deepEqual(toasts, [], '바로 다시 붙으면 알림 없음');
    ui.setOnline(0, '');
    t.mock.timers.tick(NET_LOST_MS + 10);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0][0], /연결이 끊겼어요/);
    assert.equal(toasts[0][1], 'net');
    ui.setOnline(0, '');
    t.mock.timers.tick(NET_LOST_MS + 10);
    assert.equal(toasts.length, 1, '끊긴 동안 거듭 불려도 한 번');
    ui.setOnline(1, '1번 농장');
    assert.match(toasts[1][0], /다시 연결됐어요/);
  } finally { t.mock.timers.reset(); }
});
