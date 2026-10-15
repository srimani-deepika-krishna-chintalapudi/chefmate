(() => {
  const CM = (window.ChefMate = window.ChefMate || {});

  const parseTimestamp = (text) => {
    if (!text) return 0;
    const match = text.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
    if (!match) return 0;
    return (
      (Number(match[1] || 0) * 3600) +
      (Number(match[2]) * 60) +
      Number(match[3])
    );
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function openTranscriptPanel() {
    // 1. Check if segments already exist
    if (document.querySelectorAll("ytd-transcript-segment-renderer").length > 0) {
      return true;
    }

    // 2. Expand description first if needed
    const expandBtn = document.querySelector(
      "#description-inline-expander #expand, ytd-text-inline-expander #expand"
    );
    if (expandBtn && expandBtn.offsetParent !== null) {
      try { expandBtn.click(); } catch (_) {}
      await delay(250);
    }

    // 3. Look for "Show transcript" button in description
    const transcriptBtn = document.querySelector(
      "ytd-video-description-transcript-section-renderer button, button[aria-label*='transcript' i]"
    );
    if (transcriptBtn && transcriptBtn.offsetParent !== null) {
      transcriptBtn.click();
      await delay(700);
    } else {
      // 4. Try 3-dots menu under video
      const menuBtn = document.querySelector(
        "ytd-watch-metadata #menu button[aria-label*='More actions' i], #top-level-buttons-computed + ytd-menu-renderer button"
      );
      if (menuBtn) {
        menuBtn.click();
        await delay(300);
        const menuItems = Array.from(document.querySelectorAll("ytd-menu-service-item-renderer, tp-yt-paper-item"));
        const showTranscriptItem = menuItems.find(el => /transcript/i.test(el.textContent || ""));
        if (showTranscriptItem) {
          showTranscriptItem.click();
          await delay(700);
        } else {
          try { menuBtn.click(); } catch (_) {}
        }
      }
    }

    // 5. Wait for segment renderers to appear
    for (let i = 0; i < 6; i++) {
      if (document.querySelectorAll("ytd-transcript-segment-renderer").length > 0) {
        return true;
      }
      await delay(350);
    }
    return false;
  }

  function findScrollContainer() {
    const firstSegment = document.querySelector("ytd-transcript-segment-renderer");
    if (firstSegment) {
      let parent = firstSegment.parentElement;
      while (parent && parent !== document.body) {
        const overflowY = window.getComputedStyle(parent).overflowY;
        if (overflowY === "auto" || overflowY === "scroll" || parent.scrollHeight > parent.clientHeight + 50) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }
    return document.querySelector(
      "#segments-container, ytd-transcript-segment-list-renderer, ytd-transcript-search-panel-renderer #content"
    );
  }

  function collectVisibleSegments(segmentMap) {
    const elements = document.querySelectorAll("ytd-transcript-segment-renderer");
    elements.forEach((el) => {
      const timeStr = el.querySelector(".segment-timestamp, [class*='timestamp']")?.textContent?.trim() || "";
      const text = el.querySelector(".segment-text, [class*='text']")?.textContent?.trim() || "";
      if (!text) return;

      const start = parseTimestamp(timeStr);
      // Deduplicate using timestamp + normalized text to avoid dropping multiple distinct lines at same second
      const key = `${start}_${text.toLowerCase().replace(/\s+/g, ' ')}`;
      if (!segmentMap.has(key)) {
        segmentMap.set(key, {
          text,
          start,
          end: start + 5,
          source: "transcript"
        });
      }
    });
  }

  async function collectFullTranscriptFromDOM() {
    const segmentMap = new Map();
    collectVisibleSegments(segmentMap);

    const container = findScrollContainer();
    const video = document.querySelector("video");
    const totalDuration = video && Number.isFinite(video.duration) ? video.duration : 0;

    if (container && container.scrollHeight > container.clientHeight) {
      console.debug("[CHEFMATE TRANSCRIPT] Scrolling transcript container to gather complete video...", {
        initialSegments: segmentMap.size,
        scrollHeight: container.scrollHeight,
        totalDuration
      });

      let lastCount = 0;
      let unchangedRounds = 0;
      const maxScrollIterations = 50; // Safeguard against infinite loops

      for (let iter = 0; iter < maxScrollIterations; iter++) {
        container.scrollTop += 650;
        await delay(120);
        collectVisibleSegments(segmentMap);

        if (segmentMap.size === lastCount) {
          unchangedRounds++;
          if (unchangedRounds >= 4) {
            // Check if we hit the bottom
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 60) {
              break;
            }
          }
        } else {
          unchangedRounds = 0;
          lastCount = segmentMap.size;
        }

        // If we know video duration and have collected up to the last 30 seconds
        const highestTime = Math.max(...Array.from(segmentMap.keys()), 0);
        if (totalDuration > 60 && highestTime >= totalDuration - 30) {
          break;
        }
      }

      // Reset scroll position gracefully
      try {
        container.scrollTop = 0;
      } catch (_) {}
    }

    const segments = Array.from(segmentMap.values()).sort((a, b) => a.start - b.start);

    // Refine end timestamps based on next segment's start
    for (let i = 0; i < segments.length; i++) {
      if (i + 1 < segments.length) {
        const nextStart = segments[i + 1].start;
        if (nextStart > segments[i].start) {
          segments[i].end = nextStart;
        }
      }
    }

    return segments;
  }

  CM.transcriptExtractor = {
    async getSegments() {
      try {
        const opened = await openTranscriptPanel();
        if (opened) {
          const segments = await collectFullTranscriptFromDOM();
          if (segments.length > 0) {
            const video = document.querySelector("video");
            const totalDuration = video && Number.isFinite(video.duration) ? video.duration : 0;
            const firstTimestamp = segments[0].start;
            const lastTimestamp = segments[segments.length - 1].start;
            const fullyCovered = totalDuration > 0 ? (lastTimestamp >= Math.min(totalDuration * 0.75, totalDuration - 45)) : true;

            console.log(`[CHEFMATE FLOW] Extraction completed: ${segments.length} segments captured | Coverage: ${firstTimestamp}s -> ${lastTimestamp}s | fullyCovered=${fullyCovered}`);

            return {
              success: true,
              segments,
              count: segments.length,
              firstTimestamp,
              lastTimestamp,
              totalDuration,
              fullyCovered
            };
          }
        }
      } catch (err) {
        console.warn("[CHEFMATE TRANSCRIPT] DOM transcript panel error:", err);
      }

      return {
        success: false,
        segments: [],
        count: 0,
        firstTimestamp: 0,
        lastTimestamp: 0,
        totalDuration: 0,
        fullyCovered: false,
        message: "No subtitles or transcript panel available for this video."
      };
    }
  };
})();
