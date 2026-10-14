// Feature-owned options helpers: creator-follow. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeCreatorHandle(value) {
  let text = String(value || "").trim();
  try { text = decodeURIComponent(text); } catch {}
  return text
    .replace(/^https?:\/\/[^/]+\/creator\//i, "")
    .replace(/^\/?creator\//i, "")
    .replace(/[?#].*$/g, "")
    .replace(/\/+$/g, "")
    .replace(/^@+/, "")
    .trim()
    .toLowerCase();
}

function creatorFollowAllowed(handleValue) {
  return !!normalizeCreatorHandle(handleValue);
}

function creatorNotificationAllowed(handleValue) {
  return !!normalizeCreatorHandle(handleValue);
}

function normalizeFavoriteCreatorPreferences(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    showOpenedBots: !!raw.showOpenedBots,
    showLaterBots: !!raw.showLaterBots,
    ignoreLanguageFilter: !!raw.ignoreLanguageFilter,
    ignoreTagWordFilters: !!raw.ignoreTagWordFilters,
    showAllBots: !!raw.showAllBots
  };
}

function normalizeCreatorStore(store) {
  const raw = store && typeof store === "object" ? store : {};
  const handles = uniqueClean(Array.isArray(raw.handles) ? raw.handles.map(normalizeCreatorHandle) : []);
  const meta = {};
  const rawMeta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  for (const [rawKey, item] of Object.entries(rawMeta)) {
    const key = normalizeCreatorHandle(rawKey || item?.handle || "");
    if (!key) continue;
    const sourceItem = item && typeof item === "object" ? item : {};
    meta[key] = { ...sourceItem, handle: key, preferences: normalizeFavoriteCreatorPreferences(sourceItem.preferences) };
  }
  return { handles, meta };
}

function normalizeCreatorBotWatchEntry(raw, fallbackHandle = "") {
  const item = raw && typeof raw === "object" ? raw : {};
  const id = String(item.id || item.botId || "").trim();
  if (!id) return null;
  const creatorHandle = normalizeCreatorHandle(item.creatorHandle || item.creator || item.creatorUrl || fallbackHandle);
  const creator = creatorHandle ? `@${creatorHandle}` : String(item.creator || "").replace(/\s+/g, " ").trim();
  return {
    id,
    name: String(item.name || item.title || id).replace(/\s+/g, " ").trim().slice(0, 160),
    creator,
    creatorHandle,
    creatorUrl: String(item.creatorUrl || (creatorHandle ? `https://spicychat.ai/creator/${encodeURIComponent(creatorHandle)}` : "")).trim(),
    chatUrl: String(item.chatUrl || `https://spicychat.ai/chat/${encodeURIComponent(id)}`).trim(),
    profileUrl: String(item.profileUrl || `https://spicychat.ai/chatbot/${encodeURIComponent(id)}`).trim(),
    image: String(item.image || "").trim(),
    description: String(item.description || "").replace(/\s+/g, " ").trim().slice(0, 500),
    detectedAt: Number(item.detectedAt || 0) || 0
  };
}

function normalizeCreatorBotWatchState(value) {
  const source = value && typeof value === "object" ? value : {};
  const creators = {};
  const rawCreators = source.creators && typeof source.creators === "object" ? source.creators : {};
  for (const [rawHandle, raw] of Object.entries(rawCreators)) {
    const handle = normalizeCreatorHandle(rawHandle || raw?.handle || "");
    if (!handle || !raw || typeof raw !== "object") continue;
    creators[handle] = {
      handle,
      initialized: !!raw.initialized,
      baselineAt: Number(raw.baselineAt || 0) || 0,
      baselineCount: Number(raw.baselineCount || 0) || 0,
      seenIds: uniqueClean(Array.isArray(raw.seenIds) ? raw.seenIds : []).slice(0, 180),
      lastCheckedAt: Number(raw.lastCheckedAt || 0) || 0,
      lastNewAt: Number(raw.lastNewAt || 0) || 0,
      lastNewCount: Math.max(0, Number(raw.lastNewCount || 0) || 0),
      lastError: String(raw.lastError || "").slice(0, 500)
    };
  }

  const recent = [];
  const seen = new Set();
  for (const raw of Array.isArray(source.recent) ? source.recent : []) {
    const item = normalizeCreatorBotWatchEntry(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    recent.push(item);
    if (recent.length >= 240) break;
  }

  return {
    version: 1,
    creators,
    recent,
    lastRunAt: Number(source.lastRunAt || 0) || 0,
    lastScanAt: Number(source.lastScanAt || 0) || 0,
    lastDurationMs: Number(source.lastDurationMs || 0) || 0,
    lastCheckedCreators: Math.max(0, Number(source.lastCheckedCreators || 0) || 0),
    lastNewCount: Math.max(0, Number(source.lastNewCount || 0) || 0),
    lastFailureCount: Math.max(0, Number(source.lastFailureCount || 0) || 0),
    lastReason: String(source.lastReason || "").slice(0, 80),
    lastWebhookAt: Number(source.lastWebhookAt || 0) || 0,
    lastWebhookError: String(source.lastWebhookError || "").slice(0, 500)
  };
}

function normalizeCreatorBotWebhookConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  return { enabled: !!source.enabled, url: String(source.url || "").trim() };
}

function creatorBotWatchEntryStatus(handleValue) {
  const handle = normalizeCreatorHandle(handleValue);
  if (!checked("enableCreatorBotNotifications", !!loadedSettingsSnapshot.enableCreatorBotNotifications)) return "New-bot watch disabled";
  const item = creatorBotWatchState?.creators?.[handle];
  if (!item?.initialized) return "Baseline pending";
  const parts = [];
  if (item.lastCheckedAt) parts.push(`checked ${new Date(item.lastCheckedAt).toLocaleString()}`);
  if (item.lastNewCount) parts.push(`${item.lastNewCount} new last check`);
  if (item.lastError) parts.push(item.lastError);
  return parts.length ? parts.join(" · ") : `Baseline ready (${item.baselineCount || item.seenIds?.length || 0} bots)`;
}

function renderCreatorBotWatchStatus() {
  const state = normalizeCreatorBotWatchState(creatorBotWatchState);
  creatorBotWatchState = state;
  const enabled = checked("enableCreatorBotNotifications", !!loadedSettingsSnapshot.enableCreatorBotNotifications);
  const followedHandles = normalizeCreatorStore(followedCreatorState).handles;
  const followedCount = followedHandles.length;
  const initialized = Object.values(state.creators).filter(item => item?.initialized).length;
  const lastRun = state.lastRunAt ? new Date(state.lastRunAt).toLocaleString() : "never";
  const summaryParts = enabled
    ? [`${followedCount} followed`, `${initialized} baselined`, `last run ${lastRun}`]
    : ["New-bot watch is disabled"];
  if (enabled && state.lastCheckedCreators) summaryParts.push(`${state.lastCheckedCreators} checked`);
  if (enabled && state.lastNewCount) summaryParts.push(`${state.lastNewCount} new`);
  if (enabled && state.lastFailureCount) summaryParts.push(`${state.lastFailureCount} failed`);
  if (state.lastWebhookError) summaryParts.push(`webhook: ${state.lastWebhookError}`);
  const text = summaryParts.join(" · ");
  if ($("creatorBotWatchStatus")) $("creatorBotWatchStatus").textContent = text;
  if ($("creatorBotWatchStatusCenter")) $("creatorBotWatchStatusCenter").textContent = text;

  const host = $("creatorBotRecentList");
  if (!host) return;
  host.replaceChildren();
  const recent = state.recent.slice(0, 40);
  if (!recent.length) {
    setEmptyState(host, enabled
      ? "No new bots detected yet. The first successful check for each followed creator only creates a baseline."
      : "Enable new-bot notifications above to start watching followed creators.");
    return;
  }

  for (const item of recent) {
    const card = makeElement("div", { className: "bot-manager-card creator-bot-watch-row", dataset: { id: item.id } });
    if (item.image) card.appendChild(makeDeferredManagerImage(item.image));
    else card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: "N" }));
    const main = makeElement("div", { className: "bot-manager-main" });
    main.appendChild(makeElement("div", { className: "bot-manager-title", text: displayNormalizedSavedText(item.name || item.id) }));
    const meta = [item.creator || (item.creatorHandle ? `@${item.creatorHandle}` : ""), item.detectedAt ? `detected ${new Date(item.detectedAt).toLocaleString()}` : ""].filter(Boolean).join(" · ");
    if (meta) main.appendChild(makeElement("div", { className: "bot-manager-creator", text: meta }));
    if (item.description) main.appendChild(makeElement("div", { className: "bot-manager-note", text: displayNormalizedSavedText(item.description) }));
    const actions = makeElement("div", { className: "bot-manager-actions" });
    if (item.chatUrl) actions.appendChild(makeElement("a", { text: "Open chat", attrs: { href: item.chatUrl, target: "_blank", rel: "noopener noreferrer" } }));
    if (item.creatorUrl) actions.appendChild(makeElement("a", { text: "Creator", attrs: { href: item.creatorUrl, target: "_blank", rel: "noopener noreferrer" } }));
    main.appendChild(actions);
    card.appendChild(main);
    host.appendChild(card);
  }
}

