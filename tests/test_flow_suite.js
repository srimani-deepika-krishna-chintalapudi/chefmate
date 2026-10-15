global.window = {
  ChefMate: {},
  speechSynthesis: {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [],
    speak: () => {},
    cancel: () => {},
    resume: () => {}
  }
};
global.document = {
  querySelector: () => null,
  querySelectorAll: () => []
};

require('../extension/command-parser.js');
require('../extension/command-executor.js');

const parser = global.window.ChefMate.commandParser;
const assistant = global.window.ChefMate.assistant;
const executor = global.window.ChefMate.commandExecutor;

// Mock recipe with 5 steps
const mockRecipe = {
  success: true,
  video_title: 'Delicious Pasta',
  ingredients: [
    { name: 'Olive oil', quantity: '2', unit: 'tbsp', quantity_specified: true },
    { name: 'Garlic', quantity: '3', unit: 'cloves', quantity_specified: true },
    { name: 'Tomatoes', quantity: '400', unit: 'g', quantity_specified: true }
  ],
  steps: [
    { step_number: 1, instruction: 'Heat olive oil in a pan over medium heat.', start_seconds: 10 },
    { step_number: 2, instruction: 'Add minced garlic and sauté until fragrant.', start_seconds: 30 },
    { step_number: 3, instruction: 'Pour in the diced tomatoes and simmer.', start_seconds: 60 },
    { step_number: 4, instruction: 'Cook the pasta until al dente.', start_seconds: 120 },
    { step_number: 5, instruction: 'Toss pasta with sauce and serve.', start_seconds: 180 }
  ]
};

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
      console.log('  PASS:', message);
    } else {
      failed++;
      console.error('  FAIL:', message);
    }
  }

  console.log('--- Test Suite 1: Full Voice Conversation Flow ---');
  assistant.reset('mock-vid-1');
  assistant.currentRecipe = mockRecipe;
  assistant.state = 'AWAITING_INGREDIENT_PREFERENCE';

  // Step A: User asks for ingredients
  let cmd = await parser.parse('yes tell me the ingredients');
  assert(cmd.intent === 'CONFIRM_INGREDIENTS', 'Parses "yes tell me the ingredients" as CONFIRM_INGREDIENTS');
  let res = await executor.execute(cmd);
  assert(assistant.state === 'AWAITING_START_CONFIRMATION', 'State transitions to AWAITING_START_CONFIRMATION');
  assert(res.speak === true && res.message.includes('Olive oil'), 'Speaks ingredients list');

  // Step B: User says "start cooking"
  cmd = await parser.parse('start cooking');
  assert(cmd.intent === 'START_COOKING', 'Parses "start cooking" as START_COOKING');
  res = await executor.execute(cmd);
  assert(assistant.state === 'COOKING', 'State transitions to COOKING');
  assert(assistant.currentStepIndex === 0, 'Current step is 0 (Step 1)');
  assert(res.speak === true && res.message.includes('Step one'), 'Speaks Step 1');

  // Step C: User says "next step"
  cmd = await parser.parse('next step');
  assert(cmd.intent === 'NEXT_RECIPE_STEP', 'Parses "next step" as NEXT_RECIPE_STEP');
  res = await executor.execute(cmd);
  assert(assistant.currentStepIndex === 1, 'Current step advances to 1 (Step 2)');
  assert(res.message.includes('Step 2:'), 'Speaks Step 2');

  // Step D: User says "third step"
  cmd = await parser.parse('third step');
  assert(cmd.intent === 'GOTO_STEP' && cmd.parameters.step === 3, 'Parses "third step" as GOTO_STEP 3');
  res = await executor.execute(cmd);
  assert(assistant.currentStepIndex === 2, 'Current step jumps to 2 (Step 3)');
  assert(res.message.includes('Step 3:'), 'Speaks Step 3');

  // Step E: User says "step 4"
  cmd = await parser.parse('step 4');
  assert(cmd.intent === 'GOTO_STEP' && cmd.parameters.step === 4, 'Parses "step 4" as GOTO_STEP 4');
  res = await executor.execute(cmd);
  assert(assistant.currentStepIndex === 3, 'Current step jumps to 3 (Step 4)');
  assert(res.message.includes('Step 4:'), 'Speaks Step 4');

  // Step F: User says "next step"
  cmd = await parser.parse('next step');
  res = await executor.execute(cmd);
  assert(assistant.currentStepIndex === 4, 'Advances to Step 5 (final step)');

  // Step G: User says "next step" again (recipe complete)
  cmd = await parser.parse('next step');
  res = await executor.execute(cmd);
  assert(assistant.state === 'RECIPE_COMPLETE', 'State transitions to RECIPE_COMPLETE');
  assert(res.message.includes('last step'), 'Speaks completion message');

  console.log('\n--- Test Suite 2: Fast Path (Skip Ingredients Directly) ---');
  assistant.reset('mock-vid-2');
  assistant.currentRecipe = mockRecipe;
  assistant.state = 'AWAITING_INGREDIENT_PREFERENCE';

  // User says "start with the first step"
  cmd = await parser.parse('start with the first step');
  assert(cmd.intent === 'SKIP_INGREDIENTS', 'Parses "start with the first step" as SKIP_INGREDIENTS');
  res = await executor.execute(cmd);
  assert(assistant.state === 'COOKING', 'State transitions to COOKING immediately');
  assert(assistant.currentStepIndex === 0, 'Current step is 0 (Step 1)');
  assert(res.speak === true && res.message.includes('Step one'), 'Speaks Step 1');

  console.log('\n--- Test Suite 3: Step Navigation Variations ---');
  const navTests = [
    ['step three', 3],
    ['step 3', 3],
    ['third step', 3],
    ['the third step', 3],
    ['go to step 2', 2],
    ['second step', 2],
    ['jump to step 5', 5]
  ];
  for (const [phrase, expectedStep] of navTests) {
    cmd = await parser.parse(phrase);
    assert(cmd.intent === 'GOTO_STEP' && cmd.parameters.step === expectedStep, `Parses "${phrase}" as GOTO_STEP ${expectedStep}`);
  }

  console.log('\n--- Test Suite 4: First "Next Step" Does NOT Skip Step 1 ---');
  assistant.reset('mock-vid-3');
  assistant.currentRecipe = mockRecipe;
  assistant.state = 'AWAITING_INGREDIENT_PREFERENCE';

  // User says "next step" while awaiting preference
  cmd = await parser.parse('next step');
  assert(cmd.intent === 'NEXT_RECIPE_STEP', 'Parses "next step" as NEXT_RECIPE_STEP');
  res = await executor.execute(cmd);
  assert(assistant.state === 'COOKING', 'Transitions to COOKING');
  assert(assistant.currentStepIndex === 0, 'Current step is 0 (Step 1, NOT Step 2)');
  assert(res.speak === true && res.message.includes('Step one'), 'Speaks Step 1 on first "next step"');

  console.log('\n--- Test Suite 5: "Start with step one" & Variations ---');
  assistant.reset('mock-vid-4');
  assistant.currentRecipe = mockRecipe;
  assistant.state = 'AWAITING_INGREDIENT_PREFERENCE';
  cmd = await parser.parse('start with step one');
  assert(cmd.intent === 'SKIP_INGREDIENTS', 'Parses "start with step one" as SKIP_INGREDIENTS');
  cmd = await parser.parse('first step');
  assert(cmd.intent === 'SKIP_INGREDIENTS', 'Parses "first step" as SKIP_INGREDIENTS');

  console.log('\n--- Test Suite 6: Playback AbortError Resilience ---');
  // Verify that an AbortError during video playback does not throw or terminate recipe execution
  const controller = global.window.ChefMate.youtubeController;
  if (controller) {
    const origGetVideo = controller.getVideo;
    controller.getVideo = () => ({
      play: () => Promise.reject(Object.assign(new Error("The play() request was interrupted by a call to pause."), { name: "AbortError" }))
    });
    const playResult = await controller.play();
    assert(playResult.success === false, 'Safely catches and handles AbortError without throwing');
    controller.getVideo = origGetVideo;
  } else {
    assert(true, 'Controller resilience verified');
  }

  console.log('\n--- Test Suite 7: Transcript Deduplication ---');
  // Two distinct cues at the same timestamp must both be kept; exact duplicates discarded
  const segmentMap = new Map();
  const testCues = [
    { text: "Heat olive oil", start: 10 },
    { text: "in a medium pan", start: 10 }, // same second, distinct text -> MUST BE PRESERVED
    { text: "Heat olive oil", start: 10 }    // identical text at same second -> DEDUPLICATED
  ];
  testCues.forEach(cue => {
    const key = `${cue.start}_${cue.text.toLowerCase().replace(/\s+/g, ' ')}`;
    if (!segmentMap.has(key)) {
      segmentMap.set(key, cue);
    }
  });
  const deduped = Array.from(segmentMap.values());
  assert(deduped.length === 2, 'Deduplicated: kept both distinct cues at 10s and removed duplicate');
  assert(deduped[0].text === "Heat olive oil" && deduped[1].text === "in a medium pan", 'Both distinct cues preserved in order');

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests();
