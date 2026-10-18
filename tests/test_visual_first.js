const assert = require("assert");

// Setup browser-like mock environment
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
        currentTime: 41,
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
  },
  querySelectorAll() {
    return [];
  }
};

global.ChefMate = {};
const CM = global.ChefMate;

// Load Extension Modules
const visualExtractor = require("../extension/visual-extractor.js");
CM.visualExtractor = visualExtractor;
const recipePlanner = require("../extension/recipe-planner.js");
CM.recipePlanner = recipePlanner;
const recipeExtractor = require("../extension/recipe-extractor.js");
CM.recipeExtractor = recipeExtractor;

// Mock YouTube Controller
let mockVideoInfo = {
  id: "test_quick_breakfast",
  title: "Quick and Healthy Breakfast Recipes in Minutes",
  channel: "Healthy Kitchen",
  description: ""
};

CM.youtubeController = {
  currentVideo() {
    return mockVideoInfo;
  },
  seekTo() {}
};

// Mock UI
let lastStatusText = "";
let lastSpokenText = "";
let recipeRendered = null;
let lastSourceStatuses = null;

CM.ui = {
  setRecipeStatus(text) {
    lastStatusText = text;
  },
  setSpokenText(text) {
    lastSpokenText = text;
  },
  setSourceStatuses(statuses) {
    lastSourceStatuses = statuses;
  },
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
  speak(text) {
    lastSpokenText = text;
  },
  stopSpeaking() {}
};

// Load command-executor.js
require("../extension/command-executor.js");
const assistant = CM.assistant;

console.log("==================================================");
console.log("CHEFMATE VISUAL-FIRST RECIPE UNDERSTANDING SUITE");
console.log("==================================================");

let passedCount = 0;
const totalTests = 15;