function creatorEntriesFromStore(store) {
  const normalized = normalizeCreatorStore(store);

  return normalized.handles.map(handle => {
    const item = normalized.meta?.[handle] || {};
    return {
      handle,
      name: item.name || `@${handle}`,
      url: item.url || `https://spicychat.ai/creator/${encodeURIComponent(handle)}`,
      savedAt: item.savedAt || 0,
      preferences: normalizeFavoriteCreatorPreferences(item.preferences)
    };
  });
}

function creatorManagerCardElement(entry, { rowClass, placeholder, buttonClass, buttonText }) {
  const card = makeElement("div", {
    className: `bot-manager-card ${rowClass}`,
    dataset: { handle: entry.handle }
  });
  card.appendChild(makeElement("div", { className: "bot-manager-placeholder", text: placeholder }));

  const main = makeElement("div", { className: "bot-manager-main" });
  main.append(
    makeElement("div", { className: "bot-manager-title", text: displayNormalizedSavedText(entry.name) }),
    makeElement("div", { className: "bot-manager-id", text: `@${entry.handle}` })
  );

  const actions = makeElement("div", { className: "bot-manager-actions" });
  actions.append(
    makeElement("a", { text: "Creator", attrs: { href: entry.url, target: "_blank", rel: "noopener noreferrer" } }),
    makeElement("button", { className: buttonClass, text: buttonText, attrs: { type: "button" } })
  );
  main.appendChild(actions);
  card.appendChild(main);
  return card;
}

