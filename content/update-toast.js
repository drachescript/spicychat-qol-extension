(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const KEY = "lastSeenQolVersion";
  const LEGACY_VERSION_KEY = "dsLastSeenReleaseVersion";
  const ID = "ds-update-toast";

  DS.maybeShowUpdateToast = async function maybeShowUpdateToast() {
    const version = chrome.runtime?.getManifest?.().version || "";
    if (!version) return;
    const result = await DS.storageGet?.([KEY, LEGACY_VERSION_KEY]);
    const previous = String(result?.[KEY] || result?.[LEGACY_VERSION_KEY] || "");
    if (!previous) {
      await DS.storageSet?.({ [KEY]: version });
      return;
    }
    if (previous === version) return;
    await DS.storageSet?.({ [KEY]: version });
    if (DS.state?.settings?.enabled === false || DS.state?.settings?.showUpdateNotifications === false) return;

    document.getElementById(ID)?.remove();
    const toast = document.createElement("div");
    toast.id = ID;

    const message = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `SpicyChat QoL updated to v${version}`;
    const summary = document.createElement("span");
    summary.textContent = "New features, fixes and performance improvements are ready.";
    message.append(title, summary);
    toast.appendChild(message);

    const actions = document.createElement("div");
    actions.className = "ds-update-toast-actions";
    const whatsNew = document.createElement("button"); whatsNew.type = "button"; whatsNew.textContent = "What's new";
    const dismiss = document.createElement("button"); dismiss.type = "button"; dismiss.textContent = "Dismiss";
    whatsNew.addEventListener("click", () => {
      DS.openOptionsTarget?.("changelog");
      toast.remove();
    });
    dismiss.addEventListener("click", () => toast.remove());
    actions.append(whatsNew, dismiss); toast.appendChild(actions); document.documentElement.appendChild(toast);
  };
})();
