# ChefMate — Context-Aware, Hands-Free YouTube Cooking Assistant

ChefMate is a Chrome extension (Manifest V3) and Machine Learning-powered assistant designed for hands-free cooking with YouTube. It extracts recipes from video descriptions and subtitles, manages an interactive cooking conversation state machine, provides two-way voice communication (Speech Recognition + Speech Synthesis), and controls YouTube playback and search.

---

## 🚀 Quick Start Guide

### Step 1: Start the ML Intent API (Optional but Recommended)
Open a terminal in the project directory:
```powershell
cd c:\Users\SrimaniD\Desktop\chefmate\chefmate-main
..\.venv\Scripts\uvicorn.exe ml_api:app --host 127.0.0.1 --port 8000
```
- The ML API runs locally at `http://127.0.0.1:8000`.
- Linear SVM intent classifier with TF-IDF serves predictions, top scores, and margin gaps.
- *Note:* ChefMate also features built-in rule and context fallbacks, so the extension can operate even if the Python service is offline.

### Step 2: Install the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the folder: `c:\Users\SrimaniD\Desktop\chefmate\chefmate-main\extension`.
5. The **ChefMate — YouTube Cooking Assistant** extension will appear in your extensions list.

### Step 3: Use ChefMate on YouTube
1. Open any cooking video on [YouTube](https://www.youtube.com).
2. Look for the **🍳 ChefMate** button located below the video title/actions bar.
3. Click **🍳 ChefMate** to activate the assistant.
4. When prompted by Chrome, click **Allow** for microphone access.
5. Speak your command naturally!

---

## 🎙 Voice Interaction Walkthrough

| Step | What You Say | What ChefMate Does |
| :--- | :--- | :--- |
| **1. Generate Recipe** | *"ChefMate, generate recipe"* | Gathers description & transcript, extracts ingredients and chronological steps. Speaks: *"I've prepared the recipe. Would you like me to tell you the ingredients and their quantities first?"* |
| **2. Hear Ingredients** | *"Yes"* / *"Sure"* | Reads confirmed recipe ingredients with quantities and flags unspecified ones. Asks: *"Would you like me to start the cooking instructions?"* |
| **3. Skip Ingredients** | *"No"* / *"Skip ingredients"* | Acknowledges and jumps directly to Step 1 without listing ingredients. |
| **4. Step Navigation** | *"Next step"* | Advances to the next cooking step, highlights it in the panel, and speaks it. Jumps the YouTube video to the corresponding timestamp. |
| **5. Repeat Step** | *"Repeat"* / *"Say that again"* | Repeats the current step instruction. |
| **6. Previous Step** | *"Previous step"* | Returns to the previous cooking step and speaks it. (Gracefully reports if already on step 1). |
| **7. Step Details** | *"Explain this step"* | Provides duration, temperature, and doneness cues associated with the current step. |
| **8. Quantity Query** | *"How much milk?"* | Answers with the exact quantity & unit for that ingredient. |
| **9. Direct Jump** | *"Go to step 3"* | Jumps directly to Step 3. |
| **10. Video Playback** | *"Pause video"*, *"Play video"*, *"Mute"*, *"Skip ad"* | Controls YouTube video playback hands-free. |
| **11. Voice Search** | *"Search YouTube for pasta recipe"* | Navigates to YouTube search results. |

---

## 🧪 Running the Automated Tests

### 1. Test Recipe Extraction Logic
Tests ingredient parsing, fractions, units, duration/temperature extraction, and commentary filtering:
```powershell
node c:\Users\SrimaniD\Desktop\chefmate\tests\test_recipe_extractor.js
```

### 2. Test End-to-End Voice & Context Workflow
Tests the full conversation state machine, context disambiguation, step navigation, and video reset:
```powershell
node c:\Users\SrimaniD\Desktop\chefmate\tests\test_voice_workflow.js
```

### 3. Test Machine Learning Model
Tests Linear SVM intent classification on sample commands:
```powershell
c:\Users\SrimaniD\Desktop\chefmate\.venv\Scripts\python.exe c:\Users\SrimaniD\Desktop\chefmate\chefmate-main\test_commands.py
```

---

## 📁 Architecture Overview

- `manifest.json`: Manifest V3 configuration matching all extension scripts.
- `youtube-controller.js`: YouTube video controls, metadata extraction, search navigation, and timestamp seeking.
- `youtube-transcript.js`: Subtitle and transcript segment extraction with automated panel opening.
- `recipe-extractor.js`: Recipe extraction engine reconciling description and transcript evidence into the unified recipe schema.
- `voice.js`: Two-way voice engine using `webkitSpeechRecognition` (STT) and `speechSynthesis` (TTS) with interrupt support.
- `command-parser.js`: Context-aware command understanding combining Python ML API predictions and disambiguation rules.
- `command-executor.js`: Central state machine (`IDLE` $\to$ `ANALYZING` $\to$ `ASK_INGREDIENTS` $\to$ `STEP_BY_STEP` $\to$ `COMPLETED`).
- `recipe-ui.js`: Clean light aesthetic blue interface with safe DOM rendering (`textContent`).
- `chefmate.css`: High-contrast, aesthetic blue UI styles.
- `ml_api.py`: FastAPI server for Linear SVM predictions with decision margin metrics.
