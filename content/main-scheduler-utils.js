// Pure main scheduler and storage-delta utilities, initialized before main.js.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  function normalizeSlowDirtyGroups(groups) {
    if (groups == null) return [];
    const list = Array.isArray(groups) ? groups : [groups];
    return [...new Set(list.map(value => String(value || "").trim()).filter(Boolean))];
  }

  function slowDirtyHas(dirty, ...groups) {
    if (!dirty?.size) return false;
    if (dirty.has("all")) return true;
    return groups.some(group => dirty.has(group));
  }

  function blockedStoreIdentitySet(value) {
    const raw = value && typeof value === "object" ? value : {};
    const result = new Set();
    for (const id of Array.isArray(raw.ids) ? raw.ids : []) {
      const normalized = String(id || "").trim().toLowerCase();
      if (normalized) result.add(`id:${normalized}`);
    }
    for (const name of Array.isArray(raw.names) ? raw.names : []) {
      const normalized = String(name || "").trim().toLowerCase();
      if (normalized) result.add(`name:${normalized}`);
    }
    return result;
  }

  function blockedStoreChangeStats(change) {
    const before = blockedStoreIdentitySet(change?.oldValue);
    const after = blockedStoreIdentitySet(change?.newValue);
    let added = 0;
    let removed = 0;
    for (const value of after) if (!before.has(value)) added += 1;
    for (const value of before) if (!after.has(value)) removed += 1;
    return { added, removed };
  }

  window.DragonScriptQoL.mainSchedulerUtils = Object.freeze({ normalizeSlowDirtyGroups, slowDirtyHas, blockedStoreChangeStats });
})();
}
