(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || window.__DS_QOL_COMMAND_PALETTE__) return;
  window.__DS_QOL_COMMAND_PALETTE__ = true;

  const OVERLAY_ID = "ds-qol-command-palette";
  const STYLE_ID = "ds-qol-command-palette-style";
  const PINS_KEY = "dsCommandPalettePinsV1";
  const RECENT_KEY = "dsCommandPaletteRecentV1";
  const LINK_KEY = "chatbotLorebookLinks";
  let currentItems = [];
  let selectedIndex = 0;

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const unique = values => [...new Set((values || []).map(value => clean(value)).filter(Boolean))];

  function settings() { return DS.state?.settings || {}; }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.58);display:flex;justify-content:center;align-items:flex-start;padding:12vh 16px 16px;box-sizing:border-box}
      #${OVERLAY_ID}[hidden]{display:none!important}
      #${OVERLAY_ID} .ds-cp-dialog{width:min(720px,96vw);max-height:72vh;background:#15171b;color:#f3f4f6;border:1px solid rgba(148,163,184,.38);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden;display:flex;flex-direction:column}
      #${OVERLAY_ID} .ds-cp-head{display:flex;gap:8px;padding:12px;border-bottom:1px solid rgba(148,163,184,.2)}
      #${OVERLAY_ID} input{flex:1;min-width:0;background:#0d0f12;color:inherit;border:1px solid rgba(148,163,184,.38);border-radius:9px;padding:10px 12px;font:inherit;font-size:15px;outline:none}
      #${OVERLAY_ID} input:focus{border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.18)}
      #${OVERLAY_ID} .ds-cp-kbd{font-size:11px;color:#9ca3af;align-self:center;white-space:nowrap}
      #${OVERLAY_ID} .ds-cp-list{overflow:auto;padding:6px}
      #${OVERLAY_ID} .ds-cp-empty{padding:18px;color:#9ca3af;text-align:center}
      #${OVERLAY_ID} .ds-cp-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border-radius:9px;padding:8px 9px;cursor:pointer}
      #${OVERLAY_ID} .ds-cp-row:hover,#${OVERLAY_ID} .ds-cp-row.is-selected{background:#252a31}
      #${OVERLAY_ID} .ds-cp-title{font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${OVERLAY_ID} .ds-cp-meta{font-size:11px;color:#a7b0bd;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${OVERLAY_ID} .ds-cp-actions{display:flex;align-items:center;gap:5px}
      #${OVERLAY_ID} .ds-cp-pin{border:0;background:transparent;color:#f6c453;font-size:16px;line-height:1;padding:5px;cursor:pointer;border-radius:6px}
      #${OVERLAY_ID} .ds-cp-pin:hover{background:rgba(255,255,255,.08)}
      #${OVERLAY_ID} .ds-cp-type{font-size:10px;color:#94a3b8;border:1px solid rgba(148,163,184,.28);border-radius:999px;padding:2px 6px;text-transform:uppercase;letter-spacing:.04em}
      #${OVERLAY_ID} .ds-cp-foot{padding:8px 12px;border-top:1px solid rgba(148,163,184,.18);font-size:11px;color:#9ca3af;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
    `;
    document.documentElement.appendChild(style);
  }

  function normalizeStore(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    const ids = unique(value.ids || []);
    const names = unique(value.names || []);
    const meta = value.meta && typeof value.meta === "object" ? value.meta : {};
    return { ids, names, meta };
  }

  function safeReadLocal(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch { return fallback; }
  }

  function safeWriteLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function pins() {
    const list = safeReadLocal(PINS_KEY, []);
    return Array.isArray(list) ? unique(list).slice(0, 20) : [];
  }

  function recents() {
    const list = safeReadLocal(RECENT_KEY, []);
    return Array.isArray(list) ? unique(list).slice(0, 12) : [];
  }

  function recordRecent(id) {
    const next = [id, ...recents().filter(value => value !== id)].slice(0, 12);
    safeWriteLocal(RECENT_KEY, next);
  }

  function togglePin(id) {
    const list = pins();
    safeWriteLocal(PINS_KEY, list.includes(id) ? list.filter(value => value !== id) : [...list, id]);
  }

  function openOptions(target = "general", query = "") {
    DS.openOptionsTarget?.(target, { search: query });
  }

  function activeBotId() {
    const path = String(location.pathname || "");
    return path.match(/^\/(?:chat|chatbot)\/([^/?#]+)/i)?.[1] || path.match(/^\/chatbot\/edit\/([^/?#]+)/i)?.[1] || "";
  }

  function actionItems() {
    const items = [
      { id: "settings", title: "Open Settings", meta: "General settings", type: "action", terms: "settings preferences options", run: () => openOptions("general") },
      { id: "control-center", title: "Open Control Center", meta: "Navigation, creator workspace, data health and support", type: "action", terms: "control center command palette health support creator", run: () => openOptions("control") },
      { id: "creator-tools", title: "Open Creator Tools", meta: "Chatbots, Lorebooks, backups and Creation Audit", type: "action", terms: "creator chatbot lorebook audit backup", run: () => openOptions("bot-tools") },
      { id: "backup-manager", title: "Open Backup Manager", meta: "Chatbot and Lorebook revisions", type: "action", terms: "backup history revision restore", run: () => openOptions("bot-tools", "backup manager") },
      { id: "wiki-import", title: "Wiki / Web Lorebook Importer", meta: "Open the importer setting", type: "action", terms: "wiki fandom mediawiki lorebook import web", run: () => openOptions("bot-tools", "wiki web lorebook import") },
      { id: "creation-audit", title: "Creation Audit", meta: "Creator QA checks", type: "action", terms: "audit qa greeting personality scenario examples", run: () => openOptions("bot-tools", "creation audit") },
      { id: "data-backup", title: "Data & Backup", meta: "Export, restore, storage and recovery", type: "action", terms: "data backup restore storage recovery health", run: () => openOptions("data") },
      { id: "support", title: "Support & Diagnostics", meta: "Copy support info and performance report", type: "action", terms: "support diagnostics performance report bug", run: () => openOptions("help", "support") },
      { id: "changelog", title: "Changelog", meta: "Recent QoL changes", type: "action", terms: "changes update release version", run: () => openOptions("changelog") }
    ];

    if (DS.isSingleChatPage?.()) {
      items.unshift({ id: "block-current", title: `Block ${clean(DS.getCurrentBotName?.()) || "current bot"}`, meta: "Use QoL's normal block action", type: "action", terms: "block current bot", run: async () => { await DS.blockCurrentBot?.(); } });
      if (DS.copyCurrentChatText) items.unshift({ id: "copy-chat", title: "Copy current chat", meta: "Copy chat as plain text", type: "action", terms: "copy export chat transcript", run: () => DS.copyCurrentChatText?.() });
      if (DS.exportCurrentChat) items.unshift({ id: "export-chat", title: "Export current chat", meta: "Open chat export", type: "action", terms: "export download chat transcript", run: () => DS.exportCurrentChat?.() });
    }
    return items;
  }

  async function dynamicItems() {
    if (settings().commandPaletteShowSavedItems === false) return [];
    const result = await new Promise(resolve => {
      try {
        chrome.storage.local.get(["favoriteBots", "laterBots", "personas", "savedPersonas", LINK_KEY], value => resolve(value || {}));
      } catch { resolve({}); }
    });
    const out = [];
    const seen = new Set();
    const addBotStore = (key, label) => {
      const store = normalizeStore(result[key]);
      for (const id of store.ids.slice(0, 500)) {
        const meta = store.meta?.[id] || {};
        const name = clean(meta.name || meta.title || id);
        const itemId = `bot:${id}`;
        if (seen.has(itemId)) continue;
        seen.add(itemId);
        out.push({ id: itemId, title: name, meta: `${label} · bot`, type: "bot", terms: `${name} ${label} bot`, run: () => window.open(`https://spicychat.ai/chatbot/${encodeURIComponent(id)}`, "_blank", "noopener") });
      }
    };
    addBotStore("favoriteBots", "Favorite");
    addBotStore("laterBots", "Later");

    // Keep palette startup light even for very large local archives. The relationship
    // store gives us useful Lorebook names/IDs without loading full revisioned bot or
    // Lorebook backup bodies into memory every time Ctrl/Cmd+K is pressed.
    const links = result[LINK_KEY] && typeof result[LINK_KEY] === "object" ? result[LINK_KEY] : {};
    const seenBooks = new Set();
    for (const link of Object.values(links).slice(0, 800)) {
      const id = clean(link?.lorebookId);
      if (!id || seenBooks.has(id)) continue;
      seenBooks.add(id);
      const name = clean(link?.lorebookName || id);
      out.push({ id: `lorebook:${id}`, title: name, meta: "Known attached Lorebook", type: "lorebook", terms: `${name} lorebook attached creator`, run: () => window.open(`https://spicychat.ai/lorebook/edit/${encodeURIComponent(id)}/entries`, "_blank", "noopener") });
    }

    const personas = Array.isArray(result.personas) ? result.personas : (Array.isArray(result.savedPersonas) ? result.savedPersonas : []);
    for (const persona of personas.slice(0, 200)) {
      const name = clean(persona?.name || persona?.title || persona?.id || "Persona");
      const id = clean(persona?.id || name.toLowerCase());
      out.push({ id: `persona:${id}`, title: name, meta: "Saved persona", type: "persona", terms: `${name} persona saved`, run: () => openOptions("personas-memory", name) });
    }
    return out;
  }

  function fuzzyScore(text, query) {
    const hay = String(text || "").toLowerCase();
    const needle = String(query || "").toLowerCase().trim();
    if (!needle) return 1;
    if (hay === needle) return 10000;
    if (hay.startsWith(needle)) return 6000 - hay.length;
    const direct = hay.indexOf(needle);
    if (direct >= 0) return 4500 - direct;
    const terms = needle.split(/\s+/).filter(Boolean);
    if (terms.length > 1 && terms.every(term => hay.includes(term))) return 3200 + terms.reduce((n, term) => n + (hay.startsWith(term) ? 80 : 0), 0);
    let pos = 0;
    let gaps = 0;
    for (const ch of needle.replace(/\s+/g, "")) {
      const found = hay.indexOf(ch, pos);
      if (found < 0) return 0;
      gaps += found - pos;
      pos = found + 1;
    }
    return Math.max(100, 1700 - gaps * 4 - hay.length * .2);
  }

  function ranked(items, query) {
    const pinned = new Set(pins());
    const recentRank = new Map(recents().map((id, index) => [id, index]));
    return items.map(item => {
      const score = fuzzyScore(`${item.title} ${item.meta || ""} ${item.terms || ""}`, query);
      return { item, score: score + (pinned.has(item.id) ? 900 : 0) + (recentRank.has(item.id) ? Math.max(0, 400 - recentRank.get(item.id) * 25) : 0) };
    }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title)).slice(0, 60).map(row => row.item);
  }

  function render(items, query) {
    const overlay = document.getElementById(OVERLAY_ID);
    const list = overlay?.querySelector(".ds-cp-list");
    if (!list) return;
    currentItems = ranked(items, query);
    selectedIndex = Math.min(selectedIndex, Math.max(0, currentItems.length - 1));
    const pinned = new Set(pins());
    if (!currentItems.length) {
      list.replaceChildren(Object.assign(document.createElement("div"), { className: "ds-cp-empty", textContent: "No matching QoL action or saved item." }));
      return;
    }
    list.replaceChildren(...currentItems.map((item, index) => {
      const row = document.createElement("div");
      row.className = `ds-cp-row${index === selectedIndex ? " is-selected" : ""}`;
      row.dataset.index = String(index);
      const main = document.createElement("div");
      const title = document.createElement("div"); title.className = "ds-cp-title"; title.textContent = item.title;
      const meta = document.createElement("div"); meta.className = "ds-cp-meta"; meta.textContent = item.meta || "";
      main.append(title, meta);
      const actions = document.createElement("div"); actions.className = "ds-cp-actions";
      const type = document.createElement("span"); type.className = "ds-cp-type"; type.textContent = item.type || "action";
      const pin = document.createElement("button"); pin.type = "button"; pin.className = "ds-cp-pin"; pin.textContent = pinned.has(item.id) ? "★" : "☆"; pin.title = pinned.has(item.id) ? "Unpin" : "Pin";
      pin.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); togglePin(item.id); render(items, overlay.querySelector("input")?.value || ""); });
      actions.append(type, pin);
      row.append(main, actions);
      row.addEventListener("mouseenter", () => { selectedIndex = index; render(items, overlay.querySelector("input")?.value || ""); });
      row.addEventListener("click", () => execute(item));
      return row;
    }));
  }

  function close() { document.getElementById(OVERLAY_ID)?.remove(); }

  async function execute(item) {
    if (!item) return;
    recordRecent(item.id);
    close();
    try { await item.run?.(); } catch (error) { DS.setQuickStatus?.(`Command failed: ${error?.message || error}`); }
  }

  async function open(initialQuery = "", { manual = false } = {}) {
    if (!manual && settings().enableCommandPalette === false) return;
    close(); ensureStyle();
    const overlay = document.createElement("div"); overlay.id = OVERLAY_ID;
    const dialog = document.createElement("div"); dialog.className = "ds-cp-dialog"; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", "SpicyChat QoL command palette");
    const head = document.createElement("div"); head.className = "ds-cp-head";
    const input = document.createElement("input"); input.type = "search"; input.placeholder = "Search QoL actions, bots, Lorebooks, personas…"; input.autocomplete = "off"; input.value = initialQuery;
    const key = document.createElement("span"); key.className = "ds-cp-kbd"; key.textContent = "↑↓ Enter · Esc";
    head.append(input, key);
    const list = document.createElement("div"); list.className = "ds-cp-list";
    const foot = document.createElement("div"); foot.className = "ds-cp-foot";
    const pinHint = document.createElement("span"); pinHint.textContent = "★ pin things you use a lot";
    const searchHint = document.createElement("span"); searchHint.textContent = "Search is fuzzy and includes saved local items";
    foot.append(pinHint, searchHint);
    dialog.append(head, list, foot); overlay.appendChild(dialog); document.body.appendChild(overlay);
    overlay.addEventListener("pointerdown", event => { if (event.target === overlay) close(); });
    const all = [...actionItems(), ...(await dynamicItems())];
    render(all, input.value);
    input.addEventListener("input", () => { selectedIndex = 0; render(all, input.value); });
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") { event.preventDefault(); selectedIndex = Math.min(currentItems.length - 1, selectedIndex + 1); render(all, input.value); }
      else if (event.key === "ArrowUp") { event.preventDefault(); selectedIndex = Math.max(0, selectedIndex - 1); render(all, input.value); }
      else if (event.key === "Enter") { event.preventDefault(); execute(currentItems[selectedIndex]); }
      else if (event.key === "Escape") { event.preventDefault(); close(); }
    });
    input.focus(); input.select();
  }

  function matchesShortcut(event) {
    if (event.defaultPrevented || event.repeat) return false;
    const target = event.target;
    if (target?.closest?.(`#${OVERLAY_ID}`)) return false;
    const shortcut = settings().commandPaletteShortcut || "ctrl-k";
    if (shortcut === "off") return false;
    const key = String(event.key || "").toLowerCase();
    if (key !== "k") return false;
    if (shortcut === "ctrl-k") return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
    if (shortcut === "ctrl-shift-k") return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey;
    if (shortcut === "alt-k") return event.altKey && !event.ctrlKey && !event.metaKey;
    return false;
  }

  document.addEventListener("keydown", event => {
    if (!matchesShortcut(event)) return;
    event.preventDefault(); event.stopPropagation(); open();
  }, true);

  DS.openCommandPalette = query => open(String(query || ""), { manual: true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "DS_OPEN_COMMAND_PALETTE") {
      open(String(message.query || ""), { manual: true }).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === "DS_CLEAR_COMMAND_PALETTE_HISTORY") {
      try { localStorage.removeItem(PINS_KEY); localStorage.removeItem(RECENT_KEY); } catch {}
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})();
