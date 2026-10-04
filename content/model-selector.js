(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function norm(value) {
    return DS.normalize ? DS.normalize(value) : cleanText(value).toLowerCase();
  }

  function textOf(el) {
    return cleanText(el?.innerText || el?.textContent || "");
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isMobileLike() {
    const env = DS.getAndroidEnvironment?.();
    if (env?.android) return true;
    const ua = String(navigator.userAgent || "");
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    try {
      return window.matchMedia?.("(pointer: coarse)")?.matches && window.innerWidth <= 900;
    } catch {
      return window.innerWidth <= 700;
    }
  }

  const NON_MODEL_NAMES = new Set([
    "available models",
    "premium ai models",
    "explore all models",
    "generation settings",
    "select a model",
    "set model",
    "cancel",
    "upgrade"
  ]);

  const MODEL_SETTING_KEYS = Object.freeze([
    "expandModelSelectorDescriptions",
    "hideModelUpgradeButtons",
    "customizeModelQuickMenu",
    "modelFavoriteNames",
    "modelHiddenNames",
    "modelQuickFavoritesOnly"
  ]);
  let selectorDirty = true;
  let selectorDirtyReason = "startup";
  let selectorDirtyNodes = new Set();
  let selectorRouteKey = "";
  let selectorSettingsKey = "";
  let cachedSurfaces = [];
  const processedSurfaceState = new WeakMap();

  function routeKey() {
    return `${location.pathname || ""}${location.search || ""}`;
  }

  function settingsKey(settings = DS.state?.settings || {}) {
    return MODEL_SETTING_KEYS.map(key => `${key}:${typeof settings[key] === "string" ? settings[key] : JSON.stringify(settings[key] ?? null)}`).join("|");
  }

  function tinyHash(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function normalizeDirtyNode(node) {
    if (node instanceof Element) return node;
    if (node?.parentElement instanceof Element) return node.parentElement;
    return null;
  }

  function markSelectorDirty(reason = "mutation", nodes = []) {
    selectorDirty = true;
    selectorDirtyReason = String(reason || "mutation").slice(0, 80);
    for (const raw of Array.isArray(nodes) ? nodes : [nodes]) {
      const node = normalizeDirtyNode(raw);
      if (node?.isConnected) selectorDirtyNodes.add(node);
    }
    if (selectorDirtyNodes.size > 24) selectorDirtyNodes = new Set([...selectorDirtyNodes].slice(-24));
  }

  function compactNodeText(node) {
    if (!(node instanceof Element)) return "";
    const direct = cleanText(node.getAttribute?.("aria-label") || node.getAttribute?.("title") || "");
    if (direct) return direct.slice(0, 500);
    const text = cleanText(node.textContent || "");
    return text.length <= 1800 ? text : text.slice(0, 1800);
  }

  function nodeLooksModelRelevant(node) {
    const el = normalizeDirtyNode(node);
    if (!el || el.closest?.("[id^='message-'], #ds-qol-panel, #ds-chat-export-modal")) return false;
    if (cachedSurfaces.some(surface => surface.root?.isConnected && (surface.root === el || surface.root.contains(el)))) return true;
    if (el.matches?.("[data-testid*='model' i], [aria-label*='model' i], [data-translate-key*='model' i]")) return true;
    if (el.querySelector?.("[data-testid*='model' i], [aria-label*='model' i], [data-translate-key*='model' i]")) return true;
    if (el === document.documentElement || el === document.body || el.id === "root" || Number(el.childElementCount || 0) > 80) return false;
    // A message-list/container mutation must never invalidate the model picker.
    if (el.querySelector?.("[id^='message-']") && !el.matches?.("header, [role='dialog'], [aria-modal='true'], [data-testid*='model' i], [aria-label*='model' i]")) return false;
    const text = norm(compactNodeText(el));
    if (!/(?:available models|select a model|explore all models|generation settings|set model|premium ai models)/.test(text)) return false;
    const exactLabel = [...(el.querySelectorAll?.("p, span") || [])].slice(0, 80).some(node => {
      const label = norm(node.textContent || "");
      return label === "available models" || label === "select a model" || label === "explore all models" || label === "generation settings";
    });
    return exactLabel || !!el.closest?.("header, [role='dialog'], [aria-modal='true']") || !!el.matches?.("div.fixed, [data-testid*='model' i], [aria-label*='model' i]");
  }

  function mutationsRelevant(mutations = []) {
    const nodes = [];
    let relevant = false;
    for (const mutation of mutations || []) {
      const target = normalizeDirtyNode(mutation?.target);
      if (target && nodeLooksModelRelevant(target)) { relevant = true; nodes.push(target); }
      for (const node of [...(mutation?.addedNodes || []), ...(mutation?.removedNodes || [])]) {
        const el = normalizeDirtyNode(node);
        if (el && nodeLooksModelRelevant(el)) { relevant = true; nodes.push(el); }
      }
    }
    if (relevant) markSelectorDirty("model-subtree-mutation", nodes);
    return relevant;
  }

  DS.markModelSelectorDirty = markSelectorDirty;
  DS.modelSelectorMutationsRelevant = mutationsRelevant;
  DS.isModelSelectorDirty = function isModelSelectorDirty() {
    const currentRoute = routeKey();
    const currentSettings = settingsKey();
    if (currentRoute !== selectorRouteKey) markSelectorDirty("route");
    if (currentSettings !== selectorSettingsKey) markSelectorDirty("settings");
    return selectorDirty;
  };

  function directCursorChildrenCount(node) {
    return [...(node?.querySelectorAll?.("div[class*='cursor-pointer']") || [])]
      .filter(el => !el.querySelector("div[class*='cursor-pointer']"))
      .length;
  }

  function queryWithin(scope, selector) {
    if (!scope) return [];
    if (scope === document) return DS.qsa(selector);
    const out = [];
    if (scope instanceof Element && scope.matches?.(selector)) out.push(scope);
    scope.querySelectorAll?.(selector).forEach(el => out.push(el));
    return out;
  }

  function exactTextNodes(value, scope = document) {
    const wanted = norm(value);
    return queryWithin(scope, "p, span")
      .filter(el => norm(el.textContent) === wanted && isVisible(el));
  }

  function findCompactModelRoots(scope = document) {
    const roots = [];

    exactTextNodes("Available models", scope).forEach(label => {
      let node = label.parentElement;
      for (let i = 0; node && node !== document.body && i < 9; i++, node = node.parentElement) {
        if (!isVisible(node)) continue;
        const count = directCursorChildrenCount(node);
        if (count < 3) continue;
        roots.push(node);
        break;
      }
    });

    return roots;
  }

  function findExploreModelRoots(scope = document) {
    const roots = [];

    exactTextNodes("Select a model", scope).forEach(label => {
      let node = label.parentElement;
      for (let i = 0; node && node !== document.body && i < 10; i++, node = node.parentElement) {
        if (!isVisible(node)) continue;
        const text = norm(textOf(node));
        if (!text.includes("set model") || directCursorChildrenCount(node) < 3) continue;
        roots.push(node);
        break;
      }
    });

    return roots;
  }

  function surfaceKind(root) {
    const text = norm(textOf(root));
    if (text.includes("select a model") && text.includes("set model")) return "explore";
    if (text.includes("explore all models") || text.includes("generation settings")) return "quick";
    return "available";
  }

  function searchScopesFromDirtyNodes() {
    const scopes = new Set();
    for (const raw of selectorDirtyNodes) {
      let node = normalizeDirtyNode(raw);
      for (let i = 0; node && node !== document.body && i < 6; i++, node = node.parentElement) {
        scopes.add(node);
        if (node.matches?.("header, [role='dialog'], [aria-modal='true']")) break;
      }
    }
    return [...scopes].slice(0, 24);
  }

  function modelDiscoveryScopes() {
    const scopes = new Set();
    // Query only the small UI regions where SpicyChat can mount model controls.
    // This deliberately avoids the old document-wide p/span walk.
    document.querySelectorAll?.("header, [role='dialog'], [aria-modal='true'], div.fixed, [data-testid*='model' i], [aria-label*='model' i]").forEach(node => {
      if (!(node instanceof Element) || node.closest?.("[id^='message-']")) return;
      if (node === document.body || node === document.documentElement || node.id === "root") return;
      scopes.add(node);
    });
    for (const surface of cachedSurfaces) if (surface.root?.isConnected) scopes.add(surface.root);
    return [...scopes].slice(0, 40);
  }

  function findModelSelectorSurfaces(scopes = null) {
    const all = [];
    const searchScopes = Array.isArray(scopes) ? scopes : modelDiscoveryScopes();
    for (const scope of searchScopes) {
      all.push(...findCompactModelRoots(scope).map(root => ({ root, kind: surfaceKind(root) })));
      all.push(...findExploreModelRoots(scope).map(root => ({ root, kind: "explore" })));
    }

    const seen = new Set();
    return all.filter(surface => {
      if (!surface.root || seen.has(surface.root)) return false;
      seen.add(surface.root);
      return true;
    });
  }

  function surfaceRevision(root) {
    if (!root?.isConnected) return "detached";
    const rows = root.querySelectorAll?.("div[class*='cursor-pointer']")?.length || 0;
    const buttons = root.querySelectorAll?.("button")?.length || 0;
    const text = cleanText(root.textContent || "").slice(0, 5000);
    return `${rows}|${buttons}|${text.length}|${tinyHash(text)}`;
  }

  function expandDescriptions(root) {
    DS.qsa("p, span", root).forEach(el => {
      const cls = String(el.className || "");
      const text = cleanText(el.textContent);
      if (!text || text.length < 25 || !/line-clamp-\d+/.test(cls)) return;
      [...el.classList].forEach(name => {
        if (/^line-clamp-\d+$/.test(name)) el.classList.remove(name);
      });
      el.classList.add("ds-model-description-expanded");
    });
  }

  function findModelRow(button, root) {
    let node = button.parentElement;
    for (let i = 0; node && node !== root && i < 8; i++, node = node.parentElement) {
      const text = norm(textOf(node));
      const hasUpgrade = text.includes("upgrade");
      const hasName = DS.qsa("p", node).some(p => cleanText(p.textContent).length > 2);
      const hasDescription = DS.qsa("p", node).some(p => cleanText(p.textContent).length > 25);
      const looksRow = String(node.className || "").includes("items-center") || String(node.className || "").includes("gap");
      if (hasUpgrade && hasName && (hasDescription || looksRow)) return node;
    }
    return button.parentElement;
  }

  function hookLockedRow(row) {
    if (!row || row.dataset.dsModelLockedHook === "1") return;
    row.dataset.dsModelLockedHook = "1";
    row.classList.add("ds-model-locked-row");
    row.addEventListener("click", event => {
      if (DS.state?.settings?.hideModelUpgradeButtons === false) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      DS.setQuickStatus?.("Locked model upgrade prompt blocked.");
    }, true);
  }

  function cleanupHiddenUpgradeButtons() {
    DS.qsa(".ds-model-upgrade-hidden").forEach(el => el.classList.remove("ds-model-upgrade-hidden"));
  }

  function hideUpgradeButtons(root) {
    DS.qsa("button", root).forEach(button => {
      if (button.classList.contains("ds-model-favorite-button")) return;
      const text = norm(button.textContent);
      const hasUpgradeKey = !!button.querySelector("[data-translate-key='chat:page.header.modelSelection.dropdown.upgrade.button']");
      if (text !== "upgrade" && !hasUpgradeKey) return;
      const row = findModelRow(button, root);
      button.classList.add("ds-model-upgrade-hidden");
      hookLockedRow(row);
    });
  }

  function hideUpgradePopups(scopes = [document]) {
    if (DS.state?.settings?.hideModelUpgradeButtons === false) return 0;
    let changed = 0;
    const seen = new Set();
    for (const scope of scopes.length ? scopes : [document]) {
      queryWithin(scope, "[role='dialog'], [aria-modal='true'], div.fixed").forEach(el => {
        if (seen.has(el) || !isVisible(el)) return;
        seen.add(el);
        const text = norm(textOf(el));
        const isNativeModelPickerShell =
          text.includes("available models") ||
          text.includes("explore all models") ||
          text.includes("generation settings") ||
          text.includes("select a model");

        // Never hide a container that is itself SpicyChat's model picker. On mobile
        // the compact picker can be a fixed/modal surface and also contain Upgrade
        // text, which previously made it look like an upgrade popup.
        if (isNativeModelPickerShell) return;

        if (text.includes("upgrade") && (text.includes("model") || text.includes("premium") || text.includes("subscribe"))) {
          if (el.dataset?.dsHidden !== "1") changed += 1;
          DS.hideElement?.(el, "model-selector:upgrade-popup");
        }
      });
    }
    return changed;
  }

  function parseNameList(value) {
    return [...new Set(String(value || "")
      .split(/\r?\n|,/)
      .map(cleanText)
      .filter(Boolean))];
  }

  function modelNameFromRow(row) {
    const ps = [...row.querySelectorAll("p")]
      .map(p => cleanText(p.textContent))
      .filter(Boolean);

    const first = ps[0] || "";
    if (!first || first.length > 90 || NON_MODEL_NAMES.has(norm(first))) return "";

    // Real model rows currently expose at least a name plus a description.
    // This keeps menu/navigation rows such as Available models and Generation Settings out.
    const hasDescription = ps.slice(1).some(text => text.length >= 18);
    if (!hasDescription) return "";

    return first;
  }

  function findModelRows(root) {
    const candidates = [...root.querySelectorAll("div[class*='cursor-pointer']")]
      .filter(row => row !== root && (isVisible(row) || row.classList.contains("ds-model-quick-hidden")))
      .filter(row => !row.querySelector("div[class*='cursor-pointer']"))
      .map(row => ({ row, name: modelNameFromRow(row) }))
      .filter(entry => !!entry.name);

    const seenRows = new Set();
    return candidates.filter(entry => {
      if (seenRows.has(entry.row)) return false;
      seenRows.add(entry.row);
      return true;
    });
  }

  async function saveFavoriteNames(names) {
    const clean = [...new Set(names.map(cleanText).filter(Boolean))];
    DS.state.settings.modelFavoriteNames = clean.join("\n");
    await DS.saveSettingsPatch?.({ modelFavoriteNames: DS.state.settings.modelFavoriteNames });
  }

  function stopModelSelection(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function favoriteButtonHost(entry) {
    const directCheck = [...entry.row.children].find(child =>
      child?.matches?.("svg.lucide-check, svg[class*='lucide-check']")
    );
    return { parent: entry.row, before: directCheck || null };
  }

  function ensureFavoriteButton(entry, favoriteNames) {
    let button = entry.row.querySelector(":scope > .ds-model-favorite-button");

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "ds-model-favorite-button";
      button.dataset.dsModelName = entry.name;

      ["pointerdown", "mousedown"].forEach(type => {
        button.addEventListener(type, stopModelSelection, true);
      });

      button.addEventListener("click", event => {
        stopModelSelection(event);
        const modelName = button.dataset.dsModelName || entry.name;
        const current = parseNameList(DS.state?.settings?.modelFavoriteNames);
        const index = current.findIndex(name => norm(name) === norm(modelName));
        if (index >= 0) current.splice(index, 1);
        else current.push(modelName);
        saveFavoriteNames(current).then(() => {
          markSelectorDirty("favorite-setting", entry.row);
          DS.scheduleRun?.({ priority: "slow", source: "model-favorite-setting", dirty: ["model"] });
        });
      }, true);

      const { parent, before } = favoriteButtonHost(entry);
      parent.insertBefore(button, before);
    }

    button.dataset.dsModelName = entry.name;
    const favorite = favoriteNames.some(name => norm(name) === norm(entry.name));
    DS.setTextIfChanged?.(button, favorite ? "♥" : "♡");
    DS.setClassState?.(button, "is-favorite", favorite);
    button.title = favorite ? `Unfavorite ${entry.name}` : `Favorite ${entry.name}`;
    button.setAttribute("aria-label", favorite ? `Unfavorite model ${entry.name}` : `Favorite model ${entry.name}`);
    DS.setAttributeIfChanged?.(button, "aria-pressed", favorite ? "true" : "false");
    return favorite;
  }

  function rememberOriginalOrder(entries) {
    const byParent = new Map();
    entries.forEach(entry => {
      const parent = entry.row.parentElement;
      if (!parent) return;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(entry);
    });

    for (const group of byParent.values()) {
      group.forEach((entry, index) => {
        if (!entry.row.dataset.dsModelOriginalIndex) {
          entry.row.dataset.dsModelOriginalIndex = String(index);
        }
      });
    }
  }

  function restoreModelOrder(entries) {
    const byParent = new Map();
    entries.forEach(entry => {
      const parent = entry.row.parentElement;
      if (!parent) return;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(entry);
    });

    for (const [parent, group] of byParent) {
      group.sort((a, b) => Number(a.row.dataset.dsModelOriginalIndex || 0) - Number(b.row.dataset.dsModelOriginalIndex || 0));
      group.forEach(entry => parent.appendChild(entry.row));
    }
  }

  function sortFavoritesFirst(entries, favorites) {
    const favoriteOrder = new Map(favorites.map((name, index) => [norm(name), index]));
    const byParent = new Map();

    entries.forEach(entry => {
      const parent = entry.row.parentElement;
      if (!parent) return;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(entry);
    });

    for (const [parent, group] of byParent) {
      group.sort((a, b) => {
        const ai = favoriteOrder.has(norm(a.name)) ? favoriteOrder.get(norm(a.name)) : Number.MAX_SAFE_INTEGER;
        const bi = favoriteOrder.has(norm(b.name)) ? favoriteOrder.get(norm(b.name)) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return Number(a.row.dataset.dsModelOriginalIndex || 0) - Number(b.row.dataset.dsModelOriginalIndex || 0);
      });
      group.forEach(entry => parent.appendChild(entry.row));
    }
  }

  function leaveCompactMobileMenuNative(root) {
    if (!root) return;
    const entries = findModelRows(root);
    entries.forEach(entry => entry.row.classList.remove("ds-model-quick-hidden"));
    root.querySelectorAll(".ds-model-favorite-button").forEach(button => button.remove());
    restoreModelOrder(entries);

    const perf = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
    perf.modelQuickMenuMobileSafePasses = Number(perf.modelQuickMenuMobileSafePasses || 0) + 1;
  }

  function applyModelMenu(surface, settings) {
    // SpicyChat's mobile/WebView quick model menu is re-mounted asynchronously and
    // does not tolerate rows being re-parented/reordered by an extension. Keep that
    // compact surface native on mobile. Explore All can still receive QoL model tools.
    if (surface.kind !== "explore" && isMobileLike()) {
      leaveCompactMobileMenuNative(surface.root);
      return;
    }

    const entries = findModelRows(surface.root);
    if (!entries.length) return;

    rememberOriginalOrder(entries);

    const favorites = parseNameList(settings.modelFavoriteNames);
    const hidden = parseNameList(settings.modelHiddenNames).map(norm);
    const compactMenu = surface.kind !== "explore";

    const rowStates = entries.map(entry => {
      const favorite = ensureFavoriteButton(entry, favorites);
      const hiddenByName = compactMenu && hidden.includes(norm(entry.name));
      const hiddenByFavoritesOnly = compactMenu && !!settings.modelQuickFavoritesOnly && !favorite;
      return { entry, hidden: hiddenByName || hiddenByFavoritesOnly };
    });

    // Mobile/WebView model menus can mount a slightly different compact row shape and
    // then re-render a moment later. Never let QoL turn a successfully opened native
    // picker into an empty shell ("Available models / Explore all models / Generation
    // settings" only). If every detected model would be hidden, fail open and leave the
    // native rows visible. This also makes stale favorite/hidden-name settings recoverable.
    const wouldHideEveryModel = compactMenu && rowStates.length > 0 && rowStates.every(state => state.hidden);

    rowStates.forEach(({ entry, hidden }) => {
      entry.row.classList.toggle("ds-model-quick-hidden", !wouldHideEveryModel && hidden);
      DS.setDatasetIfChanged?.(entry.row, "dsModelSurface", surface.kind);
    });

    if (wouldHideEveryModel) {
      const perf = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.modelQuickMenuFailOpen = Number(perf.modelQuickMenuFailOpen || 0) + 1;
    }

    // Favorites are kept at the top in every model picker. Explore All remains complete,
    // so hidden/favorites-only quick-menu settings can never make a model impossible to recover.
    sortFavoritesFirst(entries, favorites);
  }

  function cleanupModelQuickMenu() {
    const entries = [];
    document.querySelectorAll(".ds-model-favorite-button").forEach(button => button.remove());
    document.querySelectorAll(".ds-model-quick-hidden").forEach(row => row.classList.remove("ds-model-quick-hidden"));
    document.querySelectorAll("[data-ds-model-original-index]").forEach(row => {
      entries.push({ row, name: "" });
      delete row.dataset.dsModelSurface;
    });
    restoreModelOrder(entries);
  }

  DS.applyModelSelectorTools = function applyModelSelectorTools() {
    const settings = DS.state?.settings || {};
    const currentRoute = routeKey();
    const currentSettings = settingsKey(settings);
    if (currentRoute !== selectorRouteKey) markSelectorDirty("route");
    if (currentSettings !== selectorSettingsKey) markSelectorDirty("settings");

    const trigger = selectorDirtyReason || "unknown";
    const traceToken = DS.isDiagnosticTraceActive?.("deep")
      ? DS.diagOperationStart?.("model-selector", "refresh", { trigger })
      : null;
    const started = typeof performance !== "undefined" ? performance.now() : 0;
    let rootsChecked = 0;
    let changed = 0;
    let skipped = 0;
    let cacheHit = false;

    try {
      if (!settings.enabled || !DS.isSingleChatPage?.()) {
        if (DS.state.modelQuickMenuWasActive) cleanupModelQuickMenu();
        DS.state.modelQuickMenuWasActive = false;
        selectorRouteKey = currentRoute;
        selectorSettingsKey = currentSettings;
        selectorDirty = false;
        selectorDirtyNodes.clear();
        return;
      }

      if (!selectorDirty) {
        cacheHit = true;
        return;
      }

      const routeChanged = selectorRouteKey !== currentRoute;
      const settingsChanged = selectorSettingsKey !== currentSettings;
      const dirtyScopes = searchScopesFromDirtyNodes();
      const connectedCached = cachedSurfaces.filter(surface => surface.root?.isConnected);
      const fullDiscovery = routeChanged || !connectedCached.length || (!dirtyScopes.length && trigger !== "model-subtree-mutation");
      const discoveryScopes = fullDiscovery ? modelDiscoveryScopes() : dirtyScopes;
      const discovered = findModelSelectorSurfaces(discoveryScopes);
      const byRoot = new Map();
      for (const surface of [...connectedCached, ...discovered]) if (surface.root?.isConnected) byRoot.set(surface.root, surface);
      const surfaces = [...byRoot.values()];
      cachedSurfaces = surfaces;
      rootsChecked = surfaces.length;

      const processSurface = surface => {
        const revision = surfaceRevision(surface.root);
        const stateKey = `${currentSettings}|${revision}`;
        if (!settingsChanged && processedSurfaceState.get(surface.root) === stateKey) {
          skipped += 1;
          return;
        }
        if (settings.expandModelSelectorDescriptions) expandDescriptions(surface.root);
        if (settings.hideModelUpgradeButtons) hideUpgradeButtons(surface.root);
        if (settings.customizeModelQuickMenu) {
          DS.state.modelQuickMenuWasActive = true;
          applyModelMenu(surface, settings);
        }
        processedSurfaceState.set(surface.root, stateKey);
        changed += 1;
      };

      surfaces.forEach(processSurface);

      if (settings.hideModelUpgradeButtons) {
        const popupScopes = fullDiscovery ? modelDiscoveryScopes() : [...dirtyScopes, ...surfaces.map(surface => surface.root)];
        changed += hideUpgradePopups(popupScopes);
      } else if (settingsChanged || document.querySelector(".ds-model-upgrade-hidden")) {
        cleanupHiddenUpgradeButtons();
      }

      if (!settings.customizeModelQuickMenu && DS.state.modelQuickMenuWasActive) {
        cleanupModelQuickMenu();
        DS.state.modelQuickMenuWasActive = false;
        changed += 1;
      }

      selectorRouteKey = currentRoute;
      selectorSettingsKey = currentSettings;
      selectorDirty = false;
      selectorDirtyReason = "";
      selectorDirtyNodes.clear();
    } finally {
      const durationMs = started ? Math.round((performance.now() - started) * 10) / 10 : 0;
      DS.traceEvent?.("model-selector", "refresh-summary", {
        trigger, rootsChecked, changed, skipped, cacheHit, durationMs
      }, { level: "deep" });
      if (traceToken) DS.diagOperationEnd?.(traceToken, {
        outcome: cacheHit ? "skipped" : "ok",
        counts: { scanned: rootsChecked, changed, skipped, errors: 0 },
        meta: { trigger, cacheHit, durationMs }
      });
    }
  };

  DS.removeModelSelectorQuickMenu = cleanupModelQuickMenu;
})();
