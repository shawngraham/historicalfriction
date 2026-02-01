/**
 * app.js — Main controller for Historical Friction
 *
 * Orchestrates geolocation, article fetching, sonification modes,
 * speech, voice commands, and UI updates.
 */

const App = (() => {
  // ── State ───────────────────────────────────────────

  let _mode = 'voices';            // 'voices' | 'drone' | 'musical' | 'whisper'
  let _playing = false;
  let _lat = null;
  let _lon = null;
  let _watchId = null;
  let _radiusKm = Articles.DEFAULT_RADIUS_KM;
  let _initialized = false;

  // ── DOM refs (populated in init) ────────────────────

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Initialization ──────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized = true;

    // Bind UI events
    _bindModeButtons();
    _bindControls();
    _bindMicToggle();

    // Set up speech sounding callback for UI glow
    Speech.onSoundingChange(_updateArticleSounding);

    // Start geolocation
    _startGeolocation();

    _setStatus('Locating you...', 'loading');
  }

  // ── Geolocation ─────────────────────────────────────

  function _startGeolocation() {
    if (!('geolocation' in navigator)) {
      _setStatus('Geolocation not available', 'error');
      return;
    }

    _watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lon = Math.round(pos.coords.longitude * 10000) / 10000;

        // Only re-fetch if position changed meaningfully
        if (lat !== _lat || lon !== _lon) {
          _lat = lat;
          _lon = lon;
          _setStatus(`${lat}, ${lon}`, 'active');
          _fetchAndSonify();
        }
      },
      (err) => {
        console.warn('Geolocation error:', err);
        _setStatus('Location access denied', 'error');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 30000,
      }
    );
  }

  // ── Fetch & Sonify ──────────────────────────────────

  async function _fetchAndSonify() {
    if (_lat === null) return;

    try {
      const newArticles = await Articles.fetchNearby(_lat, _lon, _radiusKm);
      _renderArticles();

      if (_playing && newArticles.length > 0) {
        _sonifyArticles(newArticles);
      }
    } catch (e) {
      console.warn('Fetch failed:', e);
      _setStatus('API error — retrying...', 'error');
    }
  }

  function _sonifyArticles(articles) {
    const list = articles || Articles.getAll();

    switch (_mode) {
      case 'voices':
        for (const a of list) Speech.speakVoices(a);
        break;
      case 'drone':
        Sonification.play('drone', list, _lat, _lon);
        break;
      case 'musical':
        Sonification.play('musical', list, _lat, _lon);
        break;
      case 'whisper':
        for (const a of list) Speech.speakWhisper(a);
        break;
    }
  }

  // ── Mode switching ──────────────────────────────────

  function setMode(newMode) {
    if (newMode === _mode) return;

    // Stop current mode
    _stopCurrentMode();

    _mode = newMode;

    // Update UI
    for (const btn of $$('#mode-switcher button')) {
      btn.classList.toggle('active', btn.dataset.mode === _mode);
    }

    // Re-sonify existing articles in new mode
    if (_playing) {
      _sonifyArticles(Articles.getAll());
    }
  }

  function _stopCurrentMode() {
    Speech.stopAll();
    Sonification.stopAll();

    // Clear sounding state on all articles
    for (const a of Articles.getAll()) {
      a.sounding = false;
    }
    _updateAllSoundingUI();
  }

  // ── Play / Pause ────────────────────────────────────

  function togglePlayPause() {
    if (_playing) {
      pause();
    } else {
      play();
    }
  }

  function play() {
    // Initialize audio context on first play (user gesture required)
    Sonification.init();

    _playing = true;
    _updatePlayButton();
    _sonifyArticles(Articles.getAll());
  }

  function pause() {
    _playing = false;
    _stopCurrentMode();
    _updatePlayButton();
  }

  function _updatePlayButton() {
    const btn = $('#play-pause');
    if (btn) btn.textContent = _playing ? 'Pause' : 'Play';
  }

  // ── Voice command handler ───────────────────────────

  function _handleVoiceCommand(command, args) {
    switch (command) {
      case 'whats-here': {
        const closest = Articles.getClosest();
        if (closest) {
          Speech.speakSolo(closest);
        } else {
          Speech.announce('No articles found nearby.');
        }
        break;
      }
      case 'filter':
        Articles.setFilter(args);
        _renderArticles();
        if (_playing) {
          _stopCurrentMode();
          _sonifyArticles(Articles.getAll());
        }
        Speech.announce(`Filtering for: ${args}`);
        break;

      case 'clear-filter':
        Articles.setFilter('');
        _renderArticles();
        if (_playing) {
          _stopCurrentMode();
          _sonifyArticles(Articles.getAll());
        }
        Speech.announce('Filter cleared.');
        break;

      case 'stop':
        pause();
        break;

      case 'play':
        play();
        break;

      case 'pause':
        pause();
        break;

      case 'expand':
        _radiusKm = Math.min(_radiusKm + 5, 50);
        Speech.announce(`Search radius: ${_radiusKm} kilometers.`);
        _fetchAndSonify();
        break;

      case 'contract':
        _radiusKm = Math.max(_radiusKm - 3, 1);
        Speech.announce(`Search radius: ${_radiusKm} kilometers.`);
        _fetchAndSonify();
        break;

      case 'mode-voices':
        setMode('voices');
        break;
      case 'mode-drone':
        setMode('drone');
        break;
      case 'mode-musical':
        setMode('musical');
        break;
      case 'mode-whisper':
        setMode('whisper');
        break;

      case 'identify': {
        const speaking = Speech.currentlySpeaking();
        if (speaking.length > 0) {
          const names = Articles.getAll()
            .filter(a => a.sounding)
            .map(a => a.title)
            .join(', ');
          Speech.announce(`You are hearing: ${names || 'various articles'}`);
        } else {
          Speech.announce('Nothing is currently playing.');
        }
        break;
      }

      case 'louder':
        Sonification.setVolume(Math.min(Sonification.getVolume() + 0.15, 1));
        _syncVolumeSlider();
        break;

      case 'softer':
        Sonification.setVolume(Math.max(Sonification.getVolume() - 0.15, 0));
        _syncVolumeSlider();
        break;
    }
  }

  // ── UI: Article rendering ───────────────────────────

  function _renderArticles() {
    const ul = $('#results');
    if (!ul) return;

    const articles = Articles.getAll();

    // Sort by distance
    articles.sort((a, b) => (a.distance || 99) - (b.distance || 99));

    ul.innerHTML = '';

    for (const article of articles) {
      const li = document.createElement('li');
      li.dataset.url = article.url;
      if (article.sounding) li.classList.add('sounding');
      if (article.hasImage === false) li.classList.add('need-image');

      const dist = article.distance !== null
        ? `${article.distance.toFixed(1)} km`
        : '';

      li.innerHTML = `
        <a class="article-title" href="${_escHtml(article.url)}" target="_blank" rel="noopener">${_escHtml(article.title)}</a>
        <div class="article-meta">${dist}</div>
        <div class="article-summary">${_escHtml(article.summary)}</div>
      `;

      // Tap to hear this article solo
      li.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return; // let links work
        e.preventDefault();
        Sonification.init();
        Speech.speakSolo(article);
      });

      li.style.display = 'block';
      ul.appendChild(li);
    }

    // Show filter indicator
    const filter = Articles.getFilter();
    const filterIndicator = $('#filter-indicator');
    if (filterIndicator) {
      if (filter) {
        filterIndicator.textContent = `Filtered: "${filter}" (${articles.length} results)`;
        filterIndicator.style.display = 'block';
      } else {
        filterIndicator.style.display = 'none';
      }
    }
  }

  function _updateArticleSounding(article, isSounding) {
    const li = $(`#results li[data-url="${CSS.escape(article.url)}"]`);
    if (li) {
      li.classList.toggle('sounding', isSounding);
    }
  }

  function _updateAllSoundingUI() {
    for (const li of $$('#results li')) {
      li.classList.remove('sounding');
    }
  }

  // ── UI: Bindings ────────────────────────────────────

  function _bindModeButtons() {
    for (const btn of $$('#mode-switcher button')) {
      btn.addEventListener('click', () => {
        Sonification.init(); // ensure audio context on user gesture
        setMode(btn.dataset.mode);
      });
    }
  }

  function _bindControls() {
    const playBtn = $('#play-pause');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        Sonification.init();
        togglePlayPause();
      });
    }

    const volumeSlider = $('#volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        Sonification.setVolume(parseFloat(e.target.value));
      });
    }
  }

  function _bindMicToggle() {
    const micBtn = $('#mic-toggle');
    if (!micBtn) return;

    micBtn.addEventListener('click', async () => {
      // Initialize Moonshine on first click
      if (!VoiceCommands.isAvailable() && !VoiceCommands.isLoading()) {
        await VoiceCommands.init(
          _handleVoiceCommand,
          _handleTranscriptUpdate,
          _handleVoiceStatusChange,
        );
      }

      if (VoiceCommands.isAvailable()) {
        await VoiceCommands.toggle();
      }
    });
  }

  function _handleTranscriptUpdate(text) {
    const el = $('#transcript');
    if (el) {
      el.textContent = text || '';
      el.classList.toggle('active', !!text);
    }
  }

  function _handleVoiceStatusChange(status) {
    const voiceStatus = $('#voice-status');
    const micBtn = $('#mic-toggle');
    const moonLoading = $('#moonshine-loading');

    if (voiceStatus) {
      switch (status) {
        case 'loading':
          voiceStatus.innerHTML = '<span class="mic-icon">&#x1F399;</span> Loading speech recognition...';
          voiceStatus.className = '';
          if (moonLoading) moonLoading.style.display = 'block';
          break;
        case 'ready':
          voiceStatus.innerHTML = '<span class="mic-icon">&#x1F399;</span> Voice ready — tap mic to start';
          voiceStatus.className = '';
          if (moonLoading) moonLoading.style.display = 'none';
          break;
        case 'listening':
          voiceStatus.innerHTML = '<span class="mic-icon">&#x1F399;</span> Listening...';
          voiceStatus.className = 'listening';
          break;
        case 'error':
          voiceStatus.innerHTML = '<span class="mic-icon">&#x1F399;</span> Voice unavailable';
          voiceStatus.className = '';
          if (moonLoading) moonLoading.style.display = 'none';
          break;
        case 'off':
          voiceStatus.innerHTML = '<span class="mic-icon">&#x1F399;</span> Mic off';
          voiceStatus.className = '';
          break;
      }
    }

    if (micBtn) {
      micBtn.classList.toggle('active', status === 'listening');
    }
  }

  function _syncVolumeSlider() {
    const slider = $('#volume-slider');
    if (slider) slider.value = Sonification.getVolume();
  }

  // ── UI: Status bar ──────────────────────────────────

  function _setStatus(text, state) {
    const bar = $('#status-bar');
    if (!bar) return;
    const dot = bar.querySelector('.dot');
    const label = bar.querySelector('.status-text');

    if (dot) {
      dot.className = 'dot';
      if (state) dot.classList.add(state);
    }
    if (label) label.textContent = text;
  }

  // ── Utility ─────────────────────────────────────────

  function _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Public ──────────────────────────────────────────

  return { init };
})();

// ── Boot ────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
