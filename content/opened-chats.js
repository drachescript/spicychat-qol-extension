(() => {
  "use strict";

  try {
    if (new URLSearchParams(location.search || "").get("dsQolRecommendationWorker") === "1") return;
  } catch {}

  const DS = window.DragonScriptQoL;
  const CHAT_IMPORT_STATE_KEY = "dsQolChatImportState";

  function localStorageGet(keys) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(keys, result => resolve(result || {}));
      } catch {
        resolve({});
      }
    });
  }

  function localStorageSet(values) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set(values || {}, () => resolve(!chrome.runtime.lastError));
      } catch {
        resolve(false);
      }
    });
  }

  function normalizeChatImportState(value) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      version: 1,
      fullImportCompletedAt: Math.max(0, Number(raw.fullImportCompletedAt || 0) || 0),
      lastRefreshAt: Math.max(0, Number(raw.lastRefreshAt || 0) || 0),
      lastFullConversationCount: Math.max(0, Number(raw.lastFullConversationCount || 0) || 0),
      lastRefreshConversationCount: Math.max(0, Number(raw.lastRefreshConversationCount || 0) || 0)
    };
  }

  async function readChatImportState() {
    const stored = await localStorageGet([CHAT_IMPORT_STATE_KEY]);
    const state = normalizeChatImportState(stored?.[CHAT_IMPORT_STATE_KEY]);
    DS.state.chatImportBaselineReady = !!state.fullImportCompletedAt;
    DS.state.chatImportState = state;
    return state;
  }

  async function writeChatImportState(patch = {}) {
    const current = normalizeChatImportState(DS.state.chatImportState);
    const next = normalizeChatImportState({ ...current, ...patch });
    DS.state.chatImportState = next;
    DS.state.chatImportBaselineReady = !!next.fullImportCompletedAt;
    await localStorageSet({ [CHAT_IMPORT_STATE_KEY]: next });
    return next;
  }

  function conversationIdFromUrl(value) {
    const match = String(value || "").match(/\/chat\/[^/?#]+\/([0-9a-f-]{20,})(?:[/?#]|$)/i);
    return match?.[1] ? String(match[1]).toLowerCase() : "";
  }

  function knownConversationIds() {
    const ids = new Set();
    const meta = DS.state.openedChatMeta && typeof DS.state.openedChatMeta === "object" ? DS.state.openedChatMeta : {};
    for (const entry of Object.values(meta)) {
      const urls = [entry?.chatUrl, ...(Array.isArray(entry?.chatUrls) ? entry.chatUrls : [])];
      for (const url of urls) {
        const id = conversationIdFromUrl(url);
        if (id) ids.add(id);
      }
    }
    return ids;
  }

  async function acquireBackgroundJob(jobType, meta = {}) {
    const started = Date.now();
    const result = await sendBackgroundMessage({
      type: "DS_BACKGROUND_JOB_ACQUIRE",
      jobType: String(jobType || "generic"),
      maxHoldMs: Math.max(1000, Number(meta.maxHoldMs || 30000)),
      detail: meta.detail || ""
    });
    return {
      ok: !!result?.ok,
      leaseId: String(result?.leaseId || ""),
      waitMs: Math.max(0, Number(result?.waitMs || (Date.now() - started)) || 0)
    };
  }

  async function releaseBackgroundJob(leaseId) {
    if (!leaseId) return false;
    const result = await sendBackgroundMessage({ type: "DS_BACKGROUND_JOB_RELEASE", leaseId });
    return !!result?.ok;
  }

  function isChatListPage() {
    if (typeof DS.isChatListPage === "function") {
      return DS.isChatListPage();
    }

    return (
      location.pathname === "/chat" ||
      location.pathname === "/chat/" ||
      location.pathname === "/chats" ||
      location.pathname === "/chats/"
    );
  }

  function sendBackgroundMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          resolve(response || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function loadAllState() {
    if (!DS.state.loadAllChats) {
      DS.state.loadAllChats = {
        running: false,
        cancel: false,
        stepping: false,
        clicked: 0,
        importedTotal: 0,
        noChange: 0,
        lastBeforeLinks: 0,
        userStarted: false,
        mode: "",
        apiPages: 0,
        conversationsImported: 0,
        cursor: "",
        dirty: false,
        statusText: "",
        statusVisibleUntil: 0,
        refreshMode: false,
        forceFullRescan: false,
        knownConversationIds: new Set(),
        refreshBoundaryReached: false,
        newConversationsSeen: 0,
        diagRunToken: null
      };
    }

    return DS.state.loadAllChats;
  }


  function cleanMetaText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalConversationImage(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) {
      return raw.replace(/^https:\/\/(?:www\.)?spicychat\.ai\/avatars\//i, "https://cdn.nd-api.com/avatars/");
    }
    if (/^(?:\/)?avatars\//i.test(raw)) {
      return `https://cdn.nd-api.com/${raw.replace(/^\/+/, "")}`;
    }
    return raw;
  }

  function conversationMessageText(message) {
    if (!message || typeof message !== "object") return "";
    const direct = message.content ?? message.text ?? message.message ?? message.value ?? "";
    if (typeof direct === "string") return cleanMetaText(direct).slice(0, 4000);
    if (Array.isArray(direct)) {
      return cleanMetaText(direct.map(item => typeof item === "string" ? item : (item?.text || item?.content || "")).join(" ")).slice(0, 4000);
    }
    return "";
  }

  function exactConversationUrl(botId, conversationId) {
    if (!botId) return "";
    return conversationId
      ? `${location.origin}/chat/${encodeURIComponent(botId)}/${encodeURIComponent(conversationId)}`
      : `${location.origin}/chat/${encodeURIComponent(botId)}`;
  }

  function importConversationApiRows(rows) {
    const openedChats = DS.state.openedChats;
    DS.state.openedChatMeta = DS.state.openedChatMeta || {};
    let added = 0;
    let metadataChanged = false;
    let conversations = 0;

    for (const row of Array.isArray(rows) ? rows : []) {
      const character = row?.character && typeof row.character === "object" ? row.character : {};
      const id = String(row?.character_id || character.id || "").trim().toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id)) continue;

      const conversationId = String(row?.id || "").trim().toLowerCase();
      const name = cleanMetaText(character.name || "");
      const description = cleanMetaText(character.description || character.title || "");
      const image = canonicalConversationImage(character.avatar_url || character.avatar || character.image || "");
      const lastMessagePreview = conversationMessageText(row?.last_text_message || row?.last_message);
      const messageCount = Math.max(0, Number(row?.num_messages ?? row?.message_count ?? 0) || 0);
      const chatUrl = exactConversationUrl(id, conversationId);
      const candidateMeta = { id, name, image, description, chatUrl };

      if (DS.isBlockedForOpenedHistory?.(id, candidateMeta)) {
        if (openedChats.delete(id)) {
          delete DS.state.openedChatMeta[id];
          metadataChanged = true;
        }
        continue;
      }

      conversations++;
      const existing = DS.state.openedChatMeta[id] || {};
      const existingUrls = Array.isArray(existing.chatUrls) ? existing.chatUrls : [];
      const nextUrls = [...new Set([
        ...(existing.chatUrl ? [existing.chatUrl] : []),
        ...existingUrls,
        ...(chatUrl ? [chatUrl] : [])
      ].map(value => String(value || "").trim()).filter(Boolean))].slice(0, 50);
      const existingHasExactConversation = /\/chat\/[^/?#]+\/[^/?#]+/i.test(String(existing.chatUrl || ""));
      const firstExactConversationUrl = nextUrls.find(url => /\/chat\/[^/?#]+\/[^/?#]+/i.test(url)) || "";
      const nextChatUrl = existingHasExactConversation ? existing.chatUrl : (firstExactConversationUrl || nextUrls[0] || chatUrl || `${location.origin}/chat/${id}`);

      const next = {
        ...existing,
        id,
        name: name || existing.name || id,
        image: image || existing.image || "",
        creator: existing.creator || "",
        description: description || existing.description || "",
        lastMessagePreview: lastMessagePreview || existing.lastMessagePreview || "",
        messageCount: Math.max(messageCount, Number(existing.messageCount || 0) || 0),
        chatUrl: nextChatUrl,
        chatUrls: nextUrls,
        profileUrl: existing.profileUrl || `${location.origin}/chatbot/${id}`,
        savedAt: existing.savedAt || Date.now(),
        lastSeenAt: Date.now(),
        cardMetaCaptured: true,
        apiMetaCaptured: true
      };

      const before = JSON.stringify(existing);
      DS.state.openedChatMeta[id] = next;
      if (before !== JSON.stringify(next)) metadataChanged = true;
      if (!openedChats.has(id)) {
        openedChats.add(id);
        added++;
      }
    }

    return { added, conversations, metadataChanged };
  }

  function getCardCreator(card) {
    const anchor = card?.querySelector?.("a[href*='/creator/']");
    const text = cleanMetaText(anchor?.textContent || "");
    if (text) return text.startsWith("@") ? text : `@${text}`;

    const href = anchor?.getAttribute?.("href") || "";
    const match = href.match(/\/creator\/([^/?#]+)/i);
    return match?.[1] ? `@${decodeURIComponent(match[1])}` : "";
  }

  function getCardDescription(card) {
    const direct = DS.getCardDescriptionText?.(card);
    if (cleanMetaText(direct)) return cleanMetaText(direct);

    const title = cleanMetaText(DS.getCardTitle?.(card));
    const pieces = DS.qsa("p, span", card)
      .map(el => cleanMetaText(el.textContent))
      .filter(Boolean)
      .filter(text => text !== title)
      .filter(text => !/^@/.test(text))
      .filter(text => !/^\d+$/.test(text))
      .sort((a, b) => b.length - a.length);

    return pieces.find(text => text.length > 35) || "";
  }

  function getCurrentChatHeaderMeta(id) {
    const name = cleanMetaText(
      DS.qs?.("a[aria-label='chatbot-profile'] h1")?.textContent ||
      DS.qs?.("h1")?.textContent ||
      DS.getCurrentBotName?.() ||
      id
    );
    const creatorLink = DS.qs?.("a[aria-label='creator-profile'], a[href*='/creator/']");
    const creatorText = cleanMetaText(creatorLink?.textContent || "");
    const creator = creatorText ? (creatorText.startsWith("@") ? creatorText : `@${creatorText}`) : "";
    const image = DS.qs?.("a[aria-label='chatbot-profile'] img, img[alt]")?.currentSrc ||
      DS.qs?.("a[aria-label='chatbot-profile'] img, img[alt]")?.src ||
      "";

    return {
      id,
      name,
      image,
      creator,
      chatUrl: `${location.origin}/chat/${id}`,
      profileUrl: `${location.origin}/chatbot/${id}`,
      savedAt: Date.now()
    };
  }

  function saveOpenedMetaFromCard(id, card, anchor) {
    if (!id) return;

    const base = DS.makeBotMeta?.({ id, card, anchor }) || {};
    DS.saveOpenedChatMeta?.(id, {
      ...base,
      id,
      name: base.name || DS.getCardTitle?.(card) || id,
      image: base.image || DS.getCardImageUrl?.(card) || "",
      creator: base.creator || getCardCreator(card),
      // /chat and /chats cards show the latest conversation message in the
      // same visual area that normal discovery cards use for descriptions.
      // Keep that preview separate so it can never become the bot description.
      description: "",
      lastMessagePreview: getCardDescription(card),
      chatUrl: base.chatUrl || (id ? `${location.origin}/chat/${id}` : anchor?.href || ""),
      profileUrl: base.profileUrl || (id ? `${location.origin}/chatbot/${id}` : ""),
      savedAt: base.savedAt || Date.now(),
      cardMetaCaptured: true
    });
  }

  function updateLoadAllButton() {
    const button = document.getElementById("ds-qol-load-all-chats");
    const progress = document.getElementById("ds-qol-load-all-status");
    const state = loadAllState();

    if (button) {
      const baselineReady = !!DS.state.chatImportBaselineReady;
      const idleLabel = baselineReady ? "Refresh chats" : "Load all";
      DS.setTextIfChanged?.(button, state.running ? "Stop loading" : idleLabel);
      button.setAttribute("aria-busy", state.running ? "true" : "false");
      button.title = state.running
        ? "QoL is importing conversations through SpicyChat's API. The visible chat cards stay small for performance."
        : baselineReady
          ? "Fetch only the newest conversation pages until QoL reaches already-known chat history."
          : "Import all conversations through SpicyChat's API without mounting thousands of extra chat cards.";
    }

    const fullRescan = document.getElementById("ds-qol-full-rescan-chats");
    if (fullRescan) {
      const show = !!DS.state.chatImportBaselineReady && !state.running;
      fullRescan.style.display = show ? "inline-flex" : "none";
      fullRescan.disabled = !!state.running;
      fullRescan.title = "Reread the entire conversation history from page 1 to repair or rebuild imported chat data.";
    }

    if (progress) {
      const showProgress = !!state.statusText && (state.running || Date.now() < Number(state.statusVisibleUntil || 0));
      DS.setTextIfChanged?.(progress, state.statusText || "");
      progress.style.display = showProgress ? "block" : "none";
    }
  }

  function setLoadAllStatus(text, sticky = true) {
    const state = loadAllState();
    state.statusText = String(text || "");
    state.statusVisibleUntil = state.running || sticky ? Number.MAX_SAFE_INTEGER : Date.now() + 10000;

    // Keep the normal Quick Panel status in sync when the user has it enabled,
    // but Load all also owns a dedicated progress line so disabling the generic
    // status can never make a long-running API import look frozen/broken.
    DS.setQuickStatus?.(state.statusText, sticky);
    updateLoadAllButton();

    clearTimeout(state.statusHideTimer);
    if (!state.running && !sticky && state.statusText) {
      state.statusHideTimer = setTimeout(() => {
        state.statusVisibleUntil = 0;
        updateLoadAllButton();
      }, 10050);
    }
  }

  DS.findLoadMoreButton = function findLoadMoreButton() {
    const buttons = DS.qsa("button");

    for (const button of buttons) {
      if (button.disabled) continue;

      const text = DS.normalize(button.textContent);
      const hasLoadMoreKey = !!button.querySelector(
        "[data-translate-key='common:loadMore']"
      );

      if (text === "load more" || hasLoadMoreKey) {
        return button;
      }
    }

    return null;
  };

  DS.waitForMoreChatLinks = function waitForMoreChatLinks(beforeCount, timeoutMs = 7000) {
    return new Promise(resolve => {
      let done = false;

      const finish = () => {
        if (done) return;

        done = true;
        observer.disconnect();

        resolve(DS.qsa("a[href*='/chat/']").length);
      };

      const observer = new MutationObserver(mutations => {
        const addedChatLink = mutations.some(mutation => {
          if (DS.mutationIsQolOnly?.(mutation)) return false;
          return [...(mutation.addedNodes || [])].some(node => {
            if (!(node instanceof Element) || DS.isQolOwnedNode?.(node)) return false;
            return node.matches?.("a[href*='/chat/']") || !!node.querySelector?.("a[href*='/chat/']");
          });
        });
        if (!addedChatLink) return;

        const now = DS.qsa("a[href*='/chat/']").length;
        if (now > beforeCount) finish();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(finish, timeoutMs);
    });
  };

  DS.importVisibleOpenedChats = async function importVisibleOpenedChats(options = {}) {
    const { settings, openedChats } = DS.state;
    const force = options === true || options?.force === true;

    if (
      !settings.enabled ||
      !settings.trackOpenedChats ||
      !settings.importOpenedFromChatsPage
    ) {
      return { added: 0, visible: 0 };
    }

    if (!isChatListPage()) {
      return { added: 0, visible: 0 };
    }

    const revision = Number(DS.state.domRevision || 0);
    if (!force && DS.state.openedImportRevision === revision) {
      return {
        added: 0,
        visible: Number(DS.state.openedImportVisibleCount || 0)
      };
    }

    let added = 0;
    let visible = 0;
    let metadataChanged = false;
    const entries = typeof DS.collectCards === "function"
      ? DS.collectCards()
      : DS.qsa("a[href*='/chat/']").map(anchor => ({
          card: DS.getCardFromChatLink?.(anchor),
          anchor
        }));

    for (const { card, anchor } of entries) {
      const id = DS.chatIdFromHref(anchor?.href || "");
      if (!id) continue;

      const candidateMeta = DS.makeBotMeta?.({ id, card, anchor }) || {
        id,
        name: DS.getCardTitle?.(card) || ""
      };
      if (DS.isBlockedForOpenedHistory?.(id, candidateMeta)) {
        if (openedChats.delete(id)) {
          delete DS.state.openedChatMeta?.[id];
          metadataChanged = true;
        }
        continue;
      }

      visible++;
      const wasKnown = openedChats.has(id);
      const existingMeta = DS.state.openedChatMeta?.[id];

      if (!wasKnown || !existingMeta?.cardMetaCaptured) {
        saveOpenedMetaFromCard(id, card, anchor);
        metadataChanged = true;
      }

      if (!wasKnown) {
        openedChats.add(id);
        added++;
      }
    }

    DS.state.openedImportRevision = revision;
    DS.state.openedImportVisibleCount = visible;

    if (added > 0 || metadataChanged) {
      await DS.saveOpenedChats();
    }

    return { added, visible };
  };

  DS.startLoadAllChats = async function startLoadAllChats(userInitiated = false, options = {}) {
    const { settings } = DS.state;

    if (!userInitiated) return;

    if (!isChatListPage()) {
      DS.setQuickStatus?.("Go to /chat or /chats first.");
      return;
    }

    const state = loadAllState();

    const importState = await readChatImportState();
    const forceFullRescan = !!options?.forceFullRescan;
    const refreshMode = !!importState.fullImportCompletedAt && !forceFullRescan;

    state.running = true;
    state.userStarted = true;
    state.cancel = false;
    state.stepping = false;
    state.clicked = 0;
    state.importedTotal = 0;
    state.noChange = 0;
    state.lastBeforeLinks = DS.qsa("a[href*='/chat/']").length;
    state.mode = "api";
    state.apiPages = 0;
    state.conversationsImported = 0;
    state.cursor = "";
    state.dirty = false;
    state.refreshMode = refreshMode;
    state.forceFullRescan = forceFullRescan;
    state.knownConversationIds = knownConversationIds();
    state.refreshBoundaryReached = false;
    state.newConversationsSeen = 0;
    state.diagRunToken = DS.diagOperationStart?.("chat-import", refreshMode ? "incremental-refresh" : "full-import", {
      knownConversations: state.knownConversationIds.size,
      baselineAt: Number(importState.fullImportCompletedAt || 0)
    }) || null;

    if (typeof DS.fetchConversationListPage !== "function") {
      await DS.finishLoadAllChats("API chat import is not available on this page yet. Reload /chats and try Load all again; QoL did not start native Load More.");
      return;
    }

    setLoadAllStatus(refreshMode
      ? "Refreshing recent chats by API... QoL will stop when it reaches already-known history."
      : "Importing all chats by API... You can switch tabs; extra chat cards will not be mounted.", true);
    Promise.resolve(DS.runLoadAllChatsApi?.()).catch(() => {});
  };

  DS.stopLoadAllChats = async function stopLoadAllChats() {
    const state = loadAllState();

    state.cancel = true;

    await sendBackgroundMessage({
      type: "DS_LOAD_ALL_CHATS_STOP"
    });

    setLoadAllStatus("Stopping after current step...", true);
  };

  DS.finishLoadAllChats = async function finishLoadAllChats(message) {
    const state = loadAllState();

    if (state.dirty) {
      setLoadAllStatus(`Saving ${DS.state.openedChats.size} imported bots...`, true);
      const saveDiag = DS.diagOperationStart?.("chat-import", "save", {
        botsStored: Number(DS.state.openedChats?.size || 0),
        conversations: Number(state.conversationsImported || 0),
        mode: state.refreshMode ? "incremental" : "full"
      }) || null;
      let saveOk = false;
      try {
        await DS.saveOpenedChats?.({ skipBlockedCleanup: true });
        state.dirty = false;
        saveOk = true;
      } catch {}
      DS.diagOperationEnd?.(saveDiag, {
        scanned: Number(state.conversationsImported || 0),
        changed: saveOk ? Number(state.importedTotal || 0) : 0,
        skipped: 0,
        errors: saveOk ? 0 : 1,
        outcome: saveOk ? "ok" : "failed"
      });
    }

    const completedNormally = /^Done\./.test(String(message || ""));
    if (completedNormally) {
      const now = Date.now();
      if (state.refreshMode) {
        await writeChatImportState({
          lastRefreshAt: now,
          lastRefreshConversationCount: Number(state.conversationsImported || 0)
        });
      } else {
        await writeChatImportState({
          fullImportCompletedAt: now,
          lastRefreshAt: now,
          lastFullConversationCount: Number(state.conversationsImported || 0),
          lastRefreshConversationCount: Number(state.conversationsImported || 0)
        });
      }
    }

    if (state.diagRunToken) {
      DS.diagOperationEnd?.(state.diagRunToken, {
        scanned: Number(state.conversationsImported || 0),
        changed: Number(state.importedTotal || 0),
        skipped: 0,
        errors: completedNormally ? 0 : 1,
        outcome: completedNormally ? "ok" : (state.cancel ? "stopped" : "incomplete"),
        meta: {
          pages: Number(state.apiPages || 0),
          mode: state.refreshMode ? "incremental" : "full",
          botsStored: Number(DS.state.openedChats?.size || 0),
          newConversations: Number(state.newConversationsSeen || 0)
        }
      });
      state.diagRunToken = null;
    }

    state.running = false;
    state.userStarted = false;
    state.cancel = false;
    state.stepping = false;
    state.mode = "";

    await sendBackgroundMessage({
      type: "DS_LOAD_ALL_CHATS_DONE"
    });

    setLoadAllStatus(message, false);
    DS.updateQuickPanel?.();
  };

  DS.runLoadAllChatsApi = async function runLoadAllChatsApi() {
    const state = loadAllState();
    if (!state.running || state.mode !== "api" || state.stepping) return;
    state.stepping = true;

    const pageLimit = 25;
    const maxPages = 500;
    let firstPage = state.apiPages === 0;

    try {
      try { window.DSCardTokenBridgeLoader?.ensure?.(); } catch {}

      while (state.running && state.mode === "api" && !state.cancel) {
        if (state.apiPages >= maxPages) {
          await DS.finishLoadAllChats(
            `Stopped at the API safety limit. Imported ${state.conversationsImported} conversations; ${DS.state.openedChats.size} bots stored.`
          );
          return;
        }

        setLoadAllStatus(
          `${state.refreshMode ? "Refreshing" : "Importing"} chat page ${state.apiPages + 1}... ${state.conversationsImported} conversations · ${DS.state.openedChats.size} bots stored.`,
          true
        );

        const pageNumber = state.apiPages + 1;
        const pageDiag = DS.diagOperationStart?.("chat-import", "page", {
          page: pageNumber,
          mode: state.refreshMode ? "incremental" : "full"
        }) || null;
        let response = null;
        let lastError = null;
        let coordinatorWaitMs = 0;
        const pageStartedAt = performance.now?.() || Date.now();
        for (let attempt = 0; attempt < 2; attempt++) {
          let lease = null;
          try {
            lease = await acquireBackgroundJob("chat-import", { maxHoldMs: 30000, detail: `page-${pageNumber}` });
            coordinatorWaitMs += Number(lease?.waitMs || 0);
            response = await DS.fetchConversationListPage({ limit: pageLimit, lastId: state.cursor || "" });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (attempt === 0 && !state.cancel) {
              await new Promise(resolve => setTimeout(resolve, Number(error?.httpStatus || 0) === 429 ? 1200 : 500));
            }
          } finally {
            if (lease?.leaseId) await releaseBackgroundJob(lease.leaseId);
          }
        }
        const pageElapsedMs = Math.max(0, (performance.now?.() || Date.now()) - pageStartedAt);

        if (lastError || !response?.ok || !Array.isArray(response?.data)) {
          throw lastError || new Error("conversation list API returned no chat list");
        }

        const rows = response.data;
        firstPage = false;
        if (!rows.length) {
          DS.diagOperationEnd?.(pageDiag, { scanned: 0, changed: 0, skipped: 0, errors: 0, outcome: "empty", meta: { page: pageNumber, coordinatorWaitMs, pageElapsedMs } });
          await DS.finishLoadAllChats(
            state.refreshMode
              ? `Done. Checked ${state.conversationsImported} recent conversations · ${state.newConversationsSeen} new. ${DS.state.openedChats.size} bots stored.`
              : `Done. Imported ${state.conversationsImported} conversations without mounting extra chat cards. ${DS.state.openedChats.size} bots stored.`
          );
          return;
        }

        let previouslyKnownRows = 0;
        let newlySeenConversationIds = 0;
        for (const row of rows) {
          const conversationId = String(row?.id || "").trim().toLowerCase();
          if (!conversationId) continue;
          if (state.knownConversationIds.has(conversationId)) previouslyKnownRows += 1;
          else {
            state.knownConversationIds.add(conversationId);
            newlySeenConversationIds += 1;
          }
        }

        const imported = importConversationApiRows(rows);
        state.importedTotal += imported.added;
        state.conversationsImported += imported.conversations;
        state.newConversationsSeen += newlySeenConversationIds;
        state.apiPages++;
        if (imported.added || imported.metadataChanged) state.dirty = true;
        DS.diagOperationEnd?.(pageDiag, {
          scanned: Number(rows.length || 0),
          changed: Number(newlySeenConversationIds || 0),
          skipped: Number(previouslyKnownRows || 0),
          errors: 0,
          outcome: "ok",
          meta: {
            page: pageNumber,
            mode: state.refreshMode ? "incremental" : "full",
            coordinatorWaitMs,
            pageElapsedMs: Math.round(pageElapsedMs * 10) / 10,
            apiElapsedMs: Number(response?.elapsedMs || 0),
            newConversationIds: newlySeenConversationIds,
            knownRows: previouslyKnownRows
          }
        });

        if (state.refreshMode && newlySeenConversationIds === 0 && previouslyKnownRows === rows.length) {
          state.refreshBoundaryReached = true;
          await DS.finishLoadAllChats(
            `Done. Checked ${state.conversationsImported} recent conversations · ${state.newConversationsSeen} new · stopped at already-known history. ${DS.state.openedChats.size} bots stored.`
          );
          return;
        }

        const last = rows[rows.length - 1] || {};
        const nextCursor = String(last.character_id || last?.character?.id || "").trim().toLowerCase();
        const finished = rows.length < pageLimit || !nextCursor || nextCursor === state.cursor;
        state.cursor = nextCursor;

        setLoadAllStatus(
          `${state.refreshMode ? "Refreshed" : "Imported"} ${state.conversationsImported} conversations · ${DS.state.openedChats.size} bots stored. ${finished ? "Finishing..." : "Continuing in background..."}`,
          true
        );

        if (finished) {
          await DS.finishLoadAllChats(
            `Done. ${state.refreshMode ? "Refreshed" : "Imported"} ${state.conversationsImported} conversations without mounting extra chat cards. ${DS.state.openedChats.size} bots stored.`
          );
          return;
        }
      }

      if (state.cancel) {
        await DS.finishLoadAllChats(
          `Stopped. Imported ${state.conversationsImported} conversations; ${DS.state.openedChats.size} bots stored.`
        );
      }
    } catch (error) {
      console.warn(`[${DS.EXT_NAME}] API chat-list import failed`, error);
      if (firstPage || state.apiPages === 0) {
        const suffix = Number(error?.httpStatus || 0) === 401
          ? " SpicyChat auth was not ready for the API request."
          : "";
        await DS.finishLoadAllChats(
          `API chat import could not start.${suffix} Reload /chats or wait for it to finish signing in, then press Load all again. Native Load More was not started.`
        );
        return;
      }

      await DS.finishLoadAllChats(
        `Paused after ${state.conversationsImported} conversations because the chat API stopped responding. Saved what was imported; press Load all to retry.`
      );
    } finally {
      state.stepping = false;
      updateLoadAllButton();
    }
  };

  DS.loadAllChatsStep = async function loadAllChatsStep(source = "content") {
    const { settings } = DS.state;
    const state = loadAllState();

    if (!state.running || !state.userStarted) {
      state.running = false;
      state.userStarted = false;
      updateLoadAllButton();
      return {
        running: false
      };
    }

    if (state.stepping) {
      return {
        running: true
      };
    }

    if (state.cancel) {
      await DS.finishLoadAllChats(
        `Stopped. Stored ${DS.state.openedChats.size} opened chats.`
      );

      return {
        running: false
      };
    }

    if (!isChatListPage()) {
      await DS.finishLoadAllChats("Stopped. Chat list page is not open anymore.");

      return {
        running: false
      };
    }

    state.stepping = true;

    try {
      const imported = await DS.importVisibleOpenedChats({ force: true });
      state.importedTotal += imported.added;

      const maxPages = Number(settings.deepImportMaxPages || 80);

      if (state.clicked >= maxPages) {
        await DS.finishLoadAllChats(
          `Stopped at max pages. Stored ${DS.state.openedChats.size} opened chats.`
        );

        return {
          running: false
        };
      }

      const button = DS.findLoadMoreButton();

      if (!button) {
        await DS.finishLoadAllChats(
          `Done. Imported ${state.importedTotal} new chats. Stored ${DS.state.openedChats.size}.`
        );

        return {
          running: false
        };
      }

      const beforeLinks = DS.qsa("a[href*='/chat/']").length;

      state.lastBeforeLinks = beforeLinks;
      state.clicked++;

      setLoadAllStatus(
        `Loading page ${state.clicked}... Stored ${DS.state.openedChats.size}.`,
        true
      );

      DS.realClick(button, { scroll: true });

      const afterLinks = await DS.waitForMoreChatLinks(
        beforeLinks,
        document.hidden ? 15000 : 7000
      );

      await DS.importVisibleOpenedChats({ force: true });

      if (afterLinks <= beforeLinks) {
        state.noChange++;
      } else {
        state.noChange = 0;
      }

      if (state.noChange >= 2) {
        await DS.finishLoadAllChats(
          `Done. Load More stopped adding chats. Stored ${DS.state.openedChats.size}.`
        );

        return {
          running: false
        };
      }

      setLoadAllStatus(
        `Loading continues... ${state.clicked} pages clicked, ${DS.state.openedChats.size} stored.`,
        true
      );

      if (document.hidden || source === "background") {
        await sendBackgroundMessage({
          type: "DS_LOAD_ALL_CHATS_RESCHEDULE"
        });
      } else {
        setTimeout(() => {
          DS.runLoadAllChatsLoop?.();
        }, 350);
      }

      DS.applyChatListTools?.();

      return {
        running: true
      };
    } catch (error) {
      console.warn(`[${DS.EXT_NAME}] load all chats step failed`, error);

      await DS.finishLoadAllChats("Load all failed. Check console.");

      return {
        running: false
      };
    } finally {
      state.stepping = false;
      updateLoadAllButton();
    }
  };

  DS.runLoadAllChatsLoop = async function runLoadAllChatsLoop() {
    const state = loadAllState();

    if (!state.running || state.stepping) return;

    await DS.loadAllChatsStep("content");
  };

  DS.manualLoadAllChatsAndImport = async function manualLoadAllChatsAndImport() {
    const state = loadAllState();

    if (state.running) {
      await DS.stopLoadAllChats();
      return;
    }

    await DS.startLoadAllChats(true, { forceFullRescan: false });
  };

  DS.manualFullRescanChatsAndImport = async function manualFullRescanChatsAndImport() {
    const state = loadAllState();
    if (state.running) return;
    await DS.startLoadAllChats(true, { forceFullRescan: true });
  };

  let openedCurrentSaveTimer = null;
  let openedCurrentSaveInFlight = null;

  function queueCurrentOpenedSave(delay = 450) {
    const runtime = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    if (openedCurrentSaveTimer) {
      clearTimeout(openedCurrentSaveTimer);
      runtime.openedSaveCoalesced = Number(runtime.openedSaveCoalesced || 0) + 1;
    }
    runtime.openedSaveQueued = Number(runtime.openedSaveQueued || 0) + 1;
    runtime.openedSavePending = 1;
    openedCurrentSaveTimer = setTimeout(() => {
      openedCurrentSaveTimer = null;
      const started = performance.now?.() || Date.now();
      openedCurrentSaveInFlight = Promise.resolve(DS.saveOpenedChats?.({ skipBlockedCleanup: true }))
        .catch(() => false)
        .finally(() => {
          const now = performance.now?.() || Date.now();
          runtime.openedSaveFlushes = Number(runtime.openedSaveFlushes || 0) + 1;
          runtime.openedSaveLastMs = Math.round((now - started) * 10) / 10;
          runtime.openedSavePending = 0;
          openedCurrentSaveInFlight = null;
        });
    }, Math.max(0, Number(delay) || 0));
  }

  DS.flushCurrentOpenedSave = function flushCurrentOpenedSave() {
    if (!openedCurrentSaveTimer) return openedCurrentSaveInFlight || Promise.resolve(true);
    clearTimeout(openedCurrentSaveTimer);
    openedCurrentSaveTimer = null;
    const runtime = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    const started = performance.now?.() || Date.now();
    openedCurrentSaveInFlight = Promise.resolve(DS.saveOpenedChats?.({ skipBlockedCleanup: true }))
      .catch(() => false)
      .finally(() => {
        const now = performance.now?.() || Date.now();
        runtime.openedSaveFlushes = Number(runtime.openedSaveFlushes || 0) + 1;
        runtime.openedSaveLastMs = Math.round((now - started) * 10) / 10;
        runtime.openedSavePending = 0;
        openedCurrentSaveInFlight = null;
      });
    return openedCurrentSaveInFlight;
  };

  if (!DS.state.openedSaveLifecycleInstalled) {
    DS.state.openedSaveLifecycleInstalled = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) DS.flushCurrentOpenedSave?.();
    }, true);
    window.addEventListener("pagehide", () => { DS.flushCurrentOpenedSave?.(); }, true);
  }

  DS.markCurrentChatAsOpened = function markCurrentChatAsOpened() {
    const { settings, openedChats } = DS.state;

    if (!settings.enabled || !settings.trackOpenedChats) return;
    if (!DS.isSingleChatPage()) return;

    const id = DS.chatIdFromHref(location.href);
    if (!id) return;

    const existingMeta = DS.state.openedChatMeta?.[id] || null;
    const alreadyComplete = openedChats.has(id) && !!existingMeta?.name && !!existingMeta?.image;
    if (DS.state.lastMarkedChatId === id && alreadyComplete) return;

    const currentMeta = getCurrentChatHeaderMeta(id);
    if (DS.isBlockedForOpenedHistory?.(id, currentMeta)) {
      if (openedChats.delete(id)) {
        delete DS.state.openedChatMeta?.[id];
        queueCurrentOpenedSave(0);
      }
      return;
    }

    const wasNew = !openedChats.has(id);
    const needsMetaSave = !existingMeta?.name && !existingMeta?.image;

    if (DS.state.lastMarkedChatId === id && !wasNew && !needsMetaSave) {
      return;
    }

    openedChats.add(id);
    DS.state.lastMarkedChatId = id;

    if (wasNew || needsMetaSave) {
      DS.saveOpenedChatMeta?.(id, currentMeta);
      // Do not hold the scheduler lane open while Chrome serializes thousands
      // of opened-history metadata records. State updates immediately; one
      // debounced persistence write follows shortly after.
      queueCurrentOpenedSave();
    }
  };

  let openedLinkSaveTimer = null;

  async function rememberOpenedChatLink(link, source = "click") {
    const { settings, openedChats } = DS.state;

    if (!settings.enabled || !settings.trackOpenedChats) return false;
    if (!link) return false;

    const id = DS.chatIdFromHref(link.href || "");
    if (!id) return false;

    const card = DS.getCardFromChatLink?.(link);
    const candidateMeta = DS.makeBotMeta?.({ id, card, anchor: link }) || {
      id,
      name: DS.getCardTitle?.(card) || ""
    };
    if (DS.isBlockedForOpenedHistory?.(id, candidateMeta)) {
      if (openedChats.delete(id)) {
        delete DS.state.openedChatMeta?.[id];
        await DS.saveOpenedChats();
      }
      return false;
    }

    const wasKnown = openedChats.has(id);
    const existingMeta = DS.state.openedChatMeta?.[id];

    if (!wasKnown || !existingMeta?.cardMetaCaptured) {
      saveOpenedMetaFromCard(id, card, link);
    }

    if (wasKnown) return false;

    openedChats.add(id);

    if (
      settings.hideOpenedChats &&
      !isChatListPage() &&
      !DS.isSingleChatPage?.() &&
      !DS.isMyCreationsChatbotsPage?.()
    ) {
      if (card) DS.hideCard?.(card, "card:opened chat");
    }

    clearTimeout(openedLinkSaveTimer);
    openedLinkSaveTimer = setTimeout(async () => {
      await DS.saveOpenedChats();
      await DS.applyCardHiding?.();
      DS.applyListingAutoFill?.();
      DS.updateQuickPanel?.();
    }, 0);

    return true;
  }

  DS.installOpenedClickTracker = function installOpenedClickTracker() {
    if (DS.state.openedClickTrackerInstalled) return;
    DS.state.openedClickTrackerInstalled = true;

    const handleOpenIntent = event => {
      const link = event.target.closest?.("a[href*='/chat/']");
      if (!link) return;

      const isLeftClick = event.type === "click" && (event.button === 0 || event.button === undefined);
      const isMiddleClick = event.type === "auxclick" && event.button === 1;

      // Right-click by itself should not mark a bot as opened. If the user chooses
      // Open in new tab, that new chat tab will mark itself when it loads.
      if (!isLeftClick && !isMiddleClick) return;

      rememberOpenedChatLink(link, event.ctrlKey || event.metaKey ? "modified-click" : event.type);
    };

    document.addEventListener("click", handleOpenIntent, true);
    document.addEventListener("auxclick", handleOpenIntent, true);
  };

  DS.resetChatListLoaderForRoute = function resetChatListLoaderForRoute() {
    const state = loadAllState();
    state.running = false;
    state.userStarted = false;
    state.cancel = false;
    state.stepping = false;
    state.mode = "";
    state.cursor = "";
    state.dirty = false;
    state.refreshMode = false;
    state.forceFullRescan = false;
    state.knownConversationIds = new Set();
    state.refreshBoundaryReached = false;
    if (state.diagRunToken) {
      DS.diagOperationEnd?.(state.diagRunToken, { scanned: 0, changed: 0, skipped: 0, errors: 0, outcome: "route-reset" });
      state.diagRunToken = null;
    }
    updateLoadAllButton();
    sendBackgroundMessage({ type: "DS_LOAD_ALL_CHATS_STOP" });
  };

  // A new page must never inherit an old background loader. Loading only
  // starts again after the user presses the panel's Load all button.
  DS.resetChatListLoaderForRoute();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "DS_LOAD_ALL_CHATS_STEP") {
      return false;
    }

    DS.loadAllChatsStep("background").then(result => {
      sendResponse(result);
    });

    return true;
  });

  document.addEventListener("visibilitychange", () => {
    const state = loadAllState();

    if (!state.running) return;

    if (state.mode === "api") {
      // API import does not depend on DOM growth or browser alarm pacing, so it
      // keeps running normally in a background tab.
      return;
    }

    if (document.hidden) {
      sendBackgroundMessage({
        type: "DS_LOAD_ALL_CHATS_RESCHEDULE"
      });
    } else {
      setTimeout(() => {
        DS.runLoadAllChatsLoop?.();
      }, 300);
    }
  });

  readChatImportState().then(() => {
    updateLoadAllButton();
    DS.updateQuickPanel?.();
  }).catch(() => {});

  const oldUpdateQuickPanel = DS.updateQuickPanel;

  DS.updateQuickPanel = function patchedUpdateQuickPanel(...args) {
    oldUpdateQuickPanel?.(...args);
    updateLoadAllButton();
  };
})();