async function runTests() {
  // -------------------------------------------------------------
  // Test 1: Valid cooking video with subtitles
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 1: Valid cooking video with subtitles ---");
    mockVideoInfo = {
      id: "vid_subtitles_valid",
      title: "How to Make Perfect Scrambled Eggs",
      channel: "Chef's Kitchen",
      description: "Quick breakfast recipe"
    };

    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [
            { text: "Crack three eggs into a bowl.", start: 10, end: 15 },
            { text: "Whisk the eggs thoroughly with two tablespoons of milk.", start: 16, end: 22 },
            { text: "Melt one tablespoon butter in a skillet over medium heat.", start: 24, end: 30 },
            { text: "Pour in the eggs and cook gently until soft curds form.", start: 32, end: 40 }
          ]
        };
      }
    };
    visualExtractor.setOCRProvider(null);
    visualExtractor.setVisionProvider(null);

    const res = await assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Recipe generated successfully");
    assert.strictEqual(assistant.currentRecipe.steps.length >= 3, true, "Has extracted cooking steps");
    assert.strictEqual(assistant.state, "AWAITING_INGREDIENT_PREFERENCE");
    console.log("  ✓ PASS: Valid cooking video with subtitles generates complete recipe");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 2: Valid cooking video without subtitles (User's Reported Bug)
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 2: Valid cooking video without subtitles (e.g. Quick and Healthy Breakfast Recipes) ---");
    mockVideoInfo = {
      id: "vid_no_subs_breakfast",
      title: "Quick and Healthy Breakfast Recipes in Minutes",
      channel: "Healthy Cooking",
      description: ""
    };

    // Subtitles completely missing
    CM.transcriptExtractor = {
      async getSegments() {
        return { success: false, segments: [], count: 0 };
      }
    };

    // Mock OCR showing "Coarsely Grind" at ~00:41 and vision showing grinding action
    visualExtractor.setOCRProvider(async () => ({
      records: [
        { text: "Coarsely Grind", timestamp: 41, screenRegion: "LOWER_THIRD", confidence: 0.95 }
      ],
      framesAnalyzed: 8
    }));

    visualExtractor.setVisionProvider(async () => ({
      observations: [
        {
          timestamp: 41,
          observedAction: "GRINDING",
          visibleObjects: ["grinder", "ingredients"],
          confidence: 0.92,
          isDirectObservation: true
        }
      ],
      framesAnalyzed: 8
    }));

    const res = await assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Recipe must NOT be rejected with 'Insufficient transcript or evidence'");
    assert.strictEqual(assistant.currentRecipe.steps.length, 1, "Visual instruction converted to recipe step");
    assert.strictEqual(assistant.currentRecipe.steps[0].instruction, "Coarsely grind the ingredients shown.");
    assert.deepStrictEqual(assistant.currentRecipe.steps[0].sources.sort(), ["ocr", "visual"]);
    assert.strictEqual(assistant.state, "AWAITING_INGREDIENT_PREFERENCE");
    console.log("  ✓ PASS: Video without subtitles with 'Coarsely Grind' accepted and recipe extracted");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 3: On-screen instruction with matching visual action
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 3: On-screen instruction with matching visual action ---");
    const ocrRecords = [
      visualExtractor.classifyOCRRegion({ text: "Coarsely Grind", timestamp: 41, confidence: 0.95 })
    ];
    const visualObservations = [
      {
        timestamp: 41,
        observedAction: "GRINDING",
        visibleObjects: ["grinder"],
        confidence: 0.92
      }
    ];

    const reconciled = visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients: [],
      transcriptSteps: [],
      ocrRecords,
      visualObservations
    });

    assert.strictEqual(reconciled.steps.length, 1, "Merged into 1 unified step");
    assert.strictEqual(reconciled.steps[0].instruction, "Coarsely grind the ingredients shown.");
    assert.strictEqual(reconciled.steps[0].confidence >= 0.90, true);
    assert(reconciled.steps[0].sources.includes("ocr") && reconciled.steps[0].sources.includes("visual"));
    console.log("  ✓ PASS: Unified OCR instruction and matching visual action into high-confidence step");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 4: Visual action with no OCR text
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 4: Visual action with no OCR text ---");
    const visualObservations = [
      {
        timestamp: 85,
        observedAction: "TRANSFERRING_MIXTURE",
        visibleObjects: ["baking dish"],
        confidence: 0.88,
        isDirectObservation: true
      }
    ];

    const reconciled = visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients: [],
      transcriptSteps: [],
      ocrRecords: [],
      visualObservations
    });

    assert.strictEqual(reconciled.steps.length, 1, "Created step from confident visual observation");
    assert.strictEqual(reconciled.steps[0].sources[0], "visual");
    assert(reconciled.steps[0].instruction.includes("baking dish") || reconciled.steps[0].instruction.includes("Transfer"));
    console.log("  ✓ PASS: Visual action with no OCR produces evidence-backed step");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 5: OCR text with no reliable visual action
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 5: OCR text with no reliable visual action ---");
    const ocrRecords = [
      visualExtractor.classifyOCRRegion({ text: "Simmer on low heat for 10 minutes", timestamp: 120, confidence: 0.90 })
    ];

    const reconciled = visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients: [],
      transcriptSteps: [],
      ocrRecords,
      visualObservations: []
    });

    assert.strictEqual(reconciled.steps.length, 1);
    assert.deepStrictEqual(reconciled.steps[0].sources, ["ocr"]);
    assert.strictEqual(reconciled.steps[0].start_seconds, 120);
    console.log("  ✓ PASS: Standalone OCR text without visual action preserved with source ['ocr']");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 6: Missing or failed transcript extraction
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 6: Missing or failed transcript extraction ---");
    CM.transcriptExtractor = {
      async getSegments() {
        throw new Error("YouTube timedtext 404 Not Found");
      }
    };

    visualExtractor.setOCRProvider(async () => ({
      records: [
        { text: "1 cup oats", timestamp: 10 },
        { text: "1 cup almond milk", timestamp: 12 },
        { text: "Blend until smooth", timestamp: 25 }
      ],
      framesAnalyzed: 5
    }));
    visualExtractor.setVisionProvider(null);

    const res = await assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Generates recipe despite transcript failure");
    assert.strictEqual(assistant.currentRecipe.steps.length, 1);
    assert.strictEqual(assistant.currentRecipe.ingredients.length, 2);
    console.log("  ✓ PASS: Handled failed transcript extraction gracefully via visual evidence");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 7: OCR worker failure
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 7: OCR worker failure ---");
    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [
            { text: "Boil water in a pot.", start: 10, end: 15 },
            { text: "Add pasta and cook for 8 minutes.", start: 20, end: 30 }
          ]
        };
      }
    };

    visualExtractor.setOCRProvider(async () => {
      throw new Error("WASM OCR Out of Memory");
    });

    const res = await assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Proceeds with transcript when OCR fails");
    assert.strictEqual(assistant.currentRecipe.steps.length, 2);
    console.log("  ✓ PASS: OCR failure handled without throwing unhandled rejection");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 8: Frame-capture failure
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 8: Frame-capture failure ---");
    visualExtractor.setOCRProvider(null);
    visualExtractor.setVisionProvider(null);

    // Mock captureFrame returning null
    const origCapture = visualExtractor.captureFrame;
    visualExtractor.captureFrame = async () => null;

    const visualResult = await visualExtractor.extractVisualRecipe({
      videoElement: document.querySelector("video"),
      videoInfo: mockVideoInfo,
      videoDuration: 120
    });

    assert.strictEqual(visualResult.success, false);
    assert.strictEqual(visualResult.records.length, 0);
    assert.strictEqual(visualResult.visualStatus, "UNAVAILABLE");
    visualExtractor.captureFrame = origCapture;
    console.log("  ✓ PASS: Frame-capture failure returns unavailable status cleanly");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 9: Non-cooking video with food-related text
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 9: Non-cooking video with food-related text ---");
    mockVideoInfo = {
      id: "vid_gaming_apple",
      title: "Minecraft Survival Ep 14 - Golden Apple Hunt",
      channel: "Pixel Gamer",
      description: "Let's play minecraft"
    };

    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [
            { text: "We need to craft a golden apple to fight the boss.", start: 10, end: 15 },
            { text: "Watch out for that creeper near the chest.", start: 20, end: 25 }
          ]
        };
      }
    };

    const res = await assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject gaming video");
    assert.strictEqual(res.category, "NON_COOKING");
    console.log("  ✓ PASS: Non-cooking video with incidental food mention correctly rejected");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 10: Watermarks and channel names
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 10: Watermarks and channel names ---");
    const rec1 = visualExtractor.classifyOCRRegion({
      text: "@TastyKitchen Official",
      screenRegion: "TOP_RIGHT",
      confidence: 0.95
    }, { channel: "TastyKitchen" });

    const rec2 = visualExtractor.classifyOCRRegion({
      text: "Subscribe for new recipes weekly",
      screenRegion: "BOTTOM_RIGHT",
      confidence: 0.90
    });

    assert.strictEqual(rec1.classification, "CHANNEL_OR_WATERMARK");
    assert.strictEqual(rec2.classification, "PROMOTIONAL_TEXT");
    console.log("  ✓ PASS: Channel names and promotional text filtered from recipe reasoning");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 11: Contradictory quantities across sources
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 11: Contradictory quantities across sources ---");
    const transcriptIngredients = [
      { name: "salt", quantity: "1", unit: "teaspoon", quantity_specified: true }
    ];
    const ocrRecords = [
      visualExtractor.classifyOCRRegion({ text: "1 tbsp salt", timestamp: 20, confidence: 0.92 })
    ];

    const reconciled = visualExtractor.reconcileMultimodalEvidence({
      transcriptIngredients,
      transcriptSteps: [],
      ocrRecords,
      visualObservations: []
    });

    const salt = reconciled.ingredients.find(i => i.name === "salt");
    assert.strictEqual(salt.has_conflict, true, "Conflict flagged");
    assert.strictEqual(salt.quantity_uncertain, true, "Quantity marked uncertain");
    assert.strictEqual(salt.quantity, null, "Does not silently pick either value");
    console.log("  ✓ PASS: Contradictory quantities flagged uncertain without silent overwrite");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 12: Long-duration prerequisites mentioned late in the transcript
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 12: Long-duration prerequisites mentioned late in the transcript ---");
    const steps = [
      { step_number: 1, instruction: "Heat oil in a pan over medium heat.", start_seconds: 30 },
      { step_number: 2, instruction: "Fry the marinated chicken for 10 minutes.", start_seconds: 70 },
      { step_number: 3, instruction: "Make sure you marinate the chicken for at least four hours in advance.", start_seconds: 140 }
    ];

    const plan = CM.recipePlanner.buildDependencyAwarePlan(steps, [{ name: "chicken" }]);
    assert.strictEqual(plan.orderedSteps[0].instruction.includes("marinate the chicken"), true, "Prerequisite reordered to Step 1");
    assert.strictEqual(plan.orderedSteps[0].start_seconds, 140, "Original video timestamp preserved");
    assert.strictEqual(plan.hasPrerequisites, true);
    console.log("  ✓ PASS: Long-duration prerequisite reordered before dependent cooking tasks");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 13: Video navigation during analysis
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 13: Video navigation during analysis ---");
    assistant.state = "ANALYZING";
    visualExtractor.cancel();
    assistant.reset("new_navigated_video_id");
    assert.strictEqual(assistant.state, "IDLE");
    assert.strictEqual(assistant.currentVideoId, "new_navigated_video_id");
    assert.strictEqual(assistant.currentRecipe, null);
    console.log("  ✓ PASS: Navigation resets assistant state and cancels frame analysis");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 14: Valid video producing partial recipe with explicitly unknown quantities
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 14: Partial recipe with explicitly unknown quantities ---");
    const recipe = CM.recipeExtractor.extract({
      videoId: "v_unknown_qty",
      videoTitle: "Street Food Stir Fry",
      segments: [],
      ocrRecords: [
        visualExtractor.classifyOCRRegion({ text: "Coarsely Grind spices", timestamp: 30 })
      ],
      visualObservations: [
        { timestamp: 30, observedAction: "GRINDING", confidence: 0.90 }
      ]
    });

    assert.strictEqual(recipe.success, true);
    assert.strictEqual(recipe.ingredients.length, 1);
    assert.strictEqual(recipe.ingredients[0].quantity_specified, false, "Marked as unspecified quantity");
    assert.strictEqual(recipe.ingredients[0].quantity, null);
    assert(recipe.warnings.some(w => w.includes("unspecified")), "Warnings clearly disclose unspecified ingredients");
    console.log("  ✓ PASS: Partial recipe generated with explicit disclosure of unspecified quantities");
    passedCount++;
  }

  // -------------------------------------------------------------
  // Test 15: A genuinely unrelated video that must be rejected
  // -------------------------------------------------------------
  {
    console.log("\n--- Test 15: Genuinely unrelated video must be rejected ---");
    mockVideoInfo = {
      id: "v_tech_review",
      title: "iPhone 16 Pro Max Unboxing and Camera Test",
      channel: "MKBHD",
      description: "Hands on with the new phone."
    };

    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [
            { text: "Today we are looking at the new battery life and camera sensors.", start: 5, end: 15 }
          ]
        };
      }
    };
    visualExtractor.setOCRProvider(null);
    visualExtractor.setVisionProvider(null);

    const res = await assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject tech video");
    assert.strictEqual(res.category, "NON_COOKING");
    assert.strictEqual(assistant.currentRecipe, null);
    console.log("  ✓ PASS: Unrelated video safely rejected without fabricating recipe");
    passedCount++;
  }

  console.log("\n==================================================");
  console.log(`TEST RESULTS: ${passedCount}/${totalTests} tests passed.`);
  console.log("==================================================");
}

runTests().catch(err => {
  console.error("Test Suite Failure:", err);
  process.exit(1);
});
