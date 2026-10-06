(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const BAR_ID = "ds-my-creations-backup-bar";
  const STYLE_ID = "ds-my-creations-backup-style";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i;
  const BOT_LINK_RE = /\/(?:chat|chatbot)\/([0-9a-f-]{20,})(?:[/?#]|$)/i;
  const LOREBOOK_LINK_RE = /\/lorebook\/(?!edit(?:\/|$))([0-9a-f-]{20,})(?:[/?#]|$)/i;
  const CONCURRENCY = 3;
  let activeJob = null;
  let lastFailures = [];
  let lastFailureKind = "";
  let shortcutInstalled = false;

  function settings() {
    return DS.state?.settings || {};
  }

  function currentPath() {
    return String(location.pathname || "").replace(/^\/[a-z]{2}(?=\/)/i, "").replace(/\/+$/, "") || "/";
  }

  function pageKind() {
    const path = currentPath();
    if (path === "/my-creations/chatbots") return "chatbots";
    if (path === "/my-creations/lorebooks") return "lorebooks";
    return "";
  }

  function clean(value, max = 600) {
    return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
  }

  function safeFilename(value, fallback = "creation") {
    return (clean(value, 120) || fallback)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^\.+|\.+$/g, "")
      .trim()
      .slice(0, 90) || fallback;
  }

  function itemIdFromHref(href, kind = pageKind()) {
    const text = String(href || "");
    const match = kind === "lorebooks" ? text.match(LOREBOOK_LINK_RE) : text.match(BOT_LINK_RE);
    return match?.[1] ? match[1].toLowerCase() : "";
  }

  function collectItems(kind = pageKind()) {
    const map = new Map();
    const selector = kind === "lorebooks"
      ? "a[href*='/lorebook/']"
      : "a[href*='/chat/'],a[href*='/chatbot/']";
    for (const anchor of document.querySelectorAll(selector)) {
      if (!(anchor instanceof HTMLAnchorElement)) continue;
      if (anchor.closest(`#${BAR_ID},[data-ds-owned='1']`) && !anchor.closest(".ds-my-lorebook-edit-button")) continue;
      const id = itemIdFromHref(anchor.getAttribute("href") || anchor.href, kind);
      if (!UUID_RE.test(id)) continue;
      let name = clean(anchor.getAttribute("title") || "", 240);
      if (!name) {
        const aria = clean(anchor.getAttribute("aria-label") || "", 240);
        name = aria.replace(/^chat-with-/i, "").trim();
      }
      if (!name) name = clean(anchor.textContent, 240);
      const existing = map.get(id);
      if (!existing || (!existing.name && name)) map.set(id, { id, name });
    }
    return [...map.values()];
  }

  function visible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function nativeLoadMore(kind) {
    const testIds = kind === "lorebooks"
      ? ["LorebookMy-LoadMoreButton", "LorebookMy-LoadMore"]
      : ["ChatbotMy-LoadMoreButton", "ChatbotMy-LoadMore"];
    for (const id of testIds) {
      const button = document.querySelector(`button[data-testid="${id}"]`);
      if (button instanceof HTMLButtonElement && visible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true") return button;
    }
    return [...document.querySelectorAll("button")].find(button => {
      if (!(button instanceof HTMLButtonElement) || button.closest(`#${BAR_ID},[data-ds-owned='1']`)) return false;
      if (!visible(button) || button.disabled || button.getAttribute("aria-disabled") === "true") return false;
      return /^(?:load|show)\s+more$/i.test(clean(button.textContent, 80));
    }) || null;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  function runtimeMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          try { if (chrome.runtime?.lastError) return resolve(null); } catch {}
          resolve(response || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function fetchIndexedBotMetadata(items, job) {
    const map = new Map();
    const ids = [...new Set((Array.isArray(items) ? items : []).map(item => clean(item?.id, 80).toLowerCase()).filter(id => UUID_RE.test(id)))];
    if (!ids.length) return map;

    // SpicyChat's current owner character response can omit public timestamp
    // metadata even when the same bot has createdAt/updatedAt in the character
    // Typesense index. Read those cheap index fields in two small batches instead
    // of adding another per-bot request to a 95+ bot backup. Private/hidden bots
    // may not be indexed, so this is deliberately a best-effort fallback only.
    const batchSize = 60;
    for (let offset = 0; offset < ids.length; offset += batchSize) {
      if (job?.cancelled) break;
      const batch = ids.slice(offset, offset + batchSize);
      try {
        const response = await runtimeMessage({ type: "DS_CHARACTER_INDEX_METADATA_FETCH", ids: batch });
        if (!response?.ok || !Array.isArray(response.metadata)) continue;
        for (const row of response.metadata) {
          const id = clean(row?.id, 80).toLowerCase();
          if (!UUID_RE.test(id)) continue;
          map.set(id, {
            createdAt: clean(row?.createdAt, 120) || null,
            updatedAt: clean(row?.updatedAt, 120) || null,
            source: clean(response.source || "typesense:public_characters_alias", 160)
          });
        }
      } catch {}
    }
    return map;
  }

  async function waitForGrowth(kind, beforeIds, timeout = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (activeJob?.cancelled) return false;
      const ids = new Set(collectItems(kind).map(item => item.id));
      if (ids.size > beforeIds.size || [...ids].some(id => !beforeIds.has(id))) return true;
      await sleep(180);
    }
    return false;
  }

  async function loadRemainingNativeBatches(kind) {
    const originalY = window.scrollY;
    let batches = 0;
    let stableScrolls = 0;
    setStatus("Loading the rest of My Creations…");

    try {
      for (let guard = 0; guard < 220; guard += 1) {
        if (activeJob?.cancelled) break;
        const button = nativeLoadMore(kind);
        if (button) {
          const before = new Set(collectItems(kind).map(item => item.id));
          try { button.click(); } catch { DS.realClick?.(button, { scroll: false }); }
          const grew = await waitForGrowth(kind, before, 12000);
          if (!grew) break;
          batches += 1;
          stableScrolls = 0;
          if (kind === "lorebooks") addLorebookEditButtons();
          setStatus(`Loading My Creations… ${collectItems(kind).length} found`);
          await sleep(180);
          continue;
        }

        // Current SpicyChat normally exposes a native Load More button. This
        // small scroll fallback also covers a future infinite-scroll variant.
        const before = collectItems(kind).length;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
        await sleep(650);
        const after = collectItems(kind).length;
        if (after > before) {
          stableScrolls = 0;
          if (kind === "lorebooks") addLorebookEditButtons();
          continue;
        }
        stableScrolls += 1;
        if (stableScrolls >= 2) break;
      }
    } finally {
      try { window.scrollTo({ top: originalY, behavior: "auto" }); } catch {}
    }
    return batches;
  }

  function botPortableJson(snapshot) {
    const tags = Array.isArray(snapshot.tags) ? snapshot.tags : [];
    return {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: snapshot.name || snapshot.id,
        description: snapshot.description || "",
        personality: snapshot.personality || "",
        scenario: snapshot.scenario || "",
        first_mes: snapshot.greeting || "",
        mes_example: snapshot.exampleDialogues || "",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: Array.isArray(snapshot.alternateGreetings) ? snapshot.alternateGreetings : [],
        tags,
        creator: snapshot.creator || "",
        character_version: "",
        extensions: {
          spicychat_qol: {
            export_format: "spicychat-qol-current-own-bot",
            export_version: 1,
            exported_at: new Date().toISOString(),
            current_live_fetch: true,
            spicychat_id: snapshot.id,
            avatar_url: snapshot.image || "",
            visibility: snapshot.visibility || "",
            created_at: snapshot.createdAt || null,
            updated_at: snapshot.updatedAt || null,
            lorebook_ids: Array.isArray(snapshot.lorebookIds) ? snapshot.lorebookIds : [],
            source: snapshot.source || "current-live",
            spicychat_fields: {
              title: snapshot.title || "",
              description: snapshot.description || "",
              greeting: snapshot.greeting || "",
              personality: snapshot.personality || "",
              scenario: snapshot.scenario || "",
              example_dialogues: snapshot.exampleDialogues || "",
              tags,
              visibility: snapshot.visibility || ""
            }
          }
        }
      }
    };
  }

  function lorebookJson(snapshot) {
    const lorebook = snapshot?.lorebook || {};
    return {
      format: "spicychat-qol-lorebook-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      currentLiveFetch: true,
      completeness: snapshot?.completeness || { details: true, entries: true },
      source: snapshot?.source || "current-live-api",
      lorebook: {
        ...lorebook,
        entries: Array.isArray(snapshot?.entries) ? snapshot.entries : []
      }
    };
  }

  async function fetchCurrent(kind, id) {
    if (kind === "chatbots") {
      if (typeof DS.getCurrentOwnBotBackupData !== "function") throw new Error("Current chatbot backup reader is not ready.");
      return DS.getCurrentOwnBotBackupData(id);
    }
    if (typeof DS.getCurrentOwnLorebookBackupData !== "function") throw new Error("Current Lorebook backup reader is not ready.");
    return DS.getCurrentOwnLorebookBackupData(id);
  }

  async function fetchWithRetry(kind, id, job) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (job.cancelled) throw new Error("Backup cancelled.");
      try { return await fetchCurrent(kind, id); }
      catch (error) {
        lastError = error;
        if (attempt < 3) await sleep(attempt === 1 ? 500 : 1400);
      }
    }
    throw lastError || new Error("Current item could not be read.");
  }

  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31);
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, date: day };
  }

  function u16(view, offset, value) { view.setUint16(offset, value & 0xffff, true); }
  function u32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

  function storedZipBlob(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    const now = dosDateTime();
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(String(file.name || "file.json").replace(/^\/+/, ""));
      const dataBytes = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
      const data = dataBytes instanceof Uint8Array ? dataBytes : new Uint8Array(dataBytes || []);
      const crc = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
      u16(lv, 10, now.time); u16(lv, 12, now.date); u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length);
      u16(lv, 26, nameBytes.length); u16(lv, 28, 0); local.set(nameBytes, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
      u16(cv, 12, now.time); u16(cv, 14, now.date); u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length);
      u16(cv, 28, nameBytes.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, offset);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.length + data.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0); u16(ev, 8, files.length); u16(ev, 10, files.length);
    u32(ev, 12, centralSize); u32(ev, 16, offset); u16(ev, 20, 0);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    (document.body || document.documentElement).appendChild(anchor);
    try { anchor.click(); } finally {
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    }
  }

  async function runPool(items, worker, job) {
    let next = 0;
    const runners = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, items.length)) }, async () => {
      while (!job.cancelled) {
        const index = next++;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    });
    await Promise.all(runners);
  }

  async function runBackup(kind, requestedItems = null) {
    if (activeJob) return;
    const button = document.querySelector(`#${BAR_ID} [data-role='backup']`);
    const cancel = document.querySelector(`#${BAR_ID} [data-role='cancel']`);
    const retry = document.querySelector(`#${BAR_ID} [data-role='retry']`);
    const job = { kind, cancelled: false, completed: 0, failures: [], success: [] };
    activeJob = job;
    DS.state.myCreationsBulkBackupRunning = true;
    if (button) button.disabled = true;
    if (cancel) cancel.hidden = false;
    if (retry) retry.hidden = true;

    try {
      try { await DS.requestDownloadPermission?.(); } catch {}
      let items = requestedItems;
      if (!items) {
        await loadRemainingNativeBatches(kind);
        items = collectItems(kind);
      }
      if (!items?.length) throw new Error(`No owned ${kind === "chatbots" ? "chatbots" : "Lorebooks"} were found on this page.`);

      const exportedAt = new Date().toISOString();
      const files = [];
      let indexedBotMetadata = new Map();
      if (kind === "chatbots") {
        setStatus(`Reading chatbot dates from SpicyChat's index…`);
        indexedBotMetadata = await fetchIndexedBotMetadata(items, job);
      }
      setStatus(`Fetching newest live ${kind === "chatbots" ? "chatbots" : "Lorebooks"}… 0 / ${items.length}`);

      await runPool(items, async item => {
        if (job.cancelled) return;
        try {
          const snapshot = await fetchWithRetry(kind, item.id, job);
          if (job.cancelled) return;
          if (kind === "chatbots") {
            const indexed = indexedBotMetadata.get(String(item.id || "").toLowerCase()) || null;
            let usedIndexedMetadata = false;
            if (!snapshot.createdAt && indexed?.createdAt) {
              snapshot.createdAt = indexed.createdAt;
              usedIndexedMetadata = true;
            }
            if (!snapshot.updatedAt && indexed?.updatedAt) {
              snapshot.updatedAt = indexed.updatedAt;
              usedIndexedMetadata = true;
            }
            if (usedIndexedMetadata) {
              const source = clean(snapshot.source || "current-live", 220);
              if (!/typesense-metadata/i.test(source)) snapshot.source = `${source}+typesense-metadata`;
            }

            const substantialFields = [snapshot?.greeting, snapshot?.personality, snapshot?.scenario, snapshot?.exampleDialogues]
              .filter(value => !!clean(value, 24000));
            if (!substantialFields.length) {
              throw new Error("Current chatbot definition was empty/redacted; backup was not accepted as successful.");
            }
            if ((!snapshot.name || snapshot.name === item.id) && item.name) snapshot.name = item.name;
            const payload = botPortableJson(snapshot);
            const name = safeFilename(snapshot.name || item.name || item.id, "chatbot");
            files.push({ name: `chatbots/${name} - ${item.id}.json`, data: JSON.stringify(payload, null, 2) });
          } else {
            if (snapshot?.lorebook && (!snapshot.lorebook.name || snapshot.lorebook.name === item.id) && item.name) snapshot.lorebook.name = item.name;
            const payload = lorebookJson(snapshot);
            const name = safeFilename(snapshot?.lorebook?.name || item.name || item.id, "lorebook");
            files.push({ name: `lorebooks/${name} - ${item.id}.json`, data: JSON.stringify(payload, null, 2) });
          }
          job.success.push(item.id);
        } catch (error) {
          if (!job.cancelled) job.failures.push({ id: item.id, name: item.name || "", error: clean(error?.message || error, 500) });
        } finally {
          job.completed += 1;
          setStatus(`Fetching newest live ${kind === "chatbots" ? "chatbots" : "Lorebooks"}… ${job.completed} / ${items.length}${job.failures.length ? ` · ${job.failures.length} failed` : ""}`);
        }
      }, job);

      if (job.cancelled) {
        setStatus("Bulk backup cancelled. Nothing was downloaded.");
        return;
      }

      const manifest = {
        format: "spicychat-qol-my-creations-backup",
        version: 1,
        qolVersion: chrome.runtime?.getManifest?.().version || "0.2.36",
        exportedAt,
        source: "fresh-live-spicychat",
        historyIncluded: false,
        kind,
        requested: items.length,
        succeeded: job.success.length,
        failed: job.failures.length,
        successfulIds: job.success,
        failures: job.failures
      };
      files.unshift({ name: "manifest.json", data: JSON.stringify(manifest, null, 2) });
      files.push({
        name: "README.txt",
        data: "SpicyChat QoL My Creations backup\n\nEach JSON was fetched from the current live SpicyChat item during this backup. Local QoL revision/history copies are not used as the source. See manifest.json for failures.\n"
      });

      const stamp = exportedAt.replace(/[:.]/g, "-");
      const label = kind === "chatbots" ? "chatbots" : "lorebooks";
      downloadBlob(storedZipBlob(files), `spicychat-my-creations-${label}-${stamp}.zip`);
      lastFailures = job.failures.map(row => ({ id: row.id, name: row.name }));
      lastFailureKind = kind;
      if (job.failures.length) {
        setStatus(`Backup downloaded: ${job.success.length} current ${label} · ${job.failures.length} failed. Retry failed is available.`);
        if (retry) {
          retry.hidden = false;
          retry.textContent = `Retry failed (${job.failures.length})`;
        }
      } else {
        setStatus(`Backup downloaded: ${job.success.length} current ${label}.`);
      }
      DS.diagUserAction?.("my-creations-backup", "download", { kind, succeeded: job.success.length, failed: job.failures.length });
    } catch (error) {
      setStatus(`Backup failed: ${error?.message || String(error)}`);
    } finally {
      activeJob = null;
      DS.state.myCreationsBulkBackupRunning = false;
      if (button) button.disabled = false;
      if (cancel) cancel.hidden = true;
    }
  }

  function setStatus(message) {
    const node = document.querySelector(`#${BAR_ID} [data-role='status']`);
    if (node) node.textContent = String(message || "");
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.dsOwned = "1";
    style.textContent = `
      #${BAR_ID}{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 4px;padding:8px 10px;border:1px solid rgba(148,163,184,.26);border-radius:10px;background:rgba(31,41,55,.12);font:12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #${BAR_ID} strong{font-size:12px;white-space:nowrap}
      #${BAR_ID} [data-role="status"]{opacity:.75;flex:1 1 260px;min-width:160px}
      #${BAR_ID} button{appearance:none;border:1px solid rgba(148,163,184,.34);border-radius:7px;background:rgba(55,65,81,.64);color:inherit;padding:5px 8px;cursor:pointer;font:600 11px/1.15 inherit;white-space:nowrap}
      #${BAR_ID} button:hover:not(:disabled){background:rgba(75,85,99,.88)}
      #${BAR_ID} button:disabled{opacity:.55;cursor:default}
      .ds-my-lorebook-edit-button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 28px;border-radius:7px;color:inherit;text-decoration:none;background:transparent}
      .ds-my-lorebook-edit-button:hover{background:rgba(148,163,184,.16)}
      .ds-my-lorebook-edit-button svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function placeBar(kind, bar) {
    if (!(bar instanceof Element)) return false;
    const tab = document.querySelector(`a[data-testid="creation-tab-${kind}"]`);
    const menu = tab?.closest?.("menu");
    if (!menu?.parentElement) return false;

    // Keep the backup controls inside the My Creations content column: directly
    // below Chatbots / Lorebooks / Groups / Voices and above the card grid.
    if (bar.previousElementSibling !== menu || bar.parentElement !== menu.parentElement) {
      menu.insertAdjacentElement("afterend", bar);
    }
    return true;
  }

  function buildBar(kind) {
    ensureStyle();
    const bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.dataset.dsOwned = "1";
    bar.dataset.dsOwner = "qol";
    bar.dataset.dsFeature = "my-creations-backup";

    const title = document.createElement("strong");
    title.textContent = "QoL My Creations backup";
    const status = document.createElement("span");
    status.dataset.role = "status";
    status.textContent = kind === "chatbots"
      ? "Downloads the newest current version of every chatbot as one ZIP."
      : "Downloads every current Lorebook and its current entries as one ZIP.";

    const backup = document.createElement("button");
    backup.type = "button";
    backup.dataset.role = "backup";
    backup.textContent = kind === "chatbots" ? "Backup all chatbots" : "Backup all Lorebooks";
    backup.title = "Loads the rest of this My Creations list, then fetches each current live item. Local version history is not exported.";
    backup.addEventListener("click", () => runBackup(kind));

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.role = "cancel";
    cancel.textContent = "Cancel";
    cancel.hidden = true;
    cancel.addEventListener("click", () => {
      if (!activeJob) return;
      activeJob.cancelled = true;
      cancel.disabled = true;
      setStatus("Cancelling after the current requests finish…");
      setTimeout(() => { cancel.disabled = false; }, 1000);
    });

    const retry = document.createElement("button");
    retry.type = "button";
    retry.dataset.role = "retry";
    retry.textContent = "Retry failed";
    retry.hidden = !(lastFailureKind === kind && lastFailures.length);
    if (!retry.hidden) retry.textContent = `Retry failed (${lastFailures.length})`;
    retry.addEventListener("click", () => {
      if (!lastFailures.length || lastFailureKind !== kind) return;
      runBackup(kind, lastFailures.map(row => ({ ...row })));
    });

    bar.append(title, status, backup, cancel, retry);

    // Do not fall back to #root while React is still mounting. That placed the
    // bar above SpicyChat's entire shell/logo. If the tab row is not ready yet,
    // leave the bar unmounted; the next normal QoL pass will place it correctly.
    return placeBar(kind, bar) ? bar : null;
  }

  function lorebookCardForAnchor(anchor) {
    let node = anchor;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      if (!(node instanceof Element)) continue;
      const cls = String(node.className || "");
      if (/\bgroup\b/.test(cls) && /rounded-xl/.test(cls) && node.querySelector("svg.lucide-ellipsis-vertical")) return node;
    }
    return null;
  }

  function pencilLink(id) {
    const link = document.createElement("a");
    link.className = "ds-my-lorebook-edit-button";
    link.dataset.dsOwned = "1";
    link.dataset.dsOwner = "qol";
    link.dataset.dsFeature = "my-creations-backup";
    link.href = `/lorebook/edit/${encodeURIComponent(id)}`;
    link.title = "Edit Lorebook";
    link.setAttribute("aria-label", "Edit Lorebook");
    link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg>';
    return link;
  }

  function addLorebookEditButtons() {
    if (pageKind() !== "lorebooks") return;
    for (const anchor of document.querySelectorAll("a[href*='/lorebook/']")) {
      if (!(anchor instanceof HTMLAnchorElement) || anchor.classList.contains("ds-my-lorebook-edit-button")) continue;
      const id = itemIdFromHref(anchor.getAttribute("href") || anchor.href, "lorebooks");
      if (!UUID_RE.test(id)) continue;
      const card = lorebookCardForAnchor(anchor);
      if (!card || card.querySelector(`.ds-my-lorebook-edit-button[data-ds-lorebook-id="${CSS.escape(id)}"]`)) continue;
      const ellipsis = card.querySelector("svg.lucide-ellipsis-vertical");
      const menuRoot = ellipsis?.closest?.("div.relative");
      const parent = menuRoot?.parentElement;
      if (!parent) continue;
      const link = pencilLink(id);
      link.dataset.dsLorebookId = id;
      parent.insertBefore(link, menuRoot);
    }
  }

  function ctrlOpenEditor(event) {
    if (pageKind() !== "lorebooks" || !(event.ctrlKey || event.metaKey)) return;
    const target = event.target instanceof Element ? event.target : null;
    const ellipsis = target?.closest?.("svg.lucide-ellipsis-vertical");
    if (!ellipsis) return;
    const card = lorebookCardForAnchor(ellipsis);
    if (!card) return;
    const anchor = [...card.querySelectorAll("a[href*='/lorebook/']")].find(node => !node.classList.contains("ds-my-lorebook-edit-button"));
    const id = itemIdFromHref(anchor?.getAttribute("href") || anchor?.href, "lorebooks");
    if (!UUID_RE.test(id)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    window.open(`/lorebook/edit/${encodeURIComponent(id)}`, "_blank", "noopener");
  }

  function installShortcut() {
    if (shortcutInstalled) return;
    shortcutInstalled = true;
    document.addEventListener("click", ctrlOpenEditor, true);
  }

  function removeShortcut() {
    if (!shortcutInstalled) return;
    shortcutInstalled = false;
    document.removeEventListener("click", ctrlOpenEditor, true);
  }

  DS.applyMyCreationsBackupTools = function applyMyCreationsBackupTools() {
    const kind = pageKind();
    const cfg = settings();
    const enabled = cfg.enabled !== false;
    const bulkEnabled = cfg.enableMyCreationsBulkBackup === true;
    const editEnabled = kind === "lorebooks" && cfg.showMyLorebookEditButtons === true;
    if (!kind || !enabled || (!bulkEnabled && !editEnabled)) {
      DS.removeMyCreationsBackupTools?.();
      return;
    }
    DS.state.myCreationsBackupWasActive = true;
    ensureStyle();

    const existing = document.getElementById(BAR_ID);
    if (bulkEnabled) {
      if (!existing || existing.dataset.kind !== kind) {
        existing?.remove();
        const bar = buildBar(kind);
        if (bar) bar.dataset.kind = kind;
      } else {
        // Repair old/mis-mounted bars after SPA navigation or an early page
        // startup pass without rebuilding the controls or losing job status.
        placeBar(kind, existing);
      }
    } else {
      existing?.remove();
    }

    if (editEnabled) {
      addLorebookEditButtons();
      installShortcut();
    } else {
      document.querySelectorAll(".ds-my-lorebook-edit-button").forEach(node => node.remove());
      removeShortcut();
    }
  };

  DS.removeMyCreationsBackupTools = function removeMyCreationsBackupTools() {
    if (activeJob) activeJob.cancelled = true;
    document.getElementById(BAR_ID)?.remove();
    document.querySelectorAll(".ds-my-lorebook-edit-button").forEach(node => node.remove());
    document.getElementById(STYLE_ID)?.remove();
    removeShortcut();
    DS.state.myCreationsBackupWasActive = false;
  };
})();
