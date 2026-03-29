/**
 * UX Pulse — Messaging Helpers
 * Abstracts chrome.runtime message passing.
 */

function sendToBackground(type, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function sendToContentScript(tabId, type, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, { type, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script may not be loaded yet — not fatal
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (err) {
      resolve(null);
    }
  });
}

function broadcastToAllTabs(type, payload = {}) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
        sendToContentScript(tab.id, type, payload);
      }
    }
  });
}
