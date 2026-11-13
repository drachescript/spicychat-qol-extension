// Lightweight schema functions shared with Settings backups even when the
// Browser / Tab Cleanup panel has never been opened. No listeners or timers.
const TAB_CLEANUP_TOPICS_KEY = "tabCleanupTopics";
const TAB_CLEANUP_ENRICHMENT_KEY = "tabCleanupEnrichment";
const TAB_CLEANUP_SESSIONS_KEY = "tabCleanupSessions";

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