async function persistFavoriteCreatorsNow() {
  favoriteCreatorState = normalizeCreatorStore(favoriteCreatorState);
  await storageSet({ [FAVORITE_CREATORS_KEY]: favoriteCreatorState });
  dirtySavedStores.delete("favoriteCreators");
}

function renderFavoriteCreators() {
  const host = $("favoriteCreatorManager");
  const summary = $("favoriteCreatorManagerSummary");
  if (!host) return;

  const entries = creatorEntriesFromStore(favoriteCreatorState)
    .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));

  const limit = Math.max(20, Number(favoriteCreatorUiState.visible || 20));
  const shownEntries = entries.slice(0, limit);

  if (summary) {
    summary.textContent = entries.length
      ? `${entries.length} saved, showing ${shownEntries.length}`
      : "0 saved";
  }

  const showMore = $("favoriteCreatorShowMore");
  const showLess = $("favoriteCreatorShowLess");
  const collapse = $("favoriteCreatorCollapse");

  if (showMore) {
    showMore.style.display = entries.length > shownEntries.length ? "" : "none";
    showMore.textContent = `Show 20 more (${Math.max(0, entries.length - shownEntries.length)} left)`;
  }

  if (showLess) {
    showLess.style.display = shownEntries.length > 20 || !favoriteCreatorUiState.collapsed ? "" : "none";
  }

  if (collapse) {
    collapse.style.display = entries.length > 20 ? "" : "none";
    collapse.textContent = limit <= 20 ? "Show 100" : "Collapse to 20";
  }

  if (!entries.length) {
    setEmptyState(host, "No favorite creators saved yet.");
    return;
  }

  host.replaceChildren(...shownEntries.map(entry => creatorManagerCardElement(entry, {
    rowClass: "ds-creator-fav-row",
    placeholder: "★",
    buttonClass: "favorite-creator-remove",
    buttonText: "Remove"
  })));

  const prefDefs = [
    ["showOpenedBots", "Show opened bots"],
    ["showLaterBots", "Show Saved for Later bots"],
    ["ignoreLanguageFilter", "Ignore language filter"],
    ["ignoreTagWordFilters", "Ignore tag / blocked-word filters"],
    ["showAllBots", "Always show all bots from this creator"]
  ];

  for (const row of host.querySelectorAll(".ds-creator-fav-row")) {
    const handle = normalizeCreatorHandle(row.dataset.handle || "");
    if (!handle) continue;
    const meta = favoriteCreatorState.meta?.[handle] || {};
    const prefs = normalizeFavoriteCreatorPreferences(meta.preferences);
    const main = row.querySelector(".bot-manager-main") || row;
    const box = makeElement("div", { className: "favorite-creator-overrides" });
    for (const [key, labelText] of prefDefs) {
      const label = makeElement("label", { className: "favorite-creator-override" });
      const input = makeElement("input", { attrs: { type: "checkbox", "data-pref": key } });
      input.checked = !!prefs[key];
      label.append(input, document.createTextNode(labelText));
      box.appendChild(label);
    }
    const note = makeElement("div", {
      className: "bot-manager-note",
      text: "Blocked bots always stay hidden. These switches only override softer discovery filters for this creator."
    });
    main.append(box, note);
  }

  host.querySelectorAll(".favorite-creator-overrides input[data-pref]").forEach(input => {
    input.addEventListener("change", async () => {
      const row = input.closest(".ds-creator-fav-row");
      const handle = normalizeCreatorHandle(row?.dataset.handle || "");
      const key = String(input.dataset.pref || "");
      if (!handle || !key) return;
      favoriteCreatorState = normalizeCreatorStore(favoriteCreatorState);
      const meta = favoriteCreatorState.meta[handle] || { handle };
      const prefs = normalizeFavoriteCreatorPreferences(meta.preferences);
      prefs[key] = !!input.checked;
      favoriteCreatorState.meta[handle] = { ...meta, preferences: prefs };
      await persistFavoriteCreatorsNow();
      showSettingsToast(`Updated @${handle} visibility overrides.`);
    });
  });

  host.querySelectorAll(".favorite-creator-remove").forEach(button => {
    button.addEventListener("click", async () => {
      const handle = button.closest(".ds-creator-fav-row")?.dataset.handle || "";
      const before = cloneJson(favoriteCreatorState);
      favoriteCreatorState.handles = favoriteCreatorState.handles.filter(item => item !== handle);
      delete favoriteCreatorState.meta[handle];
      renderFavoriteCreators();
      await persistFavoriteCreatorsNow();
      showSettingsToast(`Removed @${handle || "creator"}.`, async () => {
        favoriteCreatorState = normalizeCreatorStore(before);
        renderFavoriteCreators();
        await persistFavoriteCreatorsNow();
      });
    });
  });
}

