const assert = require("assert");

// Setup browser-like environment for Node.js
global.window = global;
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
        play() { return Promise.resolve(); }
      };
    }
    return null;
  }
};

global.ChefMate = {};
const CM = global.ChefMate;

// Load extension modules
const visualExtractor = require("../extension/visual-extractor.js");
CM.visualExtractor = visualExtractor;
const recipePlanner = require("../extension/recipe-planner.js");
CM.recipePlanner = recipePlanner;
const recipeExtractor = require("../extension/recipe-extractor.js");
CM.recipeExtractor = recipeExtractor;
const commandParser = require("../extension/command-parser.js");
CM.commandParser = commandParser;

let lastSeekTime = null;
let mockVideoInfo = {
  id: "test_vid_multimodal",
  title: "Cooking Masterclass",
  channel: "Chef's Table",
  description: ""
};

CM.youtubeController = {
  currentVideo() {
    return mockVideoInfo;
  },
  seekTo(seconds) {
    lastSeekTime = seconds;
  }
};

let lastStatusText = "";
let recipeRendered = null;

CM.ui = {
  setRecipeStatus(text) {
    lastStatusText = text;
  },
  setSpokenText() {},
  renderRecipe(recipe) {
    recipeRendered = recipe;
  },
  resetRecipe() {
    recipeRendered = null;
    lastStatusText = "Say \"generate recipe\" or click below to analyze this video.";
  },
  highlightStep() {},
  updateDebug() {}
};

CM.voice = {
  speak() {},
  stopSpeaking() {}
};

require("../extension/command-executor.js");
const assistant = CM.assistant;

console.log("==================================================");
console.log("CHEFMATE MULTIMODAL, OCR & PREREQUISITE TEST SUITE");
console.log("==================================================");

let passedCount = 0;
let totalTests = 18;

