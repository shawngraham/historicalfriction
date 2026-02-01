/**
 * speech.js — Text-to-speech for Voices and Whisper modes
 *
 * The Web Speech API's speechSynthesis is a single serial queue — utterances
 * play one after another, never concurrently. To create the overlapping-voices
 * effect, we split each article's text into short chunks and interleave chunks
 * from different articles in a round-robin schedule. The rapid alternation
 * between different pitches/rates creates the impression of simultaneous
 * speakers — voices interrupting and talking over each other.
 */

const Speech = (() => {
  let _available = 'speechSynthesis' in window;
  let _paused = false;

  // Track which articles are currently being spoken
  const _speaking = new Map(); // articleUrl → { article, chunks, pitch, rate, volume }

  // Round-robin scheduler state
  let _schedulerRunning = false;
  let _schedulerTimer = null;

  // ── Chunk splitter ──────────────────────────────────

  /**
   * Split text into short spoken phrases (~4–8 words each).
   * Splits on sentence boundaries first, then subdivides long sentences.
   */
  function _chunkText(text, wordsPerChunk) {
    if (!text) return [];
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    const chunks = [];
    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/);
      for (let i = 0; i < words.length; i += wordsPerChunk) {
        const slice = words.slice(i, i + wordsPerChunk).join(' ');
        if (slice) chunks.push(slice);
      }
    }
    return chunks;
  }

  // ── Round-robin scheduler ───────────────────────────

  /**
   * The scheduler cycles through all active articles, speaking one chunk
   * from each in turn. This interleaving creates the perception of
   * overlapping voices even though only one utterance plays at a time.
   */
  function _startScheduler() {
    if (_schedulerRunning) return;
    _schedulerRunning = true;
    _scheduleNext();
  }

  function _stopScheduler() {
    _schedulerRunning = false;
    if (_schedulerTimer) {
      clearTimeout(_schedulerTimer);
      _schedulerTimer = null;
    }
  }

  function _scheduleNext() {
    if (!_schedulerRunning || _paused) return;

    // Collect all entries that still have chunks left
    const active = [];
    for (const [url, entry] of _speaking) {
      if (entry.chunks.length > 0) {
        active.push([url, entry]);
      }
    }

    if (active.length === 0) {
      // All done — clean up
      _schedulerRunning = false;
      for (const [url, entry] of _speaking) {
        entry.article.sounding = false;
        _onSoundingChange?.(entry.article, false);
      }
      _speaking.clear();
      return;
    }

    // Pick the next entry in round-robin order
    // Use a rotating index stored on the function
    if (_scheduleNext._index == null) _scheduleNext._index = 0;
    _scheduleNext._index = _scheduleNext._index % active.length;

    const [url, entry] = active[_scheduleNext._index];
    _scheduleNext._index = (_scheduleNext._index + 1) % Math.max(active.length, 1);

    const chunk = entry.chunks.shift();

    // Mark as sounding
    entry.article.sounding = true;
    _onSoundingChange?.(entry.article, true);

    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.pitch = entry.pitch;
    utterance.rate = entry.rate;
    utterance.volume = entry.volume;

    utterance.onend = () => {
      // If this article has no more chunks, mark it done
      if (entry.chunks.length === 0) {
        entry.article.sounding = false;
        _speaking.delete(url);
        _onSoundingChange?.(entry.article, false);
      }
      // Schedule the next chunk from the next article
      // Use a tiny delay so the browser doesn't merge utterances
      _schedulerTimer = setTimeout(_scheduleNext, 50);
    };

    utterance.onerror = () => {
      entry.article.sounding = false;
      _speaking.delete(url);
      _onSoundingChange?.(entry.article, false);
      _schedulerTimer = setTimeout(_scheduleNext, 50);
    };

    speechSynthesis.speak(utterance);
  }

  // ── Public: Voices mode ─────────────────────────────

  /**
   * Enqueue an article for Voices mode. Its text is chunked and fed
   * into the round-robin scheduler so it interleaves with other articles.
   */
  function speakVoices(article) {
    if (!_available || _paused) return;
    const url = article.url;
    if (_speaking.has(url)) return;

    const fullText = article.title + '. ' + (article.summary || '');
    const chunks = _chunkText(fullText, 5); // ~5 words per chunk
    if (chunks.length === 0) return;

    _speaking.set(url, {
      article,
      chunks,
      pitch: 0.5 + Math.random() * 1.5,  // 0.5–2.0
      rate: 0.8 + Math.random() * 0.4,    // 0.8–1.2
      volume: 0.8,
    });

    _startScheduler();
  }

  // ── Public: Whisper mode ────────────────────────────

  /**
   * Enqueue an article for Whisper mode. Same interleaving, but with
   * low volume, slow rate, low pitch — ghostly murmurs.
   */
  function speakWhisper(article) {
    if (!_available || _paused) return;
    const url = article.url;
    if (_speaking.has(url)) return;

    const fullText = article.title + '. ' + (article.summary || '');
    const chunks = _chunkText(fullText, 3); // shorter chunks for whisper
    if (chunks.length === 0) return;

    _speaking.set(url, {
      article,
      chunks,
      pitch: 0.3 + Math.random() * 0.5,   // low, breathy
      rate: 0.5 + Math.random() * 0.3,     // slow
      volume: 0.15 + Math.random() * 0.15, // very quiet
    });

    _startScheduler();
  }

  // ── Public: Solo mode ───────────────────────────────

  /**
   * Speak a single article clearly (for "what's here?" command).
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
    };

    utterance.onend = () => {
      article.sounding = false;
      _onSoundingChange?.(article, false);
    };

    speechSynthesis.speak(utterance);
  }

  // ── Public: Announce ────────────────────────────────

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

  // ── Public: Control ─────────────────────────────────

  function stopAll() {
    _stopScheduler();
    speechSynthesis.cancel();
    for (const [url, entry] of _speaking) {
      entry.article.sounding = false;
      _onSoundingChange?.(entry.article, false);
    }
    _speaking.clear();
  }

  function pause() {
    _paused = true;
    speechSynthesis.pause();
  }

  function resume() {
    _paused = false;
    speechSynthesis.resume();
    if (_speaking.size > 0) _startScheduler();
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
