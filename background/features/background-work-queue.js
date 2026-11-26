"use strict";

// Feature-owned background helpers: work-queue. Full QoL and Custom use the same source.

function queueQuickDislikeBot(message) {
  quickDislikeChain = quickDislikeChain
    .catch(() => {})
    .then(() => queueRecommendationFeedbackForBot(message?.botId, () => runQuickDislikeBot(message)))
    .catch(error => ({ ok: false, status: "feedback-result-unconfirmed", reason: String(error?.message || error), requestSent: true, networkAmbiguous: true, retryable: false, bulkPaused: true }));
  return quickDislikeChain;
}

function queueQuickLessLikeBot(message) {
  quickLessLikeChain = quickLessLikeChain
    .catch(() => {})
    .then(() => queueRecommendationFeedbackForBot(message?.botId, () => runQuickLessLikeBot(message)))
    .catch(error => ({ ok: false, status: "feedback-result-unconfirmed", reason: String(error?.message || error), requestSent: true, networkAmbiguous: true, retryable: false, bulkPaused: true }));
  return quickLessLikeChain;
}

// Less Like and More Like share one helper. Serialize their preparation and
// rating actions so rapid consecutive clicks cannot race to initialize it.
function queueQuickMoreLikeBot(message) {
  quickLessLikeChain = quickLessLikeChain
    .catch(() => {})
    .then(() => queueRecommendationFeedbackForBot(message?.botId, () => runQuickMoreLikeBot(message)));
  return quickLessLikeChain;
}

function queueDuplicateTabScan(options = {}) {
  duplicateTabScanChain = duplicateTabScanChain
    .catch(() => {})
    .then(() => runDuplicateTabScan(options));
  return duplicateTabScanChain;
}