async function runTests() {
  // ----------------------------------------------------
  // Test 1: Cooking video with matching transcript, OCR, and visual evidence
  // ----------------------------------------------------
  {
    console.log("\n--- Test 1: Matching transcript, OCR, and visual evidence ---");
    const transcriptSteps = [
      { step_number: 1, instruction: "Add the onions to the pan.", start_seconds: 45, confidence: 0.85 }
    ];
    const visualObservations = [
      {
        timestamp: 46,
        observedAction: "ADDING_INGREDIENT",
        visibleObjects: ["onion", "pan"],
        visualChange: "onions added into heated pan",
        confidence: 0.94,
        evidenceSource: "visual_cv",
        isDirectObservation: true
      }
    ];

    const result = CM.visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients: [{ name: "onion", quantity: "1", unit: "piece", quantity_specified: true }],
      transcriptSteps,
      ocrRecords: [],
      visualObservations
    });

    assert.strictEqual(result.steps.length, 1, "Must merge into a single step without duplication");
    const step = result.steps[0];
    assert(step.sources.includes("transcript"), "Must include transcript source");
    assert(step.sources.includes("visual"), "Must include visual source");
    assert(step.confidence >= 0.90, "Confidence elevated by matching multimodal evidence");
    console.log("  ✓ PASS: Single unified step with sources ['transcript', 'visual'] and confidence >= 0.90");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 2: Cooking video without subtitles but with readable recipe card
  // ----------------------------------------------------
  {
    console.log("\n--- Test 2: Cooking video without subtitles but with readable recipe card ---");
    const ocrRecords = [
      { text: "200 g flour", timestamp: 10, confidence: 0.95 },
      { text: "100 ml milk", timestamp: 12, confidence: 0.92 },
      { text: "Whisk the flour and milk together", timestamp: 30, confidence: 0.90 }
    ].map(r => CM.visualExtractor.classifyOCRRegion(r));

    const classification = CM.recipeExtractor.classifyVideo({
      title: "How to Make Pancakes",
      segments: [],
      ocrRecords
    });
    assert.strictEqual(classification.category, "COOKING_TUTORIAL", "Must classify as COOKING_TUTORIAL from recipe card");

    const recipe = CM.recipeExtractor.extract({
      videoTitle: "How to Make Pancakes",
      segments: [],
      ocrRecords
    });
    assert.strictEqual(recipe.success, true, "Recipe extracted successfully without subtitles");
    assert.strictEqual(recipe.ingredients.length, 2, "2 ingredients extracted from visual card");
    assert.strictEqual(recipe.steps.length, 1, "1 cooking step extracted from visual card");
    console.log("  ✓ PASS: Subtitle-free cooking video verified and extracted from visual recipe card");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 3: Subtitle describing an action that is not visibly shown
  // ----------------------------------------------------
  {
    console.log("\n--- Test 3: Subtitle describing an action not visibly shown ---");
    const transcriptSteps = [
      { step_number: 1, instruction: "Let the dough rest in the refrigerator overnight.", start_seconds: 60, confidence: 0.88 }
    ];
    // No visual observation at 60s (video cut away to host talking)
    const visualObservations = [];

    const result = CM.visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients: [{ name: "flour", quantity: "500", unit: "gram", quantity_specified: true }],
      transcriptSteps,
      ocrRecords: [],
      visualObservations
    });

    assert.strictEqual(result.steps.length, 1, "Transcript step preserved");
    assert(result.steps[0].sources.includes("transcript"), "Source is transcript");
    assert.strictEqual(result.steps[0].instruction, "Let the dough rest in the refrigerator overnight.");
    console.log("  ✓ PASS: Explicit spoken instruction preserved when visual action is not visible");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 4: Visible action absent from the subtitles
  // ----------------------------------------------------
  {
    console.log("\n--- Test 4: Visible action absent from the subtitles ---");
    const transcriptSteps = [
      { step_number: 1, instruction: "Whisk the batter until smooth.", start_seconds: 20, confidence: 0.85 }
    ];
    const visualObservations = [
      {
        timestamp: 95,
        observedAction: "TRANSFERRING_MIXTURE",
        visibleObjects: ["mixture", "baking dish"],
        visualChange: "batter poured into baking dish",
        confidence: 0.89,
        evidenceSource: "visual_cv",
        isDirectObservation: true
      }
    ];

    const result = CM.visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients: [],
      transcriptSteps,
      ocrRecords: [],
      visualObservations
    });

    assert.strictEqual(result.steps.length, 2, "Visual action added as an evidence-backed step");
    const visualStep = result.steps.find(s => s.sources.includes("visual") && !s.sources.includes("transcript"));
    assert(visualStep, "Visual step exists");
    assert.strictEqual(visualStep.start_seconds, 95, "Video timestamp matches observation timestamp");
    assert(visualStep.instruction.includes("baking dish") || visualStep.instruction.includes("Transfer"), "Carefully worded instruction created");
    assert(!visualStep.duration_seconds, "Did not invent non-observed duration");
    console.log("  ✓ PASS: Confident visual action created without fabricated quantities or timings");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 5: Conflicting transcript and OCR quantities
  // ----------------------------------------------------
  {
    console.log("\n--- Test 5: Conflicting transcript and OCR quantities ---");
    const transcriptIngredients = [
      { name: "salt", quantity: "1", unit: "teaspoon", quantity_specified: true, raw_quantity: "1 teaspoon" }
    ];
    const ocrRecords = [
      CM.visualExtractor.classifyOCRRegion({ text: "1 tbsp salt", timestamp: 15, confidence: 0.90 })
    ];

    const result = CM.visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients,
      transcriptSteps: [],
      ocrRecords,
      visualObservations: []
    });

    const salt = result.ingredients.find(i => i.name === "salt");
    assert(salt, "Salt exists");
    assert.strictEqual(salt.has_conflict, true, "Conflict flagged internally");
    assert.strictEqual(salt.quantity_uncertain, true, "Marked as uncertain");
    assert.strictEqual(salt.quantity, null, "Does not silently pick or merge conflicting amounts");

    // Test assistant speech response on conflicting ingredient
    assistant.currentRecipe = { ingredients: result.ingredients, steps: [] };
    const qtyRes = assistant.getQuantity("salt");
    assert(qtyRes.message.includes("uncertain") && qtyRes.message.includes("conflict"), "Spoken reply acknowledges conflict without confirming either");
    console.log("  ✓ PASS: Conflicting quantities flagged, uncertain, neither value confirmed");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 6: Channel names and promotional overlays incorrectly resembling recipe text
  // ----------------------------------------------------
  {
    console.log("\n--- Test 6: Channel names and promotional overlays filtered ---");
    const records = [
      { text: "Subscribe for more recipes", screenRegion: "BOTTOM_RIGHT", confidence: 0.95 },
      { text: "@ChefGordonKitchen Official", screenRegion: "TOP_RIGHT", confidence: 0.90 },
      { text: "Nutrition Facts: 250 Calories", screenRegion: "CENTER", confidence: 0.88 }
    ].map(r => CM.visualExtractor.classifyOCRRegion(r, { channel: "ChefGordonKitchen" }));

    assert.strictEqual(records[0].classification, "PROMOTIONAL_TEXT");
    assert.strictEqual(records[1].classification, "CHANNEL_OR_WATERMARK");
    assert.strictEqual(records[2].classification, "PRODUCT_LABEL");

    const reconciled = CM.visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients: [],
      transcriptSteps: [],
      ocrRecords: records
    });

    assert.strictEqual(reconciled.ingredients.length, 0, "No promotional or branding text admitted into ingredients");
    assert.strictEqual(reconciled.steps.length, 0, "No promotional or branding text admitted into steps");
    console.log("  ✓ PASS: Watermarks, branding, and promo text rejected from recipe");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 7: Non-cooking video with incidental food-related text
  // ----------------------------------------------------
  {
    console.log("\n--- Test 7: Non-cooking video with incidental food text ---");
    const classification = CM.recipeExtractor.classifyVideo({
      title: "Minecraft Hardcore Survival Day 50",
      description: "Playing Minecraft all night",
      segments: [
        { text: "Look at that, I found raw chicken in the chest.", start: 10 },
        { text: "Let me eat this chicken to restore hunger points.", start: 15 }
      ],
      videoDuration: 600,
      ocrRecords: [
        CM.visualExtractor.classifyOCRRegion({ text: "Chicken Farm Base", timestamp: 12 })
      ]
    });

    assert.strictEqual(classification.category, "NON_COOKING", "Incidental food text in gaming video rejected as NON_COOKING");
    console.log("  ✓ PASS: Incidental food text in gaming video rejected safely");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 8: Clear overnight soaking prerequisite mentioned late in the transcript
  // ----------------------------------------------------
  {
    console.log("\n--- Test 8: Clear overnight soaking prerequisite mentioned late ---");
    const rawSteps = [
      { instruction: "Heat olive oil in a pan and add cumin seeds.", start_seconds: 20 },
      { instruction: "Add the chopped onions and sauté until translucent.", start_seconds: 40 },
      { instruction: "Make sure you soak the chickpeas overnight before cooking.", start_seconds: 140 },
      { instruction: "Pressure cook the chickpeas for 15 minutes.", start_seconds: 160 }
    ];
    const ingredients = [{ name: "chickpeas" }, { name: "olive oil" }, { name: "onion" }];

    const plan = CM.recipePlanner.buildDependencyAwarePlan(rawSteps, ingredients);

    assert.strictEqual(plan.hasPrerequisites, true, "Identified prerequisite");
    assert.strictEqual(plan.orderedSteps[0].step_number, 1, "Soaking placed as Step 1 in execution order");
    assert(plan.orderedSteps[0].instruction.includes("soak the chickpeas overnight"), "First step is soaking");
    assert.strictEqual(plan.orderedSteps[0].start_seconds, 140, "Original video timestamp 140s strictly preserved for seeking");
    assert(plan.prerequisiteNotice.includes("soak overnight"), "Spoken preparation notice generated");
    console.log("  ✓ PASS: Late overnight soaking reordered to Step 1 with original video timestamp retained");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 9: Two-hour marination step that must precede cooking
  // ----------------------------------------------------
  {
    console.log("\n--- Test 9: Two-hour marination step preceding cooking ---");
    const rawSteps = [
      { instruction: "Heat oil in the wok to 375 degrees.", start_seconds: 15 },
      { instruction: "Marinate the chicken in soy sauce and spices for 2 hours.", start_seconds: 60 },
      { instruction: "Deep fry the marinated chicken pieces until golden brown.", start_seconds: 90 }
    ];
    const ingredients = [{ name: "chicken" }, { name: "soy sauce" }];

    const plan = CM.recipePlanner.buildDependencyAwarePlan(rawSteps, ingredients);

    assert.strictEqual(plan.orderedSteps[0].instruction.includes("Marinate the chicken"), true, "Marinating ordered first");
    assert.strictEqual(plan.orderedSteps[0].duration_text, "2 hours", "Exact duration text preserved");
    assert.strictEqual(plan.orderedSteps[0].duration_seconds, 7200, "Duration in seconds exact");
    assert(plan.prerequisiteNotice.includes("marinate"), "Speaks marination preparation notice");
    console.log("  ✓ PASS: 2-hour marination ordered before heating wok and frying");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 10: Multiple prerequisites with different durations
  // ----------------------------------------------------
  {
    console.log("\n--- Test 10: Multiple prerequisites with different durations ---");
    const rawSteps = [
      { instruction: "Soak black beans overnight in cold water.", start_seconds: 10 },
      { instruction: "Marinate the beef brisket for 3 hours with chili rub.", start_seconds: 30 },
      { instruction: "Sear the brisket and simmer with beans.", start_seconds: 50 }
    ];
    const ingredients = [{ name: "black beans" }, { name: "beef brisket" }];

    const plan = CM.recipePlanner.buildDependencyAwarePlan(rawSteps, ingredients);

    assert.strictEqual(plan.prerequisites.length, 2, "Both prerequisites identified");
    const prereqTypes = plan.prerequisites.map(p => p.prerequisite_type);
    assert(prereqTypes.includes("SOAKING") && prereqTypes.includes("MARINATING"), "Categorized into SOAKING and MARINATING");
    assert.strictEqual(plan.orderedSteps[0].is_prerequisite, true);
    assert.strictEqual(plan.orderedSteps[1].is_prerequisite, true);
    assert.strictEqual(plan.orderedSteps[2].instruction.includes("Sear the brisket"), true);
    console.log("  ✓ PASS: Multiple prerequisites with different durations ordered before main cooking");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 11: Prerequisites whose order depends on other preparation tasks
  // ----------------------------------------------------
  {
    console.log("\n--- Test 11: Prerequisite order depending on prior preparation task ---");
    const rawSteps = [
      { instruction: "Prepare the marinade by mixing yogurt, ginger, garlic, and spices.", start_seconds: 10 },
      { instruction: "Marinate the chicken in the marinade for 4 hours.", start_seconds: 30 },
      { instruction: "Bake chicken at 400°F.", start_seconds: 70 }
    ];
    const ingredients = [{ name: "chicken" }, { name: "yogurt" }];

    const plan = CM.recipePlanner.buildDependencyAwarePlan(rawSteps, ingredients);

    assert(plan.orderedSteps[0].instruction.includes("Prepare the marinade"), "Step 1 must be preparing marinade");
    assert(plan.orderedSteps[1].instruction.includes("Marinate the chicken"), "Step 2 is marinating chicken");
    assert(plan.orderedSteps[2].instruction.includes("Bake chicken"), "Step 3 is baking");
    console.log("  ✓ PASS: Logical dependency respected: marinade prepared before marinating chicken");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 12: Recipe with parallel preparation tasks
  // ----------------------------------------------------
  {
    console.log("\n--- Test 12: Parallel preparation tasks ---");
    const rawSteps = [
      { instruction: "Simmer the pasta sauce on low heat for 25 minutes.", start_seconds: 30, duration_seconds: 1500, equipment: ["pot"] },
      { instruction: "Meanwhile, chop the parsley and basil finely.", start_seconds: 40, equipment: ["knife", "cutting board"] },
      { instruction: "Serve sauce over cooked pasta garnished with herbs.", start_seconds: 90, equipment: ["bowl"] }
    ];

    const plan = CM.recipePlanner.buildDependencyAwarePlan(rawSteps, []);

    const simmerStep = plan.orderedSteps[0];
    const chopStep = plan.orderedSteps[1];
    assert.strictEqual(simmerStep.can_parallel, true, "Simmer step marked as parallel capable");
    assert.strictEqual(chopStep.can_parallel, true, "Herb chopping marked as parallel capable");
    assert(simmerStep.parallel_with.includes(chopStep.id), "Linked with chop step");
    console.log("  ✓ PASS: Parallel preparation task recognized during long simmer");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 13: Vague 'leave overnight' instruction with no exact duration
  // ----------------------------------------------------
  {
    console.log("\n--- Test 13: Vague 'leave overnight' with no exact numeric duration ---");
    const rawSteps = [
      { instruction: "Cover the dough and leave overnight at room temperature.", start_seconds: 50 }
    ];

    const plan = CM.recipePlanner.buildDependencyAwarePlan(rawSteps, []);

    const step = plan.orderedSteps[0];
    assert.strictEqual(step.duration_text, "overnight", "Preserved 'overnight' wording");
    assert.strictEqual(step.duration_seconds, null, "Did NOT fabricate 8 hours or 28800 seconds");
    assert.strictEqual(step.is_overnight, true, "Flagged is_overnight");
    console.log("  ✓ PASS: Preserves 'overnight' without fabricating numeric hours");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 14: Missing or low-confidence visual-analysis result
  // ----------------------------------------------------
  {
    console.log("\n--- Test 14: Missing or low-confidence visual analysis result ---");
    CM.visualExtractor.setVisionProvider(async () => {
      return { observations: [], framesAnalyzed: 0 };
    });

    const res = await CM.visualExtractor.extractVisualRecipe({
      videoInfo: { id: "test", title: "Test" },
      videoDuration: 120
    });

    assert.strictEqual(res.visualObservations.length, 0);
    assert.strictEqual(res.visualStatus, "UNAVAILABLE");
    CM.visualExtractor.setVisionProvider(null);
    console.log("  ✓ PASS: Discloses visual analysis UNAVAILABLE without inventing observations");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 15: Video navigation during processing (cancellation)
  // ----------------------------------------------------
  {
    console.log("\n--- Test 15: Video navigation and cancellation ---");
    CM.visualExtractor.reset();
    CM.visualExtractor.cancel();

    const res = await CM.visualExtractor.extractVisualRecipe({
      videoElement: document.querySelector("video"),
      videoInfo: { id: "test", title: "Test" },
      videoDuration: 120
    });

    assert(res.framesAnalyzed === 0 || res.count === 0, "Processing aborted cleanly upon cancellation");
    CM.visualExtractor.reset();
    console.log("  ✓ PASS: Cancellation handled cleanly without unhandled rejections");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 16: Valid recipe where video timestamps differ from execution order
  // ----------------------------------------------------
  {
    console.log("\n--- Test 16: Video timeline vs Execution order separation ---");
    const rawSteps = [
      { instruction: "Heat the skillet to medium.", start_seconds: 30 },
      { instruction: "Thaw frozen shrimp in cold water before starting.", start_seconds: 90 },
      { instruction: "Sauté the thawed shrimp with garlic.", start_seconds: 120 }
    ];
    const ingredients = [{ name: "shrimp" }];

    const plan = CM.recipePlanner.buildDependencyAwarePlan(rawSteps, ingredients);

    // Execution Order:
    // Step 1: Thaw shrimp (video timestamp 90s)
    // Step 2: Heat skillet (video timestamp 30s)
    // Step 3: Sauté shrimp (video timestamp 120s)
    assert.strictEqual(plan.orderedSteps[0].step_number, 1);
    assert.strictEqual(plan.orderedSteps[0].start_seconds, 90, "Step 1 seeks to 90s in video");

    assert.strictEqual(plan.orderedSteps[1].step_number, 2);
    assert.strictEqual(plan.orderedSteps[1].start_seconds, 30, "Step 2 seeks to 30s in video");

    // Seek test
    assistant.currentRecipe = { steps: plan.orderedSteps, ingredients };
    lastSeekTime = null;
    assistant.gotoStep(1);
    assert.strictEqual(lastSeekTime, 90, "Navigating to Step 1 seeks YouTube to 90s");

    assistant.gotoStep(2);
    assert.strictEqual(lastSeekTime, 30, "Navigating to Step 2 seeks YouTube to 30s");
    console.log("  ✓ PASS: Video timeline (30s, 90s, 120s) and execution order (1, 2, 3) kept separate");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 17: Voice navigation through reordered prerequisite and cooking steps
  // ----------------------------------------------------
  {
    console.log("\n--- Test 17: Voice navigation through reordered prerequisite steps ---");
    const steps = [
      { step_number: 1, instruction: "Soak the chickpeas overnight.", start_seconds: 120, is_prerequisite: true },
      { step_number: 2, instruction: "Heat oil and add spices.", start_seconds: 20 },
      { step_number: 3, instruction: "Simmer curry until thick.", start_seconds: 60 }
    ];
    assistant.reset("test-vid-17");
    assistant.currentRecipe = {
      steps,
      ingredients: [{ name: "chickpeas" }],
      prerequisiteNotice: "Before we begin, the chickpeas need to soak overnight."
    };
    assistant.state = "AWAITING_START_CONFIRMATION";

    // 1. User says "start cooking"
    let cmd = await CM.commandParser.parse("start cooking");
    let res = await CM.commandExecutor.execute(cmd);
    assert.strictEqual(assistant.state, "COOKING");
    assert.strictEqual(assistant.currentStepIndex, 0);
    assert(res.message.includes("Before we begin, the chickpeas need to soak overnight."), "Speaks prerequisite notice");
    assert(res.message.includes("Step one: Soak the chickpeas overnight."), "Speaks step one");

    // 2. User says "next step"
    cmd = await CM.commandParser.parse("next step");
    res = await CM.commandExecutor.execute(cmd);
    assert.strictEqual(assistant.currentStepIndex, 1);
    assert(res.message.includes("Step 2: Heat oil and add spices."));

    // 3. User says "previous step"
    cmd = await CM.commandParser.parse("previous step");
    res = await CM.commandExecutor.execute(cmd);
    assert.strictEqual(assistant.currentStepIndex, 0);
    assert(res.message.includes("Step 1: Soak the chickpeas overnight."));
    console.log("  ✓ PASS: Voice navigation smoothly moves forward and backward across prerequisites");
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 18: Rejection of video lacking sufficient recipe evidence
  // ----------------------------------------------------
  {
    console.log("\n--- Test 18: Rejection of video lacking recipe evidence ---");
    const classification = CM.recipeExtractor.classifyVideo({
      title: "Talking About My Morning Routine",
      description: "Just waking up and walking the dog",
      segments: [
        { text: "Good morning guys, today is Monday.", start: 10 },
        { text: "I might make some coffee later.", start: 25 }
      ],
      videoDuration: 180,
      ocrRecords: [],
      visualObservations: []
    });

    assert(classification.category === "NON_COOKING" || classification.category === "FOOD_RELATED_NON_TUTORIAL" || classification.category === "INSUFFICIENT_EVIDENCE", "Must reject non-cooking vlog");

    assistant.reset("test-vid-18");
    const genRes = await assistant.generateRecipe({
      videoInfo: { id: "test-vid-18", title: "Talking About My Morning Routine", description: "" },
      videoDuration: 180
    });

    assert.strictEqual(genRes.success, false, "Recipe generation rejected");
    assert.strictEqual(assistant.currentRecipe, null, "No recipe loaded");
    assert.strictEqual(assistant.state, "IDLE", "State remains IDLE");
    console.log("  ✓ PASS: Video lacking cooking evidence safely rejected");
    passedCount++;
  }

  console.log("\n==================================================");
  console.log(`TEST RESULTS: ${passedCount}/${totalTests} tests passed.`);
  console.log("==================================================");

  if (passedCount !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failure:", err);
  process.exit(1);
});
