(() => {
  const CM = (typeof window !== "undefined" ? (window.ChefMate = window.ChefMate || {}) : {});

  // ==========================================
  // MODULE 1: INTENT CLASSIFIER
  // ==========================================
  class IntentClassifier {
    constructor() {
      this.domains = {
        RECIPE_EXTRACTION: ["GENERATE_RECIPE"],
        RECIPE_NAVIGATION: [
          "NEXT_RECIPE_STEP", "PREVIOUS_RECIPE_STEP", "REPEAT_RECIPE_STEP",
          "CURRENT_RECIPE_STEP", "GOTO_STEP", "GOTO_FIRST_STEP", "GOTO_LAST_STEP",
          "TOTAL_STEPS", "REMAINING_STEPS"
        ],
        RECIPE_QUERY: [
          "GET_INGREDIENTS", "GET_QUANTITY", "WAS_QUANTITY_SPECIFIED",
          "GET_SUGGESTED_QUANTITY", "GET_COOKING_TIME", "GET_TEMPERATURE",
          "GET_EQUIPMENT", "EXPLAIN_STEP"
        ],
        YOUTUBE_PLAYBACK: [
          "PLAY", "PAUSE", "TOGGLE_PLAY", "REPLAY"
        ],
        SEEK_AND_SPEED: [
          "SEEK_FORWARD", "SEEK_BACKWARD", "SET_SPEED", "NORMAL_SPEED"
        ],
        AUDIO_AND_VOLUME: [
          "VOLUME_UP", "VOLUME_DOWN", "MUTE", "UNMUTE"
        ],
        PAGE_SCROLL: [
          "SCROLL_UP", "SCROLL_DOWN", "SCROLL_TOP", "SCROLL_BOTTOM"
        ],
        COOKING_LIFECYCLE: [
          "CONFIRM_INGREDIENTS", "SKIP_INGREDIENTS", "START_COOKING",
          "WAIT_COOKING", "PAUSE_COOKING", "RESUME_COOKING", "STOP_COOKING",
          "EXIT_COOKING", "RESTART_RECIPE"
        ],
        SESSION_AND_HELP: [
          "HELP", "CANCEL", "DISABLE_CHEFMATE", "ENABLE_CHEFMATE"
        ],
        VIDEO_NAVIGATION: [
          "FULLSCREEN", "EXIT_FULLSCREEN", "SKIP_AD", "ENABLE_CAPTIONS",
          "DISABLE_CAPTIONS", "NEXT_VIDEO", "PREVIOUS_VIDEO", "SEARCH_YOUTUBE"
        ]
      };
    }

    classifyDomain(intent) {
      for (const [domain, list] of Object.entries(this.domains)) {
        if (list.includes(intent)) return domain;
      }
      return "UNKNOWN";
    }

    isPlaybackOrControl(intent) {
      const d = this.classifyDomain(intent);
      return d === "YOUTUBE_PLAYBACK" || d === "SEEK_AND_SPEED" ||
             d === "AUDIO_AND_VOLUME" || d === "PAGE_SCROLL" ||
             d === "VIDEO_NAVIGATION";
    }
  }

  // ==========================================
  // MODULE 2: AMBIGUITY RESOLVER
  // ==========================================
  class AmbiguityResolver {
    resolve(rawText, parsedResult, cookingState = "IDLE") {
      const text = String(rawText || "").toLowerCase().trim();
      const intent = parsedResult?.intent || "UNKNOWN";
      const isCookingActive = cookingState === "COOKING" || cookingState === "PAUSED";

      // 1. "Forward" / "Ahead" with seconds vs Next Step
      if (/\b(?:forward|ahead)\b/i.test(text)) {
        if (/\b(?:\d+|ten|twenty|thirty|seconds?|mins?|minutes?)\b/i.test(text) || /\b(?:seek|fast|skip|jump)\b/i.test(text)) {
          return {
            ...parsedResult,
            intent: "SEEK_FORWARD",
            resolvedFrom: intent,
            disambiguated: true
          };
        }
        if (isCookingActive) {
          return {
            ...parsedResult,
            intent: "NEXT_RECIPE_STEP",
            resolvedFrom: intent,
            disambiguated: true
          };
        }
      }

      // 2. "Back" / "Rewind" with seconds vs Previous Step vs History
      if (/\b(?:back|rewind)\b/i.test(text)) {
        if (/\b(?:\d+|ten|twenty|thirty|seconds?|mins?|minutes?)\b/i.test(text) || /\b(?:seek|rewind|skip|jump)\b/i.test(text)) {
          return {
            ...parsedResult,
            intent: "SEEK_BACKWARD",
            resolvedFrom: intent,
            disambiguated: true
          };
        }
        if (isCookingActive) {
          return {
            ...parsedResult,
            intent: "PREVIOUS_RECIPE_STEP",
            resolvedFrom: intent,
            disambiguated: true
          };
        }
      }

      // 3. "Pause": Distinguish pause cooking vs pause video
      if (/^(pause|hold on)\b/i.test(text)) {
        if (/\bcooking\b/i.test(text)) {
          return { ...parsedResult, intent: "PAUSE_COOKING", disambiguated: true };
        }
        // General "pause" pauses the video player without terminating cooking mode
        return { ...parsedResult, intent: "PAUSE", disambiguated: true };
      }

      // 4. "Next": Distinguish next video vs next step vs start cooking
      if (/^next\b/i.test(text)) {
        if (/\bvideo\b/i.test(text)) {
          return { ...parsedResult, intent: "NEXT_VIDEO", disambiguated: true };
        }
        if (cookingState === "AWAITING_START_CONFIRMATION" || cookingState === "AWAITING_INGREDIENT_PREFERENCE") {
          return { ...parsedResult, intent: "START_COOKING", disambiguated: true };
        }
        if (isCookingActive) {
          return { ...parsedResult, intent: "NEXT_RECIPE_STEP", disambiguated: true };
        }
      }

      // 5. "Stop": Distinguish stop cooking vs stop video vs stop speaking
      if (/^stop\b/i.test(text)) {
        if (/\bcooking\b/i.test(text)) {
          return { ...parsedResult, intent: "STOP_COOKING", disambiguated: true };
        }
        if (/\b(?:video|playback)\b/i.test(text)) {
          return { ...parsedResult, intent: "PAUSE", disambiguated: true };
        }
      }

      // 6. "First step" during ingredient preference or confirmation skips ingredients and starts step 1
      if (/\bfirst step\b/i.test(text)) {
        if (cookingState === "AWAITING_INGREDIENT_PREFERENCE" || cookingState === "AWAITING_START_CONFIRMATION") {
          return { ...parsedResult, intent: "START_COOKING", disambiguated: true };
        }
        return { ...parsedResult, intent: "GOTO_FIRST_STEP", disambiguated: true };
      }

      return parsedResult;
    }
  }

  // ==========================================
  // MODULE 3: CONFIDENCE DECIDER
  // ==========================================
  class ConfidenceDecider {
    decide(command, options = {}) {
      const confidence = typeof command.confidence === "number" ? command.confidence : 1.0;
      const intent = command.intent || "UNKNOWN";

      // High Confidence (>= 0.80): Execute immediately
      if (confidence >= 0.80) {
        return {
          action: "EXECUTE",
          confidence,
          command,
          needsClarification: false
        };
      }

      // Moderate Confidence (0.50 - 0.79):
      // Safe, read-only queries execute; destructive actions require confirmation
      const isDisruptive = intent === "RESTART_RECIPE" || intent === "NEXT_VIDEO" || intent === "PREVIOUS_VIDEO" || intent === "DISABLE_CHEFMATE";
      if (confidence >= 0.50) {
        if (isDisruptive) {
          return {
            action: "CONFIRM",
            confidence,
            command,
            needsClarification: true,
            clarificationPrompt: `Did you want me to ${intent.toLowerCase().replace(/_/g, " ")}?`
          };
        }
        return {
          action: "EXECUTE",
          confidence,
          command,
          needsClarification: false
        };
      }

      // Low Confidence (< 0.50): Clarification or fallback
      return {
        action: "CLARIFY",
        confidence,
        command,
        needsClarification: true,
        clarificationPrompt: "I didn't quite catch that. You can say 'next step', 'pause', or ask about an ingredient."
      };
    }
  }

  // ==========================================
  // MODULE 4: COMMAND ERROR RECOVERY
  // ==========================================
  class CommandErrorRecovery {
    handleError(errorType, details = {}, state = "IDLE") {
      console.warn(`[CHEFMATE RECOVERY] Error: ${errorType} | State: ${state}`, details);

      switch (errorType) {
      case "NO_RECIPE_ACTIVE":
        return {
          handled: true,
          message: "No recipe is currently active. Say 'generate recipe' to analyze this cooking video.",
          speak: true
        };

      case "INVALID_STEP_NUMBER": {
        const total = details.totalSteps || 0;
        const requested = details.requestedStep || 0;
        return {
          handled: true,
          message: `This recipe has ${total} steps. Please choose a step between 1 and ${total}.`,
          speak: true
        };
      }

      case "INGREDIENT_NOT_FOUND": {
        const ing = details.ingredient || "that ingredient";
        return {
          handled: true,
          message: `I couldn't find ${ing} in this recipe's ingredients list.`,
          speak: true
        };
      }

      case "UNKNOWN_COMMAND":
        if (state === "AWAITING_INGREDIENT_PREFERENCE") {
          return {
            handled: true,
            message: "Would you like me to read the ingredients first? Say 'yes', or say 'start cooking' to begin.",
            speak: true
          };
        }
        if (state === "COOKING" || state === "PAUSED") {
          return {
            handled: true,
            message: "I didn't recognize that command. You can say 'next step', 'repeat', 'pause', or ask how much of an ingredient you need.",
            speak: true
          };
        }
        return {
          handled: true,
          message: "I didn't catch that command. You can say 'generate recipe', 'play', 'pause', or 'help'.",
          speak: true
        };

      case "TTS_INTERRUPTED":
        return {
          handled: true,
          message: "Speech was interrupted.",
          speak: false,
          silence: true
        };

      case "ML_API_FAILED":
        return {
          handled: true,
          message: "ML server was unreachable; running local deterministic command rules.",
          speak: false
        };

      case "NAVIGATION_RESET":
        return {
          handled: true,
          message: "New video detected; assistant state reset.",
          speak: false
        };

      default:
        return {
          handled: true,
          message: "Something went wrong. Please try your command again.",
          speak: false
        };
      }
    }
  }

  // Unified Context Engine Interface
  const contextEngine = {
    classifier: new IntentClassifier(),
    resolver: new AmbiguityResolver(),
    decider: new ConfidenceDecider(),
    recovery: new CommandErrorRecovery(),

    // Process a parsed command through ambiguity resolution & confidence decision
    process(rawText, parsedResult, cookingState = "IDLE") {
      const resolved = this.resolver.resolve(rawText, parsedResult, cookingState);
      const decision = this.decider.decide(resolved);
      return {
        resolvedCommand: resolved,
        decision
      };
    }
  };

  CM.contextEngine = contextEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      IntentClassifier,
      AmbiguityResolver,
      ConfidenceDecider,
      CommandErrorRecovery,
      contextEngine
    };
  }
})();
