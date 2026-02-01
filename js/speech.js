/**
 * speech.js — Formant Synthesis Edition
 * 
 * Replaces system TTS with a Web Audio formant synthesizer.
 * This allows for unlimited concurrent voices without OS-level serialization.
 */

const Speech = (() => {
  let _ctx = null;
  let _paused = false;
  const _speakers = new Map(); // articleUrl -> { stop: fn, article: obj }

  // Vowel formant frequencies (F1, F2, F3) for "neutral", "a", "i", "u"
  const VOWELS = [
    [500, 1500, 2500], // Neutral
    [700, 1200, 2400], // 'a'
    [300, 2300, 2900], // 'i'
    [350, 800, 2200]   // 'u'
  ];

  function _initContext() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
  }

  /**
   * The core synthesizer engine
   */
  function _createFormantVoice(text, options = {}) {
    _initContext();
    const {
      pitch = 120,    // Base frequency (Hz)
      speed = 0.15,   // Seconds per "syllable"
      isWhisper = false,
      volume = 0.5
    } = options;

    const masterGain = _ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(_ctx.destination);

    // 1. Source: Sawtooth for voiced, Noise for whisper
    let source;
    if (isWhisper) {
      source = _ctx.createBufferSource();
      const bufferSize = _ctx.sampleRate * 2;
      const buffer = _ctx.createBuffer(1, bufferSize, _ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      source.buffer = buffer;
      source.loop = true;
    } else {
      source = _ctx.createOscillator();
      source.type = 'sawtooth';
      source.frequency.value = pitch;
      // Add slight vibrato
      const lfo = _ctx.createOscillator();
      const lfoGain = _ctx.createGain();
      lfo.frequency.value = 5;
      lfoGain.gain.value = pitch * 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(source.frequency);
      lfo.start();
    }

    // 2. Formant Filters (Parallel Bandpass)
    const filters = VOWELS[0].map((freq, i) => {
      const f = _ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 10; // Resonance
      source.connect(f);
      f.connect(masterGain);
      return f;
    });

    // 3. Animation Logic (The "Speaking" Rhythm)
    const words = text.split(/\s+/);
    const startTime = _ctx.currentTime + 0.05;
    let cursor = startTime;

    words.forEach((word, wordIdx) => {
      // Each word consists of "syllables" based on length
      const syllables = Math.ceil(word.length / 3);
      
      for (let s = 0; s < syllables; s++) {
        const dur = speed * (0.8 + Math.random() * 0.4);
        const nextVowel = VOWELS[Math.floor(Math.random() * VOWELS.length)];

        // Morph formants to new vowel
        filters.forEach((f, i) => {
          f.frequency.exponentialRampToValueAtTime(nextVowel[i], cursor + dur * 0.5);
        });

        // Envelope: "Ta-ka-ta" amplitude shape
        masterGain.gain.linearRampToValueAtTime(volume, cursor + dur * 0.1);
        masterGain.gain.linearRampToValueAtTime(volume * 0.3, cursor + dur * 0.9);
        
        cursor += dur;
      }
      cursor += speed; // tiny pause between words
    });

    // End of speech
    masterGain.gain.linearRampToValueAtTime(0, cursor + 0.1);
    
    source.start(startTime);
    const stopTimeout = setTimeout(() => {
      source.stop();
      source.disconnect();
    }, (cursor - _ctx.currentTime + 1) * 1000);

    return {
      stop: () => {
        clearTimeout(stopTimeout);
        try { source.stop(); } catch(e){}
        masterGain.disconnect();
      },
      duration: cursor - _ctx.currentTime
    };
  }

  // ── Public API ──────────────────────────────────────

  function speakVoices(article) {
    if (_speakers.has(article.url)) return;
    
    const pitch = 80 + Math.random() * 160;
    const voice = _createFormantVoice(article.title + " " + (article.summary || ""), {
      pitch: pitch,
      speed: 0.12 + Math.random() * 0.05,
      volume: 0.6
    });

    _handleVoiceStart(article, voice);
  }

  function speakWhisper(article) {
    if (_speakers.has(article.url)) return;

    const voice = _createFormantVoice(article.title, {
      isWhisper: true,
      speed: 0.2,
      volume: 0.2
    });

    _handleVoiceStart(article, voice);
  }

  function _handleVoiceStart(article, voice) {
    article.sounding = true;
    _onSoundingChange?.(article, true);
    
    const entry = {
      article,
      stop: () => {
        voice.stop();
        article.sounding = false;
        _onSoundingChange?.(article, false);
        _speakers.delete(article.url);
        if (_speakers.size === 0) _notifySpeakingState(false);
      }
    };

    _speakers.set(article.url, entry);
    _notifySpeakingState(true);

    // Auto-cleanup when duration ends
    setTimeout(() => entry.stop(), voice.duration * 1000);
  }

  function stopAll() {
    for (const entry of _speakers.values()) {
      entry.stop();
    }
    _speakers.clear();
    _notifySpeakingState(false);
  }

  function pause() {
    if (_ctx) _ctx.suspend();
    _paused = true;
  }

  function resume() {
    if (_ctx) _ctx.resume();
    _paused = false;
  }

  // Fallback for Solo/Announce: Use standard TTS if clarity is needed, 
  // or use the synth with a fixed, clear setting.
  function speakSolo(article) {
    stopAll();
    const voice = _createFormantVoice(article.title + ". " + (article.summary || ""), {
      pitch: 110,
      speed: 0.16,
      volume: 1.0
    });
    _handleVoiceStart(article, voice);
  }

  function announce(text) {
    _createFormantVoice(text, { pitch: 150, speed: 0.1, volume: 0.8 });
  }

  // Boilerplate helpers
  let _onSoundingChange = null;
  let _onSpeakingStateChange = null;
  const onSoundingChange = (cb) => _onSoundingChange = cb;
  const onSpeakingStateChange = (cb) => _onSpeakingStateChange = cb;
  const _notifySpeakingState = (s) => _onSpeakingStateChange?.(s);
  const isAvailable = () => true;
  const isPaused = () => _paused;
  const isSpeaking = () => _speakers.size > 0;
  const currentlySpeaking = () => Array.from(_speakers.keys());

  return {
    speakVoices, speakWhisper, speakSolo, announce,
    stopAll, pause, resume, isPaused, isAvailable, 
    isSpeaking, onSoundingChange, onSpeakingStateChange, currentlySpeaking
  };
})();
