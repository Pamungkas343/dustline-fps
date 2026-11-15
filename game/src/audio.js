// audio.js — all sounds are synthesized with WebAudio. No audio files, no network.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function noiseBurst(dur, filterFreq, gain, type) {
    if (!ensure() || muted) return;
    resume();
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }
  function tone(freq, dur, gain, type, slideTo) {
    if (!ensure() || muted) return;
    resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    unlock() { ensure(); resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.35; },
    shot(kind) {
      if (kind === 'shotgun') { noiseBurst(0.22, 900, 0.9); tone(90, 0.18, 0.5, 'sine', 40); }
      else if (kind === 'smg') { noiseBurst(0.08, 2400, 0.45); tone(220, 0.05, 0.25, 'square', 120); }
      else if (kind === 'pistol') { noiseBurst(0.12, 1800, 0.6); tone(160, 0.08, 0.3, 'square', 70); }
      else { noiseBurst(0.11, 1600, 0.7); tone(140, 0.09, 0.35, 'sawtooth', 60); }
    },
    dry() { tone(1200, 0.03, 0.2, 'square'); },
    reload() { tone(500, 0.05, 0.25, 'square'); setTimeout(() => tone(700, 0.05, 0.25, 'square'), 180); },
    hit(head) { tone(head ? 1500 : 1000, 0.06, 0.3, 'sine'); },
    hurt() { tone(180, 0.15, 0.4, 'sawtooth', 90); },
    plant() { tone(880, 0.08, 0.3, 'sine'); setTimeout(() => tone(880, 0.08, 0.3, 'sine'), 120); },
    beep() { tone(1100, 0.07, 0.25, 'sine'); },
    explode() { noiseBurst(0.9, 300, 1.0); tone(60, 0.8, 0.8, 'sine', 30); },
    win() { tone(523, 0.14, 0.3, 'sine'); setTimeout(() => tone(784, 0.2, 0.3, 'sine'), 140); },
    lose() { tone(392, 0.16, 0.3, 'sine'); setTimeout(() => tone(262, 0.28, 0.3, 'sine'), 160); },
    click() { tone(900, 0.04, 0.2, 'square'); },
    buy() { tone(660, 0.07, 0.25, 'sine'); setTimeout(() => tone(990, 0.09, 0.25, 'sine'), 90); },
    step() { noiseBurst(0.03, 500, 0.08); },
  };
}
