(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const TOOLBAR_CLASS = "ds-bot-editor-save-actions";
  const PENDING_KEY = "dsBotEditorSaveActionV1";
  const MAX_PENDING_MS = 45000;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizedPath() {
    return String(location.pathname || "")
      .replace(/^\/[a-z]{2}(?=\/)/i, "")
      .replace(/\/+$/, "") || "/";
  }

  function editorInfo() {
    const path = normalizedPath();
    if (path === "/chatbot/create" || path === "/create/chatbot" || path === "/create") {
      return { mode: "create", id: "", path };
    }

    let match = path.match(/^\/chatbot\/([^/]+)\/edit$/i);
    if (match) return { mode: "edit", id: decodeURIComponent(match[1]), path };

    match = path.match(/^\/chatbot\/edit\/([^/]+)$/i);
    if (match) return { mode: "edit", id: decodeURIComponent(match[1]), path };

    if (path === "/chatbot/edit" || path.startsWith("/chatbot/edit/")) {
      const params = new URLSearchParams(location.search || "");
      const id = clean(params.get("id") || params.get("chatbotId") || params.get("characterId"));
      return { mode: "edit", id, path };
    }

    return null;
  }

  function editorForm() {
    if (!editorInfo()) return null;
    const field = document.querySelector(
      '[data-field-name="name"] input, input[name="name"], [data-field-name="greeting"] textarea, textarea[name="greeting"]'
    );
    return field?.closest?.("form") || document.querySelector("form[data-testid*='Chatbot'], form[data-testid*='Character']") || null;
  }

  function botNameFromEditor() {
    const direct = document.querySelector(
      '[data-field-name="name"] input, input[name="name"], input[name="title"], input[placeholder*="name" i]'
    );
    if (direct && !direct.closest("#ds-qol-panel")) return clean(direct.value);

    for (const input of document.querySelectorAll("input[type='text'], input:not([type])")) {
      if (input.closest("#ds-qol-panel, .ds-bot-editor-save-actions")) continue;
      const holder = input.closest("label, [data-field-name], div") || input.parentElement;
      const text = clean(holder?.textContent).toLowerCase();
      if (/\b(name|chatbot name|character name)\b/.test(text)) return clean(input.value);
    }
    return "";
  }

  function nativeSaveButton() {
    const info = editorInfo();
    const form = editorForm();
    if (!info || !form) return null;

    const candidates = [...form.querySelectorAll("button")].filter(button => {
      if (button.closest("#ds-qol-panel, .ds-bot-editor-save-actions")) return false;
      const text = clean(button.textContent).toLowerCase();
      const aria = clean(button.getAttribute("aria-label")).toLowerCase();
      const key = clean(button.querySelector("[data-translate-key]")?.getAttribute("data-translate-key")).toLowerCase();
      return ["save", "update", "create"].includes(text) ||
        ["save", "update", "create"].includes(aria) ||
        /(?:^|[.:_-])(save|update|create)(?:$|[.:_-])/.test(key);
    });

    return candidates.find(button => button.type === "submit") || candidates[candidates.length - 1] || null;
  }

  function writePending(value) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(value)); } catch {}
  }

  function readPending() {
    try {
      const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
      if (!value || typeof value !== "object") return null;
      return value;
    } catch {
      return null;
    }
  }

  function clearPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
  }

  function botIdFromProfileHref(href) {
    try {
      const url = new URL(href, location.origin);
      const match = url.pathname.match(/^\/chatbot\/([^/?#]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : "";
    } catch {
      return "";
    }
  }


  function currentEditorBotId() {
    const canonical = document.querySelector("link[rel='canonical'][href*='/chatbot/']")?.href || "";
    const fromCanonical = botIdFromProfileHref(canonical);
    if (fromCanonical && !["create", "edit"].includes(fromCanonical.toLowerCase())) return fromCanonical;

    for (const anchor of document.querySelectorAll("a[href*='/chatbot/']")) {
      const id = botIdFromProfileHref(anchor.href);
      if (id && !["create", "edit"].includes(id.toLowerCase())) return id;
    }
    return "";
  }


  function botIdFromCurrentLocation() {
    const path = normalizedPath();
    let match = path.match(/^\/chatbot\/([^/]+)$/i);
    if (match && !["create", "edit"].includes(match[1].toLowerCase())) return decodeURIComponent(match[1]);
    match = path.match(/^\/chat\/([^/]+)(?:\/|$)/i);
    if (match) return decodeURIComponent(match[1]);
    return "";
  }

  function resolveCreatedBotId(name) {
    const wanted = clean(name).toLowerCase();
    if (!wanted) return "";

    for (const anchor of document.querySelectorAll("a[href*='/chatbot/']")) {
      if (anchor.closest("#ds-qol-panel, .ds-bot-editor-save-actions")) continue;
      const id = botIdFromProfileHref(anchor.href);
      if (!id) continue;
      const card = anchor.closest("article, [class*='card'], [class*='rounded']") || anchor.parentElement;
      const title = clean(DS.getCardTitle?.(card) || anchor.textContent).toLowerCase();
      if (title === wanted) return id;
    }

    for (const pair of DS.collectCards?.() || []) {
      const title = clean(DS.getCardTitle?.(pair.card)).toLowerCase();
      if (title !== wanted) continue;
      const id = DS.chatIdFromHref?.(pair.anchor?.href || "");
      if (id) return id;
    }

    return "";
  }

  function editUrl(id, pending = null) {
    const wanted = clean(id);
    const remembered = clean(pending?.editorUrl);
    if (wanted && remembered) {
      try {
        const url = new URL(remembered, location.origin);
        const path = url.pathname.replace(/^\/[a-z]{2}(?=\/)/i, "").replace(/\/+$/, "");
        const encoded = encodeURIComponent(wanted);
        if (path === `/chatbot/edit/${encoded}` || path === `/chatbot/${encoded}/edit`) {
          return url.href;
        }
      } catch {}
    }

    // SpicyChat's current editor route is /chatbot/edit/<id>. Keep this as
    // the fallback for newly-created bots where there was no editor URL yet.
    return `${location.origin}/chatbot/edit/${encodeURIComponent(wanted)}`;
  }

  function chatUrl(id) {
    return `${location.origin}/chat/${encodeURIComponent(id)}`;
  }

  function nativeSaveBusy(button = nativeSaveButton()) {
    if (!button) return false;
    if (button.disabled) return true;
    if (button.getAttribute("aria-busy") === "true") return true;
    if (["loading", "pending", "saving"].includes(clean(button.dataset?.state).toLowerCase())) return true;
    const text = clean(`${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`).toLowerCase();
    return /\b(saving|updating|creating)\b/.test(text);
  }

  function hasNoChangesNotice() {
    const selectors = [
      "[role='alert']",
      "[role='status']",
      "[data-sonner-toast]",
      "[data-testid*='toast' i]",
      "[class*='toast' i]"
    ];
    for (const node of document.querySelectorAll(selectors.join(","))) {
      if (/\bno changes(?: detected)?\b/i.test(clean(node.textContent))) return true;
    }
    return false;
  }

  function pendingMatches(a, b) {
    return !!a && !!b && Number(a.startedAt || 0) === Number(b.startedAt || 0) && clean(a.action) === clean(b.action);
  }

  function completeSamePageAction(pending) {
    const current = readPending();
    if (!pendingMatches(current, pending)) return false;
    if (normalizedPath() !== pending.sourcePath) return false;

    const id = clean(pending.id) || currentEditorBotId();
    clearPending();

    if (pending.action === "chat" && id) {
      if (pending.newTab) {
        let opened = null;
        try { opened = window.open(chatUrl(id), pending.targetName || "_blank"); } catch {}
        if (!opened) location.href = chatUrl(id);
      } else {
        location.href = chatUrl(id);
      }
    }

    return true;
  }

  function watchSamePageSave(pending) {
    if (!pending || pending.mode !== "edit") return;

    const checks = [80, 180, 350, 700, 1400, 3200];
    for (const delay of checks) {
      setTimeout(() => {
        const current = readPending();
        if (!pendingMatches(current, pending)) return;
        if (normalizedPath() !== pending.sourcePath) {
          DS.scheduleRun?.({ priority: "critical", source: "bot-editor-save-route" });
          return;
        }

        // SpicyChat can keep the editor open and simply report that there was
        // nothing to save. In that case the pending action must be cleared now;
        // otherwise the user's later Back navigation looks like the save redirect.
        if (hasNoChangesNotice()) {
          completeSamePageAction(pending);
          return;
        }

        // Some save paths finish in-place without a toast. Once the normal save
        // window has had time to settle and the native button is idle again, the
        // editor itself is already the correct Save & Stay destination.
        if (delay >= 3200 && !nativeSaveBusy()) completeSamePageAction(pending);
      }, delay);
    }
  }

  function finishPendingAction() {
    const pending = readPending();
    if (!pending) return false;

    if (Date.now() - Number(pending.startedAt || 0) > MAX_PENDING_MS) {
      clearPending();
      DS.setQuickStatus?.("Save action timed out. The bot should still be saved normally.");
      return false;
    }

    const info = editorInfo();
    if (info && normalizedPath() === pending.sourcePath) {
      // If SpicyChat kept the editor open (for example, "No changes detected"),
      // this is already the Save & Stay destination. Clear the stale action as
      // soon as that state is visible so a later Back click cannot re-fire it.
      if (hasNoChangesNotice()) return completeSamePageAction(pending);
      return false;
    }

    const id = clean(pending.id) || botIdFromCurrentLocation() || resolveCreatedBotId(pending.name);
    if (!id) return false;

    clearPending();

    if (pending.action === "stay") {
      const destination = editUrl(id, pending);
      if (location.href !== destination) {
        // Replace the temporary post-save route instead of adding another
        // history entry. This keeps Back pointed at the page the user came from.
        location.replace(destination);
      }
      return true;
    }

    if (pending.action === "chat") {
      if (pending.newTab) {
        let opened = null;
        try { opened = window.open(chatUrl(id), pending.targetName || "_blank"); } catch {}
        if (!opened) {
          location.href = chatUrl(id);
          return true;
        }
        location.replace(editUrl(id, pending));
        return true;
      }

      location.href = chatUrl(id);
      return true;
    }

    return false;
  }

  async function startSaveAction(action) {
    const info = editorInfo();
    const native = nativeSaveButton();
    if (!info || !native) {
      DS.setQuickStatus?.("Could not find SpicyChat's Save button.");
      return;
    }
    if (native.disabled) {
      DS.setQuickStatus?.("Complete SpicyChat's required fields before saving.");
      return;
    }

    const settings = DS.state?.settings || {};
    const newTab = action === "chat" && !!settings.botEditorSaveChatNewTab;
    const targetName = newTab ? `ds-spicychat-save-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : "";

    if (newTab) {
      try {
        const placeholder = window.open("about:blank", targetName);
        if (placeholder?.document) {
          placeholder.document.title = "Saving chatbot…";
          placeholder.document.body.textContent = "Saving chatbot…";
        }
      } catch {}
    }

    const pending = {
      action,
      newTab,
      targetName,
      id: info.id || currentEditorBotId(),
      name: botNameFromEditor(),
      mode: info.mode,
      sourcePath: info.path,
      editorUrl: info.mode === "edit" ? location.href : "",
      startedAt: Date.now()
    };
    writePending(pending);

    // If local editor draft history is enabled, make the pre-save snapshot
    // durable before navigation can tear down the current page.
    try { await DS.captureBotEditorSnapshot?.("Before save", true); } catch {}

    try { native.click(); }
    catch { DS.realClick?.(native); }

    watchSamePageSave(pending);
  }

  function makeActionButton(text, title, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      startSaveAction(action);
    });
    return button;
  }

  function removeToolbar() {
    document.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach(el => el.remove());
  }

  function ensureToolbar() {
    const settings = DS.state?.settings || {};
    const info = editorInfo();
    if (!settings.enabled || !settings.botEditorSaveActions || !info) {
      removeToolbar();
      return;
    }

    const native = nativeSaveButton();
    if (!native?.parentElement) return;

    let toolbar = native.parentElement.querySelector(`:scope > .${TOOLBAR_CLASS}`);
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = TOOLBAR_CLASS;
      native.insertAdjacentElement("afterend", toolbar);
    }

    const signature = String(!!settings.botEditorSaveChatNewTab);
    if (toolbar.dataset.dsSignature === signature) return;
    toolbar.dataset.dsSignature = signature;
    toolbar.replaceChildren(
      makeActionButton("Save & Stay", "Save with SpicyChat, then return to this chatbot's editor", "stay"),
      makeActionButton(
        settings.botEditorSaveChatNewTab ? "Save & Chat ↗" : "Save & Chat",
        settings.botEditorSaveChatNewTab
          ? "Save, open the chat in another tab, and keep this editor available"
          : "Save, then open this chatbot's chat",
        "chat"
      )
    );
  }

  DS.applyBotEditorSaveActions = function applyBotEditorSaveActions() {
    finishPendingAction();
    ensureToolbar();
  };

  DS.removeBotEditorSaveActions = removeToolbar;
})();
