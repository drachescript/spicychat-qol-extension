// QoL 0.2.26 Options additions.
// options.html already referenced this compatibility slot, so the large
// options.js can stay untouched while this release adds the new controls.
(() => {
  "use strict";
  if (globalThis.__dsQolV026OptionsLayer) return;
  globalThis.__dsQolV026OptionsLayer = true;

  const PAGE = 10;
  const DISCOVERY_KEY = "botDiscoveryIndexV1";
  let discoveries = { meta: {} };

  const later = (fn, ms = 0) => setTimeout(() => {
    try { fn(); } catch (error) { console.warn("[QoL 0.2.26 options]", error); }
  }, ms);
  const clean = value => String(value || "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/\s+/g, " ").trim();
  const genericNames = new Set([
    "unknown", "unknown bot", "unknown character", "chatbot", "character", "bot",
    "for you", "recommended for you", "chatbot under review", "character under review",
    "under review", "view chatbot", "open chatbot", "private chatbot", "deleted chatbot",
    "not available", "unavailable"
  ]);

  function cleanBotName(value, id = "") {
    let text = clean(value);
    if (!text || text.toLowerCase() === String(id || "").toLowerCase() || genericNames.has(text.toLowerCase())) return "";
    const keepSeparator = token => /^(?:\||\/|[-–—]|[x×])$/i.test(token);
    const ornamentOnly = token => /^(?:୨୧|[⏝⟡⁀➴ೃ࿔̊☾✦★☆♡♥ღ༄࿐])+$/u.test(token);
    text = text.split(/\s+/).filter(token => {
      if (ornamentOnly(token)) return false;
      if (/[\p{L}\p{N}]/u.test(token)) return true;
      return keepSeparator(token);
    }).join(" ")
      .replace(/^(?:\||\/|[-–—]|[x×])\s+/i, "")
      .replace(/\s+(?:\||\/|[-–—]|[x×])$/i, "")
      .replace(/(?:\s+\|){2,}/g, " |")
      .replace(/\s+/g, " ").trim();
    return genericNames.has(text.toLowerCase()) ? "" : text.slice(0, 180);
  }

  function storageGet(keys) {
    return new Promise(resolve => {
      try { chrome.storage.local.get(keys, value => resolve(chrome.runtime.lastError ? {} : (value || {}))); }
      catch { resolve({}); }
    });
  }

  function addStyles() {
    if (document.getElementById("ds-v026-options-style")) return;
    const style = document.createElement("style");
    style.id = "ds-v026-options-style";
    style.textContent = `
      .account-sync-category-details { margin: 12px 0; }
      .account-sync-category-details > summary { cursor: pointer; font-weight: 600; }
      .account-sync-category-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 14px;margin:10px 0; }
      .account-sync-category-grid .row { margin:0; }
      .ds-v026-sync-transfer,.ds-v026-backup-pager { margin-top:10px; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Every manager that previously started at 20 now visually starts at 10.
  // The original renderers can continue creating 20/40/etc rows; this layer
  // only limits what is shown, so we do not have to fork their large code.
  function capList(host) {
    if (!host) return;
    const limit = Math.max(PAGE, Number(host.dataset.dsV026Visible || PAGE));
    [...host.children].forEach((row, index) => { row.hidden = index >= limit; });
  }

  function installListPaging() {
    for (const host of document.querySelectorAll(".bot-manager-list")) {
      if (host.dataset.dsV026Paging === "1") continue;
      host.dataset.dsV026Paging = "1";
      host.dataset.dsV026Visible = String(PAGE);
      capList(host);
      new MutationObserver(() => later(() => capList(host))).observe(host, { childList: true });

      const pager = host.nextElementSibling?.classList?.contains("bot-manager-pager")
        ? host.nextElementSibling
        : host.parentElement?.querySelector?.(".bot-manager-pager");
      if (!pager) continue;
      for (const button of pager.querySelectorAll("button")) {
        const original = clean(button.textContent);
        if (original === "Show 20 more") {
          button.textContent = "Show 10 more";
          button.addEventListener("click", () => {
            host.dataset.dsV026Visible = String(Number(host.dataset.dsV026Visible || PAGE) + PAGE);
            later(() => capList(host), 0);
          }, true);
        } else if (original === "Show first 20") {
          button.textContent = "Show first 10";
          button.addEventListener("click", () => {
            host.dataset.dsV026Visible = String(PAGE);
            later(() => capList(host), 0);
          }, true);
        }
      }
    }
  }

  function installBackupPaging() {
    const host = document.getElementById("creatorBackupManager");
    if (!host || host.dataset.dsV026Paging === "1") return;
    host.dataset.dsV026Paging = "1";
    host.dataset.dsV026Visible = String(PAGE);
    const pager = document.createElement("div");
    pager.className = "button-row ds-v026-backup-pager";
    pager.innerHTML = '<button type="button" data-action="more">Show 10 more</button><button type="button" data-action="first">Show first 10</button><button type="button" data-action="all">Show all</button>';
    host.insertAdjacentElement("afterend", pager);
    const refresh = () => {
      capList(host);
      const total = host.children.length;
      const visible = Number(host.dataset.dsV026Visible || PAGE);
      const more = pager.querySelector('[data-action="more"]');
      const first = pager.querySelector('[data-action="first"]');
      if (more) more.hidden = visible >= total;
      if (first) first.hidden = visible <= PAGE;
      pager.hidden = total <= PAGE;
    };
    new MutationObserver(() => later(refresh)).observe(host, { childList: true });
    pager.addEventListener("click", event => {
      const action = event.target?.closest?.("button")?.dataset?.action;
      if (!action) return;
      if (action === "more") host.dataset.dsV026Visible = String(Number(host.dataset.dsV026Visible || PAGE) + PAGE);
      else if (action === "first") host.dataset.dsV026Visible = String(PAGE);
      else if (action === "all") host.dataset.dsV026Visible = String(Math.max(PAGE, host.children.length));
      refresh();
    });
    for (const id of ["creatorBackupSearch", "creatorBackupType"]) {
      document.getElementById(id)?.addEventListener(id.endsWith("Search") ? "input" : "change", () => {
        host.dataset.dsV026Visible = String(PAGE);
        later(refresh);
      });
    }
    refresh();
  }

  function injectLessLikeOnBlock() {
    if (document.getElementById("quickLessLikeOnBlock")) return;
    const dislike = document.getElementById("quickDislikeOnBlock");
    const row = dislike?.closest?.("label.row");
    if (!row) return;
    const label = document.createElement("label");
    label.className = "row";
    label.innerHTML = '<input id="quickLessLikeOnBlock" type="checkbox"><span>Also use Less Like This after I block it (opt-in, desktop browser only)</span>';
    row.insertAdjacentElement("afterend", label);
    storageGet(["settings"]).then(data => {
      const input = document.getElementById("quickLessLikeOnBlock");
      if (input) input.checked = data.settings?.quickLessLikeOnBlock === true;
    });
    label.querySelector("input")?.addEventListener("change", event => {
      try { queueSettingsAutosaveValue("quickLessLikeOnBlock", !!event.target.checked, { delay: 0 }); } catch {}
    });
  }

  function patchSettingsReaders() {
    try { DEFAULT_SETTINGS.quickLessLikeOnBlock = false; } catch {}
    const readAll = readSettingsFromPage;
    readSettingsFromPage = function v026ReadSettings() {
      return { ...readAll(), quickLessLikeOnBlock: !!document.getElementById("quickLessLikeOnBlock")?.checked };
    };
    const readOne = readSingleSettingFromPage;
    readSingleSettingFromPage = function v026ReadOne(key) {
      if (String(key) === "quickLessLikeOnBlock") return !!document.getElementById("quickLessLikeOnBlock")?.checked;
      return readOne(key);
    };
  }

  function explainBlockedTags() {
    const blocked = document.getElementById("blockedTags");
    if (!blocked || document.querySelector(".ds-v026-blocked-tags-help")) return;
    const hint = document.createElement("p");
    hint.className = "hint ds-v026-blocked-tags-help";
    hint.innerHTML = '<strong>Blocked tags</strong> is the permanent QoL-side hide rule. <strong>Exclude tags</strong> is only the saved SpicyChat tag-filter template and applies when you use that filter.';
    blocked.closest("label")?.insertAdjacentElement("afterend", hint);
  }

  async function loadDiscoveries() {
    const data = await storageGet([DISCOVERY_KEY]);
    const raw = data[DISCOVERY_KEY];
    discoveries = raw && typeof raw === "object" ? (raw.meta ? raw : { meta: raw }) : { meta: {} };
  }

  function patchBotStatusCenter() {
    const scope = document.getElementById("botAvailabilityScope");
    if (scope && !scope.querySelector('option[value="discovered"]')) {
      const option = document.createElement("option");
      option.value = "discovered";
      option.textContent = "Browsed / discovered bots only";
      scope.appendChild(option);
    }

    const sourceLabel = availabilitySourceLabel;
    availabilitySourceLabel = source => source === "discovered" ? "Browsed / discovered" : sourceLabel(source);

    const collect = collectTrackedAvailabilityBots;
    collectTrackedAvailabilityBots = function v026CollectTracked(scopeValue = "all") {
      const rows = collect(scopeValue);
      const byId = new Map((rows || []).map(row => [String(row.id || "").toLowerCase(), { ...row }]));
      if (scopeValue === "all" || scopeValue === "discovered") {
        for (const [rawId, raw] of Object.entries(discoveries.meta || {})) {
          const id = String(rawId || raw?.id || "").trim().toLowerCase();
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
          const previous = byId.get(id) || { id, sources: [] };
          const goodName = cleanBotName(raw?.name, id) || cleanBotName(previous.name, id);
          byId.set(id, {
            ...raw,
            ...previous,
            id,
            name: goodName || id,
            creator: clean(previous.creator || raw?.creator || ""),
            image: previous.image || raw?.image || "",
            profileUrl: `https://spicychat.ai/chatbot/${id}`,
            sources: [...new Set([...(previous.sources || []), "discovered"])]
          });
        }
      }
      return [...byId.values()].map(row => {
        const id = String(row.id || "").toLowerCase();
        const discovered = discoveries.meta?.[id] || {};
        return {
          ...row,
          name: cleanBotName(row.name, id) || cleanBotName(discovered.name, id) || id,
          profileUrl: id ? `https://spicychat.ai/chatbot/${id}` : row.profileUrl
        };
      });
    };
  }

  function syncGroups() {
    try {
      return SETTINGS_BACKUP_SCOPE_IDS.map(id => ({
        id,
        label: SETTINGS_BACKUP_GROUPS[id]?.label || id,
        keys: settingKeysForBackupScope(id)
      }));
    } catch {
      return [{ id: "all", label: "All settings", keys: Object.keys(DEFAULT_SETTINGS || {}) }];
    }
  }

  function injectSyncRules() {
    const linked = document.getElementById("accountSyncLinked");
    if (!linked || document.getElementById("accountSyncMode")) return;
    const host = document.createElement("div");
    host.className = "ds-v026-sync-rules";
    host.innerHTML = `
      <label>Sync rules for this device
        <select id="accountSyncMode">
          <option value="two-way">Two-way sync (changes go both directions)</option>
          <option value="upload-only">This device is the source (upload only)</option>
          <option value="download-only">The cloud is the source (download only)</option>
          <option value="manual">Do not sync automatically (manual only)</option>
        </select>
      </label>
      <p class="hint">New accounts start source/upload-only. Newly linked devices start cloud/download-only so a fresh device cannot overwrite the cloud before you choose its rules.</p>
      <details class="account-sync-category-details"><summary>Choose what this device imports / uploads</summary><div class="account-sync-category-grid" id="accountSyncCategoryList"></div><div class="button-row"><button type="button" id="accountSyncSelectAll">Everything</button><button type="button" id="accountSyncSelectNone">Nothing</button></div></details>
      <div class="button-row ds-v026-sync-transfer"><button type="button" id="accountSyncUpload">Upload Settings</button><button type="button" id="accountSyncDownload">Download Settings</button></div>`;
    const oldButtons = [...linked.querySelectorAll(".button-row")].find(row => row.querySelector("#accountSyncNow"));
    linked.insertBefore(host, oldButtons || linked.firstChild);

    const categoryHost = document.getElementById("accountSyncCategoryList");
    for (const group of syncGroups()) {
      const label = document.createElement("label");
      label.className = "row";
      label.innerHTML = `<input type="checkbox" data-sync-scope="${group.id}"><span>${group.label} (${group.keys.length})</span>`;
      categoryHost.appendChild(label);
    }

    const selectedPrefs = () => {
      const scopes = [...categoryHost.querySelectorAll("input[data-sync-scope]:checked")].map(input => input.dataset.syncScope);
      const groups = new Map(syncGroups().map(group => [group.id, group.keys]));
      return {
        mode: document.getElementById("accountSyncMode")?.value || "two-way",
        scopes,
        allowedKeys: [...new Set(scopes.flatMap(id => groups.get(id) || []))]
      };
    };
    const message = (type, extra = {}, timeout = 120000) => runtimeMessageWithTimeout({ type, ...extra }, timeout);
    const render = async () => {
      const response = await message("DS_QOL_SYNC_STATUS", {}, 15000);
      if (!response?.ok) return;
      const prefs = response.prefs || {};
      const mode = document.getElementById("accountSyncMode");
      if (mode) mode.value = prefs.mode || "two-way";
      const allowed = Array.isArray(prefs.allowedKeys) ? new Set(prefs.allowedKeys) : null;
      for (const input of categoryHost.querySelectorAll("input[data-sync-scope]")) {
        const group = syncGroups().find(item => item.id === input.dataset.syncScope);
        input.checked = allowed == null || !!group?.keys?.some(key => allowed.has(key));
      }
    };
    const save = async () => { await message("DS_QOL_SYNC_SET_DEVICE_PREFS", { prefs: selectedPrefs() }, 30000); await render(); };
    document.getElementById("accountSyncMode")?.addEventListener("change", () => save().catch(() => {}));
    categoryHost.addEventListener("change", () => save().catch(() => {}));
    document.getElementById("accountSyncSelectAll")?.addEventListener("click", () => { categoryHost.querySelectorAll("input").forEach(input => { input.checked = true; }); save().catch(() => {}); });
    document.getElementById("accountSyncSelectNone")?.addEventListener("click", () => { categoryHost.querySelectorAll("input").forEach(input => { input.checked = false; }); save().catch(() => {}); });
    document.getElementById("accountSyncUpload")?.addEventListener("click", async () => {
      const status = document.getElementById("accountSyncActionStatus");
      if (status) status.textContent = "Uploading selected settings…";
      const result = await message("DS_QOL_SYNC_UPLOAD");
      if (status) status.textContent = result?.ok ? "Upload complete." : (result?.message || "Upload failed.");
    });
    document.getElementById("accountSyncDownload")?.addEventListener("click", async () => {
      const status = document.getElementById("accountSyncActionStatus");
      if (status) status.textContent = "Downloading selected settings…";
      const result = await message("DS_QOL_SYNC_DOWNLOAD");
      if (status) status.textContent = result?.ok ? "Download complete." : (result?.message || "Download failed.");
    });
    render().catch(() => {});
  }

  // Analyze used raw runtimeMessage() and could wait forever on a dead tab.
  function installDiagnosticWatchdog() {
    const original = runtimeMessage;
    runtimeMessage = function v026RuntimeMessage(message) {
      const type = String(message?.type || "");
      if (!type.startsWith("DS_TAB_DIAGNOSTIC_")) return original(message);
      const timeout = type === "DS_TAB_DIAGNOSTIC_COLLECT" ? 20000 : 45000;
      let timer = 0;
      return Promise.race([
        original(message),
        new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, status: "watchdog-timeout", error: `No response after ${Math.round(timeout / 1000)}s` }), timeout); })
      ]).finally(() => clearTimeout(timer));
    };
  }

  function boot(attempt = 0) {
    if (typeof readSettingsFromPage !== "function" || typeof collectTrackedAvailabilityBots !== "function" || typeof runtimeMessageWithTimeout !== "function") {
      if (attempt < 120) later(() => boot(attempt + 1), 50);
      return;
    }
    addStyles();
    installListPaging();
    installBackupPaging();
    injectLessLikeOnBlock();
    patchSettingsReaders();
    explainBlockedTags();
    installDiagnosticWatchdog();
    loadDiscoveries().then(() => patchBotStatusCenter()).catch(() => patchBotStatusCenter());
    injectSyncRules();
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[DISCOVERY_KEY]) {
          const raw = changes[DISCOVERY_KEY].newValue;
          discoveries = raw && typeof raw === "object" ? (raw.meta ? raw : { meta: raw }) : { meta: {} };
        }
      });
    } catch {}
  }

  later(() => boot());
})();
