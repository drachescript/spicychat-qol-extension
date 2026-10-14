// Feature-owned options helpers: settings-controls. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function setBlockedBotNameRepairStatus(text = "") {
  const status = $("blockedBotNameRepairStatus");
  if (status) status.textContent = text;
}

async function repairBlockedBotNames() {
  await ensureBlockingDataLoaded();
  const button = $("repairBlockedBotNames");
  if (blockedBotNameRepairRunning) {
    blockedBotNameRepairStopRequested = true;
    if (button) button.textContent = "Stopping...";
    setBlockedBotNameRepairStatus("Stopping after the current profile...");
    return;
  }

  const locallyRepaired = repairBlockedNamesFromLocalMetadata();
  const targets = (blockedState.ids || []).filter(id => {
    const item = blockedState.meta?.[id] || {};
    return isPlaceholderBotName(item.name, id);
  });

  if (!targets.length) {
    if (locallyRepaired) {
      await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
      renderBotManager("blocked");
      showSettingsToast(`Repaired ${locallyRepaired} blocked bot name${locallyRepaired === 1 ? "" : "s"} from saved local metadata.`);
    } else {
      showSettingsToast("No bad blocked-bot names were found.");
    }
    setBlockedBotNameRepairStatus("");
    return;
  }

  blockedBotNameRepairRunning = true;
  blockedBotNameRepairStopRequested = false;
  if (button) {
    button.disabled = false;
    button.textContent = "Stop name repair";
  }

  let repaired = locallyRepaired;
  let checked = 0;
  let rateLimited = false;

  try {
    for (const id of targets) {
      if (blockedBotNameRepairStopRequested) break;
      checked++;
      setBlockedBotNameRepairStatus(`Checking ${checked}/${targets.length} · ${repaired} repaired`);

      const item = blockedState.meta?.[id] || {};
      const checkedBot = await checkBotAvailability({
        id,
        name: item.name || id,
        image: item.image || "",
        creator: item.creator || item.creatorName || item.creatorHandle || "",
        chatUrl: item.chatUrl || `https://spicychat.ai/chat/${id}`
      });

      if (checkedBot.httpStatus === 429) {
        rateLimited = true;
        break;
      }

      const profileName = normalizeBotSnapshot(checkedBot.snapshot || {}).fields?.name || "";
      if (checkedBot.status === "available" && !isPlaceholderBotName(profileName, id)) {
        blockedState.meta[id] = {
          ...item,
          id,
          name: profileName,
          image: item.image || checkedBot.snapshot?.fields?.image || checkedBot.image || "",
          creator: item.creator || checkedBot.snapshot?.fields?.creator || checkedBot.creator || "",
          profileUrl: item.profileUrl || `https://spicychat.ai/chatbot/${id}`,
          chatUrl: item.chatUrl || `https://spicychat.ai/chat/${id}`
        };
        repaired++;
      }

      // Save periodically so a long repair does not lose progress if Settings closes.
      if (checked % 10 === 0) {
        await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
        renderBotManager("blocked");
      }

      await new Promise(resolve => setTimeout(resolve, 220));
    }
  } finally {
    blockedBotNameRepairRunning = false;
    const stopped = blockedBotNameRepairStopRequested;
    blockedBotNameRepairStopRequested = false;
    await storageSet({ [BLOCKED_BOTS_KEY]: blockedState });
    renderBotManager("blocked");
    if (button) {
      button.disabled = false;
      button.textContent = "Repair bad names";
    }

    if (rateLimited) {
      setBlockedBotNameRepairStatus(`Stopped: SpicyChat rate-limited the repair · ${repaired} repaired`);
      showSettingsToast(`Repaired ${repaired} name${repaired === 1 ? "" : "s"}, then SpicyChat rate-limited the profile checks. You can continue later.`);
    } else if (stopped) {
      setBlockedBotNameRepairStatus(`Stopped · ${repaired} repaired`);
      showSettingsToast(`Name repair stopped. ${repaired} blocked bot name${repaired === 1 ? "" : "s"} repaired so far.`);
    } else {
      setBlockedBotNameRepairStatus(`Done · ${repaired} repaired`);
      showSettingsToast(`Repaired ${repaired} blocked bot name${repaired === 1 ? "" : "s"}.`);
    }
  }
}

function setupBotManagerControls(kind) {
  if (kind === "blocked") {
    $("repairBlockedBotNames")?.addEventListener("click", repairBlockedBotNames);
    $("bulkDislikeBlockedBots")?.addEventListener("click", () => bulkDislikeBlockedBots().catch(() => showSettingsToast("Bulk Dislike failed.")));
    $("resumeBlockedDislikeRun")?.addEventListener("click", () => runBlockedBulkDislike("resume").catch(() => showSettingsToast("Could not resume Bulk Dislike.")));
    $("retryFailedBlockedDislikes")?.addEventListener("click", () => runBlockedBulkDislike("failed").catch(() => showSettingsToast("Could not retry failed dislikes.")));
    $("clearBlockedDislikeHistory")?.addEventListener("click", () => clearBlockedDislikeHistory().catch(() => showSettingsToast("Could not clear handled dislike history.")));
    $("resetAndRedoBlockedDislikes")?.addEventListener("click", () => resetAndRedoBlockedDislikes().catch(() => showSettingsToast("Could not reset and redo blocked dislikes.")));
    $("bulkLessLikeBlockedBots")?.addEventListener("click", () => bulkLessLikeBlockedBots().catch(() => showSettingsToast("Stop recommending bulk run failed.")));
    $("resumeBlockedLessLikeRun")?.addEventListener("click", () => runBlockedBulkLessLike("resume").catch(() => showSettingsToast("Could not resume Stop recommending.")));
    $("retryFailedBlockedLessLikes")?.addEventListener("click", () => runBlockedBulkLessLike("failed").catch(() => showSettingsToast("Could not retry failed Stop recommending actions.")));
    $("clearBlockedLessLikeHistory")?.addEventListener("click", () => clearBlockedLessLikeHistory().catch(() => showSettingsToast("Could not clear Stop recommending history.")));
    $("resetAndRedoBlockedLessLikes")?.addEventListener("click", () => resetAndRedoBlockedLessLikes().catch(() => showSettingsToast("Could not reset and redo Stop recommending history.")));
    $("blockedBotDislikeFilter")?.addEventListener("change", () => {
      botManagerUiState.blocked.visible = 10;
      botManagerUiState.blocked.collapsed = true;
      renderBotManager("blocked");
    });
    $("blockedBotLessLikeFilter")?.addEventListener("change", () => {
      botManagerUiState.blocked.visible = 10;
      botManagerUiState.blocked.collapsed = true;
      renderBotManager("blocked");
    });
    $("blockedBotApplyBulk")?.addEventListener("click", () => applyBlockedBotBulkAction().catch(() => showSettingsToast("Blocked bot bulk action failed.")));
  }

  if (["blocked", "favorite", "later"].includes(kind)) {
    $(managerElementId(kind, "SelectShown"))?.addEventListener("click", () => {
      const selected = botManagerBulkSet(kind);
      botManagerShownEntries(kind).forEach(entry => entry.id && selected.add(entry.id));
      renderBotManager(kind);
    });
    $(managerElementId(kind, "SelectMatches"))?.addEventListener("click", () => {
      const selected = botManagerBulkSet(kind);
      getBotManagerEntries(kind).forEach(entry => entry.id && selected.add(entry.id));
      renderBotManager(kind);
    });
    $(managerElementId(kind, "ClearSelection"))?.addEventListener("click", () => {
      botManagerBulkSet(kind).clear();
      renderBotManager(kind);
    });
    if (["favorite", "later"].includes(kind)) {
      $(managerElementId(kind, "ApplyBulk"))?.addEventListener("click", () => {
        applyBotManagerBulkAction(kind).catch(() => showSettingsToast("Bulk action failed."));
      });
    }
  }

  const search = $(managerElementId(kind, "Search"));
  const showMore = $(managerElementId(kind, "ShowMore"));
  const showLess = $(managerElementId(kind, "ShowLess"));
  const collapse = $(managerElementId(kind, "Collapse"));
  const sort = ["blocked", "later", "favorite", "opened"].includes(kind)
    ? $(managerElementId(kind, "SortMode"))
    : null;

  sort?.addEventListener("change", () => {
    botManagerUiState[kind].visible = 10;
    botManagerUiState[kind].collapsed = true;
    renderBotManager(kind);
  });

  const relation = ["favorite", "later"].includes(kind) ? $(managerElementId(kind, "RelationFilter")) : null;
  const folder = ["favorite", "later"].includes(kind) ? $(managerElementId(kind, "FolderFilter")) : null;
  const stateFilter = ["favorite", "later"].includes(kind) ? $(managerElementId(kind, "StateFilter")) : null;
  for (const control of [relation, folder, stateFilter]) {
    control?.addEventListener("change", () => {
      botManagerUiState[kind].visible = 10;
      botManagerUiState[kind].collapsed = true;
      renderBotManager(kind);
    });
  }

  const renderSearch = debounceCallback(() => {
    botManagerUiState[kind].query = search?.value || "";
    botManagerUiState[kind].visible = 10;
    botManagerUiState[kind].collapsed = true;
    renderBotManager(kind);
  });
  search?.addEventListener("input", renderSearch);
  const creatorFilter = ["favorite", "later"].includes(kind) ? $(managerElementId(kind, "CreatorFilter")) : null;
  creatorFilter?.addEventListener("input", debounceCallback(() => {
    botManagerUiState[kind].visible = 10;
    botManagerUiState[kind].collapsed = true;
    renderBotManager(kind);
  }));

  showMore?.addEventListener("click", () => {
    botManagerUiState[kind].collapsed = true;
    botManagerUiState[kind].visible = Math.min(
      5000,
      Number(botManagerUiState[kind].visible || 10) + 10
    );
    renderBotManager(kind);
  });

  showLess?.addEventListener("click", () => {
    botManagerUiState[kind].visible = 10;
    botManagerUiState[kind].collapsed = true;
    renderBotManager(kind);
  });

  collapse?.addEventListener("click", () => {
    const entries = getBotManagerEntries(kind);
    const current = Number(botManagerUiState[kind].visible || 10);
    if (current <= 10) {
      botManagerUiState[kind].collapsed = false;
      botManagerUiState[kind].visible = Math.min(100, entries.length);
    } else {
      botManagerUiState[kind].collapsed = true;
      botManagerUiState[kind].visible = 10;
    }
    renderBotManager(kind);
  });
}

