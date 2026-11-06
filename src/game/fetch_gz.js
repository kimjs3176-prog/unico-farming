/**
 * 모델 받기: 배포 빌드에서는 미리 gzip 으로 눌러 둔 <파일>.gz 를 받아 브라우저에서 풂
 *  - Vercel 등 많은 호스팅은 .glb/.bin(바이너리)을 자동 압축하지 않아 모델 5.8MB 가 그대로 내려옴 → .gz 는 약 2.9MB
 *  - .gz 가 없거나(개발 서버), 브라우저에 DecompressionStream 이 없거나, 서버가 이미 풀어서 보냈으면 원본/받은 그대로 사용
 *  - .gz 는 scripts/precompress-models.mjs 가 빌드 후 만듦
 */
const USE_GZ = import.meta.env?.PROD && typeof DecompressionStream !== 'undefined';

async function inflate(buf) {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf; // 이미 풀린 내용 (서버가 Content-Encoding 으로 보낸 경우)
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).arrayBuffer();
}

/** url 의 내용을 ArrayBuffer 로 (가능하면 .gz 로 받아 풂) */
export async function fetchModel(url) {
  if (USE_GZ) {
    try {
      const r = await fetch(`${url}.gz`);
      if (r.ok) return await inflate(await r.arrayBuffer());
    } catch { /* 원본으로 */ }
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.arrayBuffer();
}
