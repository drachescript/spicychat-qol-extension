// Shared visual-only DOM image override helper. Does not store user settings.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS?.customPictureKit) return;
  const roles = new Map();
  let sharedRoots = null;
  let sharing = false;
  function recentMessageRoots() {
    if (sharing && sharedRoots) return sharedRoots;
    const all = document.querySelectorAll("div[id^='message-']");
    const recent = [];
    for (let i = all.length - 1; i >= 0 && recent.length < 80; i--) {
      const root = all[i];
      if (!root.parentElement?.closest?.("div[id^='message-']")) recent.push(root);
    }
    recent.reverse();
    if (sharing) sharedRoots = recent;
    return recent;
  }
  DS.pictureOverrideCore = Object.freeze({
    withSharedRoots(fn) {
      sharing = true;
      try { return fn(); } finally { sharing = false; sharedRoots = null; }
    },
    create(role, isBot, includeHeader = false) {
      const originals = new WeakMap();
      const modified = new Set();
      let lastRoute = "";
      let lastSource = "";
      let lastScan = 0;
      function clear() {
        for (const img of modified) {
          if (img.isConnected) {
            const original = originals.get(img);
            if (original !== undefined && img.getAttribute("src") !== original) img.setAttribute("src", original);
          }
          modified.delete(img);
          originals.delete(img);
        }
        lastSource = "";
      }
      function apply(source, force = false) {
        const route = DS.customPictureKit.chatKey();
        if (!route || !source) { clear(); lastRoute = route; return; }
        const now = Date.now();
        if (!force && route === lastRoute && source === lastSource && now - lastScan < 3500) return;
        lastScan = now;
        if (lastRoute !== route) { clear(); lastRoute = route; }
        lastSource = source;
        const targets = [];
        const roots = recentMessageRoots();
        for (const root of roots) {
          const bot = !!root.querySelector("a[href*='/chatbot/'], a[aria-label='chatbot-profile']");
          if (bot !== isBot) continue;
          const img = root.querySelector("button img[alt], button img[src]");
          if (img) targets.push(img);
        }
        if (includeHeader) {
          const header = document.querySelector("a[aria-label='chatbot-profile']");
          const img = header?.parentElement?.parentElement?.querySelector("button img");
          if (img) targets.push(img);
        }
        const active = new Set(targets);
        for (const img of [...modified]) {
          if (active.has(img) && img.isConnected) continue;
          if (img.isConnected) {
            const old = originals.get(img);
            if (old !== undefined) img.setAttribute("src", old);
          }
          originals.delete(img); modified.delete(img);
        }
        for (const img of targets) {
          if (!originals.has(img)) originals.set(img, img.getAttribute("src") || "");
          if (img.getAttribute("src") !== source) img.setAttribute("src", source);
          modified.add(img);
        }
      }
      const controller = Object.freeze({ apply, clear });
      roles.set(role, controller);
      return controller;
    }
  });
})();
}