function setupFavoriteCreatorControls() {
  const showMore = $("favoriteCreatorShowMore");
  const showLess = $("favoriteCreatorShowLess");
  const collapse = $("favoriteCreatorCollapse");

  showMore?.addEventListener("click", () => {
    favoriteCreatorUiState.collapsed = true;
    favoriteCreatorUiState.visible = Math.min(
      5000,
      Number(favoriteCreatorUiState.visible || 20) + 20
    );
    renderFavoriteCreators();
  });

  showLess?.addEventListener("click", () => {
    favoriteCreatorUiState.visible = 20;
    favoriteCreatorUiState.collapsed = true;
    renderFavoriteCreators();
  });

  collapse?.addEventListener("click", () => {
    const entries = creatorEntriesFromStore(favoriteCreatorState);
    const current = Number(favoriteCreatorUiState.visible || 20);
    if (current <= 20) {
      favoriteCreatorUiState.collapsed = false;
      favoriteCreatorUiState.visible = Math.min(100, entries.length);
    } else {
      favoriteCreatorUiState.collapsed = true;
      favoriteCreatorUiState.visible = 20;
    }
    renderFavoriteCreators();
  });
}

function setupFollowedCreatorControls() {
  const search = $("followedCreatorSearch");
  const sort = $("followedCreatorSortMode");
  const showMore = $("followedCreatorShowMore");
  const showLess = $("followedCreatorShowLess");
  const collapse = $("followedCreatorCollapse");

  const renderFollowedSearch = debounceCallback(() => {
    followedCreatorUiState.query = search?.value || "";
    followedCreatorUiState.visible = 20;
    followedCreatorUiState.collapsed = true;
    renderFollowedCreators();
  });
  search?.addEventListener("input", renderFollowedSearch);

  sort?.addEventListener("change", () => {
    followedCreatorUiState.sort = sort.value || "newest";
    renderFollowedCreators();
  });

  showMore?.addEventListener("click", () => {
    followedCreatorUiState.collapsed = true;
    followedCreatorUiState.visible = Math.min(5000, Number(followedCreatorUiState.visible || 20) + 20);
    renderFollowedCreators();
  });

  showLess?.addEventListener("click", () => {
    followedCreatorUiState.visible = 20;
    followedCreatorUiState.collapsed = true;
    renderFollowedCreators();
  });

  collapse?.addEventListener("click", () => {
    const entries = creatorEntriesFromStore(followedCreatorState);
    const current = Number(followedCreatorUiState.visible || 20);
    if (current <= 20) {
      followedCreatorUiState.collapsed = false;
      followedCreatorUiState.visible = Math.min(100, entries.length);
    } else {
      followedCreatorUiState.collapsed = true;
      followedCreatorUiState.visible = 20;
    }
    renderFollowedCreators();
  });
}

function revealSettingsTarget(targetId, options = {}) {
  const target = $(targetId);
  if (!target) return false;
  const page = target.closest(".tab-page");
  if (!page?.dataset?.page) return false;
  setActiveTab(page.dataset.page);
  expandSettingsCardForTarget(target);
  let details = target.closest("details");
  while (details) {
    details.open = true;
    details = details.parentElement?.closest?.("details") || null;
  }
  const focusTarget = target.closest(".card") || target.closest("label") || target;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    focusTarget.classList.add("ds-search-target");
    focusTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => focusTarget.classList.remove("ds-search-target"), 2200);
  }));
  return true;
}

function featureRegistryState(entry) {
  if (entry?.planned) return { key: "planned", label: "Planned" };
  if (entry?.builtIn) return { key: "built-in", label: "Built in" };
  const keys = Array.isArray(entry?.settings) ? entry.settings : (entry?.setting ? [entry.setting] : []);
  const controls = keys.map(key => ({ key, control: $(key) })).filter(item => item.control);
  if (!controls.length) return { key: "built-in", label: "Available" };
  const states = controls.map(({ key, control }) => {
    const raw = control.type === "checkbox" ? !!control.checked : !!String(control.value || "").trim();
    if (!raw) return false;
    const dependency = dependencyParentFor(key);
    const parent = dependency ? $(dependency.parent) : null;
    if (parent && parent.type === "checkbox" && !parent.checked) return false;
    return true;
  });
  const on = entry.statusMode === "all" ? states.every(Boolean) : states.some(Boolean);
  return { key: on ? "on" : "off", label: on ? "On" : "Off" };
}

