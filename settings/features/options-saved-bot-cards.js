// Feature-owned options helpers: saved-bot-cards. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function botManagerCardElement(entry, kind) {
  const card = makeElement("div", {
    className: "bot-manager-card",
    dataset: { kind, type: entry.type, id: entry.id, name: entry.name }
  });

  if (entry.image) {
    card.appendChild(makeDeferredManagerImage(entry.image));
  } else {
    card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: "?" }));
  }

  const main = makeElement("div", { className: "bot-manager-main" });
  if (["blocked", "favorite", "later"].includes(kind) && entry.id) {
    const selected = botManagerBulkSet(kind);
    const label = makeElement("label", { className: "bot-manager-select" });
    const input = makeElement("input", { attrs: { type: "checkbox", "aria-label": `Select ${entry.name || entry.id}` } });
    input.className = "bot-manager-select-input";
    input.checked = selected.has(entry.id);
    card.classList.toggle("is-bulk-selected", input.checked);
    input.addEventListener("change", () => {
      if (input.checked) selected.add(entry.id);
      else selected.delete(entry.id);
      card.classList.toggle("is-bulk-selected", input.checked);
      updateBotManagerBulkCount(kind);
    });
    label.append(input, document.createTextNode("Select"));
    main.appendChild(label);
  }
  main.appendChild(makeElement("div", {
    className: "bot-manager-title",
    text: displayNormalizedSavedText(entry.name || entry.id || "Unknown bot")
  }));

  if (entry.creator) main.appendChild(makeElement("div", { className: "bot-manager-creator", text: displayNormalizedSavedText(entry.creator) }));
  main.appendChild(makeElement("div", { className: "bot-manager-id", text: entry.id || "name-only block" }));

  if (kind === "blocked" && entry.id) {
    const dislikeHandled = quickDislikeHistoryEntry(entry.id);
    const lessLikeHandled = quickLessLikeHistoryEntry(entry.id);
    if (dislikeHandled) {
      const when = dislikeHandled.handledAt ? ` · ${new Date(dislikeHandled.handledAt).toLocaleString()}` : "";
      main.appendChild(makeElement("div", {
        className: "bot-manager-creator",
        text: `Dislike: ${quickDislikeHistoryLabel(dislikeHandled)}${when}`
      }));
    }
    if (lessLikeHandled) {
      const when = lessLikeHandled.handledAt ? ` · ${new Date(lessLikeHandled.handledAt).toLocaleString()}` : "";
      main.appendChild(makeElement("div", {
        className: "bot-manager-creator",
        text: `Less Like: ${quickLessLikeHistoryLabel(lessLikeHandled)}${when}`
      }));
    } else {
      const failure = quickLessLikeBulkState?.failureMeta?.[entry.id];
      if (failure) {
        const statusBits = [failure.status || "failed"];
        if (failure.httpStatus) statusBits.push(`HTTP ${failure.httpStatus}`);
        if (failure.stage) statusBits.push(failure.stage);
        if (failure.networkAttempts) statusBits.push(`${failure.networkAttempts} rating attempt${failure.networkAttempts === 1 ? "" : "s"}`);
        else if (failure.tokenAttempts) statusBits.push(`${failure.tokenAttempts} token attempt${failure.tokenAttempts === 1 ? "" : "s"}`);
        if (failure.availabilityNetworkAttempts) statusBits.push(`${failure.availabilityNetworkAttempts} availability check${failure.availabilityNetworkAttempts === 1 ? "" : "s"}`);
        if (failure.tokenSource) statusBits.push(`token: ${failure.tokenSource}`);
        const reason = String(failure.reason || "").trim();
        main.appendChild(makeElement("div", {
          className: "bot-manager-creator",
          text: `Less Like last failure: ${statusBits.join(" · ")}${reason ? ` · ${reason}` : ""}`
        }));
      }
    }
  }

  if (kind === "favorite") {
    const suffix = entry.savedAt ? ` · ${new Date(entry.savedAt).toLocaleString()}` : "";
    main.appendChild(makeElement("div", { className: "bot-manager-creator", text: `Saved in favorite history${suffix}` }));
  }
  if (entry.description) main.appendChild(makeElement("div", { className: "bot-manager-description", text: displayNormalizedSavedText(entry.description) }));

  if (["favorite", "later"].includes(kind) && entry.id) {
    const organizer = managerOrganizerMeta(entry);
    const chips = [];
    uniqueClean(organizer.collections || []).forEach(folder => chips.push(`Folder: ${folder}`));
    uniqueClean(organizer.tags || []).forEach(tag => chips.push(`#${tag}`));
    if (organizer.status) chips.push(organizer.status.replace(/-/g, " "));
    if (kind === "favorite" && (laterBotState?.ids || []).includes(entry.id)) chips.push("Later");
    if (kind === "later" && (favoriteBotState?.ids || []).includes(entry.id)) chips.push("Favorite history");
    if (managerEntryBlocked(entry)) chips.push("Blocked");
    else if (managerEntryOpened(entry)) chips.push("Opened");
    else chips.push("Unopened");

    if (chips.length) {
      const chipHost = makeElement("div", { className: "bot-manager-meta-chips" });
      chips.slice(0, 12).forEach(text => chipHost.appendChild(makeElement("span", { text })));
      main.appendChild(chipHost);
    }
    if (organizer.note) main.appendChild(makeElement("div", { className: "bot-manager-note", text: organizer.note }));
  }

  const actions = makeElement("div", { className: "bot-manager-actions" });
  if (entry.chatUrl) actions.appendChild(makeElement("a", { text: "Open chat", attrs: { href: entry.chatUrl, target: "_blank", rel: "noopener noreferrer" } }));
  if (entry.profileUrl) actions.appendChild(makeElement("a", { text: "Open profile", attrs: { href: entry.profileUrl, target: "_blank", rel: "noopener noreferrer" } }));
  if (kind === "favorite" && entry.id) {
    const inLater = (laterBotState?.ids || []).includes(entry.id);
    actions.appendChild(makeElement("button", {
      className: "bot-manager-later-toggle",
      text: inLater ? "Remove from Later" : "Add to Later",
      attrs: { type: "button" }
    }));
  }
  actions.appendChild(makeElement("button", { className: "bot-manager-remove", text: "Remove", attrs: { type: "button" } }));
  main.appendChild(actions);
  card.appendChild(main);
  return card;
}

