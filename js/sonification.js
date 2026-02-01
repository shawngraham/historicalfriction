/**
 * sonification.js — Reactive Web Audio engine
 * 
 * Now listens to the Wikipedia Recent Changes stream to modulate
 * drones and trigger generative musical "glimmers" based on global edits.
 */

const Sonification = (() => {
  let _ctx = null;
  let _master = null;
  let _compressor = null;
  let _convolver = null;
  let _volume = 0.7;
  let _active = false;

  // Real-time Stream State
  let _eventSource = null;
  let _globalFriction = 0; // 0 (calm) to 1 (intense activity)
  const _voices = new Map();

  const PENTATONIC = [
    130.81, 146.83, 164.81, 196.00, 220.00, 
    261.63, 293.66, 329.63, 392.00, 440.00, 
    523.25, 587.33, 659.25, 783.99, 880.00,
    1046.50, 1174.66, 1318.51 // High "glimmer" range
  ];

  function init() {
    if (_ctx) return;
    _ctx = new (window.AudioContext || window.webkitAudioContext)();

    _compressor = _ctx.createDynamicsCompressor();
    _compressor.threshold.value = -24;
    _compressor.knee.value = 30;
    _compressor.ratio.value = 12;
    _master = _ctx.createGain();
    _master.gain.value = _volume;

    _compressor.connect(_master);
    _master.connect(_ctx.destination);

    _convolver = _ctx.createConvolver();
    _convolver.buffer = _createReverbImpulse(3.0, 4.0);
    _convolver.connect(_compressor);

    _initStreamListener();
    _updateLoop();
  }

  /**
   * Listen to the pulse of global Wikipedia edits
   */
  function _initStreamListener() {
    if (_eventSource) return;
    _eventSource = new EventSource('https://stream.wikimedia.org/v2/stream/recentchange');
    
    _eventSource.onmessage = (event) => {
      if (!_active) return;
      const data = JSON.parse(event.data);
      
      // Calculate "Friction Impact" based on edit size
      const changeSize = Math.abs((data.length?.new || 0) - (data.length?.old || 0));
      const impact = Math.min(changeSize / 1000, 1.0);
      
      // Add to global friction energy
      _globalFriction = Math.min(1.0, _globalFriction + (0.05 + impact * 0.1));

      // In Musical mode, large edits trigger an immediate "Glimmer"
      if (impact > 0.3 && _active) {
        _triggerGlimmer(impact);
      }
    };
  }

  /**
   * Smoothly decay global friction over time
   */
  function _updateLoop() {
    _globalFriction *= 0.98; // Decay rate
    
    // Modulate all active drones based on global friction
    for (const voice of _voices.values()) {
      if (voice.type === 'drone' && voice.nodes.filter) {
        // As friction increases, the filter opens up (600Hz to 3000Hz)
        const baseFreq = voice.baseFreq * 2;
        const targetFreq = baseFreq + (_globalFriction * 4000);
        voice.nodes.filter.frequency.setTargetAtTime(targetFreq, _ctx.currentTime, 0.1);
      }
    }
    requestAnimationFrame(_updateLoop);
  }

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

  function _computePan(userLat, userLon, articleLat, articleLon) {
    if (articleLat == null || articleLon == null) return 0;
    const dLon = (articleLon - userLon) * Math.cos(userLat * Math.PI / 180);
    const dLat = articleLat - userLat;
    return Math.sin(Math.atan2(dLon, dLat));
  }

  // ── DRONE MODE (Reactive) ───────────────────────────

  function _startDrone(article, userLat, userLon) {
    const url = article.url;
    if (_voices.has(url)) return;

    const dist = article.distance || 5;
    const freq = 55 + (dist / 10) * 110; // Low frequency base
    const waveforms = ['sine', 'triangle', 'sawtooth'];
    const hash = article.title.length;
    
    const osc = _ctx.createOscillator();
    osc.type = waveforms[hash % waveforms.length];
    osc.frequency.value = freq;

    const filter = _ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 2;
    filter.Q.value = 2;

    const panner = _ctx.createStereoPanner();
    panner.pan.value = _computePan(userLat, userLon, article.lat, article.lon);

    const gain = _ctx.createGain();
    gain.gain.setValueAtTime(0, _ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, _ctx.currentTime + 4);

    osc.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(_compressor);

    osc.start();
    _voices.set(url, {
      type: 'drone',
      baseFreq: freq,
      nodes: { osc, filter, panner, gain },
      article
    });
  }

  // ── MUSICAL MODE (Generative) ───────────────────────

  function _startMusical(article, userLat, userLon) {
    const url = article.url;
    if (_voices.has(url)) return;

    const dist = article.distance || 5;
    const noteIndex = Math.floor((dist / 12) * (PENTATONIC.length - 5));
    const freq = PENTATONIC[noteIndex];
    const interval = 3000 + (Math.random() * 5000);

    const panner = _ctx.createStereoPanner();
    panner.pan.value = _computePan(userLat, userLon, article.lat, article.lon);

    const pluck = () => {
      if (!_active) return;
      const osc = _ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, _ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.98, _ctx.currentTime + 1);

      const env = _ctx.createGain();
      env.gain.setValueAtTime(0, _ctx.currentTime);
      env.gain.linearRampToValueAtTime(0.15, _ctx.currentTime + 0.05);
      env.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + 2);

      osc.connect(env);
      env.connect(panner);
      panner.connect(_convolver);
      
      osc.start();
      osc.stop(_ctx.currentTime + 2.1);
    };

    const timer = setInterval(pluck, interval);
    pluck();

    _voices.set(url, {
      type: 'music',
      nodes: { panner, timer },
      article
    });
  }

  /**
   * Triggered by Global Wikipedia Edits.
   * Creates a "glimmer" — a high frequency sparkle in the reverb.
   */
  function _triggerGlimmer(impact) {
    const note = PENTATONIC[Math.floor(Math.random() * 5) + (PENTATONIC.length - 6)];
    const osc = _ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = note;

    const env = _ctx.createGain();
    env.gain.setValueAtTime(0, _ctx.currentTime);
    env.gain.linearRampToValueAtTime(0.1 * impact, _ctx.currentTime + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + 0.5);

    const panner = _ctx.createStereoPanner();
    panner.pan.value = (Math.random() * 2) - 1;

    osc.connect(env);
    env.connect(panner);
    panner.connect(_convolver);

    osc.start();
    osc.stop(_ctx.currentTime + 0.6);
  }

  // ── PUBLIC API ──────────────────────────────────────

  function play(mode, articles, userLat, userLon) {
    if (!_ctx) init();
    if (_ctx.state === 'suspended') _ctx.resume();
    _active = true;

    for (const article of articles) {
      if (mode === 'drone') _startDrone(article, userLat, userLon);
      else if (mode === 'musical') _startMusical(article, userLat, userLon);
    }
  }

  function stopAll() {
    _active = false;
    for (const [url, voice] of _voices) {
      _cleanup(voice);
    }
    _voices.clear();
  }

  function _cleanup(voice) {
    const n = voice.nodes;
    if (n.osc) { try { n.osc.stop(); n.osc.disconnect(); } catch(e){} }
    if (n.filter) n.filter.disconnect();
    if (n.panner) n.panner.disconnect();
    if (n.gain) n.gain.disconnect();
    if (n.timer) clearInterval(n.timer);
  }

  function stopOne(articleUrl) {
    const voice = _voices.get(articleUrl);
    if (voice) {
      _cleanup(voice);
      _voices.delete(articleUrl);
    }
  }

  return {
    init, play, stopAll, stopOne,
    setVolume: (v) => { _volume = v; if (_master) _master.gain.value = v; },
    getVolume: () => _volume,
    getContext: () => { if (!_ctx) init(); return _ctx; },
    isActive: () => _active
  };
})();
