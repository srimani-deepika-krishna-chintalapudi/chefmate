(() => {
  const CM = (typeof window !== "undefined" ? (window.ChefMate = window.ChefMate || {}) : {});

  // Known prerequisite trigger phrases (distinguishing active preparation actions from ingredient adjectives like "thawed shrimp" or "soaked beans")
  const overnightRegex = /\b(?:overnight|the night before|the previous day|previous night|until tomorrow|next morning)\b/i;
  const soakRegex = /\b(?:soak|soaking|must be soaked|needs? to be soaked)\b/i;
  const marinateRegex = /\b(?:marinate|marinating|let (?:it )?marinate|leave in marinade)\b/i;
  const fermentRegex = /\b(?:ferment|fermenting|allow to ferment|let ferment)\b/i;
  const proofRegex = /\b(?:proof|proofing|let (?:the )?dough rise|rise for)\b/i;
  const chillRegex = /\b(?:chill|chilling|refrigerate|refrigerating|freeze|freezing)\b/i;
  const thawRegex = /\b(?:thaw|thawing|defrost|defrosting|must be thawed|needs? to be thawed)\b/i;
  const advanceRegex = /\b(?:in advance|ahead of time|before cooking|before starting|prior to cooking|first soak|first marinate)\b/i;

  // Immediate cooking verbs that indicate active execution step rather than an advance prerequisite
  const immediateCookingVerbs = /^(?:saute|sauté|fry|deep fry|shallow fry|sear|heat|preheat|bake|roast|boil|simmer|cook|grill|stir|whisk|add|pour|toss|serve|garnish|plate)\b/i;

  // Exact duration parser
  // Matches "2 hours", "30 minutes", "8 to 12 hours", "8-10 hours", "45 mins"
  const durationRegex = /\b(?:for\s+)?(\d+(?:\.\d+)?|\d+\s*(?:to|-)\s*\d+)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?|days?)\b/i;

  const numberWordMap = {
    half: 0.5,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    twelve: 12,
    twenty: 20,
    twentyfour: 24,
    "twenty-four": 24
  };

  function parseDurationString(text) {
    if (!text || typeof text !== "string") return null;

    // 1. Explicit overnight
    if (overnightRegex.test(text)) {
      return {
        duration_text: "overnight",
        duration_seconds: null, // Critical: do NOT fabricate 8 hours
        is_overnight: true,
        exact: true
      };
    }

    // 2. Numeric match (e.g. "for 2 hours", "30 minutes", "8 to 12 hours")
    const match = text.match(durationRegex);
    if (match) {
      const rawVal = match[1].trim();
      const rawUnit = match[2].toLowerCase().trim();
      let seconds = null;

      // Handle ranges like "8 to 12" or single "2"
      let num = parseFloat(rawVal);
      if (rawVal.includes("to") || rawVal.includes("-")) {
        const parts = rawVal.split(/\s*(?:to|-)\s*/).map(p => parseFloat(p)).filter(n => !isNaN(n));
        if (parts.length >= 2) {
          num = (parts[0] + parts[1]) / 2; // mean for duration_seconds calculation
        }
      }

      if (!isNaN(num)) {
        if (/hours?|hrs?/i.test(rawUnit)) {
          seconds = Math.round(num * 3600);
        } else if (/minutes?|mins?/i.test(rawUnit)) {
          seconds = Math.round(num * 60);
        } else if (/seconds?|secs?/i.test(rawUnit)) {
          seconds = Math.round(num);
        } else if (/days?/i.test(rawUnit)) {
          seconds = Math.round(num * 86400);
        }
      }

      return {
        duration_text: `${rawVal} ${rawUnit}`,
        duration_seconds: seconds,
        is_overnight: false,
        exact: true
      };
    }

    // 3. Word numbers (e.g. "for two hours", "half an hour")
    const wordMatch = text.match(/\b(?:for\s+)?(half|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(hours?|hrs?|minutes?|mins?)\b/i);
    if (wordMatch) {
      const wVal = numberWordMap[wordMatch[1].toLowerCase()] || 1;
      const wUnit = wordMatch[2].toLowerCase();
      const seconds = /hours?|hrs?/i.test(wUnit) ? Math.round(wVal * 3600) : Math.round(wVal * 60);
      return {
        duration_text: `${wordMatch[1]} ${wUnit}`,
        duration_seconds: seconds,
        is_overnight: false,
        exact: true
      };
    }

    // 4. Vague duration / until condition (e.g. "until soft", "let rest", "until doubled in size")
    const untilMatch = text.match(/\b(?:until|till)\s+([a-z\s]+?)(?=[.,;]|$)/i);
    if (untilMatch) {
      return {
        duration_text: `until ${untilMatch[1].trim()}`,
        duration_seconds: null,
        is_overnight: false,
        exact: false
      };
    }

    return null;
  }

  // Detect whether an instruction is an advance prerequisite
  function detectPrerequisite(instruction = "") {
    if (!instruction || typeof instruction !== "string") {
      return { is_prerequisite: false };
    }

    const clean = instruction.trim();

    // If step begins with an immediate cooking action and does not have advance phrases, it's a cooking step (e.g. "Sauté the thawed shrimp")
    if (immediateCookingVerbs.test(clean) && !advanceRegex.test(clean) && !overnightRegex.test(clean)) {
      return {
        is_prerequisite: false,
        prerequisite_type: null,
        duration_info: parseDurationString(clean),
        duration_text: "unspecified",
        duration_seconds: null,
        is_overnight: false
      };
    }
    const durInfo = parseDurationString(clean);

    let prerequisiteType = null;
    let isPrerequisite = false;

    // Check specific prerequisite categories
    if (soakRegex.test(clean)) {
      prerequisiteType = "SOAKING";
      isPrerequisite = true;
    } else if (marinateRegex.test(clean)) {
      prerequisiteType = "MARINATING";
      // Immediate quick marinade vs long prerequisite
      if (durInfo?.is_overnight || (durInfo?.duration_seconds && durInfo.duration_seconds >= 1800) || advanceRegex.test(clean)) {
        isPrerequisite = true;
      } else {
        // Even if duration is unspecified, if marinating is mentioned with advance keywords or overnight
        isPrerequisite = true;
      }
    } else if (fermentRegex.test(clean)) {
      prerequisiteType = "FERMENTING";
      isPrerequisite = true;
    } else if (proofRegex.test(clean)) {
      prerequisiteType = "PROOFING";
      if (durInfo?.duration_seconds && durInfo.duration_seconds >= 1800 || durInfo?.is_overnight || advanceRegex.test(clean)) {
        isPrerequisite = true;
      }
    } else if (thawRegex.test(clean)) {
      prerequisiteType = "THAWING";
      isPrerequisite = true;
    } else if (chillRegex.test(clean) && (durInfo?.is_overnight || (durInfo?.duration_seconds && durInfo.duration_seconds >= 3600) || advanceRegex.test(clean))) {
      prerequisiteType = "CHILLING";
      isPrerequisite = true;
    } else if (advanceRegex.test(clean) && (durInfo || overnightRegex.test(clean))) {
      prerequisiteType = "PREPARATION";
      isPrerequisite = true;
    }

    // Do not assume every short "rest" is a long prerequisite
    if (!isPrerequisite && /\b(?:let (?:it )?rest|leave (?:it )?(?:to )?rest)\b/i.test(clean)) {
      if (durInfo?.is_overnight || (durInfo?.duration_seconds && durInfo.duration_seconds >= 3600)) {
        prerequisiteType = "RESTING";
        isPrerequisite = true;
      }
    }

    return {
      is_prerequisite: isPrerequisite,
      prerequisite_type: prerequisiteType,
      duration_info: durInfo,
      duration_text: durInfo ? durInfo.duration_text : "unspecified",
      duration_seconds: durInfo ? durInfo.duration_seconds : null,
      is_overnight: Boolean(durInfo?.is_overnight)
    };
  }

  // Extract ingredients mentioned in a step text
  function extractStepIngredients(text = "", allIngredients = []) {
    const mentioned = [];
    const lower = text.toLowerCase();

    for (const ing of allIngredients) {
      const ingName = (ing.name || "").toLowerCase().trim();
      if (!ingName) continue;
      // Match whole word
      const escaped = ingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}s?\\b`, "i").test(lower)) {
        mentioned.push(ing);
      }
    }
    return mentioned;
  }

  // Build a dependency graph and logical execution plan
  function buildDependencyAwarePlan(steps = [], ingredients = []) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return {
        orderedSteps: [],
        prerequisites: [],
        mainSteps: [],
        prerequisiteNotice: null,
        hasPrerequisites: false
      };
    }

    // 1. Analyze each step and enrich with dependency and timing metadata
    const analyzedSteps = steps.map((step, originalIndex) => {
      const instruction = step.instruction || "";
      const prereqInfo = detectPrerequisite(instruction);
      const stepIngredients = extractStepIngredients(instruction, ingredients);

      const stepId = step.id || `step_${originalIndex + 1}`;
      const videoTimestamp = typeof step.start_seconds === "number" ? step.start_seconds : null;

      return {
        ...step,
        id: stepId,
        original_step_number: originalIndex + 1,
        video_timestamp: videoTimestamp,
        is_prerequisite: prereqInfo.is_prerequisite,
        prerequisite_type: prereqInfo.prerequisite_type,
        duration_text: prereqInfo.duration_text || (step.duration_seconds ? `${Math.round(step.duration_seconds / 60)} minutes` : "unspecified"),
        duration_seconds: prereqInfo.duration_seconds !== null ? prereqInfo.duration_seconds : step.duration_seconds || null,
        is_overnight: prereqInfo.is_overnight,
        step_ingredients: stepIngredients,
        required_prior_steps: [],
        parallel_with: [],
        can_parallel: false
      };
    });

    // 2. Separate steps into prerequisites vs regular
    const prereqSteps = [];
    const regularSteps = [];

    for (const step of analyzedSteps) {
      if (step.is_prerequisite) {
        prereqSteps.push(step);
      } else {
        regularSteps.push(step);
      }
    }

    // Check if any regular step is actually a preparation dependency for a prerequisite
    // e.g. "Prepare the marinade with spices and yogurt" followed by "Marinate chicken in the mixture for 2 hours"
    // The marinade preparation should be ordered before the marinating prerequisite!
    const advancePrepSteps = [];
    for (let i = 0; i < regularSteps.length; i++) {
      const regStep = regularSteps[i];
      const regLower = regStep.instruction.toLowerCase();
      const isPrepForPrereq = prereqSteps.some(pr => {
        const prLower = pr.instruction.toLowerCase();
        if (/\b(?:marinade|spice mix|batter|dough|brine)\b/i.test(regLower)) {
          if (prLower.includes("marinade") && regLower.includes("marinade")) return true;
          if (prLower.includes("dough") && regLower.includes("dough")) return true;
          if (prLower.includes("batter") && regLower.includes("batter")) return true;
        }
        return false;
      });

      if (isPrepForPrereq && (regStep.original_step_number < (prereqSteps[0]?.original_step_number || Infinity))) {
        advancePrepSteps.push(regStep);
      }
    }

    // Filter out advancePrepSteps from regularSteps to avoid duplicates
    const mainCookingSteps = regularSteps.filter(s => !advancePrepSteps.includes(s));

    // 3. Link dependencies between prerequisites and main cooking steps
    prereqSteps.forEach(prereq => {
      // Find main cooking steps that operate on the same ingredients
      const prereqIngNames = prereq.step_ingredients.map(i => i.name.toLowerCase());
      mainCookingSteps.forEach(mainStep => {
        const mainIngNames = mainStep.step_ingredients.map(i => i.name.toLowerCase());
        const sharesIngredient = prereqIngNames.some(name => mainIngNames.includes(name));

        // Also check keywords (e.g. "chickpeas" or "chicken" directly in text)
        const keywordMatch = prereqIngNames.some(name => new RegExp(`\\b${name}\\b`, "i").test(mainStep.instruction));

        if (sharesIngredient || keywordMatch) {
          if (!mainStep.required_prior_steps.includes(prereq.id)) {
            mainStep.required_prior_steps.push(prereq.id);
          }
        }
      });
    });

    // 4. Identify Parallel Preparation opportunities
    // Steps during a long cook or resting period that use different ingredients and equipment
    mainCookingSteps.forEach((step, idx) => {
      const isLongOperation = (step.duration_seconds && step.duration_seconds >= 600) ||
        /\b(?:simmer|bake|roast|boil|slow cook)\b/i.test(step.instruction);

      if (isLongOperation && idx + 1 < mainCookingSteps.length) {
        const nextStep = mainCookingSteps[idx + 1];
        const isPrepAction = /\b(?:chop|dice|slice|prepare|mix|whisk|measure)\b/i.test(nextStep.instruction);
        const sharesEquipment = step.equipment && nextStep.equipment &&
          step.equipment.some(eq => nextStep.equipment.includes(eq));

        if (isPrepAction && !sharesEquipment && !nextStep.required_prior_steps.includes(step.id)) {
          step.can_parallel = true;
          step.parallel_with.push(nextStep.id);
          nextStep.can_parallel = true;
          nextStep.parallel_with.push(step.id);
        }
      }
    });

    // 5. Build Combined Ordered Execution Plan
    // Execution Order:
    // [Advance Prep Steps] -> [Prerequisites] -> [Main Cooking Steps]
    const finalOrdered = [...advancePrepSteps, ...prereqSteps, ...mainCookingSteps];

    // Re-index execution step numbers while strictly preserving original video timestamps
    const finalSteps = finalOrdered.map((step, idx) => {
      return {
        ...step,
        step_number: idx + 1, // Execution order
        start_seconds: step.video_timestamp, // Preserves original video position for seeking
        execution_order: idx + 1
      };
    });

    // 6. Generate Voice Preparation Notice if prerequisites exist
    let prerequisiteNotice = null;
    if (prereqSteps.length > 0) {
      const firstPrereq = prereqSteps[0];
      const durText = firstPrereq.duration_text && firstPrereq.duration_text !== "unspecified"
        ? firstPrereq.duration_text
        : (firstPrereq.is_overnight ? "overnight" : "in advance");

      if (firstPrereq.prerequisite_type === "SOAKING") {
        const ing = firstPrereq.step_ingredients[0]?.name || "ingredients";
        prerequisiteNotice = `Before we begin, the ${ing} need to soak ${durText}. Complete this preparation first, then return when they are ready for cooking.`;
      } else if (firstPrereq.prerequisite_type === "MARINATING") {
        const ing = firstPrereq.step_ingredients[0]?.name || "meat";
        prerequisiteNotice = `First, marinate the ${ing} for ${durText}. Once the marination is complete, we can continue with the main cooking steps.`;
      } else if (firstPrereq.prerequisite_type === "PROOFING") {
        prerequisiteNotice = `Before cooking, the dough needs to proof for ${durText}. Once risen, we can proceed with cooking.`;
      } else if (firstPrereq.prerequisite_type === "CHILLING") {
        prerequisiteNotice = `Notice: this recipe requires chilling for ${durText} before cooking.`;
      } else {
        prerequisiteNotice = `Before we begin, there is advance preparation needed: ${firstPrereq.instruction}.`;
      }
    }

    return {
      orderedSteps: finalSteps,
      prerequisites: prereqSteps,
      mainSteps: mainCookingSteps,
      prerequisiteNotice,
      hasPrerequisites: prereqSteps.length > 0
    };
  }

  const recipePlanner = {
    parseDurationString,
    detectPrerequisite,
    buildDependencyAwarePlan
  };

  CM.recipePlanner = recipePlanner;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = recipePlanner;
  }
})();
