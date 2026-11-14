/**
 * 모델 받기: 배포 빌드에서는 미리 gzip 으로 눌러 둔 <파일>.gz 를 받아 브라우저에서 풂
 *  - Vercel 등 많은 호스팅은 .glb/.bin(바이너리)을 자동 압축하지 않아 모델 5.8MB 가 그대로 내려옴 → .gz 는 약 2.9MB
 *  - .gz 가 없거나(개발 서버), 브라우저에 DecompressionStream 이 없거나, 서버가 이미 풀어서 보냈으면 원본/받은 그대로 사용
 *  - .gz 는 scripts/precompress-models.mjs 가 빌드 후 만듦
 */
const USE_GZ = import.meta.env?.PROD && typeof DecompressionStream !== 'undefined';
/**
 * 빌드 때 넣은 모델 파일별 내용 해시 (vite.config.js define, 개발 서버·테스트에는 없음)
 *  → 주소에 ?v=<해시> 를 붙이면 호스팅이 오래 캐시(vercel.json)하고, 바뀐 파일만 새로 받음
 */
const VER = typeof __MODEL_V__ !== 'undefined' ? __MODEL_V__ : {};

/** 모델 주소 뒤에 붙일 버전 (모르는 파일이면 빈 문자열 → 예전처럼 매번 확인) */
export function modelQuery(url, versions = VER) {
  const h = versions[url.slice(url.lastIndexOf('/') + 1)];
  return h ? `?v=${h}` : '';
}

async function inflate(buf) {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf; // 이미 풀린 내용 (서버가 Content-Encoding 으로 보낸 경우)
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).arrayBuffer();
}

/** url 의 내용을 ArrayBuffer 로 (가능하면 .gz 로 받아 풂) */
export async function fetchModel(url) {
  const v = modelQuery(url);
  if (USE_GZ) {
    try {
      const r = await fetch(`${url}.gz${v}`); // index.html 의 미리 받기(preload) 주소와 같아야 재사용됨
      if (r.ok) return await inflate(await r.arrayBuffer());
    } catch { /* 원본으로 */ }
  }
  const r = await fetch(url + v);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.arrayBuffer();
}
