// Stage 7: shared runtime helper. No optional work starts before main runtime startup.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainEssentialChatControls = ({ runtimeCounters }) => {
  // Essential chat controls must not wait for the ~20s message-decoration
  // quiet window. This pass touches only the latest few native message roots.
  let essentialChatControlsPending = false;
  const essentialChatDirtyRoots = new Set();
  function repairEssentialChatControls(source = "mount") {
    if (DS.isQolPausedForTab?.() || !DS.state?.settings?.enabled || !DS.isSingleChatPage?.()) return;
    const settings = DS.state.settings;
    try {
      if (settings.replaceChatImageWithOocButton) DS.applyEssentialOocShortcut?.();
      // Message mounts should not rebuild the Mini Panel/OOC template picker.
      // Critical Settings/route passes still reconcile it when preferences change.
      if ((settings.showOocTools || settings.quickPanelShowOoc) &&
          !document.getElementById("ds-qol-ooc-row")) DS.applyOocTools?.();
      const newRoots = [...essentialChatDirtyRoots].filter(root => root?.isConnected);
      essentialChatDirtyRoots.clear();
      // Only the native roots touched by this MutationObserver delivery.
      // The cached newest roots are used only for the first startup pass.
      const roots = newRoots.length ? newRoots.slice(-8) : (DS.getLoadedMessageRoots?.() || []).slice(-8);
      for (const root of roots) DS.repairMessageToolbarForRoot?.(root);
      if (settings.enableMessageBookmarks && roots.length) DS.reconcileChatBookmarkStars?.(roots);
      DS.diagPerformance?.("essential-controls", { source, inspected: Math.min(8, roots.length) });
    } catch (error) {
      DS.runtimeLog?.("warn", "essential-controls", String(error?.message || error));
    }
  }
  function scheduleEssentialChatControls(source = "mount", roots = []) {
    for (const root of roots) if (root?.isConnected) essentialChatDirtyRoots.add(root);
    // A large history insertion can mount hundreds of native messages before
    // the frame callback runs. Only the latest controls need urgent repair;
    // older roots remain eligible for the normal incremental message lane.
    if (essentialChatDirtyRoots.size > 24) {
      const latest = [...essentialChatDirtyRoots].slice(-16);
      essentialChatDirtyRoots.clear();
      for (const root of latest) essentialChatDirtyRoots.add(root);
      const perf = runtimeCounters();
      perf.essentialControlBacklogsTrimmed = Number(perf.essentialControlBacklogsTrimmed || 0) + 1;
    }
    if (essentialChatControlsPending || DS.isQolPausedForTab?.()) return;
    essentialChatControlsPending = true;
    // Targeted once per animation frame; never a full-message scan.
    requestAnimationFrame(() => {
      essentialChatControlsPending = false;
      repairEssentialChatControls(source);
    });
  }

  function clearEssentialChatDirtyRoots() { essentialChatDirtyRoots.clear(); }
    return { repairEssentialChatControls, scheduleEssentialChatControls, clearEssentialChatDirtyRoots };
  };
})();
}
