// Stage 7: scoped settings invalidation. No listeners and no persistent data writes.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  function changedSettingNames(changes = {}) {
    const names = new Set();
    const prefix = "dsSettingV1:";
    for (const key of Object.keys(changes || {})) {
      if (String(key).startsWith(prefix)) names.add(String(key).slice(prefix.length));
    }
    const monolithic = changes.settings;
    if (monolithic) {
      const oldValue = monolithic.oldValue && typeof monolithic.oldValue === "object" ? monolithic.oldValue : {};
      const newValue = monolithic.newValue && typeof monolithic.newValue === "object" ? monolithic.newValue : {};
      for (const key of new Set([...Object.keys(oldValue), ...Object.keys(newValue)])) {
        try {
          if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) names.add(key);
        } catch { names.add(key); }
      }
    }
    return names;
  }

  function slowDirtyForSettingChanges(changes = {}) {
    const names = changedSettingNames(changes);
    if (!names.size) return ["all"];
    const modelKeys = new Set(["expandModelSelectorDescriptions", "hideModelUpgradeButtons", "customizeModelQuickMenu", "modelFavoriteNames", "modelHiddenNames", "modelQuickFavoritesOnly"]);
    const advertKeys = new Set(["hideAdvertBanners"]);
    const dirty = new Set();
    let hasOther = false;
    for (const name of names) {
      if (modelKeys.has(name)) dirty.add("model");
      else if (advertKeys.has(name)) dirty.add("adverts");
      else hasOther = true;
    }
    if (names.has("hideAdvertBanners")) DS.markAdvertBannerDirty?.("settings-change");
    if ([...names].some(name => modelKeys.has(name))) DS.markModelSelectorDirty?.("settings-change");
    if (hasOther) return ["all"];
    return dirty.size ? [...dirty] : ["all"];
  }

  DS.mainStorageDirtyGroups = { changedSettingNames, slowDirtyForSettingChanges };
})();
}
