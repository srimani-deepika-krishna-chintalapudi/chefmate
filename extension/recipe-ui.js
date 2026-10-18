(() => {
  const CM = (typeof window !== "undefined" ? (window.ChefMate = window.ChefMate || {}) : {});

  const el = (tag, className = "", text = "") => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  CM.ui = {
    root: null,
    button: null,
    panel: null,

    mount() {
      if (this.root?.isConnected) return;

      this.button = el("button", "cm-toggle-btn", "🍳 ChefMate");
      this.button.id = "chefmate-youtube-button";
      this.button.type = "button";
      this.button.addEventListener("click", () => CM.setEnabled(!CM.enabled));

      this.panel = el("section", "cm-panel");
      this.panel.id = "chefmate-panel";
      this.panel.hidden = true;

      // Header
      const header = el("div", "cm-header");
      const titleWrapper = el("div", "cm-brand");
      titleWrapper.innerHTML = "<strong>🍳 ChefMate</strong>";
      const statusPill = el("span", "cm-status-pill", "Voice control OFF");
      statusPill.id = "cm-status-badge";
      statusPill.dataset.kind = "off";

      const closeBtn = el("button", "cm-close-btn", "✕");
      closeBtn.setAttribute("aria-label", "Close ChefMate");
      closeBtn.addEventListener("click", () => {
        this.panel.hidden = true;
      });

      header.append(titleWrapper, statusPill, closeBtn);

      // Video Info
      const videoInfoRow = el("div", "cm-video-title-row");
      const videoTitle = el("p", "cm-video-title", "Load a video to begin");
      videoTitle.id = "cm-video-title";
      videoInfoRow.append(videoTitle);

      // Recipe Section
      const recipeSection = el("div", "cm-recipe-section");
      recipeSection.id = "cm-recipe-section";

      const recipeStatus = el("div", "cm-recipe-status", "Say \"generate recipe\" or click below to analyze this video.");
      recipeStatus.id = "cm-recipe-status";
      recipeSection.append(recipeStatus);

      // Equipment Box
      const equipmentBox = el("div", "cm-equipment-box");
      equipmentBox.id = "cm-equipment-box";
      equipmentBox.hidden = true;
      const eqTitle = el("h4", "cm-section-title", "Equipment Needed");
      const eqList = el("div", "cm-equipment-pills");
      eqList.id = "cm-equipment-pills";
      equipmentBox.append(eqTitle, eqList);
      recipeSection.append(equipmentBox);

      // Ingredients Box
      const ingredientsBox = el("div", "cm-ingredients-box");
      ingredientsBox.id = "cm-ingredients-box";
      ingredientsBox.hidden = true;
      const ingTitle = el("h4", "cm-section-title", "Ingredients");
      const ingList = el("ul", "cm-ingredients-list");
      ingList.id = "cm-ingredients-list";
      ingredientsBox.append(ingTitle, ingList);
      recipeSection.append(ingredientsBox);

      // Steps Box
      const stepsBox = el("div", "cm-steps-box");
      stepsBox.id = "cm-steps-box";
      stepsBox.hidden = true;

      const stepsHeader = el("div", "cm-steps-header");
      const stepsTitle = el("h4", "cm-section-title", "Cooking Instructions");
      const stepsProgress = el("span", "cm-steps-progress", "");
      stepsProgress.id = "cm-steps-progress";
      stepsHeader.append(stepsTitle, stepsProgress);

      const stepsList = el("div", "cm-steps-list");
      stepsList.id = "cm-steps-list";

      // Action execution helper for UI buttons with speech feedback
      const handleAction = async (cmd) => {
        const res = await CM.executeCommand(cmd);
        this.setExecution(res);
        if (res?.speak && res?.message) {
          CM.voice?.speak(res.message);
        }
        return res;
      };

      // Step Controls
      const stepControls = el("div", "cm-step-controls");
      const prevBtn = el("button", "cm-btn cm-btn-secondary", "⏮ Previous");
      prevBtn.id = "cm-prev-step-btn";
      prevBtn.addEventListener("click", () => handleAction({ intent: "PREVIOUS_RECIPE_STEP" }));

      const repeatBtn = el("button", "cm-btn cm-btn-secondary", "🔁 Repeat");
      repeatBtn.id = "cm-repeat-step-btn";
      repeatBtn.addEventListener("click", () => handleAction({ intent: "REPEAT_RECIPE_STEP" }));

      const nextBtn = el("button", "cm-btn cm-btn-primary", "⏭ Next Step");
      nextBtn.id = "cm-next-step-btn";
      nextBtn.addEventListener("click", () => handleAction({ intent: "NEXT_RECIPE_STEP" }));

      stepControls.append(prevBtn, repeatBtn, nextBtn);
      stepsBox.append(stepsHeader, stepsList, stepControls);
      recipeSection.append(stepsBox);

      // Voice Activity & Conversation Card
      const voiceCard = el("div", "cm-voice-card");
      
      const heardRow = el("div", "cm-dialogue-row");
      const heardLabel = el("span", "cm-dialogue-label", "Heard:");
      const heardText = el("span", "cm-dialogue-text", "No command yet");
      heardText.id = "cm-heard-text";
      heardRow.append(heardLabel, heardText);

      const responseRow = el("div", "cm-dialogue-row");
      const responseLabel = el("span", "cm-dialogue-label", "ChefMate:");
      const responseText = el("span", "cm-dialogue-text cm-assistant-reply", "—");
      responseText.id = "cm-spoken-text";
      responseRow.append(responseLabel, responseText);

      voiceCard.append(heardRow, responseRow);

      // Quick Actions Row
      const actionsRow = el("div", "cm-actions-row");
      const genBtn = el("button", "cm-btn cm-btn-accent", "🍳 Generate Recipe");
      genBtn.addEventListener("click", () => handleAction({ intent: "GENERATE_RECIPE" }));

      const playPauseBtn = el("button", "cm-btn cm-btn-outline", "⏯ Play/Pause");
      playPauseBtn.addEventListener("click", () => handleAction({ intent: "TOGGLE_PLAY" }));

      const skipAdBtn = el("button", "cm-btn cm-btn-outline", "⏭ Skip Ad");
      skipAdBtn.addEventListener("click", () => handleAction({ intent: "SKIP_AD" }));

      actionsRow.append(genBtn, playPauseBtn, skipAdBtn);

      // Manual Voice/Text Input Fallback
      const manualForm = el("form", "cm-manual-form");
      const manualInput = el("input", "cm-manual-input");
      manualInput.type = "text";
      manualInput.placeholder = "Type a command (e.g. next step, pause, how much milk)…";
      const manualBtn = el("button", "cm-btn cm-btn-primary", "Send");
      manualBtn.type = "submit";

      manualForm.append(manualInput, manualBtn);
      manualForm.addEventListener("submit", async e => {
        e.preventDefault();
        const text = manualInput.value.trim();
        if (!text) return;
        manualInput.value = "";
        this.setTranscript(text);
        const cmd = await CM.commandParser.parse(text);
        this.setIntent(cmd);
        const res = await CM.executeCommand(cmd);
        this.setExecution(res);
        if (res?.speak && res?.message) {
          CM.voice?.speak(res.message);
        }
      });

      // Debug toggle & drawer
      const debugToggle = el("button", "cm-debug-toggle", "Show Diagnostics");
      debugToggle.type = "button";
      const debugBox = el("div", "cm-debug-drawer");
      debugBox.id = "cm-debug-drawer";
      debugBox.hidden = true;
      debugBox.innerHTML = `
        <div>State: <span id="cm-dbg-state">IDLE</span></div>
        <div>Transcript: <span id="cm-dbg-src-transcript">Unavailable</span></div>
        <div>OCR: <span id="cm-dbg-src-ocr">Unavailable</span></div>
        <div>Vision: <span id="cm-dbg-src-vision">Unavailable</span></div>
        <div>Metadata: <span id="cm-dbg-src-metadata">Unavailable</span></div>
        <div>Coverage: <span id="cm-dbg-coverage">—</span></div>
        <div>Segments: <span id="cm-dbg-segments">0</span></div>
        <div>Timestamps: <span id="cm-dbg-timestamps">0s - 0s</span></div>
        <div>Equip Filtered: <span id="cm-dbg-eq-filtered">0</span></div>
        <div>Mic: <span id="cm-dbg-mic">NOT CONNECTED</span></div>
        <div>Speech: <span id="cm-dbg-rec">STOPPED</span></div>
        <div>Intent: <span id="cm-dbg-intent">—</span></div>
      `;

      debugToggle.addEventListener("click", () => {
        debugBox.hidden = !debugBox.hidden;
        debugToggle.textContent = debugBox.hidden ? "Show Diagnostics" : "Hide Diagnostics";
      });

      this.panel.append(
        header,
        videoInfoRow,
        recipeSection,
        voiceCard,
        manualForm,
        actionsRow,
        debugToggle,
        debugBox
      );

      this.root = el("div", "cm-root");
      this.root.id = "chefmate-root";
      this.root.append(this.button, this.panel);
      this.insert();
    },

    insert() {
      const target = document.querySelector(
        "#top-level-buttons-computed, #actions #top-level-buttons-computed, ytd-watch-metadata #top-level-buttons-computed, #above-the-fold #title, #end #buttons"
      );
      if (target && this.root?.parentElement !== target) {
        target.append(this.root);
        this.root.classList.remove("cm-floating");
        return;
      }
      if (this.root && !this.root.isConnected) {
        document.body.append(this.root);
        this.root.classList.add("cm-floating");
      }
    },

    refresh(enabled) {
      if (!this.button) return;
      this.button.textContent = enabled ? "🟢 ChefMate Active" : "🍳 ChefMate";
      this.button.classList.toggle("cm-active", enabled);
      if (this.panel) this.panel.hidden = !enabled;
      if (!enabled) {
        this.setVoiceState("OFF", "Voice control OFF");
      }
      this.updateDebug();
    },

    setVoiceState(state, message) {
      const pill = this.panel?.querySelector("#cm-status-badge");
      if (pill) {
        pill.textContent = message;
        pill.dataset.kind = state.toLowerCase();
      }
      const dbg = this.panel?.querySelector("#cm-dbg-rec");
      if (dbg) dbg.textContent = state;
    },

    setInterim(text) {
      const heardNode = this.panel?.querySelector("#cm-heard-text");
      if (heardNode && text) {
        heardNode.textContent = `“${text}…”`;
      }
    },

    setTranscript(text) {
      const heardNode = this.panel?.querySelector("#cm-heard-text");
      if (heardNode) {
        heardNode.textContent = `“${text}”`;
      }
    },

    setSpokenText(text) {
      const spkNode = this.panel?.querySelector("#cm-spoken-text");
      if (spkNode) {
        spkNode.textContent = text;
      }
    },

    setIntent(command) {
      const dbgIntent = this.panel?.querySelector("#cm-dbg-intent");
      if (dbgIntent) dbgIntent.textContent = command.intent;
    },

    setExecution(result) {
      if (result?.message) {
        this.setSpokenText(result.message);
      }
      this.updateDebug();
    },

    setRecipeStatus(text) {
      const statusNode = this.panel?.querySelector("#cm-recipe-status");
      if (statusNode) {
        statusNode.textContent = text;
      }
    },

    renderRecipe(recipe, activeStepIdx = 0) {
      if (!recipe) return;

      const titleNode = this.panel?.querySelector("#cm-video-title");
      if (titleNode && recipe.video_title) {
        titleNode.textContent = recipe.video_title;
      }

      const statusNode = this.panel?.querySelector("#cm-recipe-status");
      if (statusNode) {
        const stats = recipe.stats || {};
        const coverageText = stats.fully_covered ? "Full video analyzed" : "Partial video analyzed";
        statusNode.textContent = `Recipe loaded (${coverageText}): ${recipe.ingredients.length} ingredients, ${recipe.steps.length} cooking steps.`;
      }

      // Render Equipment Needed
      const eqBox = this.panel?.querySelector("#cm-equipment-box");
      const eqPills = this.panel?.querySelector("#cm-equipment-pills");
      if (eqBox && eqPills) {
        eqPills.innerHTML = "";
        if (recipe.equipment && recipe.equipment.length > 0) {
          eqBox.hidden = false;
          recipe.equipment.forEach(eq => {
            const pill = el("span", "cm-badge cm-badge-eq", eq);
            eqPills.append(pill);
          });
        } else {
          eqBox.hidden = true;
        }
      }

      // Render Ingredients List safely using textContent
      const ingBox = this.panel?.querySelector("#cm-ingredients-box");
      const ingList = this.panel?.querySelector("#cm-ingredients-list");
      if (ingBox && ingList) {
        ingList.innerHTML = "";
        if (recipe.ingredients.length > 0) {
          ingBox.hidden = false;
          recipe.ingredients.forEach(ing => {
            const li = el("li", "cm-ingredient-item");
            const nameSpan = el("span", "cm-ing-name", ing.name);

            let qtyBadge;
            if (ing.has_conflict || ing.quantity_uncertain) {
              qtyBadge = el("span", "cm-badge cm-badge-conflict", "⚠️ uncertain / conflicting");
              qtyBadge.title = ing.conflict_details || "Conflicting quantities between transcript and on-screen text";
            } else if (ing.quantity_specified && ing.quantity) {
              const u = ing.unit ? ` ${ing.unit}` : "";
              qtyBadge = el("span", "cm-badge cm-badge-qty", `${ing.quantity}${u}`);
            } else {
              qtyBadge = el("span", "cm-badge cm-badge-unspecified", "unspecified");
            }

            li.append(nameSpan, qtyBadge);
            ingList.append(li);
          });
        } else {
          ingBox.hidden = true;
        }
      }

      // Render Steps List safely
      const stepsBox = this.panel?.querySelector("#cm-steps-box");
      const stepsList = this.panel?.querySelector("#cm-steps-list");
      if (stepsBox && stepsList) {
        stepsList.innerHTML = "";
        if (recipe.steps.length > 0) {
          stepsBox.hidden = false;
          recipe.steps.forEach((step, idx) => {
            const card = el("div", `cm-step-card ${idx === activeStepIdx ? "cm-step-active" : ""}`);
            card.dataset.stepIndex = idx;

            const headerRow = el("div", "cm-step-card-header");
            const stepNum = el("span", "cm-step-number", `Step ${step.step_number}`);
            headerRow.append(stepNum);

            if (step.is_prerequisite) {
              const prereqBadge = el("span", "cm-badge cm-badge-prereq", "⏳ In Advance");
              headerRow.append(prereqBadge);
            }

            const formattedTime = step.time_formatted || (typeof step.start_seconds === "number" && step.start_seconds > 0
              ? `${Math.floor(step.start_seconds / 60)}:${String(Math.floor(step.start_seconds % 60)).padStart(2, "0")}`
              : null);

            if (formattedTime) {
              const timeBadge = el("button", "cm-badge cm-badge-time", `⏱ ${formattedTime}`);
              timeBadge.title = "Jump video to when this step is shown";
              timeBadge.addEventListener("click", () => {
                if (typeof step.start_seconds === "number") {
                  CM.youtubeController.seekTo(step.start_seconds);
                }
              });
              headerRow.append(timeBadge);
            }

            const instructionP = el("p", "cm-step-instruction", step.instruction);
            card.append(headerRow, instructionP);

            if (step.duration_seconds || step.temperature || step.doneness_cue || step.can_parallel) {
              const pillsRow = el("div", "cm-step-meta-row");
              if (step.duration_seconds) {
                pillsRow.append(el("span", "cm-meta-pill", `⏳ ${Math.round(step.duration_seconds / 60)}m`));
              } else if (step.duration_text && step.duration_text !== "unspecified") {
                pillsRow.append(el("span", "cm-meta-pill", `⏳ ${step.duration_text}`));
              }
              if (step.temperature) {
                pillsRow.append(el("span", "cm-meta-pill", `🌡 ${step.temperature}`));
              }
              if (step.doneness_cue) {
                pillsRow.append(el("span", "cm-meta-pill", `👁 ${step.doneness_cue}`));
              }
              if (step.can_parallel) {
                pillsRow.append(el("span", "cm-meta-pill cm-meta-parallel", "⚡ Can parallel"));
              }
              card.append(pillsRow);
            }

            stepsList.append(card);
          });

          this.updateProgress(activeStepIdx, recipe.steps.length);
        } else {
          stepsBox.hidden = true;
        }
      }

      this.updateDebug();
    },

    highlightStep(stepIndex) {
      const cards = this.panel?.querySelectorAll(".cm-step-card");
      if (!cards) return;

      cards.forEach((card, idx) => {
        if (idx === stepIndex) {
          card.classList.add("cm-step-active");
          card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
          card.classList.remove("cm-step-active");
        }
      });

      const total = cards.length;
      this.updateProgress(stepIndex, total);
    },

    updateProgress(currentIdx, total) {
      const prog = this.panel?.querySelector("#cm-steps-progress");
      if (prog && total > 0) {
        prog.textContent = `Step ${currentIdx + 1} of ${total}`;
      }
    },

    resetRecipe() {
      const eqBox = this.panel?.querySelector("#cm-equipment-box");
      const eqPills = this.panel?.querySelector("#cm-equipment-pills");
      const ingBox = this.panel?.querySelector("#cm-ingredients-box");
      const stepsBox = this.panel?.querySelector("#cm-steps-box");
      const ingList = this.panel?.querySelector("#cm-ingredients-list");
      const stepsList = this.panel?.querySelector("#cm-steps-list");
      const statusNode = this.panel?.querySelector("#cm-recipe-status");
      const videoTitle = this.panel?.querySelector("#cm-video-title");

      if (eqBox) eqBox.hidden = true;
      if (eqPills) eqPills.innerHTML = "";
      if (ingBox) ingBox.hidden = true;
      if (stepsBox) stepsBox.hidden = true;
      if (ingList) ingList.innerHTML = "";
      if (stepsList) stepsList.innerHTML = "";
      if (statusNode) statusNode.textContent = "Say \"generate recipe\" or click below to analyze this video.";
      if (videoTitle) videoTitle.textContent = CM.youtubeController?.currentVideo()?.title || "Load a video to begin";
      this.updateDebug();
    },

    sourceStatuses: {
      transcript: "Unavailable",
      ocr: "Unavailable",
      vision: "Unavailable",
      metadata: "Unavailable"
    },

    setSourceStatuses(statuses = {}) {
      if (!statuses) return;
      this.sourceStatuses = { ...this.sourceStatuses, ...statuses };
      const trNode = this.panel?.querySelector("#cm-dbg-src-transcript");
      const ocrNode = this.panel?.querySelector("#cm-dbg-src-ocr");
      const visNode = this.panel?.querySelector("#cm-dbg-src-vision");
      const metaNode = this.panel?.querySelector("#cm-dbg-src-metadata");

      if (trNode && this.sourceStatuses.transcript) trNode.textContent = this.sourceStatuses.transcript;
      if (ocrNode && this.sourceStatuses.ocr) ocrNode.textContent = this.sourceStatuses.ocr;
      if (visNode && this.sourceStatuses.vision) visNode.textContent = this.sourceStatuses.vision;
      if (metaNode && this.sourceStatuses.metadata) metaNode.textContent = this.sourceStatuses.metadata;
    },

    updateDebug() {
      const stateNode = this.panel?.querySelector("#cm-dbg-state");
      const micNode = this.panel?.querySelector("#cm-dbg-mic");
      const covNode = this.panel?.querySelector("#cm-dbg-coverage");
      const segNode = this.panel?.querySelector("#cm-dbg-segments");
      const tsNode = this.panel?.querySelector("#cm-dbg-timestamps");
      const eqNode = this.panel?.querySelector("#cm-dbg-eq-filtered");

      if (stateNode) stateNode.textContent = CM.assistant?.state || "IDLE";
      if (micNode) micNode.textContent = CM.voice?.stream?.active ? "CONNECTED" : "NOT CONNECTED";

      const trNode = this.panel?.querySelector("#cm-dbg-src-transcript");
      const ocrNode = this.panel?.querySelector("#cm-dbg-src-ocr");
      const visNode = this.panel?.querySelector("#cm-dbg-src-vision");
      const metaNode = this.panel?.querySelector("#cm-dbg-src-metadata");

      if (trNode && this.sourceStatuses?.transcript) trNode.textContent = this.sourceStatuses.transcript;
      if (ocrNode && this.sourceStatuses?.ocr) ocrNode.textContent = this.sourceStatuses.ocr;
      if (visNode && this.sourceStatuses?.vision) visNode.textContent = this.sourceStatuses.vision;
      if (metaNode && this.sourceStatuses?.metadata) metaNode.textContent = this.sourceStatuses.metadata;

      const stats = CM.assistant?.currentRecipe?.stats;
      if (stats) {
        if (covNode) covNode.textContent = stats.fully_covered ? "100% COMPLETE" : "PARTIAL";
        if (segNode) segNode.textContent = `${stats.total_segments || 0}`;
        if (tsNode) tsNode.textContent = `${Math.floor(stats.first_timestamp || 0)}s - ${Math.floor(stats.last_timestamp || 0)}s`;
        if (eqNode) eqNode.textContent = `${stats.rejected_equipment_count || 0}`;
      }
    }
  };
})();
