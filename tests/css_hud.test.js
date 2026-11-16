// 위쪽 HUD CSS: 칩·막대 크기가 화면 크기별로 맞게 (테마가 모바일 압축 값을 다시 덮지 않음), 휴대폰 글자 아래한도, 칩 한 줄
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { value, read, PHONE, LAND, DESK, DESK2, WIDE } from './lib/css_env.js';

const px = (v) => parseFloat(String(v ?? '').replace(/^calc\(/, '')) || 0;

test('테마(theme.css)가 모바일 압축 값을 다시 덮지 않음', () => {
  for (const env of [PHONE, LAND]) {
    // 레벨: 휴대폰은 28px 막대 대신 숫자를 두른 고리 (막대·경험치 글은 숨김)
    assert.equal(value(env, '.chip .xpbar', 'display'), 'none');
    assert.equal(value(env, '.chip .xp', 'display'), 'none');
    assert.equal(value(env, '.lv-chip .lv-ring', 'display'), 'inline-grid');
    assert.match(value(env, '.lv-chip .lv-ring', 'background'), /conic-gradient\(var\(--leaf\) max\(4deg, calc\(var\(--xp, 0\) \* 1%\)\), rgba\(139,94,52,0\.32\) 0\)/, '0 XP 에도 바탕 고리 + 4도');
    assert.equal(value(env, '.weather-chip .w-l', 'display'), 'none', '휴대폰 날씨: 그림 + 기온');
    assert.equal(value(env, '.weather-chip .w-t', 'display'), undefined);
    assert.equal(value(env, '.actionbar', 'padding'), '3px');
    assert.equal(value(env, '.minimap', 'border-width'), '2px');
  }
  // 넓은 화면은 그대로 숫자 + 막대
  for (const env of [DESK, WIDE]) {
    assert.equal(value(env, '.lv-chip .lv-ring', 'display'), 'contents');
    assert.equal(value(env, '.chip .xpbar', 'display'), undefined);
  }
  // 꾸미기 막대: 세로 폰은 이름 한 줄 + 단추 한 줄, 가로 폰은 세로 막대 (단추가 줄바꿈되지 않음)
  assert.equal(value(PHONE, '.decor-bar', 'flex-wrap'), 'wrap');
  assert.equal(value(PHONE, '.decor-what', 'flex'), '1 0 100%');
  assert.equal(value(LAND, '.decor-bar', 'flex-wrap'), 'nowrap');
  assert.equal(value(LAND, '.decor-what', 'flex'), '0 0 auto');
});

test('휴대폰 글자 아래한도: 칩 13px 이상 · 돈 15px 이상, 데스크톱은 그대로', () => {
  for (const env of [PHONE, LAND, { w: 360, h: 800, coarse: true }, { w: 800, h: 360, coarse: true }]) {
    assert.ok(px(value(env, '.chip', 'font-size')) >= 13, `${env.w}x${env.h} 칩`);
    assert.ok(px(value(env, '.weather-chip', 'font-size')) >= 13);
    assert.ok(px(value(env, '.chip .money', 'font-size')) >= 15, '돈');
    assert.ok(px(value(env, '.hud-right b', 'font-size')) >= 13, '퀘스트 수');
  }
  for (const env of [DESK, DESK2]) {
    assert.equal(value(env, '.chip', 'font-size'), '15px');
    assert.equal(value(env, '.chip .money', 'font-size'), '17px');
  }
});

// 글자 대략 너비(em): 이 게임 글꼴(Jua)로 잰 칩 너비보다 3~11% 넉넉하게 (11px 칩 '🌸 봄 1/7' 46px, '🕒 3일차 10:04' 89px)
const EM = (ch) => (/[️‍]/.test(ch) ? 0 : /[가-힣]/.test(ch) ? 0.97 : /\p{Extended_Pictographic}/u.test(ch) ? 1.32
  : /[0-9A-Za-z]/.test(ch) ? 0.55 : /[/]/.test(ch) ? 0.4 : 0.27);
const textW = (s, fs) => [...s].reduce((a, ch) => a + EM(ch) * fs, 0);

/** 보이는지: 글자를 키우면(body.ui-big) 따로 숨기는 규칙도 봄 */
const shown = (env, big, sel) => !((big && value(env, `body.ui-big ${sel}`, 'display') === 'none') || value(env, sel, 'display') === 'none');

/** 칩 하나 너비 = 테두리 + 안쪽 여백 + 내용(사이 간격 포함) */
function chipW(env, big, sel, parts) {
  const fs = px(value(env, sel, 'font-size') || value(env, '.chip', 'font-size'));
  const padv = String(value(env, sel, 'padding') || value(env, '.chip', 'padding')).split(/\s+/).map(px);
  const padX = padv.length === 1 ? padv[0] * 2 : padv[1] + (padv[3] ?? padv[1]);
  const bw = px(value(env, '.chip', 'border-width'));
  const gap = px(value(env, '.chip', 'gap'));
  const items = parts.filter((p) => !p.sel || shown(env, big, p.sel)).map((p) => p.w ?? textW(p.text, p.fs ?? fs));
  const w = 2 * bw + padX + items.reduce((a, b) => a + b, 0) + gap * Math.max(0, items.length - 1);
  return Math.max(w, px(value(env, sel, 'min-width')));
}

/** 위쪽 칩 줄 너비 (보통 내용: 12,345코인·10:04·봄 1/7·맑음·Lv.1) */
function chipRow(env, big) {
  const ring = px(value(env, '.lv-chip .lv-ring', 'width'));
  const chips = [
    chipW(env, big, '.chip', [{ text: '🪙' }, { text: '12,345', fs: px(value(env, '.chip .money', 'font-size')) }]),
    chipW(env, big, '.chip', [{ text: '🕒', sel: '.clock-chip .ico' }, { text: '3일차', sel: '.clock-chip .day' }, { text: '10:04' }]),
    chipW(env, big, '.chip', [{ text: '🌸 봄 1/7' }]),
    chipW(env, big, '.weather-chip', [{ text: '☀️' }, { text: '22°', sel: '.weather-chip .w-t' }, { text: '맑음', sel: '.weather-chip .w-l' }]),
    chipW(env, big, '.chip', [{ text: 'Lv.', sel: '.lv-chip .lv-t' }, { text: '1' }].map((p) => (p.text === '1' && ring ? { w: ring } : p))),
  ];
  const gap = px((big && value(env, 'body.ui-big .hud-top', 'gap')) || value(env, '.hud-top', 'gap'));
  return chips.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
}

test('휴대폰 위쪽 칩 줄: 360x800·800x360 에서 글자 1배·1.25배 모두 한 줄 (가로 폰은 오른쪽 단추까지)', () => {
  for (const [w, h] of [[360, 800], [800, 360]]) {
    const env = { w, h, coarse: true };
    for (const zoom of [1, 1.25]) {
      const big = zoom > 1;
      const room = w / zoom - px(value(env, '.hud-top', 'left')) - px(value(env, '.hud-top', 'right'));
      let row = chipRow(env, big);
      if (w > h) { // 가로 폰: 가방·퀘스트·설정·도움말 단추도 같은 줄
        const bw = Math.max(px(value(env, '.hud-right button', 'min-width')), textW('🎒', px(value(env, '.hud-right button', 'font-size'))) + 12);
        row += px(value(env, '.hud-top', 'gap')) + 4 * bw + 3 * px(value(env, '.hud-right', 'gap'));
      }
      assert.ok(row <= room, `${w}x${h} 글자 ${zoom}배: 줄 ${row.toFixed(1)}px > 자리 ${room.toFixed(1)}px`);
    }
  }
  // 1.25배 세로 폰은 시계 그림·'Lv.' 글을 빼야 들어감 (빼지 않으면 넘침 = 이 시험이 실제로 재고 있음)
  const env = { w: 360, h: 800, coarse: true };
  assert.ok(chipRow(env, false) > 360 / 1.25 - 8);
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
