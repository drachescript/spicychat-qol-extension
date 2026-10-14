// Feature-owned options helpers: creator-backups. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function portableBotProfileJson(archiveValue) {
  const raw = archiveValue && typeof archiveValue === "object" ? archiveValue : null;
  const id = String(raw?.id || "").trim();
  if (!id) return null;
  const archive = normalizeBotArchive({ meta: { [id]: raw } }).meta[id];
  if (!archive) return null;
  const fields = archive.fields || {};
  const organizer = normalizeBotOrganization(botOrganizationState).meta[id] || {};
  const splitTags = value => uniqueClean(String(value || "").split(/\s*,\s*/g).filter(Boolean));

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: fields.name || archive.name || id,
      title: fields.title || "",
      description: fields.description || "",
      personality: fields.personality || "",
      scenario: fields.scenario || "",
      first_mes: fields.greeting || "",
      mes_example: fields.exampleDialogues || "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: splitTags(fields.tags),
      creator: fields.creator || archive.creator || "",
      character_version: "",
      extensions: {
        spicychat_qol: {
          export_format: "spicychat-qol-portable-profile",
          export_version: 2,
          exported_at: new Date().toISOString(),
          spicychat_id: id,
          spicychat_profile_url: archive.profileUrl || `https://spicychat.ai/chatbot/${id}`,
          old_chat_urls: [...(archive.chatUrls || [])],
          avatar_url: fields.image || archive.image || "",
          visibility: fields.visibility || "",
          own_bot: !!archive.ownBot,
          revision_count: Array.isArray(archive.revisions) ? archive.revisions.length : 0,
          message_count: fields.messageCount || "",
          rating: fields.rating || "",
          token_count: fields.tokenCount || "",
          spicychat_fields: {
            title: fields.title || "",
            description: fields.description || "",
            greeting: fields.greeting || "",
            personality: fields.personality || "",
            scenario: fields.scenario || "",
            example_dialogues: fields.exampleDialogues || "",
            tags: splitTags(fields.tags),
            visibility: fields.visibility || ""
          },
          archive: {
            first_saved_at: Number(archive.firstSavedAt) || 0,
            last_saved_at: Number(archive.lastSavedAt) || 0,
            last_available_at: Number(archive.lastAvailableAt) || 0,
            source: archive.source || "",
            captured_fields: [...(archive.coverage || [])]
          },
          local: {
            favorite_history: normalizeBotStore(favoriteBotState).ids.includes(id),
            later: normalizeBotStore(laterBotState).ids.includes(id),
            folders: uniqueClean(organizer.collections || []),
            personal_tags: uniqueClean(organizer.tags || []),
            private_note: String(organizer.note || ""),
            creator_status: String(organizer.status || "")
          }
        }
      }
    }
  };
}

function downloadPortableBotProfile(archiveValue) {
  const payload = portableBotProfileJson(archiveValue);
  if (!payload) return;
  downloadJsonFile(payload, `${safeBotExportName(archiveValue)}-character-card-v2.json`);
}

function downloadBotArchiveEntry(archiveValue) {
  const archive = archiveValue && typeof archiveValue === "object" ? archiveValue : null;
  if (!archive) return;
  downloadJsonFile(archive, `${safeBotExportName(archive)}-qol-archive.json`);
}

function creatorBackupAge(timestamp) {
  const time = Number(timestamp) || 0;
  if (!time) return "not saved yet";
  const delta = Math.max(0, Date.now() - time);
  if (delta < 60_000) return "just now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function creatorBackupDate(timestamp) {
  const time = Number(timestamp) || 0;
  if (!time) return "Unknown date";
  try { return new Date(time).toLocaleString(); }
  catch { return "Unknown date"; }
}

function safeLorebookExportName(value) {
  return String(value?.name || value?.id || "spicychat-lorebook")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "spicychat-lorebook";
}

function downloadLorebookBackup(item) {
  if (!item?.id) return;
  downloadJsonFile({
    format: "spicychat-qol-lorebook-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    lorebook: item
  }, `${safeLorebookExportName(item)}-lorebook-backup.json`);
}

