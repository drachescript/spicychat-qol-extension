// Tab Cleanup Settings. Loaded after the shared defaults, before options.js.
const TAB_CLEANUP_TOPICS_KEY = "tabCleanupTopics";
let tabCleanupTopicState = { version: 1, topics: [] };
let activeTabCleanupSessionId = "";
let tabCleanupSessionSelection = new Set();

const TAB_CLEANUP_ENRICHMENT_KEY = "tabCleanupEnrichment";
const TAB_CLEANUP_SESSIONS_KEY = "tabCleanupSessions";
const TAB_CLEANUP_ENRICH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let lastTabCleanupDiagnostic = null;
let tabCleanupEnrichState = {
  running: false,
  paused: false,
  cancelled: false,
  completed: 0,
  total: 0
};

const TAB_CLEANUP_STOPWORDS = new Set([
  "about", "after", "again", "against", "almost", "also", "always", "among", "another", "around", "because", "been", "before", "being", "between", "both", "but", "came", "can", "could", "does", "doing", "dont", "from", "gets", "getting", "have", "having", "here", "hers", "him", "himself", "into", "just", "like", "looks", "make", "more", "most", "much", "need", "needs", "never", "only", "other", "our", "over", "really", "same", "she", "should", "some", "someone", "something", "still", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "too", "under", "very", "want", "wants", "was", "were", "what", "when", "where", "which", "while", "who", "with", "would", "you", "your", "yours", "chat", "chatbot", "spicychat", "character", "characters", "scenario", "thank", "thanks"
]);

function tabCleanupSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function tabCleanupWords(value) {
  const text = String(value || "").toLowerCase().replace(/[’']/g, "");
  let words = [];
  try { words = text.match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) || []; }
  catch { words = text.match(/[a-z0-9][a-z0-9_-]{2,}/g) || []; }
  return words
    .map(word => word.replace(/^[-_]+|[-_]+$/g, ""))
    .filter(word => word.length >= 4 && word.length <= 32 && !TAB_CLEANUP_STOPWORDS.has(word) && !/^\d+$/.test(word));
}

function tabCleanupIncrement(map, value, botId = "") {
  const key = String(value || "").trim();
  if (!key) return;
  const current = map.get(key) || { count: 0, botIds: new Set() };
  current.count += 1;
  if (botId) current.botIds.add(String(botId));
  map.set(key, current);
}

function tabCleanupLastAccessed(bot) {
  return Math.max(0, ...(Array.isArray(bot?.tabs) ? bot.tabs : []).map(tab => Number(tab?.lastAccessed) || 0));
}

function tabCleanupIdentityNeedsReview(bot) {
  const id = String(bot?.id || "").toLowerCase();
  const name = String(bot?.identity?.bestName || "").trim();
  if (!name) return true;
  if (name.toLowerCase() === id || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(name)) return true;
  if (/^(for you|spicychat|chatbot|character)$/i.test(name)) return true;
  if (name.length > 120) return true;
  return false;
}

function buildTabCleanupAnalysis(report) {
  const bots = Array.isArray(report?.bots) ? report.bots : [];
  const tagCounts = new Map();
  const folderCounts = new Map();
  const personalTagCounts = new Map();
  const creatorCounts = new Map();
  const keywordCounts = new Map();

  for (const bot of bots) {
    const botId = String(bot?.id || "");
    const seenKeywords = new Set();
    for (const tag of bot.tags || []) tabCleanupIncrement(tagCounts, tag, botId);
    for (const folder of bot.local?.folders || []) tabCleanupIncrement(folderCounts, folder, botId);
    for (const tag of bot.local?.personalTags || []) tabCleanupIncrement(personalTagCounts, tag, botId);
    if (bot.identity?.bestCreator) tabCleanupIncrement(creatorCounts, bot.identity.bestCreator, botId);

    const text = `${bot.identity?.bestName || ""}\n${bot.identity?.description || ""}`;
    for (const word of tabCleanupWords(text)) seenKeywords.add(word);
    for (const word of seenKeywords) tabCleanupIncrement(keywordCounts, word, botId);
  }

  const suggestions = [];
  const addMap = (map, type, minimum, confidenceForCount, limit = 16) => {
    [...map.entries()]
      .filter(([, meta]) => Number(meta?.count || 0) >= minimum)
      .sort((a, b) => Number(b[1]?.count || 0) - Number(a[1]?.count || 0) || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .forEach(([label, meta]) => {
        const count = Number(meta?.count || 0);
        suggestions.push({ type, label, count, confidence: confidenceForCount(count), botIds: [...(meta?.botIds || [])] });
      });
  };

  addMap(folderCounts, "Folder", 1, () => "high", 12);
  addMap(personalTagCounts, "Personal tag", 1, () => "high", 12);
  addMap(tagCounts, "Tag", 2, count => count >= 5 ? "high" : "medium", 18);
  addMap(keywordCounts, "Keyword", 3, count => count >= 7 ? "high" : count >= 4 ? "medium" : "low", 18);
  addMap(creatorCounts, "Creator", 2, count => count >= 4 ? "medium" : "low", 12);

  const typeRank = { Folder: 5, "Personal tag": 5, Tag: 4, Keyword: 3, Creator: 2 };
  suggestions.sort((a, b) => {
    const conf = { high: 3, medium: 2, low: 1 };
    return (conf[b.confidence] - conf[a.confidence]) || (b.count - a.count) || ((typeRank[b.type] || 0) - (typeRank[a.type] || 0)) || a.label.localeCompare(b.label);
  });

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const { recentHours, recentDays, mediumDays, oldDays } = tabCleanupAgeThresholdsFromPage();
  const recentCut = recentHours * 60 * 60 * 1000;
  const utility = (id, label, test, tabMode = false) => {
    const matching = bots.filter(test);
    return {
      id,
      label,
      count: tabMode ? matching.reduce((sum, bot) => sum + (bot.tabs || []).filter(tab => tab.discarded).length, 0) : matching.reduce((sum, bot) => sum + Math.max(1, (bot.tabs || []).length), 0),
      botIds: matching.map(bot => String(bot.id || "")).filter(Boolean)
    };
  };
  const utilityGroups = [
    utility("smart:recent", `Used in last ${recentHours}h`, bot => { const at = tabCleanupLastAccessed(bot); return at > 0 && now - at <= recentCut; }),
    utility("smart:recent-days", `${recentHours}h–${recentDays}d old`, bot => { const at = tabCleanupLastAccessed(bot); const age = at > 0 ? now - at : Number.NaN; return age > recentCut && age <= recentDays * day; }),
    utility("smart:medium", `${recentDays}–${mediumDays}d old`, bot => { const at = tabCleanupLastAccessed(bot); const age = at > 0 ? now - at : Number.NaN; return age > recentDays * day && age <= mediumDays * day; }),
    utility("smart:old", `${mediumDays}–${oldDays}d old`, bot => { const at = tabCleanupLastAccessed(bot); const age = at > 0 ? now - at : Number.NaN; return age > mediumDays * day && age <= oldDays * day; }),
    utility("smart:very-old", `${oldDays}d+ old`, bot => { const at = tabCleanupLastAccessed(bot); return at > 0 && now - at > oldDays * day; }),
    utility("smart:favorite", "Favorite history", bot => bot.local?.favoriteHistory),
    utility("smart:later", "Later", bot => bot.local?.later),
    utility("smart:archive", "Local archive copy", bot => bot.local?.savedLocalCopy),
    utility("smart:multiple", "Multiple conversations", bot => (bot.tabs || []).length > 1),
    utility("smart:discarded", "Discarded/unloaded tabs", bot => (bot.tabs || []).some(tab => tab.discarded), true)
  ].filter(item => item.count > 0);

  const enrichmentStatuses = {};
  for (const bot of bots) {
    const status = String(bot.profileSignals?.enrichmentStatus || "not-checked");
    enrichmentStatuses[status] = (enrichmentStatuses[status] || 0) + 1;
  }
  const dataQuality = {
    bots: bots.length,
    names: bots.filter(bot => bot.identity?.bestName).length,
    creators: bots.filter(bot => bot.identity?.bestCreator).length,
    tags: bots.filter(bot => (bot.tags || []).length).length,
    descriptions: bots.filter(bot => bot.identity?.description).length,
    enriched: bots.filter(bot => Number(bot.identity?.enrichedAt) > 0).length,
    needsIdentity: bots.filter(tabCleanupIdentityNeedsReview).length,
    enrichmentStatuses
  };

  return {
    generatedAt: new Date().toISOString(),
    dataQuality,
    topicSuggestions: suggestions.slice(0, 30),
    utilityGroups
  };
}

function makeTabCleanupChip(item, action = null) {
  const label = item?.type ? `${item.type}: ${item.label}` : String(item?.label || "");
  const chip = makeElement("span", { className: "tab-cleanup-chip" });
  chip.append(makeElement("span", { text: label }));
  chip.append(makeElement("small", { text: `${Number(item?.count || 0)}${item?.confidence ? ` · ${item.confidence}` : ""}` }));
  if (typeof action === "function") {
    const add = makeElement("button", { text: "+ topic", attrs: { type: "button", title: "Save this suggestion as a reusable topic" } });
    add.addEventListener("click", () => action(item));
    chip.append(add);
  }
  return chip;
}

function renderTabCleanupAnalysis(report) {
  const host = $("tabCleanupAnalysisPreview");
  const summary = $("tabCleanupAnalysisSummary");
  const topics = $("tabCleanupTopicSuggestions");
  const utility = $("tabCleanupUtilityGroups");
  if (!host || !summary || !topics || !utility) return;
  if (!report) {
    host.hidden = true;
    topics.replaceChildren();
    utility.replaceChildren();
    return;
  }

  const analysis = report.analysis || buildTabCleanupAnalysis(report);
  report.analysis = analysis;
  const quality = analysis.dataQuality || {};
  host.hidden = false;
  const statuses = quality.enrichmentStatuses || {};
  const coverageSignal = Math.max(
    Number(quality.descriptions || 0) / Math.max(1, Number(quality.bots || 0)),
    Number(quality.tags || 0) / Math.max(1, Number(quality.bots || 0)),
    Number(quality.creators || 0) / Math.max(1, Number(quality.bots || 0))
  );
  const qualityLabel = coverageSignal >= 0.6 ? "good" : (coverageSignal >= 0.2 ? "partial" : "poor");
  summary.textContent = `Metadata quality: ${qualityLabel}. Coverage: ${quality.names || 0}/${quality.bots || 0} names, ${quality.creators || 0} creators, ${quality.tags || 0} with tags, ${quality.descriptions || 0} descriptions. Profile analysis: ${quality.enriched || 0} rendered profiles, ${statuses["local-only"] || 0} local-only, ${statuses["no-usable-data"] || 0} no usable data, ${statuses["verification-required"] || 0} verification needed, ${statuses.unavailable || 0} unavailable, ${statuses.failed || 0} failed; ${quality.needsIdentity || 0} identities still need review. Topic suggestions are previews only and never close or move tabs.`;

  topics.replaceChildren();
  const topicTitle = makeElement("strong", { text: "Suggested topics" });
  topics.append(topicTitle);
  if (!(analysis.topicSuggestions || []).length) {
    topics.append(makeElement("span", { className: "tab-cleanup-chip", text: "No strong topic signals yet — run Analyze / enrich open bots" }));
  } else {
    for (const item of analysis.topicSuggestions || []) topics.append(makeTabCleanupChip(item, saveSuggestedTabCleanupTopic));
  }

  utility.replaceChildren();
  utility.append(makeElement("strong", { text: "Smart cleanup groups" }));
  for (const item of analysis.utilityGroups || []) utility.append(makeTabCleanupChip(item, item.id ? () => browseTabCleanupFilter(item.id) : null));
}

function renderTabCleanupDiagnostic(report, message = "") {
  const box = $("tabCleanupDiagnosticOutput");
  const status = $("tabCleanupDiagnosticStatus");
  lastTabCleanupDiagnostic = report && typeof report === "object" ? report : null;
  if (lastTabCleanupDiagnostic) lastTabCleanupDiagnostic.analysis = buildTabCleanupAnalysis(lastTabCleanupDiagnostic);
  if (box) box.value = lastTabCleanupDiagnostic ? JSON.stringify(lastTabCleanupDiagnostic, null, 2) : "";
  renderTabCleanupAnalysis(lastTabCleanupDiagnostic);
  renderTabCleanupSmartGroups();
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  if (!lastTabCleanupDiagnostic) {
    status.textContent = "Nothing collected yet.";
    return;
  }
  const summary = lastTabCleanupDiagnostic.summary || {};
  status.textContent = `${Number(summary.spicychatTabs || 0)} SpicyChat tabs; ${Number(summary.uniqueBots || 0)} unique bots; ${Number(summary.botsWithResolvedName || summary.botsWithName || 0)} resolved names; ${Number(summary.botsWithEnrichedProfile || 0)} rendered profiles; ${Number(summary.botsWithLocalProfileData || 0)} local-only; ${Number(summary.discardedTabs || 0)} discarded tabs left asleep.`;
}

async function requestTabCleanupDiagnostic() {
  await flushSettingsAutosave({ force: true });
  const response = await runtimeMessage({ type: "DS_TAB_DIAGNOSTIC_COLLECT" });
  if (!response?.ok || !response.report) throw new Error(response?.error || "Could not collect tab diagnostic");
  response.report.analysis = buildTabCleanupAnalysis(response.report);
  return response.report;
}

async function collectTabCleanupDiagnostic() {
  const button = $("collectTabCleanupDiagnostic");
  const status = $("tabCleanupDiagnosticStatus");
  if (button) button.disabled = true;
  if (status) status.textContent = "Collecting open SpicyChat tabs...";
  try {
    renderTabCleanupDiagnostic(await requestTabCleanupDiagnostic());
  } catch (error) {
    renderTabCleanupDiagnostic(null, `Could not collect tabs: ${error?.message || String(error)}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function setTabCleanupEnrichControls() {
  const progress = $("tabCleanupEnrichmentProgress");
  const run = $("enrichTabCleanupDiagnostic");
  const retry = $("retryTabCleanupEnrichment");
  const pause = $("pauseTabCleanupEnrichment");
  const cancel = $("cancelTabCleanupEnrichment");
  if (run) run.disabled = tabCleanupEnrichState.running;
  if (retry) retry.disabled = tabCleanupEnrichState.running;
  if (pause) {
    pause.disabled = !tabCleanupEnrichState.running;
    pause.textContent = tabCleanupEnrichState.paused ? "Resume" : "Pause";
  }
  if (cancel) cancel.disabled = !tabCleanupEnrichState.running;
  if (progress) {
    progress.hidden = !tabCleanupEnrichState.running && !tabCleanupEnrichState.total;
    progress.max = Math.max(1, tabCleanupEnrichState.total || 1);
    progress.value = Math.min(progress.max, tabCleanupEnrichState.completed || 0);
  }
}

async function enrichTabCleanupDiagnostic(forceMissing = false) {
  if (tabCleanupEnrichState.running) return;
  const status = $("tabCleanupDiagnosticStatus");
  tabCleanupEnrichState = { running: true, paused: false, cancelled: false, completed: 0, total: 0 };
  setTabCleanupEnrichControls();

  const counts = { fetched: 0, localOnly: 0, cached: 0, noData: 0, unavailable: 0, failed: 0 };
  let lastError = "";
  try {
    const initial = await requestTabCleanupDiagnostic();
    renderTabCleanupDiagnostic(initial, forceMissing ? "Preparing retry for unresolved profile metadata..." : "Preparing rendered-profile analysis...");
    const now = Date.now();
    const pending = (initial.bots || []).filter(bot => {
      const signals = bot.profileSignals || {};
      const state = String(signals.enrichmentStatus || "not-checked");
      const successfulAt = Number(bot.identity?.enrichedAt) || Number(signals.enrichedAt) || 0;
      if (forceMissing) return !["profile-fetched", "local-only"].includes(state);
      if (state === "local-only") return false;
      return state !== "profile-fetched" || !successfulAt || now - successfulAt > TAB_CLEANUP_ENRICH_MAX_AGE;
    });
    tabCleanupEnrichState.total = pending.length;
    setTabCleanupEnrichControls();

    if (!pending.length) {
      renderTabCleanupDiagnostic(initial, "All currently open bots already have useful rendered or local profile metadata. Analysis preview refreshed.");
      return;
    }

    outer: for (let index = 0; index < pending.length; index += 1) {
      if (tabCleanupEnrichState.cancelled) break;
      while (tabCleanupEnrichState.paused && !tabCleanupEnrichState.cancelled) {
        if (status) status.textContent = `Paused at ${tabCleanupEnrichState.completed}/${tabCleanupEnrichState.total}.`;
        await tabCleanupSleep(180);
      }
      if (tabCleanupEnrichState.cancelled) break;

      const bot = pending[index];
      const label = bot.identity?.bestName || bot.names?.[0] || bot.id;
      let response = null;
      while (!tabCleanupEnrichState.cancelled) {
        if (status) status.textContent = `${forceMissing ? "Retrying" : "Analyzing"} ${index + 1}/${pending.length}: ${label}`;
        response = await runtimeMessage({ type: "DS_TAB_DIAGNOSTIC_ENRICH_ONE", botId: bot.id, force: !!forceMissing });
        if (!response?.verificationRequired && String(response?.metadata?.status || "") !== "verification-required") break;

        tabCleanupEnrichState.paused = true;
        setTabCleanupEnrichControls();
        if (status) status.textContent = `SpicyChat verification is blocking the temporary analysis tab. Complete verification in the tab QoL opened, then press Resume. Analysis is paused at ${index + 1}/${pending.length}.`;
        while (tabCleanupEnrichState.paused && !tabCleanupEnrichState.cancelled) await tabCleanupSleep(220);
        if (tabCleanupEnrichState.cancelled) break outer;
        // Verification was completed/resumed: retry this same bot instead of skipping it.
      }
      if (tabCleanupEnrichState.cancelled) break;

      const meta = response?.metadata || {};
      const state = String(meta.status || (response?.ok ? "profile-fetched" : "failed"));
      if (response?.cached && state !== "local-only") counts.cached += 1;
      if (state === "profile-fetched") counts.fetched += response?.cached ? 0 : 1;
      else if (state === "local-only") counts.localOnly += 1;
      else if (state === "no-usable-data") counts.noData += 1;
      else if (state === "unavailable") counts.unavailable += 1;
      else counts.failed += 1;
      if (!response?.ok && response?.error) lastError = response.error;

      tabCleanupEnrichState.completed = index + 1;
      setTabCleanupEnrichControls();
      await tabCleanupSleep(650);
    }

    const report = await requestTabCleanupDiagnostic();
    const prefix = tabCleanupEnrichState.cancelled ? "Analysis cancelled" : "Analysis finished";
    const detail = `${counts.fetched} rendered profiles, ${counts.localOnly} local-only, ${counts.cached} recent cached results, ${counts.noData} no usable data, ${counts.unavailable} unavailable, ${counts.failed} failed.`;
    renderTabCleanupDiagnostic(report, `${prefix}: ${detail}${lastError && counts.failed ? ` Last error: ${lastError}` : ""}`);
  } catch (error) {
    if (status) status.textContent = `Could not analyze open bots: ${error?.message || String(error)}`;
  } finally {
    tabCleanupEnrichState.running = false;
    tabCleanupEnrichState.paused = false;
    setTabCleanupEnrichControls();
    await runtimeMessage({ type: "DS_TAB_DIAGNOSTIC_WORKER_CLOSE" });
  }
}

function toggleTabCleanupEnrichmentPause() {
  if (!tabCleanupEnrichState.running) return;
  tabCleanupEnrichState.paused = !tabCleanupEnrichState.paused;
  setTabCleanupEnrichControls();
}

function cancelTabCleanupEnrichment() {
  if (!tabCleanupEnrichState.running) return;
  tabCleanupEnrichState.cancelled = true;
  tabCleanupEnrichState.paused = false;
  setTabCleanupEnrichControls();
}

async function copyTabCleanupDiagnostic() {
  const text = $("tabCleanupDiagnosticOutput")?.value || (lastTabCleanupDiagnostic ? JSON.stringify(lastTabCleanupDiagnostic, null, 2) : "");
  const status = $("tabCleanupDiagnosticStatus");
  if (!text.trim()) {
    if (status) status.textContent = "Collect the open tabs first.";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = "Diagnostic JSON copied.";
  } catch {
    const box = $("tabCleanupDiagnosticOutput");
    box?.focus();
    box?.select();
    if (status) status.textContent = "Clipboard access failed; the diagnostic text is selected for manual copying.";
  }
}

function downloadTabCleanupDiagnostic() {
  const report = lastTabCleanupDiagnostic;
  const status = $("tabCleanupDiagnosticStatus");
  if (!report) {
    if (status) status.textContent = "Collect the open tabs first.";
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadJsonFile(report, `spicychat-qol-open-tabs-${stamp}.json`);
  if (status) status.textContent = "Diagnostic JSON downloaded.";
}

function normalizeTabCleanupSessions(value) {
  const raw = value && typeof value === "object" ? value : {};
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.filter(item => item && typeof item === "object") : [];
  return { version: 2, sessions: sessions.slice(0, 40) };
}

function normalizeTabCleanupTopics(value) {
  const raw = value && typeof value === "object" ? value : {};
  const topics = (Array.isArray(raw.topics) ? raw.topics : []).map((topic, index) => ({
    id: String(topic?.id || `topic-${index + 1}`),
    name: String(topic?.name || `Topic ${index + 1}`).trim().slice(0, 60),
    botIds: [...new Set((Array.isArray(topic?.botIds) ? topic.botIds : []).map(id => String(id || "").trim()).filter(Boolean))]
  })).filter(topic => topic.name);
  return { version: 1, topics };
}

function tabCleanupAgeThresholdsFromPage() {
  const recentHours = Math.min(72, Math.max(1, Number(value("tabCleanupRecentHours", "24")) || 24));
  const recentDays = Math.min(30, Math.max(Math.ceil(recentHours / 24), Number(value("tabCleanupRecentDays", "3")) || 3));
  const mediumDays = Math.min(90, Math.max(recentDays + 1, Number(value("tabCleanupMediumDays", "7")) || 7));
  const oldDays = Math.min(365, Math.max(mediumDays + 1, Number(value("tabCleanupOldDays", "14")) || 14));
  return { recentHours, recentDays, mediumDays, oldDays };
}

function tabCleanupExactUrlKey(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!/(^|\.)spicychat\.ai$/i.test(parsed.hostname)) return "";
    parsed.hostname = "spicychat.ai";
    parsed.hash = "";
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.hostname}${pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

function tabCleanupSmartGroupsForSession(session) {
  const tabs = Array.isArray(session?.tabs) ? session.tabs : [];
  const { recentHours, recentDays, mediumDays, oldDays } = tabCleanupAgeThresholdsFromPage();
  const now = Date.now();
  const hour = 3600000;
  const day = 24 * hour;
  const recentCut = recentHours * hour;
  const recentDaysCut = recentDays * day;
  const mediumCut = mediumDays * day;
  const oldCut = oldDays * day;
  const conversationCounts = new Map();
  for (const tab of tabs) if (tab.botId) conversationCounts.set(tab.botId, (conversationCounts.get(tab.botId) || 0) + 1);
  const age = tab => { const at = Number(tab?.lastAccessed) || 0; return at > 0 ? Math.max(0, now - at) : Number.NaN; };
  const defs = [
    { id: "smart:recent", label: `Used in last ${recentHours}h`, help: "Recently accessed SpicyChat tabs.", test: tab => age(tab) <= recentCut },
    { id: "smart:recent-days", label: `${recentHours}h–${recentDays}d old`, help: "Exclusive age range; these tabs are not also counted in the newer group.", test: tab => age(tab) > recentCut && age(tab) <= recentDaysCut },
    { id: "smart:medium", label: `${recentDays}–${mediumDays}d old`, help: "Exclusive age range based on browser last-accessed time.", test: tab => age(tab) > recentDaysCut && age(tab) <= mediumCut },
    { id: "smart:old", label: `${mediumDays}–${oldDays}d old`, help: "Older open tabs that are good candidates for reviewed cleanup.", test: tab => age(tab) > mediumCut && age(tab) <= oldCut },
    { id: "smart:very-old", label: `${oldDays}d+ old`, help: "Tabs not accessed within the configured oldest threshold.", test: tab => age(tab) > oldCut },
    { id: "smart:favorite", label: "Favorite history", help: "Bots present in QoL's local Favorite history.", test: tab => !!tab.favoriteHistory },
    { id: "smart:later", label: "Later", help: "Bots currently saved in QoL's Later list.", test: tab => !!tab.later },
    { id: "smart:archive", label: "Local archive copy", help: "QoL already has some Local Bot Archive record for this bot. This backs up profile data, not the chat conversation itself.", test: tab => !!tab.savedLocalCopy },
    { id: "smart:multiple", label: "Multiple conversations", help: "The same bot has more than one distinct chat URL in this session. Each conversation is preserved separately and is not treated as a duplicate.", test: tab => !!tab.botId && (conversationCounts.get(tab.botId) || 0) > 1 },
    { id: "smart:discarded", label: "Discarded / unloaded tabs", help: "Tabs the browser has unloaded to save memory. Tab Cleanup does not wake them just to list or close them.", test: tab => !!tab.discarded }
  ];
  return defs.map(def => {
    const matching = tabs.filter(def.test);
    return { ...def, count: matching.length, urls: matching.map(tab => String(tab.url || "")).filter(Boolean) };
  });
}

function tabCleanupSmartGroupForId(session, id) {
  return tabCleanupSmartGroupsForSession(session).find(group => group.id === id) || null;
}

async function loadTabCleanupTopics() {
  const result = await storageGet([TAB_CLEANUP_TOPICS_KEY]);
  tabCleanupTopicState = normalizeTabCleanupTopics(result[TAB_CLEANUP_TOPICS_KEY]);
  renderTabCleanupTopics();
  await renderTabCleanupSmartGroups();
  renderTabCleanupSessionReview();
}

async function persistTabCleanupTopics() {
  tabCleanupTopicState = normalizeTabCleanupTopics(tabCleanupTopicState);
  await storageSet({ [TAB_CLEANUP_TOPICS_KEY]: tabCleanupTopicState });
  renderTabCleanupTopics();
  await renderTabCleanupSmartGroups();
  renderTabCleanupSessionReview();
}

function tabCleanupTopicIdsForBot(botId) {
  const id = String(botId || "");
  if (!id) return [];
  return tabCleanupTopicState.topics.filter(topic => topic.botIds.includes(id)).map(topic => topic.id);
}

function tabCleanupTopicNamesForBot(botId) {
  const ids = new Set(tabCleanupTopicIdsForBot(botId));
  return tabCleanupTopicState.topics.filter(topic => ids.has(topic.id)).map(topic => topic.name);
}

function populateTabCleanupTopicSelects(session = null) {
  const filter = $("tabCleanupSessionTopicFilter");
  const assign = $("tabCleanupAssignTopic");
  if (filter) {
    const current = filter.value || "all";
    filter.replaceChildren(
      makeElement("option", { text: "All tabs", attrs: { value: "all" } }),
      makeElement("option", { text: "Uncategorized", attrs: { value: "none" } })
    );
    for (const topic of tabCleanupTopicState.topics) filter.append(makeElement("option", { text: `Topic · ${topic.name}`, attrs: { value: topic.id } }));
    for (const group of tabCleanupSmartGroupsForSession(session || { tabs: [] })) {
      filter.append(makeElement("option", { text: `Smart · ${group.label}${session ? ` (${group.count})` : ""}`, attrs: { value: group.id } }));
    }
    filter.value = [...filter.options].some(option => option.value === current) ? current : "all";
  }
  if (assign) {
    const current = assign.value || "";
    assign.replaceChildren(makeElement("option", { text: "Choose topic…", attrs: { value: "" } }));
    for (const topic of tabCleanupTopicState.topics) assign.append(makeElement("option", { text: topic.name, attrs: { value: topic.id } }));
    assign.value = [...assign.options].some(option => option.value === current) ? current : "";
  }
}

async function latestTabCleanupSession() {
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  return normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]).sessions[0] || null;
}

async function browseTabCleanupFilter(filterValue = "all") {
  let targetId = "";
  if (lastTabCleanupDiagnostic) {
    targetId = "__live__";
  } else {
    const latest = await latestTabCleanupSession();
    if (latest) targetId = latest.id;
    else {
      try {
        lastTabCleanupDiagnostic = await requestTabCleanupDiagnostic();
        targetId = "__live__";
      } catch {
        const status = $("tabCleanupDiagnosticStatus");
        if (status) status.textContent = "Collect open tabs or save a session before browsing groups.";
        return;
      }
    }
  }
  activeTabCleanupSessionId = targetId;
  tabCleanupSessionSelection.clear();
  const host = $("tabCleanupSessionReview");
  if (host) host.hidden = false;
  const session = await getActiveTabCleanupSession();
  populateTabCleanupTopicSelects(session);
  const select = $("tabCleanupSessionTopicFilter");
  if (select && [...select.options].some(option => option.value === filterValue)) select.value = filterValue;
  await renderTabCleanupSessionReview();
  host?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function renderTabCleanupTopics() {
  const host = $("tabCleanupTopicList");
  if (!host) return;
  host.replaceChildren();
  populateTabCleanupTopicSelects();
  if (!tabCleanupTopicState.topics.length) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "No saved topics yet. Create one manually or save a generated suggestion." }));
    return;
  }
  for (const topic of tabCleanupTopicState.topics) {
    const row = makeElement("div", { className: "tab-cleanup-topic-card" });
    const info = makeElement("div");
    info.append(makeElement("strong", { text: topic.name }));
    info.append(makeElement("div", { className: "hint", text: `${topic.botIds.length} bot${topic.botIds.length === 1 ? "" : "s"}` }));
    const actions = makeElement("div", { className: "button-row" });
    const browse = makeElement("button", { text: "Browse", attrs: { type: "button", title: "Show the actual tabs/bots in this topic" } });
    browse.addEventListener("click", () => browseTabCleanupFilter(topic.id));
    const rename = makeElement("button", { text: "Rename", attrs: { type: "button" } });
    rename.addEventListener("click", async () => {
      const next = prompt("Rename topic", topic.name);
      if (next === null) return;
      const name = String(next || "").trim().slice(0, 60);
      if (!name) return;
      topic.name = name;
      await persistTabCleanupTopics();
    });
    const remove = makeElement("button", { text: "Delete", attrs: { type: "button" } });
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete topic "${topic.name}"? This only removes the QoL topic; it does not close tabs or change bots.`)) return;
      tabCleanupTopicState.topics = tabCleanupTopicState.topics.filter(item => item.id !== topic.id);
      await persistTabCleanupTopics();
    });
    actions.append(browse, rename, remove);
    row.append(info, actions);
    host.append(row);
  }
}

