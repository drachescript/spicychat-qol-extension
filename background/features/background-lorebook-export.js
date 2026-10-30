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

// A full editor capture uses the helper twice (Details, then Entries).
// The 30-second idle timeout is useful between operations, but should not
// keep the finished helper around after the caller has the verified result.
// Serialize release with the normal helper queue so a running capture cannot
// be interrupted. Only remove a tab still marked as our dedicated worker.
function releaseLorebookExportHelperAfterCapture(rawId) {
  const id = String(rawId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id)) {
    return Promise.resolve({ ok: false, error: "Invalid Lorebook ID." });
  }
  const release = async () => {
    const tabId = Number(lorebookExportHelperTabId || 0);
    if (!tabId) return { ok: true, closed: false };
    const tab = await tabsGet(tabId);
    if (!tab) {
      clearLorebookExportHelperIdleTimer();
      lorebookExportHelperTabId = 0;
      return { ok: true, closed: false };
    }
    const url = String(tab.pendingUrl || tab.url || "");
    let matches = false;
    try {
      const parsed = new URL(url);
      const match = parsed.pathname.match(/^\/lorebook\/edit\/([^/]+)(?:\/entries)?\/?$/i);
      matches = isLorebookExportWorkerUrl(url) &&
        String(match?.[1] || "").toLowerCase() === id;
    } catch {}
    if (!matches) {
      // The tab was navigated away from our worker or belongs to another job.
      // Never close a normal tab or a worker for another Lorebook.
      return { ok: false, closed: false, error: "Helper is no longer at the requested Lorebook." };
    }
    const closed = await closeLorebookExportHelper("capture-finished");
    return { ok: closed, closed };
  };
  const queued = lorebookExportHelperQueue.then(release, release);
  lorebookExportHelperQueue = queued.catch(() => {});
  return queued;
}

// chrome.tabs.update resolves before the old document is necessarily unloaded.
// A message sent at that point can reach the previous Lorebook editor, which
// must never be allowed to complete an export for the next requested ID.
function lorebookExportHelperAtTarget(tab, targetUrl) {
  if (!tab || tab.discarded || (tab.status && tab.status !== "complete")) return false;
  try {
    const expected = new URL(lorebookExportWorkerUrl(targetUrl));
    const actual = new URL(String(tab.url || ""));
    const pending = tab.pendingUrl ? new URL(String(tab.pendingUrl)) : null;
    const host = url => url.hostname.replace(/^www\./i, "").toLowerCase();
    const path = url => decodeURIComponent(url.pathname).replace(/^\/[a-z]{2}(?=\/)/i, "").replace(/\/+$/, "").toLowerCase();
    if (expected.protocol !== "https:" || host(expected) !== "spicychat.ai") return false;
    if (actual.protocol !== expected.protocol || host(actual) !== host(expected)) return false;
    if (path(actual) !== path(expected)) return false;
    if (actual.searchParams.get(LOREBOOK_EXPORT_WORKER_PARAM) !== "1") return false;
    // A pending navigation must also agree with the requested target.
    if (pending && (host(pending) !== host(expected) || path(pending) !== path(expected))) return false;
    return true;
  } catch { return false; }
}

async function runLorebookExportHelperTab(tabId, message) {
  const token = String(message?.token || "").trim().slice(0, 140);
  const target = String(message?.target || "").trim().slice(0, 20);
  const id = String(message?.id || "").trim().slice(0, 200);
  if (!Number.isFinite(Number(tabId)) || !token || !["details", "entries"].includes(target)) return false;

  const deadline = Date.now() + 180_000;
  let response = null;
  let readySince = 0;
  try {
    while (Date.now() < deadline) {
      const tab = await tabsGet(Number(tabId));
      if (!tab) throw new Error("Lorebook export helper tab closed before collection finished.");
      if (!lorebookExportHelperAtTarget(tab, message?.url)) {
        readySince = 0;
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }
      // Require a short stable interval before contacting the content script.
      // This prevents a freshly updated tab from responding using the old DOM.
      if (!readySince) readySince = Date.now();
      if (Date.now() - readySince < 400) {
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }
      response = await tabsSendMessage(Number(tabId), {
        type: "DS_LOREBOOK_EXPORT_RUN",
        token,
        target,
        id
      });
      if (response?.ok) return true;
      if (response && !response.retryable) {
        throw new Error(response.error || "Lorebook export helper failed.");
      }
      // The previous document may be unloading, or the new one may not have
      // registered its listener. Retry only these temporary navigation states.
      response = null;
      readySince = 0;
      await new Promise(resolve => setTimeout(resolve, 350));
    }

    throw new Error("The Lorebook export helper did not finish opening the requested Lorebook in time.");
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
