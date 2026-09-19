(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const HIDDEN_CLASS = "ds-creation-audit-hidden";
  const PANEL_ID = "ds-creation-audit";
  const auditById = new Map();
  const pendingIds = new Set();
  const taskQueue = [];
  let running = 0;
  let renderTimer = null;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function idFromAnchor(anchor) {
    const href = anchor?.href || "";
    const chatId = DS.chatIdFromHref?.(href || "");
    if (chatId) return chatId;
    try {
      const url = new URL(href, location.origin);
      return url.pathname.match(/^\/chatbot\/([^/?#]+)/i)?.[1] || "";
    } catch {
      return "";
    }
  }

  function entries() {
    const seen = new Set();
    return (DS.collectCards?.() || []).map(item => {
      const card = item?.card;
      if (!card || seen.has(card)) return null;
      seen.add(card);
      const anchor = item?.anchor || card.querySelector("a[href*='/chat/'], a[href*='/chatbot/']");
      const id = idFromAnchor(anchor);
      const creatorAnchor = card.querySelector("a[href*='/creator/']");
      return {
        card,
        anchor,
        id,
        name: clean(DS.getCardTitle?.(card) || anchor?.textContent || id),
        creator: clean(creatorAnchor?.textContent || ""),
        profileUrl: id ? `${location.origin}/chatbot/${id}` : (anchor?.href || ""),
        target: DS.getBestHideTarget?.(card) || card
      };
    }).filter(Boolean);
  }

  function elementIsVisible(el) {
    if (!(el instanceof Element) || !el.isConnected) return false;
    if (el.closest("[hidden], [aria-hidden='true']")) return false;
    try {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    } catch {}
    return !!(el.getClientRects().length || el.clientWidth || el.clientHeight);
  }

  function visibility(card) {
    const statuses = new Set(["public", "unlisted", "private"]);
    const candidates = [...card.querySelectorAll("button, [role='button']")];

    // Prefer the currently rendered badge. Hidden visibility-menu choices can
    // contain all three words at once and previously made Audit report whichever
    // hidden option happened to appear first.
    for (const el of candidates) {
      if (!elementIsVisible(el) || el.closest("[role='menu'], [role='dialog'], .ds-creation-audit-card")) continue;
      const aria = clean(el.getAttribute("aria-label")).toLowerCase();
      const text = clean(el.textContent).toLowerCase();
      if (statuses.has(aria)) return aria;
      if (statuses.has(text)) return text;
    }

    // Static/odd layouts may not expose geometry. Only trust a fallback when
    // every exact candidate agrees, rather than guessing from a hidden menu.
    const found = new Set();
    for (const el of candidates) {
      if (el.closest("[role='menu'], [role='dialog'], .ds-creation-audit-card")) continue;
      const aria = clean(el.getAttribute("aria-label")).toLowerCase();
      const text = clean(el.textContent).toLowerCase();
      if (statuses.has(aria)) found.add(aria);
      if (statuses.has(text)) found.add(text);
    }
    return found.size === 1 ? [...found][0] : "unknown";
  }

  function analyzeProfile(profile) {
    if (!profile?.fields || typeof profile.fields !== "object") {
      return {
        status: "check",
        issues: ["Profile details could not be checked"],
        totalTokens: 0,
        tagsKnown: false,
        tagCount: null,
        source: "unknown"
      };
    }

    const fields = profile.fields;
    const issues = [];
    const incomplete = profile.incomplete === true;
    let coreMissing = 0;

    const addMissing = (key, label, core = false) => {
      const item = fields[key];
      if (item?.available) return;
      const verifiedMissing = item?.verified === true;
      issues.push(`${verifiedMissing ? "Missing" : "Could not verify"} ${label}`);
      if (core && verifiedMissing) coreMissing++;
    };

    const addShort = (key, label, minChars) => {
      const item = fields[key];
      if (!item?.available) return;
      const chars = Number(item.chars || 0);
      if (chars > 0 && chars < minChars) issues.push(`Very short ${label} (${chars} chars)`);
    };

    addMissing("greeting", "Greeting", true);
    addMissing("description", "Description", true);
    addMissing("personality", "Personality", true);
    addMissing("scenario", "Scenario");
    addMissing("examples", "Example Dialogue");

    addShort("greeting", "Greeting", 120);
    addShort("description", "Description", 40);
    addShort("personality", "Personality", 160);
    addShort("scenario", "Scenario", 80);
    addShort("examples", "Example Dialogue", 80);

    const availableFields = Object.values(fields).filter(item => item?.available);
    const totalTokens = availableFields.reduce((sum, item) => sum + Number(item.tokens || 0), 0);
    if (availableFields.length && totalTokens < 350) issues.push(`Very small profile estimate (~${totalTokens} tok)`);
    if (totalTokens > 3000) issues.push(`Large profile estimate (~${totalTokens.toLocaleString()} tok)`);
    if (Number(fields.personality?.tokens || 0) > 2400) issues.push(`Personality/definition is very large (~${Number(fields.personality.tokens).toLocaleString()} tok)`);

    const tagsKnown = Array.isArray(profile.tags);
    const tagCount = tagsKnown ? profile.tags.length : null;
    if (tagsKnown && tagCount === 0) issues.push("No tags detected");
    if (tagsKnown) {
      const folded = profile.tags.map(tag => clean(tag).toLowerCase()).filter(Boolean);
      if (new Set(folded).size !== folded.length) issues.push("Duplicate tags detected");
    }

    for (const hint of Array.isArray(profile.auditHints) ? profile.auditHints : []) {
      const text = clean(hint);
      if (text && !issues.includes(text)) issues.push(text);
    }
    if (incomplete) issues.unshift("SpicyChat did not expose enough profile data to verify every field; unverified fields are not counted as missing");

    return {
      status: coreMissing > 0 ? "missing-core" : (issues.length ? "check" : "looks-good"),
      issues,
      totalTokens,
      tagsKnown,
      tagCount,
      source: clean(profile.source || "unknown")
    };
  }

  function baseMeta(entry) {
    return {
      lorebook: !!DS.cardHasLorebook?.(entry.card),
      visibility: visibility(entry.card),
      audit: entry.id ? auditById.get(entry.id) || null : null,
      checking: !!entry.id && pendingIds.has(entry.id)
    };
  }

  function restore(list = entries()) {
    for (const entry of list) entry.target.classList.remove(HIDDEN_CLASS);
  }

  function removeCardBadge(card) {
    card?.querySelector?.(":scope > .ds-creation-audit-card")?.remove();
  }


  async function setCreatorStatus(entry, status) {
    if (!entry?.id) return;
    const key = DS.BOT_ORGANIZER_KEY || "botOrganization";
    const before = JSON.parse(JSON.stringify(DS.state.botOrganization || { meta: {} }));
    const store = DS.state.botOrganization && typeof DS.state.botOrganization === "object" ? DS.state.botOrganization : { meta: {} };
    store.meta ||= {};
    const current = store.meta[entry.id] && typeof store.meta[entry.id] === "object" ? store.meta[entry.id] : {};
    const next = { ...current, id: entry.id, name: entry.name || current.name || "", creator: entry.creator || current.creator || "", profileUrl: entry.profileUrl || current.profileUrl || "", status: status || "", updatedAt: Date.now() };
    if (!status && !next.note && !(next.collections || []).length && !(next.tags || []).length) delete store.meta[entry.id];
    else store.meta[entry.id] = next;
    DS.state.botOrganization = store;
    await DS.saveBotOrganization?.(store);
    await DS.recordLocalChange?.(`Creator QA status: ${entry.name || entry.id} → ${status || "none"}`, { [key]: before }, { [key]: JSON.parse(JSON.stringify(store)) });
    DS.setQuickStatus?.(`QA status saved: ${status ? status.replace(/-/g, " ") : "none"}. Audit results are separate.`);
    DS.applyCreationAudit?.();
    DS.scheduleRun?.({ priority: "fast", source: "creation-audit-qa-status" });
  }

  function ensureQuickStatus(entry, badge) {
    if (!DS.state.settings?.creationAuditQuickStatus || !entry?.id || !badge) return;
    let select = badge.querySelector("select.ds-creation-audit-status");
    if (!select) {
      select = document.createElement("select"); select.className = "ds-creation-audit-status";
      select.setAttribute("aria-label", "Local QA workflow status");
      select.title = "Local QA workflow status. This does not override the Creation Audit result.";
      for (const [value,label] of [["","QA: No status"],["needs-work","QA: Needs work"],["testing","QA: Testing"],["finished","QA: Finished"]]) { const o=document.createElement("option");o.value=value;o.textContent=label;select.appendChild(o); }
      select.addEventListener("click", e => e.stopPropagation());
      select.addEventListener("change", async e => { e.stopPropagation(); await setCreatorStatus(entry, select.value); });
      badge.appendChild(select);
    }
    select.value = DS.state.botOrganization?.meta?.[entry.id]?.status || "";
  }

  function auditSourceLabel(source) {
    const parts = String(source || "unknown").split("+").filter(Boolean).map(part => ({
      "character-api": "Character API",
      "profile-html": "Public profile",
      "owner-editor-html": "Owner editor",
      "owner-local-cache": "Local owner backup/cache",
      "unknown": "Unknown"
    }[part] || part));
    return [...new Set(parts)].join(" + ") || "Unknown";
  }

  function renderCardBadge(entry, meta) {
    let badge = entry.card.querySelector(":scope > .ds-creation-audit-card");
    let status = "";
    let text = "";
    let detail = "";

    if (meta.checking && !meta.audit) {
      status = "checking";
      text = "Audit: checking…";
      detail = "QoL is checking the cached/visible profile fields for this bot.";
    } else if (meta.audit) {
      const audit = meta.audit;
      status = audit.status;
      if (audit.status === "missing-core") text = `Audit: core fields missing · ${audit.issues.length} ${audit.issues.length === 1 ? "check" : "checks"}`;
      else if (audit.status === "check") text = `Audit: ${audit.issues.length} ${audit.issues.length === 1 ? "thing" : "things"} to check`;
      else text = "Audit: looks good";
      const sourceLine = `Verified from: ${auditSourceLabel(audit.source)}`;
      detail = audit.issues.length
        ? `${sourceLine}\n${audit.status === "missing-core" ? "Core = Greeting + Description + Personality.\n" : ""}${audit.issues.join("\n")}`
        : `${sourceLine}\nNo obvious profile-field issues found${audit.totalTokens ? ` · ~${audit.totalTokens.toLocaleString()} tok` : ""}`;
    } else {
      badge?.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("div");
      badge.className = "ds-creation-audit-card";
      entry.card.appendChild(badge);
    }
    if (badge.dataset.status !== status) badge.dataset.status = status;
    let label = badge.querySelector(":scope > .ds-creation-audit-label");
    if (!label) { label = document.createElement("span"); label.className = "ds-creation-audit-label"; badge.prepend(label); }
    if (label.textContent !== text) label.textContent = text;
    if (badge.title !== detail) badge.title = detail;
    ensureQuickStatus(entry, badge);
  }

  function makeChip(active, key, label, count) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.auditFilter = key;
    if (active === key) button.classList.add("is-active");
    button.append(document.createTextNode(`${label} `));
    const countEl = document.createElement("b");
    countEl.textContent = String(count);
    button.appendChild(countEl);
    return button;
  }

  function auditStatusLabel(meta) {
    if (meta.checking && !meta.audit) return "Checking";
    if (meta.audit?.status === "missing-core") return "Core fields missing";
    if (meta.audit?.status === "check") return "Check recommended";
    if (meta.audit?.status === "looks-good") return "Looks good";
    return "Not checked";
  }

  function needsAttention(meta) {
    return meta.audit?.status === "missing-core" || meta.audit?.status === "check";
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function buildAuditCsv() {
    const rows = entries().map(entry => ({ entry, meta: baseMeta(entry) }));
    const lines = [[
      "Name", "Bot ID", "Audit", "Visibility", "Lorebook",
      "Estimated tokens", "Tags", "Verification source", "Issues", "Profile"
    ].map(csvCell).join(",")];

    for (const { entry, meta } of rows) {
      const audit = meta.audit;
      lines.push([
        entry.name || "",
        entry.id || "",
        auditStatusLabel(meta),
        meta.visibility || "unknown",
        meta.lorebook ? "Yes" : "No",
        audit?.totalTokens || "",
        audit?.tagsKnown ? Number(audit.tagCount || 0) : "",
        audit ? auditSourceLabel(audit.source) : "",
        audit?.issues?.join(" | ") || "",
        entry.profileUrl || ""
      ].map(csvCell).join(","));
    }

    return lines.join("\n");
  }

  function downloadAuditCsv() {
    const csv = buildAuditCsv();
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spicychat-creation-audit-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function reviewNextAttention(button) {
    const rows = entries()
      .map(entry => ({ entry, meta: baseMeta(entry) }))
      .filter(row => needsAttention(row.meta));

    if (!rows.length) {
      const previous = button?.textContent || "Review next";
      if (button) button.textContent = "No issues";
      setTimeout(() => {
        if (button?.isConnected) button.textContent = previous;
      }, 1200);
      return;
    }

    DS.state.creationAuditFilter = "attention";
    const index = Math.max(0, Number(DS.state.creationAuditReviewIndex || 0)) % rows.length;
    DS.state.creationAuditReviewIndex = (index + 1) % rows.length;
    DS.applyCreationAudit?.();

    setTimeout(() => {
      const target = rows[index]?.entry?.target;
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }, 60);
  }

  function buildAuditReport() {
    const list = entries();
    const rows = list.map(entry => ({ entry, meta: baseMeta(entry) }));
    const now = new Date();
    const counts = {
      missing: rows.filter(row => row.meta.audit?.status === "missing-core").length,
      check: rows.filter(row => row.meta.audit?.status === "check").length,
      attention: rows.filter(row => needsAttention(row.meta)).length,
      good: rows.filter(row => row.meta.audit?.status === "looks-good").length,
      checking: rows.filter(row => row.meta.checking && !row.meta.audit).length,
      lorebook: rows.filter(row => row.meta.lorebook).length
    };

    const lines = [
      "# SpicyChat QoL Creation Audit",
      "",
      `Generated: ${now.toLocaleString()}`,
      `Loaded bots: ${rows.length}`,
      `Needs attention: ${counts.attention} · Core fields missing: ${counts.missing} · Check recommended: ${counts.check} · Looks good: ${counts.good} · Checking: ${counts.checking}`,
      `Lorebooks: ${counts.lorebook}/${rows.length}`,
      "",
      "> Advisory local QA report only. These checks are not a quality score.",
      ""
    ];

    for (const { entry, meta } of rows) {
      const audit = meta.audit;
      lines.push(`## ${entry.name || entry.id || "Unknown bot"}`);
      if (entry.creator) lines.push(`- Creator: ${entry.creator}`);
      if (entry.id) lines.push(`- Bot ID: ${entry.id}`);
      if (entry.profileUrl) lines.push(`- Profile: ${entry.profileUrl}`);
      lines.push(`- Audit: ${auditStatusLabel(meta)}`);
      lines.push(`- Visibility: ${meta.visibility || "unknown"}`);
      lines.push(`- Lorebook: ${meta.lorebook ? "Yes" : "No"}`);
      if (audit?.totalTokens) lines.push(`- Combined profile estimate: ~${Number(audit.totalTokens).toLocaleString()} tokens`);
      if (audit) lines.push(`- Verified from: ${auditSourceLabel(audit.source)}`);
      if (audit?.tagsKnown) lines.push(`- Tags detected: ${Number(audit.tagCount || 0)}`);
      if (audit?.issues?.length) {
        lines.push("- Review:");
        audit.issues.forEach(issue => lines.push(`  - ${issue}`));
      } else if (audit?.status === "looks-good") {
        lines.push("- Review: No obvious profile-field issues found");
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  async function copyAuditReport(button) {
    const report = buildAuditReport();
    try {
      await navigator.clipboard.writeText(report);
      const previous = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { if (button.isConnected) button.textContent = previous; }, 1200);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try { document.execCommand("copy"); } catch {}
      textarea.remove();
    }
  }

  function downloadAuditReport() {
    const report = buildAuditReport();
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spicychat-creation-audit-${stamp}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function ensurePanel(list, stats) {
    let panel = document.getElementById(PANEL_ID);
    const grid = list[0]?.target?.parentElement;
    const host = grid?.parentElement;
    if (!host) return null;

    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      panel.className = "ds-creation-audit";
      host.insertBefore(panel, grid);
      panel.addEventListener("click", event => {
        const copyReport = event.target.closest("button[data-audit-copy]");
        if (copyReport) {
          copyAuditReport(copyReport);
          return;
        }

        const downloadReport = event.target.closest("button[data-audit-download]");
        if (downloadReport) {
          downloadAuditReport();
          return;
        }

        const downloadCsv = event.target.closest("button[data-audit-csv]");
        if (downloadCsv) {
          downloadAuditCsv();
          return;
        }

        const reviewNext = event.target.closest("button[data-audit-review-next]");
        if (reviewNext) {
          reviewNextAttention(reviewNext);
          return;
        }

        const refresh = event.target.closest("button[data-audit-refresh]");
        if (refresh) {
          for (const entry of entries()) {
            if (!entry.id) continue;
            auditById.delete(entry.id);
            queueProfile(entry.id, true);
          }
          DS.applyCreationAudit?.();
          return;
        }

        const button = event.target.closest("button[data-audit-filter]");
        if (!button) return;
        DS.state.creationAuditFilter = button.dataset.auditFilter || "all";
        DS.applyCreationAudit?.();
      });
    }

    const active = DS.state.creationAuditFilter || "all";
    const head = document.createElement("div");
    head.className = "ds-creation-audit-head";
    const titleWrap = document.createElement("div");
    titleWrap.className = "ds-creation-audit-title-wrap";
    const title = document.createElement("strong");
    title.textContent = "Creation audit";
    const note = document.createElement("span");
    note.textContent = "Loaded bots only · advisory, not a score";
    titleWrap.append(title, note);

    const headActions = document.createElement("div");
    headActions.className = "ds-creation-audit-head-actions";

    const copyReport = document.createElement("button");
    copyReport.type = "button";
    copyReport.dataset.auditCopy = "1";
    copyReport.className = "ds-creation-audit-refresh";
    copyReport.textContent = "Copy report";
    copyReport.title = "Copy a Markdown audit report for the currently loaded bots";

    const downloadReport = document.createElement("button");
    downloadReport.type = "button";
    downloadReport.dataset.auditDownload = "1";
    downloadReport.className = "ds-creation-audit-refresh";
    downloadReport.textContent = "Download .md";
    downloadReport.title = "Download a Markdown audit report for the currently loaded bots";

    const downloadCsv = document.createElement("button");
    downloadCsv.type = "button";
    downloadCsv.dataset.auditCsv = "1";
    downloadCsv.className = "ds-creation-audit-refresh";
    downloadCsv.textContent = "Download .csv";
    downloadCsv.title = "Download the currently loaded audit as a spreadsheet-friendly CSV";

    const reviewNext = document.createElement("button");
    reviewNext.type = "button";
    reviewNext.dataset.auditReviewNext = "1";
    reviewNext.className = "ds-creation-audit-refresh";
    reviewNext.textContent = "Review next";
    reviewNext.title = "Show Needs attention and jump to the next loaded bot that needs review";

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.dataset.auditRefresh = "1";
    refresh.className = "ds-creation-audit-refresh";
    refresh.textContent = "Refresh loaded";
    refresh.title = "Re-check currently loaded bot profiles using SpicyChat's normal profile pages";
    headActions.append(copyReport, downloadReport, downloadCsv, reviewNext, refresh);
    head.append(titleWrap, headActions);

    const chips = document.createElement("div");
    chips.className = "ds-creation-audit-chips";
    chips.append(
      makeChip(active, "all", "All", stats.total),
      makeChip(active, "attention", "Needs attention", stats.attention),
      makeChip(active, "missing-core", "Core fields missing", stats.missingCore),
      makeChip(active, "check", "Things to check", stats.check),
      makeChip(active, "looks-good", "Looks good", stats.looksGood),
      makeChip(active, "checking", "Checking", stats.checking),
      makeChip(active, "missing-lorebook", "Missing Lorebook", stats.missingLorebook),
      makeChip(active, "public", "Public", stats.public),
      makeChip(active, "unlisted", "Unlisted", stats.unlisted),
      makeChip(active, "private", "Private", stats.private)
    );
    if (stats.unknown) chips.appendChild(makeChip(active, "unknown", "Unknown", stats.unknown));

    const summary = document.createElement("div");
    summary.className = "ds-creation-audit-summary";
    const checked = stats.missingCore + stats.check + stats.looksGood;
    summary.textContent = `${checked}/${stats.total} profile checks ready · ${stats.attention} need attention · ${stats.missingCore} core fields missing · ${stats.check} things to check · ${stats.looksGood} look good · 📖 ${stats.withLorebook}/${stats.total} Lorebooks`;

    panel.replaceChildren(head, chips, summary);
    return panel;
  }

  function matches(meta, filter) {
    if (filter === "all") return true;
    if (filter === "attention") return needsAttention(meta);
    if (filter === "missing-lorebook") return !meta.lorebook;
    if (filter === "checking") return meta.checking && !meta.audit;
    if (["missing-core", "check", "looks-good"].includes(filter)) return meta.audit?.status === filter;
    return meta.visibility === filter;
  }

  function scheduleApply() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => DS.applyCreationAudit?.(), 90);
  }

  async function runTask(task) {
    try {
      const profile = await DS.getCardProfileFieldInfo?.(task.id, {
        requireTags: true,
        ownerEditor: true,
        force: !!task.force
      });
      auditById.set(task.id, analyzeProfile(profile));
    } catch {
      auditById.set(task.id, {
        status: "check",
        issues: ["Profile check failed — use Refresh loaded to try again"],
        totalTokens: 0,
        tagsKnown: false,
        tagCount: null,
        source: "unknown"
      });
    } finally {
      pendingIds.delete(task.id);
      scheduleApply();
    }
  }

  function pump() {
    while (running < 2 && taskQueue.length) {
      const task = taskQueue.shift();
      running++;
      runTask(task).finally(() => {
        running--;
        setTimeout(pump, 180);
      });
    }
  }

  function queueProfile(id, force = false) {
    const botId = String(id || "").trim();
    if (!botId || pendingIds.has(botId)) return;
    if (!force && auditById.has(botId)) return;
    pendingIds.add(botId);
    taskQueue.push({ id: botId, force });
    pump();
  }

  function cleanup() {
    restore();
    document.getElementById(PANEL_ID)?.remove();
    document.querySelectorAll(".ds-creation-audit-card").forEach(el => el.remove());
    DS.state.creationAuditWasActive = false;
    DS.state.creationAuditReviewIndex = 0;
  }

  DS.applyCreationAudit = function applyCreationAudit() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableCreationAudit || !DS.isMyCreationsChatbotsPage?.()) {
      if (DS.state.creationAuditWasActive) cleanup();
      return;
    }

    DS.state.creationAuditWasActive = true;
    DS.state.creationAuditFilter ||= "all";
    const list = entries();

    for (const entry of list) {
      if (entry.id && !auditById.has(entry.id) && !pendingIds.has(entry.id)) queueProfile(entry.id);
    }

    const metas = list.map(entry => ({ entry, meta: baseMeta(entry) }));
    const stats = {
      total: metas.length,
      withLorebook: metas.filter(item => item.meta.lorebook).length,
      missingLorebook: metas.filter(item => !item.meta.lorebook).length,
      public: metas.filter(item => item.meta.visibility === "public").length,
      unlisted: metas.filter(item => item.meta.visibility === "unlisted").length,
      private: metas.filter(item => item.meta.visibility === "private").length,
      unknown: metas.filter(item => item.meta.visibility === "unknown").length,
      missingCore: metas.filter(item => item.meta.audit?.status === "missing-core").length,
      check: metas.filter(item => item.meta.audit?.status === "check").length,
      attention: metas.filter(item => needsAttention(item.meta)).length,
      looksGood: metas.filter(item => item.meta.audit?.status === "looks-good").length,
      checking: metas.filter(item => item.meta.checking && !item.meta.audit).length
    };

    ensurePanel(list, stats);
    restore(list);

    for (const item of metas) {
      renderCardBadge(item.entry, item.meta);
      if (!matches(item.meta, DS.state.creationAuditFilter)) item.entry.target.classList.add(HIDDEN_CLASS);
    }
  };

  DS.removeCreationAudit = cleanup;
})();
