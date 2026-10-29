async function showAccessError(tabId, error) {
  console.error("Domino could not open on this tab.", error);

  try {
    await chrome.action.setBadgeText({ tabId, text: "!" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#b42318" });
    await chrome.action.setTitle({
      tabId,
      title: "Domino cannot access this page. Try a regular webpage."
    });
  } catch (badgeError) {
    console.error("Domino could not show its access error on the toolbar.", badgeError);
  }
}

const styleSheetCache = new Map();
const styleSheetQueues = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    styleSheetCache.delete(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  styleSheetCache.delete(tabId);
  styleSheetQueues.delete(tabId);
});

async function loadStyleSheets(tabId) {
  const target = { tabId };
  let attached = false;
  const headers = new Map();
  const onDebuggerEvent = (source, method, params) => {
    if (source.tabId !== tabId) {
      return;
    }

    if (method === "CSS.styleSheetAdded" && params?.header?.styleSheetId) {
      headers.set(params.header.styleSheetId, params.header);
    } else if (method === "CSS.styleSheetRemoved" && params?.styleSheetId) {
      headers.delete(params.styleSheetId);
    }
  };

  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    chrome.debugger.onEvent.addListener(onDebuggerEvent);
    await chrome.debugger.sendCommand(target, "DOM.enable");
    await chrome.debugger.sendCommand(target, "CSS.enable");
    const { frameTree } = await chrome.debugger.sendCommand(target, "Page.getFrameTree");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const mainFrameId = frameTree?.frame?.id;
    const pageSheets = Array.from(headers.values()).filter((header) =>
      header.frameId === mainFrameId && header.origin === "regular");
    const results = await Promise.all(pageSheets.map(async (header) => {
      try {
        const { text } = await chrome.debugger.sendCommand(target, "CSS.getStyleSheetText", {
          styleSheetId: header.styleSheetId
        });
        return {
          sourceURL: header.sourceURL || "",
          text,
          isInline: Boolean(header.isInline)
        };
      } catch (error) {
        console.error("Domino could not read a page stylesheet.", header.sourceURL || header.styleSheetId, error);
        return null;
      }
    }));
    const styleSheets = results.filter(Boolean);
    return {
      styleSheets,
      incomplete: styleSheets.length !== pageSheets.length
    };
  } finally {
    chrome.debugger.onEvent.removeListener(onDebuggerEvent);
    if (attached) {
      await chrome.debugger.detach(target);
    }
  }
}

function queueStyleSheetLoad(tabId) {
  const cached = styleSheetCache.get(tabId);
  if (cached) {
    return Promise.resolve(cached);
  }

  const previous = styleSheetQueues.get(tabId) || Promise.resolve();
  const current = previous.then(
    async () => {
      const cachedAfterQueue = styleSheetCache.get(tabId);
      if (cachedAfterQueue) {
        return cachedAfterQueue;
      }

      const snapshot = await loadStyleSheets(tabId);
      styleSheetCache.set(tabId, snapshot);
      return snapshot;
    },
    async () => {
      const snapshot = await loadStyleSheets(tabId);
      styleSheetCache.set(tabId, snapshot);
      return snapshot;
    }
  );
  styleSheetQueues.set(tabId, current);
  void current.then(
    () => {
      if (styleSheetQueues.get(tabId) === current) {
        styleSheetQueues.delete(tabId);
      }
    },
    () => {
      if (styleSheetQueues.get(tabId) === current) {
        styleSheetQueues.delete(tabId);
      }
    }
  );
  return current;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "domino:load-style-sheets") {
    return false;
  }

  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") {
    sendResponse({ ok: false, error: "Domino received a stylesheet request without a tab ID." });
    return false;
  }

  void queueStyleSheetLoad(tabId).then(
    (snapshot) => sendResponse({ ok: true, ...snapshot }),
    (error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  );
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== "number") {
    console.error("Domino could not open because the active tab has no ID.");
    return;
  }

  void (async () => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
    } catch (error) {
      await showAccessError(tab.id, error);
      return;
    }

    try {
      await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
      await chrome.action.setTitle({
        tabId: tab.id,
        title: "Toggle Domino toolbox"
      });
    } catch (error) {
      console.error("Domino opened, but could not reset its toolbar status.", error);
    }
  })();
});
