"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundSyncBootstrap() {
try {
  if (typeof importScripts === "function") {
    importScripts("shared/sync-service.js");
  } else if (typeof document !== "undefined") {
    // New Firefox packages load the sync handler as a static background script.
    // Keep the legacy loader as a fallback for older/custom packages, without
    // registering two sets of listeners when static loading is available.
    const staticallyLoaded = chrome.runtime.getManifest?.()?.background?.scripts?.includes("shared/sync-service.js");
    if (staticallyLoaded) return;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("shared/sync-service.js");
    script.async = false;
    script.onerror = () => console.warn("[SpicyChat QoL] Firefox sync background script did not load");
    (document.head || document.documentElement).appendChild(script);
  }
} catch (error) {
  console.warn("[SpicyChat QoL] Sync service failed to load", error);
}
}
