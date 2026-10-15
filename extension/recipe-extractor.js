(() => {
  const CM = (typeof window !== "undefined" ? (window.ChefMate = window.ChefMate || {}) : {});

  const cleanText = text =>
    String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, "")
      .trim();

  // Unit normalization mapping
  const unitMap = {
    tbsp: "tablespoon",
    tbs: "tablespoon",
    tablespoon: "tablespoon",
    tablespoons: "tablespoon",
    tsp: "teaspoon",
    teaspoon: "teaspoon",
    teaspoons: "teaspoon",
    cup: "cup",
    cups: "cup",
    c: "cup",
    g: "gram",
    gram: "gram",
    grams: "gram",
    gm: "gram",
    gms: "gram",
    kg: "kg",
    kilogram: "kg",
    kilograms: "kg",
    ml: "ml",
    milliliter: "ml",
    milliliters: "ml",
    l: "liter",
    liter: "liter",
    liters: "liter",
    oz: "ounce",
    ounce: "ounce",
    ounces: "ounce",
    lb: "pound",
    lbs: "pound",
    pound: "pound",
    pounds: "pound",
    clove: "clove",
    cloves: "clove",
    slice: "slice",
    slices: "slice",
    piece: "piece",
    pieces: "piece",
    pinch: "pinch",
    pinches: "pinch",
    can: "can",
    cans: "can",
    bunch: "bunch",
    bunches: "bunch",
    stalk: "stalk",
    stalks: "stalk",
    sprig: "sprig",
    sprigs: "sprig"
  };

  const wordNumbers = {
    half: "1/2",
    quarter: "1/4",
    a: "1",
    an: "1",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10"
  };

  const unicodeFractions = {
    "½": "1/2",
    "¼": "1/4",
    "¾": "3/4",
    "⅓": "1/3",
    "⅔": "2/3",
    "⅛": "1/8"
  };

  // Expanded culinary dictionary including meats, produce, dairy, grains, condiments
  const knownIngredients = [
    "egg", "eggs", "milk", "butter", "cheese", "ham", "bacon", "turkey", "sausage",
    "flour", "sugar", "salt", "pepper", "olive oil", "vegetable oil", "oil", "garlic",
    "onion", "onions", "tomato", "tomatoes", "potato", "potatoes", "chicken",
    "chicken breast", "chicken broth", "beef", "pork", "rice", "pasta", "water",
    "cream", "heavy cream", "sour cream", "yogurt", "lemon", "lemon juice", "lime",
    "lime juice", "ginger", "carrot", "carrots", "bell pepper", "peppers", "chili",
    "chili powder", "cumin", "coriander", "turmeric", "paprika", "oregano", "basil",
    "parsley", "cilantro", "thyme", "rosemary", "cinnamon", "vanilla", "vanilla extract",
    "baking powder", "baking soda", "yeast", "honey", "maple syrup", "soy sauce",
    "vinegar", "mustard", "mayonnaise", "bread", "bread crumbs", "parmesan", "mozzarella",
    "cheddar", "paneer", "tofu", "spinach", "mushrooms", "mushroom", "peas", "corn",
    "beans", "black beans", "shrimp", "salmon", "tuna", "fish", "avocado", "almonds",
    "walnuts", "cashews", "sesame seeds", "oats", "chocolate", "cocoa powder", "cocoa"
  ].sort((a, b) => b.length - a.length);

  // Practical conservative suggestions for unspecified ingredients
  const practicalQuantitySuggestions = {
    cheese: "about 20 to 30 grams (or 1/4 cup shredded) per serving",
    ham: "2 to 3 slices (about 50 grams)",
    bacon: "2 to 3 strips",
    milk: "about 1/4 to 1/2 cup",
    butter: "about 1 to 2 tablespoons",
    egg: "2 to 3 eggs for a standard meal",
    eggs: "2 to 3 eggs for a standard meal",
    salt: "about 1/4 to 1/2 teaspoon, or to taste",
    pepper: "about 1/4 teaspoon, or to taste",
    oil: "about 1 to 2 tablespoons for frying or sautéing",
    "olive oil": "about 1 to 2 tablespoons",
    garlic: "1 to 2 cloves, minced",
    onion: "half a medium onion, chopped",
    flour: "about 1 cup for baking, or 1 tablespoon as a thickener",
    sugar: "1 to 2 tablespoons, or to taste",
    "soy sauce": "about 1 tablespoon",
    water: "about 1/2 cup, added gradually"
  };

  // Known equipment and utensil patterns
  const equipmentKeywords = [
    "whisk", "tongs", "pair of tongs", "frying pan", "pan", "skillet", "pot", "saucepan",
    "wok", "knife", "cutting board", "chopping board", "board", "mixing bowl", "bowl",
    "spatula", "baking sheet", "baking dish", "tray", "parchment paper", "aluminum foil",
    "foil", "blender", "food processor", "strainer", "colander", "measuring cup",
    "measuring spoon", "grater", "peeler", "thermometer", "kitchen scale", "scale",
    "rolling pin", "ladle", "basting brush"
  ].sort((a, b) => b.length - a.length);

  const equipmentActionRegex =
    /^(?:take out|get|grab|bring|prepare|set out|arrange|place|put|lay out|need|use)\s+(?:a|an|the|your|some|pair of)?\s*(whisk|tongs|pair of tongs|frying pan|pan|skillet|pot|saucepan|wok|knife|cutting board|chopping board|mixing bowl|bowl|spatula|baking sheet|blender|strainer|grater|peeler|measuring cup|measuring spoon)/i;

  const commentaryPatterns = [
    /welcome back to/i,
    /subscribe to (my|our) channel/i,
    /don'?t forget to (like|subscribe|comment)/i,
    /hit the (bell|like) button/i,
    /link in the description/i,
    /sponsored by/i,
    /follow (me|us) on/i,
    /thanks for watching/i,
    /check out (my|our) website/i,
    /leave a comment/i,
    /let me know in the comments/i,
    /see you next time/i
  ];

  const actionVerbsPattern =
    /\b(add|pour|mix|whisk|stir|cook|heat|boil|fry|deep fry|saute|bake|roast|grill|chop|dice|slice|cut|mince|peel|season|sprinkle|spread|preheat|knead|roll|fold|drain|marinate|coat|flip|cool|serve|garnish|set aside|transfer|blend|melt|squeeze|braise|assemble|layer|press|microwave|refrigerate|toast|crack|beat|simmer|combine|remove|take off the heat)\b/i;

  function parseQuantity(raw) {
    if (!raw) return { quantity: null, unit: null, rawUnit: null, specified: false };
    let text = raw.trim();

    for (const [uni, frac] of Object.entries(unicodeFractions)) {
      text = text.replace(new RegExp(uni, "g"), ` ${frac} `);
    }

    const words = text.split(/\s+/);
    if (words.length > 0 && wordNumbers[words[0].toLowerCase()]) {
      words[0] = wordNumbers[words[0].toLowerCase()];
      text = words.join(" ");
    }

    const numMatch = text.match(/^(\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?)/);
    let quantity = null;
    let remainder = text;

    if (numMatch) {
      quantity = numMatch[1].trim();
      remainder = text.slice(numMatch[0].length).trim();
    } else if (/^(a pinch|a dash)\b/i.test(text)) {
      quantity = "1";
      unit = "pinch";
      remainder = text.replace(/^(a pinch of|a pinch|a dash of|a dash)\s*/i, "");
    }

    let unit = null;
    let rawUnit = null;
    const unitMatch = remainder.match(/^([a-zA-Z]+)\b/);
    if (unitMatch) {
      const candidate = unitMatch[1].toLowerCase();
      if (unitMap[candidate]) {
        rawUnit = unitMatch[1];
        unit = unitMap[candidate];
        remainder = remainder.slice(unitMatch[0].length).trim();
      }
    }

    return {
      quantity: quantity || null,
      unit: unit || null,
      rawUnit: rawUnit || null,
      specified: Boolean(quantity)
    };
  }

  function extractDuration(text) {
    const match = text.match(/(?:for|about)\s+(\d+(?:\.\d+)?(?:\s*-\s*\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i);
    if (!match) return null;

    const numStr = match[1].split("-")[0].trim();
    const num = parseFloat(numStr);
    const unit = match[2].toLowerCase();

    if (unit.startsWith("sec")) return Math.round(num);
    if (unit.startsWith("min")) return Math.round(num * 60);
    if (unit.startsWith("hour") || unit.startsWith("hr")) return Math.round(num * 3600);
    return null;
  }

  function extractTemperature(text) {
    const tempMatch = text.match(/(\d{2,3})\s*(?:degrees?\s*(?:[fF]|[cC]|fahrenheit|celsius)?|°\s*[fFcC]?)/i);
    if (tempMatch) return tempMatch[0].trim();

    const heatMatch = text.match(/\b(low|medium-low|medium|medium-high|high)\s+(?:heat|flame)\b/i);
    if (heatMatch) return heatMatch[0].trim();

    return null;
  }

  function extractDoneness(text) {
    const match = text.match(/\buntil\s+([a-zA-Z\s]{4,30})(?:[.,;]|$)/i);
    if (match) {
      const cue = cleanText(match[1]);
      if (cue.length < 35 && !/you|we|it'?s/i.test(cue)) {
        return `until ${cue}`;
      }
    }
    return null;
  }

  function formatTimestamp(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  // --- Classification: Equipment vs Cooking Action ---
  function classifyEquipmentMention(text) {
    const cleaned = cleanText(text).toLowerCase();

    // If it contains active cooking verbs on ingredients, it is not purely equipment prep
    if (/\b(?:heat|hot|fire|stove|cook|fry|bake|boil|pour|crack)\b/i.test(cleaned) ||
        /whisk\s+(the|three|some|your|all)\s+(egg|eggs|mixture|batter)/i.test(cleaned)) {
      return null;
    }

    const foundEquipment = [];
    // Split by comma or 'and' to examine individual clauses
    const clauses = cleaned.split(/[,;]|\s+and\s+/);

    for (const clause of clauses) {
      const c = cleanText(clause);
      if (!c) continue;

      const match = c.match(equipmentActionRegex);
      if (match) {
        const rawEq = match[1].toLowerCase().replace(/^a\s+|^pair of\s+/i, "");
        const formatted = rawEq.charAt(0).toUpperCase() + rawEq.slice(1);
        if (!foundEquipment.includes(formatted)) {
          foundEquipment.push(formatted);
        }
      } else if (/place\s+(?:a|the)?\s*(chopping board|cutting board|mixing bowl|bowl)\s+(?:on the counter|on the table|aside)/i.test(c)) {
        const eqMatch = c.match(/(chopping board|cutting board|mixing bowl|bowl)/i);
        if (eqMatch) {
          const formatted = eqMatch[1].charAt(0).toUpperCase() + eqMatch[1].slice(1);
          if (!foundEquipment.includes(formatted)) {
            foundEquipment.push(formatted);
          }
        }
      }
    }

    return foundEquipment.length > 0 ? foundEquipment : null;
  }

  // --- Description Parsing ---
  function parseDescriptionIngredients(description) {
    if (!description) return [];
    const lines = description.split("\n");
    const ingredients = [];
    let inIngredientSection = false;

    const sectionHeader = /^(ingredients|what you('ll| will) need|grocery list|you will need)[:\s]*$/i;
    const sectionEnd = /^(instructions|directions|method|steps|preparation|notes|equipment|follow me|social|nutrition)[:\s]*$/i;

    for (const rawLine of lines) {
      const line = cleanText(rawLine);
      if (!line) continue;

      if (sectionHeader.test(line)) {
        inIngredientSection = true;
        continue;
      }
      if (inIngredientSection && sectionEnd.test(line)) {
        inIngredientSection = false;
        break;
      }

      const isBullet = /^[-*•·–—]\s*/.test(line);
      const cleanedLine = line.replace(/^[-*•·–—]\s*/, "");

      if (inIngredientSection || isBullet) {
        const parsed = parseIngredientLine(cleanedLine, "description");
        if (parsed) {
          ingredients.push(parsed);
        }
      }
    }

    if (ingredients.length === 0) {
      for (const rawLine of lines) {
        const line = cleanText(rawLine).replace(/^[-*•·–—]\s*/, "");
        if (!line) continue;
        if (/^(\d+|half|one|two|three|¼|½|¾)\s+(cup|tbsp|tsp|gram|g|oz|pound|lb|clove|slice|piece)/i.test(line)) {
          const parsed = parseIngredientLine(line, "description");
          if (parsed) ingredients.push(parsed);
        }
      }
    }

    return ingredients;
  }

  function parseIngredientLine(line, source) {
    const text = cleanText(line);
    if (!text || text.length > 90 || commentaryPatterns.some(p => p.test(text))) return null;

    const parsedQty = parseQuantity(text);

    let nameCandidate = text;
    if (parsedQty.specified) {
      const qRegex = new RegExp(`^\\s*${parsedQty.quantity.replace(/\//g, "\\/")}\\s*`, "i");
      nameCandidate = nameCandidate.replace(qRegex, "");
      if (parsedQty.rawUnit) {
        const ruRegex = new RegExp(`^\\s*${parsedQty.rawUnit}s?\\b\\s*(?:of\\s+)?`, "i");
        nameCandidate = nameCandidate.replace(ruRegex, "");
      }
      if (parsedQty.unit) {
        const uRegex = new RegExp(`^\\s*${parsedQty.unit}s?\\b\\s*(?:of\\s+)?`, "i");
        nameCandidate = nameCandidate.replace(uRegex, "");
      }
    }

    nameCandidate = nameCandidate.replace(/\([^)]*\)/g, "");
    nameCandidate = nameCandidate.replace(/,\s*(chopped|diced|minced|melted|divided|to taste|softened|sliced|fresh)/gi, "");
    nameCandidate = cleanText(nameCandidate).toLowerCase();

    if (!nameCandidate || nameCandidate.length < 2) return null;

    // Filter out pure equipment lines if any in ingredient block
    if (equipmentKeywords.some(eq => nameCandidate === eq)) {
      return null;
    }

    const isKnown = knownIngredients.some(k => nameCandidate.includes(k) || k.includes(nameCandidate));
    if (!isKnown && source !== "description") return null;

    return {
      name: nameCandidate,
      quantity: parsedQty.quantity,
      unit: parsedQty.unit,
      quantity_specified: parsedQty.specified,
      sources: [source],
      confidence: parsedQty.specified ? 0.95 : 0.80
    };
  }

  // --- Transcript Ingredient Extraction ---
  function parseTranscriptIngredients(transcriptText) {
    const found = [];
    if (!transcriptText) return found;

    const sentences = transcriptText.split(/[.!?\n]+/);
    for (const sent of sentences) {
      const sentence = cleanText(sent);
      if (!sentence) continue;

      for (const ing of knownIngredients) {
        const regex = new RegExp(`\\b${ing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        const match = sentence.match(regex);
        if (!match) continue;

        // Check context before ingredient for quantities (e.g. "half a cup of", "three", "1/2 cup of")
        const before = sentence.slice(Math.max(0, match.index - 35), match.index).trim();
        const strippedBefore = before.replace(/\s+(?:of|of\s+the|of\s+a)$/i, "").trim();
        const qtyMatch = strippedBefore.match(/(?:^|[\s,])((?:\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?|half(?:\s+a)?|quarter(?:\s+a)?|one|two|three|four|five|six|seven|eight|nine|ten|a pinch|a dash)(?:\s+[a-zA-Z]+)?)$/i);

        let quantity = null;
        let unit = null;

        if (qtyMatch) {
          const rawMatch = qtyMatch[1].replace(/half\s+a\b/i, "half").replace(/quarter\s+a\b/i, "quarter").trim();
          const parsed = parseQuantity(rawMatch);
          quantity = parsed.quantity;
          unit = parsed.unit;
        }

        const normName = ing.replace(/s$/, "");
        found.push({
          name: normName,
          quantity,
          unit,
          quantity_specified: Boolean(quantity),
          sources: ["transcript"],
          confidence: quantity ? 0.88 : 0.70
        });
      }
    }

    return found;
  }

  // --- Step Extraction with Equipment Separation ---
  function extractStepsFromTranscript(segments, equipmentList, stats) {
    if (!Array.isArray(segments) || segments.length === 0) return [];
    const rawSteps = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const text = cleanText(seg.text);
      if (!text) continue;

      if (commentaryPatterns.some(p => p.test(text))) continue;

      // 1. Check if this is Equipment Preparation
      const equipmentFound = classifyEquipmentMention(text);
      if (equipmentFound && Array.isArray(equipmentFound)) {
        equipmentFound.forEach(eq => {
          if (!equipmentList.includes(eq)) {
            equipmentList.push(eq);
          }
        });
        if (stats) stats.rejected_equipment_count += equipmentFound.length;
        continue; // Exclude from numbered cooking steps!
      }

      // 2. Check if this is an actual cooking or ingredient action
      const hasAction = actionVerbsPattern.test(text);
      if (hasAction) {
        if (stats) stats.candidate_step_count++;
        const startSec = Number(seg.start || 0);
        const endSec = Number(seg.end || (startSec + 5));

        rawSteps.push({
          instruction: text,
          start_seconds: startSec,
          end_seconds: endSec,
          duration_seconds: extractDuration(text),
          temperature: extractTemperature(text),
          doneness_cue: extractDoneness(text),
          sources: ["transcript"],
          confidence: 0.90
        });
      }
    }

    // Merge adjacent segments within 4 seconds continuation
    const merged = [];
    for (let i = 0; i < rawSteps.length; i++) {
      const cur = rawSteps[i];
      if (merged.length > 0) {
        const prev = merged[merged.length - 1];
        if (cur.start_seconds - prev.end_seconds <= 4 && prev.instruction.length < 50 && !/[.!?]$/.test(prev.instruction)) {
          prev.instruction = `${prev.instruction} ${cur.instruction}`;
          prev.end_seconds = cur.end_seconds;
          if (!prev.duration_seconds) prev.duration_seconds = cur.duration_seconds;
          if (!prev.temperature) prev.temperature = cur.temperature;
          if (!prev.doneness_cue) prev.doneness_cue = cur.doneness_cue;
          continue;
        }
      }
      merged.push({ ...cur });
    }

    // Final clean and deduplication
    const finalSteps = [];
    const seen = new Set();

    merged.forEach((item) => {
      let inst = cleanText(item.instruction);
      inst = inst.charAt(0).toUpperCase() + inst.slice(1);
      if (!/[.!?]$/.test(inst)) inst += ".";

      const key = inst.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) {
        if (stats) stats.duplicate_step_count++;
        return;
      }
      seen.add(key);

      finalSteps.push({
        step_number: finalSteps.length + 1,
        instruction: inst,
        start_seconds: item.start_seconds,
        end_seconds: item.end_seconds,
        time_formatted: formatTimestamp(item.start_seconds),
        duration_seconds: item.duration_seconds,
        temperature: item.temperature,
        doneness_cue: item.doneness_cue,
        sources: item.sources,
        confidence: item.confidence
      });
    });

    return finalSteps;
  }

  function extractStepsFromDescription(description, equipmentList) {
    if (!description) return [];
    const lines = description.split("\n");
    const steps = [];
    let inStepsSection = false;

    const sectionHeader = /^(instructions|directions|method|steps|preparation)[:\s]*$/i;
    const sectionEnd = /^(notes|equipment|follow me|social|nutrition|subscribe)[:\s]*$/i;

    for (const rawLine of lines) {
      const line = cleanText(rawLine);
      if (!line) continue;

      if (sectionHeader.test(line)) {
        inStepsSection = true;
        continue;
      }
      if (inStepsSection && sectionEnd.test(line)) {
        inStepsSection = false;
        break;
      }

      const stepMatch = line.match(/^(?:step\s*\d+[:.]|\d+[.)])\s*(.+)/i);
      if (inStepsSection || stepMatch) {
        const inst = cleanText(stepMatch ? stepMatch[1] : line);
        if (inst.length > 5 && !commentaryPatterns.some(p => p.test(inst))) {
          const eqFound = classifyEquipmentMention(inst);
          if (eqFound && Array.isArray(eqFound)) {
            eqFound.forEach(eq => {
              if (!equipmentList.includes(eq)) equipmentList.push(eq);
            });
            continue;
          }

          steps.push({
            step_number: steps.length + 1,
            instruction: inst.charAt(0).toUpperCase() + inst.slice(1),
            start_seconds: null,
            end_seconds: null,
            time_formatted: null,
            duration_seconds: extractDuration(inst),
            temperature: extractTemperature(inst),
            doneness_cue: extractDoneness(inst),
            sources: ["description"],
            confidence: 0.95
          });
        }
      }
    }

    return steps;
  }

  // --- Reconciliation Module ---
  function reconcileIngredients(descIngredients, transcriptIngredients, warnings) {
    const map = new Map();

    for (const item of descIngredients) {
      const key = item.name.toLowerCase().replace(/s$/, "");
      map.set(key, { ...item, name: key });
    }

    for (const item of transcriptIngredients) {
      const key = item.name.toLowerCase().replace(/s$/, "");
      if (map.has(key)) {
        const existing = map.get(key);
        if (!existing.sources.includes("transcript")) {
          existing.sources.push("transcript");
        }
        if (!existing.quantity_specified && item.quantity_specified) {
          existing.quantity = item.quantity;
          existing.unit = item.unit || existing.unit;
          existing.quantity_specified = true;
          existing.confidence = 0.90;
        } else if (existing.quantity_specified && item.quantity_specified && existing.quantity !== item.quantity) {
          warnings.push(`Quantity conflict for ${existing.name}: description specifies "${existing.quantity}" vs transcript mentions "${item.quantity}".`);
        }
      } else {
        map.set(key, { ...item, name: key });
      }
    }

    return Array.from(map.values());
  }

  function reconcileSteps(descSteps, transcriptSteps) {
    if (transcriptSteps.length > 0) {
      return transcriptSteps;
    }
    return descSteps;
  }

  // --- Main Extractor Interface ---
  const recipeExtractor = {
    extract({ videoId = "", videoTitle = "", videoDuration = 0, description = "", segments = [] } = {}) {
      const warnings = [];
      const equipment = [];
      const stats = {
        candidate_step_count: 0,
        rejected_equipment_count: 0,
        duplicate_step_count: 0,
        total_segments: Array.isArray(segments) ? segments.length : 0,
        first_timestamp: segments && segments.length > 0 ? segments[0].start : 0,
        last_timestamp: segments && segments.length > 0 ? segments[segments.length - 1].start : 0,
        video_duration: videoDuration,
        fully_covered: false
      };

      if (videoDuration > 0 && stats.last_timestamp > 0) {
        stats.fully_covered = stats.last_timestamp >= Math.min(videoDuration * 0.75, videoDuration - 45);
      } else if (stats.total_segments > 0) {
        stats.fully_covered = true;
      }

      // 1. Ingredients extraction & reconciliation
      const descIngs = parseDescriptionIngredients(description);
      const transcriptText = Array.isArray(segments) ? segments.map(s => s.text).join(" ") : "";
      const transIngs = parseTranscriptIngredients(transcriptText);
      const finalIngredients = reconcileIngredients(descIngs, transIngs, warnings);

      // 2. Steps & Equipment extraction
      const transSteps = extractStepsFromTranscript(segments, equipment, stats);
      const descSteps = extractStepsFromDescription(description, equipment);
      const finalSteps = reconcileSteps(descSteps, transSteps);

      // Fallback notifications
      if (finalIngredients.length === 0) {
        warnings.push("No explicit ingredient list was found in video description or subtitles.");
      }
      if (finalSteps.length === 0) {
        warnings.push("No structured cooking steps could be recognized.");
      }

      const specifiedCount = finalIngredients.filter(i => i.quantity_specified).length;
      const unspecifiedCount = finalIngredients.length - specifiedCount;

      const success = finalIngredients.length > 0 || finalSteps.length > 0;

      return {
        success,
        video_id: videoId || "",
        video_title: videoTitle || "Untitled Recipe",
        equipment,
        ingredients: finalIngredients,
        steps: finalSteps,
        warnings,
        stats: {
          ...stats,
          ingredients_count: finalIngredients.length,
          specified_quantities_count: specifiedCount,
          unspecified_quantities_count: unspecifiedCount,
          steps_count: finalSteps.length,
          equipment_count: equipment.length,
          has_transcript: segments && segments.length > 0,
          has_description: Boolean(description && description.length > 20)
        }
      };
    },

    async subtitleSweep(videoElement = null) {
      const video = videoElement || (typeof document !== "undefined" ? document.querySelector("video.html5-main-video, video") : null);
      if (!video) {
        console.warn("[RECIPE] No video element found for subtitle sweep.");
        return { success: false, segments: [], count: 0 };
      }

      // 1. Preserve original playback state
      const originalTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const wasPlaying = Boolean(!video.paused && !video.ended);
      const wasMuted = Boolean(video.muted);
      const originalVolume = Number.isFinite(video.volume) ? video.volume : 1.0;
      const originalPlaybackRate = Number.isFinite(video.playbackRate) ? video.playbackRate : 1.0;

      console.debug("[RECIPE] Subtitle sweep started", {
        wasPlaying,
        originalTime,
        videoDuration: video.duration
      });

      let segments = [];
      try {
        if (CM.transcriptExtractor && typeof CM.transcriptExtractor.getSegments === "function") {
          const res = await CM.transcriptExtractor.getSegments();
          if (res?.success) {
            segments = res.segments || [];
          }
        }
        return {
          success: true,
          segments,
          count: segments.length
        };
      } catch (sweepErr) {
        console.warn("[RECIPE] Subtitle sweep extraction error:", sweepErr);
        return {
          success: false,
          segments: [],
          count: 0,
          error: sweepErr
        };
      } finally {
        // Safe playback restoration in finally block
        try {
          // Verify video element is still connected and has valid media
          const isConnected = video && (typeof video.isConnected === "boolean" ? video.isConnected : true);
          if (isConnected && Number.isFinite(video.duration)) {
            // Restore playback rate, volume, and mute state
            try {
              video.playbackRate = originalPlaybackRate;
              video.volume = originalVolume;
              video.muted = wasMuted;
            } catch (_) {}

            // Restore playback position safely and wait for seek to settle before attempting playback
            if (Number.isFinite(originalTime) && Math.abs((video.currentTime || 0) - originalTime) > 0.25) {
              video.currentTime = originalTime;

              if (typeof video.addEventListener === "function") {
                await new Promise(resolve => {
                  let settled = false;
                  const onSeeked = () => {
                    if (settled) return;
                    settled = true;
                    if (typeof video.removeEventListener === "function") {
                      video.removeEventListener("seeked", onSeeked);
                    }
                    resolve();
                  };
                  video.addEventListener("seeked", onSeeked, { once: true });
                  setTimeout(onSeeked, 250);
                });
              }
            }

            // Only resume if originally playing AND user hasn't explicitly paused it
            const readyState = typeof video.readyState === "number" ? video.readyState : 4;
            const currentConnected = typeof video.isConnected === "boolean" ? video.isConnected : true;

            if (wasPlaying && !video.paused && currentConnected && readyState >= 2) {
              try {
                const p = video.play();
                if (p && typeof p.then === "function") {
                  await p;
                }
              } catch (playErr) {
                // Catch AbortError separately from other playback errors
                if (playErr.name === "AbortError") {
                  console.debug("[RECIPE] Video resume interrupted by pause or navigation (AbortError).");
                } else {
                  console.warn("[RECIPE] Could not resume the video after subtitle sweep:", playErr);
                }
              }
            }
          }
        } catch (restoreErr) {
          console.warn("[RECIPE] Could not resume the video after subtitle sweep:", restoreErr);
        }
        console.debug("[RECIPE] Subtitle sweep completed");
      }
    },

    getPracticalSuggestion(ingredientName) {
      if (!ingredientName) return null;
      const key = ingredientName.toLowerCase().trim().replace(/s$/, "");
      for (const [k, v] of Object.entries(practicalQuantitySuggestions)) {
        if (key.includes(k) || k.includes(key)) {
          return v;
        }
      }
      return practicalQuantitySuggestions[key] || null;
    },

    // Helper functions exposed for direct testing
    _parseQuantity: parseQuantity,
    _extractDuration: extractDuration,
    _extractTemperature: extractTemperature,
    _extractDoneness: extractDoneness,
    _classifyEquipmentMention: classifyEquipmentMention,
    _parseDescriptionIngredients: parseDescriptionIngredients,
    _extractStepsFromTranscript: extractStepsFromTranscript
  };

  CM.recipeExtractor = recipeExtractor;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = recipeExtractor;
  }
})();
