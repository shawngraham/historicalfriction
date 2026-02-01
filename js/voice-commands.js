/**
 * voice-commands.js — Moonshine JS integration and voice command parsing
 *
 * Uses Moonshine's MicrophoneTranscriber for on-device speech recognition.
 * Parses transcribed text into commands that control the app.
 * Falls back gracefully if Moonshine can't load.
 */

const VoiceCommands = (() => {
  let _transcriber = null;
  let _listening = false;
  let _available = false;
  let _loading = false;
  let _onCommand = null;        // callback(command, args)
  let _onTranscript = null;     // callback(text)
  let _onStatusChange = null;   // callback(status)
  let _MoonshineModule = null;

  // Command patterns: array of { patterns: RegExp[], command: string, extract?: fn }
  const COMMANDS = [
    {
      patterns: [/what'?s?\s+here/i, /what\s+is\s+here/i, /what\s+is\s+near/i],
      command: 'whats-here',
    },
    {
      patterns: [/tell\s+me\s+about\s+(.+)/i, /search\s+(?:for\s+)?(.+)/i, /find\s+(.+)/i, /filter\s+(.+)/i],
      command: 'filter',
      extract: (match) => match[1].trim(),
    },
    {
      patterns: [/^silenc/i, /^stop/i, /^quiet/i, /^shut\s+up/i, /^hush/i],
      command: 'stop',
    },
    {
      patterns: [/^more$/i, /expand/i, /wider/i, /farther/i],
      command: 'expand',
    },
    {
      patterns: [/^closer/i, /^nearer/i, /narrow/i],
      command: 'contract',
    },
    {
      patterns: [/^voices?$/i, /voice\s+mode/i, /switch\s+(?:to\s+)?voices?/i],
      command: 'mode-voices',
    },
    {
      patterns: [/^drone/i, /drone\s+mode/i, /switch\s+(?:to\s+)?drone/i, /soundscape/i],
      command: 'mode-drone',
    },
    {
      patterns: [/^music/i, /music(?:al)?\s+mode/i, /switch\s+(?:to\s+)?music/i],
      command: 'mode-musical',
    },
    {
      patterns: [/^whisper/i, /whisper\s+mode/i, /switch\s+(?:to\s+)?whisper/i],
      command: 'mode-whisper',
    },
    {
      patterns: [/what\s+am\s+i\s+hearing/i, /what\s+is\s+(?:this|playing|sounding)/i],
      command: 'identify',
    },
    {
      patterns: [/^louder$/i, /volume\s+up/i, /turn\s+(?:it\s+)?up/i],
      command: 'louder',
    },
    {
      patterns: [/^softer$/i, /^quieter$/i, /volume\s+down/i, /turn\s+(?:it\s+)?down/i],
      command: 'softer',
    },
    {
      patterns: [/^play$/i, /^resume$/i, /^start$/i, /^go$/i, /^begin$/i],
      command: 'play',
    },
    {
      patterns: [/^pause$/i/*, /^hold$/i*/],
      command: 'pause',
    },
    {
      patterns: [/clear\s+filter/i, /show\s+(?:all|everything)/i, /reset/i, /no\s+filter/i],
      command: 'clear-filter',
    },
  ];

  /**
   * Initialize Moonshine. Call after user gesture.
   * @param {function} onCommand - callback(command, args)
   * @param {function} onTranscript - callback(text)
   * @param {function} onStatusChange - callback(status: 'loading'|'ready'|'listening'|'error'|'off')
   */
  async function init(onCommand, onTranscript, onStatusChange) {
    _onCommand = onCommand;
    _onTranscript = onTranscript;
    _onStatusChange = onStatusChange;

    if (_available || _loading) return;

    _loading = true;
    _onStatusChange?.('loading');

    try {
      // Dynamic import of Moonshine from CDN
      _MoonshineModule = await import(
        'https://cdn.jsdelivr.net/npm/@moonshine-ai/moonshine-js@latest/dist/moonshine.min.js'
      );

      _transcriber = new _MoonshineModule.MicrophoneTranscriber(
        'moonshine/tiny',
        {
          onTranscriptionCommitted(text) {
            _handleTranscript(text);
          },
          onTranscriptionUpdated(text) {
            _onTranscript?.(text);
          },
        },
      );

      _available = true;
      _loading = false;
      _onStatusChange?.('ready');
    } catch (e) {
      console.warn('Moonshine failed to load:', e);
      _available = false;
      _loading = false;
      _onStatusChange?.('error');
    }
  }

  /**
   * Process a committed transcript into a command.
   */
  function _handleTranscript(text) {
    if (!text || !text.trim()) return;

    const trimmed = text.trim();
    _onTranscript?.(trimmed);

    // Try to match a command
    for (const cmd of COMMANDS) {
      for (const pattern of cmd.patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const args = cmd.extract ? cmd.extract(match) : null;
          console.log(`Voice command: ${cmd.command}`, args || '');
          _onCommand?.(cmd.command, args);
          return;
        }
      }
    }

    // No command matched — treat as a filter/search if it's a noun phrase
    // (only if it's more than one character to avoid spurious triggers)
    if (trimmed.length > 2) {
      console.log('Voice command: unmatched, treating as filter:', trimmed);
      _onCommand?.('filter', trimmed);
    }
  }

  /**
   * Start listening.
   */
  async function startListening() {
    if (!_available || !_transcriber) return;
    if (_listening) return;

    try {
      await _transcriber.start();
      _listening = true;
      _onStatusChange?.('listening');
    } catch (e) {
      console.warn('Failed to start Moonshine:', e);
      _onStatusChange?.('error');
    }
  }

  /**
   * Stop listening.
   */
  function stopListening() {
    if (!_listening || !_transcriber) return;
    try {
      _transcriber.stop();
    } catch (e) {
      // ignore
    }
    _listening = false;
    _onStatusChange?.('off');
  }

  /**
   * Toggle listening on/off.
   */
  async function toggle() {
    if (_listening) {
      stopListening();
    } else {
      await startListening();
    }
  }

  function isListening() {
    return _listening;
  }

  function isAvailable() {
    return _available;
  }

  function isLoading() {
    return _loading;
  }

  return {
    init,
    startListening,
    stopListening,
    toggle,
    isListening,
    isAvailable,
    isLoading,
  };
})();