async function renderTabCleanupSmartGroups() {
  const host = $("tabCleanupSmartGroupList");
  if (!host) return;
  let session = await getActiveTabCleanupSession();
  if (!session && lastTabCleanupDiagnostic) session = makeTabCleanupSession(lastTabCleanupDiagnostic, { id: "__live__", name: "Current open SpicyChat tabs", kind: "live" });
  if (!session) session = await latestTabCleanupSession();
  host.replaceChildren();
  if (!session) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "Collect open tabs or save a session to populate Smart Groups." }));
    return;
  }
  for (const group of tabCleanupSmartGroupsForSession(session)) {
    if (!group.count) continue;
    const row = makeElement("div", { className: "tab-cleanup-topic-card tab-cleanup-smart-card" });
    const info = makeElement("div");
    info.append(makeElement("strong", { text: group.label }));
    info.append(makeElement("div", { className: "hint", text: `${group.count} tab${group.count === 1 ? "" : "s"} · ${group.help}` }));
    const actions = makeElement("div", { className: "button-row" });
    const browse = makeElement("button", { text: "Browse", attrs: { type: "button" } });
    browse.addEventListener("click", () => browseTabCleanupFilter(group.id));
    actions.append(browse);
    row.append(info, actions);
    host.append(row);
  }
}

