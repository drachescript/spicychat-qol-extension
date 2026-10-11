// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
/* DS_QOL14_HOTFIX_START
 * QoL 14 / v0.2.20 hotfix
 * - Makes the existing stacked-chat setting actually align both sides in one column.
 * - Turns dedicated Less Like / Bot Status Home helpers into lightweight worker tabs after warm-up.
 * - Adds shared per-request backpressure for QoL background API work without changing Load All back to DOM loading.
 * - Emits lightweight job/worker markers for diagnostics and future Inspector attribution.
 */
;(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || window.__DS_QOL14_HOTFIX__) return;
  window.__DS_QOL14_HOTFIX__ = true;

  const html = document.documentElement;
  const params = new URLSearchParams(location.search || "");
  const recommendationWorker = params.get("dsQolRecommendationWorker") === "1" || params.get("dsQuickLessLike") === "1";
  const botStatusWorker = params.get("dsQolBotStatusWorker") === "1";
  let workerKind = recommendationWorker ? "less-like" : (botStatusWorker ? "bot-status" : "");
  let workerSessionId = "";
  let workerIdentityPromise = null;
  let workerHeartbeatTimer = 0;

  const JOB_LOCK_NAME = "ds-qol-background-api-v1";
  const FALLBACK_LEASE_KEY = "ds:qol:background-api-lease:v1";
  const JOB_EVENT = "ds-qol-background-job-v1";
  const WORKER_EVENT = "ds-qol-background-worker-v1";
  const DIRECT_FEEDBACK_REQUEST_EVENT = "ds-qol-character-feedback-request-v1";
  const DIRECT_FEEDBACK_RESPONSE_EVENT = "ds-qol-character-feedback-response-v1";
  const RECOMMENDATION_WORKER_PROBE_RESPONSE_EVENT = "ds-qol-recommendation-worker-probe-response-v1";
  const CARD_TOKEN_REQUEST_EVENT = "ds-qol-card-token-request-v2";
  const CARD_TOKEN_RESPONSE_EVENT = "ds-qol-card-token-response-v2";

  const nativeDispatchEvent = window.dispatchEvent.bind(window);
  const nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;

  function nowPerf() {
    try { return performance.now(); } catch { return Date.now(); }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function randomId(prefix = "job") {
    try {
      if (crypto?.randomUUID) return `${prefix}:${crypto.randomUUID()}`;
    } catch {}
    return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  }

  function runtimePerf() {
    DS.state = DS.state || {};
    return DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
  }

  function emitJob(kind, phase, detail = {}) {
    const safeKind = String(kind || "unknown");
    const safePhase = String(phase || "unknown");
    try {
      html.setAttribute("data-ds-qol-background-job-kind", safeKind);
      html.setAttribute("data-ds-qol-background-job-phase", safePhase);
    } catch {}
    try {
      nativeDispatchEvent(new CustomEvent(JOB_EVENT, {
        detail: {
          kind: safeKind,
          phase: safePhase,
          at: Date.now(),
          ...detail
        }
      }));
    } catch {}
  }

  function clearJobMarker(kind) {
    try {
      if (html.getAttribute("data-ds-qol-background-job-kind") !== String(kind || "")) return;
      html.removeAttribute("data-ds-qol-background-job-kind");
      html.removeAttribute("data-ds-qol-background-job-phase");
    } catch {}
  }

  function noteJobWait(kind, waitMs) {
    const perf = runtimePerf();
    perf.backgroundJobCoordinator = perf.backgroundJobCoordinator || {};
    const stats = perf.backgroundJobCoordinator;
    stats.totalRuns = Number(stats.totalRuns || 0) + 1;
    stats.totalWaitMs = Number(stats.totalWaitMs || 0) + Math.max(0, Number(waitMs || 0));
    stats.maxWaitMs = Math.max(Number(stats.maxWaitMs || 0), Math.max(0, Number(waitMs || 0)));
    stats.lastKind = String(kind || "");
    stats.lastWaitMs = Math.max(0, Number(waitMs || 0));
    stats.lastStartedAt = Date.now();
  }

  async function withFallbackLease(kind, task) {
    const owner = randomId(kind);
    const startedAt = Date.now();
    const timeoutAt = startedAt + 12000;
    let acquired = false;
    let heartbeat = null;

    const readLease = () => {
      try {
        const raw = localStorage.getItem(FALLBACK_LEASE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    };

    const writeLease = lease => {
      try {
        localStorage.setItem(FALLBACK_LEASE_KEY, JSON.stringify(lease));
        return true;
      } catch {
        return false;
      }
    };

    emitJob(kind, "waiting", { coordinator: "lease" });

    while (Date.now() < timeoutAt) {
      const current = readLease();
      const now = Date.now();
      if (!current || Number(current.expiresAt || 0) <= now || current.owner === owner) {
        const candidate = { owner, kind, acquiredAt: now, expiresAt: now + 15000 };
        if (!writeLease(candidate)) break;
        await sleep(12 + Math.floor(Math.random() * 18));
        const verified = readLease();
        if (verified?.owner === owner) {
          acquired = true;
          break;
        }
      }
      await sleep(45 + Math.floor(Math.random() * 65));
    }

    if (!acquired) {
      const perf = runtimePerf();
      perf.backgroundJobCoordinator = perf.backgroundJobCoordinator || {};
      perf.backgroundJobCoordinator.failOpenCount = Number(perf.backgroundJobCoordinator.failOpenCount || 0) + 1;
      emitJob(kind, "fail-open", { coordinator: "lease", waitedMs: Date.now() - startedAt });
      return task();
    }

    heartbeat = setInterval(() => {
      const current = readLease();
      if (current?.owner !== owner) return;
      writeLease({ ...current, expiresAt: Date.now() + 15000 });
    }, 4000);

    const waitMs = Date.now() - startedAt;
    noteJobWait(kind, waitMs);
    emitJob(kind, "running", { coordinator: "lease", waitedMs: waitMs, owner });

    try {
      return await task();
    } finally {
      clearInterval(heartbeat);
      try {
        const current = readLease();
        if (current?.owner === owner) localStorage.removeItem(FALLBACK_LEASE_KEY);
      } catch {}
      emitJob(kind, "complete", { coordinator: "lease", owner });
      clearJobMarker(kind);
    }
  }

  async function withSerializedJob(kind, task) {
    const started = nowPerf();
    const locks = navigator?.locks;
    if (!locks || typeof locks.request !== "function") return withFallbackLease(kind, task);

    emitJob(kind, "waiting", { coordinator: "web-locks" });
    return locks.request(JOB_LOCK_NAME, { mode: "exclusive" }, async () => {
      const waitMs = Math.max(0, nowPerf() - started);
      noteJobWait(kind, waitMs);
      emitJob(kind, "running", { coordinator: "web-locks", waitedMs: waitMs });
      try {
        return await task();
      } finally {
        emitJob(kind, "complete", { coordinator: "web-locks" });
        clearJobMarker(kind);
      }
    });
  }

  // Expose one tiny internal hook so later QoL modules can opt in explicitly
  // without inventing a second coordinator.
  DS.withBackgroundJob = withSerializedJob;

  function injectHotfixStyle() {
    if (document.getElementById("ds-qol14-hotfix-style")) return;
    const style = document.createElement("style");
    style.id = "ds-qol14-hotfix-style";
    style.textContent = `
/* The v0.2.19/v0.2.20 setting already toggles this root attribute; these rules
   are the missing half that actually put user + AI bubbles in one column. */
html[data-ds-chat-message-layout="stacked"]
  div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center {
  justify-content: center !important;
}
html[data-ds-chat-message-layout="stacked"]
  div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center > div:first-child:empty {
  display: none !important;
}
html[data-ds-chat-message-layout="stacked"]
  div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center > div:last-child {
  margin-left: 10px !important;
  margin-right: 10px !important;
}

/* Dedicated background helpers do not need Home-page motion while they warm up. */
html[data-ds-qol-background-worker] *,
html[data-ds-qol-background-worker] *::before,
html[data-ds-qol-background-worker] *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
}
`;
    (document.head || document.documentElement)?.appendChild(style);
  }

  injectHotfixStyle();

  function sendRuntimeMessage(message) {
    return new Promise(resolve => {
      try {
        const runtime = chrome?.runtime;
        if (!runtime?.sendMessage) return resolve(null);
        const maybe = runtime.sendMessage(message, response => {
          void chrome.runtime?.lastError;
          resolve(response || null);
        });
        if (maybe && typeof maybe.then === "function") {
          maybe.then(value => resolve(value || null)).catch(() => resolve(null));
        }
      } catch {
        resolve(null);
      }
    });
  }

  function startBotStatusHeartbeat() {
    if (workerHeartbeatTimer || workerKind !== "bot-status") return;

    const beat = async () => {
      if (workerKind !== "bot-status") return;
      const response = await sendRuntimeMessage({
        type: "DS_BOT_STATUS_WORKER_HEARTBEAT",
        sessionId: workerSessionId || "",
        href: location.href,
        at: Date.now()
      });
      if (response?.worker === "bot-status" && response?.sessionId) {
        workerSessionId = String(response.sessionId);
        DS.state = DS.state || {};
        DS.state.qolBackgroundWorkerSessionId = workerSessionId;
      }
    };

    beat().catch(() => {});
    workerHeartbeatTimer = setInterval(() => beat().catch(() => {}), 3000);
  }

  function activateWorkerMode(kindValue, sessionId = "", phase = "boot") {
    const kind = String(kindValue || "").trim();
    if (!kind) return "";
    if (workerKind && workerKind !== kind) return workerKind;
    workerKind = kind;
    if (sessionId) workerSessionId = String(sessionId);

    DS.state = DS.state || {};
    DS.state.qolBackgroundWorker = kind;
    DS.state.qolBackgroundWorkerSessionId = workerSessionId || "";

    // main.js already has a mature worker fast-path for Quick Dislike. Reuse
    // that *suppression flag only* so dedicated API helpers do not wake the
    // normal cosmetic/listing lanes. Setting this flag does not perform a vote.
    DS.state.quickDislikeWorker = true;

    try {
      html.setAttribute("data-ds-qol-background-worker", kind);
      if (workerSessionId) html.setAttribute("data-ds-qol-background-worker-session", workerSessionId);
      nativeDispatchEvent(new CustomEvent(WORKER_EVENT, {
        detail: { kind, phase, sessionId: workerSessionId || "", at: Date.now() }
      }));
    } catch {}

    if (kind === "bot-status") startBotStatusHeartbeat();
    return kind;
  }

  DS.resolveBackgroundWorkerIdentity = function resolveBackgroundWorkerIdentity() {
    if (workerIdentityPromise) return workerIdentityPromise;
    workerIdentityPromise = (async () => {
      if (workerKind) activateWorkerMode(workerKind, workerSessionId, "bootstrap");
      const response = await sendRuntimeMessage({
        type: "DS_QOL_BACKGROUND_WORKER_IDENTITY_QUERY",
        sessionId: workerSessionId || "",
        href: location.href
      });
      if (response?.worker) {
        activateWorkerMode(response.worker, response.sessionId || workerSessionId, "background-identity");
      }
      return {
        worker: workerKind || "",
        sessionId: workerSessionId || ""
      };
    })().catch(() => ({ worker: workerKind || "", sessionId: workerSessionId || "" }));
    return workerIdentityPromise;
  };

  if (workerKind) {
    // The URL marker only exists on the first bootstrap navigation. Keep a
    // same-tab session hint so document_start loaders can stay lightweight if
    // SpicyChat later performs a real reload after its router removed the query.
    try { sessionStorage.setItem("dsQolBackgroundWorkerKind", workerKind); } catch {}
    activateWorkerMode(workerKind, "", "bootstrap");
  }
  // Also ask the background immediately. This is what lets a real page reload
  // keep worker identity even after SpicyChat has stripped the bootstrap query.
  DS.resolveBackgroundWorkerIdentity().catch(() => {});

  function classifyFetch(input, init) {
    let href = "";
    let method = String(init?.method || "").toUpperCase();
    try {
      if (typeof input === "string" || input instanceof URL) href = String(input);
      else if (input && typeof input === "object") {
        href = String(input.url || "");
        if (!method) method = String(input.method || "").toUpperCase();
      }
      const url = new URL(href, location.href);
      if (!method) method = "GET";

      if (
        method === "GET" &&
        url.hostname === "prod.nd-api.com" &&
        url.pathname === "/v2/conversations" &&
        /^\/chats(?:\/|$)/i.test(location.pathname || "")
      ) return "chat-load";

      if (
        workerKind === "bot-status" &&
        method === "GET" &&
        url.hostname === "prod.nd-api.com" &&
        /^\/v2\/characters\/[0-9a-f-]{20,}\/?$/i.test(url.pathname)
      ) return "bot-status";

      if (workerKind === "less-like") {
        if (
          method === "GET" &&
          url.hostname === "prod.nd-api.com" &&
          /^\/v2\/characters\/[0-9a-f-]{20,}\/?$/i.test(url.pathname)
        ) return "less-like";
        if (
          method === "POST" &&
          /recombee\.com$/i.test(url.hostname) &&
          /\/spicychat-prod\/ratings\/?$/i.test(url.pathname)
        ) return "less-like";
      }
    } catch {}
    return "";
  }

  if (nativeFetch && !window.fetch?.__dsQol14Wrapped) {
    const wrappedFetch = function dsQol14Fetch(input, init) {
      const kind = classifyFetch(input, init);
      if (!kind) return nativeFetch(input, init);
      return withSerializedJob(kind, () => nativeFetch(input, init));
    };
    try { Object.defineProperty(wrappedFetch, "__dsQol14Wrapped", { value: true }); } catch {}
    try { window.fetch = wrappedFetch; } catch {}
  }

  function dispatchRequestUnderJob(event, kind, responseType, timeoutMs = 20000) {
    const requestId = String(event?.detail?.requestId || "");
    let dispatched = false;

    withSerializedJob(kind, () => new Promise(resolve => {
      let settled = false;
      let timer = null;
      const finish = outcome => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { window.removeEventListener(responseType, onResponse); } catch {}
        resolve(outcome);
      };
      const onResponse = responseEvent => {
        if (requestId && String(responseEvent?.detail?.requestId || "") !== requestId) return;
        finish("response");
      };

      try { window.addEventListener(responseType, onResponse); } catch {}
      timer = setTimeout(() => finish("response-timeout"), timeoutMs);
      dispatched = true;
      try {
        nativeDispatchEvent(event);
      } catch {
        finish("dispatch-error");
      }
    })).catch(() => {
      // Never let the coordinator break the underlying QoL action. If lock
      // coordination itself fails before dispatch, perform the original event.
      if (!dispatched) {
        try { nativeDispatchEvent(event); } catch {}
      }
    });

    // DOM dispatchEvent is synchronous. The request's existing Promise waits
    // for its normal response event, so it is safe to queue the actual dispatch.
    return true;
  }

  if (!window.dispatchEvent?.__dsQol14Wrapped) {
    const wrappedDispatch = function dsQol14DispatchEvent(event) {
      const type = String(event?.type || "");
      if (workerKind === "less-like" && type === DIRECT_FEEDBACK_REQUEST_EVENT) {
        return dispatchRequestUnderJob(event, "less-like", DIRECT_FEEDBACK_RESPONSE_EVENT, 25000);
      }
      if (workerKind === "bot-status" && type === CARD_TOKEN_REQUEST_EVENT) {
        return dispatchRequestUnderJob(event, "bot-status", CARD_TOKEN_RESPONSE_EVENT, 15000);
      }
      return nativeDispatchEvent(event);
    };
    try { Object.defineProperty(wrappedDispatch, "__dsQol14Wrapped", { value: true }); } catch {}
    try { window.dispatchEvent = wrappedDispatch; } catch {}
  }

  // Cover the rare Bot Status fallback that asks the service worker to make the
  // character request after the MAIN-world bridge cannot. Normal traffic is not touched.
  try {
    const runtime = chrome?.runtime;
    const nativeSendMessage = runtime && typeof runtime.sendMessage === "function"
      ? runtime.sendMessage.bind(runtime)
      : null;
    if (nativeSendMessage && !runtime.sendMessage?.__dsQol14Wrapped) {
      const wrappedSendMessage = function dsQol14SendMessage(...args) {
        const first = args[0];
        const second = args[1];
        const message = (typeof first === "string" && second && typeof second === "object") ? second : first;
        if (workerKind !== "bot-status" || !message || message.type !== "DS_CARD_TOKEN_FETCH") return nativeSendMessage(...args);

        const callbackIndex = typeof args[args.length - 1] === "function" ? args.length - 1 : -1;
        if (callbackIndex >= 0) {
          withSerializedJob("bot-status", () => new Promise(resolve => {
            const next = [...args];
            const callback = next[callbackIndex];
            next[callbackIndex] = response => {
              try { callback(response); } finally { resolve(response); }
            };
            nativeSendMessage(...next);
          })).catch(() => nativeSendMessage(...args));
          return undefined;
        }
        return withSerializedJob("bot-status", () => nativeSendMessage(...args));
      };
      try { Object.defineProperty(wrappedSendMessage, "__dsQol14Wrapped", { value: true }); } catch {}
      try { runtime.sendMessage = wrappedSendMessage; } catch {}
    }
  } catch {}

  let rootParkScheduled = false;
  function parkNativeWorkerRoot(reason) {
    if (!workerKind || rootParkScheduled) return;
    rootParkScheduled = true;
    setTimeout(() => {
      const root = document.getElementById("root");
      if (!root || !root.isConnected) return;
      try {
        // Keep the detached React tree referenced. Its JS/auth/signing state and
        // extension listeners stay alive, while live Home DOM/layout/paint work stops.
        window.__DS_QOL14_PARKED_ROOT__ = root;
        root.remove();
        html.setAttribute("data-ds-qol-background-worker-parked", "1");
        nativeDispatchEvent(new CustomEvent(WORKER_EVENT, {
          detail: { kind: workerKind, phase: "parked", reason: String(reason || "ready"), at: Date.now() }
        }));
      } catch {}
    }, 250);
  }

  window.addEventListener(RECOMMENDATION_WORKER_PROBE_RESPONSE_EVENT, event => {
    if (workerKind === "less-like" && event?.detail?.ready) parkNativeWorkerRoot("recommendation-ready");
  });
  window.addEventListener(DIRECT_FEEDBACK_RESPONSE_EVENT, event => {
    if (workerKind === "less-like" && event?.detail?.ok) parkNativeWorkerRoot("first-feedback-success");
  });
  window.addEventListener(CARD_TOKEN_RESPONSE_EVENT, event => {
    if (workerKind === "bot-status" && event?.detail?.ok) parkNativeWorkerRoot("first-character-success");
  });

  DS.parkBackgroundWorkerRoot = parkNativeWorkerRoot;
})();
/* DS_QOL14_HOTFIX_END */

}
