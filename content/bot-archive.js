(() => {
  "use strict";

  const DS = window.DragonScriptQoL = window.DragonScriptQoL || {};
  const KEY = DS.BOT_ARCHIVE_KEY || "botArchive";
  const FIELDS = [
    "name", "title", "description", "greeting", "personality", "scenario",
    "exampleDialogues", "tags", "visibility", "creator", "image",
    "messageCount", "rating", "tokenCount"
  ];
  const VERSION_CONTENT_FIELDS = [
    "name", "title", "greeting", "personality", "scenario",
    "exampleDialogues", "tags", "image"
  ];
  const PROFILE_REVISION_FIELDS = [
    "name", "title", "description", "greeting", "personality", "scenario",
    "exampleDialogues", "tags", "visibility", "creator", "image"
  ];

  let inflight = false;
  let lastRouteKey = "";
  let writeChain = Promise.resolve();
  const seenPending = new Map();
  let seenFlushTimer = null;

  function clean(value, max = 14000) {
    if (Array.isArray(value)) {
      return [...new Set(value.map(item => clean(item, 1000)).filter(Boolean))].join(", ").slice(0, max);
    }
    if (value && typeof value === "object") {
      return clean(value.name || value.username || value.handle || value.title || value.url || value.src || "", max);
    }
    return String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, max);
  }

  function imageUrl(value) {
    const text = clean(value, 2000);
    if (!text) return "";
    try {
      const url = new URL(text, "https://spicychat.ai");
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return text.replace(/[?#].*$/, "");
    }
  }

  function sameArchiveFieldsFor(a, b, fields = FIELDS) {
    const left = a && typeof a === "object" ? a : {};
    const right = b && typeof b === "object" ? b : {};
    return fields.every(field => clean(left[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000) === clean(right[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000));
  }

  function sameArchiveFields(a, b) {
    return sameArchiveFieldsFor(a, b, FIELDS);
  }

  function sameProfileRevisionFields(a, b) {
    return sameArchiveFieldsFor(a, b, PROFILE_REVISION_FIELDS);
  }

  function normalizedVersionTags(value) {
    const values = String(value || "")
      .split(/\s*,\s*/g)
      .map(tag => clean(tag, 120))
      .filter(Boolean);
    const deduped = [...new Map(values.map(tag => [tag.toLocaleLowerCase(), tag])).values()];
    deduped.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return deduped.join(", ");
  }

  function normalizeVersionContent(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const content = {};
    for (const field of VERSION_CONTENT_FIELDS) {
      if (field === "image") content[field] = imageUrl(source[field] || "");
      else if (field === "tags") content[field] = normalizedVersionTags(source[field]);
      else content[field] = clean(source[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
    }
    const lorebookRaw = source.lorebook && typeof source.lorebook === "object" ? source.lorebook : {};
    content.lorebook = {
      id: clean(lorebookRaw.id || source.lorebookId || "", 240),
      name: clean(lorebookRaw.name || source.lorebookName || "", 500)
    };
    return content;
  }

  function versionContentSignature(raw) {
    return JSON.stringify(normalizeVersionContent(raw));
  }

  function versionChangedFields(previousRaw, nextRaw) {
    const previous = normalizeVersionContent(previousRaw);
    const next = normalizeVersionContent(nextRaw);
    const changed = [];
    for (const field of VERSION_CONTENT_FIELDS) {
      if (String(previous[field] || "") !== String(next[field] || "")) changed.push(field);
    }
    if (String(previous.lorebook?.id || "") !== String(next.lorebook?.id || "") ||
        String(previous.lorebook?.name || "") !== String(next.lorebook?.name || "")) changed.push("lorebook");
    return changed;
  }

  function normalizeVersionState(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      visibility: clean(source.visibility || "", 80),
      moderation: clean(source.moderation || "", 80),
      capturedAt: Number(source.capturedAt) || 0
    };
  }

  function normalizeBotVersion(raw) {
    if (!raw || typeof raw !== "object") return null;
    const content = normalizeVersionContent(raw.content || raw.fields || raw);
    const hasContent = VERSION_CONTENT_FIELDS.some(field => String(content[field] || "")) || content.lorebook.id || content.lorebook.name;
    if (!hasContent) return null;
    const changedFields = Array.isArray(raw.changedFields)
      ? [...new Set(raw.changedFields.map(field => clean(field, 80)).filter(Boolean))]
      : [];
    return {
      id: clean(raw.id || "", 120),
      number: Math.max(1, Number(raw.number) || 1),
      capturedAt: Number(raw.capturedAt) || Number(raw.savedAt) || 0,
      source: clean(raw.source || "", 120),
      label: clean(raw.label || "", 160),
      content,
      state: normalizeVersionState(raw.state),
      changedFields
    };
  }

  function revisionLimit() {
    return Math.max(1, Math.min(50, Number(DS.state?.settings?.botArchiveOwnRevisionLimit) || 10));
  }

  function normalizeRevision(raw) {
    if (!raw || typeof raw !== "object") return null;
    const fields = {};
    for (const field of FIELDS) {
      fields[field] = field === "image"
        ? imageUrl(raw.fields?.[field] || raw[field] || "")
        : clean(raw.fields?.[field] ?? raw[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
    }
    if (!FIELDS.some(field => fields[field])) return null;
    return {
      id: clean(raw.id || "", 120),
      capturedAt: Number(raw.capturedAt) || Number(raw.savedAt) || 0,
      source: clean(raw.source || "", 120),
      label: clean(raw.label || "", 160),
      kind: clean(raw.kind || "auto", 40) || "auto",
      fields,
      coverage: FIELDS.filter(field => fields[field])
    };
  }

  function normalizeManualBackup(raw) {
    const revision = normalizeRevision(raw);
    if (!revision) return null;
    return {
      ...revision,
      id: revision.id || `manual-${revision.capturedAt || Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "manual",
      label: revision.label || "Manual backup"
    };
  }

  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawMeta = source.meta && typeof source.meta === "object" ? source.meta : source;
    const meta = {};
    for (const [rawId, raw] of Object.entries(rawMeta || {})) {
      if (!raw || typeof raw !== "object") continue;
      const id = String(rawId || raw.id || "").trim();
      if (!id) continue;
      const rawFields = raw.fields && typeof raw.fields === "object" ? raw.fields : raw;
      const fields = {};
      for (const field of FIELDS) {
        fields[field] = field === "image"
          ? imageUrl(rawFields[field] || raw.image || "")
          : clean(rawFields[field], field === "personality" || field === "exampleDialogues" ? 18000 : 12000);
      }
      meta[id] = {
        id,
        name: clean(raw.name || fields.name || id, 500),
        creator: clean(raw.creator || fields.creator || "", 500),
        image: imageUrl(raw.image || fields.image || ""),
        profileUrl: String(raw.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
        firstSavedAt: Number(raw.firstSavedAt) || Number(raw.savedAt) || 0,
        lastSavedAt: Number(raw.lastSavedAt) || Number(raw.savedAt) || 0,
        lastAvailableAt: Number(raw.lastAvailableAt) || Number(raw.lastSavedAt) || 0,
        source: clean(raw.source || "", 120),
        ownBot: !!raw.ownBot,
        profileBackup: !!raw.profileBackup,
        revisions: Array.isArray(raw.revisions) ? raw.revisions.map(normalizeRevision).filter(Boolean).slice(0, revisionLimit()) : [],
        manualBackups: Array.isArray(raw.manualBackups)
          ? raw.manualBackups.map(normalizeManualBackup).filter(Boolean).sort((a, b) => b.capturedAt - a.capturedAt)
          : [],
        versions: Array.isArray(raw.versions)
          ? raw.versions.map(normalizeBotVersion).filter(Boolean).sort((a, b) => b.number - a.number || b.capturedAt - a.capturedAt).slice(0, revisionLimit())
          : [],
        versionState: normalizeVersionState(raw.versionState),
        fields,
        coverage: FIELDS.filter(field => fields[field])
      };
    }
    return { meta };
  }

  function mergeEntry(previousValue, incomingValue) {
    const id = String(incomingValue?.id || previousValue?.id || "").trim();
    if (!id) return previousValue || null;
    const previous = normalize({ meta: { [id]: { ...(previousValue || {}), id } } }).meta[id] || null;
    const incoming = normalize({ meta: { [id]: { ...(incomingValue || {}), id } } }).meta[id] || null;
    if (!incoming) return previousValue || null;
    const fields = {};
    for (const field of FIELDS) fields[field] = incoming.fields?.[field] || previous?.fields?.[field] || "";
    return {
      id,
      name: incoming.name || previous?.name || fields.name || id,
      creator: incoming.creator || previous?.creator || fields.creator || "",
      image: incoming.image || previous?.image || fields.image || "",
      profileUrl: incoming.profileUrl || previous?.profileUrl || `https://spicychat.ai/chatbot/${id}`,
      firstSavedAt: Number(previous?.firstSavedAt) || Number(incoming.firstSavedAt) || Date.now(),
      lastSavedAt: Number(incoming.lastSavedAt) || Date.now(),
      lastAvailableAt: Number(incoming.lastAvailableAt) || Date.now(),
      source: incoming.source || previous?.source || "",
      ownBot: !!(incoming.ownBot || previous?.ownBot),
      profileBackup: !!(incoming.profileBackup || previous?.profileBackup),
      revisions: Array.isArray(incoming.revisions) && incoming.revisions.length ? incoming.revisions : (previous?.revisions || []),
      manualBackups: Array.isArray(incoming.manualBackups) && incoming.manualBackups.length ? incoming.manualBackups : (previous?.manualBackups || []),
      versions: Array.isArray(incoming.versions) && incoming.versions.length ? incoming.versions : (previous?.versions || []),
      versionState: Number(incoming.versionState?.capturedAt || 0) >= Number(previous?.versionState?.capturedAt || 0)
        ? normalizeVersionState(incoming.versionState)
        : normalizeVersionState(previous?.versionState),
      fields,
      coverage: FIELDS.filter(field => fields[field])
    };
  }

  function readableNode(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = String(node.tagName || "").toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "hr") return "\n---\n";
    const inner = [...node.childNodes].map(readableNode).join("");
    if (tag === "em" || tag === "i") return `*${inner.trim()}*`;
    return inner;
  }

  function profileSection(doc, names) {
    const wanted = new Set((Array.isArray(names) ? names : [names]).map(name => String(name).toLowerCase()));
    for (const label of doc.querySelectorAll("p")) {
      const labelText = clean(label.textContent || "", 200).toLowerCase();
      if (!wanted.has(labelText)) continue;
      const section = label.parentElement;
      if (!section) continue;
      const candidate = [...section.children].find(child => child !== label && child.querySelector?.("p"));
      const body = candidate?.querySelector?.("p");
      if (!body) continue;
      const text = clean([...body.childNodes].map(readableNode).join("\n"), 18000);
      if (text) return text;
    }
    return "";
  }

  function profileName(value) {
    return clean(value, 500)
      .replace(/\s+-\s+Explore this AI Chatbot on Spicychat.*$/i, "")
      .replace(/\s+-\s+AI(?: Sex)? Chatbot(?:\s*\|\s*Spicychat)? .*$/i, "")
      .replace(/\s*[|\-–—]\s*Spicychat.*$/i, "")
      .trim();
  }

  function metaContent(doc, selectors) {
    for (const selector of selectors) {
      const value = clean(doc.querySelector(selector)?.getAttribute("content") || "", 6000);
      if (value) return value;
    }
    return "";
  }

  function jsonLdMeta(doc, id) {
    const result = { description: "", creator: "", image: "" };
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = String(script.textContent || "").trim();
      if (!raw || raw.length > 500000) continue;
      try {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          const url = String(item.url || "");
          if (id && url && !url.includes(`/chatbot/${id}`)) continue;
          if (!result.description && item.description) result.description = clean(item.description, 5000);
          const author = item.author;
          if (!result.creator) result.creator = clean(typeof author === "string" ? author : author?.name || author?.username || "", 500);
          const image = item.image;
          if (!result.image) result.image = imageUrl(typeof image === "string" ? image : image?.url || image?.contentUrl || "");
        }
      } catch {}
    }
    return result;
  }

  function visibleProfileTitle(doc) {
    const tagsHost = doc.querySelector('[data-testid="TagSuggestion"]');
    const parent = tagsHost?.parentElement;
    if (!parent) return "";
    const children = [...parent.children];
    const tagIndex = children.indexOf(tagsHost);
    for (let i = tagIndex - 1; i >= 0; i--) {
      const child = children[i];
      if (!child?.matches?.("p")) continue;
      const value = clean(child.textContent || "", 1000);
      if (value) return value;
    }
    return "";
  }

  function numericStat(doc, className) {
    for (const svg of doc.querySelectorAll(`svg.${className}`)) {
      const text = clean(svg.parentElement?.textContent || "", 100);
      if (/^[\d,.]+(?:\s*[kmb])?$/i.test(text) || /^\d+(?:\.\d+)?%$/.test(text)) return text;
    }
    return "";
  }

  function extract(doc, id, source) {
    const jsonLd = jsonLdMeta(doc, id);
    const name = profileName(doc.querySelector("h1")?.textContent || "") || profileName(doc.title || "");
    const creator = clean(doc.querySelector('a[aria-label="creator-profile"]')?.textContent || jsonLd.creator || "", 500);
    const image = imageUrl(
      doc.querySelector('img[alt="avatar image"]')?.getAttribute("src") ||
      metaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) ||
      jsonLd.image || ""
    );
    const tags = [...new Set([...doc.querySelectorAll('[data-testid^="TagSuggestionItem-"], a[aria-label^="tag-"]')]
      .map(node => clean(node.textContent || "", 200)).filter(Boolean))].join(", ");
    const tokenCount = clean(doc.querySelector('a[aria-label="tokens-info"]')?.textContent || "", 100)
      .replace(/\btokens?\b/i, "").trim();

    let visibility = "";
    for (const candidate of doc.querySelectorAll("span, p, div")) {
      const text = clean(candidate.textContent || "", 50).toLowerCase();
      if (["public", "unlisted", "private"].includes(text)) {
        visibility = text[0].toUpperCase() + text.slice(1);
        break;
      }
    }

    const title = visibleProfileTitle(doc) || jsonLd.description || "";
    const description = jsonLd.description || title;
    const fields = {
      name,
      title,
      description,
      greeting: profileSection(doc, ["Greeting"]),
      personality: profileSection(doc, ["Personality"]),
      scenario: profileSection(doc, ["Scenario"]),
      exampleDialogues: profileSection(doc, ["Example Dialogues", "Example Dialogue"]),
      tags,
      visibility,
      creator,
      image,
      messageCount: numericStat(doc, "lucide-message-square-text"),
      rating: numericStat(doc, "lucide-thumbs-up"),
      tokenCount
    };

    const coverage = FIELDS.filter(field => fields[field]);
    if (!coverage.length) return null;
    return {
      id,
      name: fields.name || id,
      creator: fields.creator || "",
      image: fields.image || "",
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      firstSavedAt: Date.now(),
      lastSavedAt: Date.now(),
      lastAvailableAt: Date.now(),
      source,
      fields,
      coverage
    };
  }

  function profileIdFromPath(pathname = location.pathname) {
    const match = String(pathname || "").match(/^\/(?:[a-z]{2}\/)?chatbot\/([0-9a-f-]{20,})(?:[/?#]|$)/i);
    return match?.[1] || "";
  }

  function chatBotIdFromPath(pathname = location.pathname) {
    const match = String(pathname || "").match(/^\/(?:[a-z]{2}\/)?chat\/([0-9a-f-]{20,})(?:[/?#]|$)/i);
    return match?.[1] || "";
  }

  async function saveSnapshot(snapshot, options = {}) {
    if (!snapshot?.id || !snapshot.coverage?.length) return false;
    const task = async () => {
      const result = await DS.storageGet?.([KEY]) || {};
      const store = normalize(result[KEY]);
      const previous = store.meta[snapshot.id] || null;
      const merged = mergeEntry(previous, snapshot);
      if (!merged) return false;

      const profileRevision = options.kind === "profile";
      const historyChanged = previous && (profileRevision
        ? !sameProfileRevisionFields(previous.fields, merged.fields)
        : !sameArchiveFields(previous.fields, merged.fields));

      if (options.trackRevision && historyChanged) {
        const priorRevision = normalizeRevision({
          capturedAt: Number(previous.lastSavedAt) || Date.now(),
          source: previous.source || "Previous automatic backup",
          kind: /profile/i.test(String(previous.source || "")) ? "profile" : "auto",
          fields: previous.fields
        });
        const revisions = [priorRevision, ...(previous.revisions || [])].filter(Boolean);
        // Automatic/profile history is rotating and de-duplicated. Manual checkpoints
        // live in manualBackups and are never trimmed by this limit.
        const unique = [];
        for (const revision of revisions) {
          if (unique.some(item => (profileRevision
            ? sameProfileRevisionFields(item.fields, revision.fields)
            : sameArchiveFields(item.fields, revision.fields)))) continue;
          unique.push(revision);
          if (unique.length >= revisionLimit()) break;
        }
        merged.revisions = unique;
      } else if (previous?.revisions?.length) {
        merged.revisions = previous.revisions.slice(0, revisionLimit());
      }

      const manualBackups = Array.isArray(previous?.manualBackups) ? [...previous.manualBackups] : [];
      if (options.manual) {
        const manual = normalizeManualBackup({
          id: options.manualId || `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          capturedAt: Date.now(),
          source: snapshot.source || "Manual own-bot backup",
          label: options.label || "Manual backup",
          fields: merged.fields
        });
        if (manual) manualBackups.unshift(manual);
      }
      merged.manualBackups = manualBackups;

      // Meaningful Bot Version History is separate from rotating safety
      // revisions/manual checkpoints. Only creator-controlled content and the
      // learned Lorebook association can create a new version. Visibility and
      // moderation state are recorded separately and never create a version by
      // themselves.
      if (options.versionSnapshot && snapshot.ownBot) {
        const incomingVersion = normalizeBotVersion(options.versionSnapshot);
        if (incomingVersion) {
          const state = normalizeVersionState({
            ...(incomingVersion.state || {}),
            capturedAt: incomingVersion.capturedAt || Date.now()
          });
          merged.versionState = state;

          const existing = Array.isArray(previous?.versions)
            ? previous.versions.map(normalizeBotVersion).filter(Boolean).sort((a, b) => b.number - a.number || b.capturedAt - a.capturedAt)
            : [];
          const latest = existing[0] || null;
          const changed = !latest || versionContentSignature(latest.content) !== versionContentSignature(incomingVersion.content);

          if (changed) {
            const maxNumber = existing.reduce((max, item) => Math.max(max, Number(item.number) || 0), 0);
            incomingVersion.number = maxNumber + 1;
            incomingVersion.id = incomingVersion.id || `version-${incomingVersion.number}-${(incomingVersion.capturedAt || Date.now()).toString(36)}`;
            incomingVersion.changedFields = latest
              ? versionChangedFields(latest.content, incomingVersion.content)
              : [...VERSION_CONTENT_FIELDS.filter(field => String(incomingVersion.content?.[field] || "")), ...(incomingVersion.content?.lorebook?.id || incomingVersion.content?.lorebook?.name ? ["lorebook"] : [])];

            const versions = [incomingVersion, ...existing];
            const unique = [];
            const seen = new Set();
            for (const version of versions) {
              const sig = versionContentSignature(version.content);
              if (seen.has(sig)) continue;
              seen.add(sig);
              unique.push(version);
              if (unique.length >= revisionLimit()) break;
            }
            merged.versions = unique;
          } else {
            merged.versions = existing.slice(0, revisionLimit());
          }
        }
      } else if (previous?.versions?.length) {
        merged.versions = previous.versions.map(normalizeBotVersion).filter(Boolean).slice(0, revisionLimit());
        merged.versionState = normalizeVersionState(previous.versionState);
      }

      merged.ownBot = !!(snapshot.ownBot || previous?.ownBot);
      store.meta[snapshot.id] = merged;
      const ok = !!(await DS.storageSet?.({ [KEY]: normalize(store) }));
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.botArchiveWrites = Number(counters.botArchiveWrites || 0) + (ok ? 1 : 0);
      return ok;
    };
    writeChain = writeChain.then(task, task);
    return writeChain;
  }

  DS.saveBotArchiveSnapshot = saveSnapshot;

  async function flushSeenSnapshots() {
    if (seenFlushTimer) clearTimeout(seenFlushTimer);
    seenFlushTimer = null;
    if (!seenPending.size) return false;
    const snapshots = [...seenPending.values()];
    seenPending.clear();

    const task = async () => {
      const result = await DS.storageGet?.([KEY]) || {};
      const store = normalize(result[KEY]);
      let changed = 0;
      let unchanged = 0;
      for (const snapshot of snapshots) {
        const previous = store.meta[snapshot.id] || null;
        const merged = mergeEntry(previous, snapshot);
        const same = !!previous && sameArchiveFields(previous.fields, merged?.fields) &&
          clean(previous.name, 500) === clean(merged?.name, 500) &&
          clean(previous.creator, 500) === clean(merged?.creator, 500) &&
          imageUrl(previous.image) === imageUrl(merged?.image) &&
          String(previous.profileUrl || "") === String(merged?.profileUrl || "");
        if (same) { unchanged += 1; continue; }
        store.meta[snapshot.id] = merged;
        changed += 1;
      }
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.botArchiveSeenBatches = Number(counters.botArchiveSeenBatches || 0) + 1;
      counters.botArchiveSeenMerged = Number(counters.botArchiveSeenMerged || 0) + changed;
      counters.botArchiveSeenUnchanged = Number(counters.botArchiveSeenUnchanged || 0) + unchanged;
      if (!changed) return true;
      const ok = !!(await DS.storageSet?.({ [KEY]: normalize(store) }));
      counters.botArchiveWrites = Number(counters.botArchiveWrites || 0) + (ok ? 1 : 0);
      return ok;
    };
    writeChain = writeChain.then(task, task);
    return writeChain;
  }

  DS.rememberSeenBotData = function rememberSeenBotData(idValue, rawFields = {}, meta = {}) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.botArchiveRememberSeenPublic) return false;
    const id = String(idValue || "").trim();
    if (!id) return false;
    const fields = {
      name: meta.name || rawFields.name || "",
      title: rawFields.title || rawFields.description || "",
      description: rawFields.description || "",
      greeting: rawFields.greeting || "",
      personality: rawFields.personality || "",
      scenario: rawFields.scenario || "",
      exampleDialogues: rawFields.exampleDialogues || rawFields.examples || "",
      tags: rawFields.tags || "",
      visibility: rawFields.visibility || "",
      creator: meta.creator || rawFields.creator || "",
      image: meta.image || rawFields.image || "",
      messageCount: rawFields.messageCount || "",
      rating: rawFields.rating || "",
      tokenCount: rawFields.tokenCount || ""
    };
    const snapshot = normalize({ meta: { [id]: {
      id,
      name: fields.name || id,
      creator: fields.creator || "",
      image: fields.image || "",
      profileUrl: meta.profileUrl || `https://spicychat.ai/chatbot/${id}`,
      firstSavedAt: Date.now(),
      lastSavedAt: Date.now(),
      lastAvailableAt: Date.now(),
      source: meta.source || "Last seen public data",
      fields
    } } }).meta[id];
    if (!snapshot?.coverage?.length) return false;
    const previousPending = seenPending.get(id);
    seenPending.set(id, previousPending ? mergeEntry(previousPending, snapshot) : snapshot);
    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.botArchiveSeenQueued = Number(counters.botArchiveSeenQueued || 0) + 1;
    if (seenFlushTimer) clearTimeout(seenFlushTimer);
    seenFlushTimer = setTimeout(() => { flushSeenSnapshots().catch(() => {}); }, 900);
    return true;
  };


  async function captureCurrentProfile() {
    const id = profileIdFromPath();
    if (!id) return false;
    let snapshot = extract(document, id, "Profile visit");

    // Greeting is public on normal bot profiles. If React has not exposed it in
    // the hydrated DOM yet, reuse the proven token-info API bridge instead of
    // inventing a separate request/auth path.
    if ((!snapshot || !snapshot.fields?.greeting) && typeof DS.fetchPublicCharacterFields === "function") {
      try {
        const api = await DS.fetchPublicCharacterFields(id);
        if (api && typeof api === "object") {
          const fields = {
            ...(snapshot?.fields || {}),
            title: snapshot?.fields?.title || api.description || "",
            description: snapshot?.fields?.description || api.description || "",
            greeting: snapshot?.fields?.greeting || api.greeting || ""
          };
          snapshot = mergeEntry(snapshot, {
            id,
            name: snapshot?.name || fields.name || id,
            creator: snapshot?.creator || fields.creator || "",
            image: snapshot?.image || fields.image || "",
            profileUrl: `https://spicychat.ai/chatbot/${id}`,
            firstSavedAt: snapshot?.firstSavedAt || Date.now(),
            lastSavedAt: Date.now(),
            lastAvailableAt: Date.now(),
            source: "Profile visit",
            fields,
            coverage: FIELDS.filter(field => fields[field])
          });
        }
      } catch {}
    }

    if (!snapshot?.coverage?.length) return false;
    snapshot.profileBackup = !!DS.state?.settings?.botArchiveOnProfileVisit;
    return saveSnapshot(snapshot, { trackRevision: true, kind: "profile" });
  }

  async function refreshFromChat() {
    const id = chatBotIdFromPath();
    if (!id) return false;
    const result = await DS.storageGet?.([KEY]) || {};
    const store = normalize(result[KEY]);
    const current = store.meta[id];
    const hours = [6, 24, 72, 168].includes(Number(DS.state?.settings?.botArchiveRefreshHours))
      ? Number(DS.state.settings.botArchiveRefreshHours)
      : 24;
    if (current?.lastSavedAt && Date.now() - Number(current.lastSavedAt) < hours * 3600000) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`https://spicychat.ai/chatbot/${id}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml" }
      });
      if (!response.ok || /\/(login|signin|sign-in|auth)(?:[/?#]|$)/i.test(String(response.url || ""))) return false;
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const snapshot = extract(doc, id, "Chat-open refresh");
      if (!snapshot) return false;
      return saveSnapshot(snapshot);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  DS.applyBotArchive = async function applyBotArchive() {
    if (inflight || !DS.state?.settings?.enabled) return;
    const profileId = profileIdFromPath();
    const chatId = chatBotIdFromPath();
    const profileEnabled = !!DS.state.settings.botArchiveOnProfileVisit || !!DS.state.settings.botArchiveRememberSeenPublic;
    const chatEnabled = !!DS.state.settings.botArchiveOnChatOpen;
    if ((!profileId || !profileEnabled) && (!chatId || !chatEnabled)) return;

    const routeKey = `${location.pathname}|${profileEnabled ? 1 : 0}|${chatEnabled ? 1 : 0}`;
    // Profile pages may still be hydrating, so a failed/empty capture may retry on a later slow pass.
    // Once a capture succeeds, or a chat refresh has been attempted, do not repeat it on every DOM rerun.
    if (routeKey === lastRouteKey) return;
    if (chatId) lastRouteKey = routeKey;

    inflight = true;
    try {
      if (profileId && profileEnabled) {
        const saved = await captureCurrentProfile();
        if (saved) lastRouteKey = routeKey;
      } else if (chatId && chatEnabled) {
        await refreshFromChat();
      }
    } finally {
      inflight = false;
    }
  };
})();