function featureChronologyParts(entry) {
  const raw = String(entry?.updated || entry?.added || "").trim();
  if (!raw) return [0, 0, 0, 0, 0];
  const parts = raw.split(".").map(value => Number(value) || 0);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  let release = parts[3] || 0;
  let subrelease = 0;

  // Historical pre-v0.2 build numbers briefly used 641/642-style manifest
  // numbers. Treat those as 64.1/64.2 for catalogue chronology, while the
  // current 700+ manifest sequence maps to the human 70/71/... releases.
  if (major === 0 && minor === 1 && patch === 9) {
    if (release >= 700) release -= 630;
    else if (release >= 100) {
      subrelease = release % 10;
      release = Math.floor(release / 10);
    }
  }
  return [major, minor, patch, release, subrelease];
}

function compareFeatureChronology(left, right) {
  const a = featureChronologyParts(left);
  const b = featureChronologyParts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function featureIndexGroupId(groupName) {
  const name = String(groupName || "").trim();
  return FEATURE_INDEX_GROUP_IDS[name] || name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeFeatureIndexCollapsedCategories(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => String(item || "").trim()).filter(Boolean))].sort();
}

function loadFeatureIndexGroupState() {
  const collapsed = new Set(normalizeFeatureIndexCollapsedCategories(loadedSettingsSnapshot.featureIndexCollapsedCategories));
  const state = {};
  for (const [name, id] of Object.entries(FEATURE_INDEX_GROUP_IDS)) state[name] = !collapsed.has(id);
  return state;
}

function saveFeatureIndexGroupState(state) {
  const collapsed = Object.entries(state || {})
    .filter(([, open]) => open === false)
    .map(([groupName]) => featureIndexGroupId(groupName))
    .filter(Boolean)
    .sort();
  queueSettingsAutosaveValue("featureIndexCollapsedCategories", collapsed, { delay: 0 });
}

async function migrateLegacyFeatureIndexGroupState(groupOpenState) {
  // An explicitly stored empty array means the user chose to leave every group
  // open. Do not resurrect an older pre-v0.2.24 localStorage value over it.
  if (granularSettingsIndexCache.has("featureIndexCollapsedCategories")) return false;
  if (normalizeFeatureIndexCollapsedCategories(loadedSettingsSnapshot.featureIndexCollapsedCategories).length) return false;
  let legacy = {};
  try {
    const local = JSON.parse(localStorage.getItem(FEATURE_INDEX_LEGACY_GROUP_STATE_KEY) || "{}");
    if (local && typeof local === "object" && !Array.isArray(local)) legacy = { ...legacy, ...local };
  } catch {}
  try {
    const stored = await storageGet([FEATURE_INDEX_LEGACY_GROUP_STATE_KEY]);
    const value = stored?.[FEATURE_INDEX_LEGACY_GROUP_STATE_KEY];
    if (value && typeof value === "object" && !Array.isArray(value)) legacy = { ...legacy, ...value };
  } catch {}
  let changed = false;
  for (const [name, open] of Object.entries(legacy)) {
    if (typeof open !== "boolean") continue;
    groupOpenState[name] = open;
    changed = true;
  }
  if (!changed) return false;
  saveFeatureIndexGroupState(groupOpenState);
  try { localStorage.removeItem(FEATURE_INDEX_LEGACY_GROUP_STATE_KEY); } catch {}
  storageRemove(FEATURE_INDEX_LEGACY_GROUP_STATE_KEY).catch?.(() => {});
  return true;
}

