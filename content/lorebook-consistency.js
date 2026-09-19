(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const LINK_KEY = "chatbotLorebookLinks";
  const BACKUP_KEY = DS.LOREBOOK_BACKUPS_KEY || "lorebookBackups";
  const BAR_CLASS = "ds-lorebook-consistency-bar";
  const MODAL_ID = "ds-lorebook-consistency-modal";
  const QUEUE_PREFIX = "ds-qol-lorebook-next-turn-v1:";
  const processed = new Map();
  let cache = { botId: "", at: 0, relation: null, book: null };

  const clean = (value, max = 12000) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim().slice(0, max);

  function settings() { return DS.state?.settings || {}; }
  function chatPath() { return String(location.pathname || "").replace(/\/+$/, ""); }
  function chatbotId() {
    const match = chatPath().match(/^\/chat\/([^/]+)/i);
    return match ? clean(decodeURIComponent(match[1]), 200).toLowerCase() : "";
  }
  function queueKey() { return `${QUEUE_PREFIX}${encodeURIComponent(chatPath() || "/chat")}`; }

  function messageRoots() { return [...document.querySelectorAll("[id^='message-']")].filter(node => node instanceof HTMLElement); }
  function isAi(root) { return !!root?.querySelector?.("a[href*='/chatbot/'],a[aria-label='chatbot-profile']"); }
  function messageText(root) {
    const cached = DS.getCachedMessageText?.(root);
    if (typeof cached === "string" && cached.trim()) return clean(cached, 24000);
    const clone = root?.cloneNode?.(true);
    if (!clone) return "";
    clone.querySelectorAll("button,script,style,.ds-lorebook-consistency-bar,[data-ds-owned='1']").forEach(node => node.remove());
    return clean(clone.innerText || clone.textContent || "", 24000);
  }

  function keywordMatches(text, keyword) {
    const hay = String(text || "").toLocaleLowerCase();
    const needle = clean(keyword, 200).toLocaleLowerCase();
    if (!needle || needle.length < 2) return false;
    if (/^[\p{L}\p{N}_-]+$/u.test(needle)) {
      try { return new RegExp(`(^|[^\\p{L}\\p{N}_])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}_]|$)`, "iu").test(hay); }
      catch { return hay.includes(needle); }
    }
    return hay.includes(needle);
  }

  function normalizeBook(raw, id = "") {
    if (!raw || typeof raw !== "object") return null;
    const entries = Object.values(raw.entries || {}).map(entry => ({
      name: clean(entry?.name, 500),
      content: clean(entry?.content, 12000),
      keywords: [...new Set((Array.isArray(entry?.keywords) ? entry.keywords : []).map(k => clean(k, 200)).filter(Boolean))].slice(0, 12)
    })).filter(entry => entry.name && entry.keywords.length);
    return { id: clean(raw.id || id, 200), name: clean(raw.name || id, 500), entries };
  }

  async function currentBook() {
    const botId = chatbotId();
    if (!botId) return null;
    if (cache.botId === botId && Date.now() - cache.at < 30_000) return cache.book;
    const result = await DS.storageGet?.([LINK_KEY, BACKUP_KEY]) || {};
    const relation = result[LINK_KEY]?.[botId] || null;
    const store = result[BACKUP_KEY]?.meta || result[BACKUP_KEY]?.lorebooks || {};
    let book = relation?.lorebookId ? normalizeBook(store[relation.lorebookId], relation.lorebookId) : null;
    if (!book && relation?.lorebookName) {
      const wanted = clean(relation.lorebookName, 500).toLocaleLowerCase();
      const pair = Object.entries(store).find(([, item]) => clean(item?.name, 500).toLocaleLowerCase() === wanted);
      if (pair) book = normalizeBook(pair[1], pair[0]);
    }
    cache = { botId, at: Date.now(), relation, book };
    return book;
  }

  function differentialMatches(book, aiText, userText) {
    const max = Math.max(1, Math.min(5, Number(settings().lorebookConsistencyMaxEntries || 3)));
    const matched = [];
    for (const entry of book?.entries || []) {
      const newKeywords = entry.keywords.filter(keyword => keywordMatches(aiText, keyword) && !keywordMatches(userText, keyword));
      if (!newKeywords.length) continue;
      matched.push({ ...entry, matchedKeywords: newKeywords });
      if (matched.length >= max) break;
    }
    return matched;
  }

  function queuePayload(entries, sourceMessageId = "") {
    const chunks = entries.map(entry => {
      const body = clean(entry.content, 1600);
      return `${entry.name}${entry.matchedKeywords?.length ? ` (matched: ${entry.matchedKeywords.join(", ")})` : ""}${body ? `\n${body}` : ""}`;
    });
    const text = clean(`[OOC: Lorebook continuity reference for the next reply. Use these creator-defined details when relevant and do not contradict them:\n\n${chunks.join("\n\n")}]`, 4800);
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sourceMessageId, text, entries: entries.map(e => ({ name: e.name, matchedKeywords: e.matchedKeywords })), queuedAt: Date.now() };
  }

  function setQueue(entries, sourceMessageId) {
    const payload = queuePayload(entries, sourceMessageId);
    try { sessionStorage.setItem(queueKey(), JSON.stringify(payload)); } catch { return null; }
    return payload;
  }
  function readQueue() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(queueKey()) || "null");
      return raw && typeof raw === "object" && clean(raw.text, 5000) ? raw : null;
    } catch { return null; }
  }
  function clearQueue(id = "") {
    const current = readQueue();
    if (id && current?.id && current.id !== id) return false;
    try { sessionStorage.removeItem(queueKey()); return true; } catch { return false; }
  }

  function closeModal() { document.getElementById(MODAL_ID)?.remove(); }
  function showEntries(entries, bookName = "Lorebook") {
    closeModal();
    const overlay = document.createElement("div"); overlay.id = MODAL_ID;
    Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "2147483001", background: "rgba(0,0,0,.68)", display: "grid", placeItems: "center", padding: "18px" });
    const panel = document.createElement("div");
    Object.assign(panel.style, { width: "min(720px, 96vw)", maxHeight: "82vh", overflow: "auto", background: "#17181c", color: "#fff", border: "1px solid rgba(255,255,255,.18)", borderRadius: "12px", padding: "14px", boxShadow: "0 18px 55px rgba(0,0,0,.55)" });
    const head = document.createElement("div"); head.style.cssText = "display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px";
    const title = document.createElement("strong"); title.textContent = `${bookName} · matched entries`;
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Close"; close.addEventListener("click", closeModal);
    head.append(title, close); panel.append(head);
    for (const entry of entries) {
      const card = document.createElement("section"); card.style.cssText = "padding:10px 0;border-top:1px solid rgba(255,255,255,.12)";
      const h = document.createElement("strong"); h.textContent = entry.name;
      const keys = document.createElement("div"); keys.style.cssText = "font-size:12px;opacity:.72;margin:3px 0 7px"; keys.textContent = `Matched: ${(entry.matchedKeywords || []).join(", ")}`;
      const body = document.createElement("div"); body.style.cssText = "white-space:pre-wrap;line-height:1.45"; body.textContent = entry.content || "No saved entry text is available in the local backup.";
      card.append(h, keys, body); panel.append(card);
    }
    overlay.append(panel); overlay.addEventListener("click", event => { if (event.target === overlay) closeModal(); }); document.body.append(overlay);
  }

  function renderBar(root, entries, bookName) {
    const id = clean(root.id, 200) || `message-${Math.random().toString(36).slice(2)}`;
    const selector = `.${BAR_CLASS}[data-message-id="${CSS.escape(id)}"]`;
    let bar = document.querySelector(selector);
    if (!settings().lorebookConsistencyShowMatches) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement("div"); bar.className = BAR_CLASS; bar.dataset.messageId = id;
      bar.dataset.dsOwned = "1";
      Object.assign(bar.style, { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "7px", margin: "4px 10px 8px", padding: "6px 8px", border: "1px solid rgba(96,165,250,.35)", borderRadius: "8px", background: "rgba(30,64,175,.08)", fontSize: "12px" });
      root.insertAdjacentElement("afterend", bar);
    }
    bar.replaceChildren();
    const label = document.createElement("span"); label.textContent = `Lorebook: ${entries.length} new match${entries.length === 1 ? "" : "es"}`;
    const view = document.createElement("button"); view.type = "button"; view.textContent = "View"; view.addEventListener("click", () => showEntries(entries, bookName));
    const queue = document.createElement("button"); queue.type = "button";
    const queued = readQueue()?.sourceMessageId === id;
    queue.textContent = queued ? "Queued for next turn" : "Use next turn";
    queue.disabled = queued;
    queue.addEventListener("click", () => { setQueue(entries, id); queue.textContent = "Queued for next turn"; queue.disabled = true; });
    bar.append(label, view, queue);
  }

  DS.getLorebookConsistencyQueue = () => readQueue();
  DS.markLorebookConsistencyQueueSent = id => clearQueue(id);
  DS.clearLorebookConsistencyQueue = () => clearQueue();
  DS.queueLorebookConsistencyEntries = (entries, sourceMessageId) => setQueue(entries, sourceMessageId);

  DS.applyLorebookConsistency = async function applyLorebookConsistency() {
    const s = settings();
    if (!s.enabled || !s.enableLorebookConsistency || !DS.isSingleChatPage?.()) {
      document.querySelectorAll(`.${BAR_CLASS}`).forEach(node => node.remove());
      clearQueue();
      return;
    }
    const book = await currentBook();
    if (!book?.entries?.length) return;
    const roots = messageRoots();
    for (let i = 0; i < roots.length; i += 1) {
      const root = roots[i]; if (!isAi(root)) continue;
      const aiText = messageText(root); if (!aiText) continue;
      let userText = "";
      for (let j = i - 1; j >= 0; j -= 1) { if (!isAi(roots[j])) { userText = messageText(roots[j]); break; } }
      const signature = `${aiText.length}:${aiText.slice(-180)}`;
      if (processed.get(root.id) === signature) continue;
      processed.set(root.id, signature);
      const matches = differentialMatches(book, aiText, userText);
      if (!matches.length) continue;
      if (s.lorebookConsistencyAutoQueue !== false) setQueue(matches, root.id);
      renderBar(root, matches, book.name || "Lorebook");
    }
  };

  DS.removeLorebookConsistency = function removeLorebookConsistency() {
    document.querySelectorAll(`.${BAR_CLASS}`).forEach(node => node.remove()); closeModal(); clearQueue();
  };
})();
