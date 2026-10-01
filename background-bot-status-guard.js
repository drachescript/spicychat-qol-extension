"use strict";

// Bot Status worker result normalization.
//
// HTTP 200 + an exact empty character object is evidence that the bot may be
// unavailable, but it is not destructive proof by itself. Keep it retryable and
// tag it for the Options-side evidence reconciler. A later independent check can
// confirm unavailable while preserving all previously saved bot/profile fields.
(() => {
  if (typeof runBotStatusHelperCheck !== "function") {
    console.warn("[SpicyChat QoL] Bot Status guard could not find runBotStatusHelperCheck.");
    return;
  }

  const originalRunBotStatusHelperCheck = runBotStatusHelperCheck;

  runBotStatusHelperCheck = async function guardedRunBotStatusHelperCheck(message) {
    const response = await originalRunBotStatusHelperCheck(message);
    const status = String(response?.status || "").trim().toLowerCase();
    const reason = String(response?.reason || "").trim().toLowerCase();
    const httpStatus = Number(response?.httpStatus || 0);
    const exactEmpty = response?.emptyObject === true || status === "api-empty" ||
      (httpStatus === 200 && /empty(?:\s+character)?\s+object|empty[^.]{0,80}character/.test(reason));

    if (exactEmpty) {
      return {
        ...response,
        ready: response?.ready !== false,
        status: "api-empty",
        httpStatus: httpStatus || 200,
        emptyObject: true,
        unavailableCandidate: true,
        unavailableEvidenceType: "api-empty-200",
        confirmedUnavailable: false,
        reason: response?.reason || "Character API returned HTTP 200 with an empty character object."
      };
    }

    return response;
  };

  console.info("[SpicyChat QoL] Bot Status worker guard active: empty API results stay retryable candidate evidence.");
})();
