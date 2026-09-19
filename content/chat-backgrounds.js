(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const STORE_KEY = "chatBackgroundMediaV1";
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  let mediaStore = { global: null, chats: {} };
  let mediaLoaded = false;
  let mediaLoadPromise = null;

  function cleanStore(raw) {
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
    return { global: cleanItem(input.global), chats };
  }

  async function loadStore(force = false) {
    if (mediaLoaded && !force) return mediaStore;
    if (mediaLoadPromise && !force) return mediaLoadPromise;
    mediaLoadPromise = (async () => {
      try {
        const result = await DS.storageGet?.([STORE_KEY]);
        mediaStore = cleanStore(result?.[STORE_KEY]);
      } catch {
        mediaStore = { global: null, chats: {} };
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

  function currentItem() {
    const key = chatKey();
    return (key && mediaStore.chats?.[key]) || mediaStore.global || null;
  }

  function removeLayer() {
    document.getElementById("ds-chat-background-layer")?.remove();
    document.documentElement.classList.remove("ds-chat-custom-background");
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
    if (!item?.dataUrl) {
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
    const safeUrl = String(item.dataUrl).replace(/"/g, "%22");
    layer.style.backgroundImage = `linear-gradient(${dim}, ${dim}), url("${safeUrl}")`;
    const fit = ["cover", "contain", "tile"].includes(settings.chatBackgroundFit) ? settings.chatBackgroundFit : "cover";
    const position = ["center", "top", "bottom", "left", "right"].includes(settings.chatBackgroundPosition) ? settings.chatBackgroundPosition : "center";
    layer.style.backgroundPosition = position;
    layer.style.backgroundRepeat = fit === "tile" ? "repeat" : "no-repeat";
    layer.style.backgroundSize = fit === "tile" ? "auto" : fit;
    layer.style.filter = blur ? `blur(${blur}px)` : "none";
    layer.style.transform = blur ? `scale(${1 + Math.min(0.08, blur / 250)})` : "none";
    document.documentElement.classList.add("ds-chat-custom-background");
  }

  function findControlHost() {
    const rating = document.querySelector("button[aria-label='ThumbsUp-button']");
    if (rating?.parentElement) return rating.parentElement;
    const dropdown = document.querySelector("button[aria-label='chat-dropdown']");
    if (dropdown?.parentElement) return dropdown.parentElement;
    const title = [...document.querySelectorAll("h1, h2, h3")].find(el => {
      const rect = el.getBoundingClientRect?.();
      return rect?.width > 0 && rect?.height > 0 && String(el.textContent || "").trim().length > 0;
    });
    return title?.parentElement || null;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
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
        }
      });
      await DS.applyChatBackgrounds?.();
      return true;
    } catch {
      DS.setQuickStatus?.("Could not save that chat background. Try a smaller image.");
      return false;
    }
  }

  async function clearChatOverride() {
    const key = chatKey();
    if (!key) return;
    await loadStore();
    const chats = { ...(mediaStore.chats || {}) };
    delete chats[key];
    await saveStore({ ...mediaStore, chats });
    await DS.applyChatBackgrounds?.();
  }

  function closeDialog() {
    document.getElementById("ds-chat-background-dialog")?.remove();
  }

  async function openDialog() {
    closeDialog();
    await loadStore();
    const key = chatKey();
    const override = key ? mediaStore.chats?.[key] : null;
    const globalItem = mediaStore.global;

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
    title.textContent = "Chat background";
    const status = document.createElement("p");
    status.className = "ds-chat-background-status";
    status.textContent = override
      ? `This chat uses: ${override.name || "local image"}`
      : (globalItem ? `Using global background: ${globalItem.name || "local image"}` : "No background image is set.");

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

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = override ? "Use global background" : "No chat override";
    clear.disabled = !override;
    clear.addEventListener("click", async () => {
      await clearChatOverride();
      closeDialog();
    });

    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.textContent = "Open background settings";
    settingsButton.addEventListener("click", () => {
      try { chrome.runtime?.openOptionsPage?.(); } catch {}
    });

    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Close";
    done.addEventListener("click", closeDialog);

    const actions = document.createElement("div");
    actions.className = "ds-chat-background-actions";
    actions.append(choose, clear, settingsButton, done);
    panel.append(title, status, actions);
    modal.append(backdrop, panel);
    document.documentElement.appendChild(modal);
    backdrop.addEventListener("click", closeDialog);
  }

  function ensureControl() {
    let button = document.getElementById("ds-chat-background-control");
    const host = findControlHost();
    if (!host) return;
    if (!button) {
      button = document.createElement("button");
      button.id = "ds-chat-background-control";
      button.type = "button";
      button.className = "ds-chat-background-control";
      button.textContent = "BG";
      button.title = "Chat background";
      button.setAttribute("aria-label", "Chat background");
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openDialog();
      });
    }
    if (!button.isConnected || button.parentElement !== host) host.appendChild(button);
  }

  DS.applyChatBackgrounds = async function applyChatBackgrounds() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableChatBackgrounds || !DS.isSingleChatPage?.()) {
      removeLayer();
      removeControl();
      DS.state.chatBackgroundsWasActive = false;
      return;
    }
    DS.state.chatBackgroundsWasActive = true;
    await loadStore();
    applyLayer(currentItem());
    ensureControl();
  };

  DS.removeChatBackgrounds = function removeChatBackgrounds() {
    removeLayer();
    removeControl();
    DS.state.chatBackgroundsWasActive = false;
  };

  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes?.[STORE_KEY]) return;
      mediaStore = cleanStore(changes[STORE_KEY].newValue);
      mediaLoaded = true;
      DS.applyChatBackgrounds?.();
    });
  } catch {}
})();
