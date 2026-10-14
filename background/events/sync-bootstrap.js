"use strict";
// Feature/event-owned registration; invoked in original order by background-events.js.
function registerQolBackgroundSyncBootstrap() {
try {
  if (typeof importScripts === "function") {
    importScripts("shared/sync-service.js");
  } else if (typeof document !== "undefined") {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("shared/sync-service.js");
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }
} catch (error) {
  console.warn("[SpicyChat QoL] Sync service failed to load", error);
}
}
