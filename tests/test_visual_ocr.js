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
const recipeExtractor = require("../extension/recipe-extractor.js");
CM.recipeExtractor = recipeExtractor;

// Mock YouTube Controller
let mockVideoInfo = {
  id: "test_vid_1",
  title: "Test Cooking Video",
  channel: "Chef's Kitchen",
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

// Load command-executor.js
require("../extension/command-executor.js");

console.log("==================================================");
console.log("CHEFMATE VISUAL OCR & RECONCILIATION TEST SUITE");
console.log("==================================================\n");

let passed = 0;
let total = 0;

function it(description, fn) {
  total++;
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ✓ PASS: ${description}`);
    })
    .catch((err) => {
      console.error(`  ✗ FAIL: ${description}`);
      console.error(err);
      process.exitCode = 1;
    });
}

async function runTests() {
  // -------------------------------------------------------------
  // Test 1: Cooking tutorial with subtitles and matching on-screen ingredients
  // -------------------------------------------------------------
  await it("Test 1: Cooking tutorial with subtitles and matching on-screen ingredients", async () => {
    mockVideoInfo = {
      id: "v_sub_and_ocr",
      title: "Homemade Chocolate Chip Cookies",
      channel: "Baker Pro",
      description: "Learn how to make classic chocolate chip cookies."
    };

    const segments = [
      { text: "In a bowl, cream together butter and sugar until smooth.", start: 10, end: 18 },
      { text: "Add the eggs and vanilla, beating thoroughly.", start: 22, end: 28 },
      { text: "Fold in the flour and chocolate chips.", start: 35, end: 42 },
      { text: "Bake in the preheated oven for 12 minutes.", start: 50, end: 56 }
    ];

    CM.transcriptExtractor = {
      async getSegments() { return { success: true, segments }; }
    };

    // On-screen ingredient card displayed at 00:00:15
    CM.visualExtractor.setOCRProvider(async () => {
      return {
        records: [
          { text: "200 g butter", timestamp: 12, screenRegion: "TOP_LEFT", confidence: 0.95 },
          { text: "150 g sugar", timestamp: 12, screenRegion: "TOP_LEFT", confidence: 0.95 },
          { text: "2 eggs", timestamp: 24, screenRegion: "TOP_LEFT", confidence: 0.96 },
          { text: "250 g flour", timestamp: 36, screenRegion: "TOP_LEFT", confidence: 0.94 },
          { text: "100 g chocolate", timestamp: 38, screenRegion: "TOP_LEFT", confidence: 0.92 }
        ]
      };
    });

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, true);
    assert.ok(recipeRendered);

    // Verify ingredients were enriched with on-screen quantities and units
    const flour = recipeRendered.ingredients.find(i => i.name.includes("flour"));
    assert.ok(flour, "Flour must be present");
    assert.strictEqual(flour.quantity, "250");
    assert.strictEqual(flour.unit, "gram");
    assert.ok(flour.sources.includes("ocr") && flour.sources.includes("transcript"));

    const butter = recipeRendered.ingredients.find(i => i.name.includes("butter"));
    assert.strictEqual(butter.quantity, "200");
    assert.strictEqual(butter.unit, "gram");
  });

  // -------------------------------------------------------------
  // Test 2: Cooking tutorial with no subtitles but a clear on-screen recipe card
  // -------------------------------------------------------------
  await it("Test 2: Cooking tutorial with no subtitles but clear on-screen recipe card", async () => {
    mockVideoInfo = {
      id: "v_no_sub_recipe_card",
      title: "French Omelette Tutorial (No Dialogue / ASMR Cooking)",
      channel: "Quiet Kitchen",
      description: "Relaxing silent cooking video with on-screen measurements."
    };

    // No subtitles available
    CM.transcriptExtractor = {
      async getSegments() { return { success: false, segments: [], count: 0 }; }
    };

    CM.visualExtractor.setOCRProvider(async () => {
      return {
        records: [
          { text: "Ingredients:", timestamp: 5, screenRegion: "FULL_CARD", confidence: 0.92 },
          { text: "3 eggs", timestamp: 5, screenRegion: "FULL_CARD", confidence: 0.95 },
          { text: "20 g butter", timestamp: 5, screenRegion: "FULL_CARD", confidence: 0.94 },
          { text: "1 pinch salt", timestamp: 5, screenRegion: "FULL_CARD", confidence: 0.90 },
          { text: "Whisk the eggs with a pinch of salt until smooth.", timestamp: 15, screenRegion: "LOWER_THIRD", confidence: 0.95 },
          { text: "Melt butter in a skillet over medium heat.", timestamp: 25, screenRegion: "LOWER_THIRD", confidence: 0.94 },
          { text: "Pour in the eggs and stir gently until soft curds form.", timestamp: 35, screenRegion: "LOWER_THIRD", confidence: 0.96 },
          { text: "Fold the omelette and slide onto a plate.", timestamp: 48, screenRegion: "LOWER_THIRD", confidence: 0.95 }
        ]
      };
    });

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Visual OCR must allow recipe generation when subtitles are absent");
    assert.ok(recipeRendered);
    assert.ok(recipeRendered.ingredients.length >= 3);
    assert.ok(recipeRendered.steps.length >= 3);
    assert.ok(recipeRendered.steps[0].instruction.includes("Whisk"));
  });

  // -------------------------------------------------------------
  // Test 3: Video with subtitles but no useful visual text
  // -------------------------------------------------------------
  await it("Test 3: Video with subtitles but no useful visual text", async () => {
    mockVideoInfo = {
      id: "v_sub_only",
      title: "Simple Tomato Soup Recipe",
      channel: "Home Chef",
      description: "Quick soup recipe."
    };

    const segments = [
      { text: "Chop two onions and sauté in olive oil until golden brown.", start: 10, end: 18 },
      { text: "Add crushed tomatoes and simmer on low heat for 20 minutes.", start: 25, end: 34 },
      { text: "Blend the soup until creamy and serve hot.", start: 40, end: 48 }
    ];

    CM.transcriptExtractor = {
      async getSegments() { return { success: true, segments }; }
    };

    // OCR detects no recipe text (only empty or generic scenes)
    CM.visualExtractor.setOCRProvider(async () => {
      return { records: [] };
    });

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, true);
    assert.ok(recipeRendered);
    assert.ok(recipeRendered.steps.length >= 2);
  });

  // -------------------------------------------------------------
  // Test 4: Video containing only channel names and watermarks
  // -------------------------------------------------------------
  await it("Test 4: Video containing only channel names and watermarks", async () => {
    const watermarkText = "Chef John's Kitchen";
    const record = {
      text: watermarkText,
      timestamp: 10,
      screenRegion: "TOP_RIGHT",
      confidence: 0.98
    };

    const classified = visualExtractor.classifyOCRRegion(record, { channel: "Chef John's Kitchen" });
    assert.strictEqual(classified.classification, "CHANNEL_OR_WATERMARK");
    assert.strictEqual(classified.recipeRelevance <= 0.1, true);

    // Also verify handle watermark
    const handleRecord = { text: "@TastyFoodVideos", timestamp: 15, screenRegion: "BOTTOM_RIGHT" };
    const handleClassified = visualExtractor.classifyOCRRegion(handleRecord, {});
    assert.strictEqual(handleClassified.classification, "CHANNEL_OR_WATERMARK");
  });

  // -------------------------------------------------------------
  // Test 5: Video with subscribe messages and promotional overlays
  // -------------------------------------------------------------
  await it("Test 5: Video with subscribe messages and promotional overlays", async () => {
    const promoRecords = [
      { text: "SUBSCRIBE FOR NEW RECIPES EVERY FRIDAY!", timestamp: 5 },
      { text: "Don't forget to like and share this video", timestamp: 20 },
      { text: "Sponsored by Kitchenware Express - Link in description", timestamp: 45 },
      { text: "Follow us on Instagram @chefstyle", timestamp: 90 }
    ];

    for (const r of promoRecords) {
      const res = visualExtractor.classifyOCRRegion(r, {});
      assert.strictEqual(res.classification, "PROMOTIONAL_TEXT");
      assert.strictEqual(res.recipeRelevance, 0.0, "Promotional text must have 0 recipe relevance");
    }
  });

  // -------------------------------------------------------------
  // Test 6: Video with product packaging text
  // -------------------------------------------------------------
  await it("Test 6: Video with product packaging text", async () => {
    const packagingRecord = {
      text: "Nutrition Facts: Servings per container 8, Net Wt 500g",
      timestamp: 30,
      screenRegion: "CENTER"
    };

    const res = visualExtractor.classifyOCRRegion(packagingRecord, {});
    assert.strictEqual(res.classification, "PRODUCT_LABEL");
    assert.strictEqual(res.recipeRelevance <= 0.2, true);
  });

  // -------------------------------------------------------------
  // Test 7: Non-cooking video containing food-related words on screen
  // -------------------------------------------------------------
  await it("Test 7: Non-cooking video containing food-related words on screen → REJECT", async () => {
    mockVideoInfo = {
      id: "v_gaming_candy",
      title: "Candy Crush Saga Level 500 Gameplay Walkthrough",
      channel: "Gaming Pro",
      description: "Beating level 500 with chocolate boosters."
    };

    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [
            { text: "Match the three candies to clear the chocolate barrier.", start: 0, end: 5 },
            { text: "Use the lollipop hammer to smash that jelly square.", start: 10, end: 15 }
          ]
        };
      }
    };

    CM.visualExtractor.setOCRProvider(async () => {
      return {
        records: [
          { text: "Level 500", timestamp: 2 },
          { text: "Chocolate Boosters: 3", timestamp: 10 },
          { text: "Score: 45000", timestamp: 20 }
        ]
      };
    });

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject gaming video despite food/candy words");
    assert.strictEqual(res.category, "NON_COOKING");
    assert.strictEqual(lastStatusText, "Not a cooking tutorial");
  });

  // -------------------------------------------------------------
  // Test 8: Genuine recipe quantity displayed for only a short time
  // -------------------------------------------------------------
  await it("Test 8: Genuine recipe quantity displayed for only a short time", async () => {
    // Transcript mentions olive oil without quantity
    const transcriptIngredients = [{ name: "olive oil", quantity: null, quantity_specified: false }];
    const transcriptSteps = [{ step_number: 1, instruction: "Heat olive oil in pan", start_seconds: 15 }];

    // Flash overlay at 00:00:15 for only 2 seconds
    const ocrRecords = [
      visualExtractor.classifyOCRRegion({
        text: "2 tbsp olive oil",
        timestamp: 15,
        screenRegion: "LOWER_THIRD"
      })
    ];

    const reconciled = visualExtractor.reconcileTranscriptAndOCR({
      transcriptIngredients,
      transcriptSteps,
      ocrRecords
    });

    const oil = reconciled.ingredients.find(i => i.name === "olive oil");
    assert.strictEqual(oil.quantity, "2");
    assert.strictEqual(oil.unit, "tablespoon");
    assert.strictEqual(oil.quantity_specified, true);
  });

  // -------------------------------------------------------------
  // Test 9: Repeated ingredient text across several consecutive frames
  // -------------------------------------------------------------
  await it("Test 9: Repeated ingredient text across several consecutive frames (deduplication)", async () => {
    // The same on-screen card is captured at 5s, 10s, 15s, and 20s
    const ocrRecords = [
      visualExtractor.classifyOCRRegion({ text: "200 g flour", timestamp: 5 }),
      visualExtractor.classifyOCRRegion({ text: "200 g flour", timestamp: 10 }),
      visualExtractor.classifyOCRRegion({ text: "200 g flour", timestamp: 15 }),
      visualExtractor.classifyOCRRegion({ text: "200 g flour", timestamp: 20 })
    ];

    const reconciled = visualExtractor.reconcileTranscriptAndOCR({
      transcriptIngredients: [],
      transcriptSteps: [],
      ocrRecords
    });

    // Must be deduplicated into a single ingredient entry
    assert.strictEqual(reconciled.ingredients.length, 1);
    assert.strictEqual(reconciled.ingredients[0].name, "flour");
    assert.strictEqual(reconciled.ingredients[0].quantity, "200");
  });

  // -------------------------------------------------------------
  // Test 10: Different quantities for the same ingredient at different stages
  // -------------------------------------------------------------
  await it("Test 10: Different quantities for the same ingredient at different stages", async () => {
    const transcriptIngredients = [
      { name: "butter", quantity: "1 tbsp", quantity_specified: true }
    ];
    const warnings = [];

    // Later stage recipe card shows a different quantity: 50 g butter
    const ocrRecords = [
      visualExtractor.classifyOCRRegion({ text: "50 g butter", timestamp: 80 })
    ];

    const reconciled = visualExtractor.reconcileTranscriptAndOCR({
      transcriptIngredients,
      transcriptSteps: [],
      ocrRecords,
      warnings
    });

    assert.ok(warnings.length > 0, "Conflicting quantities should produce a descriptive warning");
    assert.ok(warnings[0].includes("Quantity conflict for butter"));
  });

  // -------------------------------------------------------------
  // Test 11: OCR errors involving digits, units, and punctuation
  // -------------------------------------------------------------
  await it("Test 11: OCR errors involving digits, units, and punctuation", async () => {
    // "2OOg" -> "200 g"
    assert.strictEqual(visualExtractor.cleanOCRText("2OOg"), "200 g");

    // "18O°C" -> "180°C"
    assert.strictEqual(visualExtractor.cleanOCRText("18O°C"), "180°C");

    // "l tsp salt" -> "1 tsp salt"
    assert.strictEqual(visualExtractor.cleanOCRText("l tsp salt"), "1 tsp salt");

    // "I tbsp olive oil" -> "1 tbsp olive oil"
    assert.strictEqual(visualExtractor.cleanOCRText("I tbsp olive oil"), "1 tbsp olive oil");

    // Unicode fraction replacement: "½ cup" -> "1/2 cup"
    assert.strictEqual(visualExtractor.cleanOCRText("½ cup milk"), "1/2 cup milk");
  });

  // -------------------------------------------------------------
  // Test 12: Conflicting transcript and OCR quantities
  // -------------------------------------------------------------
  await it("Test 12: Conflicting transcript and OCR quantities flags uncertainty", async () => {
    const warnings = [];
    const transcriptIngredients = [
      { name: "flour", quantity: "1 cup", quantity_specified: true, unit: "cup" }
    ];
    const ocrRecords = [
      visualExtractor.classifyOCRRegion({ text: "3 cups flour", timestamp: 10 })
    ];

    const reconciled = visualExtractor.reconcileTranscriptAndOCR({
      transcriptIngredients,
      transcriptSteps: [],
      ocrRecords,
      warnings
    });

    assert.ok(warnings.length > 0);
    assert.ok(reconciled.ingredients[0].has_conflict);
    assert.strictEqual(reconciled.ingredients[0].quantity, "1 cup", "Should preserve original without blind overwrite");
  });

  // -------------------------------------------------------------
  // Test 13: OCR worker initialization failure
  // -------------------------------------------------------------
  await it("Test 13: OCR worker initialization failure fails gracefully without blocking", async () => {
    mockVideoInfo = {
      id: "v_ocr_init_fail",
      title: "Roasted Potatoes Recipe",
      description: "Crispy roasted potatoes."
    };

    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [
            { text: "Cut the potatoes into cubes and toss with olive oil.", start: 10, end: 18 },
            { text: "Roast in the oven at 400 degrees for 30 minutes.", start: 25, end: 32 }
          ]
        };
      }
    };

    // Force OCR extraction to fail completely
    CM.visualExtractor.setOCRProvider(async () => {
      throw new Error("WASM OCR worker out of memory / failed to load");
    });

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Must continue with transcript recipe even if visual OCR fails");
    assert.ok(recipeRendered);
    assert.strictEqual(recipeRendered.steps.length, 2);
  });

  // -------------------------------------------------------------
  // Test 14: Video navigation during OCR processing
  // -------------------------------------------------------------
  await it("Test 14: Video navigation during OCR processing resets state cleanly", async () => {
    CM.visualExtractor.reset();
    assert.strictEqual(CM.assistant.state === "IDLE" || CM.assistant.state === "AWAITING_INGREDIENT_PREFERENCE", true);

    // Navigate to a new video while visual extractor is active
    CM.assistant.reset("v_new_video_999");
    assert.strictEqual(CM.assistant.state, "IDLE");
    assert.strictEqual(CM.assistant.currentRecipe, null);
    assert.strictEqual(recipeRendered, null);
  });

  // -------------------------------------------------------------
  // Test 15: Cancellation during OCR processing
  // -------------------------------------------------------------
  await it("Test 15: Cancellation during OCR processing stops frame extraction immediately", async () => {
    let callCount = 0;
    CM.visualExtractor.setOCRProvider(async () => {
      callCount++;
      CM.visualExtractor.cancel();
      return { records: [] };
    });

    const timestamps = CM.visualExtractor.getCandidateTimestamps(300, 10, 20);
    assert.ok(timestamps.length > 0);
  });

  // -------------------------------------------------------------
  // Test 16: A long video where frame sampling reaches the configured limit
  // -------------------------------------------------------------
  await it("Test 16: Long video (45 mins) frame sampling respects maxFrames limit", async () => {
    const longDuration = 2700; // 45 minutes
    const maxFrames = 10;
    const timestamps = CM.visualExtractor.getCandidateTimestamps(longDuration, maxFrames, 30);

    assert.ok(timestamps.length <= maxFrames, "Must not exceed maxFrames");
    assert.ok(timestamps[0] <= 15, "First frame should sample early intro card");
    assert.ok(timestamps[timestamps.length - 1] > 1000, "Should sample across duration");
  });

  // -------------------------------------------------------------
  // Test 17: A valid recipe that combines subtitle steps with visual quantities
  // -------------------------------------------------------------
  await it("Test 17: Valid recipe combining subtitle steps with visual quantities & timers", async () => {
    mockVideoInfo = {
      id: "v_combo_recipe",
      title: "How to Bake Sourdough Boule",
      channel: "Artisan Bread",
      description: "Complete sourdough loaf guide."
    };

    const segments = [
      { text: "Mix flour, water, and sourdough starter in a large bowl.", start: 10, end: 18 },
      { text: "Let the dough rest and perform stretch and folds every thirty minutes.", start: 25, end: 35 },
      { text: "Bake in a preheated Dutch oven until deeply golden brown.", start: 50, end: 60 }
    ];

    CM.transcriptExtractor = {
      async getSegments() { return { success: true, segments }; }
    };

    CM.visualExtractor.setOCRProvider(async () => {
      return {
        records: [
          { text: "500 g flour", timestamp: 12, screenRegion: "TOP_LEFT", confidence: 0.96 },
          { text: "350 ml water", timestamp: 14, screenRegion: "TOP_LEFT", confidence: 0.95 },
          { text: "100 g sourdough starter", timestamp: 16, screenRegion: "TOP_LEFT", confidence: 0.92 },
          { text: "230°C — 45 minutes", timestamp: 52, screenRegion: "LOWER_THIRD", confidence: 0.94 }
        ]
      };
    });

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, true);
    assert.ok(recipeRendered);

    // Verify visual ingredients enriched
    const flour = recipeRendered.ingredients.find(i => i.name.includes("flour"));
    assert.strictEqual(flour.quantity, "500");
    assert.strictEqual(flour.unit, "gram");

    // Verify visual temperature and duration enriched on the baking step
    const bakeStep = recipeRendered.steps.find(s => s.instruction.includes("Dutch oven"));
    assert.ok(bakeStep);
    assert.strictEqual(bakeStep.temperature, "230°C");
    assert.strictEqual(bakeStep.duration_seconds, 2700); // 45 mins * 60
  });

  // -------------------------------------------------------------
  // Test 18: Random video that must not produce invented recipe steps
  // -------------------------------------------------------------
  await it("Test 18: Random video (Tech Review) must not produce invented recipe steps", async () => {
    mockVideoInfo = {
      id: "v_tech_review",
      title: "Apple M3 MacBook Pro Review: Real World Benchmark!",
      channel: "Tech Tested",
      description: "Testing battery life and GPU performance on the new MacBook Pro."
    };

    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [
            { text: "Welcome back! Today we are testing the new M3 chip performance.", start: 0, end: 6 },
            { text: "In video rendering tests, export time was reduced by half.", start: 10, end: 16 }
          ]
        };
      }
    };

    CM.visualExtractor.setOCRProvider(async () => {
      return {
        records: [
          { text: "M3 Max 16-Core CPU", timestamp: 5 },
          { text: "Benchmark Score: 24,000", timestamp: 12 },
          { text: "Battery Life: 18 hours", timestamp: 25 }
        ]
      };
    });

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject random tech review video");
    assert.strictEqual(res.category, "NON_COOKING");
    assert.strictEqual(CM.assistant.currentRecipe, null);
    assert.strictEqual(recipeRendered, null);
  });

  console.log(`\nResults: ${passed} passed, ${total - passed} failed of ${total} tests.`);
  if (total - passed > 0) {
    process.exit(1);
  }
}

runTests();
