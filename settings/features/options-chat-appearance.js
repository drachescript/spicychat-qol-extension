// Feature-owned options helpers: chat-appearance. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

async function dismissFirstRunNotice() {
  const version = chrome.runtime.getManifest?.().version || "";
  await storageSet({
    [RELEASE_NOTICE_KEY]: null,
    ...(version ? { [LAST_SEEN_VERSION_KEY]: version } : {})
  });
  const notice = $("firstRunNotice");
  if (notice) notice.hidden = true;
}

function showFirstRunNoticeIfNeeded(releaseNotice) {
  const notice = $("firstRunNotice");
  if (!notice) return;
  notice.hidden = releaseNotice?.reason !== "install";
}

function safeSettingsBackgroundUrl(value) {
  try {
    const u = new URL(String(value || "").trim());
    if (u.protocol !== "https:" || u.username || u.password || u.href.length > 2048) return "";
    if (!u.hostname || /^(localhost|.*\.localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$)/i.test(u.hostname)) return "";
    return u.href;
  } catch { return ""; }
}

function normalizeChatBackgroundMediaStore(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const cleanItem = item => {
    if (!item || typeof item !== "object") return null;
    const dataUrl = String(item.dataUrl || "");
    const url = safeSettingsBackgroundUrl(item.url || "");
    const sourceUrl = safeSettingsBackgroundUrl(item.sourceUrl || url);
    const sourceMode = item.sourceMode === "link" ? "link" : "local";
    if (sourceMode === "link" ? !url : !dataUrl.startsWith("data:image/")) return null;
    return {
      ...(sourceMode === "link" ? { url } : { dataUrl }),
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
  for (const [route, gallery] of Object.entries(input.galleries || {})) {
    if (!route || !gallery || typeof gallery !== "object") continue;
    const items = (Array.isArray(gallery.items) ? gallery.items : []).slice(0, 6)
      .map(item => {
        const clean = cleanItem(item);
        return clean ? { ...clean, id: String(item.id || "").slice(0, 80) } : null;
      }).filter(item => item && item.id);
    if (items.length) galleries[String(route).slice(0, 260)] = {
      activeId: String(gallery.activeId || "").slice(0, 80), items
    };
  }
  // Global background edits must not erase saved per-chat Clear state / avatar sizing.
  const suppressedChats = {};
  for (const [key, value] of Object.entries(input.suppressedChats || {})) {
    if (key && value === true) suppressedChats[String(key).slice(0, 260)] = true;
  }
  const avatarSizes = {};
  for (const [key, value] of Object.entries(input.avatarSizes || {})) {
    if (key && Number(value) >= 30 && Number(value) <= 150) avatarSizes[String(key).slice(0, 260)] = Math.round(Number(value));
  }
  const avatarSideCopies = {};
  for (const [key, value] of Object.entries(input.avatarSideCopies || {})) {
    if (key && value === true) avatarSideCopies[String(key).slice(0, 260)] = true;
  }
  const viewModes = {};
  for (const [key, raw] of Object.entries(input.viewModes || {})) {
    if (!key || !raw || typeof raw !== "object") continue;
    const fit = ["cover", "contain", "tile"].includes(raw.fit) ? raw.fit : "";
    const position = ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"].includes(raw.position) ? raw.position : "";
    if (fit || position) viewModes[String(key).slice(0,260)] = { ...(fit ? { fit } : {}), ...(position ? { position } : {}) };
  }
  const cleanChatPictures = value => {
    const result = {};
    for (const [key, raw] of Object.entries(value || {})) {
      const item = cleanItem(raw);
      if (item && key) result[String(key).slice(0,260)] = { ...item, note: String(raw.note || "").slice(0,1200) };
    }
    return result;
  };
  const pictureLibrary = (Array.isArray(input.pictureLibrary) ? input.pictureLibrary : [])
    .slice(0,30).map(raw => {
      const item = cleanItem(raw);
      return item ? { ...item, id: String(raw.id || "").slice(0,90) } : null;
    }).filter(item => item?.id);
  return { global: cleanItem(input.global), chats, galleries, suppressedChats, avatarSizes, avatarSideCopies,
    viewModes, portraits: cleanChatPictures(input.portraits), personaPictures: cleanChatPictures(input.personaPictures), pictureLibrary };
}

function chatBackgroundFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function renderChatBackgroundOptions() {
  const status = $("chatBackgroundGlobalStatus");
  const preview = $("chatBackgroundGlobalPreview");
  const globalItem = chatBackgroundMediaState?.global || null;
  const perChatCount = Object.keys(chatBackgroundMediaState?.chats || {}).length;
  const galleryCount = Object.values(chatBackgroundMediaState?.galleries || {}).reduce((n,g)=>n+(g.items?.length||0),0);
  if (status) {
    status.textContent = globalItem
      ? `Global image: ${globalItem.name || "local image"} · ${perChatCount} chat override${perChatCount === 1 ? "" : "s"} saved · ${galleryCount} scene images.`
      : `No global image saved · ${perChatCount} chat override${perChatCount === 1 ? "" : "s"} saved · ${galleryCount} scene images.`;
  }
  if (preview) {
    preview.hidden = !globalItem;
    preview.style.backgroundImage = globalItem ? `url("${String(globalItem.dataUrl || globalItem.url).replace(/"/g, "%22")}")` : "";
    const fit = value("chatBackgroundFit", "cover");
    const position = value("chatBackgroundPosition", "center");
    preview.style.backgroundSize = fit === "tile" ? "auto" : fit;
    preview.style.backgroundRepeat = fit === "tile" ? "repeat" : "no-repeat";
    preview.style.backgroundPosition = position;
  }
  const urlInput = $("chatBackgroundGlobalUrl");
  const urlMode = $("chatBackgroundGlobalUrlMode");
  if (urlInput && document.activeElement !== urlInput) urlInput.value = globalItem?.sourceUrl || globalItem?.url || "";
  if (urlMode && document.activeElement !== urlMode) urlMode.value = globalItem?.sourceMode || "local";
  const refresh = $("refreshGlobalChatBackgroundUrl");
  if (refresh) refresh.disabled = !globalItem?.sourceUrl;
  const clear = $("clearGlobalChatBackground");
  if (clear) clear.disabled = !globalItem;
  const clearChats = $("clearPerChatBackgrounds");
  if (clearChats) clearChats.disabled = perChatCount === 0 && galleryCount === 0;
}

async function saveChatBackgroundMediaStore(next) {
  const normalized = normalizeChatBackgroundMediaStore(next);
  const ok = await storageSet({ [CHAT_BACKGROUNDS_KEY]: normalized });
  if (!ok) throw new Error("Browser storage rejected the background image");
  chatBackgroundMediaState = normalized;
  renderChatBackgroundOptions();
}

async function importGlobalChatBackground(files) {
  const file = files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    showSettingsToast("Use a chat background image under 8 MB.");
    return;
  }
  const dataUrl = await chatBackgroundFileToDataUrl(file);
  if (!dataUrl.startsWith("data:image/")) {
    showSettingsToast("That file could not be read as an image.");
    return;
  }
  try {
    await saveChatBackgroundMediaStore({
      ...chatBackgroundMediaState,
      global: { dataUrl, name: file.name || "Global background", updatedAt: Date.now() }
    });
    showSettingsToast("Global chat background saved locally.");
  } catch {
    showSettingsToast("Could not save that background image. Try a smaller file.");
  }
}


function requestBackgroundUrlMessage(type, url) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type, url }, response => {
        const error = chrome.runtime.lastError?.message;
        if (error) reject(new Error(error));
        else resolve(response || { ok: false, error: "No response from background service." });
      });
    } catch (error) { reject(error); }
  });
}

