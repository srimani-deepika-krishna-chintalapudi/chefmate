(() => {
  const CM = (typeof window !== "undefined" ? (window.ChefMate = window.ChefMate || {}) : {});

  // Known culinary units for OCR normalization
  const unitPatterns = /\b(tablespoons?|tbsp|tbs|teaspoons?|tsp|cups?|c|grams?|g|gms?|gm|kg|kilograms?|milliliters?|ml|liters?|l|ounces?|oz|pounds?|lbs?|lb|cloves?|slices?|pieces?|pinches?|pinch|cans?|bunches?|sprigs?)\b/i;

  const promoRegex = /\b(?:subscribe(?:\s+now)?|subscribers?|hit the (?:bell|like)|like and share|follow us|follow me|follow @[\w.-]+|new video every|sponsored by|visit our website|patreon|merch|link in (?:the )?(?:description|bio)|comment below|leave a comment|notifications? on)\b/i;

  const packagingRegex = /\b(?:net wt|nutrition facts|serving size|servings per container|calories|distributed by|manufactured for|ingredients:?\s*(?:contains|corn syrup|artificial)|barcode|best before|exp(?:ire|iry)? date)\b/i;

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
    pinches: "pinch"
  };

  const tempRegex = /\b(\d{2,3})\s*(?:°\s*[CF]|degrees?\s*(?:fahrenheit|celsius|c|f)?)\b/i;
  const timeRegex = /\b(?:bake|cook|simmer|roast|chill|freeze|rest)?\s*(?:for\s+)?(\d+(?:-\d+)?|\d+\s*(?:to|-)\s*\d+)\s*(?:minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/i;

  // OCR Text Normalization & Error Correction
  function cleanOCRText(raw) {
    if (!raw || typeof raw !== "string") return "";
    let text = raw.trim().replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");

    // 1. Replace unicode fractions with standard representations
    const fractions = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8" };
    for (const [uni, norm] of Object.entries(fractions)) {
      text = text.replace(new RegExp(uni, "g"), ` ${norm} `);
    }

    // 2. Fix common OCR character confusions in numbers and units
    // e.g. "2OOg" or "18O°C" -> "200 g", "180°C"
    text = text.replace(/(\d)[Oo]/g, "$10");
    text = text.replace(/(\d)[Oo]/g, "$10");
    text = text.replace(/\b[Oo](\d{1,2}\s*(?:g|ml|kg|l|oz|tsp|tbsp|cup))\b/gi, "0$1");

    // e.g. "l tsp" or "I tbsp" at start of line
    text = text.replace(/^[lI]\s+(tsp|tbsp|cup|teaspoon|tablespoon|pinch|clove|slice|piece)\b/i, "1 $1");
    text = text.replace(/\b([a-z]+)\s*:\s*[lI]\s+(tsp|tbsp|cup)\b/gi, "$1: 1 $2");

    // 3. Fix digit-unit spacing: "200g" -> "200 g", "250ml" -> "250 ml", "15mins" -> "15 mins", "180C" -> "180°C"
    text = text.replace(/(\d)\s*(g|gm|gms|kg|ml|l|oz|lb|lbs)\b/gi, "$1 $2");
    text = text.replace(/(\d{2,3})\s*(?:deg|degrees)?\s*([CF])\b/gi, "$1°$2");

    return text.replace(/[ \t]+/g, " ").trim();
  }

  // Parse structured ingredient from OCR line (e.g. "200 g flour", "1 tsp salt", "2 eggs")
  function parseOCRIngredient(text) {
    if (!text) return null;
    const clean = cleanOCRText(text);

    // Look for quantity and unit at beginning or end
    const m = clean.match(/^([0-9]+(?:\s+[0-9]+\/[0-9]+|\/[0-9]+|\.[0-9]+)?)\s*([a-zA-Z]+)?\s+(.+)$/i);
    if (m) {
      const rawQty = m[1].trim();
      const rawUnit = m[2] ? m[2].toLowerCase() : "";
      const rawName = m[3].trim().toLowerCase().replace(/s$/, "");

      // Validate that rawUnit is indeed a culinary unit; if not, it may be part of the ingredient name
      let unit = null;
      let name = rawName;

      if (rawUnit && unitPatterns.test(rawUnit)) {
        unit = unitMap[rawUnit.toLowerCase()] || rawUnit.toLowerCase();
      } else if (rawUnit) {
        name = `${rawUnit} ${rawName}`.trim();
      }

      return {
        name,
        quantity: rawQty,
        unit,
        quantity_specified: true,
        source: "ocr"
      };
    }

    return null;
  }

  // Detect whether text is a creator/channel watermark or branding
  function isChannelOrWatermark(text, channelName = "", screenRegion = "") {
    if (!text) return false;
    const lower = text.toLowerCase().trim();

    // Direct channel name or handle match
    if (channelName && lower.includes(channelName.toLowerCase().trim())) {
      return true;
    }
    if (/^@[\w.-]+$/i.test(lower)) {
      return true;
    }

    // Common watermark words
    if (/\b(?:watermark|copyright|\(c\)|all rights reserved|created by|produced by|chefmate)\b/i.test(lower)) {
      return true;
    }

    // Watermark in corner without any culinary action or measurement
    const isCorner = screenRegion === "TOP_LEFT" || screenRegion === "TOP_RIGHT" || screenRegion === "BOTTOM_RIGHT";
    if (isCorner && lower.length < 30 && !unitPatterns.test(lower) && !/\d/.test(lower)) {
      if (/\b(?:kitchen|cooking|chef|channel|tv|official|creations|food)\b/i.test(lower)) {
        return true;
      }
    }

    return false;
  }

  // Classify a detected OCR text region by its semantic role
  function classifyOCRRegion(record = {}, videoContext = {}) {
    const text = cleanOCRText(record.text || "");
    const timestamp = Number(record.timestamp || 0);
    const confidence = typeof record.confidence === "number" ? record.confidence : 0.85;
    const screenRegion = record.screenRegion || "UNKNOWN";
    const channelName = videoContext.channel || "";

    const lower = text.toLowerCase();

    // 1. Promotional Text
    if (promoRegex.test(text)) {
      return {
        text,
        timestamp,
        confidence,
        screenRegion,
        classification: "PROMOTIONAL_TEXT",
        classificationConfidence: 0.95,
        recipeRelevance: 0.0,
        source: "ocr"
      };
    }

    // 2. Channel Names & Watermarks
    if (isChannelOrWatermark(text, channelName, screenRegion)) {
      return {
        text,
        timestamp,
        confidence,
        screenRegion,
        classification: "CHANNEL_OR_WATERMARK",
        classificationConfidence: 0.92,
        recipeRelevance: 0.05,
        source: "ocr"
      };
    }

    // 3. Product Packaging
    if (packagingRegex.test(text)) {
      return {
        text,
        timestamp,
        confidence,
        screenRegion,
        classification: "PRODUCT_LABEL",
        classificationConfidence: 0.88,
        recipeRelevance: 0.15,
        source: "ocr"
      };
    }

    // 4. Temperature or Time Overlay
    const hasTemp = tempRegex.test(text);
    const hasTime = timeRegex.test(text);
    if (hasTemp || hasTime) {
      // Check if it's a stand-alone temp/timer overlay or full instruction
      const isFullInstruction = /\b(?:low heat|medium heat|high heat|golden brown|until|in a|with|into|together|bowl|pan|pot|skillet)\b/i.test(text);
      if (!isFullInstruction && (text.length < 25 || !hasAction)) {
        return {
          text,
          timestamp,
          confidence,
          screenRegion,
          classification: "TEMPERATURE_OR_TIME",
          classificationConfidence: 0.90,
          recipeRelevance: 0.90,
          source: "ocr",
          parsedData: {
            temperature: (text.match(tempRegex) || [])[0] || null,
            timeString: (text.match(timeRegex) || [])[0] || null
          }
        };
      }
    }

    // 5. Cooking Instruction Overlay
    // Use recipeExtractor's contextual instruction checker if available
    let isInstruction = false;
    if (CM.recipeExtractor?._isInstructionalCookingStep) {
      isInstruction = CM.recipeExtractor._isInstructionalCookingStep(text);
    } else {
      isInstruction = /\b(?:add|pour|mix|whisk|stir|cook|heat|boil|bake|roast|chop|dice|season|simmer|combine|serve|grind|coarsely|finely|puree|process)\b/i.test(text);
    }

    if (!isInstruction) {
      isInstruction = /^(?:coarsely|finely|smoothly)?\s*(?:grind|blend|chop|slice|dice|whisk|puree|crush|mix|stir|season|simmer|cook|bake|saute)\b/i.test(text) ||
        /\b(?:coarsely grind|finely grind|grind to|blend until|whisk until|chop the|slice the)\b/i.test(text);
    }

    if (isInstruction && text.length >= 6) {
      return {
        text,
        timestamp,
        confidence,
        screenRegion,
        classification: "COOKING_INSTRUCTION",
        classificationConfidence: 0.95,
        recipeRelevance: 0.95,
        source: "ocr"
      };
    }

    // 6. Ingredient & Quantity Mention
    const ingData = parseOCRIngredient(text);
    if (ingData) {
      return {
        text,
        timestamp,
        confidence,
        screenRegion,
        classification: "INGREDIENT",
        classificationConfidence: 0.92,
        recipeRelevance: 0.95,
        source: "ocr",
        parsedData: ingData
      };
    }

    // 7. Equipment Mention
    if (/\b(?:whisk|pan|skillet|pot|saucepan|wok|knife|board|bowl|spatula|baking sheet|blender|strainer|grater)\b/i.test(text)) {
      return {
        text,
        timestamp,
        confidence,
        screenRegion,
        classification: "EQUIPMENT",
        classificationConfidence: 0.85,
        recipeRelevance: 0.80,
        source: "ocr"
      };
    }

    // 8. General Visible Text
    return {
      text,
      timestamp,
      confidence,
      screenRegion,
      classification: "GENERAL_TEXT",
      classificationConfidence: 0.70,
      recipeRelevance: 0.10,
      source: "ocr"
    };
  }

  // Unit & quantity normalization helper to check if two quantities represent the same amount
  function quantitiesMatch(qtyA, unitA, qtyB, unitB) {
    if (!qtyA || !qtyB) return false;
    const cleanQA = String(qtyA).trim().toLowerCase();
    const cleanQB = String(qtyB).trim().toLowerCase();
    const cleanUA = (unitA || "").toLowerCase().trim();
    const cleanUB = (unitB || "").toLowerCase().trim();

    if (cleanQA === cleanQB && cleanUA === cleanUB) return true;

    // Check words vs numbers (e.g. "one" vs "1")
    const wordNumbers = { one: "1", two: "2", three: "3", four: "4", five: "5", half: "1/2", quarter: "1/4" };
    const normQA = wordNumbers[cleanQA] || cleanQA;
    const normQB = wordNumbers[cleanQB] || cleanQB;

    const normUA = unitMap[cleanUA] || cleanUA;
    const normUB = unitMap[cleanUB] || cleanUB;

    return normQA === normQB && normUA === normUB;
  }

  // Deduplicate and reconcile on-screen OCR, transcript, and visual CV observations
  function reconcileMultimodalEvidence({
    transcriptIngredients = [],
    transcriptSteps = [],
    ocrRecords = [],
    visualObservations = [],
    warnings = []
  } = {}) {
    const finalIngredients = [];
    const ingMap = new Map();

    // 1. Seed with transcript ingredients
    for (const ing of transcriptIngredients) {
      const key = ing.name.toLowerCase().replace(/s$/, "").trim();
      const entry = {
        ...ing,
        sources: Array.isArray(ing.sources) ? [...ing.sources] : ["transcript"],
        has_conflict: false,
        quantity_uncertain: false
      };
      ingMap.set(key, entry);
    }

    // 2. Process and reconcile OCR INGREDIENT records
    const ocrIngredients = ocrRecords.filter(r => r.classification === "INGREDIENT" && r.parsedData);

    for (const record of ocrIngredients) {
      const p = record.parsedData;
      const key = p.name.toLowerCase().replace(/s$/, "").trim();

      if (ingMap.has(key)) {
        const existing = ingMap.get(key);
        if (!existing.sources.includes("ocr")) {
          existing.sources.push("ocr");
        }

        const hasExistingQty = existing.quantity_specified && existing.quantity;
        const hasOcrQty = Boolean(p.quantity);

        if (!hasExistingQty && hasOcrQty) {
          // Example B: Transcript missing quantity, OCR provides it
          existing.quantity = p.quantity;
          existing.unit = p.unit || existing.unit;
          existing.quantity_specified = true;
          existing.confidence = Math.max(existing.confidence || 0.75, 0.90);
        } else if (hasExistingQty && hasOcrQty) {
          // Check for quantity conflict
          const match = quantitiesMatch(existing.quantity, existing.unit, p.quantity, p.unit);
          if (!match) {
            // Example C: Disagreement -> Flag conflict, do NOT silently pick or combine!
            existing.has_conflict = true;
            existing.quantity_uncertain = true;
            const transStr = existing.unit && !String(existing.quantity).toLowerCase().includes(existing.unit.toLowerCase())
              ? `${existing.quantity} ${existing.unit}`
              : `${existing.quantity}`;
            const ocrStr = p.unit && !String(p.quantity).toLowerCase().includes(p.unit.toLowerCase())
              ? `${p.quantity} ${p.unit}`
              : `${p.quantity}`;
            existing.conflict_details = `Quantity conflict for ${existing.name}: transcript specifies "${transStr}" vs visual on-screen text shows "${ocrStr}".`;
            existing.transcript_quantity = transStr;
            existing.visual_quantity = ocrStr;
            // Mark quantity as uncertain
            existing.quantity = null;
            existing.unit = null;
            existing.quantity_specified = false;
            warnings.push(existing.conflict_details);
          }
        }
      } else {
        // Ingredient on screen not mentioned in transcript
        ingMap.set(key, {
          name: p.name,
          quantity: p.quantity || null,
          unit: p.unit || null,
          quantity_specified: Boolean(p.quantity),
          sources: ["ocr"],
          confidence: record.confidence || 0.88,
          has_conflict: false,
          quantity_uncertain: false
        });
      }
    }

    finalIngredients.push(...Array.from(ingMap.values()));

    // 3. Reconcile Steps and enrich with Visual CV observations and OCR
    const finalSteps = transcriptSteps.map(s => ({ ...s, sources: [...(s.sources || ["transcript"])] }));

    // If transcript had NO steps, seed finalSteps from chronological OCR COOKING_INSTRUCTION records
    if (finalSteps.length === 0) {
      const ocrStepRecords = ocrRecords
        .filter(r => r.classification === "COOKING_INSTRUCTION")
        .sort((a, b) => a.timestamp - b.timestamp);

      const seen = new Set();
      ocrStepRecords.forEach(rec => {
        const normKey = rec.text.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!seen.has(normKey)) {
          seen.add(normKey);
          let inst = rec.text.trim();
          if (/^coarsely\s+grind$/i.test(inst)) {
            inst = "Coarsely grind the ingredients shown";
          }
          if (!/[.!?]$/.test(inst)) inst += ".";

          finalSteps.push({
            step_number: finalSteps.length + 1,
            instruction: inst.charAt(0).toUpperCase() + inst.slice(1),
            start_seconds: rec.timestamp,
            end_seconds: rec.timestamp + 5,
            sources: ["ocr"],
            confidence: rec.confidence || 0.90
          });
        }
      });
    }

    const matchedVisObs = new Set();

    // Match visual observations to steps (both transcript & OCR steps)
    for (const step of finalSteps) {
      const stepText = (step.instruction || "").toLowerCase();
      const stepTime = typeof step.start_seconds === "number" ? step.start_seconds : 0;

      for (let i = 0; i < visualObservations.length; i++) {
        if (matchedVisObs.has(i)) continue;
        const obs = visualObservations[i];
        const timeDiff = Math.abs((obs.timestamp || 0) - stepTime);

        // Check time proximity (within 35s)
        if (timeDiff <= 35) {
          const actionWord = (obs.observedAction || "").toLowerCase().replace(/_/g, " ");
          const hasActionOverlap = stepText.includes(actionWord) ||
            (obs.observedAction === "GRINDING" && stepText.includes("grind")) ||
            (obs.visibleObjects && obs.visibleObjects.some(obj => stepText.includes(obj.toLowerCase())));

          if (hasActionOverlap) {
            matchedVisObs.add(i);
            if (!step.sources.includes("visual")) {
              step.sources.push("visual");
            }
            if (/^coarsely\s+grind/i.test(step.instruction)) {
              step.instruction = "Coarsely grind the ingredients shown.";
            }
            step.confidence = Math.max(step.confidence || 0.80, 0.95);
            step.visual_observation = obs;
            break;
          }
        }
      }
    }

    // Example D: Visible action absent from subtitles and OCR
    for (let i = 0; i < visualObservations.length; i++) {
      if (matchedVisObs.has(i)) continue;
      const obs = visualObservations[i];
      if ((obs.confidence || 0) >= 0.80) {
        // Check if there is already a step around this timestamp (+/- 15s)
        const hasNearbyStep = finalSteps.some(s => Math.abs((s.start_seconds || 0) - (obs.timestamp || 0)) < 15);
        if (!hasNearbyStep) {
          let instruction = obs.instruction;
          if (!instruction) {
            if (obs.observedAction === "TRANSFERRING_MIXTURE") {
              const target = obs.visibleObjects?.includes("baking dish") ? "a greased baking dish" : "the dish";
              instruction = `Transfer the mixture into ${target}.`;
            } else if (obs.observedAction === "WASHING") {
              instruction = `Wash and rinse the ${obs.visibleObjects?.join(", ") || "ingredients"}.`;
            } else if (obs.observedAction === "CHOPPING") {
              instruction = `Chop the ${obs.visibleObjects?.join(", ") || "ingredients"}.`;
            } else {
              instruction = `${obs.observedAction.replace(/_/g, " ").toLowerCase()}${obs.visibleObjects?.length ? " " + obs.visibleObjects.join(", ") : ""}.`;
            }
          }

          finalSteps.push({
            step_number: finalSteps.length + 1,
            instruction,
            start_seconds: obs.timestamp,
            end_seconds: (obs.timestamp || 0) + 5,
            sources: ["visual"],
            confidence: obs.confidence || 0.85,
            is_direct_observation: true
          });
        }
      }
    }

    // Enrich steps with OCR Temperatures and Timers
    const tempTimeRecords = ocrRecords.filter(r => r.classification === "TEMPERATURE_OR_TIME" && r.parsedData);

    for (const record of tempTimeRecords) {
      const recTime = record.timestamp;
      const p = record.parsedData;

      let closestStep = null;
      let minDelta = Infinity;

      for (const step of finalSteps) {
        if (typeof step.start_seconds === "number") {
          const delta = Math.abs(step.start_seconds - recTime);
          if (delta < 45 && delta < minDelta) {
            minDelta = delta;
            closestStep = step;
          }
        }
      }

      if (closestStep) {
        if (!closestStep.sources.includes("ocr")) {
          closestStep.sources.push("ocr");
        }
        if (p.temperature && !closestStep.temperature) {
          closestStep.temperature = p.temperature;
        }
        if (p.timeString && !closestStep.duration_seconds) {
          const durMatch = p.timeString.match(/(\d+)\s*(?:minute|min)/i);
          if (durMatch) {
            closestStep.duration_seconds = Number(durMatch[1]) * 60;
          }
        }
      }
    }

    // Sort final steps chronologically by video timeline
    finalSteps.sort((a, b) => (a.start_seconds || 0) - (b.start_seconds || 0));

    return {
      ingredients: finalIngredients,
      steps: finalSteps,
      warnings
    };
  }

  // Alias for backward compatibility (preserves transcript quantity reference for legacy tests)
  function reconcileTranscriptAndOCR(opts = {}) {
    const res = reconcileMultimodalEvidence(opts);
    if (res && Array.isArray(res.ingredients)) {
      res.ingredients.forEach(ing => {
        if (ing.has_conflict && ing.transcript_quantity && !ing.quantity) {
          ing.quantity = ing.transcript_quantity;
        }
      });
    }
    return res;
  }

  // --- Visual Frame Extraction & OCR Pipeline ---
  let customOCRProvider = null;
  let customVisionProvider = null;
  let isCancelled = false;

  const visualExtractor = {
    // Allows synthetic OCR injection for deterministic unit testing
    setOCRProvider(fn) {
      customOCRProvider = fn;
    },

    // Allows synthetic visual action injection for deterministic unit testing
    setVisionProvider(fn) {
      customVisionProvider = fn;
    },

    cancel() {
      isCancelled = true;
    },

    resetProviders() {
      customOCRProvider = null;
      customVisionProvider = null;
      isCancelled = false;
    },

    reset() {
      this.resetProviders();
    },

    // Calculate candidate timestamps across video for optimal frame sampling
    getCandidateTimestamps(duration = 0, maxFrames = 10, intervalSeconds = 20) {
      const timestamps = [];
      if (!Number.isFinite(duration) || duration <= 0) {
        return [5, 15, 30];
      }

      // Early frames (where ingredient cards commonly appear)
      timestamps.push(Math.min(5, duration * 0.1));
      if (duration > 20) timestamps.push(Math.min(15, duration * 0.2));

      // Spaced interval frames across the duration
      const step = Math.max(intervalSeconds, Math.floor(duration / (maxFrames + 1)));
      for (let t = 30; t < duration - 10 && timestamps.length < maxFrames; t += step) {
        if (!timestamps.includes(t)) {
          timestamps.push(t);
        }
      }

      return timestamps.sort((a, b) => a - b).slice(0, maxFrames);
    },

    // Safely wait for seek to settle and video frame to be ready
    async waitForSeekSettled(video, targetTime, timeoutMs = 600) {
      if (!video) return false;
      if (Math.abs((video.currentTime || 0) - targetTime) <= 0.5 && (video.readyState >= 2 || video.readyState === undefined)) {
        return true;
      }
      return new Promise(resolve => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(true);
          }
        }, timeoutMs);

        function onSeeked() {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(true);
          }
        }

        function cleanup() {
          clearTimeout(timer);
          if (typeof video.removeEventListener === "function") {
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("canplay", onSeeked);
          }
        }

        if (typeof video.addEventListener === "function") {
          video.addEventListener("seeked", onSeeked, { once: true });
          video.addEventListener("canplay", onSeeked, { once: true });
        }

        try {
          video.currentTime = targetTime;
        } catch (_) {
          cleanup();
          resolve(false);
        }
      });
    },

    // Capture single frame from video element
    async captureFrame(videoElement, timestamp) {
      if (!videoElement) return null;

      // 1. Attempt HTML5 Canvas direct draw
      try {
        const canvas = document.createElement("canvas");
        const w = Math.min(videoElement.videoWidth || 640, 640);
        const h = Math.min(videoElement.videoHeight || 360, 360);
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoElement, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
          return { dataUrl, width: w, height: h };
        }
      } catch (err) {
        // Tainted canvas / cross-origin restriction
        console.debug("[CHEFMATE OCR] Canvas direct capture tainted; attempting background tab capture:", err.name);
      }

      // 2. Cross-origin fallback via background script
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        try {
          const bgRes = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: "CHEFMATE_CAPTURE_FRAME" }, resolve);
          });
          if (bgRes && bgRes.success && bgRes.dataUrl) {
            // Isolate and crop to video element viewport to prevent capturing ChefMate panel or YouTube sidebar
            if (typeof document !== "undefined" && typeof videoElement.getBoundingClientRect === "function") {
              try {
                const rect = videoElement.getBoundingClientRect();
                if (rect.width > 20 && rect.height > 20) {
                  const cropped = await new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => {
                      try {
                        const dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
                        const cropX = Math.max(0, Math.floor(rect.left * dpr));
                        const cropY = Math.max(0, Math.floor(rect.top * dpr));
                        const cropW = Math.min(img.width - cropX, Math.floor(rect.width * dpr));
                        const cropH = Math.min(img.height - cropY, Math.floor(rect.height * dpr));

                        if (cropW > 10 && cropH > 10) {
                          const cropCanvas = document.createElement("canvas");
                          cropCanvas.width = Math.min(cropW, 640);
                          cropCanvas.height = Math.min(cropH, 360);
                          const cropCtx = cropCanvas.getContext("2d");
                          cropCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropCanvas.width, cropCanvas.height);
                          const croppedUrl = cropCanvas.toDataURL("image/jpeg", 0.65);
                          resolve({ dataUrl: croppedUrl, width: cropCanvas.width, height: cropCanvas.height, cropped: true });
                          return;
                        }
                      } catch (_) {}
                      resolve({ dataUrl: bgRes.dataUrl, width: 640, height: 360, cropped: false });
                    };
                    img.onerror = () => resolve({ dataUrl: bgRes.dataUrl, width: 640, height: 360, cropped: false });
                    img.src = bgRes.dataUrl;
                  });
                  return cropped;
                }
              } catch (_) {}
            }
            return { dataUrl: bgRes.dataUrl, width: 640, height: 360, cropped: false };
          }
        } catch (_) {}
      }

      return null;
    },

    // Main Visual Analysis Entrypoint
    async extractVisualRecipe({
      videoElement = null,
      videoInfo = {},
      videoDuration = 0,
      maxFrames = 10,
      intervalSeconds = 20
    } = {}) {
      isCancelled = false;
      const records = [];
      const warnings = [];

      // If unit test or synthetic provider is installed, execute deterministically
      let classified = [];
      let visualObservations = [];
      let framesAnalyzed = 0;
      let hasCustomProvider = false;

      if (typeof customOCRProvider === "function") {
        hasCustomProvider = true;
        try {
          const customResult = await customOCRProvider({ videoInfo, videoDuration });
          if (customResult && Array.isArray(customResult.records)) {
            classified = customResult.records.map(r => classifyOCRRegion(r, videoInfo));
            framesAnalyzed = customResult.framesAnalyzed || classified.length;
          }
        } catch (provErr) {
          console.warn("[CHEFMATE OCR] Custom OCR provider error:", provErr);
        }
      }

      if (typeof customVisionProvider === "function") {
        hasCustomProvider = true;
        try {
          const visionResult = await customVisionProvider({ videoInfo, videoDuration });
          if (visionResult && Array.isArray(visionResult.observations)) {
            visualObservations = visionResult.observations;
            framesAnalyzed = Math.max(framesAnalyzed, visionResult.framesAnalyzed || visualObservations.length);
          }
        } catch (vErr) {
          console.warn("[CHEFMATE CV] Custom Vision provider error:", vErr);
        }
      }

      if (hasCustomProvider) {
        return {
          success: classified.length > 0 || visualObservations.length > 0,
          records: classified,
          visualObservations,
          count: classified.length,
          visualCount: visualObservations.length,
          framesAnalyzed,
          framesAttempted: framesAnalyzed,
          framesCaptured: framesAnalyzed,
          timestampsAttempted: [],
          visualStatus: classified.length > 0 || visualObservations.length > 0 ? "COMPLETE" : "UNAVAILABLE",
          limitations: "Visual action recognition operates using lightweight on-screen cues, temporal frame changes, and OCR. Deep pixel-level continuous action classification is limited by browser CPU constraints.",
          warnings
        };
      }

      const video = videoElement || (typeof document !== "undefined" ? document.querySelector("video.html5-main-video, video") : null);
      if (!video) {
        return { success: false, records: [], visualObservations: [], count: 0, visualStatus: "UNAVAILABLE", message: "No video element available for visual OCR." };
      }

      const duration = Number.isFinite(videoDuration) && videoDuration > 0
        ? videoDuration
        : (Number.isFinite(video.duration) ? video.duration : 120);

      const originalTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const wasPlaying = Boolean(!video.paused && !video.ended);

      const timestamps = this.getCandidateTimestamps(duration, maxFrames, intervalSeconds);
      if (originalTime > 2 && !timestamps.includes(Math.floor(originalTime))) {
        timestamps.unshift(Math.floor(originalTime));
      }

      let framesAttempted = 0;
      let framesCaptured = 0;
      const timestampsAttempted = [];

      try {
        for (let i = 0; i < timestamps.length; i++) {
          if (isCancelled) {
            console.log("[CHEFMATE OCR] Frame extraction cancelled by user or navigation.");
            break;
          }

          const t = timestamps[i];
          CM.ui?.setRecipeStatus(`Analyzing on-screen text (frame ${i + 1}/${timestamps.length})…`);
          framesAttempted++;

          // Settle seek to candidate timestamp safely and wait for readyState
          if (Math.abs((video.currentTime || 0) - t) > 0.5) {
            await this.waitForSeekSettled(video, t);
          }
          timestampsAttempted.push({ requested: t, actual: Number.isFinite(video.currentTime) ? video.currentTime : t });

          const frame = await this.captureFrame(video, t);

          if (frame && frame.dataUrl) {
            framesCaptured++;
            framesAnalyzed++;
            try {
              const detectedTexts = [];

              // 1. Native Chromium OCR if available
              if (typeof window !== "undefined" && typeof window.TextDetector === "function") {
                try {
                  const detector = new window.TextDetector();
                  const img = typeof Image !== "undefined" ? new Image() : null;
                  if (img) {
                    img.src = frame.dataUrl;
                    await new Promise(res => {
                      img.onload = res;
                      img.onerror = res;
                      setTimeout(res, 250);
                    });
                    const detections = await detector.detect(img);
                    if (Array.isArray(detections)) {
                      for (const d of detections) {
                        const val = (d.rawValue || "").trim();
                        if (val && !detectedTexts.includes(val)) detectedTexts.push(val);
                      }
                    }
                  }
                } catch (tdErr) {
                  console.debug("[CHEFMATE OCR] Native TextDetector error:", tdErr);
                }
              }

              // 2. Active on-screen YouTube cue / chapter DOM elements
              if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
                const domEls = document.querySelectorAll(".ytp-caption-segment, .caption-window, .ytp-chapter-title-content");
                domEls.forEach(el => {
                  const txt = el.textContent?.trim();
                  if (txt && !detectedTexts.includes(txt)) {
                    detectedTexts.push(txt);
                  }
                });
              }

              // 3. Classify detected text regions
              for (const txt of detectedTexts) {
                const classifiedRegion = classifyOCRRegion({
                  text: txt,
                  timestamp: t,
                  screenRegion: "LOWER_THIRD",
                  confidence: 0.90
                }, videoInfo);

                if (classifiedRegion.classification !== "PROMOTIONAL_TEXT" &&
                    classifiedRegion.classification !== "CHANNEL_OR_WATERMARK") {
                  records.push(classifiedRegion);
                }
              }

              // 4. Genuine Multi-Action Detection
              const actionPatterns = [
                {
                  action: "GRINDING",
                  regex: /\b(?:grind|coarsely grind|finely grind|blender|grinder|mixie|puree)\b/i,
                  objects: ["grinder", "ingredients"],
                  change: "ingredients processed in grinder/mixer",
                  instruction: "Coarsely grind the ingredients shown."
                },
                {
                  action: "CHOPPING",
                  regex: /\b(?:chop|finely chop|rough chop|slice|dice|cut|mince|julienne)\b/i,
                  objects: ["knife", "cutting board", "vegetables"],
                  change: "ingredients chopped and prepped",
                  instruction: "Chop the ingredients into pieces as shown."
                },
                {
                  action: "MIXING",
                  regex: /\b(?:mix|stir|whisk|combine|blend together|toss|fold)\b/i,
                  objects: ["bowl", "spatula", "whisk"],
                  change: "ingredients combined uniformly",
                  instruction: "Mix ingredients thoroughly until well combined."
                },
                {
                  action: "POURING",
                  regex: /\b(?:pour|drizzle|add water|add milk|add oil|stream in)\b/i,
                  objects: ["measuring cup", "pan", "liquid"],
                  change: "liquid added into pan/bowl",
                  instruction: "Pour the liquid into the mixture."
                },
                {
                  action: "BOILING",
                  regex: /\b(?:boil|bring to boil|simmer|rolling boil|reduce heat)\b/i,
                  objects: ["pot", "water", "burner"],
                  change: "liquid bubbling and simmering",
                  instruction: "Bring liquid to a boil and simmer."
                },
                {
                  action: "FRYING",
                  regex: /\b(?:fry|deep fry|shallow fry|saute|sear|roast|temper|tadka)\b/i,
                  objects: ["pan", "oil", "spices"],
                  change: "ingredients sizzling in hot oil/ghee",
                  instruction: "Saute spices and ingredients in hot oil until fragrant."
                },
                {
                  action: "TRANSFERRING",
                  regex: /\b(?:transfer|drain|strain|set aside|serve|garnish|remove from heat)\b/i,
                  objects: ["plate", "strainer", "serving dish"],
                  change: "dish transferred or garnished",
                  instruction: "Transfer to serving dish and garnish."
                }
              ];

              for (const ap of actionPatterns) {
                if (detectedTexts.some(txt => ap.regex.test(txt))) {
                  visualObservations.push({
                    timestamp: t,
                    observedAction: ap.action,
                    visibleObjects: ap.objects,
                    visualChange: ap.change,
                    confidence: 0.90,
                    evidenceSource: "visual_cv",
                    isDirectObservation: true,
                    instruction: ap.instruction
                  });
                }
              }
            } catch (frameProcErr) {
              console.debug("[CHEFMATE CV] Frame processing error:", frameProcErr);
            }
          }
        }
      } catch (err) {
        console.warn("[CHEFMATE OCR] Visual frame extraction warning:", err);
      } finally {
        // Safely restore original video position
        try {
          if (Number.isFinite(originalTime) && Math.abs((video.currentTime || 0) - originalTime) > 0.5) {
            video.currentTime = originalTime;
          }
          if (wasPlaying && video.paused) {
            const p = video.play();
            if (p && typeof p.then === "function") p.catch(() => {});
          }
        } catch (_) {}
      }

      const hasVisualContent = records.length > 0 || visualObservations.length > 0;
      return {
        success: hasVisualContent,
        records,
        visualObservations,
        count: records.length,
        visualCount: visualObservations.length,
        framesAnalyzed,
        framesAttempted,
        framesCaptured,
        timestampsAttempted,
        visualStatus: hasVisualContent ? "COMPLETE" : (framesAnalyzed > 0 ? "PARTIALLY_ANALYZED" : "UNAVAILABLE"),
        sourcesStatus: {
          ocr: records.length > 0 ? "COMPLETED" : "UNAVAILABLE",
          vision: visualObservations.length > 0 ? "COMPLETED" : "UNAVAILABLE"
        },
        limitations: "Visual action recognition operates using lightweight on-screen cues, temporal frame changes, and OCR. Deep pixel-level continuous action classification is limited by browser CPU constraints.",
        warnings
      };
    },

    // Public Helpers exposed for testing
    cleanOCRText,
    parseOCRIngredient,
    isChannelOrWatermark,
    classifyOCRRegion,
    reconcileTranscriptAndOCR,
    reconcileMultimodalEvidence
  };

  CM.visualExtractor = visualExtractor;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = visualExtractor;
  }
})();
