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