function renderAutoBlockMatchCounters() {
  const label = $("autoBlockMatchCounters");
  if (!label) return;
  if (!blockingDataLoaded && !(blockedState?.ids || []).length) {
    label.textContent = "Automatically blocked in the current Blocked bots list: open Discovery & Filters to load counts.";
    return;
  }
  let words = 0;
  let tags = 0;
  let both = 0;
  const meta = blockedState?.meta || {};
  // Count only the IDs still blocked, not the entire history of ever-seen bots.
  for (const id of new Set(blockedState?.ids || [])) {
    const entry = meta[id];
    if (!entry) continue;
    const word = entry.autoBlockedByWord === true;
    const tag = entry.autoBlockedByTag === true;
    if (word) words++;
    if (tag) tags++;
    if (word && tag) both++;
  }
  label.textContent = `Automatically blocked in the current Blocked bots list: Words ${words} · Tags ${tags} · Both ${both}`;
}

function renderBotManager(kind) {
  if (kind === "blocked") renderAutoBlockMatchCounters();
  refreshBotManagerFolderOptions(kind);
  const isBlocked = kind === "blocked";
  const host = $(managerElementId(kind, "Manager"));
  if (!host) return;

  const allEntries = botEntriesFromStore(storeForManagerKind(kind), isBlocked);
  const entries = getBotManagerEntries(kind, allEntries);
  const ui = botManagerUiState[kind] || { visible: 10, collapsed: true, query: "" };
  const hasSearch = !!getBotManagerSearch(kind);

  let limit = Number(ui.visible || 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 10;

  // Never create thousands of cards in one synchronous DOM operation. Search
  // results are paged too; users can reveal more in small 10-item chunks.
  const shownEntries = entries.slice(0, limit);

  updateBotManagerSummary(kind, allEntries.length, entries.length, shownEntries.length);
  if (kind === "blocked") {
    if (!blockedBulkDislikeRunning) {
      updateBlockedDislikeStatus();
      updateBlockedBulkResumeControls();
    }
    if (!blockedBulkLessLikeRunning) {
      updateBlockedLessLikeStatus();
      updateBlockedLessLikeResumeControls();
    }
  }

  const showMore = $(managerElementId(kind, "ShowMore"));
  const showLess = $(managerElementId(kind, "ShowLess"));
  const collapse = $(managerElementId(kind, "Collapse"));

  if (showMore) {
    showMore.style.display = entries.length > shownEntries.length ? "" : "none";
    showMore.textContent = `Show 10 more (${Math.max(0, entries.length - shownEntries.length)} left)`;
  }

  if (showLess) {
    showLess.style.display = shownEntries.length > 10 || !ui.collapsed ? "" : "none";
  }

  if (collapse) {
    collapse.style.display = entries.length > 10 ? "" : "none";
    collapse.textContent = limit <= 10 ? "Show 100" : "Collapse to 10";
  }

  if (!allEntries.length) {
    setEmptyState(host, "Nothing saved here yet.");
    updateBotManagerBulkCount(kind);
    return;
  }

  if (!entries.length) {
    setEmptyState(host, "No matches for that search.");
    updateBotManagerBulkCount(kind);
    return;
  }

  host.replaceChildren(...shownEntries.map(entry => botManagerCardElement(entry, kind)));
  updateBotManagerBulkCount(kind);

  host.querySelectorAll(".bot-manager-later-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".bot-manager-card");
      const id = String(card?.dataset.id || "").trim();
      if (!id) return;
      const entry = allEntries.find(item => item.id === id) || {};
      laterBotState = normalizeBotStore(laterBotState);
      const before = cloneJson(laterBotState);
      const inLater = laterBotState.ids.includes(id);

      if (inLater) {
        laterBotState.ids = laterBotState.ids.filter(item => item !== id);
        delete laterBotState.meta[id];
      } else {
        laterBotState.ids.push(id);
        laterBotState.meta[id] = {
          ...(laterBotState.meta[id] || {}),
          id,
          name: entry.name || id,
          image: entry.image || "",
          creator: entry.creator || "",
          description: entry.description || "",
          chatUrl: entry.chatUrl || `https://spicychat.ai/chat/${id}`,
          profileUrl: entry.profileUrl || `https://spicychat.ai/chatbot/${id}`,
          savedAt: Date.now()
        };
      }

      markSavedStoreDirty("later");
      renderBotManager("favorite");
      renderBotManager("later");
      showSettingsToast(inLater ? "Removed from Later." : "Added to Later.", () => {
        laterBotState = normalizeBotStore(before);
        markSavedStoreDirty("later");
        renderBotManager("favorite");
        renderBotManager("later");
      });
    });
  });

  host.querySelectorAll(".bot-manager-remove").forEach(button => {
    button.addEventListener("click", async () => {
      const card = button.closest(".bot-manager-card");
      const id = card?.dataset.id || "";
      const name = card?.dataset.name || "";
      const type = card?.dataset.type || "id";
      const before = kind === "opened"
        ? { ids: [...currentOpened], meta: cloneJson(openedChatMetaState) }
        : cloneJson(storeForManagerKind(kind));

      if (kind === "blocked") {
        if (type === "id") {
          await rememberAutoBlockWordExceptions([id]);
          blockedState.ids = blockedState.ids.filter(x => x !== id);
          delete blockedState.meta[id];
        } else {
          blockedState.names = blockedState.names.filter(x => x !== name);
          delete blockedState.meta[`name:${name}`];
          delete blockedState.meta[name];
        }
      } else if (kind === "later") {
        laterBotState.ids = laterBotState.ids.filter(x => x !== id);
        delete laterBotState.meta[id];
      } else if (kind === "favorite") {
        favoriteBotState.ids = favoriteBotState.ids.filter(x => x !== id);
        delete favoriteBotState.meta[id];
      } else if (kind === "opened") {
        currentOpened = currentOpened.filter(x => x !== id);
        delete openedChatMetaState[id];
      } else {
        notInterestedState.ids = notInterestedState.ids.filter(x => x !== id);
        delete notInterestedState.meta[id];
      }

      markSavedStoreDirty(kind);
      renderBotManager(kind);
      showSettingsToast(`Removed ${name || id || "saved item"}.`, () => {
        if (kind === "blocked") blockedState = normalizeBotStore(before);
        else if (kind === "later") laterBotState = normalizeBotStore(before);
        else if (kind === "favorite") favoriteBotState = normalizeBotStore(before);
        else if (kind === "opened") {
          currentOpened = uniqueClean(before.ids || []);
          openedChatMetaState = normalizeMetaStore(before.meta);
        } else notInterestedState = normalizeBotStore(before);
        markSavedStoreDirty(kind);
        renderBotManager(kind);
      });
    });
  });
}

