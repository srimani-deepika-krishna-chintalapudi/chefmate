(() => {
  const CM = (typeof window !== "undefined" ? (window.ChefMate = window.ChefMate || {}) : {});

  let customProvider = null;

  const audioTranscriber = {
    // Allows injecting local Whisper or synthetic STT provider for tests
    setProvider(fn) {
      customProvider = fn;
    },

    reset() {
      customProvider = null;
    },

    /**
     * Attempts audio transcription when YouTube captions/subtitles are absent.
     * Never claims transcription if captions were retrieved.
     */
    async transcribeVideo({
      videoElement = null,
      videoDuration = 0,
      videoInfo = {},
      captionsRetrieved = false
    } = {}) {
      // 1. Never claim audio transcription if subtitles were already retrieved
      if (captionsRetrieved) {
        return {
          success: false,
          segments: [],
          count: 0,
          status: "UNAVAILABLE",
          reason: "Captions were already retrieved from YouTube; audio transcription was not invoked."
        };
      }

      // 2. Custom or synthetic local provider (e.g., in unit tests or local Python STT bridge)
      if (typeof customProvider === "function") {
        try {
          const res = await customProvider({ videoElement, videoDuration, videoInfo });
          if (res && Array.isArray(res.segments)) {
            const normalized = res.segments.map(seg => ({
              start: Number(seg.start || seg.start_seconds || 0),
              end: Number(seg.end || seg.end_seconds || (Number(seg.start || 0) + 5)),
              text: String(seg.text || "").trim(),
              confidence: Number(seg.confidence || 0.85),
              source: "audio_transcription"
            })).filter(s => s.text.length > 0);

            return {
              success: normalized.length > 0,
              segments: normalized,
              count: normalized.length,
              status: normalized.length > 0 ? "COMPLETED" : "UNAVAILABLE",
              reason: normalized.length > 0
                ? `Transcribed ${normalized.length} spoken audio segments.`
                : "Audio transcriber ran but detected no speech segments."
            };
          }
        } catch (provErr) {
          console.warn("[CHEFMATE AUDIO] Custom provider error:", provErr);
          return {
            success: false,
            segments: [],
            count: 0,
            status: "FAILED",
            reason: `Audio transcription error: ${provErr.message || provErr}`
          };
        }
      }

      // 3. Check for permitted local backend via background worker to avoid mixed-content CORS violations
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        try {
          const bgCheck = await new Promise(resolve => {
            const timer = setTimeout(() => resolve(null), 1200);
            try {
              chrome.runtime.sendMessage({ type: "CHEFMATE_CHECK_HEALTH" }, res => {
                clearTimeout(timer);
                resolve(res);
              });
            } catch (_) {
              clearTimeout(timer);
              resolve(null);
            }
          });
          if (bgCheck && bgCheck.success) {
            return {
              success: false,
              segments: [],
              count: 0,
              status: "AVAILABLE",
              reason: "Local speech-to-text server connected at 127.0.0.1:8000."
            };
          }
        } catch (_) {}
      } else if (typeof fetch === "function") {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1200);
          const pingRes = await fetch("http://127.0.0.1:8000/health", {
            method: "GET",
            signal: controller.signal
          }).catch(() => null);
          clearTimeout(timeoutId);

          if (pingRes && pingRes.ok) {
            return {
              success: false,
              segments: [],
              count: 0,
              status: "AVAILABLE",
              reason: "Local speech-to-text server connected at 127.0.0.1:8000."
            };
          }
        } catch (_) {}
      }

      // 4. Honest reporting when no local STT model / worker is running
      return {
        success: false,
        segments: [],
        count: 0,
        status: "UNAVAILABLE",
        reason: "Audio transcription engine is not running. Subtitle-independent OCR and visual understanding will proceed."
      };
    }
  };

  CM.audioTranscriber = audioTranscriber;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = audioTranscriber;
  }
})();
