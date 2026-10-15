
chrome.runtime.onInstalled.addListener(() => {});

const ML_API_URL = "http://127.0.0.1:8000";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
