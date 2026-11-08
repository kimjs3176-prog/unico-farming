// 모바일 화면 CSS 점검: style.css → theme.css 순서로 읽었을 때 화면 크기별로 실제로 이기는 값
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 테마가 모바일 압축 값을 덮는 회귀, 데스크톱 회귀를 막음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/** CSS → [{ sel, decls: [[prop, value]], media: ['@media ...'] }] (주석 제거, 중첩 @media 지원) */
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') { stack.push(buf.trim()); buf = ''; }
    else if (ch === '}') {
      const sel = stack.pop();
      if (!sel.startsWith('@')) {
        const decls = buf.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
          const i = d.indexOf(':');
          return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
        });
        out.push({ sel: sel.replace(/\s+/g, ' '), decls, media: stack.filter((s) => s.startsWith('@')) });
      }
      buf = '';
    } else buf += ch;
  }
  return out;
}

/** 이 파일에서 쓰는 미디어 조건만: (max/min-width|height: Npx) (min-aspect-ratio: a/b) (pointer: coarse) (hover: none) */
function mediaMatches(q, env) {
  if (!q.startsWith('@media')) return false; // @keyframes 등
  return q.slice(6).split(',').some((part) => [...part.matchAll(/\(([^)]+)\)/g)].every(([, f]) => {
    const [k, v] = f.split(':').map((x) => x.trim());
    const n = parseFloat(v);
    if (k === 'max-width') return env.w <= n;
    if (k === 'min-width') return env.w >= n;
    if (k === 'max-height') return env.h <= n;
    if (k === 'min-height') return env.h >= n;
    if (k === 'min-aspect-ratio') { const [a, b] = v.split('/').map(Number); return env.w * b >= env.h * a; }
    if (k === 'pointer') return v === (env.coarse ? 'coarse' : 'fine');
    if (k === 'hover') return v === (env.coarse ? 'none' : 'hover');
    if (k === 'prefers-reduced-motion') return false;
    throw new Error(`모르는 미디어 조건: ${f}`);
  }));
}

const RULES = [...parse(read('src/ui/style.css')), ...parse(read('src/ui/theme.css'))];
const PHONE = { w: 390, h: 844, coarse: true };
const LAND = { w: 844, h: 390, coarse: true };
const TABLET = { w: 820, h: 1180, coarse: true };
const DESK = { w: 1280, h: 800, coarse: false };
const DESK2 = { w: 1100, h: 740, coarse: false };
const WIDE = { w: 1440, h: 900, coarse: false };
const SHORT = { w: 1280, h: 480, coarse: false }; // 낮은 데스크톱 창

/** 선택자 목록에 sel 이 그대로 들어 있는 규칙 중 env 에서 마지막으로 이기는 prop 값 (border 묶음은 두께로도 셈) */
function value(env, sel, prop) {
  let v;
  for (const r of RULES) {
    if (!r.sel.split(',').map((s) => s.trim()).includes(sel)) continue;
    if (!r.media.every((m) => mediaMatches(m, env))) continue;
    for (const [p, val] of r.decls) {
      if (p === prop) v = val;
      else if (prop === 'border-width' && p === 'border') v = val.split(' ')[0];
    }
  }
  return v;
}

test('테마(theme.css)가 모바일 압축 값을 다시 덮지 않음', () => {
  for (const env of [PHONE, LAND]) {
    assert.equal(value(env, '.chip .xpbar', 'width'), '28px');
    assert.equal(value(env, '.actionbar', 'padding'), '3px');
    assert.equal(value(env, '.minimap', 'border-width'), '2px');
  }
  // 꾸미기 막대: 세로 폰은 이름 한 줄 + 단추 한 줄, 가로 폰은 세로 막대 (단추가 줄바꿈되지 않음)
  assert.equal(value(PHONE, '.decor-bar', 'flex-wrap'), 'wrap');
  assert.equal(value(PHONE, '.decor-what', 'flex'), '1 0 100%');
  assert.equal(value(LAND, '.decor-bar', 'flex-wrap'), 'nowrap');
  assert.equal(value(LAND, '.decor-what', 'flex'), '0 0 auto');
});

