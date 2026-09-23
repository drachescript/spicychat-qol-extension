(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const STORAGE_KEY = "dsSmartFilterPresets";
  const PINNED_KEY = "dsSmartFilterPinnedPresets";
  const HIDDEN_CLASS = "ds-smart-filter-hidden";

  const BUILTIN_PRESETS = [
    {
      id: "builtin:fresh-finds",
      name: "Fresh finds",
      filters: { opened: "unopened" }
    },
    {
      id: "builtin:already-opened",
      name: "Already opened",
      filters: { opened: "opened" }
    },
    {
      id: "builtin:followed-fresh",
      name: "Followed + fresh",
      filters: { opened: "unopened", followed: "followed" }
    },
    {
      id: "builtin:favorites",
      name: "Favorites only",
      filters: { favorites: "favorites" }
    },
    {
      id: "builtin:later",
      name: "Later queue",
      filters: { later: "later" }
    },
    {
      id: "builtin:favorite-lorebooks",
      name: "Favorite lorebooks",
      filters: { lorebook: "has", favorites: "favorites" }
    },
    {
      id: "builtin:unfollowed-fresh",
      name: "Unfollowed fresh",
      filters: { opened: "unopened", followed: "not-followed" }
    },
    {
      id: "builtin:unsaved-fresh",
      name: "Unsaved fresh",
      filters: { opened: "unopened", favorites: "not-favorites", later: "not-later" }
    },
    {
      id: "builtin:lorebooks-only",
      name: "Lorebooks only",
      filters: { lorebook: "has" }
    },
    {
      id: "builtin:unopened-lorebooks",
      name: "Unopened lorebooks",
      filters: { opened: "unopened", lorebook: "has" }
    },
    {
      id: "builtin:followed-creators",
      name: "Followed creators",
      filters: { followed: "followed" }
    },
    {
      id: "builtin:favorite-unopened",
      name: "Favorite + unopened",
      filters: { favorites: "favorites", opened: "unopened" }
    }
  ];

  let presetsLoaded = false;
  let presets = [];
  let pinnedIds = [];

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function defaultFilters() {
    return {
      lorebook: "any",
      opened: "any",
      followed: "any",
      favorites: "any",
      later: "any"
    };
  }

  function normalizeFilters(value) {
    const source = value && typeof value === "object" ? value : {};

    const opened = ["any", "opened", "unopened"].includes(source.opened)
      ? source.opened
      : (source.unopened === true ? "unopened" : "any");

    const followed = ["any", "followed", "not-followed"].includes(source.followed)
      ? source.followed
      : (source.followed === true ? "followed" : "any");

    const favorites = ["any", "favorites", "not-favorites"].includes(source.favorites)
      ? source.favorites
      : (source.favorites === true ? "favorites" : "any");

    const later = ["any", "later", "not-later"].includes(source.later)
      ? source.later
      : (source.later === true ? "later" : "any");

    return {
      lorebook: ["any", "has", "none"].includes(source.lorebook) ? source.lorebook : "any",
      opened,
      followed,
      favorites,
      later
    };
  }

  function normalizePresets(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map((item, index) => {
      const name = clean(item?.name);
      if (!name) return null;
      let id = clean(item?.id) || `preset-${Date.now()}-${index}`;
      if (id.startsWith("builtin:")) id = `preset-${id.slice(8) || index}`;
      if (seen.has(id)) id = `${id}-${index}`;
      seen.add(id);
      return { id, name, filters: normalizeFilters(item?.filters) };
    }).filter(Boolean);
  }

  function builtins() {
    return BUILTIN_PRESETS.map(item => ({
      ...item,
      filters: normalizeFilters(item.filters)
    }));
  }

  function allPresets() {
    return [...builtins(), ...presets];
  }

  function normalizePinned(value) {
    const source = Array.isArray(value) ? value : [];
    const valid = new Set(allPresets().map(item => item.id));
    return [...new Set(source.map(clean).filter(id => valid.has(id)))].slice(0, 3);
  }

  function findPreset(id) {
    const key = clean(id);
    if (!key) return null;
    return allPresets().find(item => item.id === key) || null;
  }

  function isBuiltin(id) {
    return String(id || "").startsWith("builtin:");
  }

  async function ensurePresetsLoaded() {
    if (presetsLoaded) return;
    presetsLoaded = true;
    try {
      const result = await DS.storageGet?.([STORAGE_KEY, PINNED_KEY]);
      presets = normalizePresets(result?.[STORAGE_KEY]);
      pinnedIds = normalizePinned(result?.[PINNED_KEY]);
    } catch {
      presets = [];
      pinnedIds = [];
    }
  }

  async function savePresets() {
    try { await DS.storageSet?.({ [STORAGE_KEY]: presets }); } catch {}
  }

  async function savePinned() {
    pinnedIds = normalizePinned(pinnedIds);
    try { await DS.storageSet?.({ [PINNED_KEY]: pinnedIds }); } catch {}
  }

  function isListingPage() {
    const page = DS.getPageState?.() || {};
    if (page.isSingleChatPage || page.isChatListPage || page.isBotProfilePage || page.isBotEditor || page.isLorebookEditor || page.isPersonaPage) return false;
    if (["listing", "creator-listing"].includes(page.routeType)) return true;
    return !!document.querySelector("a[href*='/chat/'], a[href*='/chatbot/']");
  }

  function cardEntries() {
    const seen = new Set();
    return (DS.collectCards?.() || []).map(item => {
      const card = item?.card;
      const anchor = item?.anchor;
      if (!card || !anchor || seen.has(card)) return null;
      seen.add(card);
      return { card, anchor, target: DS.getBestHideTarget?.(card) || card };
    }).filter(Boolean);
  }

  function creatorHandle(card) {
    const anchor = card?.querySelector?.("a[href*='/creator/']");
    const href = String(anchor?.getAttribute?.("href") || anchor?.href || "");
    try {
      const match = new URL(href, location.origin).pathname.match(/^\/creator\/([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    } catch {
      return "";
    }
  }

  function normalizeIdentity(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize?.("NFKC")
      ?.replace(/\s+/g, " ")
      ?.trim()
      ?.toLowerCase() || String(value || "").replace(/\s+/g, " " ).trim().toLowerCase();
  }

  function normalizeCreator(value) {
    return normalizeName(String(value || "").replace(/^@+/, ""));
  }

  function normalizeImage(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw, location.origin);
      url.search = "";
      url.hash = "";
      return url.href.toLowerCase();
    } catch {
      return raw.replace(/[?#].*$/, "").toLowerCase();
    }
  }

  function membershipIndex(kind) {
    let ids = [];
    let meta = {};
    if (kind === "opened") {
      ids = [...(DS.state.openedChats || [])];
      meta = DS.state.openedChatMeta || {};
    } else if (kind === "later") {
      ids = Array.isArray(DS.state.laterBots?.ids) ? DS.state.laterBots.ids : [...(DS.state.laterBotIdSet || [])];
      meta = DS.state.laterBots?.meta || {};
    } else if (kind === "favorite") {
      ids = Array.isArray(DS.state.favoriteBots?.ids) ? DS.state.favoriteBots.ids : [...(DS.state.favoriteBotIdSet || [])];
      meta = DS.state.favoriteBots?.meta || {};
    }

    const idSet = new Set(ids.map(normalizeIdentity).filter(Boolean));
    const nameCreator = new Set();
    const images = new Set();

    const addId = value => {
      const raw = String(value || "").trim();
      if (!raw) return;
      const parsed = DS.botIdFromHref?.(raw) || DS.chatIdFromHref?.(raw) || raw;
      const key = normalizeIdentity(parsed);
      if (key) idSet.add(key);
    };

    for (const [rawId, rawMeta] of Object.entries(meta || {})) {
      const item = rawMeta && typeof rawMeta === "object" ? rawMeta : {};
      addId(rawId);
      addId(item.id);
      addId(item.chatUrl);
      addId(item.profileUrl);
      const name = normalizeName(item.name || item.title || "");
      const creator = normalizeCreator(item.creator || item.creatorName || item.creatorHandle || "");
      if (name && creator) nameCreator.add(`${name}\n${creator}`);
      const image = normalizeImage(item.image || item.avatar || "");
      if (image) images.add(image);
    }

    return { kind, idSet, nameCreator, images };
  }

  function entryMembership(entry, index) {
    if (!entry?.card || !index) return false;
    const ids = DS.cardBotIdentityCandidates?.(entry.card, entry.anchor) || [
      DS.botIdFromHref?.(entry.anchor?.href || "") || DS.chatIdFromHref?.(entry.anchor?.href || "") || ""
    ];
    for (const id of ids) {
      if (index.idSet.has(normalizeIdentity(id))) return true;
    }

    // Compact Android/WebView listings have occasionally exposed a different
    // navigation id on the visible anchor than the id saved by QoL. When that
    // happens, use exact local metadata as a conservative identity bridge.
    const name = normalizeName(DS.getCardTitle?.(entry.card) || "");
    const creator = normalizeCreator(creatorHandle(entry.card) || entry.card.querySelector?.("a[href*='/creator/']")?.textContent || "");
    if (name && creator && index.nameCreator.has(`${name}\n${creator}`)) {
      const runtime = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      runtime.smartFilterMetadataFallbackMatches = Number(runtime.smartFilterMetadataFallbackMatches || 0) + 1;
      return true;
    }
    const image = normalizeImage(DS.getCardImageUrl?.(entry.card) || "");
    if (image && index.images.has(image)) {
      const runtime = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      runtime.smartFilterMetadataFallbackMatches = Number(runtime.smartFilterMetadataFallbackMatches || 0) + 1;
      return true;
    }
    return false;
  }

  function passes(entry, filters, indexes) {
    const hasLorebook = !!DS.cardHasLorebook?.(entry.card);
    const opened = entryMembership(entry, indexes.opened);
    const favorite = entryMembership(entry, indexes.favorite);
    const savedLater = entryMembership(entry, indexes.later);

    if (filters.lorebook === "has" && !hasLorebook) return false;
    if (filters.lorebook === "none" && hasLorebook) return false;

    if (filters.opened === "opened" && !opened) return false;
    if (filters.opened === "unopened" && opened) return false;

    if (filters.favorites === "favorites" && !favorite) return false;
    if (filters.favorites === "not-favorites" && favorite) return false;

    if (filters.later === "later" && !savedLater) return false;
    if (filters.later === "not-later" && savedLater) return false;

    if (filters.followed !== "any") {
      const handle = creatorHandle(entry.card);
      const followed = !!(handle && DS.isFollowedCreator?.(handle));
      if (filters.followed === "followed" && !followed) return false;
      if (filters.followed === "not-followed" && followed) return false;
    }

    return true;
  }

  function restoreEntries(entries = cardEntries()) {
    for (const entry of entries) entry.target?.classList?.remove(HIDDEN_CLASS);
  }

  function placement(entries) {
    const preferred =
      document.querySelector("[data-testid='BotListToolbarV2-Dropdowns']") ||
      document.querySelector("[data-testid='BotListToolbarV2-SearchInput']")?.closest("div.flex")?.parentElement ||
      null;
    if (preferred) return { host: preferred, before: null };
    const grid = entries[0]?.target?.parentElement;
    return grid?.parentElement ? { host: grid.parentElement, before: grid } : null;
  }

  function currentFilters() {
    DS.state.smartFilterState = normalizeFilters(DS.state.smartFilterState || defaultFilters());
    return DS.state.smartFilterState;
  }

  function smartFilterMembershipOverride(kind) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableSmartFilterPresets || !isListingPage()) return false;
    const filters = currentFilters();
    if (kind === "opened") return filters.opened === "opened";
    if (kind === "favorite") return filters.favorites === "favorites";
    if (kind === "later") return filters.later === "later";
    return false;
  }

  DS.smartFilterMembershipOverride = smartFilterMembershipOverride;
  DS.smartFilterWantsOpened = () => smartFilterMembershipOverride("opened");
  DS.smartFilterWantsFavorites = () => smartFilterMembershipOverride("favorite");
  DS.smartFilterWantsLater = () => smartFilterMembershipOverride("later");

  // Listing Refill uses this before a helper card ever enters the live page.
  // Keeping the decision here means refill and the visible Smart Filter share
  // the same local membership/index logic instead of duplicating it.
  DS.getSmartFilterRefillRejection = function getSmartFilterRefillRejection(card, anchor) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableSmartFilterPresets || !isListingPage() || !card || !anchor) return "";

    const filters = currentFilters();
    const entry = { card, anchor, target: card };
    const indexes = {
      opened: membershipIndex("opened"),
      later: membershipIndex("later"),
      favorite: membershipIndex("favorite")
    };

    const hasLorebook = !!DS.cardHasLorebook?.(card);
    const opened = entryMembership(entry, indexes.opened);
    const favorite = entryMembership(entry, indexes.favorite);
    const savedLater = entryMembership(entry, indexes.later);

    if (filters.lorebook === "has" && !hasLorebook) return "smart filter: requires Lorebook";
    if (filters.lorebook === "none" && hasLorebook) return "smart filter: excludes Lorebook";
    if (filters.opened === "opened" && !opened) return "smart filter: opened only";
    if (filters.opened === "unopened" && opened) return "smart filter: unopened only";
    if (filters.favorites === "favorites" && !favorite) return "smart filter: favorites only";
    if (filters.favorites === "not-favorites" && favorite) return "smart filter: excludes favorites";
    if (filters.later === "later" && !savedLater) return "smart filter: Later only";
    if (filters.later === "not-later" && savedLater) return "smart filter: excludes Later";

    if (filters.followed !== "any") {
      const handle = creatorHandle(card);
      const followed = !!(handle && DS.isFollowedCreator?.(handle));
      if (filters.followed === "followed" && !followed) return "smart filter: followed creators only";
      if (filters.followed === "not-followed" && followed) return "smart filter: excludes followed creators";
    }

    return "";
  };

  function currentPresetId() {
    return clean(DS.state.smartFilterPresetId || "");
  }

  function setCurrentPresetId(id) {
    DS.state.smartFilterPresetId = clean(id);
  }

  function addOption(group, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    group.appendChild(option);
  }

  function updatePresetSelect(toolbar) {
    const select = toolbar?.querySelector?.("#ds-smart-preset-select");
    if (!select) return;

    const wanted = currentPresetId();
    const fragment = document.createDocumentFragment();
    const custom = document.createElement("option");
    custom.value = "";
    custom.textContent = "Custom / no preset";
    fragment.appendChild(custom);

    const builtinGroup = document.createElement("optgroup");
    builtinGroup.label = "Built-in presets";
    for (const item of builtins()) addOption(builtinGroup, item.id, item.name);
    fragment.appendChild(builtinGroup);

    if (presets.length) {
      const savedGroup = document.createElement("optgroup");
      savedGroup.label = "Saved presets";
      for (const item of presets) addOption(savedGroup, item.id, item.name);
      fragment.appendChild(savedGroup);
    }

    select.replaceChildren(fragment);
    if (findPreset(wanted)) select.value = wanted;
    else {
      setCurrentPresetId("");
      select.value = "";
    }
    updatePresetButtons(toolbar);
  }

  function renderPinned(toolbar) {
    const host = toolbar?.querySelector?.("#ds-smart-filter-pinned");
    if (!host) return;
    host.replaceChildren();

    for (const id of pinnedIds) {
      const preset = findPreset(id);
      if (!preset) continue;
      const wrap = document.createElement("span");
      wrap.className = "ds-smart-filter-pin-chip";

      const apply = document.createElement("button");
      apply.type = "button";
      apply.textContent = preset.name;
      apply.title = `Apply pinned preset: ${preset.name}`;
      apply.addEventListener("click", () => applyPreset(toolbar, preset.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = `Unpin ${preset.name}`;
      remove.addEventListener("click", async event => {
        event.stopPropagation();
        pinnedIds = pinnedIds.filter(value => value !== preset.id);
        await savePinned();
        renderPinned(toolbar);
        updatePresetButtons(toolbar);
        DS.updateQuickPanel?.();
      });

      wrap.append(apply, remove);
      host.appendChild(wrap);
    }
  }

  function updatePresetButtons(toolbar) {
    const id = currentPresetId();
    const customSelected = !!id && !isBuiltin(id) && !!presets.find(item => item.id === id);
    const selected = !!id && !!findPreset(id);
    const rename = toolbar?.querySelector?.("#ds-smart-filter-rename");
    const remove = toolbar?.querySelector?.("#ds-smart-filter-delete");
    const pin = toolbar?.querySelector?.("#ds-smart-filter-pin");
    if (rename) rename.disabled = !customSelected;
    if (remove) remove.disabled = !customSelected;
    if (pin) {
      pin.disabled = !selected;
      pin.textContent = selected && pinnedIds.includes(id) ? "★ Pinned" : "☆ Pin";
      pin.title = selected
        ? (pinnedIds.includes(id) ? "Unpin this preset" : "Pin this preset for one-click access (max 3)")
        : "Choose a preset first";
    }
    renderPinned(toolbar);
  }

  function syncFilterControls(toolbar) {
    const filters = currentFilters();
    for (const key of ["lorebook", "opened", "followed", "favorites", "later"]) {
      const input = toolbar?.querySelector?.(`#ds-smart-filter-${key}`);
      if (input && input.value !== filters[key]) input.value = filters[key];
    }
  }

  function syncPresetSelect(toolbar) {
    const select = toolbar?.querySelector?.("#ds-smart-preset-select");
    if (!select) return;
    const id = currentPresetId();
    const next = findPreset(id) ? id : "";
    if (select.value !== next) select.value = next;
    updatePresetButtons(toolbar);
  }

  function readToolbar(toolbar) {
    return normalizeFilters({
      lorebook: toolbar.querySelector("#ds-smart-filter-lorebook")?.value || "any",
      opened: toolbar.querySelector("#ds-smart-filter-opened")?.value || "any",
      followed: toolbar.querySelector("#ds-smart-filter-followed")?.value || "any",
      favorites: toolbar.querySelector("#ds-smart-filter-favorites")?.value || "any",
      later: toolbar.querySelector("#ds-smart-filter-later")?.value || "any"
    });
  }

  async function applyPreset(toolbar, id) {
    const picked = findPreset(id);
    if (!picked) return false;
    DS.state.smartFilterState = normalizeFilters(picked.filters);
    setCurrentPresetId(picked.id);
    syncFilterControls(toolbar);
    syncPresetSelect(toolbar);
    await DS.applyCardHiding?.();
    await DS.applySmartFilterPresets?.();
    return true;
  }

  function ensureToolbar(entries) {
    const place = placement(entries);
    if (!place?.host) return null;

    let toolbar = document.getElementById("ds-smart-filter-toolbar");
    if (toolbar) return toolbar;

    toolbar = document.createElement("div");
    toolbar.id = "ds-smart-filter-toolbar";
    toolbar.className = "ds-smart-filter-toolbar";
    DS.setSafeMarkup(toolbar, `
      <strong>Smart filters</strong>
      <select id="ds-smart-preset-select" title="Built-in or saved preset"><option value="">Custom / no preset</option></select>
      <label>Lorebook <select id="ds-smart-filter-lorebook"><option value="any">Any</option><option value="has">Has</option><option value="none">No Lorebook</option></select></label>
      <label>Opened <select id="ds-smart-filter-opened"><option value="any">Any</option><option value="unopened">Unopened</option><option value="opened">Opened</option></select></label>
      <label>Creator <select id="ds-smart-filter-followed"><option value="any">Any</option><option value="followed">Followed</option><option value="not-followed">Not followed</option></select></label>
      <label>Favorites <select id="ds-smart-filter-favorites"><option value="any">Any</option><option value="favorites">Favorites</option><option value="not-favorites">Not favorites</option></select></label>
      <label>Later <select id="ds-smart-filter-later"><option value="any">Any</option><option value="later">Later</option><option value="not-later">Not Later</option></select></label>
      <button type="button" id="ds-smart-filter-save">Save preset</button>
      <button type="button" id="ds-smart-filter-pin" title="Pin the selected preset for one-click access">☆ Pin</button>
      <button type="button" id="ds-smart-filter-rename">Rename</button>
      <button type="button" id="ds-smart-filter-delete">Delete</button>
      <button type="button" id="ds-smart-filter-clear">Clear</button>
      <span id="ds-smart-filter-pinned" class="ds-smart-filter-pinned" aria-label="Pinned Smart Filter presets"></span>
      <span id="ds-smart-filter-count" class="ds-smart-filter-count"></span>`);

    if (place.before && place.before.parentElement === place.host) place.host.insertBefore(toolbar, place.before);
    else place.host.appendChild(toolbar);

    const applyFromControls = async () => {
      DS.state.smartFilterState = readToolbar(toolbar);
      setCurrentPresetId("");
      syncPresetSelect(toolbar);
      // Re-run the normal card-hiding pass whenever the Opened Smart Filter
      // changes. This lets an explicit Opened filter temporarily override the
      // general Hide opened bots preference, and restores that preference when
      // the Smart Filter is changed back.
      await DS.applyCardHiding?.();
      await DS.applySmartFilterPresets?.();
    };

    for (const key of ["lorebook", "opened", "followed", "favorites", "later"]) {
      toolbar.querySelector(`#ds-smart-filter-${key}`)?.addEventListener("change", applyFromControls);
    }

    toolbar.querySelector("#ds-smart-preset-select")?.addEventListener("change", event => {
      const id = clean(event.target.value);
      if (!id) {
        setCurrentPresetId("");
        updatePresetButtons(toolbar);
        return;
      }
      applyPreset(toolbar, id);
    });

    toolbar.querySelector("#ds-smart-filter-save")?.addEventListener("click", async () => {
      const name = clean(window.prompt("Name this filter preset:"));
      if (!name) return;

      const existing = presets.find(item => item.name.toLowerCase() === name.toLowerCase());
      const item = {
        id: existing?.id || `preset-${Date.now().toString(36)}`,
        name,
        filters: readToolbar(toolbar)
      };

      presets = existing
        ? presets.map(value => value.id === existing.id ? item : value)
        : [...presets, item];

      await savePresets();
      setCurrentPresetId(item.id);
      updatePresetSelect(toolbar);
      DS.setQuickStatus?.(`Saved filter preset: ${name}.`);
    });

    toolbar.querySelector("#ds-smart-filter-pin")?.addEventListener("click", async () => {
      const id = currentPresetId();
      const picked = findPreset(id);
      if (!picked) return DS.setQuickStatus?.("Choose a preset before pinning it.");

      if (pinnedIds.includes(id)) {
        pinnedIds = pinnedIds.filter(value => value !== id);
        await savePinned();
        updatePresetButtons(toolbar);
        DS.updateQuickPanel?.();
        DS.setQuickStatus?.(`Unpinned filter preset: ${picked.name}.`);
        return;
      }

      if (pinnedIds.length >= 3) return DS.setQuickStatus?.("You can pin up to three Smart Filter presets.");
      pinnedIds = [...pinnedIds, id];
      await savePinned();
      updatePresetButtons(toolbar);
      DS.updateQuickPanel?.();
      DS.setQuickStatus?.(`Pinned filter preset: ${picked.name}.`);
    });

    toolbar.querySelector("#ds-smart-filter-rename")?.addEventListener("click", async () => {
      const id = currentPresetId();
      const picked = presets.find(item => item.id === id);
      if (!picked) return DS.setQuickStatus?.("Choose one of your saved presets first.");

      const name = clean(window.prompt("Rename this filter preset:", picked.name));
      if (!name || name === picked.name) return;
      if (presets.some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
        return DS.setQuickStatus?.("A saved preset already uses that name.");
      }

      picked.name = name;
      await savePresets();
      updatePresetSelect(toolbar);
      DS.setQuickStatus?.(`Renamed filter preset to: ${name}.`);
    });

    toolbar.querySelector("#ds-smart-filter-delete")?.addEventListener("click", async () => {
      const id = currentPresetId();
      const picked = presets.find(item => item.id === id);
      if (!picked) return DS.setQuickStatus?.("Choose one of your saved presets first.");

      presets = presets.filter(item => item.id !== id);
      pinnedIds = pinnedIds.filter(value => value !== id);
      await savePresets();
      await savePinned();
      setCurrentPresetId("");
      updatePresetSelect(toolbar);
      DS.setQuickStatus?.(`Deleted filter preset: ${picked.name}.`);
    });

    toolbar.querySelector("#ds-smart-filter-clear")?.addEventListener("click", async () => {
      DS.state.smartFilterState = defaultFilters();
      setCurrentPresetId("");
      syncFilterControls(toolbar);
      syncPresetSelect(toolbar);
      await DS.applyCardHiding?.();
      await DS.applySmartFilterPresets?.();
    });

    updatePresetSelect(toolbar);
    syncFilterControls(toolbar);
    syncPresetSelect(toolbar);
    return toolbar;
  }

  function cleanup() {
    restoreEntries();
    document.getElementById("ds-smart-filter-toolbar")?.remove();
    DS.state.smartFilterWasActive = false;
  }

  DS.applySmartFilterPresets = async function applySmartFilterPresets() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableSmartFilterPresets || !isListingPage()) {
      if (DS.state.smartFilterWasActive) cleanup();
      return;
    }

    DS.state.smartFilterWasActive = true;
    await ensurePresetsLoaded();

    const filters = currentFilters();
    if (filters.opened === "opened") DS.restoreOpenedCardsForSmartFilter?.();
    const entries = cardEntries();
    const toolbar = ensureToolbar(entries);
    const indexes = {
      opened: membershipIndex("opened"),
      later: membershipIndex("later"),
      favorite: membershipIndex("favorite")
    };
    let visible = 0;
    let identified = 0;
    let metadataBridgeable = 0;

    // Toggle only the entries that need changing. The old implementation first
    // restored every card and then hid non-matches again on every scheduler pass,
    // which caused unnecessary layout work on large/infinite listings.
    for (const entry of entries) {
      const ids = DS.cardBotIdentityCandidates?.(entry.card, entry.anchor) || [];
      if (ids.some(Boolean)) identified++;
      else {
        const name = normalizeName(DS.getCardTitle?.(entry.card) || "");
        const creator = normalizeCreator(creatorHandle(entry.card) || entry.card.querySelector?.("a[href*='/creator/']")?.textContent || "");
        const image = normalizeImage(DS.getCardImageUrl?.(entry.card) || "");
        if ((name && creator) || image) metadataBridgeable++;
      }
      const match = passes(entry, filters, indexes);
      entry.target?.classList?.toggle(HIDDEN_CLASS, !match);
      if (match) visible++;
    }

    const activeMembership = filters.opened !== "any" ? indexes.opened : (filters.later !== "any" ? indexes.later : (filters.favorites !== "any" ? indexes.favorite : null));
    const count = toolbar?.querySelector?.("#ds-smart-filter-count");
    if (count) {
      const identitySuffix = visible === 0 && entries.length
        ? ` · IDs ${identified}/${entries.length}${metadataBridgeable ? ` + ${metadataBridgeable} metadata` : ""}`
        : "";
      count.textContent = `${visible}/${entries.length} loaded match${identitySuffix}`;
      const savedCount = activeMembership?.idSet?.size || 0;
      count.title = `Smart Filter diagnostics: ${entries.length} loaded cards · ${identified} expose a bot/chat ID · ${metadataBridgeable} can use exact local metadata fallback${activeMembership ? ` · ${savedCount} saved IDs in the active local set` : ""}. If matches are zero, this helps separate card-identity issues from display filtering.`;
      const runtime = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      runtime.smartFilterLoadedCards = entries.length;
      runtime.smartFilterIdentifiedCards = identified;
      runtime.smartFilterMetadataBridgeableCards = metadataBridgeable;
      runtime.smartFilterLastVisibleMatches = visible;
      runtime.smartFilterActiveSavedIds = savedCount;
    }
  };

  DS.getPinnedSmartFilterPresets = function getPinnedSmartFilterPresets() {
    if (!presetsLoaded) return [];
    return pinnedIds.map(id => findPreset(id)).filter(Boolean).map(item => ({ id: item.id, name: item.name }));
  };

  DS.applySmartFilterPresetById = async function applySmartFilterPresetById(id) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableSmartFilterPresets || !isListingPage()) return false;
    await ensurePresetsLoaded();
    const picked = findPreset(id);
    if (!picked) return false;
    DS.state.smartFilterState = normalizeFilters(picked.filters);
    setCurrentPresetId(picked.id);
    await DS.applyCardHiding?.();
    await DS.applySmartFilterPresets?.();
    DS.updateQuickPanel?.();
    return true;
  };

  DS.removeSmartFilterPresets = cleanup;
  DS.SMART_FILTER_PRESETS_KEY = STORAGE_KEY;

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || (!changes[STORAGE_KEY] && !changes[PINNED_KEY])) return;
      if (changes[STORAGE_KEY]) presets = normalizePresets(changes[STORAGE_KEY].newValue);
      if (changes[PINNED_KEY]) pinnedIds = normalizePinned(changes[PINNED_KEY].newValue);
      presetsLoaded = true;
      const toolbar = document.getElementById("ds-smart-filter-toolbar");
      if (toolbar) updatePresetSelect(toolbar);
      DS.updateQuickPanel?.();
      DS.scheduleRun?.({ priority: "slow", source: "smart-filter-presets-changed" });
    });
  } catch {}
})();
