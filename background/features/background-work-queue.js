"use strict";

// Feature-owned background helpers: work-queue. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function queueQuickDislikeBot(message) {
  quickDislikeChain = quickDislikeChain
    .catch(() => {})
    .then(() => queueRecommendationFeedbackForBot(message?.botId, () => runQuickDislikeBot(message)));
  return quickDislikeChain;
}

function queueQuickLessLikeBot(message) {
  quickLessLikeChain = quickLessLikeChain
    .catch(() => {})
    .then(() => queueRecommendationFeedbackForBot(message?.botId, () => runQuickLessLikeBot(message)));
  return quickLessLikeChain;
}

function queueDuplicateTabScan(options = {}) {
  duplicateTabScanChain = duplicateTabScanChain
    .catch(() => {})
    .then(() => runDuplicateTabScan(options));
  return duplicateTabScanChain;
}
