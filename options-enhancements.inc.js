/* BEGIN SPICYCHAT QOL OPTIONS ENHANCEMENTS */
// Options enhancement layer.
// This code is merged into feature-registry.js by the local test patch.
(() => {
  "use strict";
  if (globalThis.__dsQolOptionsEnhancements) return;
  globalThis.__dsQolOptionsEnhancements = true;

  const PAGE = 10;
  const DISCOVERY_KEY = "botDiscoveryIndexV1";
  let discoveries = { meta: {} };
  let temporaryRetryActive = false;

  const later = (fn, ms = 0) => setTimeout(() => {
    try { fn(); } catch (error) { console.warn("[SpicyChat QoL options]", error); }
  }, ms);
  const clean = value => String(value || "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/\s+/g, " ").trim();
  const genericNames = new Set([
    "unknown", "unknown bot", "unknown character", "chatbot", "character", "bot",
    "for you", "recommended for you", "chatbot under review", "character under review",
    "under review", "view chatbot", "open chatbot", "private chatbot", "deleted chatbot",
    "not available", "unavailable", "404", "404 not found", "not found", "page not found",
    "error", "error loading chatbot", "failed to load chatbot"
  ]);

  function looksLikeGenericBotName(value, id = "") {
    const text = clean(value);
    const lower = text.toLowerCase();
    if (!text || lower === String(id || "").toLowerCase() || genericNames.has(lower)) return true;
    if (/^(?:404(?:\s+not\s+found)?|not\s+found|page\s+not\s+found)(?:\b|[.!…])/i.test(text)) return true;
    if (/^(?:for\s+you|recommended\s+for\s+you|chatbot\s+under\s+review|character\s+under\s+review)(?:\b|[.!…])/i.test(text)) return true;
    return false;
  }

  function cleanBotName(value, id = "") {
    let text = clean(value);
    if (looksLikeGenericBotName(text, id)) return "";
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
    return looksLikeGenericBotName(text, id) ? "" : text.slice(0, 180);
  }

  function storageGet(keys) {
    return new Promise(resolve => {
      try { chrome.storage.local.get(keys, value => resolve(chrome.runtime.lastError ? {} : (value || {}))); }
      catch { resolve({}); }
    });
  }

  function addStyles() {
    if (document.getElementById("ds-options-enhancements-style")) return;
    const style = document.createElement("style");
    style.id = "ds-options-enhancements-style";
    style.textContent = `
      .account-sync-category-details { margin: 12px 0; }
      .account-sync-category-details > summary { cursor: pointer; font-weight: 600; }
      .account-sync-category-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 14px;margin:10px 0; }
      .account-sync-category-grid .row { margin:0; }
      .ds-sync-transfer,.ds-backup-pager { margin-top:10px; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Every manager that previously started at 20 now visually starts at 10.
  // The original renderers can continue creating 20/40/etc rows; this layer
  // only limits what is shown, so we do not have to fork their large code.
  function capList(host) {
    if (!host) return;
    const limit = Math.max(PAGE, Number(host.dataset.dsOptionsVisible || PAGE));
    const rows = host.children;
    for (let index = 0; index < rows.length; index++) {
      const shouldHide = index >= limit;
      if (rows[index].hidden !== shouldHide) rows[index].hidden = shouldHide;
    }
  }

  function makeCoalescedListRefresh(callback) {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      const run = () => {
        pending = false;
        try { callback(); } catch (error) { console.warn("[QoL options paging]", error); }
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
      else setTimeout(run, 16);
    };
  }

  function installListPaging() {
    for (const host of document.querySelectorAll(".bot-manager-list")) {
      if (host.dataset.dsOptionsPaging === "1") continue;
      host.dataset.dsOptionsPaging = "1";
      host.dataset.dsOptionsVisible = String(PAGE);
      capList(host);
      const scheduleCap = makeCoalescedListRefresh(() => capList(host));
      new MutationObserver(scheduleCap).observe(host, { childList: true });

      const pager = host.nextElementSibling?.classList?.contains("bot-manager-pager")
        ? host.nextElementSibling
        : host.parentElement?.querySelector?.(".bot-manager-pager");
      if (!pager) continue;
      for (const button of pager.querySelectorAll("button")) {
        const original = clean(button.textContent);
        if (original === "Show 20 more") {
          button.textContent = "Show 10 more";
          button.addEventListener("click", () => {
            host.dataset.dsOptionsVisible = String(Number(host.dataset.dsOptionsVisible || PAGE) + PAGE);
            later(() => capList(host), 0);
          }, true);
        } else if (original === "Show first 20") {
          button.textContent = "Show first 10";
          button.addEventListener("click", () => {
            host.dataset.dsOptionsVisible = String(PAGE);
            later(() => capList(host), 0);
          }, true);
        }
      }
    }
  }

  function installBackupPaging() {
    const host = document.getElementById("creatorBackupManager");
    if (!host || host.dataset.dsOptionsPaging === "1") return;
    host.dataset.dsOptionsPaging = "1";
    host.dataset.dsOptionsVisible = String(PAGE);
    const pager = document.createElement("div");
    pager.className = "button-row ds-backup-pager";
    pager.innerHTML = '<button type="button" data-action="more">Show 10 more</button><button type="button" data-action="first">Show first 10</button><button type="button" data-action="all">Show all</button>';
    host.insertAdjacentElement("afterend", pager);
    const refresh = () => {
      capList(host);
      const total = host.children.length;
      const visible = Number(host.dataset.dsOptionsVisible || PAGE);
      const more = pager.querySelector('[data-action="more"]');
      const first = pager.querySelector('[data-action="first"]');
      if (more) more.hidden = visible >= total;
      if (first) first.hidden = visible <= PAGE;
      pager.hidden = total <= PAGE;
    };
    const scheduleRefresh = makeCoalescedListRefresh(refresh);
    new MutationObserver(scheduleRefresh).observe(host, { childList: true });
    pager.addEventListener("click", event => {
      const action = event.target?.closest?.("button")?.dataset?.action;
      if (!action) return;
      if (action === "more") host.dataset.dsOptionsVisible = String(Number(host.dataset.dsOptionsVisible || PAGE) + PAGE);
      else if (action === "first") host.dataset.dsOptionsVisible = String(PAGE);
      else if (action === "all") host.dataset.dsOptionsVisible = String(Math.max(PAGE, host.children.length));
      refresh();
    });
    for (const id of ["creatorBackupSearch", "creatorBackupType"]) {
      document.getElementById(id)?.addEventListener(id.endsWith("Search") ? "input" : "change", () => {
        host.dataset.dsOptionsVisible = String(PAGE);
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
    readSettingsFromPage = function enhancedReadSettings() {
      return { ...readAll(), quickLessLikeOnBlock: !!document.getElementById("quickLessLikeOnBlock")?.checked };
    };
    const readOne = readSingleSettingFromPage;
    readSingleSettingFromPage = function enhancedReadOne(key) {
      if (String(key) === "quickLessLikeOnBlock") return !!document.getElementById("quickLessLikeOnBlock")?.checked;
      return readOne(key);
    };
  }

  function explainBlockedTags() {
    const blocked = document.getElementById("blockedTags");
    if (!blocked || document.querySelector(".ds-blocked-tags-help")) return;
    const hint = document.createElement("p");
    hint.className = "hint ds-blocked-tags-help";
    hint.innerHTML = '<strong>Blocked tags</strong> is the permanent QoL-side hide rule. <strong>Exclude tags</strong> is only the saved SpicyChat tag-filter template and applies when you use that filter.';
    blocked.closest("label")?.insertAdjacentElement("afterend", hint);
  }

  async function loadDiscoveries() {
    const data = await storageGet([DISCOVERY_KEY]);
    const raw = data[DISCOVERY_KEY];
    discoveries = raw && typeof raw === "object" ? (raw.meta ? raw : { meta: raw }) : { meta: {} };
  }

  function safeStateMeta(store, id) {
    try { return store?.meta?.[id] && typeof store.meta[id] === "object" ? store.meta[id] : null; }
    catch { return null; }
  }

  // These stores can be tens of MB on a large account. Do not call the full
  // normalizeBotArchive()/normalizeBotAvailability() helpers once per bot while
  // rendering Bot Status Center; doing that turns one render into O(n²) work.
  function currentBotNameSources() {
    const objectMap = value => value && typeof value === "object" ? value : {};
    return {
      archive: objectMap(botArchiveState?.meta),
      availability: objectMap(botAvailabilityState?.meta),
      opened: objectMap(openedChatMetaState),
      favorite: objectMap(favoriteBotState?.meta),
      later: objectMap(laterBotState?.meta),
      organizer: objectMap(botOrganizationState?.meta),
      blocked: objectMap(blockedState?.meta),
      notInterested: objectMap(notInterestedState?.meta),
      discovered: objectMap(discoveries?.meta)
    };
  }

  function bestKnownBotName(idValue, row = {}, sources = null) {
    const id = clean(idValue || row?.id).toLowerCase();
    if (!id) return "";
    const maps = sources || currentBotNameSources();
    const archive = maps.archive?.[id] || null;
    const availability = maps.availability?.[id] || null;

    const candidates = [
      row?.snapshot?.name,
      row?.baseline?.name,
      row?.name,
      availability?.snapshot?.name,
      availability?.baseline?.name,
      availability?.name,
      archive?.fields?.name,
      archive?.name,
      maps.opened?.[id]?.name,
      maps.favorite?.[id]?.name,
      maps.later?.[id]?.name,
      maps.organizer?.[id]?.name,
      maps.blocked?.[id]?.name,
      maps.notInterested?.[id]?.name,
      maps.discovered?.[id]?.name
    ];
    for (const candidate of candidates) {
      const name = cleanBotName(candidate, id);
      if (name) return name;
    }
    return "";
  }

  function isExactEmptyCharacterResult(raw) {
    if (!raw || typeof raw !== "object") return false;
    const status = String(raw.status || "").trim().toLowerCase();
    const evidence = String(raw.unavailableEvidenceType || raw.unavailableEvidence || "").trim().toLowerCase();
    const reason = clean(raw.reason || raw.message || raw.detail || raw.description || "").toLowerCase();
    const httpStatus = Number(raw.httpStatus || raw.statusCode || 0);
    if (raw.emptyObject === true || status === "api-empty" || evidence === "api-empty-200") return true;
    if (httpStatus !== 200) return false;
    return /empty(?:\s+character)?\s+object|character api[^.]{0,80}empty|empty[^.]{0,80}character/.test(reason);
  }

  function isTemporaryAvailability(raw) {
    const status = String(raw?.status || "").toLowerCase();
    const candidate = Number(raw?.unavailableEvidenceCount || 0) > 0 && status !== "unavailable";
    return status === "unknown" || status === "temporary" || status === "api-empty" || candidate;
  }

  function temporaryAvailabilityEntries() {
    const meta = botAvailabilityState?.meta && typeof botAvailabilityState.meta === "object"
      ? botAvailabilityState.meta
      : {};
    const out = [];
    for (const [id, raw] of Object.entries(meta)) {
      if (isTemporaryAvailability(raw)) out.push([id, raw]);
    }
    return out;
  }

  function temporaryAvailabilityCount() {
    const meta = botAvailabilityState?.meta && typeof botAvailabilityState.meta === "object"
      ? botAvailabilityState.meta
      : {};
    let count = 0;
    for (const raw of Object.values(meta)) if (isTemporaryAvailability(raw)) count++;
    return count;
  }

  function updateTemporaryRetryButton() {
    const button = document.getElementById("retryTemporaryBotAvailability");
    if (!button) return;
    const count = temporaryAvailabilityCount();
    button.disabled = !!botAvailabilityScanRunning || count === 0;
    button.textContent = count ? `Retry temporary / unknown (${count})` : "No temporary / unknown";
  }

  async function retryTemporaryAvailability() {
    if (botAvailabilityScanRunning) return;
    const ids = new Set(temporaryAvailabilityEntries().map(([id]) => String(id || "").toLowerCase()).filter(Boolean));
    if (!ids.size) { updateTemporaryRetryButton(); return; }

    const currentCollect = collectTrackedAvailabilityBots;
    collectTrackedAvailabilityBots = function temporaryOnlyAvailability(scopeValue = "all") {
      return currentCollect("all").filter(entry => ids.has(String(entry?.id || "").toLowerCase()));
    };
    temporaryRetryActive = true;
    try {
      await runBotAvailabilityScan({ mode: "all" });
      // runBotAvailabilityScan queues a deferred archive/recovery refresh after
      // its light result paint. Keep the temporary-only guard active long enough
      // for that queued finalizer to see the guard and skip the huge 80+ MB
      // Saved Bots rebuild that previously froze the Options document.
      await new Promise(resolve => setTimeout(resolve, 900));
    } finally {
      collectTrackedAvailabilityBots = currentCollect;
      temporaryRetryActive = false;
      // The scan already updated the in-memory state and status text. Paint only
      // Bot Status itself here; do not force archive/recovery/storage managers to
      // rebuild a second time.
      try { renderBotAvailability({ skipRecoveryRerender: true }); } catch {}
      try { await repairConfirmedUnavailableRecovery({ renderDeleted: true }); } catch {}
      updateTemporaryRetryButton();
    }
  }

  function injectTemporaryRetryButton() {
    if (document.getElementById("retryTemporaryBotAvailability")) { updateTemporaryRetryButton(); return; }
    const anchor = document.getElementById("scanStaleBotAvailability") || document.getElementById("scanUncheckedBotAvailability") || document.getElementById("scanBotAvailability");
    const row = anchor?.parentElement;
    if (!row) return;
    const button = document.createElement("button");
    button.id = "retryTemporaryBotAvailability";
    button.type = "button";
    button.textContent = "Retry temporary / unknown";
    button.addEventListener("click", () => retryTemporaryAvailability().catch(error => {
      console.warn("[SpicyChat QoL options] temporary Bot Status retry failed", error);
      updateTemporaryRetryButton();
    }));
    const stop = document.getElementById("stopBotAvailabilityScan");
    row.insertBefore(button, stop || null);
    updateTemporaryRetryButton();
  }


  let recoveryRepairTimer = 0;
  let recoveryRepairRunning = false;
  let recoveryRepairAgain = false;

  function archiveFieldsForBot(idValue) {
    const id = clean(idValue).toLowerCase();
    const record = botArchiveState?.meta?.[id];
    if (!record || typeof record !== "object") return {};
    return record.fields && typeof record.fields === "object" ? record.fields : record;
  }

  function bestKnownMetadataForBot(idValue, availabilityRow = {}) {
    const id = clean(idValue || availabilityRow?.id).toLowerCase();
    const archive = archiveFieldsForBot(id);
    const discovered = discoveries?.meta?.[id] && typeof discoveries.meta[id] === "object" ? discoveries.meta[id] : {};
    const opened = openedChatMetaState?.[id] && typeof openedChatMetaState[id] === "object" ? openedChatMetaState[id] : {};
    const cleanFirst = (...values) => {
      for (const value of values) {
        const text = clean(value);
        if (text) return text;
      }
      return "";
    };
    return {
      name: bestKnownBotName(id, availabilityRow, currentBotNameSources()),
      creator: cleanFirst(opened.creator, archive.creator, availabilityRow.creator, discovered.creator),
      image: cleanFirst(opened.image, archive.image, availabilityRow.image, discovered.image),
      description: cleanFirst(opened.description, archive.description, archive.title, availabilityRow.description, discovered.description),
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      chatUrl: cleanFirst(opened.chatUrl, availabilityRow.chatUrl) || `https://spicychat.ai/chat/${id}`
    };
  }

  function repairOpenedMetadataForBot(idValue, availabilityRow = {}) {
    const id = clean(idValue).toLowerCase();
    if (!id || !openedChatMetaState || typeof openedChatMetaState !== "object") return false;
    const current = openedChatMetaState[id];
    if (!current || typeof current !== "object") return false;

    const best = bestKnownMetadataForBot(id, availabilityRow);
    const next = { ...current };
    let changed = false;

    if (looksLikeGenericBotName(next.name, id) && best.name) {
      next.name = best.name;
      changed = true;
    }
    for (const field of ["creator", "image", "description"]) {
      if (!clean(next[field]) && clean(best[field])) {
        next[field] = best[field];
        changed = true;
      }
    }
    if (!clean(next.profileUrl) && best.profileUrl) {
      next.profileUrl = best.profileUrl;
      changed = true;
    }
    if (!clean(next.chatUrl) && best.chatUrl) {
      next.chatUrl = best.chatUrl;
      changed = true;
    }

    if (changed) openedChatMetaState[id] = next;
    return changed;
  }

  async function repairConfirmedUnavailableRecovery({ renderDeleted = true } = {}) {
    if (recoveryRepairRunning) {
      recoveryRepairAgain = true;
      return;
    }
    recoveryRepairRunning = true;
    try {
      const availabilityMeta = botAvailabilityState?.meta && typeof botAvailabilityState.meta === "object"
        ? botAvailabilityState.meta
        : {};
      botUnavailableRecoveryState = normalizeBotUnavailableRecovery(botUnavailableRecoveryState);

      let recoveryChanged = false;
      let openedChanged = false;
      const captureContext = typeof buildUnavailableRecoveryCaptureContext === "function"
        ? buildUnavailableRecoveryCaptureContext()
        : null;

      for (const [id, entry] of Object.entries(availabilityMeta)) {
        const status = String(entry?.status || "").toLowerCase();
        if (status !== "unavailable" && entry?.confirmedUnavailable !== true) continue;

        if (!botUnavailableRecoveryState?.meta?.[id] && typeof captureUnavailableRecoveryEntry === "function") {
          const captured = captureUnavailableRecoveryEntry(id, entry, captureContext);
          if (captured || botUnavailableRecoveryState?.meta?.[id]) recoveryChanged = true;
        }

        if (repairOpenedMetadataForBot(id, entry)) openedChanged = true;
      }

      if (recoveryChanged || openedChanged) {
        const payload = {};
        if (recoveryChanged) payload[BOT_UNAVAILABLE_RECOVERY_KEY] = botUnavailableRecoveryState;
        if (openedChanged) payload[OPENED_META_KEY] = openedChatMetaState;
        if (Object.keys(payload).length) {
          try { await storageSet(payload); }
          catch (error) { console.warn("[SpicyChat QoL options] could not persist recovery repair", error); }
        }
      }

      if (renderDeleted && !temporaryRetryActive && typeof renderDeletedSavedBots === "function") {
        try { renderDeletedSavedBots(); } catch {}
      }
    } finally {
      recoveryRepairRunning = false;
      if (recoveryRepairAgain) {
        recoveryRepairAgain = false;
        later(() => repairConfirmedUnavailableRecovery({ renderDeleted }).catch(() => {}), 120);
      }
    }
  }

  function scheduleConfirmedUnavailableRecovery({ renderDeleted = true, delay = 180 } = {}) {
    clearTimeout(recoveryRepairTimer);
    recoveryRepairTimer = setTimeout(() => {
      recoveryRepairTimer = 0;
      repairConfirmedUnavailableRecovery({ renderDeleted }).catch(error => {
        console.warn("[SpicyChat QoL options] unavailable recovery repair failed", error);
      });
    }, Math.max(0, delay));
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
    collectTrackedAvailabilityBots = function enhancedCollectTracked(scopeValue = "all") {
      const rows = collect(scopeValue);
      const nameSources = currentBotNameSources();
      const byId = new Map((rows || []).map(row => [String(row.id || "").toLowerCase(), { ...row }]));
      if (scopeValue === "all" || scopeValue === "discovered") {
        for (const [rawId, raw] of Object.entries(discoveries.meta || {})) {
          const id = String(rawId || raw?.id || "").trim().toLowerCase();
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
          const previous = byId.get(id) || { id, sources: [] };
          const merged = { ...raw, ...previous };
          const directName = cleanBotName(merged.name, id);
          byId.set(id, {
            ...merged,
            id,
            name: directName || bestKnownBotName(id, merged, nameSources) || "",
            creator: clean(previous.creator || raw?.creator || ""),
            image: previous.image || raw?.image || "",
            profileUrl: `https://spicychat.ai/chatbot/${id}`,
            sources: [...new Set([...(previous.sources || []), "discovered"])]
          });
        }
      }
      const result = [];
      for (const row of byId.values()) {
        const id = String(row.id || "").toLowerCase();
        const directName = cleanBotName(row.name, id);
        result.push({
          ...row,
          name: directName || bestKnownBotName(id, row, nameSources) || "",
          profileUrl: id ? `https://spicychat.ai/chatbot/${id}` : row.profileUrl
        });
      }
      return result;
    };

    // A transient/empty/error check may update availability evidence, but it
    // must never downgrade a name or other display metadata that was already
    // known from a good local copy. Exact HTTP-200 `{}` responses are normalized
    // into the existing candidate-evidence path here because this layer also has
    // the previous check available. One independent empty result stays temporary;
    // the next independent empty result can confirm unavailable without touching
    // the saved profile copy.
    const reconcile = reconcileBotUpdate;
    reconcileBotUpdate = function safeReconcileBotUpdate(previousValue, checkedValue) {
      let previousForReconcile = previousValue;
      let checkedForReconcile = checkedValue;

      if (isExactEmptyCharacterResult(previousValue) && Number(previousValue?.unavailableEvidenceCount || 0) < 1) {
        previousForReconcile = {
          ...(previousValue || {}),
          unavailableEvidenceType: "api-empty-200",
          unavailableEvidenceCount: 1,
          unavailableCandidateAt: Number(previousValue?.unavailableCandidateAt || previousValue?.checkedAt || 0) || Date.now()
        };
      }
      if (isExactEmptyCharacterResult(checkedValue)) {
        checkedForReconcile = {
          ...(checkedValue || {}),
          unavailableCandidate: true,
          unavailableEvidenceType: "api-empty-200",
          emptyObject: true
        };
      }

      const result = reconcile(previousForReconcile, checkedForReconcile);
      const id = String(result?.id || checkedValue?.id || previousValue?.id || "").toLowerCase();
      const status = String(checkedForReconcile?.status || result?.status || "").toLowerCase();
      if (status !== "available") {
        for (const field of ["image", "creator", "profileUrl", "chatUrl"]) {
          const previous = clean(previousValue?.[field]);
          const next = clean(result?.[field]);
          if (previous && !next) result[field] = previousValue[field];
        }
      }
      const merged = { ...(checkedValue || {}), ...(result || {}) };
      const directName = cleanBotName(result?.name, id);
      const previousName = cleanBotName(previousValue?.name, id);
      const goodName = directName || previousName || bestKnownBotName(id, merged, currentBotNameSources());
      if (goodName) result.name = goodName;
      else if (looksLikeGenericBotName(result?.name, id)) result.name = "";

      if (String(result?.status || "").toLowerCase() === "unavailable" || result?.confirmedUnavailable === true) {
        scheduleConfirmedUnavailableRecovery({ renderDeleted: !temporaryRetryActive, delay: temporaryRetryActive ? 700 : 180 });
      }
      return result;
    };

    // Temporary-only retries should not rebuild every Saved Bots/archive/recovery
    // manager at scan completion. Those stores are huge on real installs and the
    // helper/API work itself is cheap; the previous freeze happened in Options
    // finalization. Keep normal full-scan behavior unchanged.
    if (typeof renderSavedBotInfo === "function") {
      const original = renderSavedBotInfo;
      renderSavedBotInfo = function lightweightRenderSavedBotInfo(...args) {
        if (temporaryRetryActive) return;
        return original(...args);
      };
    }
    if (typeof renderDeletedSavedBots === "function") {
      const original = renderDeletedSavedBots;
      renderDeletedSavedBots = function lightweightRenderDeletedSavedBots(...args) {
        if (temporaryRetryActive) return;
        return original(...args);
      };
    }
    if (typeof refreshArchiveTransferUi === "function") {
      const original = refreshArchiveTransferUi;
      refreshArchiveTransferUi = function lightweightRefreshArchiveTransferUi(...args) {
        if (temporaryRetryActive) return Promise.resolve();
        return original(...args);
      };
    }
    if (typeof refreshStorageUsageIfVisible === "function") {
      const original = refreshStorageUsageIfVisible;
      refreshStorageUsageIfVisible = function lightweightRefreshStorageUsageIfVisible(...args) {
        if (temporaryRetryActive) return;
        return original(...args);
      };
    }

    const render = renderBotAvailability;
    renderBotAvailability = function enhancedRenderBotAvailability(...args) {
      if (temporaryRetryActive) {
        const supplied = args[0] && typeof args[0] === "object" ? args[0] : {};
        args[0] = { ...supplied, skipRecoveryRerender: true };
      }
      const result = render(...args);
      later(() => {
        injectTemporaryRetryButton();
        updateTemporaryRetryButton();
      });
      return result;
    };

    injectTemporaryRetryButton();
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
    host.className = "ds-sync-rules";
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
      <div class="button-row ds-sync-transfer"><button type="button" id="accountSyncUpload">Upload Settings</button><button type="button" id="accountSyncDownload">Download Settings</button></div>`;
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
    runtimeMessage = function diagnosticRuntimeMessage(message) {
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
    loadDiscoveries().then(() => {
      patchBotStatusCenter();
      scheduleConfirmedUnavailableRecovery({ renderDeleted: true, delay: 250 });
    }).catch(() => {
      patchBotStatusCenter();
      scheduleConfirmedUnavailableRecovery({ renderDeleted: true, delay: 250 });
    });
    injectSyncRules();
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[DISCOVERY_KEY]) {
          const raw = changes[DISCOVERY_KEY].newValue;
          discoveries = raw && typeof raw === "object" ? (raw.meta ? raw : { meta: raw }) : { meta: {} };
          scheduleConfirmedUnavailableRecovery({ renderDeleted: true, delay: 300 });
        }
      });
    } catch {}
  }

  later(() => boot());
})();
/* END SPICYCHAT QOL OPTIONS ENHANCEMENTS */