function creatorBackupOpen(url) {
  try { window.open(url, "_blank", "noopener,noreferrer"); }
  catch { location.href = url; }
}

async function deleteCreatorBackup(kind, id, name) {
  const label = kind === "bot" ? "chatbot" : "Lorebook";
  if (!confirm(`Delete the local QoL backup for ${name || label}? This does not delete anything on SpicyChat.`)) return;
  if (kind === "bot") {
    const current = await storageGet([BOT_ARCHIVE_KEY]);
    const store = normalizeBotArchive(current[BOT_ARCHIVE_KEY]);
    delete store.meta[id];
    await storageSet({ [BOT_ARCHIVE_KEY]: store });
  } else {
    const current = await storageGet([LOREBOOK_BACKUPS_KEY]);
    const store = normalizeLorebookBackups(current[LOREBOOK_BACKUPS_KEY]);
    delete store.meta[id];
    await storageSet({ [LOREBOOK_BACKUPS_KEY]: store });
  }
  await loadCreatorBackupManager({ force: true });
  showSettingsToast(`Deleted the local ${label} backup.`);
}

function creatorBackupFieldDiff(bot, revision) {
  const editable = ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues"];
  const current = bot?.fields || {};
  const previous = revision?.fields || {};
  return editable.map(field => {
    const before = String(previous[field] || "");
    const after = String(current[field] || "");
    if (before === after) return null;
    return { field, before, after, delta: after.length - before.length };
  }).filter(Boolean);
}

async function queueBotFieldRestore(bot, revision, fields) {
  const chosen = fields.filter(Boolean);
  if (!chosen.length) return showSettingsToast("Choose at least one field to restore.");
  const payload = {};
  for (const field of chosen) payload[field] = String(revision?.fields?.[field] || "");
  const ok = await storageSet({
    [PENDING_BOT_FIELD_RESTORE_KEY]: {
      botId: bot.id,
      botName: bot.name || bot.id,
      createdAt: Date.now(),
      revisionAt: Number(revision?.capturedAt || 0),
      fields: payload
    }
  });
  if (!ok) return showSettingsToast("Could not queue the selected backup fields.");
  creatorBackupOpen(`https://spicychat.ai/chatbot/edit/${encodeURIComponent(bot.id)}`);
  showSettingsToast("Restore queued. The editor will ask before filling those fields.");
}

async function mutateCreatorBotBackup(botId, mutate, successMessage = "Backup updated.") {
  const current = await storageGet([BOT_ARCHIVE_KEY]);
  const store = normalizeBotArchive(current[BOT_ARCHIVE_KEY]);
  const entry = store.meta[botId];
  if (!entry) return showSettingsToast("That local chatbot backup no longer exists.");
  await mutate(entry);
  const ok = await storageSet({ [BOT_ARCHIVE_KEY]: normalizeBotArchive(store) });
  if (!ok) return showSettingsToast("Could not update that local backup.");
  await loadCreatorBackupManager({ force: true });
  showSettingsToast(successMessage);
}

function revisionAsBotEntry(bot, revision) {
  return {
    ...bot,
    fields: revision?.fields || {},
    coverage: revision?.coverage || [],
    lastSavedAt: Number(revision?.capturedAt) || Number(bot.lastSavedAt) || 0,
    source: revision?.source || bot.source || "",
    revisions: [],
    manualBackups: []
  };
}

async function copyBackupJson(bot, revision) {
  const payload = portableBotProfileJson(revisionAsBotEntry(bot, revision));
  if (!payload) return showSettingsToast("Could not build JSON for that backup.");
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    showSettingsToast("Copied backup JSON to the clipboard.");
  } catch {
    showSettingsToast("Could not copy backup JSON to the clipboard.");
  }
}

function botVersionFieldValue(content, field) {
  if (field === "lorebook") {
    const id = String(content?.lorebook?.id || "");
    const name = String(content?.lorebook?.name || "");
    return name && id ? `${name} (${id})` : (name || id || "None");
  }
  return String(content?.[field] || "");
}

