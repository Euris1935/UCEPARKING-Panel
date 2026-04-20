/**
 * Utilities for audio notifications.
 * Uses Web Audio API to generate sounds without external assets.
 * Optimized with Singleton pattern to reduce latency and handle browser autoplay policies.
 */

let audioCtx = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

// Auto-resume on first user interaction to unlock audio
if (typeof window !== 'undefined') {
  const unlock = () => {
    initAudio();
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('click', unlock);
  window.addEventListener('keydown', unlock);
}

export const playBeep = (force = false) => {
  try {
    const cfg = JSON.parse(localStorage.getItem('appSettings') || '{}');
    if (!force && cfg.notificacionesSonoras === false) return;

    const ctx = initAudio();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
};
