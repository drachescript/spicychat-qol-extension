"use strict";

// Feature-owned background helpers: worker-dislike. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function quickDislikeWorkerUrlInfo(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!isSpicyChatUrl(parsed.href) || parsed.searchParams.get("dsQuickDislike") !== "1") return null;
    return {
      jobId: String(parsed.searchParams.get("dsQuickJobId") || "").trim(),
      botId: String(parsed.searchParams.get("dsQuickBotId") || "").trim().toLowerCase(),
      bulkRunId: String(parsed.searchParams.get("dsQuickBulkRunId") || "").trim(),
      startedAt: Number(parsed.searchParams.get("dsQuickStartedAt") || 0) || 0,
      sessionId: String(parsed.searchParams.get("dsHelperSession") || "").trim(),
      persistent: parsed.searchParams.get("dsQuickPersistent") === "1"
    };
  } catch {
    return null;
  }
}

function isQuickDislikeWorkerUrl(url) {
  return !!quickDislikeWorkerUrlInfo(url);
}