function botVersionAsRevision(version) {
  const content = normalizeBotVersionContent(version?.content || {});
  return {
    capturedAt: Number(version?.capturedAt) || 0,
    source: version?.source || `Bot version v${version?.number || "?"}`,
    fields: {
      name: content.name || "",
      title: content.title || "",
      greeting: content.greeting || "",
      personality: content.personality || "",
      scenario: content.scenario || "",
      exampleDialogues: content.exampleDialogues || "",
      tags: content.tags || "",
      image: content.image || ""
    },
    coverage: BOT_VERSION_FIELDS.filter(field => String(content[field] || ""))
  };
}

function creatorBotVersionDiff(previousVersion, version) {
  const before = normalizeBotVersionContent(previousVersion?.content || {});
  const after = normalizeBotVersionContent(version?.content || {});
  const fields = [...BOT_VERSION_FIELDS, "lorebook"];
  return fields.map(field => {
    const previousValue = botVersionFieldValue(before, field);
    const nextValue = botVersionFieldValue(after, field);
    if (previousValue === nextValue) return null;
    return { field, before: previousValue, after: nextValue };
  }).filter(Boolean);
}

function shortVersionValue(value, max = 700) {
  const text = String(value || "");
  if (text.length <= max) return text || "(empty)";
  return `${text.slice(0, max)}\n… (${text.length - max} more characters)`;
}

function creatorBackupVersionRow(bot, version, olderVersion) {
  const row = makeElement("div", { className: "creator-backup-revision" });
  const number = Math.max(1, Number(version?.number) || 1);
  const changed = Array.isArray(version?.changedFields) && version.changedFields.length
    ? version.changedFields
    : creatorBotVersionDiff(olderVersion, version).map(item => item.field);
  const changedText = changed.length
    ? changed.map(field => BOT_VERSION_LABELS[field] || field).join(", ")
    : (number === 1 ? "Initial captured version" : "Meaningful creator content changed");
  const label = version?.label ? ` · ${version.label}` : "";
  const stateBits = [];
  if (version?.state?.visibility) stateBits.push(version.state.visibility);
  if (version?.state?.moderation) stateBits.push(version.state.moderation);
  const stateText = stateBits.length ? ` · state: ${stateBits.join(" / ")}` : "";

  const text = makeElement("span", {
    text: `v${number} · ${creatorBackupDate(version?.capturedAt)}${label} · changed: ${changedText}${stateText}`
  });
  const actions = makeElement("span", { className: "creator-backup-row-actions" });

  const view = makeElement("button", { text: "View", attrs: { type: "button" } });
  view.addEventListener("click", () => {
    let box = row.querySelector(":scope > .creator-backup-compare[data-mode='view']");
    if (box) { box.remove(); return; }
    row.querySelectorAll(":scope > .creator-backup-compare").forEach(node => node.remove());
    box = makeElement("div", { className: "creator-backup-compare" });
    box.dataset.mode = "view";
    const content = normalizeBotVersionContent(version?.content || {});
    box.textContent = [...BOT_VERSION_FIELDS, "lorebook"]
      .map(field => `${BOT_VERSION_LABELS[field] || field}:\n${shortVersionValue(botVersionFieldValue(content, field))}`)
      .join("\n\n");
    row.appendChild(box);
  });

  const compare = makeElement("button", { text: "Compare", attrs: { type: "button" } });
  compare.addEventListener("click", () => {
    let box = row.querySelector(":scope > .creator-backup-compare[data-mode='version-compare']");
    if (box) { box.remove(); return; }
    row.querySelectorAll(":scope > .creator-backup-compare").forEach(node => node.remove());
    box = makeElement("div", { className: "creator-backup-compare" });
    box.dataset.mode = "version-compare";
    if (!olderVersion) {
      box.textContent = "This is the first locally recorded bot version, so there is no older version to compare against.";
    } else {
      const diff = creatorBotVersionDiff(olderVersion, version);
      box.textContent = diff.length
        ? diff.map(item => `${BOT_VERSION_LABELS[item.field] || item.field}\n--- v${olderVersion.number || "?"}\n${shortVersionValue(item.before)}\n+++ v${number}\n${shortVersionValue(item.after)}`).join("\n\n")
        : "No creator-content differences from the previous recorded version.";
    }
    row.appendChild(box);
  });

  const restore = makeElement("button", { text: "Restore fields", attrs: { type: "button" } });
  restore.addEventListener("click", () => {
    let box = row.querySelector(":scope > .creator-backup-restore-fields");
    if (box) { box.remove(); return; }
    const revision = botVersionAsRevision(version);
    const restorable = ["name", "title", "greeting", "personality", "scenario", "exampleDialogues", "tags"]
      .filter(field => String(revision.fields?.[field] || "").length > 0);
    box = makeElement("div", { className: "creator-backup-restore-fields" });
    if (!restorable.length) {
      box.appendChild(makeElement("span", { className: "hint", text: "This version has no editor fields available to restore." }));
      row.appendChild(box);
      return;
    }
    for (const field of restorable) {
      const input = makeElement("input", { attrs: { type: "checkbox", value: field } });
      input.checked = true;
      box.appendChild(makeElement("label", {}, [input, document.createTextNode(BOT_VERSION_LABELS[field] || field)]));
    }
    const go = makeElement("button", { text: "Open editor with selected fields", attrs: { type: "button" } });
    go.addEventListener("click", () => queueBotFieldRestore(bot, revision, [...box.querySelectorAll("input:checked")].map(input => input.value)));
    box.appendChild(go);
    row.appendChild(box);
  });

  const rename = makeElement("button", { text: "Rename", attrs: { type: "button" } });
  rename.addEventListener("click", async () => {
    const next = prompt(`Name bot version v${number}:`, version?.label || "");
    if (next == null) return;
    const labelValue = cleanBotArchiveText(next, 160);
    await mutateCreatorBotBackup(bot.id, entry => {
      const item = (entry.versions || []).find(candidate => String(candidate.id || "") === String(version.id || "") || Number(candidate.number) === number);
      if (item) item.label = labelValue;
    }, labelValue ? `Renamed bot version v${number}.` : `Cleared the name for bot version v${number}.`);
  });

  const del = makeElement("button", { text: "Delete", attrs: { type: "button" } });
  del.addEventListener("click", async () => {
    if (!confirm(`Delete bot version v${number}? Safety revisions/manual checkpoints are separate and will not be deleted.`)) return;
    await mutateCreatorBotBackup(bot.id, entry => {
      entry.versions = (entry.versions || []).filter(item => !(String(item.id || "") === String(version.id || "") || Number(item.number) === number));
    }, `Deleted bot version v${number}.`);
  });

  actions.append(view, compare, restore, rename, del);
  row.append(text, actions);
  return row;
}

