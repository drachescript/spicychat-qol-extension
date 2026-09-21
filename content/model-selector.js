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

  function directCursorChildrenCount(node) {
    return [...(node?.querySelectorAll?.("div[class*='cursor-pointer']") || [])]
      .filter(el => !el.querySelector("div[class*='cursor-pointer']"))
      .length;
  }

  function exactTextNodes(value) {
    const wanted = norm(value);
    return DS.qsa("p, span")
      .filter(el => norm(el.textContent) === wanted && isVisible(el));
  }

  function findCompactModelRoots() {
    const roots = [];

    exactTextNodes("Available models").forEach(label => {
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

  function findExploreModelRoots() {
    const roots = [];

    exactTextNodes("Select a model").forEach(label => {
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

  function findModelSelectorSurfaces() {
    const all = [
      ...findCompactModelRoots().map(root => ({ root, kind: surfaceKind(root) })),
      ...findExploreModelRoots().map(root => ({ root, kind: "explore" }))
    ];

    const seen = new Set();
    return all.filter(surface => {
      if (!surface.root || seen.has(surface.root)) return false;
      seen.add(surface.root);
      return true;
    });
  }

  function findModelSelectorRoots() {
    return findModelSelectorSurfaces().map(surface => surface.root);
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

  function hideUpgradePopups() {
    if (DS.state?.settings?.hideModelUpgradeButtons === false) return;
    DS.qsa("[role='dialog'], [aria-modal='true'], div.fixed").forEach(el => {
      if (!isVisible(el)) return;
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
        DS.hideElement?.(el, "model-selector:upgrade-popup");
      }
    });
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
    await DS.storageSet?.({ settings: { ...DS.state.settings } });
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
        saveFavoriteNames(current).then(() => DS.applyModelSelectorTools?.());
      }, true);

      const { parent, before } = favoriteButtonHost(entry);
      parent.insertBefore(button, before);
    }

    button.dataset.dsModelName = entry.name;
    const favorite = favoriteNames.some(name => norm(name) === norm(entry.name));
    button.textContent = favorite ? "♥" : "♡";
    button.classList.toggle("is-favorite", favorite);
    button.title = favorite ? `Unfavorite ${entry.name}` : `Favorite ${entry.name}`;
    button.setAttribute("aria-label", favorite ? `Unfavorite model ${entry.name}` : `Favorite model ${entry.name}`);
    button.setAttribute("aria-pressed", favorite ? "true" : "false");
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
    if (!settings.enabled || !DS.isSingleChatPage?.()) {
      if (DS.state.modelQuickMenuWasActive) cleanupModelQuickMenu();
      DS.state.modelQuickMenuWasActive = false;
      return;
    }

    const surfaces = findModelSelectorSurfaces();
    const roots = surfaces.map(surface => surface.root);

    if (settings.expandModelSelectorDescriptions) roots.forEach(expandDescriptions);

    if (settings.hideModelUpgradeButtons) {
      roots.forEach(hideUpgradeButtons);
      hideUpgradePopups();
    } else {
      cleanupHiddenUpgradeButtons();
    }

    if (settings.customizeModelQuickMenu) {
      DS.state.modelQuickMenuWasActive = true;
      surfaces.forEach(surface => applyModelMenu(surface, settings));
    } else if (DS.state.modelQuickMenuWasActive) {
      cleanupModelQuickMenu();
      DS.state.modelQuickMenuWasActive = false;
    }
  };

  DS.removeModelSelectorQuickMenu = cleanupModelQuickMenu;
})();
