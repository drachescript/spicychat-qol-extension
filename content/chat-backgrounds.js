// No optional feature initialization on a tab whose QoL switch is paused.
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
  const DEFAULT_AVATAR_SIZE = 100;
  // Only the original CDN URL is used by default. If it is unavailable,
  // fall back once to a moderately sized CDN derivative (never a tiny avatar).
  const avatarImageChecks = new Map();
  let mediaStore = { global: null, chats: {}, galleries: {}, suppressedChats: {}, avatarSizes: {}, avatarSideCopies: {}, viewModes: {}, portraits: {}, personaPictures: {}, pictureLibrary: [] };
  let activePictureTab = "backgrounds";
  const originalPictureSources = new WeakMap();
  const touchedPictureNodes = new Set();
  let lastPictureRoute = "";
  let lastPictureSource = "";
  let lastPictureScanAt = 0;
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

  function avatarFromChatHeader() {
    const profile = document.querySelector("a[aria-label='chatbot-profile'][href*='/chatbot/']");
    // SpicyChat 4.6 places the avatar beside the name-link column. Search
    // only the header row so a message or the user's avatar cannot be chosen.
    const headerRow = profile?.closest(".ds-chat-topbar-creator-line")?.parentElement
      || profile?.parentElement?.parentElement;
    const image = profile?.querySelector("img") || headerRow?.querySelector("img") || null;
    const source = image?.currentSrc || image?.src || "";
    if (!source) return null;
    try {
      const url = new URL(source, location.href);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      if (!DS.state?.settings?.chatBackgroundAnimateAvatar && /\.gif$/i.test(url.pathname)) return null;

      let fallbackUrl = "";
      if (url.hostname === "cdn.nd-api.com" && url.pathname.startsWith("/avatars/")) {
        // Chat header images use ?class=avatar48x48. Enlarging that thumbnail
        // produces severe pixelation. Ask the CDN for the original instead.
        url.searchParams.delete("class");
        // This derivative is only used if the original really cannot load.
        const fallback = new URL(url.href);
        fallback.searchParams.set("class", "image500x650");
        fallbackUrl = fallback.href;
      }
      return { url: url.href, fallbackUrl, name: "Character avatar", avatar: true };
    } catch { return null; }
  }

  function usableAvatarUrl(item) {
    if (!item.avatar || !item.fallbackUrl) return item.dataUrl || item.url;
    const status = avatarImageChecks.get(item.url);
    if (status === "failed") return item.fallbackUrl;
    if (!status) {
      // Image requests share browser cache with the CSS background. Check
      // once per URL so a broken original can fall back without looping.
      avatarImageChecks.set(item.url, "loading");
      const probe = new Image();
      probe.onload = () => avatarImageChecks.set(item.url, "loaded");
      probe.onerror = () => {
        avatarImageChecks.set(item.url, "failed");
        if (DS.isSingleChatPage?.() && DS.state?.settings?.enableChatBackgrounds) {
          DS.applyChatBackgrounds?.();
        }
      };
      probe.src = item.url;
      // Bound the transient cache on long-lived tabs navigating many chats.
      if (avatarImageChecks.size > 48) avatarImageChecks.delete(avatarImageChecks.keys().next().value);
    }
    return item.url;
  }

  function currentItem() {
    const key = chatKey();
    if (key && mediaStore.suppressedChats?.[key]) return null;
    const gallery = key && DS.state?.settings?.chatSceneGalleriesEnabled ? mediaStore.galleries?.[key] : null;
    const activeScene = gallery?.items?.find(item => item.id === gallery.activeId) || null;
    const custom = (key && mediaStore.chats?.[key]) || activeScene || mediaStore.global || null;
    if (custom) return custom;
    return DS.state?.settings?.chatBackgroundUseAvatar ? avatarFromChatHeader() : null;
  }

  function removeLayer() {
    document.getElementById("ds-chat-background-layer")?.remove();
    document.documentElement.classList.remove("ds-chat-custom-background", "ds-chat-bubble-alpha");
    document.documentElement.style.removeProperty("--ds-chat-background-bubble-opacity");
  }

  function removeControl() {
    document.getElementById("ds-chat-background-control")?.remove();
    document.getElementById("ds-chat-background-dialog")?.remove();
  }

  function rgbaDim(percent) {
    const amount = Math.min(0.9, Math.max(0, Number(percent) || 0) / 100);
    return `rgba(0, 0, 0, ${amount.toFixed(3)})`;
  }

  function applyLayer(item) {
    if (!item?.dataUrl && !item?.url) {
      removeLayer();
      return;
    }
    let layer = document.getElementById("ds-chat-background-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "ds-chat-background-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body?.prepend(layer);
    }
    const settings = DS.state?.settings || {};
    const blur = Math.min(30, Math.max(0, Number(settings.chatBackgroundBlur) || 0));
    const dim = rgbaDim(settings.chatBackgroundDim ?? 45);
    const safeUrl = String(usableAvatarUrl(item)).replace(/"/g, "%22");
    const view = mediaStore.viewModes?.[chatKey()] || {};
    const fit = ["cover", "contain", "tile"].includes(view.fit) ? view.fit
      : (["cover", "contain", "tile"].includes(settings.chatBackgroundFit) ? settings.chatBackgroundFit : "cover");
    const position = ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"].includes(view.position) ? view.position
      : (["center", "top", "bottom", "left", "right"].includes(settings.chatBackgroundPosition) ? settings.chatBackgroundPosition : "center");
    if (item.avatar) {
      // Portrait avatar + viewport-wide `cover` scales/crops the face heavily.
      // Keep the dimming gradient full-screen, but size the image separately.
      const key = chatKey();
      const size = mediaStore.avatarSizes?.[key] ?? DEFAULT_AVATAR_SIZE;
      if (mediaStore.avatarSideCopies?.[key]) {
        // Paint the full-size portrait in the middle, then repeat the *same*
        // image horizontally behind it. A gradient dims only the side copies;
        // the full-screen top gradient preserves the user's normal dim value.
        // CSS repeats the cached image without cloning DOM nodes or requests.
        layer.style.backgroundImage = `linear-gradient(${dim}, ${dim}), url("${safeUrl}"), linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.26) 28%, rgba(0,0,0,.26) 72%, rgba(0,0,0,.55)), url("${safeUrl}")`;
        layer.style.backgroundSize = `100% 100%, auto ${size}%, 100% 100%, auto ${size}%`;
        layer.style.backgroundPosition = `center, ${position}, center, ${position}`;
        layer.style.backgroundRepeat = "no-repeat, no-repeat, no-repeat, repeat-x";
      } else {
        layer.style.backgroundImage = `linear-gradient(${dim}, ${dim}), url("${safeUrl}")`;
        layer.style.backgroundSize = `100% 100%, auto ${size}%`;
        layer.style.backgroundPosition = `center, ${position}`;
        layer.style.backgroundRepeat = "no-repeat, no-repeat";
      }
      layer.style.backgroundColor = "#111318";
    } else {
      layer.style.backgroundImage = `linear-gradient(${dim}, ${dim}), url("${safeUrl}")`;
      // Two backgrounds: a full-size dimming gradient, then the chosen image.
      // Retain the existing Fit setting for uploaded/global image backgrounds.
      layer.style.backgroundSize = `100% 100%, ${fit === "tile" ? "auto" : fit}`;
      layer.style.backgroundPosition = `center, ${position}`;
      layer.style.backgroundRepeat = fit === "tile" ? "no-repeat, repeat" : "no-repeat, no-repeat";
      layer.style.backgroundColor = "transparent";
    }
    layer.style.filter = blur ? `blur(${blur}px)` : "none";
    layer.style.transform = blur ? `scale(${1 + Math.min(0.08, blur / 250)})` : "none";
    document.documentElement.classList.add("ds-chat-custom-background");
    const bubbleOpacity = Math.max(.25, Math.min(1, (Number(settings.chatBackgroundBubbleOpacity ?? 100)) / 100));
    document.documentElement.classList.toggle("ds-chat-bubble-alpha", bubbleOpacity < 1);
    document.documentElement.style.setProperty("--ds-chat-background-bubble-opacity", String(bubbleOpacity));
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }


  function fetchBackgroundUrlImage(url) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "DS_BG_FETCH_IMAGE_URL", url }, response => {
          const lastError = chrome.runtime.lastError?.message;
          if (lastError || (!response?.ok && !response?.requiresPermission)) reject(new Error(lastError || response?.error || "Couldn't download this image."));
          else resolve(response);
        });
      } catch (error) { reject(error); }
    });
  }

  function requestBackgroundHost(url) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "DS_BG_REQUEST_IMAGE_PERMISSION", url }, response => {
          const lastError = chrome.runtime.lastError?.message;
          if (lastError || !response?.ok) reject(new Error(lastError || response?.error || "Site access wasn't granted."));
          else resolve(true);
        });
      } catch (error) { reject(error); }
    });
  }

  async function saveChatImageUrl(rawUrl, mode, { refresh = false } = {}) {
    const url = safeBackgroundUrl(rawUrl);
    if (!url) throw new Error("Enter an HTTPS image URL (public websites only).");
    const key = chatKey();
    if (!key) throw new Error("Open a chat first.");
    const selectedMode = mode === "link" ? "link" : "local";
    let savedItem;
    if (selectedMode === "local") {
      let result = await fetchBackgroundUrlImage(url);
      if (result?.requiresPermission) {
        await requestBackgroundHost(url);
        result = await fetchBackgroundUrlImage(url);
      }
      if (!result?.dataUrl?.startsWith("data:image/")) throw new Error("The URL didn't return a usable image.");
      savedItem = { dataUrl: result.dataUrl, sourceUrl: url, sourceMode: "local", name: result.name || "Image from URL", updatedAt: Date.now() };
    } else {
      savedItem = { url, sourceUrl: url, sourceMode: "link", name: "Linked image", updatedAt: Date.now() };
    }
    await loadStore();
    const chats = { ...mediaStore.chats, [key]: savedItem };
    const suppressedChats = { ...mediaStore.suppressedChats };
    delete suppressedChats[key];
    const galleries = { ...mediaStore.galleries };
    if (galleries[key]) galleries[key] = { ...galleries[key], activeId: "" };
    await saveStore({ ...mediaStore, chats, suppressedChats, galleries });
    await DS.applyChatBackgrounds?.();
    return savedItem;
  }

  async function chooseChatImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    document.body.appendChild(input);
    const file = await new Promise(resolve => {
      input.addEventListener("change", () => resolve(input.files?.[0] || null), { once: true });
      input.click();
    });
    input.remove();
    if (!file) return false;
    if (file.size > MAX_IMAGE_BYTES) {
      DS.setQuickStatus?.("Chat background image is too large. Use an image under 8 MB.");
      return false;
    }
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl.startsWith("data:image/")) return false;
    const key = chatKey();
    if (!key) return false;
    await loadStore();
    try {
      await saveStore({
        ...mediaStore,
        chats: {
          ...(mediaStore.chats || {}),
          [key]: { dataUrl, name: file.name || "Chat background", updatedAt: Date.now() }
        },
        suppressedChats: { ...(mediaStore.suppressedChats || {}), [key]: false }
      });
      await DS.applyChatBackgrounds?.();
      return true;
    } catch {
      DS.setQuickStatus?.("Could not save that chat background. Try a smaller image.");
      return false;
    }
  }

  async function resetChatBackground({ suppress = false } = {}) {
    const key = chatKey();
    if (!key) return;
    await loadStore();
    const chats = { ...(mediaStore.chats || {}) };
    delete chats[key];
    const galleries = { ...(mediaStore.galleries || {}) };
    if (galleries[key]) {
      // Keep saved scenes; only stop displaying the currently chosen scene.
      galleries[key] = { ...galleries[key], activeId: "" };
    }
    const suppressedChats = { ...(mediaStore.suppressedChats || {}) };
    if (suppress) suppressedChats[key] = true;
    else delete suppressedChats[key];
    await saveStore({ ...mediaStore, chats, galleries, suppressedChats });
    await DS.applyChatBackgrounds?.();
  }

  async function saveChatViewMode(part, choice) {
    const key = chatKey();
    if (!key || !["fit", "position"].includes(part)) return;
    await loadStore();
    const allowed = part === "fit" ? ["cover", "contain", "tile"]
      : ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"];
    const current = { ...(mediaStore.viewModes?.[key] || {}) };
    if (allowed.includes(choice)) current[part] = choice;
    else delete current[part]; // Use the global setting for this one control.
    const viewModes = { ...(mediaStore.viewModes || {}) };
    if (Object.keys(current).length) viewModes[key] = current;
    else delete viewModes[key];
    await saveStore({ ...mediaStore, viewModes });
    await DS.applyChatBackgrounds?.();
  }

  async function saveAvatarSize(percent) {
    const key = chatKey();
    if (!key) return;
    await loadStore();
    const avatarSizes = { ...(mediaStore.avatarSizes || {}),
      [key]: Math.max(30, Math.min(150, Math.round(Number(percent) || DEFAULT_AVATAR_SIZE))) };
    await saveStore({ ...mediaStore, avatarSizes });
    await DS.applyChatBackgrounds?.();
  }

  async function saveAvatarSideCopies(enabled) {
    const key = chatKey();
    if (!key) return;
    await loadStore();
    const avatarSideCopies = { ...(mediaStore.avatarSideCopies || {}) };
    if (enabled) avatarSideCopies[key] = true;
    else delete avatarSideCopies[key];
    await saveStore({ ...mediaStore, avatarSideCopies });
    await DS.applyChatBackgrounds?.();
  }

  function sceneGalleryStatus() {
    const gallery = mediaStore.galleries?.[chatKey()];
    return gallery?.items?.length || 0;
  }
  async function uploadSceneFiles() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = true;
    const files = await new Promise(resolve => {
      input.addEventListener("change", () => resolve([...input.files || []]), { once: true });
      input.click();
    });
    if (!files.length) return;
    const key = chatKey(); if (!key) return;
    await loadStore();
    const current = mediaStore.galleries?.[key] || { items: [], activeId: "" };
    if (files.length + current.items.length > MAX_SCENES_PER_CHAT) {
      DS.setQuickStatus?.(`Up to ${MAX_SCENES_PER_CHAT} scenes per chat. Delete an old scene first.`); return;
    }
    let activeId = current.activeId;
    const items = [...current.items];
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > MAX_SCENE_BYTES) {
        DS.setQuickStatus?.(`Scene image must be under 1.5 MB: ${file.name}`); return;
      }
      const dataUrl = await fileToDataUrl(file);
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      items.push({ id, name: file.name.slice(0, 180), dataUrl, updatedAt: Date.now() });
      activeId = id;
    }
    const galleries = { ...mediaStore.galleries, [key]: { items, activeId } };
    const totalChars = Object.values(galleries).flatMap(g => g.items || []).reduce((sum, item) => sum + (item.dataUrl?.length || 0), 0);
    if (totalChars > MAX_GALLERY_DATA_CHARS) { DS.setQuickStatus?.("Scene gallery storage budget reached (24 MB). Remove scenes before adding new ones."); return; }
    try {
      const suppressedChats = { ...(mediaStore.suppressedChats || {}) };
      delete suppressedChats[key];
      const chats = { ...(mediaStore.chats || {}) };
      delete chats[key];
      await saveStore({ ...mediaStore, galleries, chats, suppressedChats });
      await DS.applyChatBackgrounds?.();
      openDialog();
    }
    catch { DS.setQuickStatus?.("Could not store scene gallery. Remove images or use smaller files."); }
  }
  async function changeScene(id, { remove = false } = {}) {
    const key = chatKey(); if (!key) return;
    await loadStore();
    const galleries = { ...(mediaStore.galleries || {}) };
    const existing = galleries[key]; if (!existing) return;
    const items = remove ? existing.items.filter(item => item.id !== id) : existing.items;
    galleries[key] = { items, activeId: remove ? (existing.activeId === id ? "" : existing.activeId) : id };
    if (!items.length) delete galleries[key];
    // Choosing a scene takes priority over any older single-image override.
    const chats = { ...mediaStore.chats };
    const suppressedChats = { ...(mediaStore.suppressedChats || {}) };
    if (!remove) {
      delete chats[key];
      delete suppressedChats[key];
    }
    await saveStore({ ...mediaStore, galleries, chats, suppressedChats });
    await DS.applyChatBackgrounds?.();
    openDialog();
  }

  function installed(feature) {
    return DS.featureBuildProfile?.isInstalled?.(feature) !== false;
  }

  function activeCustomPictureFeatures(settings = DS.state?.settings || {}) {
    return {
      backgrounds: installed("chat-backgrounds") && !!settings.enableChatBackgrounds,
      character: installed("chat-backgrounds") && !!settings.enableCustomCharacterPictures,
      persona: installed("chat-backgrounds") && !!settings.enableCustomPersonaPictures,
      generation: installed("auto-voice") && typeof DS.applyAutoImage === "function",
      library: installed("chat-backgrounds") && !!(settings.enableChatBackgrounds || settings.enableCustomCharacterPictures || settings.enableCustomPersonaPictures)
    };
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

  async function storePicture(kind, item) {
    const key = chatKey();
    if (!key) throw new Error("Open a conversation first.");
    if (!activeCustomPictureFeatures()[kind]) throw new Error("Enable this Custom Pictures subsection in Settings.");
    await loadStore();
    const field = kind === "character" ? "portraits" : "personaPictures";
    const records = { ...mediaStore[field] };
    if (item) records[key] = item;
    else delete records[key];
    await saveStore({ ...mediaStore, [field]: records });
    applyPictureOverrides(true);
  }

  function pictureUrl(item) { return item?.dataUrl || item?.url || ""; }
  function clearPictureOverrides() {
    for (const img of touchedPictureNodes) {
      if (!img.isConnected) { touchedPictureNodes.delete(img); continue; }
      const previous = originalPictureSources.get(img);
      if (previous && img.getAttribute("src") !== previous) img.setAttribute("src", previous);
      originalPictureSources.delete(img);
      touchedPictureNodes.delete(img);
    }
    lastPictureSource = "";
  }

  function applyPictureOverrides(force = false) {
    if (!DS.isSingleChatPage?.()) { clearPictureOverrides(); return; }
    const settings = DS.state?.settings || {};
    const features = activeCustomPictureFeatures(settings);
    const key = chatKey();
    const portrait = features.character ? pictureUrl(mediaStore.portraits?.[key]) : "";
    const persona = features.persona ? pictureUrl(mediaStore.personaPictures?.[key]) : "";
    const source = `${key}|${portrait.length}:${portrait.slice(0, 70)}|${persona.length}:${persona.slice(0, 70)}|${features.character}:${features.persona}`;
    const now = Date.now();
    if (!force && source === lastPictureSource && now - lastPictureScanAt < 3500) return;
    lastPictureScanAt = now;
    if (lastPictureRoute !== key) { clearPictureOverrides(); lastPictureRoute = key; }
    lastPictureSource = source;
    if (!portrait && !persona) { clearPictureOverrides(); return; }
    // Only replace pictures displayed in the chat UI; never change bot settings,
    // native uploads, the generation request or the actual conversation content.
    const roots = Array.from(document.querySelectorAll("div[id^='message-']"))
      .filter(root => !root.parentElement?.closest?.("div[id^='message-']"))
      .slice(-80);
    const targets = [];
    for (const root of roots) {
      const isBot = !!root.querySelector("a[href*='/chatbot/'], a[aria-label='chatbot-profile']");
      const src = isBot ? portrait : persona;
      if (!src) continue;
      const img = root.querySelector("button img[alt], button img[src]");
      if (img) targets.push([img, src]);
    }
    if (portrait) {
      const header = document.querySelector("a[aria-label='chatbot-profile']");
      const image = header?.parentElement?.parentElement?.querySelector("button img");
      if (image) targets.push([image, portrait]);
    }
    const active = new Set(targets.map(([img]) => img));
    for (const img of touchedPictureNodes) {
      if (!img.isConnected || !active.has(img)) {
        const original = originalPictureSources.get(img);
        if (img.isConnected && original) img.setAttribute("src", original);
        touchedPictureNodes.delete(img); originalPictureSources.delete(img);
      }
    }
    for (const [img, src] of targets) {
      if (!originalPictureSources.has(img)) originalPictureSources.set(img, img.getAttribute("src") || "");
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      touchedPictureNodes.add(img);
    }
  }

  function addPictureTab(panel, name, label, build, enabled) {
    if (!enabled) return null;
    const section = document.createElement("section");
    section.dataset.dsPictureTab = name;
    section.hidden = name !== activePictureTab;
    section.style.display = name === activePictureTab ? "block" : "none";
    build(section);
    panel.appendChild(section);
    return section;
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

  function buildPictureEditor(section, kind, label) {
    const key = chatKey();
    const item = (kind === "character" ? mediaStore.portraits : mediaStore.personaPictures)?.[key];
    const h = document.createElement("h3"); h.textContent = label;
    const note = document.createElement("p"); note.textContent = "Per-chat visual override only. Does not change the bot/persona profile or what SpicyChat uses as its internal image-generation reference.";
    section.append(h, note);
    if (item) {
      const img = document.createElement("img"); img.src = pictureUrl(item);
      img.alt = item.name || label; img.style.cssText = "width:104px;max-height:140px;object-fit:contain;border-radius:8px;display:block;margin:10px 0";
      section.appendChild(img);
    }
    const controls = document.createElement("div"); controls.className = "ds-chat-background-actions";
    appendButton(controls, "Choose picture", async () => {
      const picture = await choosePictureFile(); if (picture) { await storePicture(kind, picture); await openDialog(kind); }
    });
    appendButton(controls, "Use image URL", async () => {
      const requested = window.prompt("Public HTTPS image URL");
      if (requested === null) return;
      const url = safeBackgroundUrl(requested);
      if (!url) throw new Error("Enter a valid public HTTPS image URL.");
      await storePicture(kind, { url, sourceUrl: url, sourceMode: "link", name: "Linked picture", updatedAt: Date.now() });
      await openDialog(kind);
    });
    appendButton(controls, "Clear override", async () => { await storePicture(kind, null); await openDialog(kind); });
    appendButton(controls, "Save to library", async () => {
      if (!item) throw new Error("Choose a picture first.");
      await saveToPictureLibrary(item); await openDialog("library");
    });
    section.appendChild(controls);
    const appearance = document.createElement("label"); appearance.textContent = "Appearance / scene notes (local only)";
    const area = document.createElement("textarea"); area.rows = 3; area.maxLength = 1200;
    area.placeholder = "Current outfit, location, look...";
    area.value = item?.note || "";
    appearance.appendChild(area); section.appendChild(appearance);
    appendButton(section, "Save appearance note", async () => {
      if (!item) throw new Error("Choose a picture before saving notes.");
      await storePicture(kind, { ...item, note: area.value.slice(0, 1200) });
      await openDialog(kind);
    });
    if (kind === "character") appendButton(section, "Use latest chat image as current look", async () => {
      const imgs = [...document.querySelectorAll("div[id^='message-'] img")].filter(img => {
        const src = img.currentSrc || img.src || "";
        return img.naturalWidth >= 200 && img.naturalHeight >= 150 && !img.closest("button");
      });
      const url = safeBackgroundUrl(imgs.at(-1)?.currentSrc || imgs.at(-1)?.src || "");
      if (!url) throw new Error("No suitable generated image is currently loaded; save and upload it instead.");
      await storePicture(kind, { url, sourceUrl:url, sourceMode:"link", name:"Latest chat image", updatedAt:Date.now() });
      await openDialog(kind);
    });
  }

  async function saveToPictureLibrary(item) {
    await loadStore();
    const current = mediaStore.pictureLibrary || [];
    if (current.length >= 30) throw new Error("Picture Library is full (30 images). Remove one first.");
    const chars = current.reduce((total, entry) => total + (entry.dataUrl?.length || 0), 0);
    if (chars + (item.dataUrl?.length || 0) > MAX_GALLERY_DATA_CHARS)
      throw new Error("Picture Library reached its 24 MB local budget.");
    const entry = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    await saveStore({ ...mediaStore, pictureLibrary: [...current, entry] });
  }

  function buildPictureLibrary(section) {
    const heading = document.createElement("h3"); heading.textContent = "Picture Library";
    const note = document.createElement("p"); note.textContent = "Reusable local pictures (up to 30). Your existing scene galleries stay in Backgrounds.";
    section.append(heading, note);
    appendButton(section, "Add picture to library", async () => {
      const item = await choosePictureFile(); if (item) { await saveToPictureLibrary(item); await openDialog("library"); }
    });
    const gallery = document.createElement("div"); gallery.className = "ds-chat-scene-grid";
    for (const entry of mediaStore.pictureLibrary || []) {
      const row = document.createElement("div"); row.className = "ds-chat-scene-item";
      const img = document.createElement("img"); img.src = pictureUrl(entry); img.alt = entry.name; img.loading = "lazy";
      row.appendChild(img);
      for (const [role,label] of [["character","Use for character"],["persona","Use for persona"],["backgrounds","Use as background"]]) {
        if (!activeCustomPictureFeatures()[role]) continue;
        appendButton(row, label, async () => {
          if (role === "backgrounds") {
            const key = chatKey(); const chats = { ...mediaStore.chats, [key]: entry };
            const suppressedChats = { ...mediaStore.suppressedChats }; delete suppressedChats[key];
            await saveStore({ ...mediaStore, chats, suppressedChats });
            await DS.applyChatBackgrounds?.();
          } else await storePicture(role, entry);
          await openDialog(role);
        });
      }
      appendButton(row, "Rename", async () => {
        const name = window.prompt("Picture name", entry.name);
        if (name === null || !name.trim()) return;
        const items = mediaStore.pictureLibrary.map(item => item.id === entry.id ? { ...item, name:name.trim().slice(0,180) } : item);
        await saveStore({ ...mediaStore, pictureLibrary:items }); await openDialog("library");
      });
      appendButton(row, "Remove", async () => {
        const items = mediaStore.pictureLibrary.filter(item => item.id !== entry.id);
        await saveStore({ ...mediaStore, pictureLibrary:items }); await openDialog("library");
      });
      gallery.appendChild(row);
    }
    section.appendChild(gallery);
  }

  function closeDialog() {
    document.getElementById("ds-chat-background-dialog")?.remove();
  }

  async function openDialog(requestedTab) {
    closeDialog();
    await loadStore();
    const installedTabs = activeCustomPictureFeatures();
    if (requestedTab && installedTabs[requestedTab]) activePictureTab = requestedTab;
    if (!installedTabs[activePictureTab]) activePictureTab = Object.keys(installedTabs).find(name => installedTabs[name]) || "backgrounds";
    const key = chatKey();
    const override = key ? mediaStore.chats?.[key] : null;
    const globalItem = mediaStore.global;
    const sceneGallery = mediaStore.galleries?.[key];

    const modal = document.createElement("div");
    modal.id = "ds-chat-background-dialog";
    modal.className = "ds-chat-background-dialog";
    const backdrop = document.createElement("div");
    backdrop.className = "ds-chat-background-backdrop";
    const panel = document.createElement("div");
    panel.className = "ds-chat-background-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");

    const title = document.createElement("h3");
    title.textContent = "Custom Pictures · Backgrounds";
    const status = document.createElement("p");
    status.className = "ds-chat-background-status";
    const activeScene = sceneGallery?.items?.find(item => item.id === sceneGallery.activeId);
    const suppressed = !!mediaStore.suppressedChats?.[key];
    const displayedItem = currentItem();
    status.textContent = suppressed ? "Background cleared for this chat." : override
      ? `This chat uses: ${override.name || "local image"}`
      : (DS.state?.settings?.chatSceneGalleriesEnabled && activeScene ? `Using scene: ${activeScene.name}` :
        (globalItem ? `Using global background: ${globalItem.name || "local image"}` :
        (displayedItem?.avatar ? "Using the chat character avatar." : "No background image is set.")));

    const choose = document.createElement("button");
    choose.type = "button";
    choose.textContent = "Choose image for this chat";
    choose.addEventListener("click", async () => {
      choose.disabled = true;
      try {
        const ok = await chooseChatImage();
        if (ok) closeDialog();
      } finally { choose.disabled = false; }
    });

    const urlBox = document.createElement("div");
    urlBox.className = "ds-chat-background-url-controls";
    urlBox.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0";
    const urlInput = document.createElement("input");
    urlInput.type = "url"; urlInput.placeholder = "https://example.com/background.png";
    urlInput.setAttribute("aria-label", "Background image URL");
    urlInput.style.cssText = "flex:1 1 230px;min-width:160px";
    urlInput.value = override?.sourceUrl || override?.url || "";
    const modeSelect = document.createElement("select");
    modeSelect.setAttribute("aria-label", "How to use the image URL");
    for (const [value, label] of [["local", "Save local copy (default)"], ["link", "Use URL only"]]) {
      const opt = document.createElement("option"); opt.value = value; opt.textContent = label; modeSelect.appendChild(opt);
    }
    modeSelect.value = override?.sourceMode || "local";
    const useUrlButton = document.createElement("button");
    useUrlButton.type = "button"; useUrlButton.textContent = "Use image URL";
    const urlStatus = document.createElement("p");
    urlStatus.style.cssText = "width:100%;margin:0;font-size:12px";
    urlStatus.setAttribute("role", "status");
    urlStatus.textContent = "Local copies keep the original URL for later refresh. URL-only images require the host to stay available.";
    useUrlButton.addEventListener("click", async () => {
      useUrlButton.disabled = true; urlStatus.textContent = "Checking image…";
      try { await saveChatImageUrl(urlInput.value, modeSelect.value); openDialog(); }
      catch (error) { urlStatus.textContent = error?.message || "Unable to use that image URL."; }
      finally { useUrlButton.disabled = false; }
    });
    urlInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); useUrlButton.click(); } });
    urlBox.append(urlInput, modeSelect, useUrlButton, urlStatus);
    if (override?.sourceUrl) {
      const refresh = document.createElement("button");
      refresh.type = "button"; refresh.textContent = "Refresh from original URL";
      refresh.title = "Re-download the linked source while keeping this chat's current settings.";
      refresh.addEventListener("click", async () => {
        refresh.disabled = true;
        try { await saveChatImageUrl(override.sourceUrl, "local", { refresh: true }); openDialog(); }
        catch (error) { urlStatus.textContent = error?.message || "Could not refresh the image."; refresh.disabled = false; }
      });
      urlBox.appendChild(refresh);
    }

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear background for this chat";
    clear.disabled = suppressed;
    clear.title = "Hide the picture on this chat, including automatic avatar and global backgrounds. Saved gallery/global images are kept.";
    clear.addEventListener("click", async () => {
      clear.disabled = true;
      try { await resetChatBackground({ suppress: true }); openDialog(); }
      catch { DS.setQuickStatus?.("Could not clear the background. Try again."); clear.disabled = false; }
    });

    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "Use default background";
    restore.disabled = !suppressed && !override && !activeScene;
    restore.title = "Remove this chat's background override and use the global image or automatic avatar if enabled.";
    restore.addEventListener("click", async () => {
      restore.disabled = true;
      try { await resetChatBackground(); openDialog(); }
      catch { DS.setQuickStatus?.("Could not reset the background. Try again."); restore.disabled = false; }
    });

    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.textContent = "Open Custom Pictures settings";
    settingsButton.addEventListener("click", () => {
      try { chrome.runtime?.openOptionsPage?.(); } catch {}
    });

    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Close";
    done.addEventListener("click", closeDialog);

    const actions = document.createElement("div");
    actions.className = "ds-chat-background-actions";
    actions.append(choose, clear, restore, settingsButton, done);
    panel.append(title, status, urlBox);
    // Per-chat positioning is useful for scenes and linked backgrounds where
    // the subject is not centered. Unset choices follow the existing global
    // Settings, so older images keep their appearance unchanged.
    const viewBox = document.createElement("div");
    viewBox.className = "ds-chat-background-view-controls";
    viewBox.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:10px 0";
    for (const [part, title, entries] of [
      ["fit", "Image fit", [["cover", "Cover"], ["contain", "Contain"], ["tile", "Tile"]]],
      ["position", "Image position", [["center", "Center"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"], ["top left", "Top left"], ["top right", "Top right"], ["bottom left", "Bottom left"], ["bottom right", "Bottom right"]]]
    ]) {
      const label = document.createElement("label");
      label.textContent = `${title} (this chat)`;
      label.style.cssText = "display:flex;flex:1 1 145px;flex-direction:column;gap:4px;min-width:0;font-size:12px";
      const select = document.createElement("select");
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Use global setting";
      select.appendChild(defaultOption);
      for (const [value, text] of entries) {
        const opt = document.createElement("option"); opt.value = value; opt.textContent = text; select.append(opt);
      }
      select.value = mediaStore.viewModes?.[key]?.[part] || "";
      select.addEventListener("change", async () => {
        select.disabled = true;
        try { await saveChatViewMode(part, select.value); }
        catch { DS.setQuickStatus?.("Could not save chat background position. Try again."); }
        finally { select.disabled = false; }
      });
      label.append(select); viewBox.append(label);
    }
    panel.append(viewBox);
    if (displayedItem?.avatar) {
      const zoom = document.createElement("label");
      zoom.textContent = "Avatar picture size";
      zoom.style.display = "flex";
      zoom.style.alignItems = "center";
      zoom.style.gap = "10px";
      zoom.style.margin = "10px 0";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "30";
      slider.max = "150";
      slider.step = "5";
      slider.value = String(mediaStore.avatarSizes?.[key] ?? DEFAULT_AVATAR_SIZE);
      slider.style.flex = "1";
      const value = document.createElement("span");
      value.textContent = `${slider.value}%`;
      slider.addEventListener("input", () => {
        value.textContent = `${slider.value}%`;
        const layer = document.getElementById("ds-chat-background-layer");
        if (layer) {
          layer.style.backgroundSize = mediaStore.avatarSideCopies?.[key]
            ? `100% 100%, auto ${slider.value}%, 100% 100%, auto ${slider.value}%`
            : `100% 100%, auto ${slider.value}%`;
        }
      });
      slider.addEventListener("change", async () => {
        slider.disabled = true;
        try { await saveAvatarSize(slider.value); }
        catch { DS.setQuickStatus?.("Could not save avatar size. Try again."); }
        finally { slider.disabled = false; }
      });
      zoom.append(slider, value);
      panel.appendChild(zoom);

      const sides = document.createElement("label");
      sides.style.display = "flex";
      sides.style.alignItems = "center";
      sides.style.gap = "8px";
      sides.style.margin = "8px 0 12px";
      const sidesCheckbox = document.createElement("input");
      sidesCheckbox.type = "checkbox";
      sidesCheckbox.checked = !!mediaStore.avatarSideCopies?.[key];
      sidesCheckbox.addEventListener("change", async () => {
        sidesCheckbox.disabled = true;
        try { await saveAvatarSideCopies(sidesCheckbox.checked); }
        catch {
          sidesCheckbox.checked = !sidesCheckbox.checked;
          DS.setQuickStatus?.("Could not save avatar side copies. Try again.");
        } finally { sidesCheckbox.disabled = false; }
      });
      sides.append(sidesCheckbox, document.createTextNode("Repeat avatar picture toward both screen edges (experimental)"));
      panel.appendChild(sides);
    }
    if (DS.state?.settings?.chatSceneGalleriesEnabled && key) {
      const sceneSection = document.createElement("section"); sceneSection.className = "ds-chat-scenes";
      const heading = document.createElement("h4"); heading.textContent = `Saved scenes (${sceneGalleryStatus()}/${MAX_SCENES_PER_CHAT})`;
      const grid = document.createElement("div"); grid.className = "ds-chat-scene-grid";
      for (const item of sceneGallery?.items || []) {
        const row = document.createElement("div"); row.className = "ds-chat-scene-item";
        const thumb = document.createElement("img"); thumb.src = item.dataUrl; thumb.alt = item.name; thumb.loading = "lazy";
        const chooseScene = document.createElement("button"); chooseScene.type = "button";
        chooseScene.textContent = item.id === sceneGallery.activeId ? `✓ ${item.name}` : item.name;
        chooseScene.title = "Use this scene"; chooseScene.addEventListener("click", () => changeScene(item.id));
        const removeScene = document.createElement("button"); removeScene.type = "button";
        removeScene.textContent = "Delete"; removeScene.title = `Delete ${item.name}`;
        removeScene.addEventListener("click", () => changeScene(item.id, { remove: true }));
        row.append(thumb, chooseScene, removeScene); grid.appendChild(row);
      }
      const upload = document.createElement("button"); upload.type = "button";
      upload.textContent = "Add scene images (including saved generated images)";
      upload.disabled = sceneGalleryStatus() >= MAX_SCENES_PER_CHAT;
      upload.addEventListener("click", uploadSceneFiles);
      const unselect = document.createElement("button"); unselect.type = "button";
      unselect.textContent = "Stop using scene";
      unselect.disabled = !sceneGallery?.activeId;
      unselect.addEventListener("click", () => changeScene(""));
      sceneSection.append(heading, grid, upload, unselect);
      panel.appendChild(sceneSection);
    }
    panel.append(actions);
    // Reuse the exact existing Backgrounds UI, storage keys, and scene gallery.
    const bgSection = document.createElement("section");
    bgSection.dataset.dsPictureTab = "backgrounds";
    while (panel.firstChild) bgSection.appendChild(panel.firstChild);
    const tabs = document.createElement("div"); tabs.className = "ds-chat-background-actions";
    tabs.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px";
    for (const [name, label] of [["backgrounds","Backgrounds"],["character","Character pictures"],
      ["persona","Persona pictures"],["generation","Image generation"],["library","Picture library"]]) {
      if (!installedTabs[name]) continue;
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.setAttribute("aria-pressed", activePictureTab === name ? "true" : "false");
      button.addEventListener("click", () => { activePictureTab = name; void openDialog(name); });
      tabs.appendChild(button);
    }
    panel.appendChild(tabs);
    const closeCustom = document.createElement("button"); closeCustom.type = "button";
    closeCustom.textContent = "Close Custom Pictures";
    closeCustom.addEventListener("click", closeDialog);
    panel.appendChild(closeCustom);
    bgSection.hidden = activePictureTab !== "backgrounds";
    bgSection.style.display = activePictureTab === "backgrounds" ? "block" : "none";
    if (installedTabs.backgrounds) panel.appendChild(bgSection);
    addPictureTab(panel, "character", "Character pictures", section => buildPictureEditor(section, "character", "Current character look"), installedTabs.character);
    addPictureTab(panel, "persona", "Persona pictures", section => buildPictureEditor(section, "persona", "Current persona look"), installedTabs.persona);
    addPictureTab(panel, "library", "Picture library", buildPictureLibrary, installedTabs.library);
    addPictureTab(panel, "generation", "Image generation", section => {
      const heading = document.createElement("h3"); heading.textContent = "Native image generation";
      const note = document.createElement("p"); note.textContent = "Automatic image requests use SpicyChat's native button without touching your message draft. A local character picture does not change the reference used internally by SpicyChat.";
      section.append(heading,note);
      appendButton(section,"Open image settings",async () => {
        if (!DS.openAutoImageSettings?.()) throw new Error("Image controls are not ready on this chat.");
      });
      const help = document.createElement("p"); help.textContent = "Configure per-chat intervals in the native Img helper. Generating images never edits or sends your typed message.";
      section.appendChild(help);
    }, installedTabs.generation);
    modal.append(backdrop, panel);
    document.documentElement.appendChild(modal);
    backdrop.addEventListener("click", closeDialog);
  }

  DS.applyChatBackgrounds = async function applyChatBackgrounds() {
    const settings = DS.state?.settings || {};
    const features = activeCustomPictureFeatures(settings);
    if (!settings.enabled || !Object.values(features).some(Boolean) || !DS.isSingleChatPage?.()) {
      removeLayer(); removeControl(); clearPictureOverrides();
      DS.state.chatBackgroundsWasActive = false;
      return;
    }
    DS.state.chatBackgroundsWasActive = true;
    await loadStore();
    if (features.backgrounds) applyLayer(currentItem());
    else removeLayer();
    applyPictureOverrides();
    // Popup is the only BG launcher. Clear any header button from an older pass.
    document.getElementById("ds-chat-background-control")?.remove();
  };

  DS.removeChatBackgrounds = function removeChatBackgrounds() {
    removeLayer();
    removeControl();
    clearPictureOverrides();
    DS.state.chatBackgroundsWasActive = false;
  };

  DS.openCustomPicturesMenu = openDialog;
  DS.hasCustomPictures = () => Object.values(activeCustomPictureFeatures()).some(Boolean);

  try {
    chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
      if (message?.type !== "DS_GET_CHAT_BACKGROUND_MENU_STATE" &&
          message?.type !== "DS_OPEN_CHAT_BACKGROUND_MENU") return false;
      const settings = DS.state?.settings || {};
      const available = !!(settings.enabled && Object.values(activeCustomPictureFeatures(settings)).some(Boolean) && DS.isSingleChatPage?.());
      sendResponse({ ok: available });
      if (message.type === "DS_OPEN_CHAT_BACKGROUND_MENU" && available)
        openDialog().catch(() => DS.setQuickStatus?.("Could not open chat background menu."));
      return false;
    });
  } catch {}

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
