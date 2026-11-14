// 배포 전 확인: CI 워크플로, 빌드 번호(meta·__BUILD__), 생성물 검사 실행기(check:gen)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import viteConfig, { buildId } from '../vite.config.js';

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

test('빌드 번호: 커밋 앞 7자 + 한국 날짜, Vercel → Actions → git 순, 이상한 값·git 없음이면 dev', () => {
  const at = new Date('2026-11-08T16:30:00Z'); // 한국 시간으로는 11월 9일 새벽
  const noGit = () => { throw new Error('git 없음'); };
  assert.equal(buildId({ VERCEL_GIT_COMMIT_SHA: 'ABCDEF1234567890', GITHUB_SHA: '1111111' }, at, noGit), 'abcdef1 2026-11-09');
  assert.equal(buildId({ GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567' }, at, noGit), '0123456 2026-11-09');
  assert.equal(buildId({}, at, () => 'fedcba9876543210\n'.trim()), 'fedcba9 2026-11-09');
  assert.equal(buildId({}, at, noGit), 'dev 2026-11-09', '.git 이 없는 빌드 (Vercel 일부)');
  assert.equal(buildId({ GITHUB_SHA: '"><script>' }, at, noGit), 'dev 2026-11-09', 'HTML 에 넣으므로 16진수만');
});

test('빌드: HTML 에 <meta name="unico-build"> 를 넣고 __BUILD__ 도 같은 값, 개발 서버에는 없음', () => {
  const cfg = viteConfig({ command: 'build' });
  const plug = cfg.plugins.find((p) => p.name === 'unico-build-id');
  assert.ok(plug, '빌드 번호 플러그인');
  assert.equal(plug.apply, 'build');
  const tags = plug.transformIndexHtml('<html></html>', { filename: '/x/index.html' });
  assert.equal(tags.length, 1);
  assert.equal(tags[0].tag, 'meta');
  assert.equal(tags[0].attrs.name, 'unico-build');
  assert.match(tags[0].attrs.content, /^([0-9a-f]{7}|dev) \d{4}-\d{2}-\d{2}$/);
  assert.equal(JSON.parse(cfg.define.__BUILD__), tags[0].attrs.content);
  const dev = viteConfig({ command: 'serve' });
  assert.ok(!dev.plugins.some((p) => p.name === 'unico-build-id'));
  assert.equal(dev.define.__BUILD__, undefined, '개발 서버: 코드는 typeof 로 확인');
});

test('CI: 모든 브랜치 push·PR 에서 npm ci → npm test → npm run build, 액션은 커밋 해시 고정, 읽기 권한만', () => {
  const y = read('.github/workflows/ci.yml');
  assert.match(y, /^on:\n {2}push:\n {4}paths-ignore: \['docs\/\*\*'\]\n {2}pull_request:\n {2}workflow_dispatch:$/m, 'push(브랜치 제한 없음)는 문서만 바뀌면 건너뜀, PR 은 거르지 않음');
  // 필수 검사는 경로로 건너뛰면 '대기 중' 으로 남아 합칠 수 없음 → pull_request 에는 경로·브랜치 거르기가 없어야 함
  const pr = y.slice(y.indexOf('\n  pull_request:'), y.indexOf('\n  workflow_dispatch:'));
  assert.ok(!/paths|branches/.test(pr), 'pull_request 는 늘 실행');
  assert.match(y, /^permissions:\n {2}contents: read$/m);
  assert.match(y, /^concurrency:\n(?: {2}.*\n)* {2}cancel-in-progress: true$/m);
  const uses = [...y.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 2);
  for (const u of uses) assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${u}: 태그가 아니라 커밋 해시`);
  const checkouts = uses.filter((u) => u.startsWith('actions/checkout@')).length;
  assert.equal((y.match(/persist-credentials: false/g) || []).length, checkouts, 'checkout 마다 토큰을 남기지 않음');
  assert.equal((y.match(/node-version: 22$/gm) || []).length, uses.filter((u) => u.startsWith('actions/setup-node@')).length);
  // test 작업: 설치 → 테스트 → 빌드 순서
  const job = y.slice(y.indexOf('\n  test:'), y.indexOf('\n  gen-check:'));
  const at = (s) => { const i = job.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('run: npm ci') < at('run: npm test') && at('run: npm test') < at('run: npm run build'));
  assert.ok(!/continue-on-error/.test(job), '테스트·빌드는 실패하면 CI 실패');
  // 생성물 검사는 표시만, 브라우저 연기 시험은 직접 실행할 때만
  const gen = y.slice(y.indexOf('\n  gen-check:'), y.indexOf('\n  smoke:'));
  assert.match(gen, /continue-on-error: true/);
  assert.match(gen, /run: npm run check:gen/);
  const smoke = y.slice(y.indexOf('\n  smoke:'));
  assert.match(smoke, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(smoke, /npm i --no-save playwright@\d+\.\d+\.\d+/, 'Playwright 는 package.json 에 넣지 않음');
  assert.match(smoke, /VITE_WS_URL: ''/, '연기 시험 빌드는 릴레이 서버에 붙지 않음');
});

test('연기 시험(scripts/smoke.mjs): 바깥 주소는 모두 막고, 휴대폰 낮음·데스크톱 높음 둘 다, 세 곳 순간이동 뒤 컷신이 풀리는지', () => {
  const s = read('scripts/smoke.mjs');
  assert.match(s, /ctx\.route\('\*\*\/\*', \(route\) => \(local\(route\.request\(\)\.url\(\)\) \? route\.continue\(\) : route\.abort\(\)\)\)/, '릴레이 서버·바깥 주소에 붙지 않음');
  assert.equal((s.match(/browser\.newContext\(/g) || []).length, 1, '창은 open() 한 곳에서만 열어 막기가 빠지지 않게');
  assert.match(s, /\?autostart&quality=low/);
  assert.match(s, /\?autostart&quality=high/);
  for (const go of ['game.teleport(-12.5, 22.4)', 'game.goKoat()', 'game.home.enter()']) assert.ok(s.includes(go), go);
  assert.match(s, /컷신·대화가 5초 안에 풀림/);
});

test('package.json: npm test 는 순수 단위 테스트(node --test), 생성물 검사는 check:gen 으로 따로', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.test, 'node --test');
  assert.equal(pkg.scripts['check:gen'], 'node scripts/check-gen.mjs');
  assert.ok(!pkg.dependencies.playwright && !pkg.devDependencies.playwright, 'Vercel 설치에 브라우저를 넣지 않음');
  assert.ok(fs.existsSync(new URL('tests/gen/README.md', root)));
});

test('check:gen: *.check.mjs 만 돌림 (없으면 통과, 하나라도 실패하면 실패)', () => {
  const run = (dir) => spawnSync(process.execPath, [fileURLToPath(new URL('scripts/check-gen.mjs', root)), dir], { encoding: 'utf8' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unico-gen-'));
  try {
    let r = run(path.join(tmp, '없는폴더'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /아직 없어요/);
    const ok = "import test from 'node:test';\ntest('ok', () => {});\n";
    fs.writeFileSync(path.join(tmp, 'a.check.mjs'), ok);
    fs.writeFileSync(path.join(tmp, 'skip.test.js'), "throw new Error('이 파일은 돌지 않아야 함');\n");
    r = run(tmp);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1개 검사 — a\.check\.mjs/);
    fs.writeFileSync(path.join(tmp, 'b.check.mjs'), "import test from 'node:test';\nimport assert from 'node:assert';\ntest('어긋남', () => assert.fail('표가 다름'));\n");
    r = run(tmp);
    assert.notEqual(r.status, 0, '어긋나면 실패 (CI 에서는 continue-on-error)');
    assert.match(r.stdout, /다시 만드는 명령/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
