const assert = require("assert");

// Setup minimal browser-like environment for testing recipeExtractor.subtitleSweep
global.window = global;
global.ChefMate = {};
const CM = global.ChefMate;

// Load recipe-extractor.js
const recipeExtractor = require("../extension/recipe-extractor.js");
CM.recipeExtractor = recipeExtractor;

console.log("=========================================");
console.log("RUNNING SUBTITLE SWEEP PLAYBACK SUITE");
console.log("=========================================\n");

let passed = 0;
let total = 0;

function it(description, fn) {
  total++;
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  PASS: ${description}`);
    })
    .catch((err) => {
      console.error(`  FAIL: ${description}`);
      console.error(err);
      process.exitCode = 1;
    });
}

// Mock transcriptExtractor
CM.transcriptExtractor = {
  async getSegments() {
    return {
      success: true,
      segments: [
        { text: "Welcome to the cooking show", start: 0, end: 5 },
        { text: "Add 2 cups of flour", start: 10, end: 15 }
      ]
    };
  }
};

class MockVideoElement {
  constructor(options = {}) {
    this.currentTime = options.currentTime ?? 12.5;
    this.duration = options.duration ?? 180;
    this.paused = options.paused ?? false;
    this.ended = options.ended ?? false;
    this.muted = options.muted ?? false;
    this.volume = options.volume ?? 0.8;
    this.playbackRate = options.playbackRate ?? 1.25;
    this.isConnected = options.isConnected ?? true;
    this.readyState = options.readyState ?? 4;
    this.eventListeners = {};
    this.playCallCount = 0;
    this.playRejectError = options.playRejectError ?? null;
  }

  addEventListener(event, callback) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(callback);
    if (event === "seeked") {
      // Simulate asynchronous seek completion
      setTimeout(() => callback(), 10);
    }
  }

  removeEventListener(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
  }

  async play() {
    this.playCallCount++;
    if (this.playRejectError) {
      throw this.playRejectError;
    }
    this.paused = false;
    return Promise.resolve();
  }
}

async function runTests() {
  await it("Case 1: Video playing prior to sweep restores state, awaits seeked, and resumes play", async () => {
    const video = new MockVideoElement({
      currentTime: 45.0,
      paused: false,
      volume: 0.7,
      playbackRate: 1.5,
      muted: true
    });

    // Simulate playback head advancing or altering during sweep
    CM.transcriptExtractor.getSegments = async () => {
      video.currentTime = 90.0;
      video.playbackRate = 2.0;
      video.volume = 0.2;
      return {
        success: true,
        segments: [{ text: "Step 1: Prep", start: 0, end: 10 }]
      };
    };

    const result = await CM.recipeExtractor.subtitleSweep(video);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(video.currentTime, 45.0, "Original currentTime restored");
    assert.strictEqual(video.volume, 0.7, "Original volume restored");
    assert.strictEqual(video.playbackRate, 1.5, "Original playbackRate restored");
    assert.strictEqual(video.muted, true, "Original mute state restored");
    assert.strictEqual(video.playCallCount, 1, "video.play() was called to resume playback");
  });

  await it("Case 2: Video paused prior to sweep restores state and does NOT call play()", async () => {
    const video = new MockVideoElement({
      currentTime: 30.0,
      paused: true,
      volume: 1.0,
      playbackRate: 1.0,
      muted: false
    });

    CM.transcriptExtractor.getSegments = async () => {
      video.currentTime = 60.0;
      return {
        success: true,
        segments: [{ text: "Chop the onions", start: 0, end: 5 }]
      };
    };

    const result = await CM.recipeExtractor.subtitleSweep(video);
    assert.strictEqual(result.success, true);
    assert.strictEqual(video.currentTime, 30.0, "Original currentTime restored");
    assert.strictEqual(video.playCallCount, 0, "video.play() must NOT be called when originally paused");
  });

  await it("Case 3: Video play rejects with AbortError is handled gracefully without failing the sweep", async () => {
    const abortError = new Error("The play() request was interrupted by a new load request.");
    abortError.name = "AbortError";

    const video = new MockVideoElement({
      currentTime: 15.0,
      paused: false,
      playRejectError: abortError
    });

    const result = await CM.recipeExtractor.subtitleSweep(video);
    assert.strictEqual(result.success, true, "Sweep must succeed despite AbortError on play()");
    assert.strictEqual(video.playCallCount, 1, "video.play() was attempted");
    assert.strictEqual(video.currentTime, 15.0, "Position was restored");
  });

  await it("Case 4: User paused video during sweep -> does not force resume playback", async () => {
    const video = new MockVideoElement({
      currentTime: 10.0,
      paused: false
    });

    CM.transcriptExtractor.getSegments = async () => {
      // User pauses video while extraction is running
      video.paused = true;
      return { success: true, segments: [] };
    };

    const result = await CM.recipeExtractor.subtitleSweep(video);
    assert.strictEqual(result.success, true);
    assert.strictEqual(video.playCallCount, 0, "Do not resume if user paused video during sweep");
  });

  await it("Case 5: Video disconnected from DOM does not cause playback errors", async () => {
    const video = new MockVideoElement({
      currentTime: 20.0,
      paused: false,
      isConnected: false
    });

    const result = await CM.recipeExtractor.subtitleSweep(video);
    assert.strictEqual(result.success, true);
    assert.strictEqual(video.playCallCount, 0, "Disconnected video is not played");
  });

  await it("Case 6: Extraction error during sweep restores state in finally and reports error cleanly", async () => {
    const video = new MockVideoElement({
      currentTime: 50.0,
      paused: false
    });

    CM.transcriptExtractor.getSegments = async () => {
      video.currentTime = 100.0;
      throw new Error("Simulated transcript extraction failure");
    };

    const result = await CM.recipeExtractor.subtitleSweep(video);
    assert.strictEqual(result.success, false);
    assert.strictEqual(video.currentTime, 50.0, "finally block restores playback position even on error");
    assert.strictEqual(video.playCallCount, 1, "finally block attempts resume even on error");
  });

  console.log(`\nResults: ${passed} passed, ${total - passed} failed of ${total} tests.`);
}

runTests();
