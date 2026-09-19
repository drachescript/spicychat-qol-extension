(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS || window.__DS_QOL_CREATOR_WORKSPACE__) return;
  window.__DS_QOL_CREATOR_WORKSPACE__ = true;

  const PENDING_KEY = "dsPendingBotFieldRestoreV1";
  const BANNER_ID = "ds-qol-field-restore-banner";
  const EDITABLE = new Set(["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues", "tags", "visibility"]);
  const clean = value => String(value || "").trim();

  function routeBotId() {
    const path = String(location.pathname || "").replace(/\/$/, "");
    return path.match(/^\/chatbot\/edit\/([^/]+)/i)?.[1] || path.match(/^\/chatbot\/([^/]+)\/edit/i)?.[1] || "";
  }

  function nativeSet(field, value) {
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(field, value); else field.value = value;
    try { field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value })); }
    catch { field.dispatchEvent(new Event("input", { bubbles: true })); }
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fieldFor(name) {
    const map = { personality: "persona", exampleDialogues: "dialogue" };
    const nativeName = map[name] || name;
    return document.querySelector(`[name='${CSS.escape(nativeName)}']`) || (name === "description" ? document.querySelector("textarea[name='description'],input[name='description']") : null);
  }


  async function applyVisibility(value) {
    const wanted = clean(value).toLowerCase();
    if (!wanted) return false;
    const normalized = wanted === "hidden" ? "unlisted" : wanted;
    if (!["public", "private", "unlisted"].includes(normalized)) return false;
    const candidates = [...document.querySelectorAll("button[aria-labelledby]")];
    const button = candidates.find(node => clean(node.getAttribute("aria-labelledby")).toLowerCase() === normalized);
    if (!button) return false;
    try { if (typeof DS.realClick === "function") DS.realClick(button); else button.click(); } catch { return false; }
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
  }

  async function applyTags(value) {
    const tags = [...new Set(String(value || "").split(/\s*,\s*/g).map(clean).filter(Boolean))].slice(0, 30);
    if (!tags.length) return false;
    for (let attempt = 0; attempt < 12 && typeof DS.insertChatbotTagsFromList !== "function"; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (typeof DS.insertChatbotTagsFromList !== "function") return false;
    try { await DS.insertChatbotTagsFromList(tags); return true; } catch { return false; }
  }

  async function ensureAdvanced(fields) {
    if (!fields.some(name => name === "scenario" || name === "exampleDialogues")) return;
    if (fieldFor("scenario") || fieldFor("exampleDialogues")) return;
    const button = [...document.querySelectorAll("button")].find(node => clean(node.textContent).toLowerCase() === "advanced");
    if (!button) return;
    button.click();
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  let pendingCacheLoaded = false;
  let pendingCache = null;
  let pendingCacheRoute = "";
  let pendingLoadPromise = null;

  async function readPending() {
    const route = routeBotId();
    if (pendingCacheLoaded && pendingCacheRoute === route) return pendingCache;
    if (pendingLoadPromise) return pendingLoadPromise;

    pendingLoadPromise = new Promise(resolve => {
      chrome.storage.local.get([PENDING_KEY], result => resolve(result?.[PENDING_KEY] || null));
    }).then(value => {
      pendingCache = value;
      pendingCacheLoaded = true;
      pendingCacheRoute = route;
      return value;
    }).finally(() => {
      pendingLoadPromise = null;
    });

    return pendingLoadPromise;
  }

  async function clearPending() {
    pendingCache = null;
    pendingCacheLoaded = true;
    pendingCacheRoute = routeBotId();
    return new Promise(resolve => chrome.storage.local.remove([PENDING_KEY], resolve));
  }

  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes || {}, PENDING_KEY)) return;
      pendingCache = changes[PENDING_KEY]?.newValue || null;
      pendingCacheLoaded = true;
      pendingCacheRoute = routeBotId();
      if (pendingCache) DS.scheduleRun?.({ priority: "critical", source: "creator-field-restore-storage" });
      else document.getElementById(BANNER_ID)?.remove();
    });
  } catch {}

  async function applyPending(pending) {
    const fields = Object.entries(pending?.fields || {}).filter(([name, value]) => EDITABLE.has(name) && clean(value));
    // Preserve the current editor state before replacing any fields. This is a
    // manual safety checkpoint, so rotating automatic history can never delete it.
    try {
      await DS.saveCurrentOwnBotBackup?.("Safety backup before restore", { manual: true, label: "Before restore" });
    } catch {}
    await ensureAdvanced(fields.map(([name]) => name));
    let applied = 0;
    const missing = [];
    for (const [name, value] of fields) {
      if (name === "tags") {
        if (await applyTags(value)) applied++; else missing.push(name);
        continue;
      }
      if (name === "visibility") {
        if (await applyVisibility(value)) applied++; else missing.push(name);
        continue;
      }
      const field = fieldFor(name);
      if (!field || field.disabled) { missing.push(name); continue; }
      nativeSet(field, value); applied++;
    }
    await clearPending();
    document.getElementById(BANNER_ID)?.remove();
    DS.setQuickStatus?.(`Restored ${applied} field${applied === 1 ? "" : "s"} from the selected backup revision${missing.length ? `; ${missing.length} field${missing.length === 1 ? " was" : "s were"} not available on this editor` : ""}. Review before saving.`);
    DS.scheduleRun?.({ priority: "critical", source: "creator-field-restore" });
  }

  async function showPendingRestore() {
    const botId = routeBotId();
    if (!botId) { document.getElementById(BANNER_ID)?.remove(); return; }
    const pending = await readPending();
    if (!pending || clean(pending.botId) !== clean(botId) || Date.now() - Number(pending.createdAt || 0) > 30 * 60 * 1000) return;
    if (document.getElementById(BANNER_ID)) return;
    const names = Object.keys(pending.fields || {}).filter(name => EDITABLE.has(name));
    if (!names.length) { await clearPending(); return; }
    const banner = document.createElement("div"); banner.id = BANNER_ID; banner.style.cssText = "margin:10px 0;padding:10px 12px;border:1px solid rgba(96,165,250,.55);border-radius:9px;background:rgba(59,130,246,.08);display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px";
    const text = document.createElement("span"); text.textContent = `QoL backup restore ready: ${names.join(", ")}. Nothing has been changed yet.`; text.style.flex = "1 1 260px";
    const apply = document.createElement("button"); apply.type = "button"; apply.textContent = "Fill selected fields";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel restore";
    for (const button of [apply, cancel]) button.style.cssText = "border:1px solid rgba(127,127,127,.4);border-radius:7px;background:transparent;color:inherit;padding:6px 9px;cursor:pointer";
    apply.addEventListener("click", () => applyPending(pending));
    cancel.addEventListener("click", async () => { await clearPending(); banner.remove(); });
    banner.append(text, apply, cancel);
    const anchor = document.querySelector("form") || document.querySelector("main") || document.body;
    anchor.prepend(banner);
  }

  DS.applyCreatorWorkspaceRestore = showPendingRestore;
})();