async function addManagedBot(kind) {
  await ensureBlockingDataLoaded();
  const isBlocked = kind === "blocked";
  const idInput = $(isBlocked ? "blockedAddId" : "notInterestedAddId");
  const nameInput = $(isBlocked ? "blockedAddName" : "notInterestedAddName");
  const id = String(idInput?.value || "").trim();
  const name = String(nameInput?.value || "").trim();

  if (!id && !name) return;

  const store = isBlocked ? blockedState : notInterestedState;
  store.ids = store.ids || [];
  store.names = store.names || [];
  store.meta = store.meta || {};

  if (id && !store.ids.includes(id)) store.ids.push(id);

  if (isBlocked && name && !store.names.includes(name)) {
    store.names.push(name);
    store.meta[`name:${name}`] = {
      ...(store.meta[`name:${name}`] || {}),
      name,
      savedAt: Date.now()
    };
  }

  if (id) {
    store.meta[id] = {
      ...(store.meta[id] || {}),
      id,
      name: name || store.meta[id]?.name || id,
      chatUrl: `https://spicychat.ai/chat/${id}`,
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      savedAt: Date.now()
    };
  }

  if (isBlocked && savedListsDataLoaded) {
    enforceBlockedPriorityOverOpenedState();
  }

  if (idInput) idInput.value = "";
  if (nameInput) nameInput.value = "";
  markSavedStoreDirty(kind);
  renderBotManager(kind);
}
