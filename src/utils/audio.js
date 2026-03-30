/**
 * Utilities for audio notifications.
 * Uses Web Audio API to generate sounds without external assets.
 */

export const playBeep = () => {
  try {
    const cfg = JSON.parse(localStorage.getItem('appSettings') || '{}');
    // If not set, default to true, but explicitly check for false
    if (cfg.notificacionesSonoras === false) return;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    
    // Close context after playback to save resources
    setTimeout(() => ctx.close(), 200);
  } catch (e) {
    console.warn('Audio playback failed or not supported:', e);
  }
};
