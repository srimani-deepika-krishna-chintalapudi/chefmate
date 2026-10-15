global.window = { ChefMate: {} };
require('../extension/command-parser.js');
const parser = global.window.ChefMate.commandParser;

const tests = [
  ['generate recipe',           'IDLE',                          'GENERATE_RECIPE'],
  ['start the recipe',          'IDLE',                          'START_COOKING'],
  ['start speaking the recipe', 'IDLE',                          'START_COOKING'],
  ['begin cooking',             'IDLE',                          'START_COOKING'],
  ['first step',                'IDLE',                          'GOTO_FIRST_STEP'],
  ['pause the video',           'IDLE',                          'PAUSE'],
  ['yes',                       'AWAITING_INGREDIENT_PREFERENCE','CONFIRM_INGREDIENTS'],
  ['tell me the ingredients',   'AWAITING_INGREDIENT_PREFERENCE','CONFIRM_INGREDIENTS'],
  ['no',                        'AWAITING_INGREDIENT_PREFERENCE','SKIP_INGREDIENTS'],
  ['start the recipe',          'AWAITING_INGREDIENT_PREFERENCE','SKIP_INGREDIENTS'],
  ['start cooking',             'AWAITING_INGREDIENT_PREFERENCE','SKIP_INGREDIENTS'],
  ['first step',                'AWAITING_INGREDIENT_PREFERENCE','SKIP_INGREDIENTS'],
  ['yes',                       'AWAITING_START_CONFIRMATION',   'START_COOKING'],
  ['start cooking',             'AWAITING_START_CONFIRMATION',   'START_COOKING'],
  ['start the recipe',          'AWAITING_START_CONFIRMATION',   'START_COOKING'],
  ['next',                      'COOKING',                       'NEXT_RECIPE_STEP'],
  ['go ahead',                  'COOKING',                       'NEXT_RECIPE_STEP'],
  ['proceed',                   'COOKING',                       'NEXT_RECIPE_STEP'],
  ['continue',                  'COOKING',                       'NEXT_RECIPE_STEP'],
  ['what s next',               'COOKING',                       'NEXT_RECIPE_STEP'],
  ['again',                     'COOKING',                       'REPEAT_RECIPE_STEP'],
  ['again please',              'COOKING',                       'REPEAT_RECIPE_STEP'],
  ['previous',                  'COOKING',                       'PREVIOUS_RECIPE_STEP'],
  ['go back',                   'COOKING',                       'PREVIOUS_RECIPE_STEP'],
];

(async () => {
  let pass = 0, fail = 0;
  for (const [phrase, state, expected] of tests) {
    global.window.ChefMate.assistant = { state };
    const result = await parser.parse(phrase);
    const ok = result.intent === expected;
    if (ok) {
      pass++;
    } else {
      fail++;
      console.log('FAIL', JSON.stringify(phrase), 'state=' + state, '->', result.intent, '(expected ' + expected + ')');
    }
  }
  console.log('\n' + pass + '/' + tests.length + ' passed, ' + fail + ' failed');
})();
