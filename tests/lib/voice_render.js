// 시험용 작은 오프라인 합성: voice.js voice() 의 소리 그래프를 표본 단위로 따라 그림 (말소리 크기 측정)
//  파형은 배음 합(대역 제한)으로 만들고 봉우리를 1 로 맞춤, 필터는 WebAudio 와 같은 식(띠통과 Q 선형, 저역통과 Q 는 dB)
import { VOICE_PEAK } from '../../src/game/voice.js';

export const SR = 48000;

const HARM = { sine: (n) => (n === 1 ? 1 : 0), square: (n) => (n % 2 ? 4 / (Math.PI * n) : 0), sawtooth: (n) => ((n % 2 ? 1 : -1) * 2) / (Math.PI * n), triangle: (n) => (n % 2 ? ((((n - 1) / 2) % 2 ? -1 : 1) * 8) / (Math.PI * Math.PI * n * n) : 0) };

/** 파형 하나 (f0 → f1 으로 직선 미끄럼), 봉우리 1 */
function osc(type, f0, f1, len) {
  const out = new Float64Array(len), fmax = Math.max(f0, f1 || f0);
  const N = Math.max(1, Math.floor(SR / 2 / fmax));
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const f = f1 ? f0 + (f1 - f0) * (i / len) : f0;
    ph += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let n = 1; n <= N; n++) { const a = HARM[type](n); if (a) v += a * Math.sin(n * ph); }
    out[i] = v;
  }
  let pk = 0;
  for (const v of out) pk = Math.max(pk, Math.abs(v));
  if (pk > 0) for (let i = 0; i < len; i++) out[i] /= pk;
  return out;
}

function biquad(x, type, freq, q) {
  const w = (2 * Math.PI * freq) / SR, cs = Math.cos(w), sn = Math.sin(w);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'bandpass') { const al = sn / (2 * q); b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { const al = sn / (2 * Math.pow(10, q / 20)); b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** 한 음절(voiceParams 결과)을 그려 봉우리(선형) 돌려줌. 떨림 없음, 버스 앞 */
export function syllablePeak(p) {
  const len = Math.ceil(p.dur * SR), peak = VOICE_PEAK * p.gain;
  let sig = new Float64Array(len);
  const add = (s, g) => { for (let i = 0; i < len; i++) sig[i] += s[i] * g; };
  if (p.bell) { add(osc('sine', p.f0, 0, len), 1); add(osc('sine', p.f0 * 2.76, 0, len), 0.22); }
  else {
    const o = osc(p.wave, p.f0, p.glide ? p.f0 + p.glide : 0, len);
    add(biquad(o, 'bandpass', p.f1, 6), 1.6);
    add(biquad(o, 'bandpass', p.f2, 6), 1.1);
    add(o, p.wave === 'triangle' ? 0.45 : 0.22);
    if (p.sub) add(osc('sine', p.f0 / 2, p.glide ? (p.f0 + p.glide) / 2 : 0, len), 0.55);
  }
  // 봉우리: 8ms 에 올라가 dur·0.45 까지 유지, dur 에 사라짐 (지수)
  const a = 0.008 * SR, h = p.dur * 0.45 * SR;
  for (let i = 0; i < len; i++) {
    const e = i < a ? 0.0001 * Math.pow(peak / 0.0001, i / a) : i < h ? peak : peak * Math.pow(0.0001 / peak, (i - h) / (len - h));
    sig[i] *= e;
  }
  if (p.lp) sig = biquad(sig, 'lowpass', p.lp, 1);
  let pk = 0;
  for (const v of sig) pk = Math.max(pk, Math.abs(v));
  return pk;
}
