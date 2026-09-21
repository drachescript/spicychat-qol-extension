(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

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
        userStarted: false
      };
    }

    return DS.state.loadAllChats;
  }


  function cleanMetaText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
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
      description: getCardDescription(card),
      chatUrl: base.chatUrl || (id ? `${location.origin}/chat/${id}` : anchor?.href || ""),
      profileUrl: base.profileUrl || (id ? `${location.origin}/chatbot/${id}` : ""),
      savedAt: base.savedAt || Date.now(),
      cardMetaCaptured: true
    });
  }

  function updateLoadAllButton() {
    const button = document.getElementById("ds-qol-load-all-chats");
    const state = loadAllState();

    if (!button) return;

    DS.setTextIfChanged?.(button, state.running ? "Stop loading" : "Load all");
  }

  function setLoadAllStatus(text, sticky = true) {
    DS.setQuickStatus?.(text, sticky);
    updateLoadAllButton();
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

  DS.startLoadAllChats = async function startLoadAllChats(userInitiated = false) {
    const { settings } = DS.state;

    if (!userInitiated) return;

    if (!isChatListPage()) {
      DS.setQuickStatus?.("Go to /chat or /chats first.");
      return;
    }

    const state = loadAllState();

    state.running = true;
    state.userStarted = true;
    state.cancel = false;
    state.stepping = false;
    state.clicked = 0;
    state.importedTotal = 0;
    state.noChange = 0;
    state.lastBeforeLinks = DS.qsa("a[href*='/chat/']").length;

    await sendBackgroundMessage({
      type: "DS_LOAD_ALL_CHATS_START"
    });

    setLoadAllStatus("Loading chats... You can switch tabs now.", true);

    DS.runLoadAllChatsLoop?.();
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

    state.running = false;
    state.userStarted = false;
    state.cancel = false;
    state.stepping = false;

    await sendBackgroundMessage({
      type: "DS_LOAD_ALL_CHATS_DONE"
    });

    setLoadAllStatus(message, false);
    DS.updateQuickPanel?.();
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

    await DS.startLoadAllChats(true);
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

  const oldUpdateQuickPanel = DS.updateQuickPanel;

  DS.updateQuickPanel = function patchedUpdateQuickPanel(...args) {
    oldUpdateQuickPanel?.(...args);
    updateLoadAllButton();
  };
})();