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

  async function loadStore(force = false) {
    if (mediaLoaded && !force) return mediaStore;
    if (mediaLoadPromise && !force) return mediaLoadPromise;
    mediaLoadPromise = (async () => {
      try {
        const result = await DS.storageGet?.([STORE_KEY]);
        mediaStore = cleanStore(result?.[STORE_KEY]);
      } catch {
        mediaStore = cleanStore(null);
      }
      mediaLoaded = true;
      mediaLoadPromise = null;
      return mediaStore;
    })();
    return mediaLoadPromise;
  }

  async function saveStore(next) {
    const normalized = cleanStore(next);
    const ok = await DS.storageSet?.({ [STORE_KEY]: normalized });
    if (!ok) throw new Error("Browser storage rejected the background image");
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
      mediaStore = cleanStore(changes[STORE_KEY].newValue);
      mediaLoaded = true;
      DS.applyChatBackgrounds?.();
    });
  } catch {}
})();
}
