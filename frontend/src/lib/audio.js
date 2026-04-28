// Web Audio API ping for critical alerts.
let _ctx = null;
function ctx() {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  return _ctx;
}

export function ping({ frequency = 880, duration = 0.18, volume = 0.18 } = {}) {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  osc.connect(gain).connect(c.destination);
  const now = c.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function pingCritical() {
  ping({ frequency: 1100, duration: 0.16 });
  setTimeout(() => ping({ frequency: 720, duration: 0.18 }), 180);
}
