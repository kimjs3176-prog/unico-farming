// 생성물 검사 실행: tests/gen/*.check.mjs (문서 표·아이콘 아틀라스 범위처럼 콘텐츠를 바꿀 때마다 다시 만들어야 하는 것)
// 이름이 *.check.mjs 라 그냥 `node --test`(npm test) 는 찾지 않음 → 배포를 막지 않고, CI 의 gen-check 작업(실패해도 계속)에서만 돎
// 실행: npm run check:gen   (폴더를 바꾸려면 node scripts/check-gen.mjs <폴더>)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(root, process.argv[2] || 'tests/gen');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.check.mjs')).sort() : [];
if (!files.length) {
  console.log(`check:gen: ${path.relative(root, dir) || '.'} 에 검사(*.check.mjs)가 아직 없어요 → 통과`);
  process.exit(0);
}
console.log(`check:gen: ${files.length}개 검사 — ${files.join(', ')}`);
// NODE_TEST_CONTEXT 는 빼고: 다른 node --test 안에서 부르면 결과를 부모에게만 넘기고 종료 코드를 0 으로 남김
const env = { ...process.env, NODE_TEST_CONTEXT: undefined };
const r = spawnSync(process.execPath, ['--test', ...files.map((f) => path.join(dir, f))], { cwd: root, stdio: 'inherit', env });
if (r.status !== 0) console.log('\ncheck:gen: 생성물이 지금 코드와 어긋나요. 다시 만드는 명령은 tests/gen/README.md · docs/DEPLOY.md 참고');
process.exit(r.status ?? 1);
