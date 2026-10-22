"use strict";
// Fresh owner-editor verification for My Creations batch backups.
// Reuses one tab to avoid creating hundreds of concurrent editor windows.
let botExportHelperTabId = 0;
let botExportHelperQueue = Promise.resolve();
let botExportHelperIdleTimer = null;
const BOT_EXPORT_PARAM = "dsQolBotBackupWorker";
const BOT_EXPORT_TAB_IDLE_MS = 30000;
const BOT_EXPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i;

function botExportUrl(id) {
  return `https://spicychat.ai/chatbot/edit/${encodeURIComponent(id)}?${BOT_EXPORT_PARAM}=1`;
}
function isBotExportWorkerUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ""));
    return u.hostname.replace(/^www\./, "") === "spicychat.ai" &&
      u.searchParams.get(BOT_EXPORT_PARAM) === "1";
  } catch { return false; }
}
function validBotExportTab(tab, id) {
  try {
    const target = new URL(botExportUrl(id));
    const current = new URL(String(tab?.url || ""));
    const pending = tab?.pendingUrl ? new URL(String(tab.pendingUrl)) : null;
    const matches = url => url.hostname.replace(/^www\./, "") === "spicychat.ai" &&
      url.pathname.replace(/\/+$/, "") === target.pathname && url.searchParams.get(BOT_EXPORT_PARAM) === "1";
    return matches(current) && (!pending || matches(pending));
  } catch { return false; }
}
async function closeBotExportTab() {
  if (botExportHelperIdleTimer) clearTimeout(botExportHelperIdleTimer);
  botExportHelperIdleTimer = null;
  const id = botExportHelperTabId;
  botExportHelperTabId = 0;
  if (id) await tabsRemove(id);
}
function scheduleBotExportClose() {
  if (botExportHelperIdleTimer) clearTimeout(botExportHelperIdleTimer);
  botExportHelperIdleTimer = setTimeout(() => { closeBotExportTab().catch(() => {}); }, BOT_EXPORT_TAB_IDLE_MS);
}
async function requestFreshBotEditor(message) {
  const id = String(message?.id || "").trim().toLowerCase();
  if (!BOT_EXPORT_ID_RE.test(id)) return { ok: false, error: "Invalid owned chatbot ID." };
  if (botExportHelperIdleTimer) clearTimeout(botExportHelperIdleTimer);
  botExportHelperIdleTimer = null;
  const url = botExportUrl(id);
  let tab = botExportHelperTabId ? await tabsGet(botExportHelperTabId) : null;
  if (!tab) {
    // An MV3 worker can restart between records. Recover a leftover helper.
    const existing = (await tabsQuery({})).find(t => {
      try { const u = new URL(t.url || t.pendingUrl || ""); return u.hostname.replace(/^www\./, "") === "spicychat.ai" && u.searchParams.get(BOT_EXPORT_PARAM) === "1";
      } catch { return false; }
    });
    tab = existing || null;
    botExportHelperTabId = tab?.id || 0;
  }
  if (!tab) {
    const created = await tabsCreate({ url, active: false });
    if (!created.ok || !created.tab?.id) return { ok: false, error: created.error || "Could not open owner editor helper." };
    tab = created.tab;
    botExportHelperTabId = tab.id;
  } else if (!validBotExportTab(tab, id)) {
    const moved = await tabsUpdate(tab.id, { url, active: false });
    if (!moved.ok) return { ok: false, error: moved.error || "Could not navigate owner editor helper." };
  }
  const tabId = botExportHelperTabId;
  const deadline = Date.now() + 75000;
  let readyAt = 0;
  while (Date.now() < deadline) {
    tab = await tabsGet(tabId);
    if (!tab) throw new Error("Owner editor helper tab closed before verification.");
    if (!validBotExportTab(tab, id) || tab.status !== "complete") {
      readyAt = 0;
      await new Promise(resolve => setTimeout(resolve, 250));
      continue;
    }
    if (!readyAt) readyAt = Date.now();
    if (Date.now() - readyAt < 350) {
      await new Promise(resolve => setTimeout(resolve, 150));
      continue;
    }
    const response = await tabsSendMessageWithTimeout(tabId, { type: "DS_BOT_EXPORT_RUN", id }, 33000);
    if (response?.ok && response.id === id && response.fields) return response;
    if (response && response.retryable === false) return response;
    if (response?.error && !response.retryable) return response;
    readyAt = 0;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  return { ok: false, error: "Owner editor helper could not verify current fields before timeout." };
}
function queueFreshBotEditor(message) {
  const task = async () => {
    try { return await requestFreshBotEditor(message); }
    catch (error) { return { ok: false, error: error?.message || String(error) }; }
    finally { scheduleBotExportClose(); }
  };
  const next = botExportHelperQueue.then(task, task);
  botExportHelperQueue = next.catch(() => {});
  return next;
}