async function createTabCleanupTopic(name, botIds = []) {
  const cleanName = String(name || "").trim().slice(0, 60);
  if (!cleanName) return null;
  let topic = tabCleanupTopicState.topics.find(item => item.name.toLowerCase() === cleanName.toLowerCase());
  if (!topic) {
    topic = { id: globalThis.crypto?.randomUUID?.() || `topic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, botIds: [] };
    tabCleanupTopicState.topics.push(topic);
  }
  topic.botIds = [...new Set([...topic.botIds, ...(Array.isArray(botIds) ? botIds : [])].map(id => String(id || "").trim()).filter(Boolean))];
  await persistTabCleanupTopics();
  return topic;
}

async function saveSuggestedTabCleanupTopic(item) {
  const name = String(item?.label || "").trim();
  const ids = Array.isArray(item?.botIds) ? item.botIds : [];
  if (!name) return;
  const topic = await createTabCleanupTopic(name, ids);
  const status = $("tabCleanupDiagnosticStatus");
  if (status && topic) status.textContent = `Saved topic "${topic.name}" with ${topic.botIds.length} bot${topic.botIds.length === 1 ? "" : "s"}. No tabs were moved or closed.`;
}

async function addManualTabCleanupTopic() {
  const input = $("tabCleanupNewTopicName");
  const name = String(input?.value || "").trim();
  if (!name) return;
  await createTabCleanupTopic(name, []);
  if (input) input.value = "";
}

async function getActiveTabCleanupSession() {
  if (!activeTabCleanupSessionId) return null;
  if (activeTabCleanupSessionId === "__live__") {
    if (!lastTabCleanupDiagnostic) return null;
    return makeTabCleanupSession(lastTabCleanupDiagnostic, { id: "__live__", name: "Current open SpicyChat tabs", kind: "live" });
  }
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  return normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]).sessions.find(item => item.id === activeTabCleanupSessionId) || null;
}

function tabCleanupAgeLabel(timestamp) {
  const at = Number(timestamp) || 0;
  if (!at) return "unknown age";
  const diff = Math.max(0, Date.now() - at);
  const hours = diff / 3600000;
  if (hours < 1) return `${Math.max(1, Math.round(diff / 60000))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function tabCleanupReviewVisibleTabs(session) {
  const search = String($("tabCleanupSessionSearch")?.value || "").trim().toLowerCase();
  const topicFilter = String($("tabCleanupSessionTopicFilter")?.value || "all");
  const smart = topicFilter.startsWith("smart:") ? tabCleanupSmartGroupForId(session, topicFilter) : null;
  const smartUrls = smart ? new Set(smart.urls.map(tabCleanupExactUrlKey).filter(Boolean)) : null;
  return (Array.isArray(session?.tabs) ? session.tabs : []).filter(tab => {
    const topics = tabCleanupTopicIdsForBot(tab.botId);
    if (topicFilter === "none" && topics.length) return false;
    if (topicFilter !== "all" && topicFilter !== "none" && !topicFilter.startsWith("smart:") && !topics.includes(topicFilter)) return false;
    if (smartUrls && !smartUrls.has(tabCleanupExactUrlKey(tab.url))) return false;
    if (!search) return true;
    const haystack = `${tab.botName || ""}\n${tab.creator || ""}\n${tab.title || ""}\n${tab.url || ""}\n${(tab.tags || []).join(" ")}\n${tabCleanupTopicNamesForBot(tab.botId).join(" ")}`.toLowerCase();
    return haystack.includes(search);
  });
}

async function openTabCleanupSessionReview(id) {
  activeTabCleanupSessionId = String(id || "");
  tabCleanupSessionSelection.clear();
  const host = $("tabCleanupSessionReview");
  if (host) host.hidden = false;
  await loadTabCleanupTopics();
  await renderTabCleanupSessionReview();
  host?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function closeTabCleanupSessionReview() {
  activeTabCleanupSessionId = "";
  tabCleanupSessionSelection.clear();
  const host = $("tabCleanupSessionReview");
  if (host) host.hidden = true;
  renderTabCleanupSmartGroups();
}

async function renderTabCleanupSessionReview() {
  const host = $("tabCleanupSessionReview");
  const list = $("tabCleanupSessionReviewList");
  if (!host || !list) return;
  if (!activeTabCleanupSessionId) {
    host.hidden = true;
    return;
  }
  const session = await getActiveTabCleanupSession();
  if (!session) {
    closeTabCleanupSessionReview();
    return;
  }
  populateTabCleanupTopicSelects(session);
  host.hidden = false;
  const kind = String(session.kind || "snapshot");
  if ($("tabCleanupSessionReviewTitle")) $("tabCleanupSessionReviewTitle").textContent = session.name || (kind === "live" ? "Current open SpicyChat tabs" : "Saved SpicyChat session");
  if ($("tabCleanupSessionReviewMeta")) {
    const source = session.sourceLabel ? ` · ${session.sourceLabel}` : "";
    $("tabCleanupSessionReviewMeta").textContent = `${Number(session.tabCount || 0)} tabs · ${Number(session.botCount || 0)} bots · ${Array.isArray(session.windows) ? session.windows.length : 0} windows${kind === "closed" ? " · closed cleanup recovery" : kind === "live" ? " · live open tabs" : kind === "merged" ? " · merged snapshot" : ""}${source}`;
  }
  const removeReopenedWrap = $("tabCleanupRemoveReopenedWrap");
  if (removeReopenedWrap) removeReopenedWrap.hidden = kind !== "closed";

  const allUrls = new Set((session.tabs || []).map(tab => String(tab.url || "")).filter(Boolean));
  for (const url of [...tabCleanupSessionSelection]) if (!allUrls.has(url)) tabCleanupSessionSelection.delete(url);
  const visible = tabCleanupReviewVisibleTabs(session);
  const conversationCounts = new Map();
  for (const tab of session.tabs || []) if (tab.botId) conversationCounts.set(tab.botId, (conversationCounts.get(tab.botId) || 0) + 1);

  list.replaceChildren();
  if (!visible.length) {
    list.append(makeElement("div", { className: "bot-manager-empty", text: "No saved tabs match these filters." }));
  } else {
    for (const tab of visible) {
      const url = String(tab.url || "");
      const row = makeElement("label", { className: `tab-cleanup-review-row${tabCleanupSessionSelection.has(url) ? " is-selected" : ""}` });
      const checkbox = makeElement("input", { attrs: { type: "checkbox" } });
      checkbox.checked = tabCleanupSessionSelection.has(url);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) tabCleanupSessionSelection.add(url); else tabCleanupSessionSelection.delete(url);
        renderTabCleanupSessionReview();
      });
      const body = makeElement("div", { className: "tab-cleanup-review-body" });
      body.append(makeElement("strong", { text: tab.botName || tab.title || tab.url || "SpicyChat tab" }));
      const bits = [];
      if (tab.creator) bits.push(`@${tab.creator}`);
      if (tab.botId && (conversationCounts.get(tab.botId) || 0) > 1) bits.push(`${conversationCounts.get(tab.botId)} conversations`);
      bits.push(tabCleanupAgeLabel(tab.lastAccessed));
      if (tab.favoriteHistory) bits.push("Favorite history");
      if (tab.later) bits.push("Later");
      if (tab.savedLocalCopy) bits.push("Local archive");
      if (tab.discarded) bits.push("discarded");
      if (tab.pinned) bits.push("pinned");
      body.append(makeElement("div", { className: "hint", text: bits.filter(Boolean).join(" · ") }));
      const topicNames = tabCleanupTopicNamesForBot(tab.botId);
      if (topicNames.length) body.append(makeElement("div", { className: "tab-cleanup-row-topics", text: topicNames.join(" · ") }));
      if ((tab.tags || []).length) body.append(makeElement("div", { className: "tab-cleanup-row-tags", text: (tab.tags || []).slice(0, 8).join(" · ") }));
      body.append(makeElement("div", { className: "tab-cleanup-url", text: url }));
      row.append(checkbox, body);
      list.append(row);
    }
  }
  if ($("tabCleanupSessionSelectedCount")) $("tabCleanupSessionSelectedCount").textContent = `${tabCleanupSessionSelection.size} selected`;
  const closeButton = $("tabCleanupCloseSelected");
  if (closeButton) closeButton.disabled = !tabCleanupSessionSelection.size;
}

async function selectShownTabCleanupSessionTabs() {
  const session = await getActiveTabCleanupSession();
  if (!session) return;
  for (const tab of tabCleanupReviewVisibleTabs(session)) if (tab.url) tabCleanupSessionSelection.add(String(tab.url));
  await renderTabCleanupSessionReview();
}

async function applyTopicToSelectedTabCleanup(add = true) {
  const topicId = String($("tabCleanupAssignTopic")?.value || "");
  if (!topicId || !tabCleanupSessionSelection.size) return;
  const topic = tabCleanupTopicState.topics.find(item => item.id === topicId);
  const session = await getActiveTabCleanupSession();
  if (!topic || !session) return;
  const selectedBots = new Set((session.tabs || []).filter(tab => tabCleanupSessionSelection.has(String(tab.url || ""))).map(tab => String(tab.botId || "")).filter(Boolean));
  if (add) topic.botIds = [...new Set([...topic.botIds, ...selectedBots])];
  else topic.botIds = topic.botIds.filter(id => !selectedBots.has(id));
  await persistTabCleanupTopics();
  const status = $("tabCleanupSessionReviewStatus");
  if (status) status.textContent = `${add ? "Added" : "Removed"} ${selectedBots.size} bot${selectedBots.size === 1 ? "" : "s"} ${add ? "to" : "from"} "${topic.name}". Tabs were not moved or closed.`;
}

async function removeUrlsFromTabCleanupSession(sessionId, urls) {
  const removeKeys = new Set((urls || []).map(tabCleanupExactUrlKey).filter(Boolean));
  if (!removeKeys.size || !sessionId || sessionId === "__live__") return;
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  const session = store.sessions.find(item => item.id === sessionId);
  if (!session) return;
  session.tabs = (session.tabs || []).filter(tab => !removeKeys.has(tabCleanupExactUrlKey(tab.url)));
  session.tabCount = session.tabs.length;
  session.botCount = new Set(session.tabs.map(tab => tab.botId).filter(Boolean)).size;
  if (!session.tabs.length) store.sessions = store.sessions.filter(item => item.id !== sessionId);
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  if (!session.tabs.length && activeTabCleanupSessionId === sessionId) closeTabCleanupSessionReview();
  await renderTabCleanupSessions();
}

async function reopenSelectedTabCleanup(mode = "current") {
  const session = await getActiveTabCleanupSession();
  const status = $("tabCleanupSessionReviewStatus");
  if (!session || !tabCleanupSessionSelection.size) {
    if (status) status.textContent = "Select at least one saved tab first.";
    return;
  }
  const items = (session.tabs || []).filter(tab => tabCleanupSessionSelection.has(String(tab.url || "")) && /^https:\/\/(?:www\.)?spicychat\.ai\//i.test(String(tab.url || "")));
  if (!items.length) return;
  const savedWindows = new Set(items.map(item => Number(item.windowId) || 0)).size;
  if ((items.length > 20 || (mode === "saved-windows" && savedWindows > 3)) && !confirm(`Reopen ${items.length} SpicyChat tabs${mode === "saved-windows" ? ` across ${savedWindows} new windows` : ""}? Existing tabs will not be closed.`)) return;
  if (status) status.textContent = `Reopening ${items.length} saved tab${items.length === 1 ? "" : "s"}...`;
  const response = await runtimeMessage({ type: "DS_TAB_SESSION_REOPEN", mode, items });
  if (!response?.ok) {
    if (status) status.textContent = `Could not reopen tabs: ${response?.error || "unknown error"}`;
    return;
  }
  const summary = response.summary || {};
  const restoredUrls = [...(summary.openedUrls || []), ...(summary.skippedExistingUrls || [])];
  let removedText = "";
  if (session.kind === "closed" && checked("tabCleanupRemoveReopened", false) && restoredUrls.length) {
    await removeUrlsFromTabCleanupSession(session.id, restoredUrls);
    removedText = ` ${restoredUrls.length} restored entr${restoredUrls.length === 1 ? "y was" : "ies were"} removed from the closed-session recovery list.`;
  }
  if (status) status.textContent = `Reopened ${Number(summary.opened || 0)} tab${Number(summary.opened || 0) === 1 ? "" : "s"}${summary.windows ? ` in ${summary.windows} new window${summary.windows === 1 ? "" : "s"}` : ""}. ${Number(summary.skippedExisting || 0)} already-open tab${Number(summary.skippedExisting || 0) === 1 ? "" : "s"} skipped; ${Number(summary.failed || 0)} failed.${removedText}`;
}

function makeTabCleanupSession(report, overrides = {}) {
  const bots = Array.isArray(report?.bots) ? report.bots : [];
  const tabs = [];
  for (const bot of bots) {
    for (const tab of bot.tabs || []) {
      tabs.push({
        botId: bot.id,
        botName: bot.identity?.bestName || bot.names?.[0] || "",
        creator: bot.identity?.bestCreator || "",
        tags: [...new Set((bot.tags || []).map(tag => String(tag || "").trim()).filter(Boolean))],
        favoriteHistory: !!bot.local?.favoriteHistory,
        later: !!bot.local?.later,
        savedLocalCopy: !!bot.local?.savedLocalCopy,
        url: tab.url || "",
        title: tab.title || "",
        windowId: Number(tab.windowId) || 0,
        index: Number(tab.index) || 0,
        active: !!tab.active,
        pinned: !!tab.pinned,
        discarded: !!tab.discarded,
        lastAccessed: Number(tab.lastAccessed) || 0,
        pageType: tab.pageType || "chat"
      });
    }
  }
  for (const tab of report?.otherTabs || []) {
    tabs.push({
      botId: "",
      botName: "",
      creator: "",
      tags: [],
      favoriteHistory: false,
      later: false,
      savedLocalCopy: false,
      url: tab.url || "",
      title: tab.title || "",
      windowId: Number(tab.windowId) || 0,
      index: Number(tab.index) || 0,
      active: !!tab.active,
      pinned: !!tab.pinned,
      discarded: !!tab.discarded,
      lastAccessed: Number(tab.lastAccessed) || 0,
      pageType: tab.pageType || "other"
    });
  }
  tabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index);
  const createdAt = Date.now();
  const id = String(overrides.id || globalThis.crypto?.randomUUID?.() || `session-${createdAt}-${Math.random().toString(36).slice(2, 8)}`);
  return {
    format: "spicychat-qol-tab-session",
    version: 3,
    id,
    name: String(overrides.name || `SpicyChat tabs — ${new Date(createdAt).toLocaleString()}`),
    kind: String(overrides.kind || "snapshot"),
    createdAt,
    tabCount: tabs.length,
    botCount: new Set(tabs.map(tab => tab.botId).filter(Boolean)).size,
    windows: Array.isArray(report?.windows) ? report.windows : [],
    analysis: report?.analysis || buildTabCleanupAnalysis(report),
    tabs
  };
}

async function saveTabCleanupSession() {
  const status = $("tabCleanupDiagnosticStatus");
  try {
    const report = lastTabCleanupDiagnostic || await requestTabCleanupDiagnostic();
    if (!report) throw new Error("Collect the open tabs first");
    const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
    const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
    const session = makeTabCleanupSession(report);
    store.sessions.unshift(session);
    store.sessions = store.sessions.slice(0, 40);
    await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
    if (status) status.textContent = `Saved session snapshot with ${session.tabCount} SpicyChat tabs. No tabs were closed.`;
    await renderTabCleanupSessions();
    await renderTabCleanupSmartGroups();
  } catch (error) {
    if (status) status.textContent = `Could not save session snapshot: ${error?.message || String(error)}`;
  }
}

function mergeTabCleanupTabRecords(previous, incoming) {
  if (!previous) return { ...incoming, tags: [...new Set(incoming?.tags || [])] };
  const preferText = (a, b) => {
    const left = String(a || "").trim();
    const right = String(b || "").trim();
    if (!left) return right;
    if (!right) return left;
    return right.length >= left.length ? right : left;
  };
  return {
    ...previous,
    ...incoming,
    botId: incoming.botId || previous.botId || "",
    botName: preferText(previous.botName, incoming.botName),
    creator: preferText(previous.creator, incoming.creator),
    title: preferText(previous.title, incoming.title),
    tags: [...new Set([...(previous.tags || []), ...(incoming.tags || [])].map(tag => String(tag || "").trim()).filter(Boolean))],
    favoriteHistory: !!(previous.favoriteHistory || incoming.favoriteHistory),
    later: !!(previous.later || incoming.later),
    savedLocalCopy: !!(previous.savedLocalCopy || incoming.savedLocalCopy),
    pinned: !!(previous.pinned || incoming.pinned),
    active: !!incoming.active,
    discarded: !!incoming.discarded,
    lastAccessed: Math.max(Number(previous.lastAccessed) || 0, Number(incoming.lastAccessed) || 0),
    pageType: incoming.pageType || previous.pageType || "chat"
  };
}

async function mergeAllTabCleanupSessions() {
  const status = $("tabCleanupSessionToolsStatus");
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  if (!store.sessions.length) {
    if (status) status.textContent = "No saved snapshots to merge.";
    return;
  }

  const sourceCount = store.sessions.length;
  if (!window.confirm(`Merge all ${sourceCount} saved snapshot${sourceCount === 1 ? "" : "s"} into one combined snapshot and delete the source snapshot${sourceCount === 1 ? "" : "s"}? This does not close any browser tabs.`)) return;

  const sourceSessions = [...store.sessions].reverse();
  const mergedByUrl = new Map();
  const windowIds = new Map();
  let nextWindowId = 1;
  let duplicateUrls = 0;

  for (const session of sourceSessions) {
    for (const tab of session.tabs || []) {
      const key = tabCleanupExactUrlKey(tab.url);
      if (!key) continue;
      const sourceWindowKey = `${session.id || session.createdAt || "session"}:${Number(tab.windowId) || 0}`;
      if (!windowIds.has(sourceWindowKey)) windowIds.set(sourceWindowKey, nextWindowId++);
      const incoming = {
        ...tab,
        url: key,
        windowId: windowIds.get(sourceWindowKey),
        sourceSessionId: String(session.id || ""),
        sourceWindowId: Number(tab.windowId) || 0
      };
      if (mergedByUrl.has(key)) duplicateUrls += 1;
      mergedByUrl.set(key, mergeTabCleanupTabRecords(mergedByUrl.get(key), incoming));
    }
  }

  const tabs = [...mergedByUrl.values()].sort((a, b) => (Number(a.windowId) || 0) - (Number(b.windowId) || 0) || (Number(a.index) || 0) - (Number(b.index) || 0));
  if (!tabs.length) {
    if (status) status.textContent = "The saved snapshots did not contain any valid SpicyChat URLs to merge.";
    return;
  }

  const createdAt = Date.now();
  const merged = {
    format: "spicychat-qol-tab-session",
    version: 4,
    id: globalThis.crypto?.randomUUID?.() || `merged-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Merged snapshots — ${new Date(createdAt).toLocaleString()}`,
    kind: "merged",
    createdAt,
    sourceLabel: `Merged from ${store.sessions.length} saved snapshot${store.sessions.length === 1 ? "" : "s"}`,
    tabCount: tabs.length,
    botCount: new Set(tabs.map(tab => tab.botId).filter(Boolean)).size,
    windows: tabCleanupWindowsSummary(tabs),
    mergedFrom: store.sessions.map(session => ({ id: session.id, name: session.name, createdAt: session.createdAt, kind: session.kind })),
    tabs
  };

  // The merge is a consolidation operation: once the combined snapshot is
  // safely constructed, replace its source snapshots instead of leaving a
  // second full copy of the same session history behind.
  store.sessions = [merged];
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  await renderTabCleanupSessions();
  await renderTabCleanupSmartGroups();
  if (status) status.textContent = `Created one merged snapshot with ${tabs.length} unique exact URLs from ${sourceSessions.length} snapshot${sourceSessions.length === 1 ? "" : "s"}; ${duplicateUrls} repeated URL record${duplicateUrls === 1 ? " was" : "s were"} merged. The ${sourceSessions.length} source snapshot${sourceSessions.length === 1 ? " was" : "s were"} deleted.`;
}

async function cleanTabCleanupSessionDuplicates() {
  const status = $("tabCleanupSessionToolsStatus");
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  let duplicates = 0;
  const cleaned = store.sessions.map(session => {
    const byUrl = new Map();
    const passthrough = [];
    for (const tab of session.tabs || []) {
      const key = tabCleanupExactUrlKey(tab.url);
      if (!key) { passthrough.push(tab); continue; }
      if (byUrl.has(key)) duplicates += 1;
      byUrl.set(key, mergeTabCleanupTabRecords(byUrl.get(key), { ...tab, url: key }));
    }
    const tabs = [...byUrl.values(), ...passthrough];
    return {
      ...session,
      tabs,
      tabCount: tabs.length,
      botCount: new Set(tabs.map(tab => tab.botId).filter(Boolean)).size,
      windows: tabCleanupWindowsSummary(tabs)
    };
  });

  if (!duplicates) {
    if (status) status.textContent = "No repeated exact URLs were found inside the saved snapshots.";
    return;
  }
  if (!confirm(`Remove ${duplicates} repeated exact-URL record${duplicates === 1 ? "" : "s"} from saved session snapshots?\n\nThis only cleans QoL's saved snapshot data. It does not close or change browser tabs, and separate conversation URLs are kept.`)) return;
  store.sessions = cleaned;
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  await renderTabCleanupSessions();
  if (status) status.textContent = `Removed ${duplicates} repeated exact-URL record${duplicates === 1 ? "" : "s"} from saved snapshots. Separate conversation URLs were preserved.`;
}

function tabCleanupWindowsSummary(tabs) {
  const map = new Map();
  for (const tab of tabs || []) {
    const id = Number(tab.windowId) || 0;
    if (!map.has(id)) map.set(id, { windowId: id, tabCount: 0, botTabCount: 0 });
    const item = map.get(id);
    item.tabCount += 1;
    if (tab.botId) item.botTabCount += 1;
  }
  return [...map.values()];
}

async function saveClosedTabCleanupSession(tabs, sourceLabel = "Selected tabs") {
  const createdAt = Date.now();
  const id = globalThis.crypto?.randomUUID?.() || `closed-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    format: "spicychat-qol-tab-session",
    version: 3,
    id,
    name: `Closed tabs — ${new Date(createdAt).toLocaleString()}`,
    kind: "closed",
    createdAt,
    closedAt: createdAt,
    sourceLabel: String(sourceLabel || "Selected tabs"),
    tabCount: tabs.length,
    botCount: new Set(tabs.map(tab => tab.botId).filter(Boolean)).size,
    windows: tabCleanupWindowsSummary(tabs),
    tabs
  };
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  store.sessions.unshift(session);
  store.sessions = store.sessions.slice(0, 40);
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  return session;
}

async function closeSelectedTabCleanup() {
  const session = await getActiveTabCleanupSession();
  const status = $("tabCleanupSessionReviewStatus");
  if (!session || !tabCleanupSessionSelection.size) {
    if (status) status.textContent = "Select at least one tab first.";
    return;
  }
  const selected = (session.tabs || []).filter(tab => tabCleanupSessionSelection.has(String(tab.url || "")) && tabCleanupExactUrlKey(tab.url));
  if (!selected.length) return;
  const protectPinned = checked("tabCleanupProtectPinnedOnClose", true);
  if (status) status.textContent = `Checking which of the ${selected.length} selected tabs are still open...`;
  const preview = await runtimeMessage({ type: "DS_TAB_SESSION_MATCH_OPEN", items: selected, protectPinned });
  if (!preview?.ok) {
    if (status) status.textContent = `Could not prepare cleanup: ${preview?.error || "unknown error"}`;
    return;
  }
  const matches = Array.isArray(preview.matches) ? preview.matches : [];
  const pinnedSkipped = Number(preview.pinnedSkipped || 0);
  const missing = Number(preview.missing || 0);
  if (!matches.length) {
    if (status) status.textContent = `None of the selected URLs are currently open${pinnedSkipped ? `; ${pinnedSkipped} pinned tab${pinnedSkipped === 1 ? " was" : "s were"} protected` : ""}.`;
    return;
  }
  const sourceByKey = new Map(selected.map(tab => [tabCleanupExactUrlKey(tab.url), tab]));
  const closingTabs = matches.map(match => {
    const source = sourceByKey.get(tabCleanupExactUrlKey(match.url)) || {};
    return {
      ...source,
      url: match.url || source.url || "",
      title: match.title || source.title || "",
      windowId: Number(match.windowId) || Number(source.windowId) || 0,
      index: Number(match.index) || Number(source.index) || 0,
      active: !!match.active,
      pinned: !!match.pinned,
      discarded: !!match.discarded,
      lastAccessed: Number(match.lastAccessed) || Number(source.lastAccessed) || 0
    };
  });
  const filter = $("tabCleanupSessionTopicFilter");
  const sourceLabel = String(filter?.selectedOptions?.[0]?.textContent || "Selected tabs").replace(/^(?:Topic|Smart) · /, "");
  const names = closingTabs.slice(0, 10).map(tab => tab.botName || tab.title || tab.url).filter(Boolean);
  const detail = names.length ? `\n\n${names.join("\n")}${closingTabs.length > names.length ? `\n… +${closingTabs.length - names.length} more` : ""}` : "";
  const pinNote = pinnedSkipped ? `\n${pinnedSkipped} pinned tab${pinnedSkipped === 1 ? " is" : "s are"} protected and will stay open.` : "";
  const missingNote = missing ? `\n${missing} selected saved URL${missing === 1 ? " is" : "s are"} no longer open and will be ignored.` : "";
  if (!confirm(`Save a recovery session and close ${closingTabs.length} currently open SpicyChat tab${closingTabs.length === 1 ? "" : "s"}?\n\nThe recovery snapshot is written before any tab is closed.${pinNote}${missingNote}${detail}`)) return;

  let recovery = null;
  try {
    recovery = await saveClosedTabCleanupSession(closingTabs, sourceLabel);
  } catch (error) {
    if (status) status.textContent = `Cleanup stopped: recovery session could not be saved (${error?.message || String(error)}). No tabs were closed.`;
    return;
  }
  const closeResponse = await runtimeMessage({ type: "DS_TAB_SESSION_CLOSE_MATCHES", tabIds: matches.map(item => item.tabId), protectPinned });
  if (!closeResponse?.ok) {
    if (status) status.textContent = `Recovery session saved, but tab closing failed: ${closeResponse?.error || "unknown error"}.`;
    await renderTabCleanupSessions();
    return;
  }
  const summary = closeResponse.summary || {};
  activeTabCleanupSessionId = recovery.id;
  tabCleanupSessionSelection.clear();
  if (lastTabCleanupDiagnostic) {
    try { lastTabCleanupDiagnostic = await requestTabCleanupDiagnostic(); } catch {}
  }
  await renderTabCleanupSessions();
  await renderTabCleanupSmartGroups();
  await renderTabCleanupSessionReview();
  if (status) status.textContent = `Saved recovery session and closed ${Number(summary.closed || 0)} tab${Number(summary.closed || 0) === 1 ? "" : "s"}. ${Number(summary.pinnedSkipped || 0)} pinned protected; ${Number(summary.failed || 0)} failed. You are now reviewing the saved recovery session.`;
}

async function deleteTabCleanupSession(id) {
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  const target = store.sessions.find(item => item.id === id);
  if (!target) return;
  if (!confirm(`Delete saved tab session "${target.name}"? This only deletes the QoL snapshot; it does not touch browser tabs.`)) return;
  store.sessions = store.sessions.filter(item => item.id !== id);
  await storageSet({ [TAB_CLEANUP_SESSIONS_KEY]: store });
  if (activeTabCleanupSessionId === id) closeTabCleanupSessionReview();
  await renderTabCleanupSessions();
  await renderTabCleanupSmartGroups();
}

async function renderTabCleanupSessions() {
  const host = $("tabCleanupSessionList");
  if (!host) return;
  const result = await storageGet([TAB_CLEANUP_SESSIONS_KEY]);
  const store = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  host.replaceChildren();
  if (!store.sessions.length) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "No session snapshots saved yet." }));
    return;
  }
  for (const session of store.sessions) {
    const card = makeElement("div", { className: `tab-cleanup-session-card${session.kind === "closed" ? " is-closed-recovery" : ""}` });
    card.append(makeElement("strong", { text: session.name || "Saved SpicyChat session" }));
    const kind = session.kind === "closed" ? "Closed cleanup recovery" : session.kind === "merged" ? "Merged snapshot" : "Snapshot";
    const source = session.sourceLabel ? ` · ${session.sourceLabel}` : "";
    card.append(makeElement("div", { className: "hint", text: `${kind} · ${Number(session.tabCount || 0)} tabs · ${Number(session.botCount || 0)} bots · ${Array.isArray(session.windows) ? session.windows.length : 0} windows${source}` }));
    const actions = makeElement("div", { className: "button-row" });
    const review = makeElement("button", { text: session.kind === "closed" ? "Review / restore" : "Review / reopen", attrs: { type: "button" } });
    review.addEventListener("click", () => openTabCleanupSessionReview(session.id));
    const download = makeElement("button", { text: "Download snapshot", attrs: { type: "button" } });
    download.addEventListener("click", () => downloadJsonFile(session, `spicychat-qol-tab-session-${new Date(Number(session.createdAt) || Date.now()).toISOString().slice(0, 10)}.json`));
    const remove = makeElement("button", { text: "Delete snapshot", attrs: { type: "button" } });
    remove.addEventListener("click", () => deleteTabCleanupSession(session.id));
    actions.append(review, download, remove);
    card.append(actions);
    host.append(card);
  }
}


function bindTabCleanupSettingsEvents() {
$("collectTabCleanupDiagnostic")?.addEventListener("click", collectTabCleanupDiagnostic);
$("enrichTabCleanupDiagnostic")?.addEventListener("click", () => enrichTabCleanupDiagnostic(false));
$("retryTabCleanupEnrichment")?.addEventListener("click", () => enrichTabCleanupDiagnostic(true));
$("pauseTabCleanupEnrichment")?.addEventListener("click", toggleTabCleanupEnrichmentPause);
$("cancelTabCleanupEnrichment")?.addEventListener("click", cancelTabCleanupEnrichment);
$("saveTabCleanupSession")?.addEventListener("click", saveTabCleanupSession);
$("mergeTabCleanupSessions")?.addEventListener("click", mergeAllTabCleanupSessions);
$("cleanTabCleanupSessionDuplicates")?.addEventListener("click", cleanTabCleanupSessionDuplicates);
$("copyTabCleanupDiagnostic")?.addEventListener("click", copyTabCleanupDiagnostic);
$("downloadTabCleanupDiagnostic")?.addEventListener("click", downloadTabCleanupDiagnostic);
$("tabCleanupAddTopic")?.addEventListener("click", addManualTabCleanupTopic);
$("tabCleanupNewTopicName")?.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addManualTabCleanupTopic(); } });
$("tabCleanupCloseReview")?.addEventListener("click", closeTabCleanupSessionReview);
$("tabCleanupSessionSearch")?.addEventListener("input", () => renderTabCleanupSessionReview());
$("tabCleanupSessionTopicFilter")?.addEventListener("change", () => renderTabCleanupSessionReview());
$("tabCleanupSessionSelectShown")?.addEventListener("click", selectShownTabCleanupSessionTabs);
$("tabCleanupSessionClearSelection")?.addEventListener("click", () => { tabCleanupSessionSelection.clear(); renderTabCleanupSessionReview(); });
$("tabCleanupAddSelectedToTopic")?.addEventListener("click", () => applyTopicToSelectedTabCleanup(true));
$("tabCleanupRemoveSelectedFromTopic")?.addEventListener("click", () => applyTopicToSelectedTabCleanup(false));
$("tabCleanupReopenSelected")?.addEventListener("click", () => reopenSelectedTabCleanup("current"));
$("tabCleanupReopenSelectedNewWindow")?.addEventListener("click", () => reopenSelectedTabCleanup("new-window"));
$("tabCleanupRestoreSelectedWindows")?.addEventListener("click", () => reopenSelectedTabCleanup("saved-windows"));
$("tabCleanupCloseSelected")?.addEventListener("click", closeSelectedTabCleanup);
["tabCleanupRecentHours", "tabCleanupRecentDays", "tabCleanupMediumDays", "tabCleanupOldDays"].forEach(id => {
  $(id)?.addEventListener("change", async () => {
    renderTabCleanupAnalysis(lastTabCleanupDiagnostic);
    await renderTabCleanupSmartGroups();
    await renderTabCleanupSessionReview();
  });
});
}
