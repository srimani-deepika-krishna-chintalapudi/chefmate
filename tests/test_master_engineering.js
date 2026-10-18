const assert = require("assert");

// Setup browser-like environment for Node.js
global.window = global;
global.window.ChefMate = global.ChefMate || {};
global.document = {
  createElement(tag) {
    if (tag === "canvas") {
      return {
        width: 640,
        height: 360,
        getContext() {
          return {
            drawImage() {},
            getImageData() { return { data: new Uint8ClampedArray(640 * 360 * 4) }; }
          };
        },
        toDataURL() {
          return "data:image/jpeg;base64,mockCanvasData";
        }
      };
    }
    return {};
  },
  querySelector(selector) {
    if (selector === "video" || selector.includes("video")) {
      return {
        currentTime: 0,
        duration: 300,
        paused: true,
        ended: false,
        muted: false,
        volume: 1.0,
        playbackRate: 1.0,
        isConnected: true,
        readyState: 4,
        videoWidth: 1280,
        videoHeight: 720,
        addEventListener() {},
        removeEventListener() {},
        play() { return Promise.resolve(); },
        pause() { this.paused = true; }
      };
    }
    return null;
  },
  querySelectorAll() { return []; },
  body: { scrollHeight: 2000 }
};

// Load extension modules
const controller = require("../extension/youtube-controller.js");
const parser = require("../extension/command-parser.js");
const visualExtractor = require("../extension/visual-extractor.js");
const recipePlanner = require("../extension/recipe-planner.js");
const audioTranscriber = require("../extension/audio-transcriber.js");
const recipeExtractor = require("../extension/recipe-extractor.js");
const { contextEngine, IntentClassifier, AmbiguityResolver, ConfidenceDecider, CommandErrorRecovery } = require("../extension/context-engine.js");
const { assistant, executor } = require("../extension/command-executor.js");

console.log("==================================================");
console.log("CHEFMATE COMPLETE MASTER TEST SUITE");
console.log("==================================================");

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error("    ", err.message);
  }
}

async function itAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error("    ", err.message);
  }
}

