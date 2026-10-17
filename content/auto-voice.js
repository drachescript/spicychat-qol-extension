// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const SESSION_KEY = "ds-qol-auto-voice-enabled";
  const BASELINE_GRACE_MS = 900;

  let routeKey = "";
  let routeStartedAt = 0;
  let lastKnownListenButton = null;
  let lastKnownMessageSignature = "";
  let seenButtons = new WeakSet();
  let pendingButtons = new WeakSet();

  function getListenButtons(root = document) {
    return DS.qsa('button[aria-label="Volume2-button"]', root)
      .filter(button => !button.closest("#ds-qol-panel"));
  }

  function readEnabled() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }

  function writeEnabled(enabled) {
    try {
      if (enabled) sessionStorage.setItem(SESSION_KEY, "1");
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  }


  function messageSignature(button) {
    if (!button) return "";

    const row = button.closest?.(".w-full.flex.mb-lg.bg-transparent") ||
      button.closest?.("[class*='mb-lg'][class*='bg-transparent']") ||
      button.parentElement?.parentElement?.parentElement?.parentElement;
    if (!row) return "";

    const text = String(row.textContent || "").replace(/\s+/g, " ").trim();
    const avatar = row.querySelector?.("img[alt]")?.getAttribute("alt") || "";
    return `${avatar}|${text.slice(-1800)}`;
  }

  function seedCurrentButtons() {
    const buttons = getListenButtons();
    for (const button of buttons) seenButtons.add(button);
    lastKnownListenButton = buttons.length ? buttons[buttons.length - 1] : null;
    lastKnownMessageSignature = messageSignature(lastKnownListenButton);
    return buttons;
  }

  function resetForRoute() {
    routeKey = location.pathname;
    routeStartedAt = Date.now();
    seenButtons = new WeakSet();
    pendingButtons = new WeakSet();
    seedCurrentButtons();
  }

  function comesAfter(reference, candidate) {
    if (!reference?.isConnected || !candidate?.isConnected || reference === candidate) return false;

    try {
      return !!(reference.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING);
    } catch {
      return false;
    }
  }

  function queueListen(button) {
    if (!button || pendingButtons.has(button)) return;
    pendingButtons.add(button);

    setTimeout(() => {
      pendingButtons.delete(button);

      if (!readEnabled() || !DS.isSingleChatPage?.() || !button.isConnected) return;
      if (button.disabled || button.getAttribute("aria-disabled") === "true") {
        seenButtons.delete(button);
        return;
      }

      try {
        button.click();
      } catch {
        DS.realClick?.(button);
      }
    }, 350);
  }

  DS.isAutoVoiceEnabled = function isAutoVoiceEnabled() {
    return readEnabled();
  };

  DS.isNativeVoiceAvailable = function isNativeVoiceAvailable() {
    return !!getListenButtons().length;
  };

  DS.setAutoVoiceEnabled = function setAutoVoiceEnabled(enabled) {
    // Anything already on-screen is history, not a new reply. Seed it before
    // enabling so turning Auto voice on never starts reading the backlog.
    seedCurrentButtons();
    writeEnabled(!!enabled);
    DS.setQuickStatus?.(enabled ? "Auto voice enabled for new replies." : "Auto voice disabled.");
    DS.updateQuickPanel?.();
    return !!enabled;
  };

  DS.toggleAutoVoice = function toggleAutoVoice() {
    return DS.setAutoVoiceEnabled?.(!readEnabled());
  };

  // Auto Conversation Images. Independent of Auto Voice and the composer.
  // Intentionally reuses the native image button; never edits or sends chat text.
  const IMAGE_PREF_PREFIX = "dsQolAutoImageV1:";
  const IMAGE_WRAPPER_CLASS = "ds-qol-auto-image-wrap";
  const IMAGE_PANEL_ID = "ds-qol-auto-image-panel";
  const IMAGE_MIN_GAP_MS = 120000;
  const imageState = { route: "", ready: false, enabled: false, every: 5, seen: "", count: 0,
    lastNode: null, lastClick: 0, running: false, pending: null, token: 0 };

  function imageRoute() { return String(location.pathname || "").replace(/\/+$/, ""); }
  function imagePrefKey(route = imageRoute()) { return `${IMAGE_PREF_PREFIX}${encodeURIComponent(route)}`; }
  function imageChatAvailable() { return !!(DS.state?.settings?.enabled && DS.isSingleChatPage?.()); }
  function nativeImageButton() { return document.querySelector('button[data-testid="ImageGenerationButton"][aria-label="generate-image"]'); }
  function lastAiImageMessage() {
    const buttons = document.querySelectorAll('[id^="message-"] button[data-testid="ChatBar-ListenButton"]');
    const button = buttons[buttons.length - 1];
    const root = button?.closest?.('[id^="message-"]') || null;
    return root && root.isConnected ? root : null;
  }
  function seedImages() {
    const root = lastAiImageMessage(); imageState.lastNode = root; imageState.seen = root?.id || "";
  }
  async function restoreImagePrefs(route, token) {
    try {
      const response = await DS.storageGet?.([imagePrefKey(route)]);
      if (imageState.route !== route || imageState.token !== token) return;
      const stored = response?.[imagePrefKey(route)] || {};
      imageState.enabled = stored.enabled === true;
      imageState.every = [3, 5, 10, 20].includes(Number(stored.every)) ? Number(stored.every) : 5;
    } catch { imageState.enabled = false; }
    if (imageState.route === route && imageState.token === token) {
      imageState.ready = true; updateImageButton();
    }
  }
  function resetImageRoute() {
    clearTimeout(imageState.pending); imageState.pending = null;
    document.getElementById(IMAGE_PANEL_ID)?.remove();
    document.querySelectorAll(`.${IMAGE_WRAPPER_CLASS}`).forEach(el => el.remove());
    imageState.route = imageRoute(); imageState.token++;
    imageState.ready = false; imageState.enabled = false; imageState.every = 5;
    imageState.count = 0; imageState.lastClick = 0; imageState.running = false;
    seedImages();
    void restoreImagePrefs(imageState.route, imageState.token);
  }
  async function saveImagePrefs() {
    if (!imageState.ready) return;
    const route = imageState.route;
    const data = { enabled: imageState.enabled, every: imageState.every };
    try {
      await DS.storageSet?.({ [imagePrefKey(route)]: data });
      if (route === imageState.route) updateImageButton();
    } catch { DS.setQuickStatus?.("Auto image settings could not be saved."); }
  }
  function updateImageButton() {
    const button = document.querySelector(`.${IMAGE_WRAPPER_CLASS} button`);
    if (!button) return;
    button.textContent = imageState.ready ? (imageState.enabled ? `Img ${imageState.every}` : "Img") : "Img…";
    button.title = imageState.ready ? (imageState.enabled ? `Auto images on · every ${imageState.every} new replies` : "Auto images off") : "Loading auto image settings";
    button.setAttribute("aria-pressed", imageState.enabled ? "true" : "false");
  }
  function closeImagePanel() { document.getElementById(IMAGE_PANEL_ID)?.remove(); }
  function runNativeImage({ manual = false } = {}) {
    const button = nativeImageButton();
    if (!imageChatAvailable() || !button?.isConnected || button.disabled || button.getAttribute("aria-disabled") === "true") return false;
    if (!manual && (!imageState.enabled || !imageState.ready || (typeof document.hasFocus === "function" && !document.hasFocus()))) return false;
    if (document.querySelector('[role="dialog"][aria-modal="true"], [data-state="open"][role="dialog"]')) return false;
    const now = Date.now();
    if (imageState.running || now - imageState.lastClick < IMAGE_MIN_GAP_MS) return false;
    imageState.running = true;
    imageState.lastClick = now;
    // HTMLElement.click() dispatches the button action but does not type, focus,
    // or submit the composer. No synthetic keyboard/mouse events are sent.
    try {
      button.click();
      DS.setQuickStatus?.("Requested a conversation image through SpicyChat's image button.");
      return true;
    } catch (error) {
      imageState.lastClick = 0;
      DS.runtimeLog?.("warn", "auto-image", "Native image button failed", error);
      return false;
    } finally {
      imageState.running = false;
    }
  }
  function scheduleNativeImage() {
    if (imageState.pending || !imageState.enabled) return;
    const route = imageState.route;
    imageState.pending = setTimeout(() => {
      imageState.pending = null;
      if (route !== imageState.route || !imageState.enabled || document.hidden) return;
      runNativeImage();
    }, 850);
  }
  function openImagePanel(anchorButton) {
    closeImagePanel();
    if (!imageState.ready) return;
    const panel = document.createElement("div"); panel.id = IMAGE_PANEL_ID;
    Object.assign(panel.style, { position: "fixed", zIndex: "2147483000", width: "min(310px,calc(100vw - 24px))",
      background: "#1c1d20", color: "#fff", border: "1px solid #51535b", borderRadius: "12px", padding: "12px",
      boxShadow: "0 8px 28px #0008", fontSize: "13px", display: "grid", gap: "9px" });
    const heading = document.createElement("strong"); heading.textContent = "Automatic conversation images";
    const label = document.createElement("label"); label.style.display = "flex"; label.style.gap = "8px";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = imageState.enabled;
    label.append(checkbox, document.createTextNode("Generate images automatically in this chat"));
    const selectLabel = document.createElement("label"); selectLabel.textContent = "After new AI replies: ";
    const select = document.createElement("select");
    for (const n of [3, 5, 10, 20]) { const opt = document.createElement("option"); opt.value = String(n); opt.textContent = String(n); select.append(opt); }
    select.value = String(imageState.every); selectLabel.append(select);
    const note = document.createElement("small");
    note.textContent = "Off by default · current chat only · uses SpicyChat's native image button · at most one request per 2 minutes. Never types or sends messages. Image availability and limits still depend on SpicyChat.";
    const actions = document.createElement("div"); actions.style.display = "flex"; actions.style.gap = "8px";
    const manual = document.createElement("button"); manual.type = "button"; manual.textContent = "Generate now";
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Close";
    for (const btn of [manual, close]) Object.assign(btn.style, { border: "1px solid #666", color: "inherit", padding: "5px 9px", borderRadius: "6px", background: "#37383d" });
    checkbox.addEventListener("change", () => { imageState.enabled = checkbox.checked; imageState.count = 0; seedImages(); clearTimeout(imageState.pending); imageState.pending = null; void saveImagePrefs(); });
    select.addEventListener("change", () => { imageState.every = Number(select.value) || 5; imageState.count = 0; seedImages(); void saveImagePrefs(); });
    manual.addEventListener("click", () => { if (!runNativeImage({ manual: true })) DS.setQuickStatus?.("Image generation unavailable, busy, or cooling down."); });
    close.addEventListener("click", closeImagePanel);
    actions.append(manual, close); panel.append(heading, label, selectLabel, note, actions);
    document.body.append(panel);
    const rect = anchorButton.getBoundingClientRect();
    const width = Math.min(310, window.innerWidth-24);
    panel.style.left = `${Math.max(12, Math.min(window.innerWidth-width-12, rect.left))}px`;
    panel.style.top = `${Math.max(12, Math.min(window.innerHeight-panel.offsetHeight-12, rect.top-panel.offsetHeight-8))}px`;
  }
  function ensureImageButton() {
    const native = nativeImageButton();
    if (!native) return;
    if (document.querySelector(`.${IMAGE_WRAPPER_CLASS}`)?.isConnected) return;
    const container = native.closest(".inline-flex.max-w-full") || native.parentElement;
    if (!container?.parentElement) return;
    const wrapper = document.createElement("div"); wrapper.className = IMAGE_WRAPPER_CLASS;
    const btn = document.createElement("button"); btn.type = "button";
    btn.setAttribute("aria-label", "Automatic image generation settings");
    Object.assign(btn.style, { minWidth: "38px", height: "32px", borderRadius: "9px", border: "1px solid #6668", background: "transparent", color: "inherit", fontSize: "11px", cursor: "pointer" });
    btn.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openImagePanel(btn); });
    wrapper.append(btn); container.insertAdjacentElement("afterend", wrapper); updateImageButton();
  }
  DS.openAutoImageSettings = function openAutoImageSettings() {
    if (!imageChatAvailable() || !imageState.ready) return false;
    ensureImageButton();
    const anchor = document.querySelector(`.${IMAGE_WRAPPER_CLASS} button`);
    if (!anchor) return false;
    openImagePanel(anchor);
    return true;
  };

  DS.applyAutoImage = function applyAutoImage() {
    if (!imageChatAvailable()) {
      if (imageState.route) { imageState.route = ""; imageState.token++; clearTimeout(imageState.pending); imageState.pending = null; }
      closeImagePanel(); document.querySelectorAll(`.${IMAGE_WRAPPER_CLASS}`).forEach(el => el.remove());
      return;
    }
    if (imageState.route !== imageRoute()) resetImageRoute();
    ensureImageButton();
    // Disabled state is intentionally idle: no message queries or recurring scans.
    if (!imageState.ready || !imageState.enabled) return;
    const newest = lastAiImageMessage();
    if (!newest) return;
    if (!imageState.seen) { imageState.lastNode = newest; imageState.seen = newest.id; return; }
    if (newest.id === imageState.seen) return;
    const older = imageState.lastNode;
    // A full React rerender or loading earlier messages must not generate an image.
    const trulyAppended = older?.isConnected && !!(older.compareDocumentPosition(newest) & Node.DOCUMENT_POSITION_FOLLOWING);
    imageState.seen = newest.id; imageState.lastNode = newest;
    if (!trulyAppended) return;
    imageState.count += 1;
    if (imageState.count >= imageState.every) { imageState.count = 0; scheduleNativeImage(); }
  };

  DS.applyAutoVoice = function applyAutoVoice() {
    if (!DS.state?.settings?.enabled || !DS.isSingleChatPage?.()) {
      routeKey = "";
      lastKnownListenButton = null;
      lastKnownMessageSignature = "";
      seenButtons = new WeakSet();
      pendingButtons = new WeakSet();
      return;
    }

    if (routeKey !== location.pathname) {
      resetForRoute();
      return;
    }

    const previousLast = lastKnownListenButton;
    const insideRouteBaseline = Date.now() - routeStartedAt < BASELINE_GRACE_MS;
    const laneRoots = DS.getCurrentMessageLaneRoots?.() || [];
    const needsFullList = insideRouteBaseline || !previousLast?.isConnected || !laneRoots.length;
    const buttons = needsFullList
      ? getListenButtons()
      : [...new Set(laneRoots.flatMap(root => getListenButtons(root)))];

    if (!readEnabled() || insideRouteBaseline) {
      const baselineButtons = needsFullList ? buttons : getListenButtons();
      for (const button of baselineButtons) seenButtons.add(button);
      lastKnownListenButton = baselineButtons.length ? baselineButtons[baselineButtons.length - 1] : previousLast;
      lastKnownMessageSignature = messageSignature(lastKnownListenButton) || lastKnownMessageSignature;
      return;
    }

    let queued = false;
    let newestCandidate = previousLast?.isConnected ? previousLast : null;

    for (const button of buttons) {
      if (seenButtons.has(button)) continue;
      seenButtons.add(button);

      // Loading older history inserts Listen buttons before the newest message.
      // Only an appended button after our previous newest one counts as a new reply.
      const appendedAfterNewest = previousLast?.isConnected
        ? comesAfter(previousLast, button)
        : buttons.length === 1;

      if (appendedAfterNewest) {
        queueListen(button);
        queued = true;
        if (!newestCandidate || comesAfter(newestCandidate, button)) newestCandidate = button;
      }
    }

    const newest = needsFullList
      ? (buttons.length ? buttons[buttons.length - 1] : previousLast)
      : (newestCandidate || previousLast);
    const newestSignature = messageSignature(newest);

    // SpicyChat sometimes rebuilds the whole message list, which disconnects the
    // previous button. In that case compare the newest message itself so a fresh
    // reply is still read while older-history loads remain ignored.
    if (
      !queued &&
      readEnabled() &&
      newest?.isConnected &&
      previousLast &&
      !previousLast.isConnected &&
      newestSignature &&
      lastKnownMessageSignature &&
      newestSignature !== lastKnownMessageSignature
    ) {
      queueListen(newest);
    }

    lastKnownListenButton = newest;
    lastKnownMessageSignature = newestSignature || lastKnownMessageSignature;
  };
})();

}