async function importGlobalChatBackgroundUrl({ refresh = false } = {}) {
  const button = $(refresh ? "refreshGlobalChatBackgroundUrl" : "useGlobalChatBackgroundUrl");
  const input = $("chatBackgroundGlobalUrl");
  const modeInput = $("chatBackgroundGlobalUrlMode");
  const message = $("chatBackgroundGlobalUrlStatus");
  const url = safeSettingsBackgroundUrl(refresh ? chatBackgroundMediaState?.global?.sourceUrl : input?.value);
  if (!url) { if (message) message.textContent = "Enter a valid public HTTPS image URL."; return; }
  const mode = refresh ? "local" : (modeInput?.value === "link" ? "link" : "local");
  if (button) button.disabled = true;
  if (message) message.textContent = "Checking image…";
  try {
    let item;
    if (mode === "link") {
      item = { url, sourceUrl: url, sourceMode: "link", name: "Linked background", updatedAt: Date.now() };
    } else {
      let response = await requestBackgroundUrlMessage("DS_BG_FETCH_IMAGE_URL", url);
      if (response.requiresPermission) {
        const allowed = await requestBackgroundUrlMessage("DS_BG_REQUEST_IMAGE_PERMISSION", url);
        if (!allowed.ok) throw new Error(allowed.error || "Site permission not granted.");
        response = await requestBackgroundUrlMessage("DS_BG_FETCH_IMAGE_URL", url);
      }
      if (!response.ok || !String(response.dataUrl || "").startsWith("data:image/")) throw new Error(response.error || "The URL did not return an image.");
      item = { dataUrl: response.dataUrl, sourceUrl: url, sourceMode: "local", name: response.name || "Image from URL", updatedAt: Date.now() };
    }
    await saveChatBackgroundMediaStore({ ...chatBackgroundMediaState, global: item });
    if (message) message.textContent = mode === "local" ? "Saved local copy; original URL kept for refresh." : "URL saved. The image will load from its original host.";
    showSettingsToast("Global background updated.");
  } catch (error) {
    if (message) message.textContent = error?.message || "Could not use that image.";
  } finally { if (button) button.disabled = false; }
}

async function clearGlobalChatBackground() {
  if (!chatBackgroundMediaState?.global) return;
  if (!window.confirm("Clear the global chat background? Per-chat overrides will be kept.")) return;
  await saveChatBackgroundMediaStore({ ...chatBackgroundMediaState, global: null });
}

async function clearPerChatBackgrounds() {
  const count = Object.keys(chatBackgroundMediaState?.chats || {}).length;
  const sceneCount = Object.values(chatBackgroundMediaState?.galleries || {}).reduce((n, g) => n + (g.items?.length || 0), 0);
  if (!count && !sceneCount) return;
  if (!window.confirm(`Clear ${count} saved per-chat backgrounds and ${sceneCount} saved scene images? The global background will be kept.`)) return;
  await saveChatBackgroundMediaStore({ ...chatBackgroundMediaState, chats: {}, galleries: {} });
}
