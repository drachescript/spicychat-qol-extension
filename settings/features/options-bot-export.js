// Feature-owned options helpers: bot-export. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function botStatusArchiveExportSourceAllowed(entry) {
  const source = String(entry?.source || "").trim();
  if (!source || BOT_STATUS_ARCHIVE_PRIVATE_SOURCE_RE.test(source)) return false;
  return BOT_STATUS_ARCHIVE_PUBLIC_SOURCE_RE.test(source);
}

function botStatusArchiveExportTags(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/\s*,\s*|\n+/g);
  return uniqueClean(raw.map(tag => cleanBotArchiveText(tag, 120)).filter(Boolean)).slice(0, 100);
}

function botStatusArchiveExportFields(entryValue) {
  const entry = entryValue && typeof entryValue === "object" ? entryValue : {};
  const fields = entry.fields && typeof entry.fields === "object" ? entry.fields : {};
  return {
    name: cleanBotArchiveText(fields.name || entry.name || "", 500),
    title: cleanBotArchiveText(fields.title || "", 12000),
    description: cleanBotArchiveText(fields.description || "", 12000),
    greeting: cleanBotArchiveText(fields.greeting || "", 12000),
    personality: cleanBotArchiveText(fields.personality || "", 18000),
    scenario: cleanBotArchiveText(fields.scenario || "", 12000),
    exampleDialogues: cleanBotArchiveText(fields.exampleDialogues || "", 18000),
    tags: botStatusArchiveExportTags(fields.tags),
    visibility: cleanBotArchiveText(fields.visibility || "", 120),
    creator: cleanBotArchiveText(fields.creator || entry.creator || "", 500),
    avatarUrl: canonicalBotImage(fields.image || entry.image || ""),
    messageCount: cleanBotArchiveText(fields.messageCount || "", 120),
    rating: cleanBotArchiveText(fields.rating || "", 120),
    tokenCount: cleanBotArchiveText(fields.tokenCount || "", 120)
  };
}

function botStatusArchiveExportRevision(revisionValue) {
  const revision = normalizeBotArchiveRevision(revisionValue);
  if (!revision || !botStatusArchiveExportSourceAllowed(revision)) return null;
  return {
    capturedAt: Number(revision.capturedAt) || 0,
    source: cleanBotArchiveText(revision.source || "", 120),
    kind: cleanBotArchiveText(revision.kind || "auto", 40) || "auto",
    fields: botStatusArchiveExportFields({ fields: revision.fields || {} }),
    coverage: [...(revision.coverage || [])]
  };
}

function botStatusArchiveExportRecord(entryValue, availabilityValue) {
  const entry = entryValue && typeof entryValue === "object" ? entryValue : {};
  const availability = availabilityValue && typeof availabilityValue === "object" ? availabilityValue : null;
  const revisions = Array.isArray(entry.revisions)
    ? entry.revisions.map(botStatusArchiveExportRevision).filter(Boolean)
    : [];
  const snapshotAt = Number(entry.lastSavedAt) || Number(entry.lastAvailableAt) || Number(entry.firstSavedAt) || 0;
  const status = availability && BOT_AVAILABILITY_STATUSES.has(String(availability.status || "").toLowerCase())
    ? String(availability.status).toLowerCase()
    : "unknown";

  return {
    id: String(entry.id || "").trim(),
    snapshotAt,
    firstSavedAt: Number(entry.firstSavedAt) || 0,
    lastSavedAt: Number(entry.lastSavedAt) || 0,
    lastAvailableAt: Number(entry.lastAvailableAt) || 0,
    source: cleanBotArchiveText(entry.source || "", 120),
    profileUrl: String(entry.profileUrl || (entry.id ? `https://spicychat.ai/chatbot/${entry.id}` : "")).trim(),
    fields: botStatusArchiveExportFields(entry),
    coverage: [...(entry.coverage || [])],
    publicHistory: revisions,
    statusObservation: {
      status,
      checkedAt: Number(availability?.checkedAt) || 0,
      httpStatus: Number(availability?.httpStatus) || 0,
      reason: cleanBotArchiveText(availability?.reason || "", 500)
    }
  };
}

