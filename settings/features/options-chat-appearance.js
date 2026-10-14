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

function normalizeChatBackgroundMediaStore(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const cleanItem = item => {
    if (!item || typeof item !== "object") return null;
    const dataUrl = String(item.dataUrl || "");
    if (!dataUrl.startsWith("data:image/")) return null;
    return {
      dataUrl,
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
  return { global: cleanItem(input.global), chats, galleries };
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
    preview.style.backgroundImage = globalItem ? `url("${String(globalItem.dataUrl).replace(/"/g, "%22")}")` : "";
    const fit = value("chatBackgroundFit", "cover");
    const position = value("chatBackgroundPosition", "center");
    preview.style.backgroundSize = fit === "tile" ? "auto" : fit;
    preview.style.backgroundRepeat = fit === "tile" ? "repeat" : "no-repeat";
    preview.style.backgroundPosition = position;
  }
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
