// 앱 껍데기: index.html·홈 화면 앱 매니페스트·아이콘, vercel.json 캐시, 자체 서버 MIME
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const readBin = (p) => readFileSync(new URL(p, root));

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

test('홈 화면 아이콘: PNG 192·512(+maskable)·180 이 실제 크기로 있고 매니페스트·index.html 이 가리킴', () => {
  const size = (p) => { const b = readBin(p); assert.equal(b.toString('latin1', 1, 4), 'PNG', p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const m = JSON.parse(read('public/manifest.webmanifest'));
  for (const ic of m.icons) {
    assert.equal(ic.type, 'image/png');
    const [w, h] = size(`public/${ic.src}`);
    assert.equal(ic.sizes, `${w}x${h}`);
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'any' && i.sizes === '192x192'));
  const html = read('index.html').toString();
  const apple = html.match(/rel="apple-touch-icon" href="\/([^"]+)"/);
  assert.ok(apple);
  assert.deepEqual(size(`public/${apple[1]}`), [180, 180]);
});

test('첫 화면: 파비콘은 공식 아이콘 PNG, 🎲 이름 단추·접은 조작법·기능 칩 한 줄', () => {
  const html = read('index.html');
  const fav = html.match(/rel="icon"[^>]*href="\/([^"]+)"/);
  assert.ok(fav, '파비콘');
  assert.equal(fav[1], 'icons/icon-192.png');
  assert.ok(existsSync(new URL(`public/${fav[1]}`, root)));
  assert.doesNotMatch(html, /🦄<\/text>/, '이모지 파비콘은 없앰');
  assert.match(html, /id="nick-dice"/);
  assert.match(html, /<details class="howto">\s*<summary>🕹️ 조작법<\/summary>/);
  assert.equal((html.match(/<div class="feature-row">(.*?)<\/div>/)[1].match(/<span>/g) || []).length, 4);
  // 사용자가 고른 첫 화면 꾸밈은 그대로
  for (const k of ['sky-deco', 'class="barn"', 'title-badge', 'title-friends', 'title-ribbon']) assert.ok(html.includes(k), k);
  const boot = read('src/boot.js');
  assert.match(boot, /dice\.onclick = \(\) => \{\s*nick\.value = randomName\(\)/);
  assert.match(boot, /classList\.add\('ready'\)/);
  assert.match(boot, /titleFriends\(\);\s*titleButterfly\(\);/);
});

test('접속 QR: 내 컴퓨터 주소(localhost·127.x·::1)에서는 띄우지 않음', async () => {
  const { isLocalHost } = await import('../src/boot.js');
  for (const h of ['localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) assert.equal(isLocalHost(h), true, h);
  for (const h of ['unico-farm.example.org', '192.168.0.5', '10.0.0.2']) assert.equal(isLocalHost(h), false, h);
  assert.match(read('src/boot.js'), /if \(!isLocalHost\(location\.hostname\)\) \{\s*try \{ const q = joinQrBox\(\)/);
});

test('첫 화면 CSS: 입장 단추 56px·20px, 작은 회색 글씨 대신 갈색(대비), 다 받으면 막대 접음', () => {
  const t = read('src/ui/theme/title.css'), c = read('src/ui/css/title.css');
  assert.match(t, /#start-btn \{ min-height: 56px; font-size: 20px;/);
  assert.match(t, /#loading\.ready \.loading-card \.bar \{ height: 0;/);
  assert.doesNotMatch(c + t, /#loading-text \{[^}]*#8a7a66/);
  assert.doesNotMatch(c, /\.join-qr-txt small \{ color: #8a7a66/);
  assert.match(t, /#loading \.feature-row \{ flex-wrap: nowrap;/);
});

test('자체 서버: 매니페스트는 manifest+json 으로 보냄', () => {
  const src = read('server/index.js').toString();
  assert.match(src, /'\.webmanifest': 'application\/manifest\+json'/);
});

test('설치형 앱 매니페스트: id·방향·분류 + 넓은/좁은 스크린샷이 적힌 크기 그대로 있음', () => {
  const m = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(m.id, '/');
  assert.equal(m.orientation, 'any');
  assert.deepEqual(m.categories, ['games', 'education']);
  // JPEG 크기: SOF0~2 표시에서 높이·너비
  const jpg = (p) => { const b = readBin(p); let i = 2; while (i < b.length) { const mk = b[i + 1], len = b.readUInt16BE(i + 2); if (mk >= 0xc0 && mk <= 0xc2) return `${b.readUInt16BE(i + 7)}x${b.readUInt16BE(i + 5)}`; i += 2 + len; } return ''; };
  assert.deepEqual(m.screenshots.map((s) => s.form_factor).sort(), ['narrow', 'wide']);
  for (const s of m.screenshots) {
    assert.equal(s.type, 'image/jpeg');
    assert.equal(jpg(`public/${s.src}`), s.sizes, s.src);
    assert.ok(s.label);
  }
});

test('구글 글꼴 CSS 는 첫 화면을 막지 않음: preload + media=print + font-css.js 가 켬, 미리 연결 두 개는 그대로', () => {
  const html = read('index.html');
  const GF = 'https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap';
  assert.ok(html.includes(`<link rel="preload" as="style" href="${GF}" />`));
  assert.ok(html.includes(`<link id="gf-css" rel="stylesheet" media="print" href="${GF}" />`));
  assert.equal((html.match(/rel="stylesheet"[^>]*fonts\.googleapis|fonts\.googleapis[^>]*rel="stylesheet"/g) || []).length, 1, '구글 CSS 는 print 로 붙인 하나뿐');
  assert.match(html, /<script src="\/font-css\.js" async><\/script>/);
  assert.match(html, /rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/);
  assert.match(html, /rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/);
  const js = read('public/font-css.js');
  assert.match(js, /getElementById\('gf-css'\)/);
  assert.match(js, /l\.media = 'all'/);
  assert.match(js, /window\.__gfReady = new Promise/);
  assert.match(html, /<script type="module" src="\/src\/game\/sw_register\.js"><\/script>/);
});

test('코인 글꼴: 자체 그림으로 다시 만듦 (MIT 그림·라이선스 파일 없음), 글꼴 이름·주소는 그대로', () => {
  assert.equal(existsSync(new URL('scripts/coin/fluent_coin_flat.svg', root)), false);
  assert.equal(existsSync(new URL('scripts/coin/LICENSE-fluentui-emoji.txt', root)), false);
  assert.match(read('scripts/coin/build_coin_font.py'), /'coin\.svg'/);
  const b = readBin('public/fonts/unico-coin.woff2');
  assert.equal(b.toString('latin1', 0, 4), 'wOF2');
  assert.ok(b.length < 1024, `${b.length}바이트`);
  assert.match(read('src/ui/css/base.css'), /@font-face \{ font-family: 'Unico Coin'; src: url\('\/fonts\/unico-coin\.woff2'\)/);
  assert.doesNotMatch(read('src/ui/css/base.css'), /Fluent|MIT/);
});