function creatorBackupRevisionRow(bot, revision, index, options = {}) {
  const isManual = options.manual === true;
  const allowRestore = options.allowRestore !== false && !!bot.ownBot;
  const row = makeElement("div", { className: "creator-backup-revision" });
  const label = isManual ? (revision.label || "Manual backup") : (revision.kind === "profile" ? "Profile snapshot" : "Automatic revision");
  const text = makeElement("span", {
    text: `${label} · ${creatorBackupDate(revision.capturedAt)}${revision.source ? ` · ${revision.source}` : ""} · ${revision.coverage?.length || 0} fields`
  });
  const actions = makeElement("span", { className: "creator-backup-row-actions" });
  const exp = makeElement("button", { text: "Export", attrs: { type: "button" } });
  exp.addEventListener("click", () => {
    const payload = portableBotProfileJson(revisionAsBotEntry(bot, revision));
    if (payload) downloadJsonFile(payload, `${safeBotExportName(bot)}-${isManual ? "manual" : "revision"}-${index + 1}-character-card-v2.json`);
  });
  const copy = makeElement("button", { text: "Copy JSON", attrs: { type: "button" } });
  copy.addEventListener("click", () => copyBackupJson(bot, revision));
  const compare = makeElement("button", { text: "Compare", attrs: { type: "button" } });
  actions.append(exp, copy, compare);

  if (allowRestore) {
    const restore = makeElement("button", { text: "Restore fields", attrs: { type: "button" } });
    restore.addEventListener("click", () => {
      let box = row.querySelector(":scope > .creator-backup-restore-fields");
      if (box) { box.remove(); return; }
      const diff = creatorBackupFieldDiff(bot, revision);
      const restorable = Object.entries(revision?.fields || {})
        .filter(([field, value]) => ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues", "tags", "visibility"].includes(field) && String(value || "").length > 0)
        .map(([field]) => diff.find(item => item.field === field) || { field });
      box = makeElement("div", { className: "creator-backup-restore-fields" });
      if (!restorable.length) {
        box.appendChild(makeElement("span", { className: "hint", text: "This backup has no writing fields available to restore." }));
        row.appendChild(box);
        return;
      }
      for (const item of restorable) {
        const input = makeElement("input", { attrs: { type: "checkbox", value: item.field } });
        input.checked = true;
        box.appendChild(makeElement("label", {}, [input, document.createTextNode(BOT_ARCHIVE_LABELS[item.field] || item.field)]));
      }
      const go = makeElement("button", { text: "Open editor with selected fields", attrs: { type: "button" } });
      go.addEventListener("click", () => queueBotFieldRestore(bot, revision, [...box.querySelectorAll("input:checked")].map(input => input.value)));
      box.appendChild(go);
      row.appendChild(box);
    });
    actions.appendChild(restore);
  }

  if (isManual) {
    const rename = makeElement("button", { text: "Rename", attrs: { type: "button" } });
    rename.addEventListener("click", async () => {
      const next = prompt("Name this manual backup:", revision.label || "Manual backup");
      if (next == null) return;
      const labelValue = cleanBotArchiveText(next, 160) || "Manual backup";
      await mutateCreatorBotBackup(bot.id, entry => {
        const item = (entry.manualBackups || []).find(candidate => candidate.id === revision.id);
        if (item) item.label = labelValue;
      }, "Renamed the manual backup.");
    });
    const duplicate = makeElement("button", { text: "Duplicate", attrs: { type: "button" } });
    duplicate.addEventListener("click", async () => {
      await mutateCreatorBotBackup(bot.id, entry => {
        const item = (entry.manualBackups || []).find(candidate => candidate.id === revision.id);
        if (!item) return;
        entry.manualBackups = [{
          ...item,
          id: `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          capturedAt: Date.now(),
          label: `Copy of ${item.label || "Manual backup"}`,
          kind: "manual"
        }, ...(entry.manualBackups || [])];
      }, "Duplicated the manual backup.");
    });
    actions.append(rename, duplicate);
  }

  const del = makeElement("button", { text: "Delete", attrs: { type: "button" } });
  del.addEventListener("click", async () => {
    if (!confirm(`Delete this ${isManual ? "manual backup" : "automatic revision"}?`)) return;
    await mutateCreatorBotBackup(bot.id, entry => {
      if (isManual) entry.manualBackups = (entry.manualBackups || []).filter(item => item.id !== revision.id);
      else entry.revisions = (entry.revisions || []).filter(item => !(Number(item.capturedAt) === Number(revision.capturedAt) && String(item.source || "") === String(revision.source || "")));
    }, `Deleted the ${isManual ? "manual backup" : "automatic revision"}.`);
  });
  actions.appendChild(del);
  row.append(text, actions);

  const diff = creatorBackupFieldDiff(bot, revision);
  compare.addEventListener("click", () => {
    let box = row.querySelector(":scope > .creator-backup-compare");
    if (box) { box.remove(); return; }
    box = makeElement("div", { className: "creator-backup-compare" });
    box.textContent = diff.length
      ? diff.map(item => `${BOT_ARCHIVE_LABELS[item.field] || item.field}: ${item.before.length} → ${item.after.length} chars (${item.delta >= 0 ? "+" : ""}${item.delta})`).join("\n")
      : "No supported writing-field differences from the latest saved copy.";
    row.appendChild(box);
  });
  return row;
}

function creatorBackupBotRow(bot, kind = "bot") {
  const isProfile = kind === "profile";
  const autoOn = isProfile
    ? !!creatorBackupManagerState.settings.botArchiveOnProfileVisit
    : !!(creatorBackupManagerState.settings.botBackupToolsEnabled && creatorBackupManagerState.settings.botArchiveOwnEditorBackups);
  const stale = autoOn && Number(bot.lastSavedAt || 0) > 0 && Date.now() - Number(bot.lastSavedAt) > CREATOR_BACKUP_STALE_MS;
  const row = makeElement("article", { className: `creator-backup-row${stale ? " is-stale" : ""}` });
  row.dataset.backupKind = kind;
  row.dataset.backupId = bot.id;

  const head = makeElement("div", { className: "creator-backup-row-head" });
  const main = makeElement("div", { className: "creator-backup-row-main" });
  main.appendChild(makeElement("div", { className: "creator-backup-row-title", text: bot.name || bot.id }));
  const revisions = Array.isArray(bot.revisions) ? bot.revisions : [];
  const manuals = Array.isArray(bot.manualBackups) ? bot.manualBackups : [];
  const versions = Array.isArray(bot.versions) ? [...bot.versions].sort((a, b) => b.number - a.number || b.capturedAt - a.capturedAt) : [];
  const details = [
    isProfile ? "Bot profile" : "My chatbot",
    `last backup ${creatorBackupAge(bot.lastSavedAt)}`,
    ...(isProfile ? [] : [`${versions.length} bot version${versions.length === 1 ? "" : "s"}`]),
    `${revisions.length} safety revision${revisions.length === 1 ? "" : "s"}`
  ];
  if (!isProfile) details.push(`${manuals.length} manual backup${manuals.length === 1 ? "" : "s"}`);
  const visibility = cleanBotArchiveText(bot.fields?.visibility || "", 40);
  if (visibility) details.push(visibility);
  if (stale) details.push("automatic backup has not refreshed this for 7+ days");
  main.appendChild(makeElement("div", { className: "creator-backup-row-meta", text: details.join(" · ") }));

  const actions = makeElement("div", { className: "creator-backup-row-actions" });
  const open = makeElement("button", { text: isProfile ? "Open profile" : "Open editor", attrs: { type: "button" } });
  open.addEventListener("click", () => creatorBackupOpen(isProfile ? (bot.profileUrl || `https://spicychat.ai/chatbot/${encodeURIComponent(bot.id)}`) : `https://spicychat.ai/chatbot/edit/${encodeURIComponent(bot.id)}`));
  const exp = makeElement("button", { text: "Export latest", attrs: { type: "button" } });
  exp.addEventListener("click", () => downloadPortableBotProfile(bot));
  const del = makeElement("button", { text: "Delete all", attrs: { type: "button" } });
  del.addEventListener("click", () => deleteCreatorBackup("bot", bot.id, bot.name));
  actions.append(open, exp);
  if (!isProfile) {
    const restoreLatest = makeElement("button", { text: "Restore latest", attrs: { type: "button" } });
    restoreLatest.addEventListener("click", () => {
      const revision = { capturedAt: bot.lastSavedAt, source: bot.source || "Latest backup", fields: bot.fields || {}, coverage: bot.coverage || [] };
      const fields = ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues", "tags", "visibility"]
        .filter(field => String(revision.fields?.[field] || "").length > 0);
      queueBotFieldRestore(bot, revision, fields);
    });
    actions.appendChild(restoreLatest);
  }
  if (revisions.length) {
    const clearAuto = makeElement("button", { text: "Clear safety history", attrs: { type: "button" } });
    clearAuto.addEventListener("click", async () => {
      if (!confirm("Delete all rotating safety/profile revisions for this bot? Bot Version History, manual backups and the latest copy will remain.")) return;
      await mutateCreatorBotBackup(bot.id, entry => { entry.revisions = []; }, "Cleared the safety revision history.");
    });
    actions.appendChild(clearAuto);
  }
  actions.appendChild(del);
  head.append(main, actions);
  row.appendChild(head);

  if (versions.length && !isProfile) {
    const versionHistory = makeElement("details", { className: "creator-backup-revisions" });
    versionHistory.appendChild(makeElement("summary", { text: `Bot Version History (${versions.length})` }));
    const list = makeElement("div", { className: "creator-backup-revision-list" });
    versions.forEach((version, index) => {
      const olderVersion = versions[index + 1] || null;
      list.appendChild(creatorBackupVersionRow(bot, version, olderVersion));
    });
    versionHistory.appendChild(list);
    row.appendChild(versionHistory);
  }

  if (manuals.length && !isProfile) {
    const manualHistory = makeElement("details", { className: "creator-backup-revisions" });
    manualHistory.appendChild(makeElement("summary", { text: `Manual backups (${manuals.length})` }));
    const list = makeElement("div", { className: "creator-backup-revision-list" });
    manuals.forEach((backup, index) => list.appendChild(creatorBackupRevisionRow(bot, backup, index, { manual: true, allowRestore: true })));
    manualHistory.appendChild(list);
    row.appendChild(manualHistory);
  }

  if (revisions.length) {
    const history = makeElement("details", { className: "creator-backup-revisions" });
    history.appendChild(makeElement("summary", { text: `${isProfile ? "Profile" : "Safety revision"} history (${revisions.length})` }));
    const list = makeElement("div", { className: "creator-backup-revision-list" });
    revisions.forEach((revision, index) => list.appendChild(creatorBackupRevisionRow(bot, revision, index, { allowRestore: !isProfile })));
    history.appendChild(list);
    row.appendChild(history);
  }
  return row;
}

function creatorBackupLorebookRow(book) {
  const autoOn = !!(creatorBackupManagerState.settings.lorebookBackupToolsEnabled && creatorBackupManagerState.settings.lorebookBackupsEnabled);
  const stale = autoOn && Number(book.lastSavedAt || 0) > 0 && Date.now() - Number(book.lastSavedAt) > CREATOR_BACKUP_STALE_MS;
  const row = makeElement("article", { className: `creator-backup-row${stale ? " is-stale" : ""}` });
  row.dataset.backupKind = "lorebook";
  row.dataset.backupId = book.id;

  const head = makeElement("div", { className: "creator-backup-row-head" });
  const main = makeElement("div", { className: "creator-backup-row-main" });
  main.appendChild(makeElement("div", { className: "creator-backup-row-title", text: book.name || book.id }));
  const entryCount = Object.keys(book.entries || {}).length;
  const details = [
    "Lorebook",
    `last backup ${creatorBackupAge(book.lastSavedAt)}`,
    `${entryCount} entr${entryCount === 1 ? "y" : "ies"}`
  ];
  if (book.visibility) details.push(book.visibility);
  if (stale) details.push("automatic backup has not refreshed this for 7+ days");
  main.appendChild(makeElement("div", { className: "creator-backup-row-meta", text: details.join(" · ") }));

  const actions = makeElement("div", { className: "creator-backup-row-actions" });
  const open = makeElement("button", { text: "Open editor", attrs: { type: "button" } });
  open.addEventListener("click", () => creatorBackupOpen(`https://spicychat.ai/lorebook/edit/${encodeURIComponent(book.id)}`));
  const exp = makeElement("button", { text: "Export latest", attrs: { type: "button" } });
  exp.addEventListener("click", () => downloadLorebookBackup(book));
  const del = makeElement("button", { text: "Delete backup", attrs: { type: "button" } });
  del.addEventListener("click", () => deleteCreatorBackup("lorebook", book.id, book.name));
  actions.append(open, exp, del);
  head.append(main, actions);
  row.appendChild(head);
  return row;
}

function renderCreatorBackupManager() {
  const host = $("creatorBackupManager");
  if (!host) return;
  const query = String($("creatorBackupSearch")?.value || "").trim().toLowerCase();
  const type = value("creatorBackupType", "all");
  const allBotBackups = Object.values(creatorBackupManagerState.bots.meta || {})
    .filter(bot => !query || `${bot.name || ""} ${bot.id || ""} ${bot.creator || ""}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.lastSavedAt || 0) - Number(a.lastSavedAt || 0));
  const bots = allBotBackups.filter(bot => bot?.ownBot);
  const profiles = allBotBackups.filter(bot => bot?.profileBackup && !bot?.ownBot);
  const books = Object.values(creatorBackupManagerState.lorebooks.meta || {})
    .filter(book => !query || `${book.name || ""} ${book.id || ""} ${(book.tags || []).join(" ")}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.lastSavedAt || 0) - Number(a.lastSavedAt || 0));
  const visibleBots = ["all", "bots"].includes(type) ? bots : [];
  const visibleProfiles = ["all", "profiles"].includes(type) ? profiles : [];
  const visibleBooks = ["all", "lorebooks"].includes(type) ? books : [];

  host.replaceChildren();
  [
    ...visibleBots.map(bot => creatorBackupBotRow(bot, "bot")),
    ...visibleProfiles.map(bot => creatorBackupBotRow(bot, "profile")),
    ...visibleBooks.map(creatorBackupLorebookRow)
  ].forEach(row => host.appendChild(row));
  if (!host.children.length) host.appendChild(makeElement("span", { className: "hint", text: query ? "No matching backups found." : "No creator backups saved yet." }));
  if ($("creatorBackupSummary")) {
    const botTools = creatorBackupManagerState.settings.botBackupToolsEnabled ? "On" : "Off";
    const loreTools = creatorBackupManagerState.settings.lorebookBackupToolsEnabled ? "On" : "Off";
    const botAuto = creatorBackupManagerState.settings.botBackupToolsEnabled && creatorBackupManagerState.settings.botArchiveOwnEditorBackups ? "On" : "Off";
    const profileAuto = creatorBackupManagerState.settings.botArchiveOnProfileVisit ? "On" : "Off";
    const loreAuto = creatorBackupManagerState.settings.lorebookBackupToolsEnabled && creatorBackupManagerState.settings.lorebookBackupsEnabled ? "On" : "Off";
    $("creatorBackupSummary").textContent = `${bots.length} own bot${bots.length === 1 ? "" : "s"} · ${profiles.length} profile${profiles.length === 1 ? "" : "s"} · ${books.length} Lorebook${books.length === 1 ? "" : "s"} · auto: bots ${botAuto}, profiles ${profileAuto}, Lorebooks ${loreAuto} · bot tools ${botTools}, Lorebook tools ${loreTools}`;
  }

  let focusId = "";
  let kind = "bot";
  try {
    const params = new URLSearchParams(location.search || "");
    focusId = params.get("backup") || params.get("lorebookBackup") || "";
    kind = params.has("lorebookBackup") ? "lorebook" : (params.has("profileBackup") ? "profile" : "bot");
  } catch {}
  if (creatorBackupPendingFocus?.id) {
    focusId = creatorBackupPendingFocus.id;
    kind = creatorBackupPendingFocus.kind === "lorebook" ? "lorebook" : "bot";
  }
  if (focusId) {
    const target = host.querySelector(`[data-backup-kind="${kind}"][data-backup-id="${CSS.escape(focusId)}"]`);
    if (target && !target.dataset.dsFocusedOnce) {
      target.dataset.dsFocusedOnce = "1";
      expandSettingsCardForTarget(target);
      requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
      if (creatorBackupPendingFocus?.id === focusId) creatorBackupPendingFocus = null;
    }
  }
}

async function loadCreatorBackupManager({ force = false } = {}) {
  if (creatorBackupManagerLoading) return;
  if (creatorBackupManagerLoaded && !force) return renderCreatorBackupManager();
  creatorBackupManagerLoading = true;
  try {
    const result = await storageGet([BOT_ARCHIVE_KEY, LOREBOOK_BACKUPS_KEY, "settings"]);
    creatorBackupManagerState = {
      bots: normalizeBotArchive(result[BOT_ARCHIVE_KEY]),
      lorebooks: normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]),
      settings: { ...DEFAULT_SETTINGS, ...(result.settings || {}) }
    };
    creatorBackupManagerLoaded = true;
    renderCreatorBackupManager();
  } finally {
    creatorBackupManagerLoading = false;
  }
}

function setupCreatorBackupManager() {
  $("creatorBackupSearch")?.addEventListener("input", renderCreatorBackupManager);
  $("creatorBackupType")?.addEventListener("change", renderCreatorBackupManager);
  $("creatorBackupRefresh")?.addEventListener("click", () => loadCreatorBackupManager({ force: true }));
  const card = $("creatorBackupManagerCard");
  card?.querySelector(".settings-card-toggle")?.addEventListener("click", () => loadCreatorBackupManager());
  if (activeOptionsTab() === "bot-tools") loadCreatorBackupManager().catch(() => {});
}