function botStatusArchiveExportFilename(extension = "json.gz") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `spicychat-qol-bot-status-archive-${stamp}.${extension}`;
}

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function downloadBotStatusArchiveJsonGz() {
  const button = $("exportBotStatusArchiveJsonGz");
  const statusEl = $("botStatusArchiveExportStatus");
  const setStatus = text => { if (statusEl) statusEl.textContent = text; };
  if (button?.disabled) return;
  if (button) button.disabled = true;

  try {
    setStatus("Preparing archive export…");
    const stored = await storageGet([BOT_ARCHIVE_KEY, BOT_AVAILABILITY_KEY]);
    const archive = normalizeBotArchive(stored[BOT_ARCHIVE_KEY]);
    const availability = normalizeBotAvailability(stored[BOT_AVAILABILITY_KEY]);
    const allEntries = Object.values(archive.meta || {}).sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
    const entries = allEntries.filter(botStatusArchiveExportSourceAllowed);
    const skippedUnsafeCopies = Math.max(0, allEntries.length - entries.length);

    if (!entries.length) {
      setStatus("No public / Bot Status saved copies to export.");
      showSettingsToast("No public / Bot Status saved copies were found. Manual creator/editor backups are intentionally excluded.");
      return;
    }

    const statusCounts = { available: 0, unavailable: 0, restricted: 0, unknown: 0 };
    let withPublicHistory = 0;
    for (const entry of entries) {
      const observed = availability.meta?.[entry.id]?.status;
      const key = BOT_AVAILABILITY_STATUSES.has(String(observed || "").toLowerCase())
        ? String(observed).toLowerCase()
        : "unknown";
      statusCounts[key] = Number(statusCounts[key] || 0) + 1;
      if (Array.isArray(entry.revisions) && entry.revisions.some(revision => botStatusArchiveExportRevision(revision))) withPublicHistory += 1;
    }

    const header = {
      schema: BOT_STATUS_ARCHIVE_EXPORT_SCHEMA,
      version: BOT_STATUS_ARCHIVE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      generatedBy: {
        product: "SpicyChat QoL",
        version: String(chrome.runtime?.getManifest?.().version || "0.2.21")
      },
      source: "qol-bot-status-export",
      semantics: {
        snapshotsAreHistoricalObservations: true,
        currentPublicStatusRequiresVerification: true,
        unavailableOr404DoesNotByItselfMeanDeleted: true,
        emptyImportedFieldsMustNotReplaceKnownArchiveValues: true,
        manualCreatorBackupsExcluded: true,
        localPrivateNotesExcluded: true
      },
      counts: {
        savedCopiesSeen: allEntries.length,
        exportedBots: entries.length,
        skippedNonPublicOrManualCopies: skippedUnsafeCopies,
        withPublicHistory,
        statusObservations: statusCounts
      }
    };

    if (typeof CompressionStream !== "function") {
      const bots = entries.map(entry => botStatusArchiveExportRecord(entry, availability.meta?.[entry.id]));
      downloadJsonFile({ ...header, bots }, botStatusArchiveExportFilename("json"));
      setStatus(`Exported ${entries.length} bots as JSON (gzip is unavailable in this browser).`);
      showSettingsToast(`Exported ${entries.length} archive snapshot${entries.length === 1 ? "" : "s"}. This browser does not support gzip, so QoL used plain JSON.`);
      return;
    }

    // Stream one bot at a time into gzip so thousands of rich snapshots do not
    // require a second giant uncompressed JSON string in memory.
    const encoder = new TextEncoder();
    const gzip = new CompressionStream("gzip");
    const blobPromise = new Response(gzip.readable).blob();
    const writer = gzip.writable.getWriter();
    const prefix = `${JSON.stringify(header).slice(0, -1)},\"bots\":[`;
    await writer.write(encoder.encode(prefix));

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const record = botStatusArchiveExportRecord(entry, availability.meta?.[entry.id]);
      await writer.write(encoder.encode(`${index ? "," : ""}${JSON.stringify(record)}`));
      if ((index + 1) % 250 === 0 || index + 1 === entries.length) {
        setStatus(`Compressing ${index + 1} / ${entries.length} saved copies…`);
        await nextUiFrame();
      }
    }

    await writer.write(encoder.encode("]}"));
    await writer.close();
    const compressed = await blobPromise;
    const gzipBlob = new Blob([compressed], { type: "application/gzip" });
    downloadBlobFile(gzipBlob, botStatusArchiveExportFilename("json.gz"));
    setStatus(`Exported ${entries.length} saved copies${skippedUnsafeCopies ? ` · skipped ${skippedUnsafeCopies} manual/non-public` : ""}.`);
    showSettingsToast(`Archive export ready: ${entries.length} saved bot cop${entries.length === 1 ? "y" : "ies"} in compressed JSON.`);
  } catch (error) {
    console.error("SpicyChat QoL archive export failed", error);
    setStatus("Archive export failed.");
    showSettingsToast(`Could not create the archive export: ${String(error?.message || error || "unknown error")}`);
  } finally {
    if (button) button.disabled = false;
  }
}
