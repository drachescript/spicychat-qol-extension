// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
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
  const DEBUG_ID = "ds-qol-creator-debug-preview";
  const DEBUG_LAUNCH_ID = "ds-qol-creator-debug-launch";
  let cache = { botId: "", at: 0, relation: null, book: null };
  let processedChatPath = "";
  let lastShowMatches = null;
  const REGEX_CACHE_LIMIT = 256;
  const keywordRegexCache = new Map();

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

  // Local estimates only. Cache compiled matchers so testing hundreds of entries
  // doesn't build the same regular expression for every mounted message.
  function normalizedMatchText(text) { return String(text || "").normalize("NFKC").toLocaleLowerCase(); }
  function keywordMatches(hay, keyword) {
    const needle = clean(keyword, 200).normalize("NFKC").toLocaleLowerCase();
    if (!needle || needle.length < 2) return false;
    if (!/^[\p{L}\p{N}_-]+$/u.test(needle)) return hay.includes(needle);
    let regex = keywordRegexCache.get(needle);
    if (!regex) {
      try {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        regex = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}([^\\p{L}\\p{N}_]|$)`, "u");
      } catch { return hay.includes(needle); }
      if (keywordRegexCache.size >= REGEX_CACHE_LIMIT) keywordRegexCache.delete(keywordRegexCache.keys().next().value);
      keywordRegexCache.set(needle, regex);
    }
    return regex.test(hay);
  }

  function normalizeBook(raw, id = "") {
    if (!raw || typeof raw !== "object") return null;
    const entries = Object.values(raw.entries || {}).map(entry => ({
      name: clean(entry?.name, 500),
      content: clean(entry?.content, 12000),
      keywords: [...new Set((Array.isArray(entry?.keywords) ? entry.keywords : []).map(k => clean(k, 200)).filter(Boolean))].slice(0, 12)
    })).filter(entry => entry.name).slice(0, 1000);
    return { id: clean(raw.id || id, 200), name: clean(raw.name || id, 500), entries };
  }

  async function currentBook() {
    const botId = chatbotId();
    if (!botId) return null;
    if (cache.botId === botId && Date.now() - cache.at < 30_000) return cache.book;
    const result = await DS.storageGet?.([LINK_KEY, BACKUP_KEY]) || {};
    if (chatbotId() !== botId) return null;
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
    const aiNormalized = normalizedMatchText(aiText);
    const userNormalized = normalizedMatchText(userText);
    for (const entry of book?.entries || []) {
      const newKeywords = entry.keywords.filter(keyword => keywordMatches(aiNormalized, keyword) && !keywordMatches(userNormalized, keyword));
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

  async function showCreatorPreview() {
    document.getElementById(DEBUG_ID)?.remove();
    const book = await currentBook();
    const overlay = document.createElement("div"); overlay.id = DEBUG_ID;
    Object.assign(overlay.style, { position: "fixed", inset: 0, zIndex: 2147483599, background: "rgba(0,0,0,.70)", display: "grid", placeItems: "center", padding: "12px" });
    const panel = document.createElement("section");
    Object.assign(panel.style, { width: "min(740px,96vw)", maxHeight: "82vh", overflowY: "auto", background: "#17181c", color: "#fff", border: "1px solid #666", borderRadius: "12px", padding: "16px", fontSize: "14px" });
    const heading = document.createElement("h3"); heading.textContent = "Creator trigger preview (local estimate)";
    const note = document.createElement("p"); note.textContent = "This compares visible/local text to keywords. It CANNOT show internal prompt assembly, model reasoning, Rulebook decisions, actual Lorebook injections, or how much native context was used.";
    const source = document.createElement("p"); source.textContent = book
      ? `Locally linked Lorebook: ${book.name} · ${book.entries.length} saved entries (${book.entries.filter(entry => entry.keywords.length).length} with keywords). Other attached books or hidden versions may be missing.`
      : "No locally backed-up linked Lorebook was found for this bot. Save a backup and visit the linked bot's editor first; unknown is not no Lorebook.";
    const input = document.createElement("textarea"); input.rows = 4; input.placeholder = "Optional: paste test text here, or leave empty to inspect the newest visible chat messages";
    input.setAttribute("aria-label", "Text for local Lorebook keyword test"); Object.assign(input.style, { width: "100%", boxSizing: "border-box", background: "#202125", color: "#fff", padding: "8px", borderRadius: "6px" });
    const controls = document.createElement("div"); controls.style.cssText="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0";
    const check = document.createElement("button"); check.type = "button"; check.textContent = "Check keyword matches";
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Close";
    const out = document.createElement("div"); out.setAttribute("aria-live", "polite");
    function render() {
      out.replaceChildren();
      if (!book?.entries?.length) { out.textContent = "No local Lorebook entries to check."; return; }
      const chatRoots = messageRoots().slice(-12);
      const text = normalizedMatchText(clean(input.value || chatRoots.map(root => messageText(root)).join("\n"), 25000));
      const total = chatRoots.length;
      const matching = [];
      let approxChars = 0;
      for (const entry of book.entries) {
        const hits = entry.keywords.filter(key => keywordMatches(text, key));
        if (!hits.length) continue;
        matching.push({ entry, hits }); approxChars += entry.content.length;
      }
      const summary = document.createElement("p");
      summary.textContent = `${matching.length}/${book.entries.length} local entries have matching keywords in ${input.value ? "test text" : `${total} loaded messages`}. Their saved entry bodies total roughly ${Math.round(approxChars / 4)} estimated tokens BEFORE native priority, activation, and context limits.`;
      out.append(summary);
      // These are local-authoring warnings, NOT evidence of what the native
      // Lorebook engine inserted into a generation.
      const owners = new Map();
      for (const entry of book.entries) for (const keyword of entry.keywords) {
        const key = clean(keyword, 200).normalize("NFKC").toLocaleLowerCase();
        if (!key) continue;
        const list = owners.get(key) || new Set();
        list.add(entry.name); owners.set(key, list);
      }
      const repeats = [...owners.entries()].filter(([, names]) => names.size > 1);
      const longEntries = book.entries.filter(entry => entry.content.length > 2000);
      const unkeyworded = book.entries.filter(entry => !entry.keywords.length);
      if (repeats.length || longEntries.length || unkeyworded.length) {
        const warning = document.createElement("details");
        warning.style.cssText = "margin:8px 0;padding:7px 9px;border:1px solid rgba(245,158,11,.45);border-radius:7px";
        const heading = document.createElement("summary");
        heading.textContent = `Local authoring checks: ${repeats.length} reused keyword${repeats.length === 1 ? "" : "s"}, ${longEntries.length} long entr${longEntries.length === 1 ? "y" : "ies"}, ${unkeyworded.length} without keywords`;
        warning.append(heading);
        for (const [keyword, names] of repeats.slice(0, 20)) {
          const line = document.createElement("p");
          line.textContent = `Keyword “${keyword}” appears in: ${[...names].join(", ")}`;
          warning.append(line);
        }
        if (repeats.length > 20) warning.append(document.createTextNode(`Showing 20 of ${repeats.length} reused keywords.`));
        for (const entry of longEntries.slice(0, 12)) {
          const line = document.createElement("p");
          line.textContent = `${entry.name}: ${entry.content.length.toLocaleString()} characters in the saved backup`;
          warning.append(line);
        }
        if (longEntries.length > 12) warning.append(document.createTextNode(`Showing 12 of ${longEntries.length} long entries.`));
        for (const entry of unkeyworded.slice(0, 12)) {
          const line = document.createElement("p");
          line.textContent = `${entry.name}: no locally saved keywords`;
          warning.append(line);
        }
        if (unkeyworded.length > 12) warning.append(document.createTextNode(`Showing 12 of ${unkeyworded.length} entries without keywords.`));
        out.append(warning);
      }
      for (const {entry,hits} of matching.slice(0,80)) {
        const row = document.createElement("div"); row.style.cssText="padding:8px 0;border-top:1px solid #444";
        const label = document.createElement("strong"); label.textContent = entry.name;
        const keys = document.createElement("p"); keys.textContent = `Possible matches: ${hits.join(", ")} · entry body approx. ${Math.round(entry.content.length / 4)} tokens`;
        keys.style.cssText="margin:3px 0;opacity:.8";
        if (entry.content.length > 4000) keys.textContent += " · long entry — consider trimming";
        row.append(label,keys); out.append(row);
      }
      if (matching.length > 80) out.append(document.createTextNode("Only first 80 matches are shown."));
      const matchedNames = new Set(matching.map(match => match.entry));
      const missing = book.entries.filter(entry => !matchedNames.has(entry));
      if (missing.length) {
        const note = document.createElement("details");
        const title = document.createElement("summary"); title.textContent = `${missing.length} entries without local keyword hits (expand)`;
        note.append(title);
        for (const entry of missing.slice(0, 40)) {
          const line = document.createElement("p"); line.style.cssText = "margin:5px 0;font-size:12px";
          line.textContent = `${entry.name}: ${entry.keywords.join(", ")}`;
          note.append(line);
        }
        if (missing.length > 40) note.append(document.createTextNode("Showing the first 40 unmatched entries."));
        out.append(note);
      }
      if (!matching.length) out.append(document.createTextNode("No keyword hits in this sample; this does not prove the native engine didn't activate entries."));
    }
    check.addEventListener("click", render);
    close.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", event => { if (event.target === overlay) overlay.remove(); });
    controls.append(check, close);
    panel.append(heading, note, source, input, controls, out); overlay.append(panel);
    document.body.append(overlay);
    render();
  }
  DS.openCreatorTriggerPreview = showCreatorPreview;
  function updateCreatorDebugLaunch() {
    const wanted = settings().enabled && settings().enableCreatorTriggerPreview && DS.isSingleChatPage?.() && !DS.isQolPausedForTab?.();
    let launch = document.getElementById(DEBUG_LAUNCH_ID);
    if (!wanted) { launch?.remove(); document.getElementById(DEBUG_ID)?.remove(); return; }
    if (launch?.isConnected) return;
    launch = document.createElement("button"); launch.id = DEBUG_LAUNCH_ID; launch.type = "button";
    launch.textContent = "Trigger preview";
    launch.title = "Local Lorebook keyword estimates — not the actual SpicyChat engine";
    launch.setAttribute("aria-label", "Open local creator trigger preview");
    Object.assign(launch.style, { position: "fixed", right: "10px", bottom: "82px", zIndex: "80000", padding: "6px 9px", border: "1px solid #666", borderRadius: "8px", background: "#24262e", color: "white", fontSize: "12px" });
    launch.addEventListener("click", () => { void showCreatorPreview(); });
    document.body.append(launch);
  }

  DS.getLorebookConsistencyQueue = () => readQueue();
  DS.markLorebookConsistencyQueueSent = id => clearQueue(id);
  DS.clearLorebookConsistencyQueue = () => clearQueue();
  DS.queueLorebookConsistencyEntries = (entries, sourceMessageId) => setQueue(entries, sourceMessageId);

  DS.applyLorebookConsistency = async function applyLorebookConsistency() {
    const path = chatPath();
    if (processedChatPath !== path) {
      processed.clear();
      processedChatPath = path;
      document.querySelectorAll(`.${BAR_CLASS}`).forEach(node => node.remove());
    }
    const s = settings();
    updateCreatorDebugLaunch();
    if (lastShowMatches !== !!s.lorebookConsistencyShowMatches) {
      // A visibility toggle must refresh previously skipped/hidden badges.
      lastShowMatches = !!s.lorebookConsistencyShowMatches;
      processed.clear();
      if (!lastShowMatches) document.querySelectorAll(`.${BAR_CLASS}`).forEach(node => node.remove());
    }
    if (!s.enabled || !s.enableLorebookConsistency || !DS.isSingleChatPage?.()) {
      document.querySelectorAll(`.${BAR_CLASS}`).forEach(node => node.remove());
      processed.clear();
      clearQueue();
      return;
    }
    const book = await currentBook();
    if (chatPath() !== path || !settings().enabled || !settings().enableLorebookConsistency) return;
    if (!book?.entries?.length) {
      document.querySelectorAll(`.${BAR_CLASS}`).forEach(node => node.remove());
      processed.clear();
      return;
    }
    const roots = messageRoots();
    for (let i = 0; i < roots.length; i += 1) {
      const root = roots[i]; if (!isAi(root)) continue;
      const aiText = messageText(root); if (!aiText) continue;
      let userText = "";
      for (let j = i - 1; j >= 0; j -= 1) { if (!isAi(roots[j])) { userText = messageText(roots[j]); break; } }
      const signature = `${aiText.length}:${aiText.slice(-180)}`;
      if (processed.get(root.id) === signature) continue;
      processed.set(root.id, signature);
      if (processed.size > 240) processed.delete(processed.keys().next().value);
      const matches = differentialMatches(book, aiText, userText);
      if (!matches.length) {
        // A regenerated answer can lose all its previous keyword hits.
        root.nextElementSibling?.classList?.contains(BAR_CLASS) && root.nextElementSibling.remove();
        continue;
      }
      if (s.lorebookConsistencyAutoQueue === true) setQueue(matches, root.id);
      renderBar(root, matches, book.name || "Lorebook");
    }
  };

  DS.removeLorebookConsistency = function removeLorebookConsistency() {
    document.querySelectorAll(`.${BAR_CLASS}`).forEach(node => node.remove()); closeModal(); clearQueue();
    processed.clear(); processedChatPath = ""; keywordRegexCache.clear(); lastShowMatches = null;
    document.getElementById(DEBUG_LAUNCH_ID)?.remove(); document.getElementById(DEBUG_ID)?.remove();
  };
})();

}
