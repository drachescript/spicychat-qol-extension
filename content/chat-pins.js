// Local conversation pins. Never modifies SpicyChat's native chat ordering.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const STORAGE_KEY = "dsQolPinnedChatsV1";
  const LIMIT = 100;
  let pins = [];
  let loaded = false;
  let loading = null;
  let writing = Promise.resolve();

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  function keyFromUrl(href) {
    try {
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return "";
      const path = url.pathname.replace(/\/+$/, "");
      // Two segments: bot AND conversation UUID. A bot ID alone is not a pin.
      return /^\/chat\/[a-f\d-]{36}\/[a-f\d-]{36}$/i.test(path) ? path.toLowerCase() : "";
    } catch { return ""; }
  }
  function normalize(raw) {
    const result = [];
    const seen = new Set();
    for (const item of (Array.isArray(raw) ? raw : [])) {
      const key = keyFromUrl(item?.key || item?.href);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push({ key, title: clean(item?.title).slice(0, 140) || "Conversation", pinnedAt: Number(item?.pinnedAt) || 0 });
      if (result.length >= LIMIT) break;
    }
    return result;
  }
  function enabled() {
    return DS.state?.settings?.enabled === true && DS.state.settings.enableChatPins === true
      && DS.isChatListPage?.() && !DS.isQolPausedForTab?.();
  }
  async function load() {
    if (loaded || loading) return loading;
    loading = (async () => {
      try {
        const value = await DS.storageGet?.([STORAGE_KEY]);
        pins = normalize(value?.[STORAGE_KEY]);
        loaded = true;
      } catch (error) {
        DS.setQuickStatus?.(`Could not read pinned chats: ${error?.message || error}`);
      } finally { loading = null; }
      if (loaded && enabled()) DS.applyChatPins?.();
    })();
    return loading;
  }
  async function updatePin(item) {
    if (!enabled() || !loaded || !item?.key) return;
    // Serialize writes to avoid losing a fast sequence of pin/unpin clicks.
    writing = writing.catch(() => {}).then(async () => {
      const existing = pins.findIndex(pin => pin.key === item.key);
      const next = existing >= 0 ? pins.filter(pin => pin.key !== item.key)
        : normalize([{ key: item.key, title: item.title, pinnedAt: Date.now() }, ...pins]);
      if (existing < 0 && pins.length >= LIMIT) {
        DS.setQuickStatus?.(`You can pin up to ${LIMIT} conversations.`);
        return;
      }
      try {
        const saved = await DS.storageSet?.({ [STORAGE_KEY]: next });
        if (saved === false) throw new Error("storage write failed");
        pins = next;
        DS.applyChatPins?.();
      } catch (error) {
        DS.setQuickStatus?.(`Could not save pinned chats: ${error?.message || error}`);
      }
    });
    return writing;
  }
  function removeUI() {
    document.getElementById("ds-qol-pinned-chats")?.remove();
    for (const row of document.querySelectorAll(".ds-chat-pins-row")) row.classList.remove("ds-chat-pins-row");
    document.querySelectorAll(".ds-chat-pin-toggle").forEach(el => el.remove());
  }
  function rowInfo(item) {
    const key = keyFromUrl(item?.anchor?.href);
    if (!key) return null;
    return { key, title: clean(DS.getChatRowTitle?.(item.row)).slice(0, 140) || "Conversation" };
  }
  function decorateRow(item, pinnedKeys) {
    const info = rowInfo(item);
    if (!info) return;
    const row = item.row;
    row.classList.add("ds-chat-pins-row");
    let button = row.querySelector(":scope > .ds-chat-pin-toggle");
    if (!button) {
      button = document.createElement("button");
      button.className = "ds-chat-pin-toggle";
      button.type = "button";
      button.textContent = "📍";
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const key = button.dataset.dsChatPinKey;
        if (key) updatePin({ key, title: button.dataset.dsChatPinTitle });
      }, true);
      row.appendChild(button);
    }
    const selected = pinnedKeys.has(info.key);
    button.dataset.dsChatPinKey = info.key;
    button.dataset.dsChatPinTitle = info.title;
    button.textContent = selected ? "📌" : "📍";
    button.title = selected ? "Unpin conversation" : "Pin conversation to top";
    button.setAttribute("aria-label", `${selected ? "Unpin" : "Pin"} ${info.title}`);
    button.setAttribute("aria-pressed", String(selected));
  }
  function renderSection() {
    const list = document.querySelector('[data-testid="ChatsConversationList"]');
    if (!list?.parentElement || !pins.length) {
      document.getElementById("ds-qol-pinned-chats")?.remove();
      return;
    }
    let section = document.getElementById("ds-qol-pinned-chats");
    if (!section) {
      section = document.createElement("section");
      section.id = "ds-qol-pinned-chats";
      section.setAttribute("aria-label", "Pinned conversations");
    }
    if (section.parentElement !== list.parentElement || section.nextElementSibling !== list) {
      list.parentElement.insertBefore(section, list);
    }
    const signature = JSON.stringify(pins.map(item => [item.key, item.title]));
    if (section.dataset.dsPinSignature === signature) return;
    section.dataset.dsPinSignature = signature;
    const heading = document.createElement("h2");
    heading.textContent = `Pinned chats (${pins.length})`;
    const container = document.createElement("div");
    container.className = "ds-chat-pins-links";
    for (const pin of pins) {
      const wrapper = document.createElement("div");
      wrapper.className = "ds-chat-pins-item";
      const link = document.createElement("a");
      link.href = pin.key;
      link.textContent = pin.title;
      link.title = pin.title;
      const unpin = document.createElement("button");
      unpin.type = "button";
      unpin.textContent = "×";
      unpin.title = `Unpin ${pin.title}`;
      unpin.setAttribute("aria-label", `Unpin ${pin.title}`);
      unpin.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        updatePin(pin);
      });
      wrapper.append(link, unpin);
      container.appendChild(wrapper);
    }
    section.replaceChildren(heading, container);
  }
  DS.applyChatPins = function applyChatPins() {
    if (!enabled()) { removeUI(); return; }
    if (!loaded) { void load(); return; }
    const rows = DS.collectChatRows?.() || [];
    const pinnedKeys = new Set(pins.map(pin => pin.key));
    const presentRows = new Set(rows.map(item => item.row));
    document.querySelectorAll(".ds-chat-pins-row").forEach(row => {
      if (!presentRows.has(row)) { row.classList.remove("ds-chat-pins-row"); row.querySelector(":scope > .ds-chat-pin-toggle")?.remove(); }
    });
    rows.forEach(item => decorateRow(item, pinnedKeys));
    renderSection();
  };
  DS.removeChatPins = removeUI;
})();
}