function setupFeaturesIndex() {
  const host = $("featureIndexList");
  const search = $("featureIndexSearch");
  const category = $("featureIndexCategory");
  const status = $("featureIndexStatus");
  const platformFilter = $("featureIndexPlatform");
  const sortMode = $("featureIndexSort");
  const summary = $("featureIndexSummary");
  if (!host || !search || !category || !summary) return;

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const registry = Array.isArray(window.SpicyChatQoLFeatureRegistry)
    ? window.SpicyChatQoLFeatureRegistry.filter(entry => entry && entry.id && entry.name && entry.category).map(entry => ({ ...entry }))
    : [];
  if (!registry.some(entry => entry.id === "device-compatibility")) {
    registry.push({
      id: "device-compatibility",
      name: "Device compatibility",
      category: "Setup & Compatibility",
      description: "Keeps desktop-only bulk/helper-tab preferences saved but dormant on Android while styles, editing tools and normal current-page features keep working where supported.",
      builtIn: true,
      target: "accountSyncCard",
      added: "0.2.25",
      aliases: ["android unsupported", "desktop only", "mobile compatibility", "dormant settings", "device support"]
    });
  }
  if (!registry.some(entry => entry.id === "account-sync-foundation")) {
    registry.push({
      id: "account-sync-foundation",
      name: "QoL Account & Sync",
      category: "Data & Backup",
      description: "Links this device to the QoL Cloudflare sync service, syncs logical settings automatically, supports one-use device link codes, and keeps unsupported Android preferences preserved instead of switching them off.",
      builtIn: true,
      target: "accountSyncCard",
      added: "0.2.25",
      aliases: ["account", "sync", "cloudflare", "devices", "automatic sync", "discord link"]
    });
  }

  const registryOrder = new Map(registry.map((entry, index) => [entry.id, index]));
  const categories = [...new Set(registry.map(entry => entry.category))];
  const groupOpenState = loadFeatureIndexGroupState();
  let legacyFeatureGroupMigrationStarted = false;

  function syncFeatureGroupStateFromSettings() {
    const collapsed = new Set(normalizeFeatureIndexCollapsedCategories(loadedSettingsSnapshot.featureIndexCollapsedCategories));
    for (const groupName of categories) groupOpenState[groupName] = !collapsed.has(featureIndexGroupId(groupName));
  }

  function maybeMigrateLegacyFeatureGroupState() {
    if (!settingsAutosaveReady || legacyFeatureGroupMigrationStarted) return;
    legacyFeatureGroupMigrationStarted = true;
    migrateLegacyFeatureIndexGroupState(groupOpenState)
      .then(migrated => { if (migrated) render(); })
      .catch(() => {});
  }

  function rememberRenderedFeatureGroups({ persist = false } = {}) {
    host.querySelectorAll("details.feature-index-group[data-feature-group]").forEach(section => {
      const groupName = String(section.dataset.featureGroup || "").trim();
      if (groupName) groupOpenState[groupName] = !!section.open;
    });
    if (persist) saveFeatureIndexGroupState(groupOpenState);
  }

  category.replaceChildren(
    makeElement("option", { text: "All categories", attrs: { value: "all" } }),
    ...categories.map(name => makeElement("option", { text: name, attrs: { value: name } }))
  );

  function featureSearchText(entry) {
    const compatibility = PLATFORM_API?.featureCompatibility?.(entry, PLATFORM_API.detectEnvironment?.()) || {};
    return clean(entry.name).toLowerCase();
  }

  function renderFeature(entry) {
    const state = featureRegistryState(entry);
    const compatibility = PLATFORM_API?.featureCompatibility?.(entry, PLATFORM_API.detectEnvironment?.()) || { supported: true, fullySupported: true, partial: false, label: entry.platform || "" };
    const card = makeElement("article", { className: `feature-index-item feature-catalog-item${compatibility.fullySupported === false && !compatibility.partial ? " is-platform-unavailable" : ""}` });
    const main = makeElement("div", { className: "feature-index-main" }, [
      makeElement("div", { className: "feature-index-title", text: displayNormalizedSavedText(entry.name) }),
      makeElement("div", { className: "feature-index-description", text: entry.description || "" })
    ]);
    const badges = makeElement("div", { className: "feature-index-badges" });
    const stateLabel = state.key === "on" && compatibility.fullySupported === false && !compatibility.partial
      ? "On · inactive here"
      : state.label;
    badges.appendChild(makeElement("span", { className: `feature-index-state is-${state.key}`, text: stateLabel }));
    if (entry.maturity) badges.appendChild(makeElement("span", { className: "feature-badge feature-badge-muted", text: entry.maturity }));
    if (compatibility.label && compatibility.kind !== "all") {
      const platformBadge = makeElement("span", { className: "feature-badge feature-badge-muted is-platform", text: compatibility.label });
      if (compatibility.reason) platformBadge.title = compatibility.reason;
      badges.appendChild(platformBadge);
    } else if (entry.platform && compatibility.kind === "all") badges.appendChild(makeElement("span", { className: "feature-badge feature-badge-muted", text: entry.platform }));
    if (entry.updated) badges.appendChild(makeElement("span", { className: "feature-badge", text: `Updated ${displayReleaseVersion(entry.updated)}` }));
    else if (entry.added) badges.appendChild(makeElement("span", { className: "feature-badge", text: `Added ${displayReleaseVersion(entry.added)}` }));

    const targetId = entry.target || entry.setting || (Array.isArray(entry.settings) ? entry.settings[0] : "");
    const button = makeElement("button", {
      text: entry.planned ? "Planned" : "Open settings",
      attrs: { type: "button", ...(entry.planned ? { disabled: "" } : {}) }
    });
    if (!entry.planned) {
      button.addEventListener("click", () => {
        if (!targetId || !revealSettingsTarget(targetId, { fromFeatures: true })) showSettingsToast("That feature does not have a separate settings control yet.");
      });
    }
    card.append(main, badges, button);
    return card;
  }

  function render() {
    // Preserve the actual on-screen state before replacing filtered/sorted
    // <details> nodes, then reconcile with the backed-up settings preference.
    rememberRenderedFeatureGroups();
    syncFeatureGroupStateFromSettings();
    maybeMigrateLegacyFeatureGroupState();
    const query = clean(search.value).toLowerCase();
    const wantedCategory = category.value || "all";
    const wantedStatus = status?.value || "all";
    const wantedPlatform = platformFilter?.value || "all";
    const platformEnvironment = PLATFORM_API?.detectEnvironment?.();
    const filtered = registry.filter(entry => {
      if (wantedCategory !== "all" && entry.category !== wantedCategory) return false;
      const state = featureRegistryState(entry);
      if (wantedStatus !== "all" && state.key !== wantedStatus) return false;
      const compatibility = PLATFORM_API?.featureCompatibility?.(entry, platformEnvironment) || { fullySupported: true, partial: false, kind: "all", androidSupported: true };
      if (wantedPlatform === "here" && compatibility.fullySupported === false && !compatibility.partial) return false;
      if (wantedPlatform === "desktop-only" && compatibility.kind !== "desktop-only") return false;
      if (wantedPlatform === "android" && compatibility.androidSupported !== true) return false;
      if (wantedPlatform === "unavailable" && (compatibility.fullySupported !== false || compatibility.partial)) return false;
      if (query && !featureSearchText(entry).includes(query)) return false;
      return true;
    });

    const ordered = [...filtered].sort((left, right) => {
      const mode = sortMode?.value || "oldest";
      if (mode === "name") return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });
      const chronology = compareFeatureChronology(left, right);
      if (chronology) return mode === "newest" ? -chronology : chronology;
      return (registryOrder.get(left.id) || 0) - (registryOrder.get(right.id) || 0);
    });

    const optional = registry.filter(entry => !entry.planned && !entry.builtIn && (entry.setting || entry.settings));
    const enabled = optional.filter(entry => featureRegistryState(entry).key === "on").length;
    const planned = registry.filter(entry => entry.planned).length;
    const unavailableHere = PLATFORM_API
      ? registry.filter(entry => {
          const compatibility = PLATFORM_API.featureCompatibility?.(entry, PLATFORM_API.detectEnvironment?.()) || {};
          return compatibility.fullySupported === false && !compatibility.partial;
        }).length
      : 0;
    summary.textContent = `${filtered.length} shown · ${enabled}/${optional.length} optional features on · ${unavailableHere} unavailable here · ${planned} planned`;

    if (!filtered.length) {
      host.replaceChildren(makeElement("div", { className: "feature-index-empty", text: "No features match this filter." }));
      return;
    }

    const groups = [];
    const mode = sortMode?.value || "oldest";
    const groupedCategories = [...categories];
    if (mode === "newest" || mode === "oldest") {
      const firstPosition = new Map();
      ordered.forEach((entry, index) => {
        if (!firstPosition.has(entry.category)) firstPosition.set(entry.category, index);
      });
      groupedCategories.sort((left, right) => (firstPosition.get(left) ?? Number.MAX_SAFE_INTEGER) - (firstPosition.get(right) ?? Number.MAX_SAFE_INTEGER));
    } else if (mode === "name") {
      groupedCategories.sort((left, right) => String(left).localeCompare(String(right), undefined, { sensitivity: "base" }));
    }
    for (const groupName of groupedCategories) {
      const groupEntries = ordered.filter(entry => entry.category === groupName);
      if (!groupEntries.length) continue;
      const rememberedOpen = groupOpenState[groupName];
      const section = makeElement("details", {
        className: "feature-index-group",
        attrs: {
          ...(rememberedOpen === false ? {} : { open: "" }),
          "data-feature-group": groupName
        }
      });
      const groupDescriptions = {
        "Setup & Compatibility": "Setup, compatibility, update and diagnostic helpers.",
        "Saved Lists & Bot Discovery": "Local lists, organization, archives and rediscovery tools.",
        "Card & Listing Tools": "Filters and helpers used while browsing bot listings.",
        "Chat Tools": "Tools used in open chats and the chat list.",
        "Creator Tools": "Chatbot and Lorebook creation, review and workflow helpers.",
        "Interface Cleanup": "Appearance, layout, navigation and browser-tab cleanup.",
        "Data & Backup": "Backup, storage, cleanup and configuration health tools.",
        "Mobile / Android": "Compact controls shared with supported mobile/WebView environments.",
        "Advanced": "Performance and specialized per-character behavior.",
        "Planned": "Ideas still on the roadmap and not enabled in this build."
      };
      const summaryRow = makeElement("summary", { className: "feature-index-group-head" }, [
        makeElement("span", { className: "feature-index-group-title", text: groupName }),
        makeElement("span", { className: "hint", text: `${groupEntries.length} feature${groupEntries.length === 1 ? "" : "s"}` })
      ]);
      section.appendChild(summaryRow);
      // Save on click as well as toggle. <details> toggle is queued by the
      // browser, so relying on it alone can lose the last click if the Options
      // page is closed immediately afterwards.
      summaryRow.addEventListener("click", () => {
        groupOpenState[groupName] = !section.open;
        saveFeatureIndexGroupState(groupOpenState);
      });
      section.addEventListener("toggle", () => {
        groupOpenState[groupName] = !!section.open;
        saveFeatureIndexGroupState(groupOpenState);
      });
      const description = groupDescriptions[groupName];
      if (description) section.appendChild(makeElement("p", { className: "feature-index-group-description hint", text: description }));
      const list = makeElement("div", { className: "feature-index-group-list" });
      groupEntries.forEach(entry => list.appendChild(renderFeature(entry)));
      section.appendChild(list);
      groups.push(section);
    }
    host.replaceChildren(...groups);
  }

  const renderFeatureIndexDebounced = debounceCallback(() => { OPTIONS_PERFORMANCE.featureRenders += 1; render(); }, 120);
  search.addEventListener("input", renderFeatureIndexDebounced);
  category.addEventListener("change", render);
  status?.addEventListener("change", render);
  platformFilter?.addEventListener("change", render);
  sortMode?.addEventListener("change", render);
  document.addEventListener("change", event => {
    if (event.target?.matches?.("input[type='checkbox'], input[type='radio'], select")) render();
  });

  window.addEventListener("pagehide", () => rememberRenderedFeatureGroups({ persist: true }), { once: true });

  DS_FEATURE_INDEX_REFRESH = render;
  render();
}

