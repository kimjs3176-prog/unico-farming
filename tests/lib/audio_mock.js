// 가짜 AudioContext: 노드 연결과 게인 봉우리를 기록해 소리 크기를 어림함 (브라우저 없이)
// 어림값은 실제 소리와 다르지만, 조리법·배율이 바뀌었는지(다시 재야 하는지) 알아내는 데 씀

export class MockParam {
  constructor(v = 0) { this.value = v; this.peak = v; this.events = []; }
  _p(v) { if (v > this.peak) this.peak = v; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); this._p(v); return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); this._p(v); return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); this._p(v); return this; }
  setTargetAtTime(v, t, tau) { this.events.push(['target', v, t, tau]); this.value = v; this.peak = v; return this; }
  cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
}

function node(ctx, kind, extra = {}) {
  const n = {
    kind, outs: [], ctx,
    gain: new MockParam(1), frequency: new MockParam(440), Q: new MockParam(1), detune: new MockParam(0), pan: new MockParam(0), playbackRate: new MockParam(1),
    threshold: new MockParam(-24), knee: new MockParam(30), ratio: new MockParam(12), attack: new MockParam(0.003), release: new MockParam(0.25),
    type: '', connect(x) { this.outs.push(x); return x; }, disconnect() { this.outs.length = 0; },
    start(t = 0) { this.t0 = t; ctx.started.push(this); }, stop(t) { this.t1 = t; },
    ...extra,
  };
  ctx.made++;
  return n;
}

export class MockAudioContext {
  constructor({ state = 'running', sampleRate = 8000 } = {}) {
    this.state = state; this.currentTime = 0; this.sampleRate = sampleRate; this.made = 0; this.started = [];
    this.destination = node(this, 'dest');
    MockAudioContext.last = this;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { return node(this, 'gain'); }
  createOscillator() { return node(this, 'osc', { type: 'sine' }); }
  createBiquadFilter() { return node(this, 'filter', { type: 'lowpass' }); }
  createBufferSource() { return node(this, 'buffer', { loop: false }); }
  createDynamicsCompressor() { return node(this, 'comp'); }
  createConvolver() { return node(this, 'conv'); }
  createStereoPanner() { return node(this, 'pan'); }
  createBuffer(ch, len) { this.made++; return { length: len, getChannelData: () => new Float32Array(len) }; }
}

const OSC_RMS = { sine: 0.707, triangle: 0.577, sawtooth: 0.577, square: 1 };

/** 노드에서 출력까지 게인 곱 (잔향 길은 뺌). 필터는 노이즈 대역폭만 따짐 */
function pathGain(n, seen = new Set()) {
  if (!n.outs) return 0; // 게인 값(파라미터)으로 들어가는 떨림
  if (n.kind === 'dest') return 1;
  if (n.kind === 'conv' || seen.has(n)) return 0;
  seen.add(n);
  const own = n.kind === 'gain' ? Math.max(n.gain.peak, n.gain.value) : 1;
  let sum = 0;
  for (const o of n.outs) sum += pathGain(o, seen);
  seen.delete(n);
  return own * sum;
}

/** 노이즈가 지나는 첫 필터의 대역폭 비율 */
function noiseBand(src, sr) {
  const f = src.outs.find((o) => o.kind === 'filter');
  if (!f) return 1;
  const ny = sr / 2, fr = Math.min(f.frequency.value, ny), q = Math.max(0.3, f.Q.value);
  const bw = f.type === 'lowpass' ? fr : f.type === 'highpass' ? ny - fr : fr / q;
  return Math.sqrt(Math.max(1e-4, Math.min(1, bw / ny)));
}

/**
 * 시작한 소리들의 어림 크기(dB): 50ms 안에 시작한 소리들의 RMS 합 중 가장 큰 값
 * @param ctx MockAudioContext
 * @param from 이 번호 이후에 시작한 소리만
 */
export function estimateDb(ctx, from = 0) {
  const vs = [];
  for (const s of ctx.started.slice(from)) {
    const base = s.kind === 'osc' ? OSC_RMS[s.type] ?? 0.7 : s.kind === 'buffer' ? 0.577 * noiseBand(s, 44100) : 0;
    if (!base) continue;
    vs.push({ t: s.t0 || 0, a: base * pathGain(s) });
  }
  let best = 0;
  for (const v of vs) {
    let e = 0;
    for (const w of vs) if (w.t >= v.t - 1e-9 && w.t < v.t + 0.05) e += w.a * w.a;
    best = Math.max(best, Math.sqrt(e));
  }
  return 20 * Math.log10(Math.max(best, 1e-9));
}
