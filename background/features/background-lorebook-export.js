"use strict";

// Feature-owned background helpers: lorebook-export. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

async function setLorebookExportJob(token, value) {
  const safe = String(token || "").trim().slice(0, 140);
  if (!safe) return false;
  return new Promise(resolve => {
    chrome.storage.local.set({ [`dsLorebookExportJob:${safe}`]: value }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

function lorebookExportWorkerUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    url.searchParams.set(LOREBOOK_EXPORT_WORKER_PARAM, "1");
    return url.href;
  } catch {
    return String(rawUrl || "");
  }
}

function isLorebookExportWorkerUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    return url.hostname === "spicychat.ai" || url.hostname === "www.spicychat.ai"
      ? url.searchParams.get(LOREBOOK_EXPORT_WORKER_PARAM) === "1"
      : false;
  } catch {
    return false;
  }
}

function clearLorebookExportHelperIdleTimer() {
  if (!lorebookExportHelperIdleTimer) return;
  clearTimeout(lorebookExportHelperIdleTimer);
  lorebookExportHelperIdleTimer = null;
}

async function closeLorebookExportHelper(reason = "idle") {
  clearLorebookExportHelperIdleTimer();
  const tabId = Number(lorebookExportHelperTabId || 0);
  lorebookExportHelperTabId = 0;
  if (!tabId) return false;
  const result = await tabsRemove(tabId);
  recordHelperLifecycle("lorebookExportHelperClosed", { tabId, reason, ok: !!result?.ok }).catch(() => {});
  return !!result?.ok;
}

function scheduleLorebookExportHelperIdleClose() {
  clearLorebookExportHelperIdleTimer();
  if (lorebookExportHelperBusy > 0 || !lorebookExportHelperTabId) return;
  lorebookExportHelperIdleTimer = setTimeout(() => {
    lorebookExportHelperIdleTimer = null;
    if (lorebookExportHelperBusy > 0) return;
    closeLorebookExportHelper("idle-timeout").catch(() => {});
  }, LOREBOOK_EXPORT_HELPER_IDLE_CLOSE_MS);
}

async function findExistingLorebookExportHelper() {
  const tabs = await tabsQuery({});
  const matches = tabs.filter(tab => isLorebookExportWorkerUrl(tab?.url || tab?.pendingUrl || ""));
  matches.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  const keep = matches[0] || null;
  for (const duplicate of matches.slice(1)) {
    const duplicateId = Number(duplicate?.id || 0);
    if (duplicateId) await tabsRemove(duplicateId);
  }
  return keep;
}

async function ensureLorebookExportHelper(rawUrl) {
  clearLorebookExportHelperIdleTimer();
  const url = lorebookExportWorkerUrl(rawUrl);
  let tabId = Number(lorebookExportHelperTabId || 0);
  let tab = tabId ? await tabsGet(tabId) : null;

  if (!tab) {
    const existing = await findExistingLorebookExportHelper();
    tabId = Number(existing?.id || 0);
    tab = existing || null;
    lorebookExportHelperTabId = tabId;
  }

  if (!tabId || !tab) {
    const created = await tabsCreate({ url, active: false });
    tabId = Number(created?.tab?.id || 0);
    if (!created?.ok || !tabId) {
      lorebookExportHelperTabId = 0;
      return { ok: false, tabId: 0, reused: false, error: created?.error || "Could not create Lorebook helper tab." };
    }
    lorebookExportHelperTabId = tabId;
    recordHelperLifecycle("lorebookExportHelperOpened", { tabId }).catch(() => {});
    return { ok: true, tabId, reused: false };
  }

  const currentUrl = String(tab.pendingUrl || tab.url || "");
  if (currentUrl !== url) {
    const updated = await tabsUpdate(tabId, { url, active: false });
    if (!updated?.ok) {
      await closeLorebookExportHelper("navigation-failed").catch(() => {});
      const created = await tabsCreate({ url, active: false });
      const replacementId = Number(created?.tab?.id || 0);
      if (!created?.ok || !replacementId) {
        return { ok: false, tabId: 0, reused: false, error: created?.error || updated?.error || "Could not navigate Lorebook helper tab." };
      }
      lorebookExportHelperTabId = replacementId;
      recordHelperLifecycle("lorebookExportHelperOpened", { tabId: replacementId, reason: "navigation-recovery" }).catch(() => {});
      return { ok: true, tabId: replacementId, reused: false };
    }
  }

  recordHelperLifecycle("lorebookExportHelperReused", { tabId }).catch(() => {});
  return { ok: true, tabId, reused: true };
}

async function runLorebookExportHelperTab(tabId, message) {
  const token = String(message?.token || "").trim().slice(0, 140);
  const target = String(message?.target || "").trim().slice(0, 20);
  const id = String(message?.id || "").trim().slice(0, 200);
  if (!Number.isFinite(Number(tabId)) || !token || !["details", "entries"].includes(target)) return false;

  const deadline = Date.now() + 90_000;
  let response = null;
  try {
    while (Date.now() < deadline) {
      const tab = await tabsGet(Number(tabId));
      if (!tab) throw new Error("Lorebook export helper tab closed before collection finished.");
      response = await tabsSendMessage(Number(tabId), {
        type: "DS_LOREBOOK_EXPORT_RUN",
        token,
        target,
        id
      });
      if (response) break;
      await new Promise(resolve => setTimeout(resolve, 350));
    }

    if (!response) throw new Error("QoL could not start the Lorebook export helper in the other tab.");
    if (!response.ok) throw new Error(response.error || "Lorebook export helper failed.");
    return true;
  } catch (error) {
    await setLorebookExportJob(token, {
      status: "error",
      id,
      target,
      error: error?.message || String(error),
      finishedAt: Date.now()
    });
    return false;
  }
}

function queueLorebookExportHelper(message) {
  let acknowledge = () => {};
  let acknowledged = false;
  const accepted = new Promise(resolve => { acknowledge = resolve; });

  const task = async () => {
    lorebookExportHelperBusy += 1;
    clearLorebookExportHelperIdleTimer();
    try {
      const prepared = await ensureLorebookExportHelper(message?.url);
      if (!prepared?.ok || !prepared.tabId) {
        const error = prepared?.error || "Could not prepare Lorebook helper tab.";
        acknowledge({ ok: false, tabId: 0, error });
        acknowledged = true;
        await setLorebookExportJob(message?.token, {
          status: "error",
          id: String(message?.id || ""),
          target: String(message?.target || ""),
          error,
          finishedAt: Date.now()
        });
        return;
      }

      acknowledge({ ok: true, tabId: prepared.tabId, reused: !!prepared.reused });
      acknowledged = true;
      await runLorebookExportHelperTab(prepared.tabId, message);
    } catch (error) {
      if (!acknowledged) acknowledge({ ok: false, tabId: 0, error: error?.message || String(error) });
      await setLorebookExportJob(message?.token, {
        status: "error",
        id: String(message?.id || ""),
        target: String(message?.target || ""),
        error: error?.message || String(error),
        finishedAt: Date.now()
      }).catch(() => {});
    } finally {
      lorebookExportHelperBusy = Math.max(0, lorebookExportHelperBusy - 1);
      scheduleLorebookExportHelperIdleClose();
    }
  };

  const queued = lorebookExportHelperQueue.then(task, task);
  lorebookExportHelperQueue = queued.catch(() => {});
  return accepted;
}
