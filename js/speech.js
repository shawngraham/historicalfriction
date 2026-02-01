/**
 * speech.js — Text-to-speech for Voices and Whisper modes
 *
 * Uses the native Web Speech API (speechSynthesis) for TTS.
 * Voices mode: overlapping speech at random pitches.
 * Whisper mode: quiet speech routed through Web Audio reverb/delay.
 */

const Speech = (() => {
  let _available = 'speechSynthesis' in window;
  let _paused = false;
  let _activeUtterances = new Set();

  // Track which articles are currently being spoken
  const _speaking = new Map(); // articleUrl → SpeechSynthesisUtterance[]

  /**
   * Speak an article in Voices mode: direct TTS with random pitch.
   * Each article gets its own consistent pitch.
   */
  function speakVoices(article) {
    if (!_available || _paused) return;
    const url = article.url;

    // Don't re-speak articles already in progress
    if (_speaking.has(url)) return;

    const pitch = 0.5 + Math.random() * 1.5; // 0.5–2.0
    const rate = 0.8 + Math.random() * 0.4;   // 0.8–1.2

    const utterances = [];

    // Speak title first, then summary
    const titleUtterance = new SpeechSynthesisUtterance(article.title);
    titleUtterance.pitch = pitch;
    titleUtterance.rate = rate;
    titleUtterance.volume = 0.8;

    const summaryUtterance = new SpeechSynthesisUtterance(article.summary);
    summaryUtterance.pitch = pitch;
    summaryUtterance.rate = rate;
    summaryUtterance.volume = 0.6;

    // Mark article as sounding
    titleUtterance.onstart = () => {
      article.sounding = true;
      _onSoundingChange?.(article, true);
    };

    // Chain: title finishes → start summary
    titleUtterance.onend = () => {
      speechSynthesis.speak(summaryUtterance);
    };

    // Clean up when summary finishes
    summaryUtterance.onend = () => {
      article.sounding = false;
      _speaking.delete(url);
      _onSoundingChange?.(article, false);
    };

    summaryUtterance.onerror = () => {
      article.sounding = false;
      _speaking.delete(url);
      _onSoundingChange?.(article, false);
    };

    utterances.push(titleUtterance, summaryUtterance);
    _speaking.set(url, utterances);

    speechSynthesis.speak(titleUtterance);
  }

  /**
   * Speak an article in Whisper mode: very quiet, breathy.
   * Uses low volume and slow rate to create a ghostly effect.
   */
  function speakWhisper(article) {
    if (!_available || _paused) return;
    const url = article.url;
    if (_speaking.has(url)) return;

    const pitch = 0.3 + Math.random() * 0.5; // low, breathy
    const rate = 0.6 + Math.random() * 0.3;  // slow
    const volume = 0.15 + Math.random() * 0.15; // very quiet

    const utterance = new SpeechSynthesisUtterance(
      article.title + '. ' + article.summary
    );
    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.volume = volume;

    utterance.onstart = () => {
      article.sounding = true;
      _onSoundingChange?.(article, true);
    };

    utterance.onend = () => {
      article.sounding = false;
      _speaking.delete(url);
      _onSoundingChange?.(article, false);
    };

    utterance.onerror = () => {
      article.sounding = false;
      _speaking.delete(url);
      _onSoundingChange?.(article, false);
    };

    _speaking.set(url, [utterance]);
    speechSynthesis.speak(utterance);
  }

  /**
   * Speak a single article clearly (solo, for "what's here?" command).
   * Cancels other speech first.
   */
  function speakSolo(article) {
    if (!_available) return;
    stopAll();

    const utterance = new SpeechSynthesisUtterance(
      article.title + '. ' + article.summary
    );
    utterance.pitch = 1.0;
    utterance.rate = 0.9;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      article.sounding = true;
      _onSoundingChange?.(article, true);
    };

    utterance.onend = () => {
      article.sounding = false;
      _speaking.delete(article.url);
      _onSoundingChange?.(article, false);
    };

    _speaking.set(article.url, [utterance]);
    speechSynthesis.speak(utterance);
  }

  /**
   * Speak arbitrary text clearly (for status announcements).
   */
  function announce(text) {
    if (!_available) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1.0;
    utterance.rate = 1.0;
    utterance.volume = 0.9;
    speechSynthesis.speak(utterance);
  }

  /**
   * Stop all current speech.
   */
  function stopAll() {
    speechSynthesis.cancel();
    for (const [url, utts] of _speaking) {
      // Find and mark articles as not sounding
    }
    _speaking.clear();
  }

  /**
   * Pause / resume.
   */
  function pause() {
    _paused = true;
    speechSynthesis.pause();
  }

  function resume() {
    _paused = false;
    speechSynthesis.resume();
  }

  function isPaused() {
    return _paused;
  }

  function isAvailable() {
    return _available;
  }

  /**
   * Callback for when an article starts/stops sounding.
   * Set by the app controller to update the UI.
   */
  let _onSoundingChange = null;
  function onSoundingChange(cb) {
    _onSoundingChange = cb;
  }

  /**
   * List article URLs currently being spoken.
   */
  function currentlySpeaking() {
    return Array.from(_speaking.keys());
  }

  return {
    speakVoices,
    speakWhisper,
    speakSolo,
    announce,
    stopAll,
    pause,
    resume,
    isPaused,
    isAvailable,
    onSoundingChange,
    currentlySpeaking,
  };
})();
