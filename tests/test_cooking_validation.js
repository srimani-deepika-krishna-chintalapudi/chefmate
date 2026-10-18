const assert = require("assert");

// Setup browser-like environment for Node.js
global.window = global;
global.document = {
  querySelector(selector) {
    if (selector === "video") {
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

// Load modules
const recipeExtractor = require("../extension/recipe-extractor.js");
CM.recipeExtractor = recipeExtractor;

// Mock YouTube Controller
let mockVideoInfo = {
  id: "test123",
  title: "Test Video",
  description: ""
};

CM.youtubeController = {
  currentVideo() {
    return mockVideoInfo;
  },
  seekTo(seconds) {
    mockVideoInfo.lastSeek = seconds;
  }
};

// Mock UI
let lastStatusText = "";
let lastSpokenText = "";
let recipeRendered = null;

CM.ui = {
  setRecipeStatus(text) {
    lastStatusText = text;
  },
  setSpokenText(text) {
    lastSpokenText = text;
  },
  renderRecipe(recipe, stepIdx) {
    recipeRendered = recipe;
  },
  resetRecipe() {
    recipeRendered = null;
    lastStatusText = "Say \"generate recipe\" or click below to analyze this video.";
  },
  highlightStep() {},
  updateDebug() {}
};

// Mock Voice
let spokenMessages = [];
CM.voice = {
  speak(text) {
    spokenMessages.push(text);
  },
  stopSpeaking() {
    spokenMessages = [];
  }
};

// Load command-executor.js
require("../extension/command-executor.js");

console.log("==================================================");
console.log("CHEFMATE COOKING VIDEO DETECTION & VALIDATION SUITE");
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
  // Test 1: Genuine cooking tutorial with ingredients and ordered steps -> ACCEPT
  // -------------------------------------------------------------
  await it("Test 1: Genuine cooking tutorial with ingredients and ordered steps → ACCEPT", async () => {
    mockVideoInfo = {
      id: "v_cooking_1",
      title: "How to Make Authentic Italian Carbonara",
      description: "A classic pasta carbonara recipe made with guanciale, eggs, and pecorino cheese."
    };

    const segments = [
      { text: "Welcome! Today we are making authentic Roman carbonara.", start: 0, end: 5 },
      { text: "First, bring a large pot of salted water to a boil.", start: 10, end: 15 },
      { text: "Dice 150 grams of guanciale and cook in a skillet over medium heat until crispy.", start: 20, end: 28 },
      { text: "In a bowl, whisk 3 egg yolks with grated pecorino cheese and black pepper.", start: 35, end: 42 },
      { text: "Cook the spaghetti until al dente and reserve half a cup of pasta water.", start: 50, end: 58 },
      { text: "Turn off the heat, add the pasta to the pan, and quickly mix in the egg mixture.", start: 65, end: 74 },
      { text: "Serve immediately with extra black pepper on top.", start: 80, end: 85 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Should succeed for genuine cooking tutorial");
    assert.strictEqual(CM.assistant.state, "AWAITING_INGREDIENT_PREFERENCE");
    assert.ok(recipeRendered, "Recipe should be rendered");
    assert.ok(recipeRendered.steps.length >= 4, "Should extract at least 4 steps");
    assert.ok(recipeRendered.ingredients.length >= 3, "Should extract ingredients");
    assert.strictEqual(lastStatusText, "Recipe ready");
    assert.ok(res.message.includes("ingredients and their quantities first"));
  });

  // -------------------------------------------------------------
  // Test 2: Gaming video with unrelated subtitles -> REJECT
  // -------------------------------------------------------------
  await it("Test 2: Gaming video with unrelated subtitles → REJECT", async () => {
    mockVideoInfo = {
      id: "v_gaming_1",
      title: "Minecraft Hardcore Survival Gameplay Episode 45",
      description: "Exploring the nether fortress and defeating the blaze boss!"
    };

    const segments = [
      { text: "Welcome back to the hardcore world guys!", start: 0, end: 5 },
      { text: "Today we are heading deep into the nether fortress.", start: 8, end: 14 },
      { text: "Watch out for that wither skeleton, his attack has high damage.", start: 18, end: 25 },
      { text: "I need to open my inventory slots and grab some potions.", start: 30, end: 36 },
      { text: "We defeated the boss! Make sure to like and subscribe.", start: 40, end: 46 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject gaming video");
    assert.strictEqual(res.category, "NON_COOKING");
    assert.strictEqual(res.message, "This doesn't appear to be a cooking tutorial. Please open a cooking or recipe video to use ChefMate.");
    assert.strictEqual(lastStatusText, "Not a cooking tutorial");
    assert.strictEqual(CM.assistant.currentRecipe, null, "Recipe must remain null");
    assert.strictEqual(recipeRendered, null, "UI recipe must be reset");
  });

  // -------------------------------------------------------------
  // Test 3: Music video with no recipe -> REJECT
  // -------------------------------------------------------------
  await it("Test 3: Music video with no recipe → REJECT", async () => {
    mockVideoInfo = {
      id: "v_music_1",
      title: "Taylor Swift - Blank Space (Official Music Video)",
      description: "Official music video for Blank Space by Taylor Swift."
    };

    const segments = [
      { text: "Nice to meet you, where you been?", start: 0, end: 5 },
      { text: "I could show you incredible things", start: 6, end: 10 },
      { text: "Magic, madness, heaven, sin", start: 11, end: 15 },
      { text: "Saw you there and I thought, oh my god look at that face", start: 16, end: 22 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject music video");
    assert.strictEqual(res.category, "NON_COOKING");
    assert.strictEqual(lastStatusText, "Not a cooking tutorial");
  });

  // -------------------------------------------------------------
  // Test 4: Movie trailer mentioning food once -> REJECT
  // -------------------------------------------------------------
  await it("Test 4: Movie trailer mentioning food once → REJECT", async () => {
    mockVideoInfo = {
      id: "v_trailer_1",
      title: "Avengers: Secret Wars — Official Movie Trailer (2026)",
      description: "The official teaser trailer for Marvel Studios' Avengers."
    };

    const segments = [
      { text: "The universe is unraveling, and we have one chance left.", start: 0, end: 6 },
      { text: "I'm in, but first let's grab a hot dog before we head out.", start: 10, end: 15 },
      { text: "In theaters worldwide this November. Get your tickets now.", start: 20, end: 25 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject movie trailer mentioning food casually");
    assert.strictEqual(res.category, "NON_COOKING");
    assert.strictEqual(lastStatusText, "Not a cooking tutorial");
  });

  // -------------------------------------------------------------
  // Test 5: Food review without preparation instructions -> REJECT
  // -------------------------------------------------------------
  await it("Test 5: Food review without preparation instructions → REJECT", async () => {
    mockVideoInfo = {
      id: "v_review_1",
      title: "Best Cheeseburger in NYC? Food Review & Taste Test",
      description: "We visited 7th Street Burger to test their famous smashburger."
    };

    const segments = [
      { text: "Hey everyone, today we are reviewing the best smash burger in town.", start: 0, end: 5 },
      { text: "Look at the crispy edges and the melted cheese on this patty.", start: 10, end: 15 },
      { text: "Let's take a first bite. Wow, it tastes so delicious and juicy.", start: 20, end: 26 },
      { text: "The texture is soft and melts in your mouth. For seven dollars, this is a 10 out of 10.", start: 30, end: 38 },
      { text: "Highly recommend visiting if you are ever in the area.", start: 40, end: 45 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject food review");
    assert.strictEqual(res.category, "FOOD_RELATED_NON_TUTORIAL");
    assert.strictEqual(res.message, "This video is related to food, but it doesn't contain enough cooking instructions to generate a reliable recipe.");
    assert.strictEqual(lastStatusText, "Food-related but no usable instructions");
  });

  // -------------------------------------------------------------
  // Test 6: Restaurant vlog showing food but not explaining a recipe -> REJECT
  // -------------------------------------------------------------
  await it("Test 6: Restaurant vlog showing food but not explaining a recipe → REJECT", async () => {
    mockVideoInfo = {
      id: "v_vlog_1",
      title: "Eating at a 3-Star Michelin Restaurant in Paris! Food Vlog",
      description: "Come with us as we experience a 12-course tasting menu in France."
    };

    const segments = [
      { text: "Bonjour everyone! Today we are dining at this iconic three star restaurant.", start: 0, end: 6 },
      { text: "The atmosphere and the decor in this dining room are breathtaking.", start: 10, end: 15 },
      { text: "Our first course is a delicate truffle tart with cream.", start: 20, end: 25 },
      { text: "The waiter explained the origins of the wine pairing.", start: 30, end: 35 },
      { text: "Everything was so flavorful and tender. An unforgettable dining experience.", start: 40, end: 46 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject restaurant vlog");
    assert.strictEqual(res.category, "FOOD_RELATED_NON_TUTORIAL");
    assert.strictEqual(lastStatusText, "Food-related but no usable instructions");
  });

  // -------------------------------------------------------------
  // Test 7: Cooking tutorial with no ingredients in title but clear instructions in transcript -> ACCEPT
  // -------------------------------------------------------------
  await it("Test 7: Cooking tutorial with no ingredients in title but clear transcript instructions → ACCEPT", async () => {
    mockVideoInfo = {
      id: "v_tutorial_no_title_ing",
      title: "My Grandmother's Secret Sunday Supper That Everyone Begs For",
      description: "The traditional family comfort dish passed down for generations."
    };

    const segments = [
      { text: "Hello my friends! Today I share my grandmother's secret comfort dish.", start: 0, end: 6 },
      { text: "First, dice 2 yellow onions and 4 cloves of fresh garlic.", start: 10, end: 16 },
      { text: "Heat 2 tablespoons of olive oil in a Dutch oven over medium heat.", start: 20, end: 26 },
      { text: "Add the onions and garlic, and sauté until translucent and fragrant.", start: 30, end: 37 },
      { text: "Pour in 2 cans of crushed tomatoes and add a teaspoon of salt and oregano.", start: 45, end: 53 },
      { text: "Simmer gently on low heat for 30 minutes until thickened.", start: 60, end: 68 },
      { text: "Boil the pasta in salted water, drain, and toss with the rich sauce.", start: 75, end: 84 },
      { text: "Sprinkle with grated parmesan and serve hot.", start: 90, end: 96 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Should accept tutorial even with abstract title");
    assert.strictEqual(res.action, "GENERATE_RECIPE");
    assert.strictEqual(CM.assistant.state, "AWAITING_INGREDIENT_PREFERENCE");
    assert.ok(recipeRendered.steps.length >= 4);
    assert.strictEqual(lastStatusText, "Recipe ready");
  });

  // -------------------------------------------------------------
  // Test 8: Recipe video whose title contains misleading words but transcript has clear steps -> ACCEPT
  // -------------------------------------------------------------
  await it("Test 8: Recipe video with misleading title words but clear preparation steps → ACCEPT", async () => {
    mockVideoInfo = {
      id: "v_misleading_title",
      title: "I Played Minecraft for 12 Hours Then Cooked This Insane Dish",
      description: "Taking a break from gaming to cook a real homemade meal."
    };

    const segments = [
      { text: "After grinding Minecraft all day, I got super hungry.", start: 0, end: 5 },
      { text: "So today we are cooking a classic chicken stir-fry from scratch.", start: 8, end: 14 },
      { text: "Slice two chicken breasts into thin bite-sized strips.", start: 18, end: 24 },
      { text: "Heat 1 tablespoon of vegetable oil in a hot wok over high heat.", start: 28, end: 35 },
      { text: "Add the chicken and stir-fry for 5 minutes until browned.", start: 40, end: 46 },
      { text: "Toss in sliced bell peppers, carrots, and minced ginger.", start: 50, end: 57 },
      { text: "Pour in 2 tablespoons of soy sauce and stir everything together.", start: 62, end: 69 },
      { text: "Serve over warm jasmine rice.", start: 75, end: 80 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Combined evidence should accept valid recipe despite gaming title keyword");
    assert.strictEqual(CM.assistant.state, "AWAITING_INGREDIENT_PREFERENCE");
  });

  // -------------------------------------------------------------
  // Test 9: Ordinary video with a few cooking-related words -> REJECT
  // -------------------------------------------------------------
  await it("Test 9: Ordinary video with a few cooking-related words (idioms) → REJECT", async () => {
    mockVideoInfo = {
      id: "v_rap_battle",
      title: "Freestyle Rap Battle Live Finals",
      description: "The championship round of the national rap league."
    };

    const segments = [
      { text: "Welcome to the finals! The crowd is going wild tonight.", start: 0, end: 5 },
      { text: "He cooked that guy in round one, absolute bars.", start: 10, end: 15 },
      { text: "Let him cook, he's got so much heat in his rhymes.", start: 20, end: 25 },
      { text: "That punchline was sweet as honey, easy as a piece of cake.", start: 30, end: 36 },
      { text: "Give it up for our champion tonight!", start: 40, end: 45 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject casual idioms and colloquial cooking words");
    assert.strictEqual(res.category, "NON_COOKING");
  });

  // -------------------------------------------------------------
  // Test 10: Missing transcript and unrelated title -> REJECT / INSUFFICIENT_EVIDENCE
  // -------------------------------------------------------------
  await it("Test 10: Missing transcript and unrelated title → REJECT or INSUFFICIENT_EVIDENCE", async () => {
    mockVideoInfo = {
      id: "v_no_trans",
      title: "Top 10 Electric Cars Coming in 2026",
      description: "An overview of battery range and charging speed of upcoming EVs."
    };

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: false, segments: [], count: 0 };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject missing transcript with non-cooking title");
    assert.ok(res.category === "NON_COOKING" || res.category === "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(CM.assistant.currentRecipe, null);
  });

  // -------------------------------------------------------------
  // Test 11: Incomplete transcript containing only an introduction -> INSUFFICIENT_EVIDENCE
  // -------------------------------------------------------------
  await it("Test 11: Incomplete transcript containing only an introduction → INSUFFICIENT_EVIDENCE", async () => {
    mockVideoInfo = {
      id: "v_intro_only",
      title: "How to Bake Sourdough Bread from Scratch",
      description: "Master the art of homemade artisan sourdough."
    };

    // Video is 300 seconds, but transcript only has 2 introductory sentences (10s)
    const segments = [
      { text: "Hey everyone, welcome back to my artisan bakery channel!", start: 0, end: 4 },
      { text: "Today I'm going to teach you everything about baking sourdough bread.", start: 5, end: 10 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments, count: 2 };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject incomplete intro-only transcript");
    assert.strictEqual(res.category, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(res.message, "I couldn't verify that this video contains a usable recipe. Please check the subtitles or try another cooking video.");
    assert.strictEqual(lastStatusText, "Insufficient transcript or evidence");
  });

  // -------------------------------------------------------------
  // Test 12: Valid recipe video with some quantities omitted -> ACCEPT with unspecified quantities
  // -------------------------------------------------------------
  await it("Test 12: Valid recipe with omitted quantities → ACCEPT & mark unspecified", async () => {
    mockVideoInfo = {
      id: "v_unspecified_qty",
      title: "Simple Garlic Butter Pasta",
      description: "A quick pantry pasta for weeknights."
    };

    const segments = [
      { text: "Boil the pasta in a large pot of salted water until tender.", start: 0, end: 6 },
      { text: "Melt butter in a frying pan over medium heat.", start: 10, end: 15 },
      { text: "Add sliced garlic and red pepper flakes, sauté until golden brown.", start: 20, end: 27 },
      { text: "Toss the drained pasta into the garlic butter sauce.", start: 35, end: 42 },
      { text: "Garnish with freshly chopped parsley and serve.", start: 50, end: 55 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, true, "Should accept valid recipe even if quantities are not specified");
    assert.ok(recipeRendered);
    const unspecified = recipeRendered.ingredients.filter(i => !i.quantity_specified);
    assert.ok(unspecified.length > 0, "Omitted quantities should be cleanly marked unspecified");
  });

  // -------------------------------------------------------------
  // Test 13: Food discussion mentioning many ingredients without preparation procedure -> REJECT
  // -------------------------------------------------------------
  await it("Test 13: Food discussion mentioning ingredients without preparation procedure → REJECT", async () => {
    mockVideoInfo = {
      id: "v_nutrition_lecture",
      title: "The Science of Anti-Inflammatory Foods",
      description: "A doctor explains how foods affect inflammation and metabolic health."
    };

    const segments = [
      { text: "Welcome to today's medical lecture on nutritional science.", start: 0, end: 6 },
      { text: "First, garlic contains allicin, a powerful antioxidant compound.", start: 10, end: 16 },
      { text: "Extra virgin olive oil is packed with healthy monounsaturated fats.", start: 20, end: 26 },
      { text: "Wild salmon provides essential omega-3 fatty acids for heart health.", start: 30, end: 36 },
      { text: "Spinach and tomatoes provide high levels of vitamin C and potassium.", start: 40, end: 46 },
      { text: "Incorporating these whole foods into your daily diet lowers overall inflammation.", start: 50, end: 58 }
    ];

    CM.transcriptExtractor = {
      async getSegments() {
        return { success: true, segments };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false, "Must reject food discussion lacking procedural steps");
    assert.strictEqual(res.category, "FOOD_RELATED_NON_TUTORIAL");
    assert.strictEqual(lastStatusText, "Food-related but no usable instructions");
  });

  // -------------------------------------------------------------
  // Test 14: After rejecting a gaming video, opening a valid cooking tutorial works normally
  // -------------------------------------------------------------
  await it("Test 14: After rejecting a gaming video, opening a valid cooking tutorial works normally", async () => {
    // Step 1: Reject gaming video
    mockVideoInfo = {
      id: "v_gaming_2",
      title: "Fortnite Battle Royale Victory Royale Gameplay",
      description: "Solo queue battle royale gameplay."
    };
    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [{ text: "Dropping into tilted towers, let's get that victory royale!", start: 0, end: 5 }]
        };
      }
    };
    const res1 = await CM.assistant.generateRecipe();
    assert.strictEqual(res1.success, false);
    assert.strictEqual(CM.assistant.state, "IDLE");

    // Step 2: Now navigate to a valid cooking tutorial
    mockVideoInfo = {
      id: "v_cooking_2",
      title: "Crispy Pan-Seared Salmon Recipe",
      description: "How to get ultra crispy salmon skin every single time."
    };
    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [
            { text: "Season the salmon fillets with salt and black pepper on both sides.", start: 0, end: 6 },
            { text: "Heat 1 tablespoon of olive oil in a stainless steel skillet over medium heat.", start: 10, end: 16 },
            { text: "Place the salmon skin-side down and press gently with a spatula.", start: 20, end: 26 },
            { text: "Cook for 5 minutes until the skin is golden brown and crispy.", start: 30, end: 36 },
            { text: "Flip the salmon and cook for another 2 minutes, then remove from heat.", start: 40, end: 47 },
            { text: "Squeeze fresh lemon juice over the top and serve.", start: 50, end: 56 }
          ]
        };
      }
    };
    const res2 = await CM.assistant.generateRecipe();
    assert.strictEqual(res2.success, true, "Second valid video must succeed");
    assert.strictEqual(CM.assistant.state, "AWAITING_INGREDIENT_PREFERENCE");
    assert.ok(recipeRendered);
    assert.strictEqual(recipeRendered.video_id, "v_cooking_2");
    assert.strictEqual(lastStatusText, "Recipe ready");
  });

  // -------------------------------------------------------------
  // Test 15: After rejecting a video, old ingredients and steps must not appear as new video's recipe
  // -------------------------------------------------------------
  await it("Test 15: After rejection, old ingredients and steps must not appear as new recipe", async () => {
    // First, start with an active recipe
    assert.ok(CM.assistant.currentRecipe !== null, "Recipe currently loaded from Test 14");
    assert.ok(recipeRendered !== null);

    // Now navigate to a gaming video and attempt generateRecipe
    mockVideoInfo = {
      id: "v_gaming_3",
      title: "Grand Theft Auto V PC Gameplay Walkthrough",
      description: "GTA 5 mission 12."
    };
    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [{ text: "Get in the car and drive to the safehouse.", start: 0, end: 5 }]
        };
      }
    };

    const res = await CM.assistant.generateRecipe();
    assert.strictEqual(res.success, false);
    assert.strictEqual(CM.assistant.currentRecipe, null, "currentRecipe must be cleared");
    assert.strictEqual(recipeRendered, null, "UI rendered recipe must be cleared");

    // Attempting nextStep should fail cleanly because no recipe is active
    const nextRes = CM.assistant.nextStep();
    assert.strictEqual(nextRes.success, false);
    assert.strictEqual(nextRes.message, "No recipe is currently active. Say generate recipe first.");
  });

  // -------------------------------------------------------------
  // Test 16: A failed classifier or unavailable local API must not cause fabricated recipe output
  // -------------------------------------------------------------
  await it("Test 16: Failed classifier / internal error fails safely without fabricated recipe", async () => {
    mockVideoInfo = {
      id: "v_error_test",
      title: "Unknown Weird Video Title",
      description: "Weird description"
    };

    // Force classifyVideo to throw an unexpected exception
    const originalClassify = CM.recipeExtractor.classifyVideo;
    CM.recipeExtractor.classifyVideo = () => {
      throw new Error("Simulated classification subsystem failure");
    };

    CM.transcriptExtractor = {
      async getSegments() {
        return {
          success: true,
          segments: [{ text: "Unrelated text here", start: 0, end: 5 }]
        };
      }
    };

    try {
      const res = await CM.assistant.generateRecipe();
      assert.strictEqual(res.success, false, "Must fail safely when classifier errors");
      assert.strictEqual(CM.assistant.currentRecipe, null);
      assert.strictEqual(recipeRendered, null);
      assert.strictEqual(CM.assistant.state, "IDLE");
      assert.ok(res.message.includes("couldn't verify") || res.message.includes("cooking tutorial"));
    } finally {
      CM.recipeExtractor.classifyVideo = originalClassify;
    }
  });

  console.log(`\nResults: ${passed} passed, ${total - passed} failed of ${total} tests.`);
  if (total - passed > 0) {
    process.exit(1);
  }
}

runTests();