async function refreshPersonalUsageSummary() {
  const out = $("personalUsageSummary");
  if (!out) return;
  if (!checked("enablePersonalUsageSummary")) { out.textContent = "Turn the option on, then refresh."; return; }
  out.textContent = "Loading local summary…";
  try {
    const keys = ["openedChats","favoriteBots","laterBots","blockedBots","notInterestedBots","botOrganization","botArchive","lorebookBackups","personas"];
    const data = await storageGet(keys);
    const countIds = value => Array.isArray(value?.ids) ? value.ids.length : (value && typeof value === "object" ? Object.keys(value.meta || value).length : 0);
    const lines = [
      "Local QoL usage summary",
      `Opened/known bots: ${countIds(data.openedChats)}`,
      `Favorite history: ${countIds(data.favoriteBots)}`,
      `Later: ${countIds(data.laterBots)}`,
      `Blocked: ${countIds(data.blockedBots)}`,
      `Not Interested: ${countIds(data.notInterestedBots)}`,
      `Bots with local organization: ${countIds(data.botOrganization)}`,
      `Saved bot copies: ${countIds(data.botArchive)}`,
      `Lorebook backups: ${countIds(data.lorebookBackups)}`,
      `Personas saved: ${countIds(data.personas)}`,
      "",
      "This view uses existing local QoL records only; it does not read chat text or start new activity tracking."
    ];
    out.textContent = lines.join("\n");
  } catch (error) { out.textContent = `Could not build summary: ${String(error?.message || error)}`; }
}

function dependencyParentFor(childId) {
  return SETTING_DEPENDENCY_GROUPS.find(group => group.children.includes(childId)) || null;
}

function updateSettingDependencies() {
  for (const group of SETTING_DEPENDENCY_GROUPS) {
    const parent = $(group.parent);
    if (!parent) continue;
    const active = parent.type === "checkbox" ? !!parent.checked : !!String(parent.value || "").trim();
    for (const childId of group.children) {
      const child = $(childId);
      if (!child) continue;
      const label = child.closest("label");
      if (!label) continue;
      label.classList.toggle("setting-dependent-inactive", !active);
      let note = label.querySelector(":scope > .setting-dependency-note");
      if (!note) {
        note = makeElement("small", { className: "setting-dependency-note" });
        label.appendChild(note);
      }
      note.replaceChildren();
      note.hidden = active;
      if (!active) {
        note.appendChild(document.createTextNode(`Takes effect when ${group.name} is enabled. `));
        const enable = makeElement("button", { className: "setting-dependency-action", text: "Enable parent", attrs: { type: "button" } });
        enable.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          if (parent.type === "checkbox") parent.checked = true;
          parent.dispatchEvent(new Event("change", { bubbles: true }));
          updateSettingDependencies();
          DS_FEATURE_INDEX_REFRESH?.();
          showSettingsToast(`${group.name} enabled on this page. The change saves automatically.`);
        });
        const open = makeElement("button", { className: "setting-dependency-action", text: "Open parent", attrs: { type: "button" } });
        open.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          revealSettingsTarget(group.parent);
        });
        note.append(enable, open);
      }
    }
  }
}

function setupSettingDependencies() {
  const parents = new Set(SETTING_DEPENDENCY_GROUPS.map(group => group.parent));
  for (const id of parents) $(id)?.addEventListener("change", updateSettingDependencies);
  updateSettingDependencies();
}

function healthResultItem(kind, title, detail, targetId = "", action = null) {
  const item = makeElement("div", { className: `settings-health-item is-${kind}` });
  const body = makeElement("div", { className: "settings-health-item-body" }, [
    makeElement("strong", { text: title }),
    makeElement("span", { className: "hint", text: detail })
  ]);
  item.appendChild(body);
  const actions = makeElement("div", { className: "settings-health-actions" });
  if (targetId && $(targetId)) {
    const button = makeElement("button", { text: "Open setting", attrs: { type: "button" } });
    button.addEventListener("click", () => revealSettingsTarget(targetId));
    actions.appendChild(button);
  }
  if (action?.label && typeof action.run === "function") {
    const button = makeElement("button", { text: action.label, attrs: { type: "button" } });
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await action.run(); } finally { button.disabled = false; }
    });
    actions.appendChild(button);
  }
  if (actions.childNodes.length) item.appendChild(actions);
  return item;
}