test('데스크톱 값은 그대로 (모바일 규칙이 새지 않음)', () => {
  assert.equal(value(WIDE, '.chat', 'bottom'), '12px'); // 넓은 창은 채팅이 바닥 그대로 (좁은 창은 아래 시험)
  for (const env of [DESK, DESK2]) {
    assert.equal(value(env, '.touch-btn', 'display'), 'none');
    assert.equal(value(env, '.bar-toggle', 'display'), 'none');
    assert.equal(value(env, '.dlg', 'bottom'), '96px');
    assert.equal(value(env, '.prompt', 'white-space'), 'nowrap');
    assert.equal(value(env, '.prompt', 'bottom'), '120px');
    assert.equal(value(env, '.actionbar button', 'font-size'), '11px');
    assert.equal(value(env, '.chip .xpbar', 'width'), '76px');
    assert.equal(value(env, '.decor-bar', 'bottom'), '174px');
    assert.equal(value(env, '.soc-reqs', 'bottom'), '178px');
    assert.equal(value(env, '.map-panel', 'display'), undefined);
  }
});

test('가로 폰: 대화창은 바닥으로, 꾸미기 막대·요청 카드는 화면 가운데를 비움', () => {
  assert.match(value(LAND, '.dlg', 'bottom'), /^calc\(6px/);
  assert.equal(value(LAND, '.dlg-choices', 'display'), 'grid');
  assert.equal(value(LAND, '.decor-bar', 'flex-direction'), 'column');
  assert.equal(value(LAND, '.decor-bar', 'left'), 'auto');
  assert.equal(value(LAND, '.soc-reqs', 'bottom'), 'auto');
  assert.equal(value(LAND, '.map-panel', 'display'), 'grid');
  assert.equal(value(LAND, '.panel.market', 'max-height'), 'none');
  // 세로 폰은 가로 폰 전용 규칙을 받지 않음
  assert.equal(value(PHONE, '.dlg-choices', 'display'), 'flex');
  assert.equal(value(PHONE, '.decor-bar', 'flex-direction'), undefined);
});

test('터치 태블릿: 채팅·E 버튼이 가운데 행동 막대(약 102px) 위로, \'크게\' 설정에서도', () => {
  assert.equal(value(TABLET, '.chat', 'bottom'), '110px');
  assert.equal(value(TABLET, 'body.ui-big .chat', 'bottom'), '110px'); // max-width:1500px 의 92px 보다 뒤에서 이김
  assert.equal(value(TABLET, '.touch-btn', 'bottom'), '110px');
  assert.equal(value(LAND, '.chat', 'bottom') === '110px', false); // 가로 폰은 모바일 블록 값
  assert.equal(value(WIDE, 'body.ui-big .chat', 'bottom'), '92px'); // 넓은 데스크톱은 그대로
});

test('좁은 데스크톱 창(601~1340px): 채팅이 가운데 행동 막대 위로, 폰·넓은 창은 그대로', () => {
  for (const env of [DESK, DESK2]) {
    assert.equal(value(env, '.chat', 'bottom'), '112px');
    assert.equal(value(env, 'body.ui-big .chat', 'bottom'), '128px');
  }
  assert.equal(value(WIDE, '.chat', 'bottom'), '12px');
  for (const env of [PHONE, LAND]) assert.match(value(env, '.chat', 'bottom'), /^calc\(60px/);
  // 올린 채팅(바닥 112px)은 주민 대화창(바닥 96px) 아래에 깔리므로 대화 중에는 숨김
  for (const env of [DESK, DESK2]) assert.equal(value(env, '#ui:has(> .dlg:not(.hidden)) > .chat', 'visibility'), 'hidden');
  assert.equal(value(WIDE, '#ui:has(> .dlg:not(.hidden)) > .chat', 'visibility'), undefined, '넓은 창은 채팅이 대화창과 안 겹쳐 그대로');
});

test('좁은 데스크톱 창: 올린 채팅이 가운데 안내(E)를 덮지 않음, 입력 중에는 채팅이 위', () => {
  const NARROW = { w: 800, h: 600, coarse: false };
  for (const env of [NARROW, DESK, DESK2]) {
    // 안내는 z-index 없음(0 층) → 입력 중이 아닌 채팅(음수)이 그 아래. 안내를 올리지 않으므로 스마트팜 창·운전 버튼은 그대로 안내 위
    assert.equal(value(env, '.prompt', 'z-index'), undefined);
    assert.ok(Number(value(env, '.chat:not(:focus-within)', 'z-index')) < 0);
    assert.equal(value(env, '.chat:focus-within', 'z-index'), undefined, '입력 중이면 원래 순서');
    assert.equal(value(env, '#ui', 'isolation'), 'isolate', '음수 층이 게임 화면 아래로 가지 않게');
  }
  // 입력 중 원래 순서에서 채팅이 안내보다 위: #ui 안에서 안내 → 채팅 순서
  const ui = read('src/ui/ui.js');
  assert.ok(ui.indexOf('root.append(this.prompt)') < ui.indexOf('root.append(this.chat)'));
  // 넓은 창·세로 폰은 그대로 (채팅이 안내와 겹치지 않음)
  for (const env of [WIDE, PHONE]) assert.equal(value(env, '.chat:not(:focus-within)', 'z-index'), undefined);
});

test('낮은 창(가로 폰·낮은 데스크톱 창): 장터 압축, 큰 지도는 옆으로 나란히', () => {
  for (const env of [LAND, SHORT]) {
    assert.equal(value(env, '.panel.market', 'max-height'), 'none');
    assert.equal(value(env, '.mk-body', 'min-height'), '64px');
    assert.equal(value(env, '.mk-top', 'flex-flow'), 'row wrap');
    assert.equal(value(env, '.panel.market h2', 'font-size'), '19px');
    assert.equal(value(env, '.map-panel', 'display'), 'grid');
  }
  // 높은 창은 그대로, 목록 최소 높이는 보이는 높이에 맞춰 줄어듦
  for (const env of [DESK, WIDE, PHONE]) {
    assert.equal(value(env, '.panel.market', 'max-height'), undefined);
    assert.equal(value(env, '.map-panel', 'display'), undefined);
    assert.equal(value(env, '.mk-body', 'min-height'), 'min(120px, 16dvh)');
  }
  // 큰 지도: 창 높이에 맞춘 상한 (넓고 높은 창에서는 100% 그대로)
  assert.match(value(WIDE, '.bigmap', 'width'), /^min\(100%, max\(200px, calc\(86dvh/);
  for (const env of [DESK, DESK2, WIDE, TABLET]) assert.match(value(env, '.bigmap', 'width'), /- 260px\)\)\)$/);
  // 세로 폰: 두 줄 제목·네 줄 장소 버튼만큼 더 뺌 (390x664 에서 지도 약 241px, 스크롤 없음)
  assert.match(value(PHONE, '.bigmap', 'width'), /^min\(100%, max\(200px, calc\(86dvh \/ var\(--ui-zoom, 1\) - 330px\)\)\)$/);
});

test('미니게임 창은 투명도만 나타남 (화면 전체가 미끄러지면 바구니 끌기가 어긋남)', () => {
  const anim = value(WIDE, '.mg-wrap', 'animation');
  assert.ok(anim && !anim.includes('panelin'), anim);
  const name = anim.split(' ')[0];
  const css = read('src/ui/style.css');
  const kf = css.match(new RegExp(`@keyframes ${name} \\{([^}]*\\{[^}]*\\})*[^}]*\\}`))?.[0] || '';
  assert.ok(kf, `@keyframes ${name}`);
  assert.ok(!/transform/.test(kf), kf);
});

test('꾸미기 막대가 떠 있으면 자동 진행 칩을 숨김', () => {
  assert.equal(value(WIDE, '#ui:has(> .decor-bar) > .auto-chip', 'display'), 'none');
});

test('누르는 메뉴가 안내 말풍선·자동 칩보다 위 (탭이 말풍선으로 새지 않음)', () => {
  for (const env of [PHONE, LAND]) {
    const p = Number(value(env, '.prompt', 'z-index'));
    assert.ok(p >= 1);
    assert.equal(Number(value(env, '.auto-chip', 'z-index')), p);
    for (const sel of ['#ui.bar-open > .actionbar', '.emote-menu', '.chat:focus-within', '.drive-pad']) {
      assert.ok(Number(value(env, sel, 'z-index')) > p, `${sel} 가 .prompt 보다 위여야 함`);
      assert.ok(Number(value(env, sel, 'z-index')) < 5, `${sel} 는 꾸미기 막대(5)·창(10)보다 아래`);
    }
  }
  // 채팅 기록은 터치를 받음 (밀어서 지난 대화 보기) — 말풍선은 z-index 로 위에
  for (const env of [PHONE, LAND]) assert.equal(value(env, '.chat:not(:focus-within)', 'pointer-events'), undefined);
  for (const env of [DESK, DESK2]) {
    assert.equal(value(env, '.prompt', 'z-index'), undefined);
    assert.equal(value(env, '.emote-menu', 'z-index'), undefined);
  }
});

test('세로 폰: ☰ 를 펼치면 안내 말풍선·자동 칩이 두 줄 막대 위로, 올라간 E 버튼을 비킴', () => {
  assert.match(value(PHONE, '#ui.bar-open > .prompt', 'bottom'), /^calc\(124px/);
  assert.match(value(PHONE, '#ui.bar-open > .auto-chip', 'bottom'), /^calc\(180px/);
  assert.match(value(PHONE, '#ui.bar-open .touch-btn', 'bottom'), /^calc\(116px/);
  for (const sel of ['#ui.bar-open > .prompt', '#ui.bar-open > .auto-chip']) assert.match(value(PHONE, sel, 'max-width'), /- 152px\)$/);
  // 가로 폰은 막대가 한 줄이라 그대로
  assert.equal(value(LAND, '#ui.bar-open > .prompt', 'bottom'), undefined);
  // 트랙터 운전 중 안내는 운전 버튼 위 (막대 펼침 규칙보다 뒤에서 이김)
  const order = RULES.filter((r) => r.media.some((m) => mediaMatches(m, PHONE)) && /#ui\.(bar-open|driving) > \.prompt/.test(r.sel)).map((r) => r.sel);
  assert.deepEqual(order, ['#ui.bar-open > .prompt', '#ui.driving > .prompt']);
});

test('가로 폰: 대화창 폭은 확대 단위로 ☰·E 자리(150px)를 뺌', () => {
  assert.match(value(LAND, '.dlg', 'width'), /^min\(calc\(100vw \/ var\(--ui-zoom, 1\) - 150px/);
});

test('가로 폰: 스마트팜·논 패널이 떠도 알림·배너가 가려지지 않음', () => {
  assert.equal(value(LAND, '.toasts', 'z-index'), '7');
  assert.equal(value(LAND, '.event-banner', 'z-index'), '7');
  assert.equal(value(LAND, '#ui:has(> .smart-panel) > .toasts', 'transform'), 'none');
  assert.equal(value(LAND, '#ui:has(> .smart-panel) > .event-banner', 'transform'), 'none');
  assert.match(value(LAND, '#ui:has(> .smart-panel) .toast', 'max-width'), /452px/);
  // 패널 왼쪽 끝(오른쪽 88px + 폭 340px)보다 알림 오른쪽 끝이 왼쪽에: 8 + (W - 452) <= W - 428
  assert.match(value(LAND, '.smart-panel', 'right'), /^calc\(88px/);
  assert.match(value(LAND, '.smart-panel', 'width'), /^min\(340px/);
  // 세로 폰·데스크톱은 그대로
  for (const env of [PHONE, DESK]) {
    assert.equal(value(env, '.toasts', 'z-index'), undefined);
    assert.equal(value(env, '#ui:has(> .smart-panel) > .toasts', 'left'), undefined);
  }
});

test('조이스틱은 글자·버튼 크기 확대(zoom)에서 빠짐 (JS 가 손가락 화면 좌표로 놓음)', () => {
  const z = RULES.find((r) => r.media.length === 0 && r.decls.some(([p, v]) => p === 'zoom' && v.includes('--ui-zoom')));
  assert.ok(z, 'zoom 규칙이 있어야 함');
  assert.match(z.sel, /:not\([^)]*\.joystick[^)]*\)/);
  assert.match(z.sel, /:not\([^)]*\.fly[^)]*\)/);
});

test('트랙터 운전 중(#ui.driving)에는 E·☰ 숨김 (미디어쿼리 밖)', () => {
  const r = RULES.find((x) => x.media.length === 0 && x.sel.includes('#ui.driving .touch-btn') && x.sel.includes('#ui.driving .bar-toggle'));
  assert.ok(r);
  assert.deepEqual(r.decls, [['display', 'none']]);
});

test('dvh·svh 를 쓰는 곳에는 바로 앞에 vh 대체값이 있음', () => {
  for (const r of RULES) {
    r.decls.forEach(([p, v], i) => {
      if (!/\d(dvh|svh)\b/.test(v)) return;
      const prev = r.decls.slice(0, i).find(([q, w]) => q === p && /\dvh\b/.test(w) && !/\d(dvh|svh)\b/.test(w));
      assert.ok(prev, `${r.sel} { ${p}: ${v} } 앞에 vh 대체 선언이 없음`);
    });
  }
});

test('게임 UI 길게 누르기 방지, 입력칸은 그대로 글자 입력', () => {
  const ui = RULES.filter((r) => r.sel === '#ui' && r.media.length === 0).flatMap((r) => r.decls);
  const has = (p, v) => ui.some(([q, w]) => q === p && w === v);
  assert.ok(has('-webkit-user-select', 'none') && has('user-select', 'none') && has('-webkit-touch-callout', 'none'));
  const inp = RULES.find((r) => r.media.length === 0 && r.sel.split(',').map((s) => s.trim()).includes('#ui input'));
  assert.ok(inp && inp.decls.some(([p, v]) => p === '-webkit-user-select' && v === 'text'));
});

test('index.html: 노치 화면 채움 + 홈 화면 앱 설정, 매니페스트 아이콘이 실제로 있음', () => {
  const html = read('index.html');
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  const m = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(m.short_name, '유니코 팜');
  assert.ok(['fullscreen', 'standalone'].includes(m.display));
  assert.ok(m.icons.length > 0);
  for (const ic of m.icons) assert.ok(existsSync(new URL(`public/${ic.src}`, root)), ic.src);
});

test('vercel.json: /models 는 버전(?v) 없을 때만 매번 확인, 있을 때만 오래 캐시', () => {
  const v = JSON.parse(read('vercel.json'));
  const models = v.headers.filter((h) => h.source === '/models/(.*)');
  const cc = (h) => h.headers.find((x) => x.key === 'Cache-Control').value;
  const plain = models.find((h) => h.missing?.some((c) => c.type === 'query' && c.key === 'v'));
  const ver = models.find((h) => h.has?.some((c) => c.type === 'query' && c.key === 'v'));
  assert.match(cc(plain), /must-revalidate/);
  assert.match(cc(ver), /immutable/);
  assert.equal(models.length, 2);
});
