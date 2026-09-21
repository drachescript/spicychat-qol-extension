(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const STORAGE_KEY = "myCreationsViewState";
  const SORT_LABEL_RE = /\b(recent|newest|oldest|active|popular|message|messages|name|updated|created|ascending|descending)\b/i;
  let saveTimer = null;
  let restorePromise = null;
  let captureTimer = null;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeFilters(value) {
    const source = value && typeof value === "object" ? value : {};
    const allowed = {
      visibility: new Set(["all", "public", "unlisted", "private", "unknown"]),
      messages: new Set(["all", "0", "1-9", "10-49", "50-99", "100-499", "500-999", "1000+", "unknown"]),
      lorebook: new Set(["all", "has", "missing"]),
      definition: new Set(["all", "visible", "hidden", "unknown"]),
      tokens: new Set(["all", "0-999", "1000-1999", "2000-2399", "2400+", "unknown"]),
      recent: new Set(["all", "24h", "7d", "30d", "seen", "unseen"]),
      workflow: new Set(["all", "attention", "audit", "needs-work", "testing", "finished", "no-status"]),
      sort: new Set(["native", "recent", "messages-desc", "messages-asc", "tokens-desc", "tokens-asc", "name"])
    };

    const out = {};
    for (const [key, values] of Object.entries(allowed)) {
      const next = clean(source[key]);
      if (values.has(next)) out[key] = next;
    }
    return out;
  }

  function normalizeState(value) {
    const source = value && typeof value === "object" ? value : {};
    const native = source.nativeSort && typeof source.nativeSort === "object" ? source.nativeSort : {};
    const label = clean(native.label).slice(0, 80);
    const nativeSort = label ? {
      label,
      value: clean(native.value).slice(0, 120)
    } : null;

    return {
      nativeSort,
      filters: normalizeFilters(source.filters),
      savedAt: Number(source.savedAt) || 0
    };
  }

  async function ensureLoaded() {
    if (DS.state.myCreationsViewStateLoaded) return DS.state.myCreationsViewState;
    const result = await DS.storageGet([STORAGE_KEY]);
    DS.state.myCreationsViewState = normalizeState(result?.[STORAGE_KEY]);
    DS.state.myCreationsViewStateLoaded = true;
    return DS.state.myCreationsViewState;
  }

  function queueSave() {
    if (!DS.state.settings?.rememberMyCreationsView) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      const next = normalizeState({
        ...(DS.state.myCreationsViewState || {}),
        savedAt: Date.now()
      });
      DS.state.myCreationsViewState = next;
      try {
        await DS.storageSet({ [STORAGE_KEY]: next });
      } catch {
        // View memory is convenience-only; never interrupt the page if storage fails.
      }
    }, 120);
  }

  function toolbarHost() {
    return document.querySelector("[data-testid='BotListToolbarV2-Dropdowns']") || null;
  }

  function canonicalSortLabel(value) {
    return clean(value)
      .replace(/^(?:sort|order)(?:\s+by)?\s*:?\s*/i, "")
      .replace(/^show\s+/i, "")
      .trim();
  }

  function looksLikeSortLabel(value) {
    return SORT_LABEL_RE.test(canonicalSortLabel(value));
  }

  function selectedOptionLabel(select) {
    return canonicalSortLabel(select?.selectedOptions?.[0]?.textContent || select?.options?.[select?.selectedIndex]?.textContent || "");
  }

  function selectLooksLikeSort(select) {
    const aria = clean(`${select.getAttribute("aria-label") || ""} ${select.name || ""} ${select.id || ""}`);
    if (/sort|order/i.test(aria)) return true;
    const labels = [...(select.options || [])].map(option => clean(option.textContent)).filter(Boolean);
    return labels.filter(looksLikeSortLabel).length >= 2;
  }

  function buttonScore(button) {
    const text = clean(button.textContent);
    const meta = clean([
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.getAttribute("data-testid"),
      button.id
    ].filter(Boolean).join(" "));

    let score = 0;
    if (/sort|order/i.test(meta)) score += 8;
    if (looksLikeSortLabel(text)) score += 5;
    if (/filter|visibility|status|tag|lorebook/i.test(meta)) score -= 5;
    if (text.length > 80) score -= 3;
    return score;
  }

  function findNativeSortControl() {
    const host = toolbarHost();
    if (!host) return null;

    for (const select of host.querySelectorAll("select")) {
      if (!selectLooksLikeSort(select)) continue;
      return {
        type: "select",
        el: select,
        label: selectedOptionLabel(select),
        value: clean(select.value)
      };
    }

    const buttons = [...host.querySelectorAll("button, [role='button']")]
      .filter(el => !el.closest(".ds-my-creations-filter-root"))
      .map(el => ({ el, score: buttonScore(el) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!buttons.length) return null;
    const el = buttons[0].el;
    return {
      type: "button",
      el,
      label: canonicalSortLabel(el.textContent),
      value: clean(el.getAttribute("data-value") || el.getAttribute("value") || "")
    };
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return el.getClientRects().length > 0;
  }

  function exactTextMatch(el, label) {
    if (!el || el === document.body) return false;
    return canonicalSortLabel(el.textContent).toLowerCase() === canonicalSortLabel(label).toLowerCase();
  }

  function findOpenMenuChoice(label, trigger) {
    const containers = [
      ...document.querySelectorAll("[role='menu'], [role='listbox'], [data-radix-menu-content], [data-radix-popper-content-wrapper] [data-state='open']")
    ].filter(isVisible);

    const selector = "[role='menuitem'], [role='option'], [data-radix-collection-item], button";
    for (const container of containers) {
      for (const candidate of container.querySelectorAll(selector)) {
        if (candidate === trigger || !isVisible(candidate)) continue;
        if (exactTextMatch(candidate, label)) return candidate;
      }
    }

    // Fallback for custom menus that do not expose menu/listbox roles.
    for (const candidate of document.querySelectorAll(selector)) {
      if (candidate === trigger || !isVisible(candidate)) continue;
      if (!exactTextMatch(candidate, label)) continue;
      const rect = candidate.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      return candidate;
    }
    return null;
  }

  function applySelectChoice(control, remembered) {
    const select = control.el;
    const target = [...select.options].find(option => {
      const labelMatches = canonicalSortLabel(option.textContent).toLowerCase() === remembered.label.toLowerCase();
      const valueMatches = remembered.value && clean(option.value) === remembered.value;
      return valueMatches || labelMatches;
    });
    if (!target || select.value === target.value) return !!target;
    select.value = target.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function applyButtonChoice(control, remembered) {
    const current = clean(control.label).toLowerCase();
    if (current === remembered.label.toLowerCase()) return true;

    try {
      control.el.click();
    } catch {
      return false;
    }

    for (const delay of [40, 80, 140, 220]) {
      await wait(delay);
      const option = findOpenMenuChoice(remembered.label, control.el);
      if (!option) continue;
      try {
        option.click();
        return true;
      } catch {
        return false;
      }
    }

    // Avoid leaving a dropdown hanging open when the remembered option no longer exists.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }

  async function restoreNativeSort() {
    if (restorePromise) return restorePromise;
    restorePromise = (async () => {
      const rememberedState = await ensureLoaded();
      const remembered = rememberedState.nativeSort;
      if (!remembered?.label) return false;

      let control = null;
      for (const delay of [0, 120, 250, 450, 800]) {
        if (delay) await wait(delay);
        control = findNativeSortControl();
        if (control) break;
      }
      if (!control) return false;

      if (clean(control.label).toLowerCase() === remembered.label.toLowerCase()) return true;
      if (control.type === "select") return applySelectChoice(control, remembered);
      return applyButtonChoice(control, remembered);
    })();

    try {
      return await restorePromise;
    } finally {
      restorePromise = null;
    }
  }

  async function captureNativeSort() {
    if (!DS.state.settings?.rememberMyCreationsView || !DS.isMyCreationsChatbotsPage?.()) return;
    if (!DS.state.myCreationsNativeSortReady) return;
    const control = findNativeSortControl();
    if (!control || !clean(control.label)) return;

    const current = await ensureLoaded();
    const next = {
      label: canonicalSortLabel(control.label).slice(0, 80),
      value: clean(control.value).slice(0, 120)
    };
    if (current.nativeSort?.label === next.label && current.nativeSort?.value === next.value) return;
    current.nativeSort = next;
    queueSave();
  }

  function scheduleCapture() {
    clearTimeout(captureTimer);
    captureTimer = setTimeout(() => {
      captureTimer = null;
      captureNativeSort().catch(() => {});
    }, 220);
  }


  function ensureToolbarObserver() {
    const host = toolbarHost();
    if (!host) return;
    if (DS.state.myCreationsViewObservedToolbar === host && DS.state.myCreationsViewToolbarObserver) return;

    try {
      DS.state.myCreationsViewToolbarObserver?.disconnect?.();
    } catch {}

    const observer = new MutationObserver(mutations => {
      if (!DS.state.myCreationsNativeSortReady) return;
      if (!DS.mutationsHaveNativeChanges?.(mutations)) return;
      scheduleCapture();
    });
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    DS.state.myCreationsViewToolbarObserver = observer;
    DS.state.myCreationsViewObservedToolbar = host;
  }

  function installListeners() {
    if (DS.state.myCreationsViewMemoryListeners) return;
    DS.state.myCreationsViewMemoryListeners = true;

    document.addEventListener("change", event => {
      if (!DS.state.settings?.rememberMyCreationsView || !DS.isMyCreationsChatbotsPage?.()) return;
      const host = toolbarHost();
      if (!host || !host.contains(event.target)) return;
      scheduleCapture();
    }, true);

    document.addEventListener("click", event => {
      if (!DS.state.settings?.rememberMyCreationsView || !DS.isMyCreationsChatbotsPage?.()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(".ds-my-creations-filter-root")) return;
      const host = toolbarHost();
      const clickedToolbar = !!host?.contains(target);
      const clickedMenuChoice = !!target.closest("[role='menuitem'], [role='option'], [data-radix-collection-item]");
      if (clickedToolbar || clickedMenuChoice) scheduleCapture();
    }, true);
  }

  DS.getRememberedMyCreationsFilters = async function getRememberedMyCreationsFilters() {
    if (!DS.state.settings?.rememberMyCreationsView) return null;
    const saved = await ensureLoaded();
    return { ...saved.filters };
  };

  DS.saveRememberedMyCreationsFilters = function saveRememberedMyCreationsFilters(filters) {
    if (!DS.state.settings?.rememberMyCreationsView) return;
    ensureLoaded().then(saved => {
      saved.filters = normalizeFilters(filters);
      queueSave();
    }).catch(() => {});
  };

  DS.applyMyCreationsViewMemory = async function applyMyCreationsViewMemory() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.rememberMyCreationsView || !DS.isMyCreationsChatbotsPage?.()) {
      DS.state.myCreationsNativeSortReady = false;
      DS.state.myCreationsNativeSortVisit = "";
      return;
    }

    installListeners();
    ensureToolbarObserver();
    await ensureLoaded();

    const visitKey = `${location.pathname}${location.search}`;
    if (DS.state.myCreationsNativeSortVisit !== visitKey) {
      DS.state.myCreationsNativeSortReady = false;
      DS.state.myCreationsNativeSortVisit = visitKey;
      await restoreNativeSort();
      DS.state.myCreationsNativeSortReady = true;
    }
  };

  DS.removeMyCreationsViewMemory = function removeMyCreationsViewMemory() {
    DS.state.myCreationsNativeSortReady = false;
    DS.state.myCreationsNativeSortVisit = "";
    try {
      DS.state.myCreationsViewToolbarObserver?.disconnect?.();
    } catch {}
    DS.state.myCreationsViewToolbarObserver = null;
    DS.state.myCreationsViewObservedToolbar = null;
  };
})();
