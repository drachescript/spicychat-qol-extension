"use strict";

// Bot Status worker result normalization.
//
// SpicyChat currently has two public signatures for an unavailable/deleted bot:
//   1) an explicit HTTP 404/410, and
//   2) HTTP 200 with an exact empty JSON object ({}).
//
// card-token-info.js already retries the empty-object response across its
// available API modes before returning `api-empty`, so by the time it reaches
// the background worker it is no longer a one-off empty response. Normalize that
// exhausted signature to the same `unavailable` result the worker already uses
// for 404/410. Restricted/private (403) and transient/no-JSON failures stay
// distinct and are deliberately not treated as deleted.
(() => {
  if (typeof runBotStatusHelperCheck !== "function") {
    console.warn("[SpicyChat QoL] Bot Status guard could not find runBotStatusHelperCheck.");
    return;
  }

  const originalRunBotStatusHelperCheck = runBotStatusHelperCheck;

  runBotStatusHelperCheck = async function guardedRunBotStatusHelperCheck(message) {
    const response = await originalRunBotStatusHelperCheck(message);
    const status = String(response?.status || "").trim().toLowerCase();

    if (status === "api-empty" && response?.emptyObject === true) {
      return {
        ...response,
        ok: true,
        ready: true,
        status: "unavailable",
        unavailable: true,
        confirmedUnavailable: true,
        unavailableEvidence: "repeated-empty-character-api",
        reason: "Character API repeatedly returned an empty object; SpicyChat treats this signature as unavailable/deleted."
      };
    }

    return response;
  };

  console.info("[SpicyChat QoL] Bot Status worker guard active: repeated API {} => unavailable.");
})();
