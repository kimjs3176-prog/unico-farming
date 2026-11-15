/**
 * 모델 받기: 배포 빌드에서는 미리 gzip 으로 눌러 둔 <파일>.gz 를 받아 브라우저에서 풂
 *  - Vercel 등 많은 호스팅은 .glb/.bin(바이너리)을 자동 압축하지 않아 모델 5.8MB 가 그대로 내려옴 → .gz 는 약 2.9MB
 *  - .gz 가 없거나(개발 서버), 브라우저에 DecompressionStream 이 없거나, 서버가 이미 풀어서 보냈으면 원본/받은 그대로 사용
 *  - .gz 는 scripts/precompress-models.mjs 가 빌드 후 만듦
 * 망이 끊기거나(TypeError) 서버 오류(5xx)거나 바이트가 한동안 안 오면(멈춤) 1초·3초 쉬고 다시 받음 (404 등 4xx 는 바로 실패)
 */
const USE_GZ = import.meta.env?.PROD && typeof DecompressionStream !== 'undefined';
/**
 * 빌드 때 넣은 모델 파일별 내용 해시 (vite.config.js define, 개발 서버·테스트에는 없음)
 *  → 주소에 ?v=<해시> 를 붙이면 호스팅이 오래 캐시(vercel.json)하고, 바뀐 파일만 새로 받음
 */
const VER = typeof __MODEL_V__ !== 'undefined' ? __MODEL_V__ : {};

/**
 * 다시 받기 설정: waits = 재시도 전 쉬는 시간(시도는 waits.length + 1 번)
 * stallMs = 본문 바이트가 이만큼 안 오면 끊음 (전체 시간 제한은 없음: 느려도 받고 있으면 기다림)
 * headMs = 응답 머리를 기다리는 한도 (파일 50개가 한꺼번에 줄 서므로 넉넉히)
 */
export const FETCH_RETRY = { waits: [1000, 3000], stallMs: 15000, headMs: 45000 };

let retryCb = null;
/** 다시 받기 알림 받기 (부팅 화면의 '연결이 느려요…' 문구) — cb({ url, attempt, of, why }) */
export function onFetchRetry(cb) { retryCb = cb; }

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

/** 다시 받아 볼 만한 실패 (망 끊김·멈춤·서버 오류) */
function netError(msg, cause) {
  const e = new Error(msg);
  e.code = 'E-NET';
  e.retry = true;
  if (cause) e.cause = cause;
  return e;
}

/**
 * 한 번 받기 → { ok, status, buf } (ok 가 아니면 본문은 읽지 않음)
 * 머리는 headMs, 본문은 바이트 사이 stallMs 동안 아무것도 안 오면 끊음 (AbortController + 기다리기 경주: 끊김이 본문까지 안 전해지는 브라우저도)
 */
async function getOnce(u) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = 0, reader = null, kill;
  const killed = new Promise((_, rej) => { kill = rej; });
  killed.catch(() => {});
  const arm = (ms, what) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      kill(netError(`${u}: ${what}`));
      try { ac?.abort(); } catch { /* 무시 */ }
      try { reader?.cancel?.().catch?.(() => {}); } catch { /* 무시 */ }
    }, ms);
  };
  const net = (e) => (e?.code === 'E-NET' ? e : netError(`${u}: ${e?.message || e}`, e));
  try {
    arm(FETCH_RETRY.headMs, '응답 없음');
    let r;
    try { r = await Promise.race([fetch(u, ac ? { signal: ac.signal } : undefined), killed]); } // 주소·mode 는 그대로 (index.html 의 미리 받기 재사용)
    catch (e) { throw net(e); }
    if (!r.ok) {
      try { r.body?.cancel?.().catch?.(() => {}); } catch { /* 무시 */ }
      if (r.status >= 500) throw netError(`${u}: ${r.status}`);
      return { ok: false, status: r.status, buf: null };
    }
    arm(FETCH_RETRY.stallMs, '멈춤');
    reader = r.body?.getReader?.() || null;
    if (!reader) {
      // 본문 흐름이 없는 브라우저: 통째로 (멈춤 시계는 그대로)
      try { return { ok: true, status: r.status, buf: await Promise.race([r.arrayBuffer(), killed]) }; } catch (e) { throw net(e); }
    }
    const parts = [];
    let size = 0;
    for (;;) {
      let step;
      try { step = await Promise.race([reader.read(), killed]); } catch (e) { throw net(e); }
      if (step.done) break;
      parts.push(step.value);
      size += step.value.byteLength;
      arm(FETCH_RETRY.stallMs, '멈춤');
    }
    const one = parts[0];
    if (parts.length === 1 && one.byteOffset === 0 && one.byteLength === one.buffer.byteLength) return { ok: true, status: r.status, buf: one.buffer };
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.byteLength; }
    return { ok: true, status: r.status, buf: out.buffer };
  } finally { clearTimeout(timer); }
}

/** 한 번의 시도: .gz → (없거나 못 풀면) 원본. 마지막 시도가 아니면 망 오류는 원본으로 넘기지 않고 다시 시도 */
async function attempt(url, gz, last) {
  const v = modelQuery(url);
  if (gz) {
    try {
      const r = await getOnce(`${url}.gz${v}`); // index.html 의 미리 받기(preload) 주소와 같아야 재사용됨
      if (r.ok) {
        try { return await inflate(r.buf); } catch { /* 못 풀면 원본으로 */ }
      }
    } catch (e) {
      if (!last) throw e; // 끊긴 망에서 두 배 큰 원본을 받으러 가지 않음
    }
  }
  const r = await getOnce(url + v);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.buf;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** url 의 내용을 ArrayBuffer 로 (가능하면 .gz 로 받아 풂). 망 오류는 최대 3번까지 */
export async function fetchModel(url, gz = USE_GZ) {
  const waits = FETCH_RETRY.waits;
  for (let i = 0; ; i++) {
    const last = i >= waits.length;
    try { return await attempt(url, gz, last); } catch (e) {
      if (!e?.retry || last) throw e;
      try { retryCb?.({ url, attempt: i + 2, of: waits.length + 1, why: e.message }); } catch { /* 알림 없이 */ }
      await wait(waits[i]);
    }
  }
}
