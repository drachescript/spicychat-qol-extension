// Local per-conversation notes with an opt-in, owner-only Private/Unlisted Scenario save via the native chatbot editor.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const STORE_KEY = "chatSceneNotesV1";
  const MAX_CHARS = 4000;
  const MAX_SCENES = 1000;
  let cache = null;
  let activeKey = "";
  let loading = null;
  const ROOT_ID = "ds-qol-scene-notes-dialog";
  const BUTTON_CLASS = "ds-qol-scene-notes-button";
  const PENDING_SCENARIO = "dsQolPendingPrivateSceneScenarioV1";
  const SCENARIO_BACKUPS = "dsQolPrivateSceneOriginalsV1";
  const HANDOFF_ID = "ds-qol-scene-bot-handoff";
  const PENDING_MS = 15 * 60 * 1000;
  const EDITOR_PAGE_SESSION = `scene-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let handoffActiveBot = "";
  let handoffLastCheck = 0;
  let handoffChecking = false;
  let handoffSaveGuardInstalled = false;
  let dismissedHandoffBot = "";


  function key() {
    const match = String(location.pathname || "").match(/(?:^|\/)chat\/([a-z0-9-]{20,})\/([a-z0-9-]{20,})(?:\/|$)/i);
    return match ? `${match[1].toLowerCase()}/${match[2].toLowerCase()}` : "";
  }
  function validKey(k) { return /^[a-z0-9-]{20,}\/[a-z0-9-]{20,}$/i.test(k); }
  function cleanStore(value) {
    const out = Object.create(null);
    const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    for (const [id, raw] of Object.entries(input)) {
      if (!validKey(id)) continue;
      const text = String(typeof raw === "string" ? raw : raw?.text || "").replace(/\r\n/g, "\n").trim().slice(0, MAX_CHARS);
      if (!text) continue;
      out[id] = { text, updatedAt: Math.max(0, Number(raw?.updatedAt) || 0) };
    }
    return out;
  }
  async function ensureLoaded() {
    const now = key();
    if (!now) return null;
    if (cache && activeKey === now) return cache;
    if (loading) await loading;
    if (cache && activeKey === now) return cache;
    activeKey = now;
    loading = Promise.resolve(DS.storageGet?.([STORE_KEY])).then(result => {
      const normalized = cleanStore(result?.[STORE_KEY]);
      // Navigation can happen during storage reads; never show previous chat's data.
      if (now === key()) { cache = normalized; activeKey = now; }
    }).finally(() => { loading = null; });
    await loading;
    return now === key() ? cache : null;
  }
  function scene() { return cache && activeKey === key() ? cache[activeKey]?.text || "" : ""; }
  function directive(text = scene()) {
    const clean = String(text || "").trim();
    return clean ? `[OOC: Current scene for this conversation: ${clean}]` : "";
  }
  function composer() {
    return document.querySelector('textarea[placeholder="Message..."]') || [...document.querySelectorAll("textarea")]
      .find(el => !el.closest?.('[id^="message-"]') && /message/i.test(el.placeholder || ""));
  }
  function putValue(field, value) {
    const before = field.value;
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(field, value); else field.value = value;
      field._valueTracker?.setValue?.(before);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch { return false; }
  }
  function insertIntoDraft() {
    if (!DS.state?.settings?.enableChatSceneNotes || !key()) return false;
    const addition = directive();
    const field = composer();
    if (!addition || !field || field.disabled) return false;
    const before = String(field.value || "");
    if (before.includes(addition)) return true;
    const value = `${before}${before.trim() ? "\n\n" : ""}${addition}`;
    const max = Number(field.maxLength) > 0 ? Number(field.maxLength) : 10000;
    if (value.length > max || !putValue(field, value)) return false;
    field.focus();
    field.selectionStart = field.selectionEnd = value.length;
    return true;
  }
  async function save(text) {
    const chat = key();
    if (!chat || !DS.state?.settings?.enableChatSceneNotes) return false;
    const input = String(text || "").replace(/\r\n/g, "\n").trim().slice(0, MAX_CHARS);
    // Always reread before writing to keep other chats' existing records intact.
    const current = cleanStore((await DS.storageGet?.([STORE_KEY]))?.[STORE_KEY]);
    if (chat !== key()) return false;
    if (!current[chat] && input && Object.keys(current).length >= MAX_SCENES) return false;
    if (input) current[chat] = { text: input, updatedAt: Date.now() };
    else delete current[chat];
    const ok = await DS.storageSet?.({ [STORE_KEY]: current });
    if (!ok || chat !== key()) return false;
    cache = current; activeKey = chat;
    return true;
  }
  // A conversation has its own local scene. The native bot Scenario is shared by
  // every conversation, so changing it requires an explicit action and hard visibility checks.
  const uuidLike = value => /^[a-z0-9-]{20,}$/i.test(String(value || ""));
  function editorBotId() {
    const path = String(location.pathname || "").replace(/\/+$/, "");
    return (path.match(/^\/chatbot\/edit\/([a-z0-9-]{20,})$/i) ||
      path.match(/^\/chatbot\/([a-z0-9-]{20,})\/edit$/i) || [])[1]?.toLowerCase() || "";
  }
  function explicitPrivateOrUnlisted() {
    // Never authorize a write based on a text hint or an inferred permission.
    // The *native editor's visibly selected* Private or Unlisted choice is required.
    const choice = kind => document.querySelector(`button[aria-labelledby="${kind}"]`);
    const selected = el => !!el && (el.getAttribute("aria-pressed") === "true" ||
      el.dataset?.selected === "true" || el.dataset?.state === "active" ||
      /(?:^|\s)(?:bg-black|bg-blue-10|dark:bg-white)(?:\s|$)/.test(String(el.className || "")));
    const choices = [["public", "public"], ["private", "private"], ["hidden", "unlisted"]];
    const active = choices.filter(([kind]) => selected(choice(kind)));
    // Require exactly one positively selected native visibility option. Never
    // infer private status when the editor controls are ambiguous.
    return active.length === 1 ? active[0][1] : "unknown";
  }
  async function storageRead(name) {
    return (await DS.storageGet?.([name]))?.[name];
  }
  async function clearHandoff() {
    try { await new Promise(resolve => chrome.storage.local.remove(PENDING_SCENARIO, resolve)); }
    catch { await DS.storageSet?.({ [PENDING_SCENARIO]: null }); }
  }
  async function prepareBotScenario(text) {
    const chat = key();
    if (!DS.state?.settings?.enableChatSceneNotes || !DS.state?.settings?.chatSceneNotesEnableBotApply || !chat) return false;
    const [botId] = chat.split("/");
    const value = String(text || "").trim();
    if (!uuidLike(botId) || !value || value.length > MAX_CHARS) return false;
    if (!window.confirm("Open your bot editor and prepare these scene notes as the bot's Scenario? This is ONLY for a bot you own that stays Private or Unlisted. The Scenario affects every chat with this bot. On the editor page you'll be asked again before QoL uses the native Save button. QoL will never change the bot's visibility.")) return false;
    const stored = await DS.storageSet?.({ [PENDING_SCENARIO]: { botId, chat, scenario: value, createdAt: Date.now() } });
    if (!stored || key() !== chat) return false;
    location.assign(`/chatbot/edit/${encodeURIComponent(botId)}`);
    return true;
  }
  function findScenarioField() {
    const direct = document.querySelector('textarea[name="scenario"], input[name="scenario"]');
    if (direct && !direct.disabled) return direct;
    return null; // Fail closed if SpicyChat changes its field semantics.
  }
  function nativeEditorSaveButton(field) {
    const form = field?.closest?.("form");
    if (!form || !form.isConnected || !form.contains(field)) return null;
    const candidates = [...form.querySelectorAll("button")].filter(button => {
      if (button.disabled || button.closest(`#${HANDOFF_ID},#ds-qol-panel,.ds-bot-editor-save-actions,.ds-bot-editor-history-tools`)) return false;
      const label = String(button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const aria = String(button.getAttribute("aria-label") || "").trim().toLowerCase();
      const trans = String(button.querySelector("[data-translate-key]")?.getAttribute("data-translate-key") || "").toLowerCase();
      return ["save", "update"].includes(label) || ["save", "update"].includes(aria) ||
        /(?:^|[.:_-])(?:save|update)(?:$|[.:_-])/.test(trans);
    });
    // Fail closed on ambiguous native controls; never hit a draft or publish action.
    if (candidates.length !== 1) return null;
    return candidates[0];
  }
  function nativeSaveReady(bot, field, button) {
    return bot === editorBotId() && !!field?.isConnected && !field.disabled &&
      !!button?.isConnected && !button.disabled &&
      nativeEditorSaveButton(field) === button &&
      ["private","unlisted"].includes(explicitPrivateOrUnlisted()) &&
      !!DS.state?.settings?.enabled && !!DS.state?.settings?.enableChatSceneNotes &&
      !!DS.state?.settings?.chatSceneNotesEnableBotApply;
  }
  const waitForEditor = () => new Promise(resolve => setTimeout(resolve, 120));
  function setNativeScenario(field, value) {
    const old = String(field.value || "");
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(field, value); else field.value = value;
    field._valueTracker?.setValue?.(old);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function setOriginalBackup(botId, text) {
    const previous = (await storageRead(SCENARIO_BACKUPS)) || {};
    const copy = previous && typeof previous === "object" && !Array.isArray(previous) ? { ...previous } : {};
    copy[botId] = { scenario: String(text || "").slice(0, 12000), at: Date.now() };
    // Keep storage bounded and avoid large scene histories.
    const ids = Object.keys(copy).sort((a,b) => Number(copy[b]?.at || 0) - Number(copy[a]?.at || 0));
    ids.slice(50).forEach(id => delete copy[id]);
    return !!(await DS.storageSet?.({ [SCENARIO_BACKUPS]: copy }));
  }
  function installSaveGuard() {
    if (handoffSaveGuardInstalled) return;
    handoffSaveGuardInstalled = true;
    const protect = event => {
      if (!handoffActiveBot || editorBotId() !== handoffActiveBot) return;
      const field = findScenarioField();
      if (!field?.dataset.dsQolSceneBotApplied) return;
      let isSave = event.type === "submit";
      if (event.type === "click") {
        const button = event.target?.closest?.("button,[role=button]");
        if (!button || button.closest(`#${HANDOFF_ID},#ds-qol-panel`)) return;
        isSave = /^(?:save|update)\b/i.test(String(button.textContent || "").trim());
      }
      if (!isSave || ["private","unlisted"].includes(explicitPrivateOrUnlisted())) return;
      event.preventDefault(); event.stopImmediatePropagation();
      window.alert("QoL blocked this Scenario save: the bot must remain Private or Unlisted. Restore that visibility before saving, or undo the staged Scenario.");
    };
    document.addEventListener("click", protect, true);
    document.addEventListener("submit", protect, true);
  }
  async function showScenarioHandoff() {
    if (!DS.state?.settings?.enabled || !DS.state?.settings?.enableChatSceneNotes || !DS.state?.settings?.chatSceneNotesEnableBotApply) {
      document.getElementById(HANDOFF_ID)?.remove(); return;
    }
    const bot = editorBotId();
    if (!bot || bot === dismissedHandoffBot || handoffChecking || document.getElementById(HANDOFF_ID) || Date.now() - handoffLastCheck < 500) return;
    handoffLastCheck = Date.now(); handoffChecking = true;
    try {
      const raw = await storageRead(PENDING_SCENARIO);
      let pending = raw && raw.botId === bot && uuidLike(bot) && Date.now() - Number(raw.createdAt || 0) <= PENDING_MS && String(raw.scenario || "").trim() ? raw : null;
      const hasOriginal = !!(await storageRead(SCENARIO_BACKUPS))?.[bot];
      if (!pending && !hasOriginal) return;
      // This check runs on a fresh editor page instance, not the draft that
      // remains visible immediately after clicking the native Save button.
      let verifiedSave = false;
      if (pending?.submittedAt && pending.submittedPageSession &&
          pending.submittedPageSession !== EDITOR_PAGE_SESSION && findScenarioField() &&
          String(findScenarioField().value || "").trim() === String(pending.scenario || "").trim() &&
          ["private","unlisted"].includes(explicitPrivateOrUnlisted())) {
        verifiedSave = true;
        await clearHandoff();
        pending = null;
      }
      const parent = document.querySelector("form") || document.querySelector("main") || document.body;
      if (!parent) return;
      const bar = document.createElement("div"); bar.id = HANDOFF_ID;
      bar.style.cssText = "margin:12px 0;padding:12px;border:1px solid #888;border-radius:8px;background:#242730;color:#fff;display:flex;flex-wrap:wrap;gap:8px;align-items:center";
      const label = document.createElement("span");
      label.textContent = pending
        ? "Ready to save these Scene Notes to your bot's real Scenario. This changes the bot for every chat. Only your Private/Unlisted bots are supported; QoL does not change visibility."
        : "A previous original Scenario is saved locally for this bot. You can restore its text for review while the bot stays Private/Unlisted.";
      label.style.flex = "1 1 320px";
      const status = document.createElement("small"); status.setAttribute("role", "status"); status.style.flex = "1 1 100%";
      const add = (title, action) => { const button = document.createElement("button"); button.type = "button"; button.textContent = title; button.style.cssText = "border:1px solid #888;padding:6px 10px;border-radius:6px;background:transparent;color:inherit;cursor:pointer"; button.addEventListener("click", action); return button; };
      const apply = pending ? add("Apply & save Scenario", async () => {
        if (editorBotId() !== bot || !["private","unlisted"].includes(explicitPrivateOrUnlisted())) {
          status.textContent = "Not saved: this bot must be yours and visibly Private or Unlisted."; return;
        }
        let field = findScenarioField();
        if (!field) {
          const advanced = [...document.querySelectorAll("button")].find(b => String(b.textContent || "").trim().toLowerCase() === "advanced");
          if (advanced) { advanced.click(); await new Promise(resolve => setTimeout(resolve, 300)); }
          field = findScenarioField();
        }
        let nativeSave = nativeEditorSaveButton(field);
        if (!nativeSaveReady(bot, field, nativeSave)) {
          status.textContent = "Couldn't verify the native Scenario form, Save control or private/unlisted visibility. Nothing was saved."; return;
        }
        if (!window.confirm("Apply this scene to the bot's actual Scenario and SAVE it now through SpicyChat? This replaces the shared Scenario for all conversations with this bot. Every other changed field in the native editor would also be saved. Continue?")) return;
        apply.disabled = true;
        const previousValue = String(field.value || "");
        const intended = String(pending.scenario).slice(0, MAX_CHARS);
        try {
          if (!pending.originalBackedUp) {
            if (!await setOriginalBackup(bot, previousValue)) {
              status.textContent = "Couldn't back up the original Scenario. No save attempted."; return;
            }
          }
          if (!nativeSaveReady(bot, field, nativeSave)) {
            status.textContent = "Editor or visibility changed during the backup. No save attempted."; return;
          }
          setNativeScenario(field, intended);
          field.dataset.dsQolSceneBotApplied = "1";
          handoffActiveBot = bot;
          installSaveGuard();
          // Give React one event turn to commit the controlled input before saving.
          await waitForEditor();
          nativeSave = nativeEditorSaveButton(field);
          if (!nativeSaveReady(bot, field, nativeSave) || String(field.value || "") !== intended) {
            status.textContent = "Native Scenario field or visibility changed. Save was cancelled; review the editor."; return;
          }
          const nativeForm = field.closest("form");
          if (nativeForm?.checkValidity?.() === false) {
            nativeForm.reportValidity?.();
            status.textContent = "SpicyChat's editor has invalid fields. Fix them before trying Apply & save again."; return;
          }
          // Save attempt persisted across navigation for an optional fresh-editor
          // verification. Do NOT say the server saved until verified.
          const recorded = await DS.storageSet?.({ [PENDING_SCENARIO]: { ...pending, originalBackedUp: true, submittedAt: Date.now(), submittedPageSession: EDITOR_PAGE_SESSION } });
          if (!recorded || !nativeSaveReady(bot, field, nativeSave)) {
            status.textContent = "Couldn't preserve the save attempt or verify visibility. No native save submitted."; return;
          }
          nativeSave.click(); // Uses the site's own validated editor/save workflow.
          status.textContent = "SpicyChat's Save was clicked. Await its confirmation. Reload this editor to verify the saved Scenario; a failed save can be retried and the original is kept locally.";
        } catch (error) {
          status.textContent = "The native save could not be completed. Review SpicyChat's error and retry; the original Scenario backup is retained.";
        } finally { apply.disabled = false; }
      }) : null;
      const restore = add("Restore original text", async () => {
        if (editorBotId() !== bot || !["private","unlisted"].includes(explicitPrivateOrUnlisted())) { status.textContent = "Restore requires verified Private or Unlisted visibility."; return; }
        const backup = (await storageRead(SCENARIO_BACKUPS))?.[bot];
        const field = findScenarioField();
        if (!backup || !field) { status.textContent = "No saved original Scenario or editor field available."; return; }
        if (!window.confirm("Replace the currently edited Scenario with QoL's saved original? You will still need to review and save in SpicyChat.")) return;
        setNativeScenario(field, String(backup.scenario || ""));
        delete field.dataset.dsQolSceneBotApplied;
        handoffActiveBot = "";
        status.textContent = "Original text restored in the editor. Review and save manually.";
      });
      const cancel = add("Close", async () => { if (pending) await clearHandoff(); dismissedHandoffBot = bot; bar.remove(); });
      bar.append(label, ...(apply ? [apply] : []), restore, cancel, status);
      parent.prepend(bar);
      status.textContent = verifiedSave ? "Saved Scenario verified after reopening the native editor. Your original is still available for recovery." :
        pending?.submittedAt ? "A native Save was attempted. Check SpicyChat's confirmation or try Apply & save again if it failed." :
        ["private","unlisted"].includes(explicitPrivateOrUnlisted()) ? "Ready to apply and save; your visibility is eligible." :
        "Waiting for verified Private or Unlisted visibility.";
    } finally { handoffChecking = false; }
  }
  DS.applyBotSceneScenarioHandoff = showScenarioHandoff;

  function closeDialog() { document.getElementById(ROOT_ID)?.remove(); }
  async function openDialog() {
    if (!DS.state?.settings?.enableChatSceneNotes || !key()) return;
    const chatAtOpen = key();
    await ensureLoaded();
    if (key() !== chatAtOpen || !DS.state?.settings?.enableChatSceneNotes) return;
    closeDialog();
    const backdrop = document.createElement("div"); backdrop.id = ROOT_ID;
    Object.assign(backdrop.style, { position:"fixed", inset:"0", zIndex:"2147483000", background:"rgba(0,0,0,.72)", display:"grid", placeItems:"center", padding:"16px" });
    const panel = document.createElement("section");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", "Scene notes for this conversation");
    Object.assign(panel.style, { width:"min(600px, 100%)", maxHeight:"85vh", overflow:"auto", padding:"18px", borderRadius:"12px", background:"#1c1e23", color:"#fff", border:"1px solid #555" });
    const h = document.createElement("h3"); h.textContent = "Scene notes — this conversation"; h.style.margin = "0 0 10px";
    const help = document.createElement("p");
    help.textContent = "Describe the current location, situation, timeline or scene. Saved locally for this chat only. This doesn't change the bot or native Memories. Owners can separately choose Apply & save to update their own Private/Unlisted bot's real Scenario.";
    help.style.cssText = "font-size:13px;line-height:1.5;opacity:.8";
    const area = document.createElement("textarea"); area.value = scene(); area.maxLength = MAX_CHARS;
    area.placeholder = "Example: The characters are waiting at the train station, just after sunset…";
    area.style.cssText = "box-sizing:border-box;display:block;width:100%;min-height:190px;padding:10px;resize:vertical;border-radius:7px;color:inherit;background:#262930;border:1px solid #666";
    const status = document.createElement("p"); status.setAttribute("role", "status"); status.style.cssText = "font-size:12px;min-height:18px;opacity:.8";
    const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end";
    function action(label, fn) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label;
      b.style.cssText = "background:#343942;color:inherit;border:1px solid #666;border-radius:6px;padding:8px 12px;cursor:pointer";
      b.addEventListener("click", fn); actions.appendChild(b); return b;
    }
    action("Close", closeDialog);
    action("Clear saved", async () => { if (!window.confirm("Clear this conversation's saved scene notes?")) return; if (await save("")) { area.value = ""; status.textContent = "Scene cleared."; } else status.textContent = "Could not clear this scene."; });
    action("Save", async () => { status.textContent = await save(area.value) ? "Saved for this conversation." : "Could not save; check your chat and storage."; });
    if (DS.state?.settings?.chatSceneNotesEnableBotApply && typeof DS.storageSet === "function") {
      action("Apply to my bot (Private/Unlisted)", async () => {
        if (!await save(area.value)) { status.textContent = "Save this chat scene first; couldn't stage the bot editor."; return; }
        if (!await prepareBotScenario(area.value)) status.textContent = "Not staged. Scene stays saved locally.";
      });
    }
    action("Save & insert OOC", async () => {
      if (!await save(area.value)) { status.textContent = "Could not save the scene."; return; }
      status.textContent = insertIntoDraft() ? "Inserted into your unsent draft. Review before sending." : "Saved, but no available chat composer (or message is too long).";
    });
    panel.append(h, help, area, status, actions); backdrop.append(panel); document.body.append(backdrop);
    backdrop.addEventListener("click", e => { if (e.target === backdrop) closeDialog(); });
    const onEscape = e => { if (e.key === "Escape") { closeDialog(); document.removeEventListener("keydown", onEscape); } };
    document.addEventListener("keydown", onEscape);
    area.focus();
  }
  function cleanup() { document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(el => el.remove()); closeDialog(); cache = null; activeKey = ""; }
  DS.getChatSceneSendCandidate = () => {
    const s = DS.state?.settings || {};
    if (!s.enabled || !s.enableChatSceneNotes || !s.chatSceneNotesAutoInclude || !key()) return null;
    const text = directive(); if (!text) return null;
    const mode = s.chatSceneNotesAutoMode === "every" ? "every" : "session";
    const stamp = `ds-qol-scene-sent:${key()}:${text.length}:${text.slice(0,40)}`;
    if (mode === "session") try { if (sessionStorage.getItem(stamp) === "1") return null; } catch {}
    return { text, mode, stamp, chat: key() };
  };
  DS.markChatSceneSent = candidate => { if (!candidate || candidate.chat !== key()) return; try { sessionStorage.setItem(candidate.stamp, "1"); } catch {} };
  DS.openChatSceneNotes = openDialog;
  DS.applyChatSceneNotes = function() {
    const s = DS.state?.settings || {};
    const chat = key();
    if (!s.enabled || !s.enableChatSceneNotes || !DS.isSingleChatPage?.() || !chat) { cleanup(); return; }
    if (activeKey !== chat) { cache = null; activeKey = ""; closeDialog(); }
    if (!cache && !loading) void ensureLoaded();
    if (document.querySelector(`.${BUTTON_CLASS}`)) return;
    const field = composer();
    const inputWrap = field?.closest("div.w-full.flex") || field?.parentElement?.parentElement?.parentElement;
    if (!inputWrap?.parentElement) return;
    const b = document.createElement("button"); b.type = "button"; b.className = `ds-chat-scene-shortcut ${BUTTON_CLASS}`;
    b.textContent = "Scene"; b.title = "Per-chat scene notes"; b.setAttribute("aria-label", "Edit this conversation's scene notes");
    b.style.cssText = "align-self:center;background:transparent;border:1px solid #666;border-radius:6px;padding:5px 7px;color:inherit;font-size:12px;cursor:pointer";
    b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); void openDialog(); });
    inputWrap.parentElement.insertBefore(b, inputWrap);
  };
  DS.removeChatSceneNotes = cleanup;
})();
}
