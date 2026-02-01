/**
 * speech.js — Text-to-speech for Voices and Whisper modes
 *
 * The Web Speech API's speechSynthesis is a single serial queue — one
 * utterance at a time. To get truly simultaneous overlapping voices,
 * each article is spoken inside its own hidden <iframe>, which has an
 * independent speechSynthesis context. Multiple iframes speak at once,
 * creating a genuine cacophony.
 *
 * Solo and announce modes use the main window's speechSynthesis directly.
 */

const Speech = (() => {
  let _available = 'speechSynthesis' in window;
  let _paused = false;

  // Pool of speaking iframes: articleUrl → { iframe, article, pitch, rate, volume }
  const _speakers = new Map();

  // Container for hidden iframes
  let _container = null;

  function _ensureContainer() {
    if (_container) return;
    _container = document.createElement('div');
    _container.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
    _container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_container);
  }

  /**
   * Create a hidden iframe and speak text inside it.
   * Each iframe has its own speechSynthesis — they play concurrently.
   */
  function _speakInIframe(article, text, pitch, rate, volume) {
    const url = article.url;
    if (_speakers.has(url)) return; // already speaking this article

    _ensureContainer();

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:0;height:0;border:none;';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    _container.appendChild(iframe);

    const entry = { iframe, article, pitch, rate, volume, done: false };
    _speakers.set(url, entry);

    // The iframe needs a moment to initialize its window
    iframe.addEventListener('load', () => {
      _speakInsideFrame(entry, text);
    });

    // Trigger load by writing a minimal document
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write('<!DOCTYPE html><html><head></head><body></body></html>');
      doc.close();
    }
  }

  function _speakInsideFrame(entry, text) {
    const win = entry.iframe.contentWindow;
    if (!win || !win.speechSynthesis) {
      // iframe speechSynthesis not available — clean up
      _removeSpeaker(entry.article.url);
      return;
    }

    // Mark as sounding
    entry.article.sounding = true;
    _onSoundingChange?.(entry.article, true);
    _notifySpeakingState(true);

    const utterance = new win.SpeechSynthesisUtterance(text);
    utterance.pitch = entry.pitch;
    utterance.rate = entry.rate;
    utterance.volume = entry.volume;

    utterance.onend = () => {
      entry.done = true;
      _removeSpeaker(entry.article.url);
    };

    utterance.onerror = () => {
      entry.done = true;
      _removeSpeaker(entry.article.url);
    };

    win.speechSynthesis.speak(utterance);
  }

  function _removeSpeaker(articleUrl) {
    const entry = _speakers.get(articleUrl);
    if (!entry) return;

    entry.article.sounding = false;
    _onSoundingChange?.(entry.article, false);

    // Cancel speech in the iframe if still going
    try {
      const win = entry.iframe.contentWindow;
      if (win && win.speechSynthesis) win.speechSynthesis.cancel();
    } catch (e) { /* ignore */ }

    // Remove the iframe from DOM
    entry.iframe.remove();
    _speakers.delete(articleUrl);

    // If no speakers left, notify that all TTS is done
    if (_speakers.size === 0) {
      _notifySpeakingState(false);
    }
  }

  // ── Public: Voices mode ─────────────────────────────

  function speakVoices(article) {
    if (!_available || _paused) return;
    const text = article.title + '. ' + (article.summary || '');
    const pitch = 0.5 + Math.random() * 1.5;  // 0.5–2.0
    const rate = 0.8 + Math.random() * 0.4;    // 0.8–1.2
    _speakInIframe(article, text, pitch, rate, 0.8);
  }

  // ── Public: Whisper mode ────────────────────────────

  function speakWhisper(article) {
    if (!_available || _paused) return;
    const text = article.title + '. ' + (article.summary || '');
    const pitch = 0.3 + Math.random() * 0.5;   // low, breathy
    const rate = 0.5 + Math.random() * 0.3;     // slow
    const volume = 0.15 + Math.random() * 0.15; // very quiet
    _speakInIframe(article, text, pitch, rate, volume);
  }

  // ── Public: Solo mode ───────────────────────────────

  /**
   * Speak a single article clearly, using the main window's speechSynthesis.
   * Cancels all other speech first.
   */
  function speakSolo(article) {
    if (!_available) return;
    stopAll();

    const utterance = new SpeechSynthesisUtterance(
      article.title + '. ' + (article.summary || '')
    );
    utterance.pitch = 1.0;
    utterance.rate = 0.9;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      article.sounding = true;
      _onSoundingChange?.(article, true);
      _notifySpeakingState(true);
    };

    utterance.onend = () => {
      article.sounding = false;
      _onSoundingChange?.(article, false);
      _notifySpeakingState(false);
    };

    speechSynthesis.speak(utterance);
  }

  // ── Public: Announce ────────────────────────────────

  function announce(text) {
    if (!_available) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1.0;
    utterance.rate = 1.0;
    utterance.volume = 0.9;
    utterance.onstart = () => _notifySpeakingState(true);
    utterance.onend = () => _notifySpeakingState(false);
    speechSynthesis.speak(utterance);
  }

  // ── Public: Control ─────────────────────────────────

  function stopAll() {
    // Snapshot keys first — _removeSpeaker mutates the map
    const urls = Array.from(_speakers.keys());
    for (const url of urls) {
      _removeSpeaker(url);
    }
    // Stop main window speech (solo/announce)
    speechSynthesis.cancel();
    _notifySpeakingState(false);
  }

  function pause() {
    _paused = true;
    // Pause each iframe's speechSynthesis
    for (const [, entry] of _speakers) {
      try {
        const win = entry.iframe.contentWindow;
        if (win && win.speechSynthesis) win.speechSynthesis.pause();
      } catch (e) { /* ignore */ }
    }
    speechSynthesis.pause();
  }

  function resume() {
    _paused = false;
    for (const [, entry] of _speakers) {
      try {
        const win = entry.iframe.contentWindow;
        if (win && win.speechSynthesis) win.speechSynthesis.resume();
      } catch (e) { /* ignore */ }
    }
    speechSynthesis.resume();
  }

  function isPaused() {
    return _paused;
  }

  function isAvailable() {
    return _available;
  }

  let _onSoundingChange = null;
  function onSoundingChange(cb) {
    _onSoundingChange = cb;
  }

  let _onSpeakingStateChange = null;
  function onSpeakingStateChange(cb) {
    _onSpeakingStateChange = cb;
  }

  function _notifySpeakingState(speaking) {
    _onSpeakingStateChange?.(speaking);
  }

  function isSpeaking() {
    return _speakers.size > 0 || speechSynthesis.speaking;
  }

  function currentlySpeaking() {
    return Array.from(_speakers.keys());
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
    isSpeaking,
    onSoundingChange,
    onSpeakingStateChange,
    currentlySpeaking,
  };
})();
