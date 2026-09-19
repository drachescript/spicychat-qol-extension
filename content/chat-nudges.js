(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const STORE_KEY = "chatNudgeSubscriptionsV1";
  const MAX_SUBSCRIPTIONS = 2;
  const BUTTON_CLASS = "ds-chat-nudge-button";
  const WORKER_QUERY_KEYS = ["dsQuickDislike", "dsListingRefill", "dsPersonaRefresh"];

  let loaded = false;
  let store = [];
  let lastRoute = "";
  let lastSignature = "";
  let lastWriteAt = 0;
  let pendingToastShownFor = "";

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isWorkerPage() {
    try {
      const params = new URLSearchParams(location.search || "");
      return WORKER_QUERY_KEYS.some(key => params.get(key) === "1");
    } catch {
      return false;
    }
  }

  function currentChatId() {
    return clean(DS.chatIdFromHref?.(location.href || ""));
  }

  function currentBotName() {
    return clean(
      document.querySelector("a[aria-label='chatbot-profile'] h1")?.textContent ||
      document.querySelector("a[aria-label='chatbot-profile']")?.textContent ||
      DS.getCurrentBotName?.() ||
      ""
    );
  }

  function currentBotImage() {
    const profile = document.querySelector("a[aria-label='chatbot-profile']");
    const header = profile?.closest?.("header, [class*='sticky'], [class*='flex']") || profile?.parentElement?.parentElement;
    const img = header?.querySelector?.("img[src]") || profile?.querySelector?.("img[src]");
    return String(img?.currentSrc || img?.src || "").trim();
  }

  function normalizedStore(value) {
    const rows = Array.isArray(value) ? value : [];
    const seen = new Set();
    const next = [];
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const id = clean(raw.id || raw.botId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      next.push({
        id,
        name: clean(raw.name || raw.botName || id).slice(0, 120),
        image: String(raw.image || "").trim(),
        chatUrl: String(raw.chatUrl || `${location.origin}/chat/${id}`).trim(),
        profileUrl: String(raw.profileUrl || `${location.origin}/chatbot/${id}`).trim(),
        intervalHours: [5, 8, 24, 48, 168].includes(Number(raw.intervalHours)) ? Number(raw.intervalHours) : 24,
        addedAt: Number(raw.addedAt) || Date.now(),
        lastActivityAt: Number(raw.lastActivityAt) || Date.now(),
        dueAt: Number(raw.dueAt) || 0,
        lastBotText: clean(raw.lastBotText).slice(0, 360),
        lastUserText: clean(raw.lastUserText).slice(0, 260),
        lastNotifiedForActivityAt: Number(raw.lastNotifiedForActivityAt) || 0,
        lastNotifiedAt: Number(raw.lastNotifiedAt) || 0,
        pendingInPage: !!raw.pendingInPage,
        pendingAt: Number(raw.pendingAt) || 0
      });
      if (next.length >= MAX_SUBSCRIPTIONS) break;
    }
    return next;
  }

  async function loadStore(force = false) {
    if (loaded && !force) return store;
    const result = await DS.storageGet?.([STORE_KEY]);
    store = normalizedStore(result?.[STORE_KEY]);
    loaded = true;
    DS.state.chatNudgeSubscriptions = store;
    return store;
  }

  async function saveStore(next) {
    store = normalizedStore(next);
    loaded = true;
    DS.state.chatNudgeSubscriptions = store;
    await DS.storageSet?.({ [STORE_KEY]: store });
    try {
      chrome.runtime.sendMessage({ type: "DS_CHAT_NUDGE_SYNC" }, () => void chrome.runtime.lastError);
    } catch {}
    return store;
  }

  function messageRoots() {
    return [...document.querySelectorAll("div[id^='message-']")]
      .filter(root => !root.parentElement?.closest?.("div[id^='message-']"));
  }

  function messageText(root) {
    const text = typeof DS.getCachedMessageText === "function" ? DS.getCachedMessageText(root) : root?.textContent;
    return clean(text).slice(0, 1200);
  }

  function messageIsBot(root) {
    return !!root?.querySelector?.("a[href*='/chatbot/'], a[aria-label='chatbot-profile']");
  }

  function latestContext() {
    const roots = messageRoots();
    let botText = "";
    let userText = "";
    let lastId = "";
    for (let i = roots.length - 1; i >= 0 && (!botText || !userText); i -= 1) {
      const root = roots[i];
      const text = messageText(root);
      if (!text) continue;
      if (!lastId) lastId = String(root.id || "");
      if (messageIsBot(root)) {
        if (!botText) botText = text;
      } else if (!userText) {
        userText = text;
      }
    }
    return {
      botText: botText.slice(0, 360),
      userText: userText.slice(0, 260),
      signature: `${lastId}|${roots.length}|${botText.slice(0, 90)}|${userText.slice(0, 60)}`
    };
  }

  function titleActionsHost() {
    const profile = document.querySelector("a[aria-label='chatbot-profile'][href*='/chatbot/']");
    const host = profile?.parentElement;
    if (!profile || !host) return null;
    DS.setClassState?.(host, "ds-chat-title-actions-host", true);
    let actions = host.querySelector(":scope > .ds-chat-title-buttons");
    if (!actions) {
      actions = document.createElement("span");
      actions.className = "ds-chat-title-buttons";
      profile.insertAdjacentElement("afterend", actions);
    }
    return actions;
  }

  function cleanupButton() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => button.remove());
    document.querySelectorAll(".ds-chat-title-buttons").forEach(actions => {
      if (!actions.children.length) actions.remove();
    });
  }

  function currentSubscription(id = currentChatId()) {
    return store.find(item => item.id === id) || null;
  }

  function updateButton(button, id) {
    const selected = !!currentSubscription(id);
    const selectedValue = selected ? "1" : "0";
    const text = selected ? "Nudge ✓" : "Nudge";
    const title = selected
      ? "Stop chat nudges for this chatbot"
      : "Remind me to return to this chatbot after a period of inactivity";
    DS.setDatasetIfChanged?.(button, "selected", selectedValue);
    DS.setTextIfChanged?.(button, text);
    if (button.title !== title) button.title = title;
    DS.setAttributeIfChanged?.(button, "aria-label", title);
  }

  async function toggleCurrentChat(button) {
    const id = currentChatId();
    if (!id) return;
    await loadStore();
    const existing = currentSubscription(id);
    if (existing) {
      await saveStore(store.filter(item => item.id !== id));
      DS.setQuickStatus?.(`Chat nudges disabled for ${existing.name || "this chatbot"}.`);
      updateButton(button, id);
      return;
    }

    if (store.length >= MAX_SUBSCRIPTIONS) {
      DS.setQuickStatus?.("Chat Nudges can watch up to 2 chatbots at a time. Remove one in Personas & Memory first.");
      return;
    }

    const settings = DS.state?.settings || {};
    const intervalHours = [5, 8, 24, 48, 168].includes(Number(settings.chatNudgeDefaultHours))
      ? Number(settings.chatNudgeDefaultHours)
      : 24;
    const context = latestContext();
    const now = Date.now();
    const name = currentBotName() || id;
    await saveStore([...store, {
      id,
      name,
      image: currentBotImage(),
      chatUrl: `${location.origin}/chat/${id}`,
      profileUrl: `${location.origin}/chatbot/${id}`,
      intervalHours,
      addedAt: now,
      lastActivityAt: now,
      dueAt: now + intervalHours * 60 * 60 * 1000,
      lastBotText: context.botText,
      lastUserText: context.userText,
      lastNotifiedForActivityAt: 0,
      lastNotifiedAt: 0,
      pendingInPage: false,
      pendingAt: 0
    }]);
    DS.setQuickStatus?.(`Chat nudges enabled for ${name}. First reminder after ${intervalHours < 24 ? `${intervalHours} hours` : intervalHours === 24 ? "1 day" : intervalHours === 48 ? "2 days" : "1 week"} of inactivity.`);
    updateButton(button, id);
  }

  async function recordActivityIfNeeded() {
    const id = currentChatId();
    if (!id) return;
    const subscription = currentSubscription(id);
    if (!subscription) return;

    const route = String(location.pathname || "");
    const context = latestContext();
    const signature = `${route}|${context.signature}`;
    if (signature === lastSignature && route === lastRoute) return;
    lastSignature = signature;
    lastRoute = route;

    const now = Date.now();
    if (now - lastWriteAt < 1200) return;
    lastWriteAt = now;
    const intervalHours = [5, 8, 24, 48, 168].includes(Number(subscription.intervalHours)) ? Number(subscription.intervalHours) : 24;
    const next = store.map(item => item.id === id ? {
      ...item,
      name: currentBotName() || item.name,
      image: currentBotImage() || item.image,
      chatUrl: `${location.origin}/chat/${id}`,
      profileUrl: `${location.origin}/chatbot/${id}`,
      lastActivityAt: now,
      dueAt: now + intervalHours * 60 * 60 * 1000,
      lastBotText: context.botText || item.lastBotText,
      lastUserText: context.userText || item.lastUserText,
      lastNotifiedForActivityAt: 0,
      pendingInPage: false,
      pendingAt: 0
    } : item);
    await saveStore(next);
  }

  async function showPendingFallback() {
    const pending = store.find(item => item.pendingInPage && Number(item.pendingAt || 0) > 0);
    if (!pending) return;
    const key = `${pending.id}:${pending.pendingAt}`;
    if (pendingToastShownFor === key) return;
    pendingToastShownFor = key;
    const excerpt = clean(pending.lastBotText).slice(0, 140);
    DS.setQuickStatus?.(excerpt
      ? `${pending.name}: Continue where you left off — “${excerpt}${pending.lastBotText.length > 140 ? "…" : ""}”`
      : `${pending.name} is due for a chat nudge.`, true);
    await saveStore(store.map(item => item.id === pending.id ? { ...item, pendingInPage: false } : item));
  }

  DS.applyChatNudges = async function applyChatNudges() {
    const settings = DS.state?.settings || {};
    if (isWorkerPage() || !settings.enabled || !settings.enableChatNudges || !DS.isSingleChatPage?.()) {
      cleanupButton();
      return;
    }
    DS.state.chatNudgesWasActive = true;
    await loadStore();
    const id = currentChatId();
    const actions = titleActionsHost();
    if (!actions || !id) {
      cleanupButton();
      return;
    }
    let button = actions.querySelector(`.${BUTTON_CLASS}`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = `ds-chat-title-mini-button ${BUTTON_CLASS}`;
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        toggleCurrentChat(button).catch(() => DS.setQuickStatus?.("Could not update Chat Nudges."));
      });
      actions.appendChild(button);
    }
    updateButton(button, id);
    await recordActivityIfNeeded();
    await showPendingFallback();
  };

  DS.removeChatNudges = function removeChatNudges() {
    cleanupButton();
    DS.state.chatNudgesWasActive = false;
  };

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[STORE_KEY]) {
      store = normalizedStore(changes[STORE_KEY].newValue);
      loaded = true;
      DS.state.chatNudgeSubscriptions = store;
      DS.scheduleRun?.({ priority: "critical", source: "chat-nudge-storage" });
    }
  });
})();
