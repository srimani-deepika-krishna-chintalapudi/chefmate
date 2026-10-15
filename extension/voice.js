(() => {
  const CM = (window.ChefMate = window.ChefMate || {});

  const states = Object.freeze({
    OFF: 'OFF',
    REQUESTING_PERMISSION: 'REQUESTING_PERMISSION',
    LISTENING: 'LISTENING',
    PROCESSING: 'PROCESSING',
    EXECUTING: 'EXECUTING',
    SPEAKING: 'SPEAKING',
    ERROR: 'ERROR'
  });

  CM.voice = {
    states,
    state: states.OFF,
    recognition: null,
    stream: null,
    shouldListen: false,
    isListening: false,
    isSpeaking: false,
    isMuted: false,          // true during TTS + brief post-TTS echo-decay window
    isProcessingFinal: false,
    awaitingFinalization: false,
    restartPending: false,
    speechEndTimer: null,
    interimCommitTimer: null,
    muteTimer: null,
    ttsWatchdogTimer: null,
    currentUtterance: null,
    cachedVoices: [],
    lastFinal: '',
    lastFinalAt: 0,
    lastSpokenText: '',

    initVoices() {
      if (typeof window.speechSynthesis === 'undefined') return;
      const update = () => {
        this.cachedVoices = window.speechSynthesis.getVoices() || [];
        console.debug('[CHEFMATE FLOW] TTS voices cached:', this.cachedVoices.length);
      };
      update();
      window.speechSynthesis.onvoiceschanged = update;
    },

    setState(state, message) {
      this.state = state;
      CM.ui?.setVoiceState(state, message);
    },

    async start() {
      if (this.shouldListen) return;

      this.initVoices();

      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        this.setState(states.ERROR,
          'Voice recognition is not supported. Please use Google Chrome.');
        return;
      }

      this.shouldListen = true;
      this.setState(states.REQUESTING_PERMISSION, '🎙 Requesting microphone permission…');

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        this.shouldListen = false;
        this.setState(states.ERROR,
          error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
            ? '🔴 Microphone access denied. Allow mic access for YouTube in Chrome settings.'
            : `🔴 Microphone unavailable: ${error.message || error.name}`);
        return;
      }

      this.createRecognition(Recognition);
      this.beginRecognition();
    },

    createRecognition(Recognition) {
      const r = (this.recognition = new Recognition());
      r.continuous = true;
      r.interimResults = true;
      r.lang = 'en-US';

      r.onstart = () => {
        this.isListening = true;
        console.log('[CHEFMATE FLOW] Speech recognition active and listening');
        if (!this.isSpeaking && !this.isMuted) {
          this.setState(states.LISTENING, '🟢 Listening…');
        }
      };

      r.onresult = event => {
        // Ignore all results while ChefMate is speaking or in the post-TTS echo window.
        if (this.isSpeaking || this.isMuted) {
          console.debug('[CHEFMATE FLOW] Speech ignored (isSpeaking:', this.isSpeaking, 'isMuted:', this.isMuted, ')');
          return;
        }

        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const item = event.results[i];
          const text = item[0].transcript.trim();
          if (item.isFinal) {
            console.log(`[CHEFMATE FLOW] Speech heard (final): "${text}"`);
            this.awaitingFinalization = false;
            clearTimeout(this.interimCommitTimer);
            this.processFinal(text);
          } else {
            interim = text;
          }
        }
        CM.ui?.setInterim(interim);
        if (interim) this.scheduleInterimFinalization();
      };

      r.onspeechend = () => {
        if (this.isSpeaking || this.isMuted) return;
        this.finalizeUtterance();
      };

      r.onerror = event => {
        this.onError(event.error);
      };

      r.onend = () => {
        this.isListening = false;
        if (!this.shouldListen) return;
        // Don't restart during TTS — speak() restarts after utterance ends.
        if (this.isSpeaking || this.isMuted) return;
        if (this.isProcessingFinal || this.awaitingFinalization) {
          this.restartPending = true;
          return;
        }
        setTimeout(() => this.beginRecognition(), 250);
      };
    },

    beginRecognition() {
      if (!this.shouldListen || this.isListening || !this.recognition) return;
      if (this.isSpeaking || this.isMuted) return;
      try { this.recognition.start(); } catch (_) {}
    },

    // Stop recognition so the mic cannot pick up speaker output during TTS.
    _pauseRecognitionForTTS() {
      if (this.isListening && this.recognition) {
        try { this.recognition.abort(); } catch (_) {}
      }
    },

    // Called when a TTS utterance ends (onend or onerror).
    // Idempotent: if isSpeaking is already false (stopSpeaking() beat us here), returns early.
    _resumeRecognitionAfterTTS() {
      clearTimeout(this.ttsWatchdogTimer);
      this.currentUtterance = null;
      if (!this.isSpeaking) return; // stopSpeaking() already cleaned up
      this.isSpeaking = false;
      this.isMuted = true;
      clearTimeout(this.muteTimer);
      console.log('[CHEFMATE FLOW] TTS finished. Waiting 700ms echo decay before listening...');
      // 700 ms: let speaker echo decay before listening again
      this.muteTimer = setTimeout(() => {
        this.isMuted = false;
        if (this.shouldListen) {
          this.setState(states.LISTENING, '🟢 Listening…');
          console.log('[CHEFMATE FLOW] Resuming speech recognition after TTS echo delay');
          this.beginRecognition();
        }
      }, 700);
    },

    scheduleInterimFinalization() {
      clearTimeout(this.interimCommitTimer);
      this.interimCommitTimer = setTimeout(() => this.finalizeUtterance(), 900);
    },

    finalizeUtterance() {
      if (!this.shouldListen || this.isProcessingFinal ||
          this.awaitingFinalization || !this.recognition) return;
      this.awaitingFinalization = true;
      try { this.recognition.stop(); } catch (_) {}
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = setTimeout(() => {
        if (!this.awaitingFinalization) return;
        this.awaitingFinalization = false;
        this.restartPending = false;
        this.beginRecognition();
      }, 1200);
    },

    async processFinal(text) {
      if (!text || !this.shouldListen) return;
      clearTimeout(this.speechEndTimer);

      const normalized = text.trim();
      const now = Date.now();
      if (normalized.toLowerCase() === this.lastFinal && now - this.lastFinalAt < 1200) return;
      this.lastFinal = normalized.toLowerCase();
      this.lastFinalAt = now;
      this.isProcessingFinal = true;

      console.log(`[CHEFMATE FLOW] Processing voice command: "${normalized}" | Assistant State: ${CM.assistant?.state}`);
      this.setState(states.PROCESSING, '🔵 Processing command…');
      CM.ui?.setTranscript(normalized);

      try {
        const command = await CM.commandParser.parse(normalized);
        CM.ui?.setIntent(command);
        console.log(`[CHEFMATE FLOW] Intent parsed: ${command.intent} | method: ${command.method} | params:`, command.parameters);

        this.setState(states.EXECUTING, '🔵 Executing command…');
        const result = await CM.executeCommand(command);
        CM.ui?.setExecution(result);

        console.log(`[CHEFMATE FLOW] Command executed: action=${result?.action} | Post-State=${CM.assistant?.state} | speak=${result?.speak} | msg="${result?.message?.slice(0, 60)}..."`);

        if (result?.speak && result?.message) {
          this.speak(result.message);
        } else if (!result?.speak && result?.message) {
          CM.ui?.setRecipeStatus(result.message);
        }
      } catch (err) {
        console.error('[CHEFMATE FLOW] Command execution error:', err);
        CM.ui?.setRecipeStatus('An error occurred. Please try again.');
      } finally {
        this.isProcessingFinal = false;
        if (this.shouldListen && !this.isSpeaking && !this.isMuted) {
          this.setState(states.LISTENING, '🟢 Listening…');
        }
        if (this.shouldListen && this.restartPending && !this.isSpeaking && !this.isMuted) {
          this.restartPending = false;
          setTimeout(() => this.beginRecognition(), 0);
        }
      }
    },

    // ─── Text-to-Speech ───────────────────────────────────────────────────────

    speak(text) {
      if (!text || typeof window.speechSynthesis === 'undefined') return;

      console.log('[CHEFMATE FLOW] TTS speak requested:', text.slice(0, 80));

      this.lastSpokenText = text;
      this.isSpeaking = true;
      this.isMuted = false;
      clearTimeout(this.muteTimer);
      clearTimeout(this.ttsWatchdogTimer);
      this.setState(states.SPEAKING, '🔊 ChefMate Speaking…');
      CM.ui?.setSpokenText(text);

      // Pause recognition during TTS
      this._pauseRecognitionForTTS();

      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance; // Prevent Chrome V8 garbage collection mid-speech
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      // Prefer a male English voice when available
      const voices = (this.cachedVoices && this.cachedVoices.length > 0)
        ? this.cachedVoices
        : (window.speechSynthesis.getVoices() || []);
      if (voices.length > 0) {
        const maleVoice =
          voices.find(v => v.lang.startsWith('en') &&
            /\b(david|mark|james|daniel|ryan|male|guy)\b/i.test(v.name)) ||
          voices.find(v => v.lang.startsWith('en') &&
            !/\b(female|woman|zira|cortana|samantha|victoria|karen|moira|fiona|tessa)\b/i.test(v.name.toLowerCase()));
        if (maleVoice) {
          utterance.voice = maleVoice;
          console.debug('[CHEFMATE FLOW] TTS voice chosen:', maleVoice.name);
        }
      }

      utterance.onstart = () => {
        console.log('[CHEFMATE FLOW] TTS utterance playback started');
      };

      utterance.onend = () => {
        console.log('[CHEFMATE FLOW] TTS utterance playback ended');
        this._resumeRecognitionAfterTTS();
      };

      // Always resume recognition on any error
      utterance.onerror = (e) => {
        console.warn('[CHEFMATE FLOW] TTS utterance error:', e.error);
        this._resumeRecognitionAfterTTS();
      };

      // Watchdog timer: resume recognition if Chrome speech hangs
      const estDurationMs = Math.max(6000, Math.ceil(text.length * 100));
      this.ttsWatchdogTimer = setTimeout(() => {
        if (this.isSpeaking) {
          console.warn('[CHEFMATE FLOW] TTS watchdog expired after', estDurationMs, 'ms. Resuming recognition.');
          this._resumeRecognitionAfterTTS();
        }
      }, estDurationMs + 4000);

      // Periodic resume ticker to unfreeze Chrome synthesis if paused
      const resumeTicker = setInterval(() => {
        if (!this.isSpeaking) {
          clearInterval(resumeTicker);
        } else if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 3000);

      const doSpeak = () => {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('[CHEFMATE FLOW] Error speaking:', e);
          this._resumeRecognitionAfterTTS();
        }
      };

      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
        setTimeout(doSpeak, 120);
      } else {
        doSpeak();
      }
    },

    stopSpeaking() {
      clearTimeout(this.muteTimer);
      clearTimeout(this.ttsWatchdogTimer);
      this.currentUtterance = null;
      this.isMuted = false;
      this.isSpeaking = false;
      if (typeof window.speechSynthesis !== 'undefined') {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
      if (this.shouldListen && !this.isListening) {
        setTimeout(() => this.beginRecognition(), 300);
      }
    },

    onError(code) {
      if (!this.shouldListen || code === 'aborted' || code === 'no-speech') return;
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'permission-denied') {
        this.shouldListen = false;
        this.setState(states.ERROR,
          '🔴 Microphone access denied. Allow mic access in Chrome settings.');
        return;
      }
      const messages = {
        'audio-capture': '🔴 No microphone was found.',
        network: '🔴 Speech recognition network error. Check internet connection.'
      };
      this.setState(states.ERROR, messages[code] || `🔴 Voice recognition error: ${code}`);
    },

    stop() {
      this.shouldListen = false;
      this.isListening = false;
      this.isSpeaking = false;
      this.isMuted = false;
      this.isProcessingFinal = false;
      this.awaitingFinalization = false;
      this.restartPending = false;
      clearTimeout(this.speechEndTimer);
      clearTimeout(this.interimCommitTimer);
      clearTimeout(this.muteTimer);

      if (typeof window.speechSynthesis !== 'undefined') {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }

      const r = this.recognition;
      this.recognition = null;
      if (r) {
        r.onend = null;
        try { r.abort(); } catch (_) {}
      }

      this.stream?.getTracks().forEach(t => t.stop());
      this.stream = null;
      this.setState(states.OFF, '🔴 Voice control OFF');
    }
  };
})();
