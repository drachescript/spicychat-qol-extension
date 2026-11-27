// Shared Custom Pictures storage and safe image helpers. No feature UI or scanning.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const STORE_KEY = "chatBackgroundMediaV1";
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_SCENE_BYTES = 1.5 * 1024 * 1024;
  const MAX_SCENES_PER_CHAT = 6;
  const MAX_GALLERY_DATA_CHARS = 24 * 1024 * 1024;
  // Keep portraits clearly visible without forcing the viewport-wide crop of cover.
  let mediaStore = { global:null, chats:{}, galleries:{}, suppressedChats:{}, avatarSizes:{}, avatarSideCopies:{}, viewModes:{}, portraits:{}, personaPictures:{}, pictureLibrary:[] };
  let mediaLoaded = false;
  let mediaLoadPromise = null;
  let mediaRevision = 0;
  let readRetryAfter = 0;
  let readFailures = 0;

  function safeBackgroundUrl(value) {
    try {
      const u = new URL(String(value || "").trim());
      if (u.protocol !== "https:" || u.username || u.password || u.href.length > 2048) return "";
      if (!u.hostname || /^(localhost|.*\.localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$)/i.test(u.hostname)) return "";
      return u.href;
    } catch { return ""; }
  }

  function cleanStore(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const cleanItem = item => {
      if (!item || typeof item !== "object") return null;
      const dataUrl = String(item.dataUrl || "");
      const url = safeBackgroundUrl(item.url || "");
      const sourceUrl = safeBackgroundUrl(item.sourceUrl || url);
      const sourceMode = item.sourceMode === "link" ? "link" : "local";
      if (sourceMode === "link" ? !url : !dataUrl.startsWith("data:image/")) return null;
      return {
        ...(sourceMode === "local" ? { dataUrl } : { url }),
        ...(sourceUrl ? { sourceUrl } : {}), sourceMode,
        name: String(item.name || "Background image").slice(0, 180),
        updatedAt: Number(item.updatedAt) || Date.now()
      };
    };
    const chats = {};
    for (const [key, item] of Object.entries(input.chats || {})) {
      const clean = cleanItem(item);
      if (clean && key) chats[String(key).slice(0, 260)] = clean;
    }
    const galleries = {};
    for (const [key, gallery] of Object.entries(input.galleries || {})) {
      const items = (Array.isArray(gallery?.items) ? gallery.items : []).slice(0, MAX_SCENES_PER_CHAT)
        .map(item => { const cleaned = cleanItem(item); return cleaned ? { ...cleaned, id: String(item.id || "").slice(0, 80) } : null; })
        .filter(item => item?.id);
      if (key && items.length) galleries[String(key).slice(0, 260)] = { activeId: String(gallery.activeId || "").slice(0, 80), items };
    }
    // A cleared chat must stay clear even when a global image or automatic
    // avatar would otherwise take over. Never delete global/gallery images.
    const suppressedChats = {};
    for (const [key, value] of Object.entries(input.suppressedChats || {})) {
      if (key && value === true) suppressedChats[String(key).slice(0, 260)] = true;
    }
    const avatarSizes = {};
    for (const [key, value] of Object.entries(input.avatarSizes || {})) {
      const percent = Number(value);
      if (key && Number.isFinite(percent) && percent >= 30 && percent <= 150) {
        avatarSizes[String(key).slice(0, 260)] = Math.round(percent);
      }
    }
    const avatarSideCopies = {};
    for (const [key, enabled] of Object.entries(input.avatarSideCopies || {})) {
      if (key && enabled === true) avatarSideCopies[String(key).slice(0, 260)] = true;
    }
    // Per-chat display choices, independent of the saved image (local, URL,
    // global or gallery). Never let imported values become arbitrary CSS.
    const viewModes = {};
    for (const [key, inputMode] of Object.entries(input.viewModes || {})) {
      if (!key || !inputMode || typeof inputMode !== "object") continue;
      const fit = ["cover", "contain", "tile"].includes(inputMode.fit) ? inputMode.fit : "";
      const position = ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"].includes(inputMode.position) ? inputMode.position : "";
      if (fit || position) viewModes[String(key).slice(0, 260)] = { ...(fit ? { fit } : {}), ...(position ? { position } : {}) };
    }
    const cleanChatPictures = source => {
      const output = {};
      for (const [key, value] of Object.entries(source || {})) {
        const item = cleanItem(value);
        if (key && item) output[String(key).slice(0, 260)] = { ...item, note: String(value.note || "").slice(0, 1200) };
      }
      return output;
    };
    const pictureLibrary = (Array.isArray(input.pictureLibrary) ? input.pictureLibrary : [])
      .slice(0, 30).map(value => {
        const item = cleanItem(value);
        return item ? { ...item, id: String(value.id || "").slice(0, 90) } : null;
      }).filter(item => item?.id);
    return { global: cleanItem(input.global), chats, galleries, suppressedChats, avatarSizes, avatarSideCopies, viewModes,
      portraits: cleanChatPictures(input.portraits), personaPictures: cleanChatPictures(input.personaPictures), pictureLibrary };
  }

  // DS.storageGet intentionally converts runtime errors into empty objects.
  // For a large saved picture library that is unsafe: a failed read must not
  // become a cached empty library or a subsequent destructive save.
  async function readMediaStore() {
    await DS.flushStorageWrites?.();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error || !result || typeof result !== "object") reject(new Error("Could not read saved pictures. Try again."));
        else resolve(result[STORE_KEY]);
      };
      const timer = setTimeout(() => finish(true), 8000);
      try {
        const pending = chrome.storage.local.get([STORE_KEY], result => {
          finish(!!chrome.runtime?.lastError, result);
        });
        if (pending && typeof pending.then === "function") pending.then(result => finish(false, result), () => finish(true));
      } catch { finish(true); }
    });
  }
  async function loadStore(force = false) {
    if (mediaLoadPromise) return mediaLoadPromise;
    if (mediaLoaded && !force) return mediaStore;
    if (!force && Date.now() < readRetryAfter) throw new Error("Saved pictures temporarily unavailable.");
    const revision = mediaRevision;
    mediaLoadPromise = (async () => {
      const raw = await readMediaStore();
      // A storage change or completed write received while reading is newer.
      if (revision === mediaRevision) {
        mediaStore = cleanStore(raw);
        mediaLoaded = true;
      }
      return mediaStore;
    })();
    try {
      const result = await mediaLoadPromise;
      readFailures = 0; readRetryAfter = 0;
      return result;
    } catch (error) {
      readFailures++;
      readRetryAfter = Date.now() + Math.min(30000, 500 * 2 ** Math.min(readFailures - 1, 6));
      throw error;
    } finally { mediaLoadPromise = null; }
  }

  async function saveStore(next) {
    if (!mediaLoaded) throw new Error("Saved pictures have not been loaded. Reopen Custom Pictures and try again.");
    const normalized = cleanStore(next);
    const ok = await DS.storageSet?.({ [STORE_KEY]: normalized });
    if (!ok) throw new Error("Browser storage rejected the background image");
    mediaRevision++;
    mediaStore = normalized;
    mediaLoaded = true;
    return mediaStore;
  }

  function chatKey() {
    if (!DS.isSingleChatPage?.()) return "";
    return String(location.pathname || "").replace(/\/+$/, "");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }


  async function choosePictureFile() {
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/*";
    input.style.display = "none"; document.body.appendChild(input);
    const file = await new Promise(resolve => {
      input.addEventListener("change", () => resolve(input.files?.[0] || null), { once: true });
      input.addEventListener("cancel", () => resolve(null), { once: true });
      input.click();
    });
    input.remove();
    if (!file) return null;
    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES)
      throw new Error("Select an image under 8 MB.");
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl.startsWith("data:image/")) throw new Error("Invalid image file.");
    return { dataUrl, name: file.name.slice(0, 180), sourceMode: "local", updatedAt: Date.now() };
  }

  function appendButton(parent, label, handler) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await handler(); }
      catch (error) { DS.setQuickStatus?.(error?.message || "Could not update picture."); }
      finally { button.disabled = false; }
    });
    parent.appendChild(button);
    return button;
  }

  const tabs = new Map();
  const applyHooks = new Map();
  const supportedTabs = new Set(["backgrounds", "character", "persona", "library", "generation"]);
  function registerTab(id, label, featureId, settingKey, render) {
    if (!supportedTabs.has(id) || typeof render !== "function") return;
    tabs.set(id, { id, label, featureId, settingKey, render });
  }
  function availableTabs(settings = DS.state?.settings || {}) {
    if (!settings.enabled) return [];
    return [...tabs.values()].filter(tab =>
      DS.featureBuildProfile?.isInstalled?.(tab.featureId) !== false && !!settings[tab.settingKey]);
  }
  const kit = Object.freeze({
    key: STORE_KEY, getStore: () => mediaStore, loadStore, saveStore,
    chatKey, safeBackgroundUrl, fileToDataUrl, choosePictureFile,
    pictureUrl: item => item?.dataUrl || item?.url || "",
    appendButton, registerTab, availableTabs,
    registerApply: (name, hook) => { if (typeof hook === "function") applyHooks.set(name, hook); },
    applyHooks: () => [...applyHooks.values()],
    isInstalled: name => DS.featureBuildProfile?.isInstalled?.(name) !== false,
    reopen: name => DS.openCustomPicturesMenu?.(name),
    close: () => document.getElementById("ds-chat-background-dialog")?.remove()
  });
  DS.customPictureKit = kit;
  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes?.[STORE_KEY]) return;
      mediaRevision++;
      readFailures = 0; readRetryAfter = 0;
      mediaStore = cleanStore(changes[STORE_KEY].newValue);
      mediaLoaded = true;
      DS.applyChatBackgrounds?.();
    });
  } catch {}
})();
}
