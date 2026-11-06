/**
 * 무료 플랜 사용량 장부 (렌더링·네트워크 무관 — tests/budget.test.js)
 * Cloudflare Durable Objects 무료 플랜 (2026-11 공식 요금표 기준, 바뀔 수 있음):
 *   - 요청 하루 100,000건 (HTTP 요청·WebSocket 연결, 받은 WebSocket 메시지는 20개 = 1건, 보낸 메시지는 무료)
 *   - 실행 시간 하루 13,000 GB-s (객체 하나 128MB 기준 → 깨어 있는 시간 104,000초). 잠든(hibernation) 동안은 0
 *   - 하루 기준은 UTC 0시(한국 오전 9시)에 초기화, 넘으면 그날은 오류
 * 방마다 쓴 양을 1분마다 장부(ledger) 객체에 모아, 전체가 안전선(85%)을 넘으면 그날은 새 접속을 받지 않음
 */
export const FREE = { requests: 100000, gbs: 13000, memGB: 0.128, wsRatio: 20 };
export const SAFETY = 0.85;
export const IDLE_SLEEP_MS = 10000; // 메시지가 이만큼 없으면 잠든다고 보고 깨어 있는 시간 계산을 멈춤

export const dayOf = (now) => Math.floor(now / 86400000);
/** 다음 초기화 시각 (UTC 0시) */
export const nextReset = (now) => (dayOf(now) + 1) * 86400000;

/** 하루 한도 (wrangler.toml [vars] 로 줄일 수 있음: BUDGET_REQUESTS, BUDGET_AWAKE_SEC) */
export function limits(env = {}) {
  const req = +env.BUDGET_REQUESTS > 0 ? +env.BUDGET_REQUESTS : Math.floor(FREE.requests * SAFETY);
  const awake = +env.BUDGET_AWAKE_SEC > 0 ? +env.BUDGET_AWAKE_SEC : Math.floor((FREE.gbs / FREE.memGB) * SAFETY);
  return { requests: req, awakeSec: awake };
}

/** 방 하나가 쓰는 양을 세는 계량기 (1분마다 장부로 넘기고 0으로) */
export class Meter {
  constructor(now = Date.now()) { this.reset(); this.last = now; this.reported = now; }
  reset() { this.fetches = 0; this.msgs = 0; this.awakeMs = 0; }
  /** 일어난 일 하나 (fetch 또는 받은 메시지): 직전 일과의 간격만큼 깨어 있었다고 봄(잠들기 전 10초까지) */
  tick(now, kind) {
    this.awakeMs += Math.min(Math.max(0, now - this.last), IDLE_SLEEP_MS);
    this.last = now;
    if (kind === 'fetch') this.fetches++;
    else if (kind === 'msg') this.msgs++;
  }
  /** 장부에 넘길 때인가 (1분마다, 쓴 게 있을 때만) */
  due(now, every = 60000) { return now - this.reported >= every && !!(this.fetches || this.msgs || this.awakeMs); }
  /** 넘길 내용 → 요청 수로 환산 */
  take(now) {
    const r = { requests: this.fetches + this.msgs / FREE.wsRatio, awakeSec: this.awakeMs / 1000 };
    this.reset(); this.reported = now;
    return r;
  }
}

/** 장부: 하루치 합계 (UTC 0시에 새로) */
export function addToLedger(book, report, now, lim) {
  const day = dayOf(now);
  const b = book && book.day === day ? { ...book } : { day, requests: 0, awakeSec: 0 };
  b.requests += Math.max(0, +report.requests || 0) + 1; // 장부에 넘기는 요청 자체도 1건
  b.awakeSec += Math.max(0, +report.awakeSec || 0);
  b.over = b.requests >= lim.requests || b.awakeSec >= lim.awakeSec;
  return b;
}
