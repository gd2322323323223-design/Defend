/**
 * 音效 — Web Audio API 合成短音效（無需外部檔案）
 */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this._unlocked = false;
  }

  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._unlocked = true;
  }

  _tone(freq, duration, { type = 'sine', gain = 0.12, delay = 0 } = {}) {
    if (!this.enabled || !this._unlocked || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  playCorrect() {
    this._tone(660, 0.08, { type: 'triangle', gain: 0.1 });
    this._tone(880, 0.1, { type: 'triangle', gain: 0.08, delay: 0.06 });
  }

  playWrong() {
    this._tone(180, 0.15, { type: 'sawtooth', gain: 0.07 });
  }

  playCrit() {
    this._tone(523, 0.06, { gain: 0.11 });
    this._tone(784, 0.06, { gain: 0.11, delay: 0.05 });
    this._tone(1047, 0.12, { gain: 0.1, delay: 0.1 });
  }

  playThorns() {
    this._tone(440, 0.1, { type: 'square', gain: 0.06 });
    this._tone(330, 0.15, { type: 'square', gain: 0.07, delay: 0.08 });
  }

  playArmorBreak() {
    this._tone(220, 0.12, { type: 'sawtooth', gain: 0.09 });
    this._tone(165, 0.2, { type: 'sawtooth', gain: 0.08, delay: 0.1 });
  }

  playFreeze() {
    this._tone(1200, 0.08, { type: 'sine', gain: 0.07 });
    this._tone(900, 0.15, { type: 'sine', gain: 0.06, delay: 0.07 });
  }

  playBossAttack() {
    this._tone(110, 0.25, { type: 'sawtooth', gain: 0.09 });
  }

  playVictory() {
    [523, 659, 784, 1047].forEach((f, i) => {
      this._tone(f, 0.15, { gain: 0.09, delay: i * 0.12 });
    });
  }
}

export const sound = new SoundManager();