async function runSettingsHealthCheck() {
  const host = $("settingsHealthResults");
  if (!host) return;
  host.replaceChildren(makeElement("span", { className: "hint", text: "Checking configuration..." }));

  const result = await storageGet(["settings", DEEPL_API_KEY, PERSONAS_KEY, LEGACY_PERSONAS_KEY, CHAT_BACKGROUNDS_KEY, QUICK_DISLIKE_BULK_STATE_KEY, QUICK_LESS_LIKE_BULK_STATE_KEY, BLOCKED_BOTS_KEY, NOT_INTERESTED_KEY, OPENED_KEY]);
  const savedSettings = result.settings && typeof result.settings === "object" ? result.settings : {};
  const current = { ...DEFAULT_SETTINGS, ...savedSettings, ...readSettingsFromPage() };
  const warnings = [];
  const notices = [];

  const missingControls = Object.keys(DEFAULT_SETTINGS).filter(key => !SETTINGS_NO_DIRECT_CONTROL_KEYS.has(key) && !document.getElementById(key));
  const requiredMissing = [...SETTINGS_RUNTIME_REQUIRED_KEYS].filter(key => !(key in DEFAULT_SETTINGS) || !document.getElementById(key));
  const missing = uniqueClean([...missingControls, ...requiredMissing]);
  if (missing.length) {
    warnings.push({
      title: `${missing.length} registered setting${missing.length === 1 ? " is" : "s are"} missing a Settings control`,
      detail: `Developer self-check: ${missing.slice(0, 18).join(", ")}${missing.length > 18 ? ` +${missing.length - 18} more` : ""}. This usually means a feature was wired in code but its Settings UI was not shipped.`
    });
  }
  if (current.enableTranslation && (current.translationProvider || "deepl") === "deepl" && !String(result[DEEPL_API_KEY] || "").trim()) {
    warnings.push({ title: "DeepL translation is enabled without an API key", detail: "Translation cannot run until a DeepL API key is saved and tested.", target: "deeplApiKey" });
  }


  document.querySelectorAll('input[type="number"][id]').forEach(input => {
    const n = Number(input.value);
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    if (Number.isFinite(n) && ((Number.isFinite(min) && n < min) || (Number.isFinite(max) && n > max))) {
      const fixed = Math.min(Number.isFinite(max) ? max : n, Math.max(Number.isFinite(min) ? min : n, n));
      const fix = async () => {
        input.value = String(fixed);
        await save();
        await runSettingsHealthCheck();
      };
      warnings.push({ title: `${input.id} is outside its supported range`, detail: `Current value: ${input.value}. Supported range: ${input.min || "no minimum"} to ${input.max || "no maximum"}.`, target: input.id, action: { label: `Use ${fixed}`, run: fix } });
    }
  });

  const rawBackgroundStore = result[CHAT_BACKGROUNDS_KEY] && typeof result[CHAT_BACKGROUNDS_KEY] === "object" ? result[CHAT_BACKGROUNDS_KEY] : {};
  const backgroundStore = normalizeChatBackgroundMediaStore(rawBackgroundStore);
  const rawBackgroundCount = (rawBackgroundStore.global ? 1 : 0) + Object.keys(rawBackgroundStore.chats || {}).length;
  const normalizedBackgroundCount = (backgroundStore.global ? 1 : 0) + Object.keys(backgroundStore.chats || {}).length;
  if (rawBackgroundCount > normalizedBackgroundCount) {
    notices.push({
      title: `${rawBackgroundCount - normalizedBackgroundCount} invalid chat-background record${rawBackgroundCount - normalizedBackgroundCount === 1 ? "" : "s"} found`,
      detail: "QoL can remove malformed/missing image records without changing valid backgrounds.",
      target: "chatBackgroundsCard",
      action: { label: "Clean background records", run: async () => { await saveChatBackgroundMediaStore(backgroundStore); await runSettingsHealthCheck(); } }
    });
  }
  if (current.enableChatBackgrounds && !backgroundStore.global && !Object.keys(backgroundStore.chats || {}).length) {
    notices.push({ title: "Custom chat backgrounds are enabled without an image", detail: "Choose a global image in Appearance & Interface or set a per-chat override from the BG button in a chat.", target: "chatBackgroundsCard" });
  }

  const bulkState = normalizeQuickDislikeBulkState(result[QUICK_DISLIKE_BULK_STATE_KEY]);
  const rawBlocked = result[BLOCKED_BOTS_KEY] && typeof result[BLOCKED_BOTS_KEY] === "object" ? result[BLOCKED_BOTS_KEY] : {};
  const normalizedBlockedForBulk = normalizeBotStore(rawBlocked);
  const blockedIdSetForBulk = new Set(normalizedBlockedForBulk.ids);
  const unfinishedBulkIds = uniqueClean([bulkState.currentId, ...(bulkState.pendingIds || [])]).filter(id => blockedIdSetForBulk.has(id));
  const failedBulkIds = uniqueClean(bulkState.failedIds || []).filter(id => blockedIdSetForBulk.has(id));
  const staleRunning = bulkState.status === "running" && bulkState.updatedAt && Date.now() - bulkState.updatedAt > 15000;
  if ((staleRunning || bulkState.status === "paused") && unfinishedBulkIds.length) {
    notices.push({
      title: "Blocked Bot Bulk Dislike has an unfinished run",
      detail: `${unfinishedBulkIds.length} bot${unfinishedBulkIds.length === 1 ? "" : "s"} are still queued. Open Blocked Bots to resume or start a fresh remaining-bots pass.`,
      target: "bulkDislikeBlockedBots"
    });
  }
  if (failedBulkIds.length) {
    notices.push({
      title: `${failedBulkIds.length} blocked-bot dislike${failedBulkIds.length === 1 ? "" : "s"} failed on the last run`,
      detail: "Failures are not marked handled. The Blocked Bots manager can retry only those failures without reprocessing successful bots.",
      target: "retryFailedBlockedDislikes"
    });
  }

  const lessLikeBulkState = normalizeQuickLessLikeBulkState(result[QUICK_LESS_LIKE_BULK_STATE_KEY]);
  const unfinishedLessLikeIds = uniqueClean([lessLikeBulkState.currentId, ...(lessLikeBulkState.pendingIds || [])]).filter(id => blockedIdSetForBulk.has(id));
  const failedLessLikeIds = uniqueClean(lessLikeBulkState.failedIds || []).filter(id => blockedIdSetForBulk.has(id));
  const staleLessLikeRunning = lessLikeBulkState.status === "running" && lessLikeBulkState.updatedAt && Date.now() - lessLikeBulkState.updatedAt > 15000;
  if ((staleLessLikeRunning || lessLikeBulkState.status === "paused") && unfinishedLessLikeIds.length) {
    notices.push({
      title: "Blocked Bot Stop recommending has an unfinished run",
      detail: `${unfinishedLessLikeIds.length} bot${unfinishedLessLikeIds.length === 1 ? "" : "s"} are still queued. Open Blocked Bots to resume or start a fresh remaining-bots pass.`,
      target: "bulkLessLikeBlockedBots"
    });
  }
  if (failedLessLikeIds.length) {
    notices.push({
      title: `${failedLessLikeIds.length} Stop recommending action${failedLessLikeIds.length === 1 ? "" : "s"} failed on the last run`,
      detail: "Failures stay eligible. The Blocked Bots manager can retry only those failures without repeating successful Less Like feedback.",
      target: "retryFailedBlockedLessLikes"
    });
  }

  const rawBlockedIds = Array.isArray(rawBlocked.ids) ? rawBlocked.ids : [];
  const normalizedBlocked = normalizedBlockedForBulk;
  const rawNotInterested = result[NOT_INTERESTED_KEY] && typeof result[NOT_INTERESTED_KEY] === "object" ? result[NOT_INTERESTED_KEY] : {};
  const normalizedNotInterested = normalizeBotStore(rawNotInterested);
  const openedRaw = Array.isArray(result[OPENED_KEY]) ? result[OPENED_KEY] : [];
  const listNeedsCleanup = rawBlockedIds.length !== normalizedBlocked.ids.length
    || (Array.isArray(rawNotInterested.ids) && rawNotInterested.ids.length !== normalizedNotInterested.ids.length)
    || openedRaw.length !== uniqueClean(openedRaw).length;
  if (listNeedsCleanup) {
    notices.push({ title: "Some saved bot lists contain duplicate or malformed entries", detail: "The existing Local data cleanup tool can normalize supported saved-list records without touching chat content.", target: "cleanLocalData" });
  }

  const personas = Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : (Array.isArray(result[LEGACY_PERSONAS_KEY]) ? result[LEGACY_PERSONAS_KEY] : []);
  if (current.savePersonasFromPages && personas.length) {
    const withText = personas.filter(p => String(p?.description || p?.highlights || "").trim()).length;
    const withAvatarData = personas.filter(p => String(p?.avatarDataUrl || "").startsWith("data:image/")).length;
    if (withText < personas.length || withAvatarData < personas.length) {
      notices.push({
        title: "Some saved Persona copies are incomplete",
        detail: `${withText}/${personas.length} include saved Persona text and ${withAvatarData}/${personas.length} include a local avatar copy. Open those Persona edit pages again if you want the local copies refreshed.`,
        target: "savePersonasFromPages"
      });
    }
  }

  const bytes = await storageBytesInUse(null);
  if (Number.isFinite(bytes) && bytes > 50 * 1024 * 1024) {
    notices.push({ title: `QoL storage is ${(bytes / 1024 / 1024).toFixed(1)} MB`, detail: "Large local archives, Persona images or other saved data can make backups/Settings heavier. Review Local storage if you want to clean anything up.", target: "storageCard" });
  }

  const good = warnings.length === 0;
  const summary = healthResultItem(good ? "good" : "warning", good ? "No problems found" : `${warnings.length} setting problem${warnings.length === 1 ? "" : "s"} found`, good ? (notices.length ? "No enabled feature appears to be misconfigured. A few useful follow-ups are shown below." : "Nothing here currently needs attention.") : "Review the items below. QoL will not change anything unless you use one of the shown actions.");
  const nodes = [summary];
  warnings.forEach(item => nodes.push(healthResultItem("warning", item.title, item.detail, item.target, item.action)));
  notices.forEach(item => nodes.push(healthResultItem("notice", item.title, item.detail, item.target, item.action)));
  host.replaceChildren(...nodes);
}

