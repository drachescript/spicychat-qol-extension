(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  // Message metadata handling is adapted from S.AI Toolkit by OnyxMizuna.
  // S.AI Toolkit is licensed under GPL-3.0.
  // https://github.com/OnyxMizuna/SAI-Toolkit

  const STORAGE_KEY = "messageGenerationMetadata";
  const SOURCE = "spicychat-qol-generation-metadata";
  const BUFFER_KEY = "__DSQ_GENERATION_METADATA_BUFFER__";
  const MAX_RECORDS = 3000;

  let records = {};
  let loaded = false;
  let saveTimer = null;
  let initializedRoute = "";
  let lastDisplaySignature = "";
  const dirtyRecordIds = new Set();

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeSettings(value) {
    if (!value || typeof value !== "object") return null;
    return {
      maxTokens: numberOrNull(value.max_new_tokens ?? value.max_tokens ?? value.maxTokens),
      temperature: numberOrNull(value.temperature),
      topP: numberOrNull(value.top_p ?? value.topP),
      topK: numberOrNull(value.top_k ?? value.topK),
      repetitionPenalty: numberOrNull(value.repetition_penalty ?? value.repetitionPenalty),
      presencePenalty: numberOrNull(value.presence_penalty ?? value.presencePenalty),
      frequencyPenalty: numberOrNull(value.frequency_penalty ?? value.frequencyPenalty)
    };
  }

  function normalizeRecord(value) {
    if (!value || typeof value !== "object" || !value.id) return null;
    return {
      id: String(value.id),
      conversationId: value.conversationId ? String(value.conversationId) : null,
      role: String(value.role || ""),
      createdAt: value.createdAt || null,
      requestedModel: clean(value.requestedModel || value.inferenceModel || value.model),
      responseEngine: clean(value.responseEngine || value.engine),
      settings: normalizeSettings(value.settings || value.inferenceSettings),
      elapsedMs: numberOrNull(value.elapsedMs),
      estimatedTokens: numberOrNull(value.estimatedTokens),
      promptTokens: numberOrNull(value.promptTokens),
      contextLimit: numberOrNull(value.contextLimit),
      previousId: value.previousId ? String(value.previousId) : null,
      continued: !!value.continued,
      isAlternative: !!value.isAlternative,
      updatedAt: Date.now()
    };
  }

  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    const result = await DS.storageGet(STORAGE_KEY);
    const saved = result?.[STORAGE_KEY];
    records = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  }

  function compactRecords() {
    const entries = Object.entries(records);
    if (entries.length <= MAX_RECORDS) return;

    entries
      .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
      .slice(MAX_RECORDS)
      .forEach(([id]) => delete records[id]);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      compactRecords();
      await DS.storageSet({ [STORAGE_KEY]: records });
    }, 350);
  }

  function mergeRecord(value) {
    const incoming = normalizeRecord(value);
    if (!incoming) return;

    const previous = records[incoming.id] || {};
    records[incoming.id] = {
      ...previous,
      ...incoming,
      settings: incoming.settings || previous.settings || null,
      requestedModel: incoming.requestedModel || previous.requestedModel || "",
      responseEngine: incoming.responseEngine || previous.responseEngine || "",
      elapsedMs: incoming.elapsedMs ?? previous.elapsedMs ?? null,
      estimatedTokens: incoming.estimatedTokens ?? previous.estimatedTokens ?? null,
      promptTokens: incoming.promptTokens ?? previous.promptTokens ?? null,
      contextLimit: incoming.contextLimit ?? previous.contextLimit ?? null,
      previousId: incoming.previousId || previous.previousId || null,
      createdAt: incoming.createdAt || previous.createdAt || null,
      conversationId: incoming.conversationId || previous.conversationId || null,
      updatedAt: Date.now()
    };
    dirtyRecordIds.add(incoming.id);
  }

  async function handleBridgeMessage(message) {
    if (message?.source !== SOURCE) return;
    await ensureLoaded();

    if (message.type === "DSQ_MESSAGES_LOADED") {
      const conversationId = message.payload?.conversationId || null;
      for (const item of message.payload?.messages || []) {
        mergeRecord({ ...item, conversationId });
      }
      scheduleSave();
      DS.scheduleRun?.();
      return;
    }

    if (message.type === "DSQ_NEW_GENERATION") {
      mergeRecord(message.payload || {});
      scheduleSave();
      DS.scheduleRun?.();
    }
  }

  function timestamp(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatTimestamp(value, settings) {
    const date = timestamp(value);
    if (!date) return "";

    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: settings.messageTimestampShowSeconds ? "2-digit" : undefined,
      hour12: !settings.messageTimestamp24Hour
    });

    const dateText = date.toLocaleDateString();
    return settings.messageTimestampDateFirst === false ? `${time} · ${dateText}` : `${dateText} · ${time}`;
  }

  function formatNumber(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return "";
    return Number(value).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  function modelText(record) {
    const requested = clean(record?.requestedModel);
    const engine = clean(record?.responseEngine);
    if (requested && engine && requested.toLowerCase() !== engine.toLowerCase()) return `${requested} → ${engine}`;
    return engine || requested;
  }

  function settingsText(value) {
    if (!value) return "";
    const parts = [];
    if (value.maxTokens != null) parts.push(`Max ${formatNumber(value.maxTokens, 0)}`);
    if (value.temperature != null) parts.push(`Temp ${formatNumber(value.temperature)}`);
    if (value.topP != null) parts.push(`Top P ${formatNumber(value.topP)}`);
    if (value.topK != null) parts.push(`Top K ${formatNumber(value.topK, 0)}`);
    if (value.repetitionPenalty != null) parts.push(`Repeat ${formatNumber(value.repetitionPenalty)}`);
    return parts.join(" · ");
  }

  function isAiMessage(root) {
    return !!root.querySelector("a[href*='/chatbot/'], a[aria-label='chatbot-profile']");
  }

  function findMetadataHost(root) {
    const textNodes = Array.from(root.querySelectorAll(
      "span.leading-6, div[class*='overflow-wrap'], div[class*='break-words']"
    )).filter(node => clean(node.textContent));

    const last = textNodes[textNodes.length - 1];
    if (!last) return null;

    let node = last;
    for (let i = 0; node && node !== root && i < 5; i++, node = node.parentElement) {
      if (node.parentElement && clean(node.textContent).length > 0) {
        const buttons = node.querySelectorAll("button").length;
        if (buttons === 0 && node.children.length <= 8) return node;
      }
    }

    return last.parentElement;
  }


  function messageBodyText(root) {
    if (!(root instanceof Element)) return "";
    const candidates = [...root.querySelectorAll("div[class*='overflow-wrap'], div[class*='break-words']")]
      .filter(el => clean(el.textContent))
      .sort((a, b) => clean(b.textContent).length - clean(a.textContent).length);
    const host = candidates[0];
    if (host) {
      const clone = host.cloneNode(true);
      clone.querySelectorAll("button, svg, .ds-message-quick-actions, .ds-generation-metadata, .ds-translation-output, [data-ds-translation-output]").forEach(el => el.remove());
      const text = clean(clone.textContent);
      if (text) return text;
    }
    return clean(DS.getCachedMessageText?.(root) || "");
  }

  function estimateMessageTokens(text) {
    const value = String(text || "");
    if (!value.trim()) return 0;

    let latinLike = 0;
    let punctuation = 0;
    let weighted = 0;

    for (const char of value) {
      if (/\s/u.test(char)) continue;
      if (/\p{Script=Cyrillic}/u.test(char)) { weighted += 3; continue; }
      if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)) { weighted += 1.5; continue; }
      if (/\p{Extended_Pictographic}/u.test(char)) { weighted += 2.5; continue; }
      if (/[^\p{L}\p{N}]/u.test(char)) { punctuation += 1; continue; }
      if (/^[\x00-\x7F]$/u.test(char) || /\p{Script=Latin}/u.test(char)) latinLike += 1;
      else weighted += 1.75;
    }

    // English/Latin prose averages around four characters per token. Punctuation
    // and non-Latin scripts are handled separately because byte/4 badly
    // underestimates Cyrillic and other Unicode-heavy text. This is deliberately
    // a conservative local estimate rather than a model-specific tokenizer.
    return Math.max(1, Math.round(latinLike / 4 + punctuation * 0.35 + weighted));
  }

  function metadataDetailRequested(settings) {
    return (
      settings.showMessageTimestamps === true ||
      settings.showGenerationModel === true ||
      settings.showGenerationElapsed === true ||
      settings.showGenerationSettings === true
    );
  }

  function metadataFeatureRequested(settings) {
    return settings.showGenerationMetadata === true || metadataDetailRequested(settings) || settings.showMessageTokenEstimate === true || settings.enableContextWindowWarning === true;
  }


  const CONTEXT_WARNING_ID = "ds-context-window-warning";
  const contextWarningState = { route: "", dismissedAtPercent: 0, lastBrowserNoticeKey: "" };

  function currentChatRecords() {
    const loadedRoots = DS.getLoadedMessageRoots?.() || [...document.querySelectorAll("[id^='message-']")];
    const visibleIds = loadedRoots.map(root => String(root.id || "").replace(/^message-/, "")).filter(Boolean);
    const visible = visibleIds.map(id => records[id]).filter(Boolean);
    const conversationId = [...visible].reverse().find(record => record?.conversationId)?.conversationId || null;

    // Prefer the active previous-message chain so regenerations/alternate replies
    // that are stored for the same conversation are not all counted at once.
    const tailId = [...visibleIds].reverse().find(id => records[id]);
    const chain = [];
    const seen = new Set();
    let cursor = tailId || "";
    while (cursor && records[cursor] && !seen.has(cursor) && chain.length < 12000) {
      seen.add(cursor);
      const record = records[cursor];
      chain.push(record);
      cursor = String(record?.previousId || "");
    }
    chain.reverse();

    const pool = chain.length >= Math.max(2, visible.length)
      ? chain
      : (conversationId ? Object.values(records).filter(record => record?.conversationId && record.conversationId === conversationId && !record?.isAlternative) : visible);
    return { visible, pool, conversationId };
  }

  function contextUsage(settings) {
    const { visible, pool } = currentChatRecords();
    const ordered = [...pool].sort((a, b) => Number(a?.updatedAt || 0) - Number(b?.updatedAt || 0));
    const latest = [...ordered].reverse().find(Boolean) || [...visible].reverse().find(Boolean) || null;
    const manualLimit = Math.max(0, Number(settings.contextWarningManualLimit) || 0);
    const autoLimit = Math.max(0, Number(latest?.contextLimit) || 0);
    const limit = autoLimit >= 512 ? autoLimit : (manualLimit >= 512 ? manualLimit : 0);
    if (!limit) return { limit: 0, used: 0, percent: 0, source: "unknown" };

    const exactPrompt = Math.max(0, Number(latest?.promptTokens) || 0);
    if (exactPrompt) {
      const outputReserve = Math.max(0, Number(latest?.settings?.maxTokens) || 0);
      const used = Math.min(limit, exactPrompt + Math.min(outputReserve, Math.max(0, limit - exactPrompt)));
      return { limit, used, percent: Math.min(100, (used / limit) * 100), source: "api", promptTokens: exactPrompt, outputReserve };
    }

    let estimated = ordered.reduce((sum, record) => sum + Math.max(0, Number(record?.estimatedTokens) || 0), 0);
    if (!estimated) {
      estimated = visible.reduce((sum, rootRecord) => sum + Math.max(0, Number(rootRecord?.estimatedTokens) || 0), 0);
    }
    if (!estimated) {
      const loadedRoots = DS.getLoadedMessageRoots?.() || document.querySelectorAll("[id^='message-']");
      for (const root of loadedRoots) estimated += estimateMessageTokens(messageBodyText(root));
    }
    // Bot definition, memory, lorebook matches and formatting add prompt overhead that
    // is not represented by chat-message text. A small safety margin intentionally
    // warns early instead of promising model-specific tokenizer precision.
    const used = Math.min(limit, Math.round(estimated * 1.12));
    return { limit, used, percent: Math.min(100, (used / limit) * 100), source: "estimate" };
  }

  function removeContextWarning() {
    document.getElementById(CONTEXT_WARNING_ID)?.remove();
  }

  function sendContextBrowserNotification(info) {
    const settings = DS.state?.settings || {};
    if (!settings.contextWarningBrowserNotifications) return;
    const route = String(location.pathname || "");
    const bucket = Math.max(1, Math.floor(info.percent / 5));
    const key = `${route}:${bucket}`;
    if (contextWarningState.lastBrowserNoticeKey === key) return;
    contextWarningState.lastBrowserNoticeKey = key;
    try {
      chrome.runtime.sendMessage({
        type: "DS_CONTEXT_WINDOW_NOTIFICATION",
        percent: Math.round(info.percent),
        used: Math.round(info.used),
        limit: Math.round(info.limit),
        url: location.href
      }, () => void chrome.runtime.lastError);
    } catch {}
  }

  function applyContextWarning(settings) {
    if (!settings.enableContextWindowWarning || !DS.isSingleChatPage?.()) {
      removeContextWarning();
      return;
    }
    const route = String(location.pathname || "");
    if (contextWarningState.route !== route) {
      contextWarningState.route = route;
      contextWarningState.dismissedAtPercent = 0;
      contextWarningState.lastBrowserNoticeKey = "";
    }
    const info = contextUsage(settings);
    const threshold = Math.min(99, Math.max(50, Number(settings.contextWarningThreshold) || 85));
    if (!info.limit || info.percent < threshold || (contextWarningState.dismissedAtPercent && info.percent < contextWarningState.dismissedAtPercent + 5)) {
      removeContextWarning();
      return;
    }

    let bar = document.getElementById(CONTEXT_WARNING_ID);
    if (!bar) {
      bar = document.createElement("div");
      bar.id = CONTEXT_WARNING_ID;
      const text = document.createElement("div");
      text.className = "ds-context-window-warning-text";
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "ds-context-window-warning-dismiss";
      dismiss.textContent = "×";
      dismiss.title = "Dismiss until context usage rises another 5%";
      dismiss.addEventListener("click", () => {
        contextWarningState.dismissedAtPercent = Number(bar.dataset.percent || 0);
        bar.remove();
      });
      bar.append(text, dismiss);
      document.documentElement.appendChild(bar);
    }
    const text = bar.querySelector(".ds-context-window-warning-text");
    const approx = info.source === "estimate" ? "~" : "";
    const detail = `${approx}${Math.round(info.used).toLocaleString()} / ${Math.round(info.limit).toLocaleString()} tokens`;
    text.textContent = `Context ${Math.round(info.percent)}% full (${detail}). Older RP messages may start dropping from the model's context soon.`;
    bar.dataset.source = info.source;
    bar.dataset.percent = String(info.percent);
    sendContextBrowserNotification(info);
  }

  function displayLines(record, root, settings) {
    const lines = [];
    const ai = isAiMessage(root);

    // Keep the original combined switch useful as a one-click default, but do
    // not require it. If no individual detail is selected, the combined switch
    // shows the original default trio. Individual checkboxes work independently.
    const combinedDefaults = settings.showGenerationMetadata === true && !metadataDetailRequested(settings);

    if (settings.showMessageTokenEstimate === true) {
      const estimated = estimateMessageTokens(messageBodyText(root));
      if (estimated) lines.push(`~${estimated.toLocaleString()} tok est.`);
    }

    if (settings.showMessageTimestamps === true || combinedDefaults) {
      const value = formatTimestamp(record?.createdAt, settings);
      if (value) lines.push(value);
    }

    if (ai && (settings.showGenerationModel === true || combinedDefaults)) {
      const value = modelText(record);
      if (value) lines.push(value);
    }

    if (ai && (settings.showGenerationElapsed === true || combinedDefaults) && record?.elapsedMs != null) {
      lines.push(`${formatNumber(record.elapsedMs / 1000, 1)}s generation`);
    }

    if (ai && settings.showGenerationSettings === true) {
      const value = settingsText(record?.settings);
      if (value) lines.push(value);
    }

    return lines;
  }

  function applyToMessage(root, settings) {
    const id = String(root.id || "").replace(/^message-/, "");
    if (!id) return;

    const record = records[id];
    const existing = root.querySelector(":scope .ds-generation-metadata");
    const lines = displayLines(record, root, settings);

    if (!lines.length) {
      existing?.remove();
      root.dataset.dsGenerationMetadataReady = "1";
      return;
    }

    const host = findMetadataHost(root);
    if (!host) return;

    const signature = JSON.stringify(lines);
    let element = existing;
    if (!element) {
      element = document.createElement("div");
      element.className = "ds-generation-metadata";
      host.appendChild(element);
    } else if (element.parentElement !== host) {
      host.appendChild(element);
    }

    const compact = settings.compactGenerationMetadata !== false;
    const text = compact ? lines.join(" · ") : lines.join("\n");
    const title = lines.join("\n");
    if (element.dataset.signature === signature && element.classList.contains("compact") === compact && element.textContent === text && element.title === title) {
      root.dataset.dsGenerationMetadataReady = "1";
      return;
    }
    element.classList.toggle("compact", compact);
    element.dataset.signature = signature;
    element.textContent = text;
    element.title = title;
    root.dataset.dsGenerationMetadataReady = "1";
  }

  function cleanup() {
    document.querySelectorAll(".ds-generation-metadata").forEach(node => node.remove());
    document.querySelectorAll("[data-ds-generation-metadata-ready]").forEach(root => delete root.dataset.dsGenerationMetadataReady);
    initializedRoute = "";
    lastDisplaySignature = "";
  }

  DS.applyGenerationMetadata = async function applyGenerationMetadata() {
    const settings = DS.state?.settings || {};
    if (
      !settings.enabled ||
      !metadataFeatureRequested(settings) ||
      !DS.isSingleChatPage?.() ||
      (DS.shouldDeferToSaiToolkit?.("generation-metadata") && !settings.enableContextWindowWarning)
    ) {
      cleanup();
      return;
    }

    await ensureLoaded();
    const route = String(location.pathname || "");
    const displaySignature = JSON.stringify({
      combined: settings.showGenerationMetadata === true,
      timestamps: settings.showMessageTimestamps === true,
      seconds: settings.messageTimestampShowSeconds === true,
      hour24: settings.messageTimestamp24Hour === true,
      dateFirst: settings.messageTimestampDateFirst !== false,
      model: settings.showGenerationModel === true,
      elapsed: settings.showGenerationElapsed === true,
      sliders: settings.showGenerationSettings === true,
      tokens: settings.showMessageTokenEstimate === true,
      compact: settings.compactGenerationMetadata !== false
    });
    const force = initializedRoute !== route || lastDisplaySignature !== displaySignature;
    initializedRoute = route;
    lastDisplaySignature = displaySignature;

    const laneRoots = DS.getCurrentMessageLaneRoots?.() || [];
    const historyBusy = !!DS.state?.bulkChatHistoryLoadActive || Date.now() < Number(DS.state?.chatHistoryBatchUntil || 0);
    if (force) {
      const loadedRoots = DS.getLoadedMessageRoots?.() || document.querySelectorAll("[id^='message-']");
      loadedRoots.forEach(root => applyToMessage(root, settings));
    } else if (laneRoots.length) {
      laneRoots.forEach(root => applyToMessage(root, settings));
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.generationMetadataScopedPasses = Number(counters.generationMetadataScopedPasses || 0) + 1;
      counters.generationMetadataScopedMessages = Number(counters.generationMetadataScopedMessages || 0) + laneRoots.length;
    } else if (!historyBusy) {
      document.querySelectorAll("[id^='message-']:not([data-ds-generation-metadata-ready='1'])").forEach(root => applyToMessage(root, settings));
    } else {
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.generationMetadataHistoryDeferrals = Number(counters.generationMetadataHistoryDeferrals || 0) + 1;
    }
    if (!historyBusy) {
      for (const id of dirtyRecordIds) {
        const root = document.getElementById(`message-${id}`);
        if (root) applyToMessage(root, settings);
      }
      dirtyRecordIds.clear();
      applyContextWarning(settings);
    }
  };

  DS.removeGenerationMetadata = function removeGenerationMetadata() { cleanup(); removeContextWarning(); };
  DS.MESSAGE_GENERATION_METADATA_KEY = STORAGE_KEY;

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== SOURCE) return;
    handleBridgeMessage(event.data);
  });

  window.__DSQ_GENERATION_METADATA_READY__ = true;
  const buffered = Array.isArray(window[BUFFER_KEY]) ? window[BUFFER_KEY].splice(0) : [];
  buffered.forEach(handleBridgeMessage);
})();
