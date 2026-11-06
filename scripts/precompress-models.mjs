// 빌드 후: dist/models 의 .glb/.bin 마다 .gz 를 만들어 둠 (src/game/fetch_gz.js 가 받아서 풂)
// 호스팅(Vercel 등)이 바이너리 파일을 자동 압축하지 않아 첫 접속 다운로드가 커지는 것을 줄임 (약 5.8MB → 2.9MB)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIR = path.resolve('dist/models');
let raw = 0, gz = 0, n = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!/\.(glb|bin)$/.test(f)) continue;
  const src = fs.readFileSync(path.join(DIR, f));
  const out = zlib.gzipSync(src, { level: 9 });
  fs.writeFileSync(path.join(DIR, f + '.gz'), out);
  raw += src.length; gz += out.length; n++;
}
console.log(`precompress: ${n} files ${(raw / 1e6).toFixed(2)}MB → ${(gz / 1e6).toFixed(2)}MB (.gz)`);