async function addFavoriteCreator() {
  const handleInput = $("favoriteCreatorAddHandle");
  const nameInput = $("favoriteCreatorAddName");
  const handle = normalizeCreatorHandle(handleInput?.value || "");
  const name = String(nameInput?.value || "").trim() || (handle ? `@${handle}` : "");

  if (!handle) return;

  favoriteCreatorState = normalizeCreatorStore(favoriteCreatorState);
  if (!favoriteCreatorState.handles.includes(handle)) favoriteCreatorState.handles.push(handle);
  favoriteCreatorState.meta[handle] = {
    ...(favoriteCreatorState.meta[handle] || {}),
    handle,
    name,
    url: `https://spicychat.ai/creator/${encodeURIComponent(handle)}`,
    savedAt: Date.now(),
    preferences: normalizeFavoriteCreatorPreferences(favoriteCreatorState.meta[handle]?.preferences)
  };

  if (handleInput) handleInput.value = "";
  if (nameInput) nameInput.value = "";
  renderFavoriteCreators();
  renderBotManager("favorite");
  renderBotManager("later");
  renderBotManager("opened");
  await persistFavoriteCreatorsNow();
  showSettingsToast(`Saved @${handle} as a favorite creator.`);
  loadChangelog();
}

function renderFollowedCreators() {
  const host = $("followedCreatorManager");
  const summary = $("followedCreatorManagerSummary");
  if (!host) return;

  const queryTerms = splitManagerSearchTerms(followedCreatorUiState.query || "");
  const sortMode = followedCreatorUiState.sort || "newest";
  let entries = creatorEntriesFromStore(followedCreatorState);
  const total = entries.length;
  if (queryTerms.length) {
    entries = entries.filter(entry => managerHaystackMatchesTerms(`${entry.name} ${entry.handle}`, queryTerms));
  }
  entries.sort((a, b) => {
    if (sortMode === "oldest") return Number(a.savedAt || 0) - Number(b.savedAt || 0);
    if (sortMode === "name-asc") return String(a.name || a.handle).localeCompare(String(b.name || b.handle));
    if (sortMode === "name-desc") return String(b.name || b.handle).localeCompare(String(a.name || a.handle));
    return Number(b.savedAt || 0) - Number(a.savedAt || 0);
  });

  const limit = Math.max(20, Number(followedCreatorUiState.visible || 20));
  const shownEntries = entries.slice(0, limit);

  if (summary) summary.textContent = total ? `${total} saved, showing ${shownEntries.length}${queryTerms.length ? ` matching ${entries.length}` : ""}` : "0 saved";

  const showMore = $("followedCreatorShowMore");
  const showLess = $("followedCreatorShowLess");
  const collapse = $("followedCreatorCollapse");
  if (showMore) {
    showMore.style.display = entries.length > shownEntries.length ? "" : "none";
    showMore.textContent = `Show 20 more (${Math.max(0, entries.length - shownEntries.length)} left)`;
  }
  if (showLess) showLess.style.display = shownEntries.length > 20 || !followedCreatorUiState.collapsed ? "" : "none";
  if (collapse) {
    collapse.style.display = entries.length > 20 ? "" : "none";
    collapse.textContent = limit <= 20 ? "Show 100" : "Collapse to 20";
  }

  if (!entries.length) {
    setEmptyState(host, queryTerms.length ? "No followed creators match that search." : "No followed creators saved yet.");
    return;
  }

  host.replaceChildren(...shownEntries.map(entry => {
    const card = creatorManagerCardElement(entry, {
      rowClass: "ds-creator-follow-row",
      placeholder: "✓",
      buttonClass: "followed-creator-remove",
      buttonText: "Unfollow"
    });
    const main = card.querySelector(".bot-manager-main");
    const actions = main?.querySelector(".bot-manager-actions");
    const status = makeElement("div", { className: "hint", text: creatorBotWatchEntryStatus(entry.handle) });
    if (main && actions) main.insertBefore(status, actions);
    else main?.appendChild(status);
    return card;
  }));

  host.querySelectorAll(".followed-creator-remove").forEach(button => {
    button.addEventListener("click", () => {
      const handle = button.closest(".ds-creator-follow-row")?.dataset.handle || "";
      const before = cloneJson(followedCreatorState);
      followedCreatorState.handles = followedCreatorState.handles.filter(item => item !== handle);
      delete followedCreatorState.meta[handle];
      markSavedStoreDirty("followedCreators");
      renderFollowedCreators();
      showSettingsToast(`Unfollowed @${handle || "creator"}.`, () => {
        followedCreatorState = normalizeCreatorStore(before);
        markSavedStoreDirty("followedCreators");
        renderFollowedCreators();
      });
    });
  });
}

function addFollowedCreator() {
  const handleInput = $("followedCreatorAddHandle");
  const nameInput = $("followedCreatorAddName");
  const handle = normalizeCreatorHandle(handleInput?.value || "");
  const name = String(nameInput?.value || "").trim() || (handle ? `@${handle}` : "");
  if (!handle) return;
  followedCreatorState = normalizeCreatorStore(followedCreatorState);
  if (!followedCreatorState.handles.includes(handle)) followedCreatorState.handles.push(handle);
  followedCreatorState.meta[handle] = {
    ...(followedCreatorState.meta[handle] || {}),
    handle,
    name,
    url: `https://spicychat.ai/creator/${encodeURIComponent(handle)}`,
    savedAt: Date.now()
  };
  markSavedStoreDirty("followedCreators");
  if (handleInput) handleInput.value = "";
  if (nameInput) nameInput.value = "";
  renderFollowedCreators();
}
