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
      CM.visualExtractor?.cancel();
      CM.voice?.stopSpeaking();
      CM.ui?.resetRecipe();
    },

    async generateRecipe() {
      console.log('[CHEFMATE FLOW] State changed: -> ANALYZING');
      this.state = "ANALYZING";
      this.currentRecipe = null;
      this.currentStepIndex = 0;
      CM.ui?.resetRecipe();
      CM.ui?.setRecipeStatus("Analyzing video");
      console.debug("[CHEFMATE] generateRecipe() started");

      const videoInfo = CM.youtubeController.currentVideo();
      this.currentVideoId = videoInfo.id || "";
      const videoElement = document.querySelector("video");
      const videoDuration = videoElement && Number.isFinite(videoElement.duration) ? videoElement.duration : 0;

      // Ensure any pending speech is cancelled
      CM.voice?.stopSpeaking();

      // 1. Fetch complete transcript segments across entire video
      let segments = [];
      let transcriptResult = null;
      let captionsRetrieved = false;
      try {
        console.debug("[CHEFMATE] Fetching transcript…");
        if (CM.recipeExtractor && typeof CM.recipeExtractor.subtitleSweep === "function") {
          transcriptResult = await CM.recipeExtractor.subtitleSweep(videoElement);
        } else if (CM.transcriptExtractor && typeof CM.transcriptExtractor.getSegments === "function") {
          transcriptResult = await CM.transcriptExtractor.getSegments();
        }
        if (transcriptResult && transcriptResult.success && Array.isArray(transcriptResult.segments) && transcriptResult.segments.length > 0) {
          segments = transcriptResult.segments;
          captionsRetrieved = true;
          console.debug("[CHEFMATE] Transcript segments:", segments.length);
        }
      } catch (err) {
        console.warn("[CHEFMATE] Transcript extraction warning:", err);
      }

      // 1b. Audio Transcription Fallback when captions are absent
      let audioResult = null;
      try {
        if (CM.audioTranscriber && typeof CM.audioTranscriber.transcribeVideo === "function") {
          audioResult = await CM.audioTranscriber.transcribeVideo({
            videoElement,
            videoDuration,
            videoInfo,
            captionsRetrieved
          });
          if (audioResult && audioResult.success && Array.isArray(audioResult.segments)) {
            segments = segments.concat(audioResult.segments);
            console.debug("[CHEFMATE] Audio transcribed segments:", audioResult.segments.length);
          }
        }
      } catch (audioErr) {
        console.warn("[CHEFMATE] Audio transcription warning:", audioErr);
      }

      // 2. Perform Visual OCR and Computer Vision Analysis on video frames
      let ocrRecords = [];
      let visualObservations = [];
      let visualResult = null;
      try {
        if (CM.visualExtractor && typeof CM.visualExtractor.extractVisualRecipe === "function") {
          visualResult = await CM.visualExtractor.extractVisualRecipe({
            videoElement,
            videoInfo,
            videoDuration
          });
          if (visualResult && visualResult.success) {
            if (Array.isArray(visualResult.records)) {
              ocrRecords = visualResult.records;
            }
            if (Array.isArray(visualResult.visualObservations)) {
              visualObservations = visualResult.visualObservations;
            }
            console.debug("[CHEFMATE] Visual records:", ocrRecords.length, "Visual CV observations:", visualObservations.length);
          }
        }
      } catch (ocrErr) {
        console.warn("[CHEFMATE] Visual analysis warning (failing safely):", ocrErr);
      }

      // 3. Classify video before any recipe extraction (using Transcript + Visual OCR + CV)
      let classification = null;
      try {
        if (CM.recipeExtractor && typeof CM.recipeExtractor.classifyVideo === "function") {
          classification = CM.recipeExtractor.classifyVideo({
            title: videoInfo.title,
            description: videoInfo.description,
            segments,
            videoDuration,
            transcriptResult,
            ocrRecords,
            visualObservations
          });
        }
      } catch (classErr) {
        console.warn("[CHEFMATE] Video classification error (failing safely):", classErr);
        classification = {
          category: "INSUFFICIENT_EVIDENCE",
          confidence: 0,
          reason: "Classifier encountered an internal error."
        };
      }

      if (!classification) {
        classification = {
          category: (segments && segments.length > 5) || (ocrRecords && ocrRecords.length > 2) || (visualObservations && visualObservations.length > 1) ? "COOKING_TUTORIAL" : "INSUFFICIENT_EVIDENCE",
          confidence: 0.5,
          reason: "Fallback evaluation"
        };
      }

      console.log(`[CHEFMATE FLOW] Video classified: category=${classification.category} | confidence=${classification.confidence} | reason="${classification.reason}"`);

      // 4. FAIL SAFELY if video is not a verified cooking tutorial
      if (classification.category !== "COOKING_TUTORIAL" && classification.category !== "COOKING_CONFIRMED") {
        this.state = "IDLE";
        this.currentRecipe = null;
        this.currentStepIndex = 0;
        CM.ui?.resetRecipe();
        CM.voice?.stopSpeaking();

        let uiStatus = "Not a cooking tutorial";
        let message = "This doesn't appear to be a cooking tutorial. Please open a cooking or recipe video to use ChefMate.";

        if (classification.category === "FOOD_RELATED_NON_TUTORIAL" || classification.category === "FOOD_RELATED_NO_RECIPE") {
          uiStatus = "Food-related but no usable instructions";
          message = "This video is related to food, but it doesn't contain enough cooking instructions to generate a reliable recipe.";
        } else if (classification.category === "INSUFFICIENT_EVIDENCE") {
          uiStatus = "Insufficient transcript or evidence";
          message = "I couldn't verify that this video contains a usable recipe. Please check the subtitles or try another cooking video.";
        }

        CM.ui?.setRecipeStatus(uiStatus);

        return {
          success: false,
          action: "GENERATE_RECIPE",
          category: classification.category,
          reason: classification.reason,
          message,
          speak: true
        };
      }

      // 5. Confirmed cooking tutorial: update UI status
      CM.ui?.setRecipeStatus("Cooking tutorial verified");

      // Track independent source statuses
      const sourceStatuses = {
        transcript: captionsRetrieved ? "COMPLETED" : (transcriptResult?.error ? "FAILED" : "UNAVAILABLE"),
        audio: audioResult ? audioResult.status : "UNAVAILABLE",
        ocr: ocrRecords && ocrRecords.length > 0 ? "COMPLETED" : (visualResult?.warnings?.length ? "FAILED" : "UNAVAILABLE"),
        vision: visualObservations && visualObservations.length > 0 ? "COMPLETED" : "UNAVAILABLE",
        metadata: videoInfo?.title ? "COMPLETED" : "UNAVAILABLE"
      };
      if (typeof CM.ui?.setSourceStatuses === "function") {
        CM.ui.setSourceStatuses(sourceStatuses);
      }

      // 6. Extract and reconcile complete recipe (Transcript + Description + Visual OCR + CV)
      const recipe = CM.recipeExtractor.extract({
        videoId: videoInfo.id,
        videoTitle: videoInfo.title,
        videoDuration,
        description: videoInfo.description,
        segments,
        ocrRecords,
        visualObservations,
        visualStats: visualResult
      });

      console.debug("[CHEFMATE] recipe.success:", recipe.success,
        "| dish:", recipe.dish_name,
        "| ingredients:", recipe.ingredients?.length,
        "| steps:", recipe.steps?.length);

      // Validate dish consistency: Disallow severe dish mismatch (e.g. biryani -> pulihora)
      if (recipe.consistency && recipe.consistency.valid === false) {
        this.state = "IDLE";
        this.currentRecipe = null;
        this.currentStepIndex = 0;
        CM.ui?.resetRecipe();
        CM.voice?.stopSpeaking();

        const uiStatus = "Dish mismatch detected";
        const message = recipe.consistency.reason || "I detected a conflict between the video dish and extracted recipe.";
        CM.ui?.setRecipeStatus(uiStatus);

        return {
          success: false,
          action: "GENERATE_RECIPE",
          category: "DISH_MISMATCH",
          dishName: recipe.dish_name,
          message,
          speak: true
        };
      }

      // Validate extracted evidence: Must have actual usable cooking steps
      if (!recipe.success || !recipe.steps || recipe.steps.length === 0) {
        this.state = "IDLE";
        this.currentRecipe = null;
        this.currentStepIndex = 0;
        CM.ui?.resetRecipe();
        CM.voice?.stopSpeaking();

        const uiStatus = "Food-related but no usable instructions";
        const message = "This video is related to food, but it doesn't contain enough cooking instructions to generate a reliable recipe.";
        CM.ui?.setRecipeStatus(uiStatus);

        return {
          success: false,
          action: "GENERATE_RECIPE",
          category: "FOOD_RELATED_NON_TUTORIAL",
          message,
          speak: true
        };
      }

      this.currentRecipe = recipe;
      this.currentStepIndex = 0;
      CM.ui?.renderRecipe(recipe, 0);
      CM.ui?.setRecipeStatus("Recipe ready");

      // Transition to ingredient preference state — speak the question
      this.state = "AWAITING_INGREDIENT_PREFERENCE";
      console.log(`[CHEFMATE FLOW] Recipe generated: ${recipe.ingredients.length} ingredients, ${recipe.steps.length} steps`);
      console.log('[CHEFMATE FLOW] State changed: -> AWAITING_INGREDIENT_PREFERENCE');

      const allQuantitiesUnspecified = recipe.ingredients.length === 0 ||
        (recipe.ingredients.length === 1 && recipe.ingredients[0].name.includes("shown in video")) ||
        recipe.ingredients.every(i => !i.quantity_specified);

      const prompt = allQuantitiesUnspecified
        ? "I've prepared the recipe from the visual instructions in the video. Quantities are not specified on screen. Would you like me to start the cooking instructions?"
        : "I've prepared the recipe. Would you like me to tell you the ingredients and their quantities first?";

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

      const isUnspecifiedOnly = this.currentRecipe.ingredients.length === 0 ||
        (this.currentRecipe.ingredients.length === 1 && this.currentRecipe.ingredients[0].name.includes("shown in video")) ||
        this.currentRecipe.ingredients.every(i => !i.quantity_specified && !i.quantity);

      if (isUnspecifiedOnly) {
        this.state = "AWAITING_START_CONFIRMATION";
        console.log('[CHEFMATE FLOW] State changed: -> AWAITING_START_CONFIRMATION');
        return {
          success: true,
          action: "CONFIRM_INGREDIENTS",
          message: "Ingredients are shown visually in the video without specified quantities. Shall I start the cooking instructions?",
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

      let intro = "Okay, let's start cooking. Step one:";
      if (this.currentRecipe.prerequisiteNotice) {
        intro = `${this.currentRecipe.prerequisiteNotice} Okay, let's start cooking. Step one:`;
      }

      return {
        success: true,
        action: "START_COOKING",
        message: `${intro} ${step.instruction}`,
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
        if (match.has_conflict || match.quantity_uncertain) {
          const trans = match.transcript_quantity || "the spoken audio";
          const vis = match.visual_quantity || "the on-screen text";
          return {
            success: true,
            action: "GET_QUANTITY",
            message: `The quantity of ${match.name} is uncertain due to a conflict between the video specifying "${trans}" and on-screen text showing "${vis}". Neither value could be confirmed.`,
            speak: true
          };
        }

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
        if (match.has_conflict || match.quantity_uncertain) {
          return {
            success: true,
            action: "WAS_QUANTITY_SPECIFIED",
            message: `The quantity of ${match.name} was not clearly specified due to a conflict between the spoken audio and on-screen text.`,
            speak: true
          };
        }

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
          assistant.state = "PAUSED";
          CM.voice?.stopSpeaking();
          return {
            success: true,
            action: "STOP_COOKING",
            message: "Cooking assistant paused. Say continue cooking when you are ready.",
            speak: true
          };

        case "EXIT_COOKING":
          assistant.state = "IDLE";
          CM.voice?.stopSpeaking();
          return {
            success: true,
            action: "EXIT_COOKING",
            message: "Exited cooking mode. Your recipe is still loaded in the panel.",
            speak: true
          };

        case "HELP":
          return {
            success: true,
            action: "HELP",
            message: "You can say 'generate recipe', 'next step', 'previous step', 'repeat', 'pause', 'play', or ask how much of an ingredient you need.",
            speak: true
          };

        case "CANCEL":
          CM.voice?.stopSpeaking();
          return {
            success: true,
            action: "CANCEL",
            message: "Cancelled.",
            speak: false
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

        case "SCROLL_TOP":
          return controller.scrollToTop();

        case "SCROLL_BOTTOM":
          return controller.scrollToBottom();

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
