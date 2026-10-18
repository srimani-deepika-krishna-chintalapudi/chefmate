
chrome.runtime.onInstalled.addListener(() => {});

const ML_API_URL = "http://127.0.0.1:8000";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CHEFMATE_CAPTURE_FRAME") {
    if (typeof chrome !== "undefined" && chrome.tabs && typeof chrome.tabs.captureVisibleTab === "function") {
      const windowId = (sender && sender.tab && typeof sender.tab.windowId === "number") ? sender.tab.windowId : null;
      try {
        chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 65 }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.warn("[ChefMate BG] captureVisibleTab lastError:", chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else if (!dataUrl) {
            sendResponse({ success: false, error: "Empty frame captured" });
          } else {
            sendResponse({ success: true, dataUrl });
          }
        });
      } catch (capErr) {
        console.warn("[ChefMate BG] captureVisibleTab exception:", capErr);
        sendResponse({ success: false, error: capErr.message });
      }
      return true;
    } else {
      sendResponse({ success: false, error: "captureVisibleTab is not available" });
      return false;
    }
  }

  if (message?.type === "CHEFMATE_CHECK_HEALTH") {
    fetch(`${ML_API_URL}/health`, {
      method: "GET"
    })
      .then(async response => {
        sendResponse({ success: response.ok, status: response.status });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message?.type !== "CHEFMATE_PREDICT_INTENT") {
    return;
  }

  fetch(`${ML_API_URL}/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: message.text })
  })
    .then(async response => {
      if (!response.ok) {
        throw new Error(`ML API returned HTTP ${response.status}`);
      }

      return response.json();
    })
    .then(data => sendResponse({ success: true, ...data }))
    .catch(error => {
      console.error("[ChefMate ML]", error);
      sendResponse({
        success: false,
        error: error.message
      });
    });

  return true;
});
