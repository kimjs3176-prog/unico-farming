/** 외부 파일 없이 WebAudio 로 합성한 효과음 */
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; }
  _ctx() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.enabled = false; } }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0) {
    const c = this._ctx();
    if (!c || !this.enabled) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  play(name, vol = 1) {
    const v = 0.15 * vol;
    switch (name) {
      case 'click': return this.tone(880, 0.06, 'square', v * 0.5);
      case 'dig': return this.tone(140, 0.15, 'sawtooth', v, -60);
      case 'plant': return this.tone(520, 0.1, 'triangle', v, 200);
      case 'water': { this.tone(900, 0.2, 'sine', v * 0.6, -500); return setTimeout(() => this.tone(700, 0.2, 'sine', v * 0.5, -400), 90); }
      case 'harvest': { this.tone(660, 0.1, 'triangle', v); return setTimeout(() => this.tone(990, 0.15, 'triangle', v), 100); }
      case 'coin': { this.tone(1320, 0.08, 'square', v * 0.6); return setTimeout(() => this.tone(1760, 0.12, 'square', v * 0.6), 70); }
      case 'win': return [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', v), i * 110));
      case 'bump': return this.tone(90, 0.25, 'sawtooth', v, -40);
      case 'engine': return this.tone(70, 0.6, 'sawtooth', v * 0.7, 40);
      case 'levelup': return [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'sine', v), i * 90));
    }
  }
}
