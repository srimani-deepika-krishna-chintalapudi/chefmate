(() => {
  const CM = (typeof window !== "undefined" ? (window.ChefMate = window.ChefMate || {}) : {});

  // Authoritative Cooking Assistant State Machine
  CM.assistant = {
    state: "IDLE", // IDLE, ANALYZING, AWAITING_INGREDIENT_PREFERENCE, READING_INGREDIENTS, AWAITING_START_CONFIRMATION, COOKING, PAUSED, RECIPE_COMPLETE, ERROR
    currentRecipe: null,
    currentStepIndex: 0,
    currentVideoId: "",

    reset(newVideoId = "") {
      this.state = "IDLE";
      this.currentRecipe = null;
      this.currentStepIndex = 0;
      this.currentVideoId = newVideoId;
      CM.voice?.stopSpeaking();
      CM.ui?.resetRecipe();
    },

    async generateRecipe() {
      console.log('[CHEFMATE FLOW] State changed: -> ANALYZING');
      this.state = "ANALYZING";
      CM.ui?.setRecipeStatus("Analyzing complete video description and subtitles…");
      console.debug("[CHEFMATE] generateRecipe() started");

      const videoInfo = CM.youtubeController.currentVideo();
      this.currentVideoId = videoInfo.id || "";
      const videoElement = document.querySelector("video");
      const videoDuration = videoElement && Number.isFinite(videoElement.duration) ? videoElement.duration : 0;

      // 1. Fetch complete transcript segments across entire video
      let segments = [];
      try {
        console.debug("[CHEFMATE] Fetching transcript…");
        let transcriptResult = null;
        if (CM.recipeExtractor && typeof CM.recipeExtractor.subtitleSweep === "function") {
          transcriptResult = await CM.recipeExtractor.subtitleSweep(videoElement);
        } else if (CM.transcriptExtractor && typeof CM.transcriptExtractor.getSegments === "function") {
          transcriptResult = await CM.transcriptExtractor.getSegments();
        }
        if (transcriptResult && transcriptResult.success) {
          segments = transcriptResult.segments;
          console.debug("[CHEFMATE] Transcript segments:", segments.length);
        }
      } catch (err) {
        console.warn("[CHEFMATE] Transcript extraction warning:", err);
      }

      // 2. Extract and reconcile complete recipe
      const recipe = CM.recipeExtractor.extract({
        videoId: videoInfo.id,
        videoTitle: videoInfo.title,
        videoDuration,
        description: videoInfo.description,
        segments
      });

      console.debug("[CHEFMATE] recipe.success:", recipe.success,
        "| ingredients:", recipe.ingredients?.length,
        "| steps:", recipe.steps?.length);

      if (!recipe.success || (recipe.ingredients.length === 0 && recipe.steps.length === 0)) {
        this.state = "ERROR";
        console.log('[CHEFMATE FLOW] State changed: -> ERROR');
        CM.ui?.setRecipeStatus("Could not extract a cooking recipe from this video.");
        return {
          success: false,
          action: "GENERATE_RECIPE",
          message: "I could not find a clear recipe in this video's description or transcript.",
          speak: true
        };
      }

      this.currentRecipe = recipe;
      this.currentStepIndex = 0;
      CM.ui?.renderRecipe(recipe, 0);

      // Transition to ingredient preference state — speak the question
      this.state = "AWAITING_INGREDIENT_PREFERENCE";
      console.log(`[CHEFMATE FLOW] Recipe generated: ${recipe.ingredients.length} ingredients, ${recipe.steps.length} steps`);
      console.log('[CHEFMATE FLOW] State changed: -> AWAITING_INGREDIENT_PREFERENCE');
      const prompt = "I've prepared the recipe. Would you like me to tell you the ingredients and their quantities first?";

      return {
        success: true,
        action: "GENERATE_RECIPE",
        message: prompt,
        speak: true
      };
    },

    confirmIngredients() {
      if (!this.currentRecipe) {
        return {
          success: false,
          action: "CONFIRM_INGREDIENTS",
          message: "No recipe is active. Say generate recipe first.",
          speak: true
        };
      }

      console.log('[CHEFMATE FLOW] State changed: -> READING_INGREDIENTS');
      this.state = "READING_INGREDIENTS";

      if (this.currentRecipe.ingredients.length === 0) {
        this.state = "AWAITING_START_CONFIRMATION";
        console.log('[CHEFMATE FLOW] State changed: -> AWAITING_START_CONFIRMATION');
        return {
          success: true,
          action: "CONFIRM_INGREDIENTS",
          message: "No separate ingredient list was found in this video. Would you like me to start the cooking instructions?",
          speak: true
        };
      }

      const items = this.currentRecipe.ingredients.map(ing => {
        if (ing.quantity_specified && ing.quantity) {
          const unitStr = ing.unit ? ` ${ing.unit}` : "";
          return `${ing.quantity}${unitStr} of ${ing.name}`;
        }
        return `${ing.name}, with quantity not specified`;
      });

      let text = "The ingredients mentioned in the video are: " + items.slice(0, 8).join(", ");
      if (items.length > 8) {
        text += `, plus ${items.length - 8} more shown in the panel`;
      }
      text += ". Shall I start the cooking instructions?";

      this.state = "AWAITING_START_CONFIRMATION";
      console.log('[CHEFMATE FLOW] State changed: -> AWAITING_START_CONFIRMATION');
      return {
        success: true,
        action: "CONFIRM_INGREDIENTS",
        message: text,
        speak: true
      };
    },

    skipIngredients() {
      return this.startCooking();
    },

    startCooking() {
      if (!this.currentRecipe || this.currentRecipe.steps.length === 0) {
        return {
          success: false,
          action: "START_COOKING",
          message: "No recipe steps available. Say generate recipe first.",
          speak: true
        };
      }

      this.state = "COOKING";
      this.currentStepIndex = 0;
      console.log('[CHEFMATE FLOW] State changed: -> COOKING | Step: 1');
      CM.ui?.highlightStep(0);

      const step = this.currentRecipe.steps[0];
      if (typeof step.start_seconds === "number" && step.start_seconds > 0) {
        CM.youtubeController?.seekTo(step.start_seconds);
      }

      return {
        success: true,
        action: "START_COOKING",
        message: `Okay, let's start cooking. Step one: ${step.instruction}`,
        speak: true
      };
    },

    nextStep() {
      if (!this.currentRecipe || this.currentRecipe.steps.length === 0) {
        return {
          success: false,
          action: "NEXT_RECIPE_STEP",
          message: "No recipe is currently active. Say generate recipe first.",
          speak: true
        };
      }

      // If cooking hasn't started yet, "next step" starts step 1!
      if (this.state !== "COOKING" && this.state !== "PAUSED" && this.state !== "RECIPE_COMPLETE") {
        return this.startCooking();
      }

      if (this.currentStepIndex < this.currentRecipe.steps.length - 1) {
        this.currentStepIndex += 1;
        this.state = "COOKING";
        CM.ui?.highlightStep(this.currentStepIndex);

        const step = this.currentRecipe.steps[this.currentStepIndex];
        if (typeof step.start_seconds === "number" && step.start_seconds > 0) {
          CM.youtubeController?.seekTo(step.start_seconds);
        }

        return {
          success: true,
          action: "NEXT_RECIPE_STEP",
          message: `Step ${step.step_number}: ${step.instruction}`,
          speak: true
        };
      }

      this.state = "RECIPE_COMPLETE";
      return {
        success: true,
        action: "NEXT_RECIPE_STEP",
        message: "That was the last step. Your recipe is complete. Enjoy your meal!",
        speak: true
      };
    },

    previousStep() {
      if (!this.currentRecipe || this.currentRecipe.steps.length === 0) {
        return {
          success: false,
          action: "PREVIOUS_RECIPE_STEP",
          message: "No recipe is currently active.",
          speak: true
        };
      }

      if (this.currentStepIndex > 0) {
        this.currentStepIndex -= 1;
        this.state = "COOKING";
        CM.ui?.highlightStep(this.currentStepIndex);

        const step = this.currentRecipe.steps[this.currentStepIndex];
        if (typeof step.start_seconds === "number" && step.start_seconds > 0) {
          CM.youtubeController?.seekTo(step.start_seconds);
        }

        return {
          success: true,
          action: "PREVIOUS_RECIPE_STEP",
          message: `Step ${step.step_number}: ${step.instruction}`,
          speak: true
        };
      }

      return {
        success: true,
        action: "PREVIOUS_RECIPE_STEP",
        message: "You're already at the first step.",
        speak: true
      };
    },

    repeatStep() {
      if (!this.currentRecipe || this.currentRecipe.steps.length === 0) {
        return {
          success: false,
          action: "REPEAT_RECIPE_STEP",
          message: "No active recipe step to repeat.",
          speak: true
        };
      }

      const step = this.currentRecipe.steps[this.currentStepIndex];
      return {
        success: true,
        action: "REPEAT_RECIPE_STEP",
        message: `Step ${step.step_number}: ${step.instruction}`,
        speak: true
      };
    },

    explainStep() {
      if (!this.currentRecipe || this.currentRecipe.steps.length === 0) {
        return {
          success: false,
          action: "EXPLAIN_STEP",
          message: "No active recipe step to explain.",
          speak: true
        };
      }

      const step = this.currentRecipe.steps[this.currentStepIndex];
      let details = `Step ${step.step_number}: ${step.instruction}`;

      if (step.duration_seconds) {
        details += ` This takes approximately ${Math.round(step.duration_seconds / 60)} minutes.`;
      }
      if (step.temperature) {
        details += ` Cook at ${step.temperature}.`;
      }
      if (step.doneness_cue) {
        details += ` Cook ${step.doneness_cue}.`;
      }

      return {
        success: true,
        action: "EXPLAIN_STEP",
        message: details,
        speak: true
      };
    },

    gotoStep(stepNumber) {
      if (!this.currentRecipe || this.currentRecipe.steps.length === 0) {
        return {
          success: false,
          action: "GOTO_STEP",
          message: "No recipe is currently active. Say generate recipe first.",
          speak: true
        };
      }

      const total = this.currentRecipe.steps.length;
      if (stepNumber < 1 || stepNumber > total) {
        return {
          success: false,
          action: "GOTO_STEP",
          message: `This recipe has ${total} steps. Please choose a step between 1 and ${total}.`,
          speak: true
        };
      }

      // If jumping to step 1 from an awaiting state, transition into cooking with intro
      if (stepNumber === 1 && (this.state === "AWAITING_INGREDIENT_PREFERENCE" || this.state === "AWAITING_START_CONFIRMATION")) {
        return this.startCooking();
      }

      const idx = stepNumber - 1;
      this.currentStepIndex = idx;
      this.state = "COOKING";
      CM.ui?.highlightStep(idx);

      const step = this.currentRecipe.steps[idx];
      if (typeof step.start_seconds === "number" && step.start_seconds > 0) {
        CM.youtubeController?.seekTo(step.start_seconds);
      }

      return {
        success: true,
        action: "GOTO_STEP",
        message: `Step ${step.step_number}: ${step.instruction}`,
        speak: true
      };
    },

    gotoFirstStep() {
      if (this.state === "AWAITING_INGREDIENT_PREFERENCE" || this.state === "AWAITING_START_CONFIRMATION" || this.state === "IDLE") {
        return this.startCooking();
      }
      return this.gotoStep(1);
    },

    gotoLastStep() {
      if (!this.currentRecipe || this.currentRecipe.steps.length === 0) {
        return {
          success: false,
          action: "GOTO_LAST_STEP",
          message: "No recipe is active.",
          speak: true
        };
      }
      return this.gotoStep(this.currentRecipe.steps.length);
    },

    totalSteps() {
      if (!this.currentRecipe || this.currentRecipe.steps.length === 0) {
        return {
          success: false,
          action: "TOTAL_STEPS",
          message: "No recipe is active.",
          speak: true
        };
      }
      return {
        success: true,
        action: "TOTAL_STEPS",
        message: `There are ${this.currentRecipe.steps.length} steps in this recipe.`,
        speak: true
      };
    },

    remainingSteps() {
      if (!this.currentRecipe || this.currentRecipe.steps.length === 0) {
        return {
          success: false,
          action: "REMAINING_STEPS",
          message: "No recipe is active.",
          speak: true
        };
      }
      const rem = this.currentRecipe.steps.length - (this.currentStepIndex + 1);
      return {
        success: true,
        action: "REMAINING_STEPS",
        message: `You are on step ${this.currentStepIndex + 1}. There ${rem === 1 ? 'is 1 step' : `are ${rem} steps`} remaining.`,
        speak: true
      };
    },

    getQuantity(name) {
      if (!this.currentRecipe || this.currentRecipe.ingredients.length === 0) {
        return {
          success: false,
          action: "GET_QUANTITY",
          message: "No ingredients loaded for this recipe.",
          speak: true
        };
      }

      const query = (name || "").toLowerCase().trim().replace(/s$/, "");
      const match = this.currentRecipe.ingredients.find(i => {
        const iName = i.name.toLowerCase().replace(/s$/, "");
        return iName.includes(query) || query.includes(iName);
      });

      if (match) {
        if (match.quantity_specified && match.quantity) {
          const u = match.unit ? ` ${match.unit}` : "";
          return {
            success: true,
            action: "GET_QUANTITY",
            message: `The recipe calls for ${match.quantity}${u} of ${match.name}.`,
            speak: true
          };
        }

        // Section 5: Practical Suggestion when unspecified
        const suggestion = CM.recipeExtractor.getPracticalSuggestion(match.name);
        if (suggestion) {
          return {
            success: true,
            action: "GET_QUANTITY",
            message: `The video does not specify the quantity of ${match.name}. As a practical suggestion, you could start with ${suggestion} and adjust to your taste. This is a suggested amount, not a quantity extracted from the video.`,
            speak: true
          };
        }

        return {
          success: true,
          action: "GET_QUANTITY",
          message: `The video does not specify the quantity of ${match.name}. If you tell me your serving size, I can suggest an appropriate amount.`,
          speak: true
        };
      }

      // Check practical suggestion if ingredient is recognized generally
      const generalSuggestion = CM.recipeExtractor.getPracticalSuggestion(query);
      if (generalSuggestion) {
        return {
          success: true,
          action: "GET_QUANTITY",
          message: `I couldn't find ${name || 'that ingredient'} in this video's recipe list. However, a standard culinary amount is ${generalSuggestion}.`,
          speak: true
        };
      }

      return {
        success: false,
        action: "GET_QUANTITY",
        message: `I couldn't find ${name || 'that ingredient'} in this recipe's ingredient list.`,
        speak: true
      };
    },

    wasQuantitySpecified(name) {
      if (!this.currentRecipe) {
        return {
          success: false,
          action: "WAS_QUANTITY_SPECIFIED",
          message: "No recipe is active.",
          speak: true
        };
      }

      const query = (name || "").toLowerCase().trim().replace(/s$/, "");
      const match = this.currentRecipe.ingredients.find(i => {
        const iName = i.name.toLowerCase().replace(/s$/, "");
        return iName.includes(query) || query.includes(iName);
      });

      if (match) {
        if (match.quantity_specified && match.quantity) {
          const u = match.unit ? ` ${match.unit}` : "";
          return {
            success: true,
            action: "WAS_QUANTITY_SPECIFIED",
            message: `Yes, the video specifies ${match.quantity}${u} of ${match.name}.`,
            speak: true
          };
        }
        return {
          success: true,
          action: "WAS_QUANTITY_SPECIFIED",
          message: `No, the quantity of ${match.name} was not specified in the video.`,
          speak: true
        };
      }

      return {
        success: false,
        action: "WAS_QUANTITY_SPECIFIED",
        message: `I couldn't find ${name || 'that ingredient'} in this recipe.`,
        speak: true
      };
    },

    getEquipment() {
      if (!this.currentRecipe) {
        return {
          success: false,
          action: "GET_EQUIPMENT",
          message: "No recipe is active.",
          speak: true
        };
      }

      if (this.currentRecipe.equipment && this.currentRecipe.equipment.length > 0) {
        return {
          success: true,
          action: "GET_EQUIPMENT",
          message: `The equipment needed for this recipe is: ${this.currentRecipe.equipment.join(", ")}.`,
          speak: true
        };
      }

      return {
        success: true,
        action: "GET_EQUIPMENT",
        message: "No specific equipment checklist was identified for this recipe.",
        speak: true
      };
    },

    getCookingTime() {
      if (!this.currentRecipe) {
        return {
          success: false,
          action: "GET_COOKING_TIME",
          message: "No active recipe.",
          speak: true
        };
      }

      const step = this.currentRecipe.steps[this.currentStepIndex];
      if (step?.duration_seconds) {
        const mins = Math.round(step.duration_seconds / 60);
        return {
          success: true,
          action: "GET_COOKING_TIME",
          message: `This step takes about ${mins > 0 ? mins + ' minutes' : step.duration_seconds + ' seconds'}.`,
          speak: true
        };
      }

      return {
        success: true,
        action: "GET_COOKING_TIME",
        message: "No specific cooking time was stated for this step.",
        speak: true
      };
    },

    getTemperature() {
      if (!this.currentRecipe) {
        return {
          success: false,
          action: "GET_TEMPERATURE",
          message: "No active recipe.",
          speak: true
        };
      }

      const step = this.currentRecipe.steps[this.currentStepIndex];
      if (step?.temperature) {
        return {
          success: true,
          action: "GET_TEMPERATURE",
          message: `The temperature for this step is ${step.temperature}.`,
          speak: true
        };
      }

      return {
        success: true,
        action: "GET_TEMPERATURE",
        message: "No specific temperature was stated for this step.",
        speak: true
      };
    },

    restartRecipe() {
      return this.gotoStep(1);
    },

    pauseCooking() {
      this.state = "PAUSED";
      return {
        success: true,
        action: "PAUSE_COOKING",
        message: "Cooking paused. Say resume cooking when you are ready.",
        speak: true
      };
    },

    resumeCooking() {
      this.state = "COOKING";
      const step = this.currentRecipe?.steps[this.currentStepIndex];
      return {
        success: true,
        action: "RESUME_COOKING",
        message: step ? `Resuming at step ${step.step_number}: ${step.instruction}` : "Resuming cooking.",
        speak: true
      };
    }
  };

  // Main Command Executor
  CM.commandExecutor = {
    async execute(command) {
      const controller = CM.youtubeController;
      const assistant = CM.assistant;
      const parameters = command.parameters || {};

      console.log(`[CHEFMATE FLOW] Command execution dispatch: intent=${command.intent} | Pre-state=${assistant.state} | Step=${assistant.currentStepIndex + 1}`);

      const executeIntent = async () => {
        switch (command.intent) {
        case "GENERATE_RECIPE":
          return assistant.generateRecipe();

        case "CONFIRM_INGREDIENTS":
          return assistant.confirmIngredients();

        case "SKIP_INGREDIENTS":
          return assistant.skipIngredients();

        case "START_COOKING":
          return assistant.startCooking();

        case "WAIT_COOKING":
          return {
            success: true,
            action: "WAIT_COOKING",
            message: "Okay, let me know when you're ready to start.",
            speak: true
          };

        case "NEXT_RECIPE_STEP":
          return assistant.nextStep();

        case "PREVIOUS_RECIPE_STEP":
          return assistant.previousStep();

        case "REPEAT_RECIPE_STEP":
        case "CURRENT_RECIPE_STEP":
          return assistant.repeatStep();

        case "EXPLAIN_STEP":
          return assistant.explainStep();

        case "GET_INGREDIENTS":
          return assistant.confirmIngredients();

        case "GET_QUANTITY":
        case "GET_SUGGESTED_QUANTITY":
          return assistant.getQuantity(parameters.ingredient);

        case "WAS_QUANTITY_SPECIFIED":
          return assistant.wasQuantitySpecified(parameters.ingredient);

        case "GET_EQUIPMENT":
          return assistant.getEquipment();

        case "GET_COOKING_TIME":
          return assistant.getCookingTime();

        case "GET_TEMPERATURE":
          return assistant.getTemperature();

        case "GOTO_STEP":
          return assistant.gotoStep(parameters.step || 1);

        case "GOTO_FIRST_STEP":
          return assistant.gotoFirstStep();

        case "GOTO_LAST_STEP":
          return assistant.gotoLastStep();

        case "TOTAL_STEPS":
          return assistant.totalSteps();

        case "REMAINING_STEPS":
          return assistant.remainingSteps();

        case "RESTART_RECIPE":
          return assistant.restartRecipe();

        case "PAUSE_COOKING":
          return assistant.pauseCooking();

        case "RESUME_COOKING":
          return assistant.resumeCooking();

        case "STOP_COOKING":
          assistant.reset();
          return {
            success: true,
            action: "STOP_COOKING",
            message: "Cooking assistant stopped.",
            speak: true
          };

        case "SEARCH_YOUTUBE":
          return controller.search(parameters.query);

        // Video playback actions
        case "PLAY":
          return controller.play();

        case "PAUSE":
          return controller.pause();

        case "TOGGLE_PLAY":
          return controller.togglePlay();

        case "REPLAY":
          return controller.replay();

        case "SEEK_FORWARD":
          return controller.seekForward(parameters.seconds || 10);

        case "SEEK_BACKWARD":
          return controller.seekBackward(parameters.seconds || 10);

        case "SCROLL_UP":
          return controller.scrollUp();

        case "SCROLL_DOWN":
          return controller.scrollDown();

        case "VOLUME_UP":
          return controller.increaseVolume();

        case "VOLUME_DOWN":
          return controller.decreaseVolume();

        case "MUTE":
          return controller.mute();

        case "UNMUTE":
          return controller.unmute();

        case "FULLSCREEN":
          return controller.fullscreen();

        case "EXIT_FULLSCREEN":
          return controller.exitFullscreen();

        case "SKIP_AD":
          return controller.skipAd();

        case "ENABLE_CAPTIONS":
          return controller.toggleCaptions(true);

        case "DISABLE_CAPTIONS":
          return controller.toggleCaptions(false);

        case "SET_SPEED":
          return controller.setPlaybackRate(parameters.rate || 1);

        case "NORMAL_SPEED":
          return controller.setPlaybackRate(1);

        case "NEXT_VIDEO":
          assistant.reset();
          return controller.nextVideo();

        case "PREVIOUS_VIDEO":
          assistant.reset();
          return controller.previousVideo();

        default:
          return {
            success: false,
            action: command.intent,
            message: "I didn't recognize that command.",
            speak: false
          };
      }
    };

    const result = await executeIntent();
    console.log(`[CHEFMATE FLOW] Command execution completed: intent=${command.intent} | Post-state=${assistant.state} | Step=${assistant.currentStepIndex + 1} | speak=${result?.speak} | msg="${result?.message?.slice(0, 50)}..."`);
    return result;
  }
};

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      assistant: CM.assistant,
      executor: CM.commandExecutor
    };
  }
})();