function setControlValue(id, next) {
  const el = $(id);
  if (!el) return;
  if (el.type === "checkbox") el.checked = !!next;
  else el.value = String(next);
  if (settingsAutosaveReady) queueSettingsAutosaveForControl(el, "change");
}

function resetBubbleField(id) {
  if (!(id in CHAT_BUBBLE_DEFAULTS)) return;
  setControlValue(id, CHAT_BUBBLE_DEFAULTS[id]);
  updateAppearanceColorControlStates();
  showSettingsToast(`Reset ${id.replace(/^chatBubble/, "bubble ")} to default. Changes save automatically.`);
}

function setupBubbleResetControls() {
  document.querySelectorAll("[data-chat-bubble-reset-group]").forEach(button => {
    button.addEventListener("click", () => {
      const group = button.dataset.chatBubbleResetGroup;
      CHAT_BUBBLE_FIELD_IDS.filter(id => group === "ai" ? id.startsWith("chatBubbleAi") : id.startsWith("chatBubbleUser"))
        .forEach(id => setControlValue(id, CHAT_BUBBLE_DEFAULTS[id]));
      updateAppearanceColorControlStates();
      showSettingsToast(`Reset ${group === "ai" ? "AI" : "User"} bubble settings. Changes save automatically.`);
    });
  });

  CHAT_BUBBLE_FIELD_IDS.forEach(id => {
    const el = $(id);
    if (!el || el.dataset.dsResetReady === "1") return;
    el.dataset.dsResetReady = "1";
    const button = makeElement("button", { text: "↺", attrs: { type: "button", title: "Reset this setting to default", "aria-label": "Reset this setting to default" } });
    button.className = "setting-inline-reset";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetBubbleField(id);
    });
    el.insertAdjacentElement("afterend", button);
  });
}

function updateMessageQuickActionControlStates() {
  const confirmRemove = $("messageQuickActionConfirmRemoveImage");
  if (confirmRemove) confirmRemove.disabled = !checked("messageQuickActionRemoveImage");

  const group = $("showMessageQuickActions");
  if (group) {
    const states = ["messageQuickActionCopy", "messageQuickActionEdit", "messageQuickActionReport"].map(id => checked(id));
    group.checked = states.every(Boolean);
    group.indeterminate = states.some(Boolean) && !states.every(Boolean);
    group.title = group.indeterminate
      ? "Some of Copy, Edit and Report are enabled"
      : (group.checked ? "Copy, Edit and Report are all enabled" : "Copy, Edit and Report are all disabled");
  }
}

function setupMessageQuickActionGroupToggle() {
  const group = $("showMessageQuickActions");
  if (!group) return;

  group.addEventListener("change", () => {
    const next = !!group.checked;
    ["messageQuickActionCopy", "messageQuickActionEdit", "messageQuickActionReport"].forEach(id => setControlValue(id, next));
    group.indeterminate = false;
    updateMessageQuickActionControlStates();
  });

  ["messageQuickActionCopy", "messageQuickActionEdit", "messageQuickActionReport"].forEach(id => {
    $(id)?.addEventListener("change", updateMessageQuickActionControlStates);
  });

  updateMessageQuickActionControlStates();
}

function updateAppearanceColorControlStates() {
  ["Ai", "User"].forEach(kind => {
    const normal = $(`chatBubble${kind}Text`);
    const action = $(`chatBubble${kind}ActionText`);
    const dialogue = $(`chatBubble${kind}DialogueText`);
    const decoration = $(`chatBubble${kind}DecorationColor`);
    const ears = $(`chatBubble${kind}CatEarLayout`);
    if (normal) normal.disabled = value(`chatBubble${kind}TextMode`, "custom") !== "custom";
    if (action) action.disabled = value(`chatBubble${kind}ActionMode`, "native") !== "custom";
    if (dialogue) dialogue.disabled = value(`chatBubble${kind}DialogueMode`, "base") !== "custom";
    if (decoration) decoration.disabled = value(`chatBubble${kind}DecorationMode`, "bubble") !== "custom";
    if (ears) ears.disabled = value(`chatBubble${kind}Shape`, "native") !== "cat";
  });

  const altCustom = checked("alternateDialogueCustomColors");
  ["alternateDialogueTextColor", "alternateDialogueBackgroundColor", "alternateDialogueBorderColor"].forEach(id => {
    const el = $(id);
    if (el) el.disabled = !altCustom;
  });
  updateBubbleContrastWarnings();
}

async function saveLibreInstance({ testing = false } = {}) {
  const status = $("libreTranslateStatus");
  const raw = value("libreTranslateUrl", "").trim();
  let origin = "";
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Use HTTPS (or HTTP on localhost) without credentials or query parameters.");
    origin = url.origin;
  } catch (error) {
    if (status) status.textContent = `Invalid instance URL: ${error.message || "enter a server URL"}`;
    return;
  }
  let granted = false;
  try { granted = !!(await chrome.permissions.request({ origins: [origin + "/*"] })); } catch {}
  if (!granted) { if (status) status.textContent = "Instance host permission not granted. No messages sent."; return; }
  await storageSet({ [LIBRE_TRANSLATE_KEY]: value("libreTranslateApiKey", "").trim() });
  // The site URL is a normal non-secret setting; use the settings Save pathway.
  await save();
  if (status) status.textContent = "Instance and key saved locally. Chat text is sent only when LibreTranslate is selected (or Test is clicked).";
  if (testing) {
    if (status) status.textContent = "Testing instance...";
    const response = await runtimeMessage({ type: "DS_QOL_TRANSLATE", provider: "libre", text: "Hello", targetLang: "DE", settings: { libreTranslateUrl: raw } });
    if (status) status.textContent = response?.ok ? `Instance connected: ${response.text}` : `Instance test failed: ${response?.error || "unknown error"}`;
  }
}

