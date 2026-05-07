// Generates a two-note bell chime for new marker arrival
export function playChime() {
  try {
    const ctx = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    // Two-note chime — C5 then D5, slightly overlapping
    const notes = [
      { freq: 523.25, delay: 0,    duration: 0.7 },  // C5
      { freq: 587.33, delay: 0.12, duration: 0.8 },  // D5
    ];

    notes.forEach(({ freq, delay, duration }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      // Soft attack, long decay — bell-like
      const startTime = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    });

    // Clean up after longest note
    setTimeout(() => ctx.close(), 1200);
  } catch (e) {
    // Fail silently
  }
}

// Generates a rubber stamp / wax seal thud using Web Audio API
export function playSeal() {
  try {
    const ctx = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    const bufferSize = ctx.sampleRate * 0.12; // 120ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      // Thud envelope — fast attack, medium decay
      const envelope = Math.pow(1 - t, 1.8) * Math.min(t * 60, 1);
      // Low frequency thud
      const thud = Math.sin(2 * Math.PI * 55 * i / ctx.sampleRate);
      // Small amount of noise for texture
      const noise = (Math.random() * 2 - 1) * 0.15;
      data[i] = envelope * (thud * 0.85 + noise) * 0.55;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Low pass filter — keep it warm, remove harshness
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 1.2;

    source.connect(filter);
    filter.connect(ctx.destination);
    source.start();

    source.onended = () => ctx.close();
  } catch (e) {
    // Fail silently
  }
}

// Generates a paper rip sound programmatically using Web Audio API
export function playRip() {
  try {
    const ctx = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    const bufferSize = ctx.sampleRate * 0.18; // 180ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with a tear-like envelope
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      // Sharp attack, fast decay
      const envelope = Math.pow(1 - t, 2.8) * Math.min(t * 40, 1);
      // Mix white noise with low-frequency rumble
      const noise = (Math.random() * 2 - 1);
      const rumble = Math.sin(2 * Math.PI * 80 * i / ctx.sampleRate);
      data[i] = envelope * (noise * 0.7 + rumble * 0.3) * 0.6;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter — mid-frequency crunch
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.8;

    source.connect(filter);
    filter.connect(ctx.destination);
    source.start();

    // Clean up after playback
    source.onended = () => ctx.close();
  } catch (e) {
    // Fail silently — sound is enhancement only
  }
}
