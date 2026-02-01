/**
 * sonification.js — Web Audio engine for drone, musical, and whisper modes
 *
 * Creates and manages audio nodes that sonify article data in three
 * distinct modes: ambient drones, generative music, and ghostly whispers.
 */

const Sonification = (() => {
  let _ctx = null;       // AudioContext
  let _master = null;    // GainNode — master volume
  let _compressor = null; // DynamicsCompressorNode — prevents clipping
  let _convolver = null; // ConvolverNode — reverb for whisper/music modes
  let _volume = 0.7;
  let _active = false;

  // Map of articleUrl → { nodes, article }
  const _voices = new Map();

  // Pentatonic scale ratios (C, D, E, G, A across octaves)
  const PENTATONIC = [
    130.81, 146.83, 164.81, 196.00, 220.00,  // C3–A3
    261.63, 293.66, 329.63, 392.00, 440.00,  // C4–A4
    523.25, 587.33, 659.25, 783.99, 880.00,  // C5–A5
  ];

  /**
   * Initialize the audio context and master chain.
   * Must be called from a user gesture.
   */
  function init() {
    if (_ctx) return;
    _ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master chain: compressor → gain → destination
    _compressor = _ctx.createDynamicsCompressor();
    _compressor.threshold.value = -20;
    _compressor.knee.value = 12;
    _compressor.ratio.value = 8;
    _compressor.attack.value = 0.003;
    _compressor.release.value = 0.25;

    _master = _ctx.createGain();
    _master.gain.value = _volume;

    _compressor.connect(_master);
    _master.connect(_ctx.destination);

    // Generate synthetic impulse response for reverb
    _convolver = _ctx.createConvolver();
    _convolver.buffer = _createReverbImpulse(2.5, 3.0);
    _convolver.connect(_compressor);
  }

  /**
   * Create a synthetic reverb impulse response.
   */
  function _createReverbImpulse(duration, decay) {
    const length = _ctx.sampleRate * duration;
    const buf = _ctx.createBuffer(2, length, _ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buf;
  }

  /**
   * Compute a stereo pan value from user position to article position.
   * Returns -1 (left) to 1 (right) based on bearing.
   */
  function _computePan(userLat, userLon, articleLat, articleLon) {
    if (articleLat == null || articleLon == null) return 0;
    const dLon = (articleLon - userLon) * Math.cos(userLat * Math.PI / 180);
    const dLat = articleLat - userLat;
    const bearing = Math.atan2(dLon, dLat); // radians, 0 = north
    return Math.sin(bearing); // project onto left-right axis
  }

  // ── DRONE MODE ──────────────────────────────────────

  function _startDrone(article, userLat, userLon) {
    const url = article.url;
    if (_voices.has(url)) return;

    // Map distance to frequency: closer = lower drone
    const dist = article.distance || 5;
    const freq = 60 + (dist / 10) * 180; // 60–240 Hz range

    // Map summary length to volume
    const textLen = (article.summary || '').length;
    const vol = Math.min(0.15 + (textLen / 500) * 0.25, 0.4);

    // Waveform selection based on title hash
    const waveforms = ['sine', 'triangle', 'sawtooth', 'square'];
    const hash = article.title.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
    const waveform = waveforms[hash % waveforms.length];

    // Create oscillator → filter → panner → gain → compressor
    const osc = _ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = freq;

    // Slow LFO for subtle frequency drift
    const lfo = _ctx.createOscillator();
    lfo.frequency.value = 0.1 + Math.random() * 0.3;
    const lfoGain = _ctx.createGain();
    lfoGain.gain.value = freq * 0.02; // 2% drift
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Low-pass filter to soften harsh waveforms
    const filter = _ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 3;
    filter.Q.value = 1;

    const panner = _ctx.createStereoPanner();
    panner.pan.value = _computePan(userLat, userLon, article.lat, article.lon);

    const gain = _ctx.createGain();
    gain.gain.setValueAtTime(0, _ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, _ctx.currentTime + 3); // fade in

    osc.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(_compressor);

    osc.start();
    lfo.start();

    _voices.set(url, {
      nodes: { osc, lfo, lfoGain, filter, panner, gain },
      article,
    });
  }

  // ── MUSICAL MODE ────────────────────────────────────

  function _startMusical(article, userLat, userLon) {
    const url = article.url;
    if (_voices.has(url)) return;

    // Pick note from pentatonic scale based on distance
    const dist = article.distance || 5;
    const noteIndex = Math.min(
      Math.floor((dist / 12) * PENTATONIC.length),
      PENTATONIC.length - 1
    );
    const freq = PENTATONIC[noteIndex];

    // Rhythm interval derived from summary word count
    const wordCount = (article.summary || '').split(/\s+/).length;
    const interval = 2000 + (wordCount % 20) * 300; // 2–8 seconds

    const panner = _ctx.createStereoPanner();
    panner.pan.value = _computePan(userLat, userLon, article.lat, article.lon);

    // Pluck function: create a short tone with envelope
    function pluck() {
      if (!_active) return;
      const osc = _ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const env = _ctx.createGain();
      const now = _ctx.currentTime;
      env.gain.setValueAtTime(0.25, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      // Bell-like filter
      const filter = _ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq * 2;
      filter.Q.value = 5;

      osc.connect(filter);
      filter.connect(env);
      env.connect(panner);
      panner.connect(_convolver); // through reverb

      osc.start(now);
      osc.stop(now + 1.5);
    }

    // First pluck immediately, then repeat
    pluck();
    const timer = setInterval(pluck, interval);

    _voices.set(url, {
      nodes: { panner, timer },
      article,
    });
  }

  // ── PUBLIC API ──────────────────────────────────────

  /**
   * Add articles to the current sonification mode.
   * @param {'drone'|'musical'} mode
   * @param {Array} articles
   * @param {number} userLat
   * @param {number} userLon
   */
  function play(mode, articles, userLat, userLon) {
    if (!_ctx) init();
    if (_ctx.state === 'suspended') _ctx.resume();
    _active = true;

    for (const article of articles) {
      if (mode === 'drone') {
        _startDrone(article, userLat, userLon);
      } else if (mode === 'musical') {
        _startMusical(article, userLat, userLon);
      }
    }
  }

  /**
   * Stop and clean up all currently playing voices.
   */
  function stopAll() {
    _active = false;
    for (const [url, voice] of _voices) {
      _cleanup(voice);
    }
    _voices.clear();
  }

  function _cleanup(voice) {
    const n = voice.nodes;
    try {
      if (n.osc) { n.osc.stop(); n.osc.disconnect(); }
      if (n.lfo) { n.lfo.stop(); n.lfo.disconnect(); }
      if (n.lfoGain) n.lfoGain.disconnect();
      if (n.filter) n.filter.disconnect();
      if (n.panner) n.panner.disconnect();
      if (n.gain) {
        n.gain.gain.linearRampToValueAtTime(0, _ctx.currentTime + 0.5);
        setTimeout(() => n.gain.disconnect(), 600);
      }
      if (n.timer) clearInterval(n.timer);
    } catch (e) {
      // nodes may already be stopped
    }
  }

  /**
   * Remove a single article voice.
   */
  function stopOne(articleUrl) {
    const voice = _voices.get(articleUrl);
    if (voice) {
      _cleanup(voice);
      _voices.delete(articleUrl);
    }
  }

  /**
   * Set master volume (0–1).
   */
  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    if (_master) {
      _master.gain.linearRampToValueAtTime(_volume, _ctx.currentTime + 0.1);
    }
  }

  function getVolume() {
    return _volume;
  }

  /**
   * Check if an article is currently sounding.
   */
  function isSounding(articleUrl) {
    return _voices.has(articleUrl);
  }

  /**
   * Get the AudioContext (needed by whisper mode in speech.js).
   */
  function getContext() {
    if (!_ctx) init();
    return _ctx;
  }

  function getCompressor() {
    return _compressor;
  }

  function getConvolver() {
    return _convolver;
  }

  function isActive() {
    return _active;
  }

  return {
    init,
    play,
    stopAll,
    stopOne,
    setVolume,
    getVolume,
    isSounding,
    getContext,
    getCompressor,
    getConvolver,
    isActive,
  };
})();