async function optimizeStoredData() {
  if (optimizeStoredDataRunning) return;
  optimizeStoredDataRunning = true;
  optimizeStoredDataStopRequested = false;
  const run = $("optimizeStoredData");
  const stop = $("stopOptimizeStoredData");
  const status = $("optimizeStoredDataStatus");
  if (run) run.disabled = true;
  if (stop) stop.disabled = false;
  let scanned = 0, converted = 0, already = 0, skipped = 0;
  try {
    for (const key of [BOT_AVAILABILITY_KEY, BOT_ARCHIVE_KEY, LOREBOOK_STATUS_KEY]) {
      let afterId = "";
      while (!optimizeStoredDataStopRequested) {
        if (status) status.textContent = `Optimizing ${key}… ${scanned.toLocaleString()} checked, ${converted.toLocaleString()} compressed. No records are deleted.`;
        const response = await runtimeMessageWithTimeout({ type: "DS_LARGE_STORAGE_OPTIMIZE_PAGE", key, afterId, limit: 30 }, 60000);
        if (!response?.ok) throw new Error(response?.error || `Could not optimize ${key}.`);
        scanned += Number(response.scanned || 0);
        converted += Number(response.converted || 0);
        already += Number(response.alreadyCompressed || 0);
        skipped += Number(response.tooSmall || 0) + Number(response.concurrentChanges || 0);
        if (response.done) break;
        const next = String(response.nextAfterId || "");
        if (!next || next === afterId) throw new Error("Storage scan did not advance.");
        afterId = next;
        // Yield between batches so Settings remains responsive and Stop works.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (optimizeStoredDataStopRequested) break;
    }
    if (status) status.textContent = `${optimizeStoredDataStopRequested ? "Stopped" : "Finished"}: ${scanned.toLocaleString()} records checked, ${converted.toLocaleString()} compressed, ${already.toLocaleString()} already compressed, ${skipped.toLocaleString()} skipped (small or changed). All records preserved.`;
    refreshStorageUsage().catch(() => {});
  } catch (error) {
    if (status) status.textContent = `Stopped after ${scanned.toLocaleString()} checked: ${error?.message || error}. Existing data remains readable and unchanged where not optimized.`;
  } finally {
    optimizeStoredDataRunning = false;
    if (run) run.disabled = false;
    if (stop) stop.disabled = true;
  }
}

function applyOptionsLayoutPreferences(settings = null) {
  const source = settings || {
    settingsNavigationStyle: value("settingsNavigationStyle", "classic"),
    settingsContentLayout: value("settingsContentLayout", "single"),
    settingsPageWidth: value("settingsPageWidth", "comfortable")
  };
  const nav = ["classic", "grouped"].includes(source.settingsNavigationStyle) ? source.settingsNavigationStyle : "classic";
  const layout = ["single", "adaptive"].includes(source.settingsContentLayout) ? source.settingsContentLayout : "single";
  const width = ["comfortable", "wide"].includes(source.settingsPageWidth) ? source.settingsPageWidth : "comfortable";
  document.body.classList.toggle("ds-options-nav-grouped", nav === "grouped");
  document.body.classList.toggle("ds-options-layout-adaptive", layout === "adaptive");
  document.body.classList.toggle("ds-options-width-wide", width === "wide");
}

function reorderOptionsUi() {
  const tabOrder = [
    "general", "control", "blocking", "chat-ui", "saved", "chat-list", "writing",
    "personas-memory", "bot-tools", "appearance", "browser", "data", "account",
    "features", "advanced", "android", "changelog", "help"
  ];
  const tabs = document.querySelector("nav.tabs");
  if (tabs && !tabs.querySelector(".tab-group")) {
    tabOrder.forEach(name => {
      const button = tabs.querySelector(`.tab-button[data-tab="${name}"]`);
      if (button) tabs.appendChild(button);
    });
  }

  const cardOrders = {
    general: ["Extension", "Quick setup", "Settings layout", "SpicyChat beta / experimental access", "S.AI Toolkit compatibility", "Android app settings", "SpicyChat NSFW switch"],
    control: ["Command Palette", "Data health & storage", "Creator Workspace", "Performance & support"],
    blocking: ["Card filters", "Bot Blocking & Dislikes", "Blocked bots manager", "Tag defaults", "Smart filter presets", "Recommendation helpers", "Language filter", "Text normalization", "Card / discovery workflow", "Listing refill", "Not interested", "Favorite protection", "Local tag aliases / emoji", "Random Chat"],
    saved: ["Saved Bots Hub", "Bot Organizer", "Favorite bots", "Favorite creators", "Followed creators", "Later bots", "Bot Status Center", "Lorebook Status & History"],
    writing: ["Composer and draft helpers", "OOC presets", "Reply Instructions", "Saved Text / Snippets", "Model quick menu", "Generation profiles", "Timestamps and generation details", "Translation (DeepL)"],
    "personas-memory": ["Persona helpers", "Memory manager", "Context Keeper", "Global Memory / Baseline Notes", "Internal Day Tracker", "RP State Tracker", "Chat Nudges"],
    "chat-ui": ["Chat top bar", "Character shortcuts", "Message options", "Search inside current chat", "Message bookmarks / multiple local pins", "Scroll navigation", "Chat export", "Native rating helpers", "Chat text replacements", "Focus / Immersive Mode"],
    "bot-tools": ["Creation helpers", "Bot editor snippets", "My Creations filters", "My Creations backup & shortcuts", "Creator Writing Assistant", "Creation audit", "Bot & Lorebook backups", "Backup manager", "Bot / profile export", "Bot tags in chats"],
    appearance: ["Accessibility & text size", "Mini panel", "Panel size", "Panel items", "Layout preview", "Top bar cleanup", "Avatar name", "Sidebar cleanup", "Premium & promo cleanup", "Chat bubble customization", "Custom chat backgrounds", "RP Format Repair", "Alternate dialogue styling", "Soundscapes / Ambience", "Animated bot images"],
    browser: ["Extension popup", "Notifications", "Inactive tab cleanup (Auto-AFK)", "Duplicate SpicyChat tab guard", "Tab cleanup & session analysis"],
    data: ["Backup and restore", "Local storage & recovery", "Recently changed / Undo", "Personal usage & context", "What's New notification", "Settings check", "Debug"]
  };

  for (const [pageName, headings] of Object.entries(cardOrders)) {
    const page = document.querySelector(`.tab-page[data-page="${pageName}"]`);
    if (!page) continue;
    const cards = [...page.querySelectorAll(":scope > section.card")];
    const byHeading = new Map(cards.map(card => [String(card.querySelector("h2")?.textContent || "").trim(), card]));
    headings.forEach(heading => {
      const card = byHeading.get(heading);
      if (card) page.appendChild(card);
    });
  }
}

function scheduleSavedManagersRefresh(kinds = []) {
  for (const kind of kinds) pendingSavedManagerRefreshKinds.add(kind);
  if (!pendingSavedManagerRefreshKinds.size) return;
  clearTimeout(savedManagerRefreshTimer);
  savedManagerRefreshTimer = setTimeout(() => {
    savedManagerRefreshTimer = 0;
    const queued = [...pendingSavedManagerRefreshKinds];
    pendingSavedManagerRefreshKinds.clear();
    OPTIONS_PERFORMANCE.savedManagerRefreshBatches += 1;
    OPTIONS_PERFORMANCE.savedManagerRefreshKinds += queued.length;
    refreshSavedManagersFromStorageChange(queued);
  }, document.hidden ? 280 : 90);
}

function scheduleBlockedManagerRefresh() {
  clearTimeout(blockedManagerRefreshTimer);
  blockedManagerRefreshTimer = setTimeout(() => {
    blockedManagerRefreshTimer = 0;
    if (!blockingDataLoaded || blockedBulkDislikeRunning) return;
    OPTIONS_PERFORMANCE.blockedManagerRefreshBatches += 1;
    // Do not build the heavy blocked manager while another Settings tab is open.
    // Its state is already current in memory and the manager will render lazily
    // when Discovery & Filters is visited.
    if (activeOptionsTab() !== "blocking") {
      invalidateHeavyTab("blocking");
      return;
    }
    renderBotManager("blocked");
    updateBlockedDislikeStatus();
  }, document.hidden ? 300 : 100);
}

function refreshSavedManagersFromStorageChange(kinds = []) {
  if (!savedListsDataLoaded) return;

  invalidateDuplicateCache();
  renderedHeavyTabs.delete("saved");
  if ($("openedCount")) $("openedCount").textContent = `${currentOpened.length} stored`;

  // If the user is looking at another settings page, just invalidate the lazy
  // Saved-tab render. It will rebuild from the fresh in-memory stores on entry.
  if (activeOptionsTab() !== "saved") return;

  const changed = new Set(kinds);
  if (changed.has("hub")) renderSavedBotsHub();
  if (changed.has("opened")) renderBotManager("opened");
  if (changed.has("favorite")) renderBotManager("favorite");
  if (changed.has("later")) renderBotManager("later");
  if (changed.has("favoriteCreators")) renderFavoriteCreators();
  if (changed.has("followedCreators")) { renderFollowedCreators(); renderCreatorBotWatchStatus(); }
  if (changed.has("creatorWatch")) renderCreatorBotWatchStatus();
  if (changed.has("availability")) renderBotAvailability();

  // The tab is already fully mounted; mark it current again after the targeted
  // refresh so a later click does not unnecessarily rebuild every manager.
  renderedHeavyTabs.add("saved");
}
