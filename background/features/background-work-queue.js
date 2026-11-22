"use strict";

// Feature-owned background helpers: work-queue. Full QoL and Custom use the same source.

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
