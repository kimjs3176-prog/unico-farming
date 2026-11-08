// 빌드 후: dist/models 의 .glb/.bin 마다 .gz 를 만들어 둠 (src/game/fetch_gz.js 가 받아서 풂)
// 호스팅(Vercel 등)이 바이너리 파일을 자동 압축하지 않아 첫 접속 다운로드가 커지는 것을 줄임 (약 5.8MB → 2.9MB)
// 파일별 내용 해시 목록(dist/models/versions.json)도 남기고, 게임 코드에 들어간 ?v= 값과 같은지 확인
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const DIR = path.resolve('dist/models');
const ASSETS = path.resolve('dist/assets');
let raw = 0, gz = 0, n = 0;
const versions = {};
for (const f of fs.readdirSync(DIR).sort()) {
  if (!/\.(glb|bin)$/.test(f)) continue;
  const src = fs.readFileSync(path.join(DIR, f));
  const out = zlib.gzipSync(src, { level: 9 });
  fs.writeFileSync(path.join(DIR, f + '.gz'), out);
  versions[f] = crypto.createHash('sha1').update(src).digest('hex').slice(0, 10); // vite.config.js modelVersions 와 같은 방식
  raw += src.length; gz += out.length; n++;
}
fs.writeFileSync(path.join(DIR, 'versions.json'), JSON.stringify(versions, null, 1) + '\n');
console.log(`precompress: ${n} files ${(raw / 1e6).toFixed(2)}MB → ${(gz / 1e6).toFixed(2)}MB (.gz)`);

// 게임 코드(dist/assets/*.js)에 박힌 버전이 실제 파일과 다르면 오래 캐시된 옛 파일을 계속 쓰게 되므로 빌드를 멈춤
const code = fs.existsSync(ASSETS) ? fs.readdirSync(ASSETS).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(ASSETS, f), 'utf8')).join('\n') : '';
const wrong = [], missing = [];
for (const [f, h] of Object.entries(versions)) {
  const m = code.match(new RegExp(`"${f.replace(/\./g, '\\.')}"\\s*:\\s*"([0-9a-f]{10})"`));
  if (!m) missing.push(f);
  else if (m[1] !== h) wrong.push(`${f} (코드 ${m[1]} ≠ 파일 ${h})`);
}
if (wrong.length) { console.error('precompress: 모델 버전이 맞지 않음 →', wrong.join(', ')); process.exit(1); }
if (missing.length) console.warn(`precompress: 버전 없이 받는 모델 ${missing.length}개 (매번 확인):`, missing.join(', '));
else console.log(`precompress: 모델 ${n}개 버전(?v=) 확인`);
