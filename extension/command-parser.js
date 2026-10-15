(() => {
  const CM = (typeof window !== "undefined" ? (window.ChefMate = window.ChefMate || {}) : {});

  const numberWords = {
    zero: 0, one: 1, two: 2, three: 3, four: 4,
    five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
    sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
    eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
    sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20
  };

  const parseNumber = (text, fallback = 10) => {
    const digit = text.match(/\b\d+(?:\.\d+)?\b/);
    if (digit) return Number(digit[0]);

    const wordMatch = Object.entries(numberWords).find(
      ([name]) => new RegExp(`\\b${name}\\b`, 'i').test(text)
    );

    return wordMatch ? wordMatch[1] : fallback;
  };

  const result = (intent, parameters = {}, confidence = 1, method = "rule") => ({
    intent,
    confidence,
    method,
    parameters
  });

  function extractIngredientQuery(text) {
    const cleaned = text.toLowerCase().replace(/[^a-z\s]/g, " ");

    // Check "was the quantity of [ingredient] mentioned/specified"
    const wasMentionedMatch = cleaned.match(/(?:was|is)\s+(?:the\s+)?quantity\s+(?:of\s+)?([a-z\s]+?)\s*(?:mentioned|specified)/i);
    if (wasMentionedMatch) {
      return wasMentionedMatch[1].trim();
    }

    const match = cleaned.match(/(?:how much|how many|quantity of|amount of|what quantity of|what is the quantity of)\s+([a-z\s]+)/i);
    if (match) {
      return match[1].trim()
        .replace(/\b(do i need|should i add|is needed|it|is there|to add|for this|in this recipe|was mentioned|mentioned in the video|in the video)\b/g, "")
        .trim();
    }
    // Check direct pattern like "how much cheese" or "cheese quantity"
    const directMatch = cleaned.match(/([a-z\s]+)\s+(?:quantity|amount)/i);
    if (directMatch) {
      return directMatch[1].trim();
    }
    return "";
  }

  function extractSearchQuery(text) {
    const match = text.match(/(?:search(?: YouTube)? for|find(?: a| an)?|look up)\s+(.+)/i);
    return match ? match[1].trim() : "";
  }

  function parametersFor(intent, text) {
    if (intent === "SEEK_BACKWARD" || intent === "SEEK_FORWARD") {
      const seconds = parseNumber(text, 10);
      return {
        seconds: seconds * (/\b(minutes?|mins?)\b/i.test(text) ? 60 : 1)
      };
    }

    if (intent === "SET_SPEED") {
      const match = text.match(/\b(0\.5|0\.75|1(?:\.25|\.5|\.75)?|2)\s*x?\b/);
      if (match) return { rate: Number(match[1]) };
      if (/\b(increase|faster|speed up)\b/i.test(text)) return { rate: 1.25 };
      if (/\b(decrease|slower|slow down)\b/i.test(text)) return { rate: 0.75 };
    }

    if (intent === "GET_QUANTITY" || intent === "WAS_QUANTITY_SPECIFIED" || intent === "GET_SUGGESTED_QUANTITY") {
      return { ingredient: extractIngredientQuery(text) };
    }

    if (intent === "GOTO_STEP") {
      return { step: parseNumber(text, 1) };
    }

    if (intent === "SEARCH_YOUTUBE") {
      return { query: extractSearchQuery(text) };
    }

    return {};
  }

  // Map ML dataset labels to internal intents
  const intentMap = {
    play_video: "PLAY",
    resume_playback: "PLAY",
    pause_video: "PAUSE",
    rewind_video: "SEEK_BACKWARD",
    fast_forward_video: "SEEK_FORWARD",
    enter_fullscreen: "FULLSCREEN",
    exit_fullscreen: "EXIT_FULLSCREEN",
    mute_audio: "MUTE",
    unmute_audio: "UNMUTE",
    increase_volume: "VOLUME_UP",
    decrease_volume: "VOLUME_DOWN",
    increase_speed: "SET_SPEED",
    decrease_speed: "SET_SPEED",
    enable_captions: "ENABLE_CAPTIONS",
    disable_captions: "DISABLE_CAPTIONS",
    scroll_up: "SCROLL_UP",
    scroll_down: "SCROLL_DOWN",
    next_step: "NEXT_RECIPE_STEP",
    previous_step: "PREVIOUS_RECIPE_STEP",
    current_step_info: "CURRENT_RECIPE_STEP",
    repeat_current_step: "REPEAT_RECIPE_STEP",
    repeat_last_instruction: "REPEAT_RECIPE_STEP",
    list_ingredients: "GET_INGREDIENTS",
    explain_instruction: "EXPLAIN_STEP",
    search_recipe: "GENERATE_RECIPE"
  };

  function parseContextAware(raw, cookingState = "IDLE") {
    const text = String(raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9.\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return result("UNKNOWN", {}, 0);

    // 1. Strict conversation state machine responses
    if (cookingState === "AWAITING_INGREDIENT_PREFERENCE") {
      if (/^(yes|yeah|sure|yep|yup|please|tell me|okay|ok|i do|read ingredients|yes please|go ahead|read them|tell me the ingredients|tell me them|absolutely|definitely)\b/i.test(text) ||
          /\b(?:tell me|read)(?:\s+(?:the|all))?\s+ingredients\b/i.test(text)) {
        return result("CONFIRM_INGREDIENTS", {}, 1, "context");
      }
      // "start the recipe", "first step", "start cooking", "start with the first step", "start with step one" etc. — skip ingredients, begin cooking
      if (/^(no|nope|skip|skip ingredients|start cooking|let's cook|let s cook|start instructions|no thanks|no thank you|skip them|don't read them|dont read them|just start|no skip|start the recipe|start speaking|begin cooking|begin the recipe|first step|let's begin|let s begin|begin|go straight)\b/i.test(text) ||
          /\b(?:start with (?:the )?first step|start with step (?:1|one)|start from step (?:1|one)|start from (?:the )?first step|go to (?:the )?first step)\b/i.test(text)) {
        return result("SKIP_INGREDIENTS", {}, 1, "context");
      }
    }

    if (cookingState === "AWAITING_START_CONFIRMATION") {
      if (/^(yes|yeah|sure|yep|okay|ok|start|let's go|let s go|begin|next|ready|go ahead|start cooking|begin instructions|let's start|let s start|i'm ready|im ready|start the recipe|start speaking|first step)\b/i.test(text) ||
          /\b(?:start with (?:the )?first step|start with step (?:1|one)|start from step (?:1|one)|go to (?:the )?first step)\b/i.test(text)) {
        return result("START_COOKING", {}, 1, "context");
      }
      if (/^(no|nope|wait|hold on|not yet|give me a moment)\b/i.test(text)) {
        return result("WAIT_COOKING", {}, 1, "context");
      }
    }

    // 2. High priority cooking step commands when cooking is active
    const isCookingActive = cookingState === "COOKING" || cookingState === "PAUSED";
    if (isCookingActive) {
      if (/^(next|next step|move on|forward|continue step|go ahead|proceed|what s next|what's next|continue|advance|onwards|carry on)\b/i.test(text) && !/video/i.test(text)) {
        return result("NEXT_RECIPE_STEP", {}, 1, "context");
      }
      if (/^(previous|previous step|back|go back|step before|the one before|preceding step)\b/i.test(text) && !/video|second/i.test(text)) {
        return result("PREVIOUS_RECIPE_STEP", {}, 1, "context");
      }
      if (/^(repeat|repeat step|say that again|what did you say|repeat current step|again|one more time|again please|once more)\b/i.test(text)) {
        return result("REPEAT_RECIPE_STEP", {}, 1, "context");
      }
      if (/^(explain|explain step|what do i do|tell me more|how do i do this)\b/i.test(text)) {
        return result("EXPLAIN_STEP", {}, 1, "context");
      }
      if (/^(pause|pause cooking|hold on)\b/i.test(text) && !/video/i.test(text)) {
        return result("PAUSE_COOKING", {}, 1, "context");
      }
      if (/^(resume|resume cooking|continue cooking)\b/i.test(text) && !/video/i.test(text)) {
        return result("RESUME_COOKING", {}, 1, "context");
      }
    }

    // 3. Step Navigation (Ordinals, First, Last, Count, Remaining)
    if (/\b(take me to the last step|go to the last step|last step|final step)\b/i.test(text)) {
      return result("GOTO_LAST_STEP", {}, 1, "rule");
    }
    if (/\b(go to the first step|take me to the first step|first step|start with the first step|start with step one|start from the beginning|from the start)\b/i.test(text)) {
      return result("GOTO_FIRST_STEP", {}, 1, "rule");
    }
    if (/\b(how many steps are there|how many steps total|total steps|how many steps)\b/i.test(text) && !/remain|left/i.test(text)) {
      return result("TOTAL_STEPS", {}, 1, "rule");
    }
    if (/\b(how many steps remain|how many steps are remaining|how many steps are left|steps remaining)\b/i.test(text)) {
      return result("REMAINING_STEPS", {}, 1, "rule");
    }
    if (
      /\b(?:go to step|jump to step|move to (?:the )?step|step number|move to the)\b/i.test(text) ||
      /\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+step\b/i.test(text) ||
      /\bstep\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)\b/i.test(text) ||
      /\b(?:go to|jump to|take me to|move to)\s+(?:the\s+)?(?:step\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\b/i.test(text)
    ) {
      return result("GOTO_STEP", parametersFor("GOTO_STEP", text), 1, "rule");
    }

    // 4. Ingredient Queries (Quantity, Specified Check, Suggestions)
    if (/\b(?:was\s+(?:the\s+)?quantity.*(?:mentioned|specified)|is\s+(?:the\s+)?quantity.*(?:mentioned|specified)|was\s+that\s+specified)\b/i.test(text)) {
      return result("WAS_QUANTITY_SPECIFIED", parametersFor("WAS_QUANTITY_SPECIFIED", text), 1, "rule");
    }
    if (/\b(how much should i add if it isn t specified|suggest an amount|how much do you recommend)\b/i.test(text)) {
      return result("GET_SUGGESTED_QUANTITY", parametersFor("GET_SUGGESTED_QUANTITY", text), 1, "rule");
    }
    if (/\b(how much|how many|quantity of|amount of|what quantity of)\b/i.test(text)) {
      return result("GET_QUANTITY", parametersFor("GET_QUANTITY", text), 1, "rule");
    }

    // 5. Cooking Metadata Queries
    if (/\b(how long|cooking time|duration|how many minutes)\b/i.test(text)) {
      return result("GET_COOKING_TIME", {}, 1, "rule");
    }
    if (/\b(temperature|how hot|what temp|degrees)\b/i.test(text)) {
      return result("GET_TEMPERATURE", {}, 1, "rule");
    }
    if (/\b(equipment|what equipment|what utensils|tools needed)\b/i.test(text)) {
      return result("GET_EQUIPMENT", {}, 1, "rule");
    }

    // 6. Search YouTube voice queries
    if (/^(search(?: youtube)? for|find(?: a| an)? recipe for|find video)/i.test(text)) {
      return result("SEARCH_YOUTUBE", parametersFor("SEARCH_YOUTUBE", text), 1, "rule");
    }

    if (/\b(restart recipe|start over)\b/i.test(text)) {
      return result("RESTART_RECIPE", {}, 1, "rule");
    }
    if (/\b(stop cooking|exit cooking|finish recipe)\b/i.test(text)) {
      return result("STOP_COOKING", {}, 1, "rule");
    }

    // 7. General rule-based patterns
    const patterns = [
      ["DISABLE_CHEFMATE", /chefmate (off|disable)|turn (chefmate )?off/],
      ["ENABLE_CHEFMATE", /chefmate (on|enable)|turn (chefmate )?on/],
      // START_COOKING: "start the recipe" / "start speaking" / "begin cooking" etc.
      // Must come before GENERATE_RECIPE to avoid "start the recipe" triggering re-analysis.
      [
        "START_COOKING",
        /\bstart\s+(?:the\s+)?(?:recipe|cooking|speaking)|begin\s+(?:the\s+)?(?:recipe|cooking|instructions)|let s\s+(?:begin|cook)|tell me the first step|start speaking the recipe\b/i
      ],
      [
        "GENERATE_RECIPE",
        /(?:generate|extract|make|create|get|prepare|load|open|give me)\s+(?:me\s+)?(?:the\s+)?(?:recipe|cooking instructions)|(?:show|find)\s+(?:me\s+)?(?:the\s+)?recipe|start\s+recipe(?:\s+analysis)?|recipe\s+analysis|(?:analyze|analyse)\s+(?:this\s+)?(?:cooking\s+)?(?:video|recipe)|start\s+cooking\s+instructions|\b(?:generate|extract|prepare|create)\s+recipe\b/i
      ],
      ["NEXT_RECIPE_STEP", /next (recipe )?step/],
      ["PREVIOUS_RECIPE_STEP", /previous (recipe )?step|step before/],
      ["REPEAT_RECIPE_STEP", /repeat( that| step)?/],
      ["CURRENT_RECIPE_STEP", /current step|where am i/],
      ["GET_INGREDIENTS", /ingredients|what do i need/],
      ["SKIP_AD", /skip( the| this)? ad/],
      ["EXIT_FULLSCREEN", /(exit|leave|get out of) full ?screen/],
      ["FULLSCREEN", /(go |make it )?full ?screen/],
      ["ENABLE_CAPTIONS", /(turn )?(captions|subtitles) on|enable (captions|subtitles)/],
      ["DISABLE_CAPTIONS", /(turn )?(captions|subtitles) off|disable (captions|subtitles)/],
      ["NEXT_VIDEO", /(next video|play next video|go to next video)/],
      ["PREVIOUS_VIDEO", /(previous video|go to previous video)/],
      ["SEEK_BACKWARD", /(go |move |skip |seek )?(back|rewind)/],
      ["SEEK_FORWARD", /(go |move |skip |seek |fast )?(forward|ahead)/],
      ["SCROLL_UP", /scroll( the page)? up|go up|move up/],
      ["SCROLL_DOWN", /scroll( the page)? down|go down|move down/],
      ["UNMUTE", /unmute|turn sound on/],
      ["MUTE", /mute|turn (off )?sound/],
      ["VOLUME_UP", /volume up|increase volume|louder/],
      ["VOLUME_DOWN", /volume down|decrease volume|quieter/],
      ["NORMAL_SPEED", /normal (speed|playback)|set speed to normal/],
      ["REPLAY", /replay|play again|start again/],
      ["TOGGLE_PLAY", /play pause|toggle/],
      ["PAUSE", /pause( the video)?|stop the video/],
      ["PLAY", /play( the video| it)?|resume video|continue video/]
    ];

    if (/speed|\d(?:\.\d+)?x/.test(text)) {
      const match = text.match(/\b(0\.5|0\.75|1(?:\.25|\.5|\.75)?|2)\s*x?\b/);
      if (match) return result("SET_SPEED", { rate: Number(match[1]) });
      if (/\b(increase|faster|speed up)\b/.test(text)) return result("SET_SPEED", { rate: 1.25 });
      if (/\b(decrease|slower|slow down)\b/.test(text)) return result("SET_SPEED", { rate: 0.75 });
    }

    const matchedPattern = patterns.find(([, pat]) => pat.test(text));
    if (matchedPattern) {
      const intent = matchedPattern[0];
      return result(intent, parametersFor(intent, text), 1, "pattern");
    }

    return null;
  }

  CM.commandParser = {
    async parse(raw, explicitState = null) {
      const text = String(raw || "").trim();
      if (!text) return result("UNKNOWN", {}, 0);

      const assistant = (typeof window !== "undefined" && window.ChefMate?.assistant)
        ? window.ChefMate.assistant
        : CM.assistant;
      const cookingState = explicitState || assistant?.state || "IDLE";

      const runParse = async () => {
        // 1. Context-aware and domain-specific rules first
        const contextResult = parseContextAware(text, cookingState);
        if (contextResult) {
          return contextResult;
        }

        // 2. Python ML API through background worker
        try {
          const response = await new Promise(resolve => {
            if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
              resolve(null);
              return;
            }

            chrome.runtime.sendMessage(
              { type: "CHEFMATE_PREDICT_INTENT", text },
              reply => {
                if (chrome.runtime.lastError) {
                  resolve(null);
                  return;
                }
                resolve(reply || null);
              }
            );
          });

          if (response?.success && response.intent && intentMap[response.intent]) {
            const mappedIntent = intentMap[response.intent];
            const margin = response.margin_gap ?? 1.0;
            const topScore = response.top_score ?? 1.0;

            if (margin >= 0.2 || topScore > 0.5) {
              let finalIntent = mappedIntent;
              const isCookingActive = cookingState === "COOKING" || cookingState === "PAUSED";
              if (isCookingActive && finalIntent === "NEXT_VIDEO" && !/video/i.test(text)) {
                finalIntent = "NEXT_RECIPE_STEP";
              }
              if (isCookingActive && finalIntent === "PAUSE" && !/video/i.test(text)) {
                finalIntent = "PAUSE_COOKING";
              }

              return result(
                finalIntent,
                parametersFor(finalIntent, text),
                Math.min(1.0, 0.7 + margin * 0.2),
                "ml"
              );
            }
          }
        } catch (error) {
          console.warn("[CHEFMATE ML] Request error; using fallback:", error);
        }

        // 3. Fallback
        const fallbackResult = parseContextAware(text, "IDLE");
        return fallbackResult || result("UNKNOWN", {}, 0);
      };

      const finalResult = await runParse();
      console.log(`[CHEFMATE FLOW] Command recognized: "${text}" -> intent=${finalResult.intent} | state=${cookingState} | method=${finalResult.method} | params=`, finalResult.parameters);
      return finalResult;
    },

    _parseContextAware: parseContextAware,
    _parametersFor: parametersFor,
    _parseNumber: parseNumber
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = CM.commandParser;
  }
})();
