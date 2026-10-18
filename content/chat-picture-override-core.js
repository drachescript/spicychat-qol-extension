// Shared visual-only DOM image override helper. Does not store user settings.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS?.customPictureKit) return;
  const roles = new Map();
  DS.pictureOverrideCore = Object.freeze({
    create(role, isBot, includeHeader = false) {
      const originals = new WeakMap();
      const modified = new Set();
      let lastRoute = "";
      let lastSignature = "";
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
        lastSignature = "";
      }
      function apply(source, force = false) {
        const route = DS.customPictureKit.chatKey();
        if (!route || !source) { clear(); lastRoute = route; return; }
        const signature = `${route}|${source.length}|${source.slice(0, 90)}`;
        const now = Date.now();
        if (!force && signature === lastSignature && now - lastScan < 3500) return;
        lastScan = now;
        if (lastRoute !== route) { clear(); lastRoute = route; }
        lastSignature = signature;
        const targets = [];
        const roots = [...document.querySelectorAll("div[id^='message-']")]
          .filter(root => !root.parentElement?.closest?.("div[id^='message-']")).slice(-80);
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