async function runAll() {
  console.log("\n--- SECTION 1: Dish Identity & Recipe Consistency ---");

  it("Test 1: Biryani video must NOT accept pulihora recipe", () => {
    const dishInfo = recipeExtractor.identifyDish({
      title: "Authentic Hyderabadi Chicken Biryani Recipe",
      description: "How to make the world famous dum biryani at home with basmati rice and saffron"
    });
    assert.strictEqual(dishInfo.dishName, "Biryani");
    assert.strictEqual(dishInfo.signature, "biryani");

    // Candidate recipe is Pulihora with tamarind paste, tempering, etc.
    const pulihoraRecipe = {
      video_title: "Authentic Hyderabadi Chicken Biryani Recipe",
      ingredients: [
        { name: "tamarind paste", quantity: "2 tbsp" },
        { name: "mustard seeds", quantity: "1 tsp" },
        { name: "peanuts", quantity: "2 tbsp" },
        { name: "curry leaves", quantity: "1 sprig" }
      ],
      steps: [
        { step_number: 1, instruction: "Heat oil, add mustard seeds and peanuts." },
        { step_number: 2, instruction: "Add tamarind paste and mix with cooked rice for pulihora." }
      ]
    };

    const consistency = recipeExtractor.validateDishConsistency(dishInfo, pulihoraRecipe);
    assert.strictEqual(consistency.valid, false, "Consistency validation must flag mismatch");
    assert(consistency.reason.includes("Severe dish mismatch"), "Reason must specify dish mismatch");

    // Full extraction check
    const extracted = recipeExtractor.extract({
      videoTitle: "Authentic Hyderabadi Chicken Biryani Recipe",
      description: "Heat oil and add tamarind paste and mustard seeds to prepare pulihora tamarind rice."
    });
    assert.strictEqual(extracted.success, false, "Recipe extraction must fail on severe dish mismatch");
    assert(extracted.warnings.some(w => w.includes("Severe dish mismatch")));
  });

  it("Test 2: Pulihora video must NOT accept biryani recipe", () => {
    const dishInfo = recipeExtractor.identifyDish({
      title: "Traditional Andhra Pulihora Recipe",
      description: "Authentic festival tamarind rice with tempering"
    });
    assert.strictEqual(dishInfo.dishName, "Pulihora");

    const biryaniRecipe = {
      video_title: "Traditional Andhra Pulihora Recipe",
      ingredients: [
        { name: "basmati rice", quantity: "2 cups" },
        { name: "biryani masala", quantity: "1 tbsp" }
      ],
      steps: [
        { step_number: 1, instruction: "Marinate chicken with biryani masala and yogurt." },
        { step_number: 2, instruction: "Layer the basmati rice and seal for dum biryani." }
      ]
    };

    const consistency = recipeExtractor.validateDishConsistency(dishInfo, biryaniRecipe);
    assert.strictEqual(consistency.valid, false, "Must reject biryani for pulihora video");
  });

  it("Test 3: Rice dishes (Biryani vs Pulao vs Fried Rice) remain distinguishable", () => {
    const d1 = recipeExtractor.identifyDish({ title: "Vegetable Dum Biryani" });
    const d2 = recipeExtractor.identifyDish({ title: "Easy Vegetable Pulao in Cooker" });
    const d3 = recipeExtractor.identifyDish({ title: "Restaurant Style Egg Fried Rice" });

    assert.strictEqual(d1.dishName, "Biryani");
    assert.strictEqual(d2.dishName, "Pulao");
    assert.strictEqual(d3.dishName, "Fried Rice");
  });

  console.log("\n--- SECTION 2: Subtitle-Free Multimodal Extraction ---");

  it("Test 4: Cooking video without subtitles but with OCR is analyzed", () => {
    const res = recipeExtractor.extract({
      videoTitle: "Quick Breakfast Pancakes",
      segments: [], // Subtitles absent
      ocrRecords: [
        { text: "1 cup flour", classification: "INGREDIENT", parsedData: { name: "flour", quantity: "1", unit: "cup" }, source: "ocr" },
        { text: "1 cup milk", classification: "INGREDIENT", parsedData: { name: "milk", quantity: "1", unit: "cup" }, source: "ocr" },
        { text: "Whisk the flour and milk together", classification: "COOKING_INSTRUCTION", source: "ocr", timestamp: 15 },
        { text: "Cook on skillet until golden brown", classification: "COOKING_INSTRUCTION", source: "ocr", timestamp: 45 }
      ]
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.steps.length, 2);
    assert.strictEqual(res.ingredients.length, 2);
  });

  it("Test 5: Cooking video without subtitles but with visual actions is analyzed", () => {
    const res = recipeExtractor.extract({
      videoTitle: "Fresh Fruit Smoothie",
      segments: [],
      visualObservations: [
        {
          timestamp: 20,
          observedAction: "GRINDING",
          instruction: "Coarsely grind the ingredients shown in video.",
          confidence: 0.95,
          evidenceSource: "visual_cv"
        }
      ]
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.steps.length, 1);
    assert.strictEqual(res.ingredients[0].name, "Ingredients shown in video");
    assert.strictEqual(res.ingredients[0].quantity_specified, false);
  });

  it("Test 6: Conflicting quantities between transcript and OCR remain uncertain", () => {
    const res = visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients: [
        { name: "salt", quantity: "1 tsp", unit: "teaspoon", quantity_specified: true, source: "transcript" }
      ],
      transcriptSteps: [
        { step_number: 1, instruction: "Add salt.", sources: ["transcript"], start_seconds: 10 }
      ],
      ocrRecords: [
        {
          text: "1 tbsp salt",
          classification: "INGREDIENT",
          parsedData: { name: "salt", quantity: "1", unit: "tablespoon" },
          source: "ocr",
          timestamp: 10
        }
      ]
    });

    const salt = res.ingredients.find(i => i.name === "salt");
    assert(salt, "Salt must exist");
    assert.strictEqual(salt.has_conflict, true);
    assert.strictEqual(salt.quantity_uncertain, true);
  });

  await itAsync("Test 7: Audio transcription component behavior", async () => {
    // A: When subtitles already retrieved, never claim audio transcription
    const skipped = await audioTranscriber.transcribeVideo({ captionsRetrieved: true });
    assert.strictEqual(skipped.success, false);
    assert.strictEqual(skipped.status, "UNAVAILABLE");
    assert(skipped.reason.includes("Captions were already retrieved"));

    // B: When captions absent and custom/local provider injected
    audioTranscriber.setProvider(async () => ({
      segments: [
        { start: 10, end: 15, text: "Heat 2 tablespoons of oil in a pan." }
      ]
    }));

    const transcribed = await audioTranscriber.transcribeVideo({ captionsRetrieved: false });
    assert.strictEqual(transcribed.success, true);
    assert.strictEqual(transcribed.count, 1);
    assert.strictEqual(transcribed.segments[0].source, "audio_transcription");
    assert.strictEqual(transcribed.status, "COMPLETED");

    audioTranscriber.reset();
  });

  console.log("\n--- SECTION 3: Concurrent Voice Controls During Active Cooking ---");

  await itAsync("Test 8: Playback, seek, speed, volume, and scroll work concurrently during COOKING", async () => {
    assistant.state = "COOKING";
    assistant.currentRecipe = {
      video_title: "Vegetable Biryani",
      steps: [
        { step_number: 1, instruction: "Heat oil in pot.", start_seconds: 10 },
        { step_number: 2, instruction: "Add vegetables and rice.", start_seconds: 30 }
      ],
      ingredients: [{ name: "rice", quantity: "2 cups", quantity_specified: true }]
    };
    assistant.currentStepIndex = 0;

    // 1. Play / Pause video
    const pauseCmd = await parser.parse("pause");
    assert.strictEqual(pauseCmd.intent, "PAUSE");
    assert.strictEqual(assistant.state, "COOKING", "Cooking state must remain COOKING during pause");

    const playCmd = await parser.parse("play");
    assert.strictEqual(playCmd.intent, "PLAY");
    assert.strictEqual(assistant.state, "COOKING");

    // 2. Seeking (forward 10 seconds, back 10 seconds)
    const fwdCmd = await parser.parse("forward 10 seconds");
    assert.strictEqual(fwdCmd.intent, "SEEK_FORWARD");
    assert.strictEqual(fwdCmd.parameters.seconds, 10);
    assert.strictEqual(assistant.state, "COOKING");

    const backCmd = await parser.parse("back 10 seconds");
    assert.strictEqual(backCmd.intent, "SEEK_BACKWARD");
    assert.strictEqual(backCmd.parameters.seconds, 10);
    assert.strictEqual(assistant.state, "COOKING");

    // 3. Playback Speed
    const speedCmd = await parser.parse("play at double speed");
    assert.strictEqual(speedCmd.intent, "SET_SPEED");
    assert.strictEqual(speedCmd.parameters.rate, 2.0);
    assert.strictEqual(assistant.state, "COOKING");

    const speed15 = await parser.parse("play at 1.5x speed");
    assert.strictEqual(speed15.intent, "SET_SPEED");
    assert.strictEqual(speed15.parameters.rate, 1.5);
    assert.strictEqual(assistant.state, "COOKING");

    // 4. Volume and Mute
    const volUp = await parser.parse("volume up");
    assert.strictEqual(volUp.intent, "VOLUME_UP");
    const muteCmd = await parser.parse("mute");
    assert.strictEqual(muteCmd.intent, "MUTE");
    assert.strictEqual(assistant.state, "COOKING");

    // 5. Page Scrolling
    const scrollDown = await parser.parse("scroll down");
    assert.strictEqual(scrollDown.intent, "SCROLL_DOWN");
    const scrollTop = await parser.parse("scroll to the top");
    assert.strictEqual(scrollTop.intent, "SCROLL_TOP");
    const scrollBottom = await parser.parse("scroll to bottom");
    assert.strictEqual(scrollBottom.intent, "SCROLL_BOTTOM");
    assert.strictEqual(assistant.state, "COOKING");

    // 6. Recipe Navigation during cooking
    const nextCmd = await parser.parse("next step");
    assert.strictEqual(nextCmd.intent, "NEXT_RECIPE_STEP");
    const nextExec = await executor.execute(nextCmd);
    assert.strictEqual(nextExec.success, true);
    assert.strictEqual(assistant.currentStepIndex, 1);
    assert.strictEqual(assistant.state, "COOKING");

    // 7. Stop Cooking (pauses guidance without wiping recipe)
    const stopCmd = await parser.parse("stop cooking");
    assert.strictEqual(stopCmd.intent, "STOP_COOKING");
    const stopExec = await executor.execute(stopCmd);
    assert.strictEqual(stopExec.success, true);
    assert.strictEqual(assistant.state, "PAUSED");
    assert(assistant.currentRecipe !== null, "Recipe must NOT be wiped by stop cooking");

    // 8. Exit Cooking
    const exitCmd = await parser.parse("exit cooking");
    assert.strictEqual(exitCmd.intent, "EXIT_COOKING");
    const exitExec = await executor.execute(exitCmd);
    assert.strictEqual(exitExec.success, true);
    assert.strictEqual(assistant.state, "IDLE");
    assert(assistant.currentRecipe !== null, "Recipe must stay loaded in UI panel");
  });

  console.log("\n--- SECTION 4: Context-Aware Engine (4 Modules) ---");

  it("Test 9: Module 1 (IntentClassifier) classifies domain taxonomy", () => {
    const classifier = new IntentClassifier();
    assert.strictEqual(classifier.classifyDomain("NEXT_RECIPE_STEP"), "RECIPE_NAVIGATION");
    assert.strictEqual(classifier.classifyDomain("PLAY"), "YOUTUBE_PLAYBACK");
    assert.strictEqual(classifier.classifyDomain("SEEK_FORWARD"), "SEEK_AND_SPEED");
    assert.strictEqual(classifier.classifyDomain("SCROLL_TOP"), "PAGE_SCROLL");
    assert.strictEqual(classifier.classifyDomain("STOP_COOKING"), "COOKING_LIFECYCLE");
    assert.strictEqual(classifier.isPlaybackOrControl("PAUSE"), true);
    assert.strictEqual(classifier.isPlaybackOrControl("NEXT_RECIPE_STEP"), false);
  });

  it("Test 10: Module 2 (AmbiguityResolver) resolves overloaded commands based on state", () => {
    const resolver = new AmbiguityResolver();

    // "next": in COOKING -> NEXT_RECIPE_STEP
    const res1 = resolver.resolve("next", { intent: "NEXT" }, "COOKING");
    assert.strictEqual(res1.intent, "NEXT_RECIPE_STEP");

    // "next video" -> NEXT_VIDEO
    const res2 = resolver.resolve("next video", { intent: "NEXT" }, "COOKING");
    assert.strictEqual(res2.intent, "NEXT_VIDEO");

    // "forward 10 seconds" -> SEEK_FORWARD
    const res3 = resolver.resolve("forward 10 seconds", { intent: "NEXT_RECIPE_STEP" }, "COOKING");
    assert.strictEqual(res3.intent, "SEEK_FORWARD");

    // "pause" -> PAUSE (video)
    const res4 = resolver.resolve("pause", { intent: "PAUSE_COOKING" }, "COOKING");
    assert.strictEqual(res4.intent, "PAUSE");

    // "pause cooking" -> PAUSE_COOKING
    const res5 = resolver.resolve("pause cooking", { intent: "PAUSE" }, "COOKING");
    assert.strictEqual(res5.intent, "PAUSE_COOKING");

    // "first step" during AWAITING_INGREDIENT_PREFERENCE -> START_COOKING
    const res6 = resolver.resolve("first step", { intent: "GOTO_FIRST_STEP" }, "AWAITING_INGREDIENT_PREFERENCE");
    assert.strictEqual(res6.intent, "START_COOKING");
  });

  it("Test 11: Module 3 (ConfidenceDecider) enforces confidence thresholds", () => {
    const decider = new ConfidenceDecider();

    // High confidence
    const high = decider.decide({ intent: "NEXT_RECIPE_STEP", confidence: 0.95 });
    assert.strictEqual(high.action, "EXECUTE");
    assert.strictEqual(high.needsClarification, false);

    // Moderate confidence for non-disruptive query -> EXECUTE
    const modQuery = decider.decide({ intent: "GET_QUANTITY", confidence: 0.65 });
    assert.strictEqual(modQuery.action, "EXECUTE");

    // Moderate confidence for disruptive action -> CONFIRM
    const modDisrupt = decider.decide({ intent: "RESTART_RECIPE", confidence: 0.65 });
    assert.strictEqual(modDisrupt.action, "CONFIRM");
    assert.strictEqual(modDisrupt.needsClarification, true);

    // Low confidence -> CLARIFY
    const low = decider.decide({ intent: "UNKNOWN", confidence: 0.35 });
    assert.strictEqual(low.action, "CLARIFY");
    assert.strictEqual(low.needsClarification, true);
  });

  it("Test 12: Module 4 (CommandErrorRecovery) produces constructive guidance", () => {
    const recovery = new CommandErrorRecovery();

    const errNoRecipe = recovery.handleError("NO_RECIPE_ACTIVE", {}, "IDLE");
    assert(errNoRecipe.message.includes("generate recipe"));

    const errStep = recovery.handleError("INVALID_STEP_NUMBER", { totalSteps: 3, requestedStep: 5 }, "COOKING");
    assert(errStep.message.includes("between 1 and 3"));

    const errIng = recovery.handleError("INGREDIENT_NOT_FOUND", { ingredient: "oregano" }, "COOKING");
    assert(errIng.message.includes("oregano"));

    const errUnknownInPref = recovery.handleError("UNKNOWN_COMMAND", {}, "AWAITING_INGREDIENT_PREFERENCE");
    assert(errUnknownInPref.message.includes("read the ingredients"));
  });

  console.log("\n--- SECTION 5: Prerequisite Ordering & Dual Timelines ---");

  it("Test 13: Overnight soaking and marination dependencies are ordered prior to cooking", () => {
    const steps = [
      { step_number: 1, instruction: "Heat oil in pan and sauté onions.", start_seconds: 30 },
      { step_number: 2, instruction: "Soak the sabudana overnight in water.", start_seconds: 90 },
      { step_number: 3, instruction: "Add the soaked sabudana and cook for 5 minutes.", start_seconds: 120 }
    ];

    const plan = recipePlanner.buildDependencyAwarePlan(steps);
    assert.strictEqual(plan.hasPrerequisites, true);
    assert.strictEqual(plan.prerequisites.length, 1);
    assert.strictEqual(plan.orderedSteps[0].is_prerequisite, true);
    assert.strictEqual(plan.orderedSteps[0].instruction, "Soak the sabudana overnight in water.");
    assert.strictEqual(plan.orderedSteps[0].start_seconds, 90, "Original video timestamp must be preserved for seeking");
    assert.strictEqual(plan.orderedSteps[1].instruction, "Heat oil in pan and sauté onions.");
  });

  console.log("\n--- SECTION 6: Audit Implementation Fixes (Phases 1-6) ---");

  it("Test 14: Reconcile steps merges description & transcript steps without discarding description", () => {
    const descSteps = [
      { step_number: 1, instruction: "Heat oil in a heavy pan and add mustard seeds.", duration_seconds: 60, sources: ["description"] },
      { step_number: 2, instruction: "Garnish with fresh chopped coriander leaves.", duration_seconds: null, sources: ["description"] }
    ];
    const transSteps = [
      { step_number: 1, instruction: "Heat oil in the pan and put some mustard seeds.", start_seconds: 45, duration_seconds: 40, sources: ["transcript"], confidence: 0.88 },
      { step_number: 2, instruction: "Stir in turmeric powder and salt.", start_seconds: 75, duration_seconds: null, sources: ["transcript"], confidence: 0.85 }
    ];

    const reconciled = recipeExtractor._reconcileSteps(descSteps, transSteps);
    assert.strictEqual(reconciled.length, 3, "Should contain merged step 1, trans step 2, and complementary desc step 3");
    
    // Step 1: Merged (contains both sources and preserved timestamp)
    const step1 = reconciled[0];
    assert.deepStrictEqual(step1.sources.sort(), ["description", "transcript"].sort());
    assert.strictEqual(step1.start_seconds, 45);
    
    // Step 2: From transcript
    const step2 = reconciled[1];
    assert.deepStrictEqual(step2.sources, ["transcript"]);
    assert.strictEqual(step2.start_seconds, 75);

    // Step 3: From description (not lost!)
    const step3 = reconciled[2];
    assert.deepStrictEqual(step3.sources, ["description"]);
    assert(step3.instruction.includes("Garnish"));
  });

  await itAsync("Test 15: waitForSeekSettled waits for seek and settles safely", async () => {
    let seekedFired = false;
    const mockVideo = {
      currentTime: 10,
      readyState: 4,
      addEventListener(event, cb) {
        if (event === "seeked") {
          setTimeout(() => {
            this.currentTime = 45;
            seekedFired = true;
            cb();
          }, 50);
        }
      },
      removeEventListener() {}
    };

    const settled = await visualExtractor.waitForSeekSettled(mockVideo, 45, 300);
    assert.strictEqual(settled, true);
    assert.strictEqual(seekedFired, true);
    assert.strictEqual(mockVideo.currentTime, 45);
  });

  await itAsync("Test 16: Multi-action visual analysis detects all 7 actions and declares limitations", async () => {
    visualExtractor.setVisionProvider(async () => ({
      observations: [
        { observedAction: "GRINDING", visibleObjects: ["grinder"], confidence: 0.92 },
        { observedAction: "CHOPPING", visibleObjects: ["knife"], confidence: 0.90 },
        { observedAction: "MIXING", visibleObjects: ["bowl", "spatula"], confidence: 0.90 },
        { observedAction: "POURING", visibleObjects: ["measuring cup"], confidence: 0.90 },
        { observedAction: "BOILING", visibleObjects: ["pot"], confidence: 0.90 },
        { observedAction: "FRYING", visibleObjects: ["pan", "oil"], confidence: 0.90 },
        { observedAction: "TRANSFERRING", visibleObjects: ["plate"], confidence: 0.90 }
      ],
      framesAnalyzed: 10
    }));

    const result = await visualExtractor.extractVisualRecipe({ videoDuration: 180 });
    visualExtractor.resetProviders();

    assert.strictEqual(result.visualObservations.length, 7);
    const actions = result.visualObservations.map(o => o.observedAction);
    assert(actions.includes("GRINDING"));
    assert(actions.includes("CHOPPING"));
    assert(actions.includes("MIXING"));
    assert(actions.includes("POURING"));
    assert(actions.includes("BOILING"));
    assert(actions.includes("FRYING"));
    assert(actions.includes("TRANSFERRING"));
    assert(typeof result.limitations === "string" && result.limitations.length > 20);
  });

  await itAsync("Test 17: Local backend health check handles offline and background gracefully", async () => {
    audioTranscriber.reset();
    const res = await audioTranscriber.transcribeVideo({
      videoDuration: 120,
      captionsRetrieved: false
    });
    // In node environment without 127.0.0.1:8000 running, should report UNAVAILABLE gracefully without throwing
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, "UNAVAILABLE");
  });

  console.log("\n==================================================");
  console.log(`TEST RESULTS: ${passed}/${total} tests passed.`);
  console.log("==================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runAll().catch(e => {
  console.error("Test runner error:", e);
  process.exit(1);
});
