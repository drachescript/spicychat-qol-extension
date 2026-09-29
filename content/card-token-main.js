(() => {
  "use strict";

  if (window.__dsCardTokenMainBridgeV1) return;
  window.__dsCardTokenMainBridgeV1 = true;

  function setRootAttribute(name, value) {
    const root = document.documentElement;
    if (!root) return false;
    const next = String(value);
    if (root.getAttribute(name) === next) return false;
    root.setAttribute(name, next);
    return true;
  }

  // Chrome/Brave loads this file directly in MAIN world at document_start.
  // Expose readiness immediately so the isolated-world loader does not race the
  // site's first authenticated history request or inject a redundant copy.
  try { setRootAttribute("data-ds-card-token-main-bridge", "2"); } catch {}

  const REQUEST_EVENT = "ds-qol-card-token-request-v2";
  const RESPONSE_EVENT = "ds-qol-card-token-response-v2";
  const HISTORY_REQUEST_EVENT = "ds-qol-chat-history-request-v1";
  const HISTORY_RESPONSE_EVENT = "ds-qol-chat-history-response-v1";
  const HISTORY_NATIVE_REQUEST_EVENT = "ds-qol-chat-history-native-request-v1";
  const HISTORY_NATIVE_RESPONSE_EVENT = "ds-qol-chat-history-native-response-v1";
  const CONVERSATION_LIST_REQUEST_EVENT = "ds-qol-conversation-list-request-v1";
  const CONVERSATION_LIST_RESPONSE_EVENT = "ds-qol-conversation-list-response-v1";
  const CONTROL_EVENT = "ds-qol-card-token-bridge-control-v1";
  const FEEDBACK_REQUEST_EVENT = "ds-qol-character-feedback-request-v1";
  const FEEDBACK_RESPONSE_EVENT = "ds-qol-character-feedback-response-v1";
  const RECOMMENDATION_WORKER_PROBE_REQUEST_EVENT = "ds-qol-recommendation-worker-probe-request-v1";
  const RECOMMENDATION_WORKER_PROBE_RESPONSE_EVENT = "ds-qol-recommendation-worker-probe-response-v1";
  const API_BASE = "https://prod.nd-api.com/v2/characters/";
  const MESSAGE_API_BASE = "https://prod.nd-api.com/characters/";
  const API_HOST = "prod.nd-api.com";
  const MAX_TOKEN = 12000;
  const TIMEOUT_MS = 7000;

  let capturedToken = "";
  let capturedGuest = "";
  let capturedAt = 0;
  let recombeePublicToken = "";
  let recombeeTokenCandidatesPromise = null;
  let recombeeTokenCandidatesCache = [];
  let recombeeTokenCandidatesCachedAt = 0;
  const RECOMBEE_TOKEN_CACHE_MS = 10 * 60 * 1000;
  const RECOMBEE_TOKEN_EMPTY_CACHE_MS = 5 * 1000;
  const recombeeFeedbackInFlight = new Map();
  const recombeeSignedRequestSamples = [];
  const RECOMBEE_SIGNED_SAMPLE_LIMIT = 24;
  const recommendationWorkerBootAt = Date.now();
  const RECOMBEE_DISCOVERY_FALLBACK_MS = 7000;
  let nativeHistoryRequestSeq = 0;
  let nativeHistoryResponseSeq = 0;
  let nativeHistorySuccesses = 0;
  let nativeHistoryAuth401s = 0;

  const clean = value => String(value || "").trim();

  // 0.2.23 UI maintenance that must be available on /chat and /chats even
  // before the normal isolated-world runtime finishes booting.
  //
  // - Stacked chat mode now means one shared centered message lane: user and AI
  //   cards use the same width instead of only sharing an approximate left edge.
  // - An otherwise-empty Quick Panel shell is hidden after its route-specific
  //   controls have all been disabled.
  function installV023ChatLayoutFixes() {
    const styleId = "ds-qol-v023-chat-layout-fixes";
    if (document.getElementById(styleId)) return true;

    const host = document.head || document.documentElement;
    if (!host) return false;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      html[data-ds-chat-message-layout="stacked"]
        div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center {
          justify-content: center !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }

      html[data-ds-chat-message-layout="stacked"]
        div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center > div:first-child:empty {
          display: none !important;
          flex: 0 0 0 !important;
          width: 0 !important;
          min-width: 0 !important;
          margin: 0 !important;
        }

      html[data-ds-chat-message-layout="stacked"]
        div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center > div:nth-child(2) {
          box-sizing: border-box !important;
          width: calc(100% - 20px) !important;
          min-width: 0 !important;
          max-width: calc(100% - 20px) !important;
          flex: 0 1 calc(100% - 20px) !important;
          margin-left: 10px !important;
          margin-right: 10px !important;
        }

      #ds-qol-panel[data-ds-qol-empty="1"] {
        display: none !important;
      }
    `;
    host.appendChild(style);
    return true;
  }

  let quickPanelVisibilityObserved = null;
  let quickPanelVisibilityObserver = null;
  let quickPanelVisibilityRaf = 0;

  function refreshQuickPanelEmptyState() {
    quickPanelVisibilityRaf = 0;
    const panel = document.getElementById("ds-qol-panel");

    if (panel !== quickPanelVisibilityObserved) {
      try { quickPanelVisibilityObserver?.disconnect(); } catch {}
      quickPanelVisibilityObserved = panel || null;

      if (panel) {
        quickPanelVisibilityObserver = new MutationObserver(() => scheduleQuickPanelEmptyRefresh());
        try {
          quickPanelVisibilityObserver.observe(panel, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["style", "hidden", "class"]
          });
        } catch {}
      }
    }

    if (!panel) return;
    const body = panel.querySelector(".ds-qol-body");
    if (!body) {
      panel.setAttribute("data-ds-qol-empty", "1");
      return;
    }

    const hasUsableContent = [...body.children].some(child => {
      if (child.hidden) return false;
      try { return getComputedStyle(child).display !== "none"; }
      catch { return child.style?.display !== "none"; }
    });

    const next = hasUsableContent ? "0" : "1";
    if (panel.getAttribute("data-ds-qol-empty") !== next) {
      panel.setAttribute("data-ds-qol-empty", next);
    }
  }

  function scheduleQuickPanelEmptyRefresh() {
    if (quickPanelVisibilityRaf) return;
    quickPanelVisibilityRaf = requestAnimationFrame(refreshQuickPanelEmptyState);
  }

  function installQuickPanelEmptyWatcher() {
    scheduleQuickPanelEmptyRefresh();
    const root = document.documentElement;
    if (!root) return false;

    // Only watch for the panel itself being mounted/replaced. Once it exists,
    // a small observer is attached directly to that panel instead of observing
    // all page attribute churn.
    const mountObserver = new MutationObserver(() => scheduleQuickPanelEmptyRefresh());
    try { mountObserver.observe(root, { childList: true }); }
    catch { return false; }
    return true;
  }

  if (!installV023ChatLayoutFixes()) {
    document.addEventListener("DOMContentLoaded", installV023ChatLayoutFixes, { once: true });
  }
  if (!installQuickPanelEmptyWatcher()) {
    document.addEventListener("DOMContentLoaded", installQuickPanelEmptyWatcher, { once: true });
  }

  function responseRetryAfterMs(response) {
    let raw = "";
    try { raw = clean(response?.headers?.get?.("retry-after")); } catch {}
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30000, Math.round(seconds * 1000));
    const at = Date.parse(raw);
    return Number.isFinite(at) ? Math.min(30000, Math.max(0, at - Date.now())) : 0;
  }

  const isJwt = value => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clean(value));
  const isGuest = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean(value));

  // The guest/user identity is stored by SpicyChat itself and is available
  // before the React app finishes booting. Using it here lets a cached Less
  // Like signing token make the lightweight /chats worker ready without
  // waiting for a full Home listing render.
  try {
    const storedGuest = clean(localStorage.getItem("guest_user_id"));
    if (isGuest(storedGuest)) {
      capturedGuest = storedGuest;
      capturedAt = Date.now();
    }
  } catch {}

  function exposeCapturedAuthState() {
    try {
      setRootAttribute("data-ds-card-token-main-auth", isJwt(capturedToken) ? "1" : "0");
      setRootAttribute("data-ds-card-token-main-guest", isGuest(capturedGuest) ? "1" : "0");
      setRootAttribute("data-ds-card-token-main-auth-at", String(Math.max(0, Number(capturedAt || 0))));
    } catch {}
  }

  function announceCapturedAuth() {
    exposeCapturedAuthState();
    try {
      window.dispatchEvent(new CustomEvent("ds-qol-card-token-auth-captured-v1", {
        detail: { hasAuth: isJwt(capturedToken), hasGuest: isGuest(capturedGuest), capturedAt }
      }));
    } catch {}
  }

  function parseApiUrl(input) {
    try {
      return new URL(typeof input === "string" ? input : input?.url || "", location.href);
    } catch {
      return null;
    }
  }

  function urlIsApi(input) {
    const url = parseApiUrl(input);
    return !!url && url.hostname === API_HOST;
  }

  function recombeeSignedSample(input) {
    const url = parseApiUrl(input);
    if (!url || url.hostname !== "client-rapi-ca-east.recombee.com" || !url.pathname.startsWith("/spicychat-prod/")) return null;
    const signature = clean(url.searchParams.get("frontend_sign")).toLowerCase();
    if (!/^[0-9a-f]{40}$/i.test(signature)) return null;

    const unsigned = new URL(url.href);
    unsigned.searchParams.delete("frontend_sign");
    return {
      message: `${unsigned.pathname}${unsigned.search}`,
      signature,
      at: Date.now()
    };
  }

  function rememberRecombeeSignedRequest(input) {
    const sample = recombeeSignedSample(input);
    if (!sample) return;
    if (recombeeSignedRequestSamples.some(item => item.message === sample.message && item.signature === sample.signature)) return;
    recombeeSignedRequestSamples.unshift(sample);
    if (recombeeSignedRequestSamples.length > RECOMBEE_SIGNED_SAMPLE_LIMIT) {
      recombeeSignedRequestSamples.length = RECOMBEE_SIGNED_SAMPLE_LIMIT;
    }
  }

  function collectPerformanceRecombeeSamples() {
    try {
      const entries = performance.getEntriesByType("resource") || [];
      for (const entry of entries.slice(-250)) rememberRecombeeSignedRequest(entry?.name || "");
    } catch {}
  }

  function urlIsNativeHistoryApi(input) {
    const url = parseApiUrl(input);
    if (!url || url.hostname !== API_HOST) return false;
    return /^\/characters\/[0-9a-f-]{20,}\/messages(?:\/[0-9a-f-]{20,})?\/?$/i.test(url.pathname);
  }

  function noteNativeHistoryRequest(input, transport) {
    if (!urlIsNativeHistoryApi(input)) return 0;
    nativeHistoryRequestSeq += 1;
    const at = Date.now();
    try {
      setRootAttribute("data-ds-chat-history-main-seq", String(nativeHistoryRequestSeq));
      setRootAttribute("data-ds-chat-history-main-at", String(at));
      window.dispatchEvent(new CustomEvent(HISTORY_NATIVE_REQUEST_EVENT, {
        detail: { seq: nativeHistoryRequestSeq, at, transport: String(transport || "unknown") }
      }));
    } catch {}
    return nativeHistoryRequestSeq;
  }

  function noteNativeHistoryResponse(requestSeq, status, input, transport, startedAt = 0) {
    if (!requestSeq || !urlIsNativeHistoryApi(input)) return;
    nativeHistoryResponseSeq += 1;
    const at = Date.now();
    const httpStatus = Math.max(0, Number(status || 0) || 0);
    const elapsedMs = startedAt ? Math.max(0, at - Number(startedAt || at)) : 0;
    if (httpStatus >= 200 && httpStatus < 400) nativeHistorySuccesses += 1;
    if (httpStatus === 401) {
      nativeHistoryAuth401s += 1;
      // A native 401 means the token SpicyChat just used is stale too. Clear our
      // captured copy so Native export can wait for the site's refreshed auth
      // instead of immediately retrying the same expired bearer token.
      capturedToken = "";
      capturedAt = 0;
      exposeCapturedAuthState();
    }
    try {
      setRootAttribute("data-ds-chat-history-main-response-seq", String(nativeHistoryResponseSeq));
      setRootAttribute("data-ds-chat-history-main-response-request-seq", String(requestSeq));
      setRootAttribute("data-ds-chat-history-main-response-status", String(httpStatus));
      setRootAttribute("data-ds-chat-history-main-response-at", String(at));
      setRootAttribute("data-ds-chat-history-main-response-ms", String(elapsedMs));
      setRootAttribute("data-ds-chat-history-main-successes", String(nativeHistorySuccesses));
      setRootAttribute("data-ds-chat-history-main-auth-401s", String(nativeHistoryAuth401s));
      window.dispatchEvent(new CustomEvent(HISTORY_NATIVE_RESPONSE_EVENT, {
        detail: {
          seq: nativeHistoryResponseSeq, requestSeq, at, elapsedMs, status: httpStatus,
          ok: httpStatus >= 200 && httpStatus < 400, transport: String(transport || "unknown")
        }
      }));
    } catch {}
  }

  function rememberHeader(name, value) {
    const key = clean(name).toLowerCase();
    const raw = clean(value);
    if (key === "authorization") {
      const token = raw.replace(/^bearer\s+/i, "").trim();
      if (token && token.length < MAX_TOKEN && isJwt(token)) {
        capturedToken = token;
        capturedAt = Date.now();
        announceCapturedAuth();
      }
    } else if (key === "x-guest-userid" && isGuest(raw)) {
      capturedGuest = raw;
      announceCapturedAuth();
    }
  }

  function scanHeaders(headers) {
    if (!headers) return;
    try {
      if (headers instanceof Headers) {
        headers.forEach((value, name) => rememberHeader(name, value));
        return;
      }
    } catch {}
    if (Array.isArray(headers)) {
      for (const pair of headers) if (Array.isArray(pair) && pair.length >= 2) rememberHeader(pair[0], pair[1]);
      return;
    }
    if (typeof headers === "object") {
      for (const [name, value] of Object.entries(headers)) rememberHeader(name, value);
    }
  }

  // Observe SpicyChat's own API calls only while token info is enabled. The
  // loader can put this bridge back to sleep without reloading the page.
  const nativeFetchRaw = typeof window.fetch === "function" ? window.fetch : null;
  const nativeFetch = nativeFetchRaw ? nativeFetchRaw.bind(window) : null;
  const XHR = window.XMLHttpRequest;
  const nativeOpen = XHR?.prototype?.open || null;
  const nativeSetRequestHeader = XHR?.prototype?.setRequestHeader || null;
  const nativeSend = XHR?.prototype?.send || null;
  let active = true;
  let hooksInstalled = false;

  function observedFetch(input, init) {
    let historySeq = 0;
    let historyStartedAt = 0;
    try {
      if (active) rememberRecombeeSignedRequest(input instanceof Request ? input.url : input);
      if (active && urlIsApi(input)) {
        scanHeaders(input instanceof Request ? input.headers : null);
        scanHeaders(init?.headers);
        if (urlIsNativeHistoryApi(input)) {
          historyStartedAt = Date.now();
          historySeq = noteNativeHistoryRequest(input, "fetch");
        }
      }
    } catch {}

    const pending = nativeFetch(input, init);
    if (!historySeq) return pending;
    return pending.then(
      response => {
        try { noteNativeHistoryResponse(historySeq, response?.status, input, "fetch", historyStartedAt); } catch {}
        return response;
      },
      error => {
        try { noteNativeHistoryResponse(historySeq, 0, input, "fetch", historyStartedAt); } catch {}
        throw error;
      }
    );
  }

  function observedOpen(method, url, ...rest) {
    try {
      if (active) rememberRecombeeSignedRequest(url);
      this.__dsCardTokenApi = active && urlIsApi(url);
      this.__dsCardTokenUrl = this.__dsCardTokenApi ? String(url || "") : "";
      this.__dsCardTokenHistoryApi = this.__dsCardTokenApi && urlIsNativeHistoryApi(url);
    } catch {
      this.__dsCardTokenApi = false;
      this.__dsCardTokenUrl = "";
      this.__dsCardTokenHistoryApi = false;
    }
    return nativeOpen.call(this, method, url, ...rest);
  }

  function observedSetRequestHeader(name, value) {
    try { if (active && this.__dsCardTokenApi) rememberHeader(name, value); } catch {}
    return nativeSetRequestHeader.call(this, name, value);
  }

  function observedSend(...args) {
    try {
      if (active && this.__dsCardTokenHistoryApi) {
        const historyStartedAt = Date.now();
        const historySeq = noteNativeHistoryRequest(this.__dsCardTokenUrl, "xhr");
        const historyUrl = this.__dsCardTokenUrl;
        if (historySeq && typeof this.addEventListener === "function") {
          this.addEventListener("loadend", () => {
            try { noteNativeHistoryResponse(historySeq, this.status, historyUrl, "xhr", historyStartedAt); } catch {}
          }, { once: true });
        }
      }
    } catch {}
    return nativeSend.apply(this, args);
  }

  function installHooks() {
    if (hooksInstalled || !active) return;
    if (nativeFetch && window.fetch === nativeFetchRaw) window.fetch = observedFetch;
    if (XHR?.prototype && nativeOpen && nativeSetRequestHeader && nativeSend) {
      if (XHR.prototype.open === nativeOpen) XHR.prototype.open = observedOpen;
      if (XHR.prototype.setRequestHeader === nativeSetRequestHeader) XHR.prototype.setRequestHeader = observedSetRequestHeader;
      if (XHR.prototype.send === nativeSend) XHR.prototype.send = observedSend;
    }
    hooksInstalled = true;
  }

  function uninstallHooks() {
    if (!hooksInstalled) return;
    if (window.fetch === observedFetch && nativeFetchRaw) window.fetch = nativeFetchRaw;
    if (XHR?.prototype) {
      if (XHR.prototype.open === observedOpen && nativeOpen) XHR.prototype.open = nativeOpen;
      if (XHR.prototype.setRequestHeader === observedSetRequestHeader && nativeSetRequestHeader) XHR.prototype.setRequestHeader = nativeSetRequestHeader;
      if (XHR.prototype.send === observedSend && nativeSend) XHR.prototype.send = nativeSend;
    }
    hooksInstalled = false;
  }

  function setActive(next) {
    active = !!next;
    if (active) installHooks();
    else uninstallHooks();
    try { setRootAttribute("data-ds-card-token-main-active", active ? "1" : "0"); } catch {}
  }

  window.addEventListener(CONTROL_EVENT, event => setActive(event?.detail?.enabled !== false));
  installHooks();

  function send(detail) {
    try { window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail })); } catch {}
  }

  window.addEventListener(REQUEST_EVENT, async event => {
    const detail = event?.detail || {};
    if (!active) return;
    const requestId = clean(detail.requestId);
    const botId = clean(detail.botId).toLowerCase();
    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(botId)) return;

    let token = clean(detail.authToken);
    let guest = clean(detail.guestUserId);
    let authSource = clean(detail.authSource) || "none";
    if (isJwt(capturedToken)) {
      token = capturedToken;
      authSource = "captured-main-world";
    }
    if (!isGuest(guest) && isGuest(capturedGuest)) guest = capturedGuest;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = Date.now();
    try {
      const headers = { Accept: "application/json", "x-app-id": "spicychat" };
      if (isJwt(token) && token.length < MAX_TOKEN) headers.Authorization = `Bearer ${token}`;
      if (isGuest(guest)) headers["x-guest-userid"] = guest;

      const response = await nativeFetch(`${API_BASE}${encodeURIComponent(botId)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers,
        signal: controller.signal
      });
      const text = await response.text().catch(() => "");
      const elapsedMs = Date.now() - started;
      if (!response.ok) {
        if (response.status === 401 && authSource === "captured-main-world") {
          capturedToken = "";
          capturedAt = 0;
          exposeCapturedAuthState();
        }
        send({ requestId, ok: false, status: "http", httpStatus: response.status, elapsedMs, authSource, authProvided: !!headers.Authorization });
        return;
      }
      let data = null;
      try { data = JSON.parse(text); } catch {}
      if (!data || typeof data !== "object") {
        send({ requestId, ok: false, status: "parse-failure", httpStatus: response.status, elapsedMs, authSource, authProvided: !!headers.Authorization });
        return;
      }
      send({ requestId, ok: true, status: "success", httpStatus: response.status, elapsedMs, authSource, authProvided: !!headers.Authorization, data });
    } catch (error) {
      const elapsedMs = Date.now() - started;
      send({
        requestId,
        ok: false,
        status: error?.name === "AbortError" ? "timeout" : "network-failure",
        elapsedMs,
        authSource,
        authProvided: isJwt(token),
        error: clean(error?.message || error)
      });
    } finally {
      clearTimeout(timer);
    }
  });


  function resolveAuth(detail = {}) {
    let token = clean(detail.authToken);
    let guest = clean(detail.guestUserId);
    let authSource = clean(detail.authSource) || "none";
    if (isJwt(capturedToken)) {
      token = capturedToken;
      authSource = "captured-main-world";
    }
    if (!isGuest(guest) && isGuest(capturedGuest)) guest = capturedGuest;
    return { token, guest, authSource };
  }

  function historySend(detail) {
    try { window.dispatchEvent(new CustomEvent(HISTORY_RESPONSE_EVENT, { detail })); } catch {}
  }

  window.addEventListener(HISTORY_REQUEST_EVENT, async event => {
    const detail = event?.detail || {};
    if (!active) return;

    const requestId = clean(detail.requestId);
    const characterId = clean(detail.characterId).toLowerCase();
    const conversationId = clean(detail.conversationId).toLowerCase();
    const lastId = clean(detail.lastId).toLowerCase();
    const requestedLimit = Math.floor(Number(detail.limit || 50));
    const limit = Math.max(1, Math.min(200, Number.isFinite(requestedLimit) ? requestedLimit : 50));

    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(characterId)) return;
    if (conversationId && !/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(conversationId)) return;
    if (lastId && !/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(lastId)) return;

    const resolved = resolveAuth(detail);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const started = Date.now();

    const path = conversationId
      ? `${MESSAGE_API_BASE}${encodeURIComponent(characterId)}/messages/${encodeURIComponent(conversationId)}`
      : `${MESSAGE_API_BASE}${encodeURIComponent(characterId)}/messages`;
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (lastId) params.set("last_id", lastId);
    const url = `${path}?${params.toString()}&`;

    const runRequest = async ({ token, guest, authSource }) => {
      const headers = {
        Accept: "application/json",
        "x-app-id": "spicychat",
        "x-platform": "WEB",
        "x-platform-os": "DESKTOP"
      };
      const appVersion = clean(document.querySelector('meta[name="app-version"]')?.content || "");
      if (appVersion) headers["x-app-version"] = appVersion;
      if (isJwt(token) && token.length < MAX_TOKEN) headers.Authorization = `Bearer ${token}`;
      if (isGuest(guest)) headers["x-guest-userid"] = guest;

      const response = await nativeFetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers,
        signal: controller.signal
      });
      const text = await response.text().catch(() => "");
      return { response, text, headers, authSource, token, guest };
    };

    try {
      let attempt = await runRequest(resolved);
      let authRefreshes = 0;

      // Captured MAIN-world auth can go stale between normal SpicyChat API
      // calls. If that exact captured token gets a 401, discard it and retry
      // the same history page once with the fresh token supplied by the
      // isolated-world auth discovery path before surfacing a failure.
      if (attempt.response.status === 401 && attempt.authSource === "captured-main-world") {
        capturedToken = "";
        capturedAt = 0;
        exposeCapturedAuthState();

        const fallbackToken = clean(detail.authToken);
        const fallbackGuest = isGuest(clean(detail.guestUserId)) ? clean(detail.guestUserId) : attempt.guest;
        const fallbackSource = clean(detail.authSource) || "refreshed-isolated-world";
        if (isJwt(fallbackToken) && fallbackToken !== attempt.token) {
          authRefreshes++;
          attempt = await runRequest({ token: fallbackToken, guest: fallbackGuest, authSource: fallbackSource });
        }
      }

      const { response, text, headers, authSource } = attempt;
      const elapsedMs = Date.now() - started;
      if (!response.ok) {
        historySend({
          requestId, ok: false, status: "http", httpStatus: response.status,
          elapsedMs, authSource, authProvided: !!headers.Authorization, limit, authRefreshes
        });
        return;
      }

      let data = null;
      try { data = JSON.parse(text); } catch {}
      if (!data || typeof data !== "object") {
        historySend({
          requestId, ok: false, status: "parse-failure", httpStatus: response.status,
          elapsedMs, authSource, authProvided: !!headers.Authorization, limit, authRefreshes
        });
        return;
      }

      historySend({
        requestId, ok: true, status: "success", httpStatus: response.status,
        elapsedMs, authSource, authProvided: !!headers.Authorization, limit, authRefreshes, data
      });
    } catch (error) {
      historySend({
        requestId,
        ok: false,
        status: error?.name === "AbortError" ? "timeout" : "network-failure",
        elapsedMs: Date.now() - started,
        authSource: resolved.authSource,
        authProvided: isJwt(resolved.token),
        limit,
        authRefreshes: 0,
        error: clean(error?.message || error)
      });
    } finally {
      clearTimeout(timer);
    }
  });



  function conversationListSend(detail) {
    try { window.dispatchEvent(new CustomEvent(CONVERSATION_LIST_RESPONSE_EVENT, { detail })); } catch {}
  }

  window.addEventListener(CONVERSATION_LIST_REQUEST_EVENT, async event => {
    const detail = event?.detail || {};
    if (!active) return;

    const requestId = clean(detail.requestId);
    const lastId = clean(detail.lastId).toLowerCase();
    const requestedLimit = Math.floor(Number(detail.limit || 25));
    const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 25));
    if (!requestId) return;
    if (lastId && !/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(lastId)) return;

    const resolved = resolveAuth(detail);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const started = Date.now();

    const runRequest = async ({ token, guest, authSource }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("sort", "latest");
      if (lastId) params.set("last_id", lastId);

      const headers = {
        Accept: "application/json, text/plain, */*",
        "x-app-id": "spicychat",
        "x-platform": "WEB",
        "x-platform-os": "DESKTOP"
      };
      const appVersion = clean(document.querySelector('meta[name="app-version"]')?.content || "");
      if (appVersion) headers["x-app-version"] = appVersion;
      if (isJwt(token) && token.length < MAX_TOKEN) headers.Authorization = `Bearer ${token}`;
      if (isGuest(guest)) headers["x-guest-userid"] = guest;

      const response = await nativeFetch(`https://prod.nd-api.com/v2/conversations?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers,
        signal: controller.signal
      });
      const text = await response.text().catch(() => "");
      return { response, text, headers, authSource, token, guest };
    };

    try {
      let attempt = await runRequest(resolved);
      let authRefreshes = 0;

      if (attempt.response.status === 401 && attempt.authSource === "captured-main-world") {
        capturedToken = "";
        capturedAt = 0;
        exposeCapturedAuthState();

        const fallbackToken = clean(detail.authToken);
        const fallbackGuest = isGuest(clean(detail.guestUserId)) ? clean(detail.guestUserId) : attempt.guest;
        const fallbackSource = clean(detail.authSource) || "refreshed-isolated-world";
        if (isJwt(fallbackToken) && fallbackToken !== attempt.token) {
          authRefreshes++;
          attempt = await runRequest({ token: fallbackToken, guest: fallbackGuest, authSource: fallbackSource });
        }
      }

      const { response, text, headers, authSource } = attempt;
      const elapsedMs = Date.now() - started;
      if (!response.ok) {
        conversationListSend({
          requestId, ok: false, status: "http", httpStatus: response.status,
          elapsedMs, authSource, authProvided: !!headers.Authorization, limit, authRefreshes
        });
        return;
      }

      let rows = null;
      try { rows = JSON.parse(text); } catch {}
      if (!Array.isArray(rows)) {
        conversationListSend({
          requestId, ok: false, status: "parse-failure", httpStatus: response.status,
          elapsedMs, authSource, authProvided: !!headers.Authorization, limit, authRefreshes
        });
        return;
      }

      conversationListSend({
        requestId, ok: true, status: "success", httpStatus: response.status,
        elapsedMs, authSource, authProvided: !!headers.Authorization,
        limit, authRefreshes, data: rows
      });
    } catch (error) {
      conversationListSend({
        requestId,
        ok: false,
        status: error?.name === "AbortError" ? "timeout" : "network-failure",
        httpStatus: 0,
        elapsedMs: Date.now() - started,
        authSource: resolved.authSource,
        authProvided: isJwt(resolved.token),
        limit,
        authRefreshes: 0,
        error: clean(error?.message || error)
      });
    } finally {
      clearTimeout(timer);
    }
  });

  function feedbackSend(detail) {
    try { window.dispatchEvent(new CustomEvent(FEEDBACK_RESPONSE_EVENT, { detail })); } catch {}
  }

  function currentRecombeeUserId() {
    const candidates = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = clean(localStorage.key(index));
        if (!key) continue;
        const kp = key.match(/(?:^|_)(kp:[0-9a-f]{24,64})$/i);
        if (kp?.[1]) candidates.push(kp[1]);
      }
    } catch {}
    const preferred = candidates.find(value => /^kp:[0-9a-f]{32}$/i.test(value));
    if (preferred) return preferred;
    if (candidates[0]) return candidates[0];
    try {
      const guest = clean(localStorage.getItem("guest_user_id"));
      if (isGuest(guest)) return guest;
    } catch {}
    return isGuest(capturedGuest) ? capturedGuest : "";
  }

  function plausibleRecombeeToken(value) {
    const token = clean(value);
    if (token.length < 16 || token.length > 180) return "";
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return "";
    if (/^(spicychat|homepage|navigate|ca-east|ratings|recommend)/i.test(token)) return "";
    return token;
  }

  function collectRecombeeTokensFromText(text, scored = new Map()) {
    const source = String(text || "");
    if (!source.includes("spicychat-prod")) return scored;
    const add = (raw, score) => {
      const token = plausibleRecombeeToken(raw);
      if (!token) return;
      scored.set(token, Math.max(Number(scored.get(token) || 0), Number(score || 0)));
    };

    // Common SDK construction / config forms with a literal public token.
    const literalPatterns = [
      [/['"]spicychat-prod['"]\s*,\s*['"]([A-Za-z0-9_-]{16,180})['"]/g, 120],
      [/databaseId\s*:\s*['"]spicychat-prod['"][\s\S]{0,500}?publicToken\s*:\s*['"]([A-Za-z0-9_-]{16,180})['"]/g, 115],
      [/publicToken\s*:\s*['"]([A-Za-z0-9_-]{16,180})['"][\s\S]{0,500}?databaseId\s*:\s*['"]spicychat-prod['"]/g, 115]
    ];
    for (const [pattern, score] of literalPatterns) {
      let match;
      while ((match = pattern.exec(source))) add(match[1], score);
    }

    // Minified bundles often pass an identifier as the SDK's second ctor arg:
    // new X("spicychat-prod",tokenVar,{region:"ca-east"}). Resolve a nearby
    // string assignment for that identifier without treating unrelated strings
    // as high-confidence candidates.
    const ctorIdentifier = /['"]spicychat-prod['"]\s*,\s*([A-Za-z_$][\w$]*)\s*,/g;
    let ctorMatch;
    while ((ctorMatch = ctorIdentifier.exec(source))) {
      const name = ctorMatch[1].replace(/[$]/g, "\\$");
      const assign = new RegExp(`(?:const|let|var)?\\s*${name}\\s*=\\s*['\"]([A-Za-z0-9_-]{16,180})['\"]`, "g");
      let assignment;
      while ((assignment = assign.exec(source))) add(assignment[1], 105);
    }

    // Low-confidence fallback: only inspect quoted strings very close to the
    // database id and only when the same slice also mentions Recombee/region.
    let pos = source.indexOf("spicychat-prod");
    let windows = 0;
    while (pos >= 0 && windows < 24) {
      const start = Math.max(0, pos - 500);
      const end = Math.min(source.length, pos + 900);
      const windowText = source.slice(start, end);
      if (/ca-east|recombee|client-rapi/i.test(windowText)) {
        const quote = /['"]([A-Za-z0-9_-]{20,140})['"]/g;
        let match;
        while ((match = quote.exec(windowText))) add(match[1], 20);
      }
      windows++;
      pos = source.indexOf("spicychat-prod", pos + 1);
    }
    return scored;
  }

  function collectRecombeeTokensFromGlobals(scored = new Map()) {
    const seen = new WeakSet();
    const visit = (value, depth = 0, hint = "") => {
      if (!value || typeof value !== "object" || depth > 2 || seen.has(value)) return;
      seen.add(value);
      let databaseId = "";
      let publicToken = "";
      try {
        databaseId = clean(value.databaseId || value.databaseID || value.dbId);
        publicToken = clean(value.publicToken || value.public_token || value.token);
      } catch {}
      if (databaseId === "spicychat-prod") {
        const token = plausibleRecombeeToken(publicToken);
        if (token) scored.set(token, Math.max(140, Number(scored.get(token) || 0)));
      }
      if (depth >= 2) return;
      let entries = [];
      try { entries = Object.entries(value).slice(0, 80); } catch { return; }
      for (const [key, child] of entries) {
        if (!/recombee|recommend|rapi|client|spicy/i.test(`${hint} ${key}`)) continue;
        visit(child, depth + 1, key);
      }
    };
    try {
      for (const key of Object.getOwnPropertyNames(window).filter(key => /recombee|recommend|rapi/i.test(key)).slice(0, 80)) {
        let value;
        try { value = window[key]; } catch { continue; }
        visit(value, 0, key);
      }
    } catch {}
    return scored;
  }

  async function discoverRecombeeTokenCandidates() {
    if (recombeePublicToken) return [recombeePublicToken];
    const cacheAge = Date.now() - Number(recombeeTokenCandidatesCachedAt || 0);
    const cacheTtl = recombeeTokenCandidatesCache.length ? RECOMBEE_TOKEN_CACHE_MS : RECOMBEE_TOKEN_EMPTY_CACHE_MS;
    if (recombeeTokenCandidatesCachedAt && cacheAge >= 0 && cacheAge < cacheTtl) {
      return [...recombeeTokenCandidatesCache];
    }
    if (recombeeTokenCandidatesPromise) return recombeeTokenCandidatesPromise;
    recombeeTokenCandidatesPromise = (async () => {
      const scored = collectRecombeeTokensFromGlobals(new Map());
      try {
        Array.from(document.scripts || []).forEach(script => {
          if (!script.src && String(script.textContent || "").includes("spicychat-prod")) {
            collectRecombeeTokensFromText(script.textContent, scored);
          }
        });
      } catch {}
      if ([...scored.values()].some(score => score >= 100)) {
        const found = [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([token]) => token).slice(0, 20);
        recombeeTokenCandidatesCache = found;
        recombeeTokenCandidatesCachedAt = Date.now();
        return [...found];
      }

      const urls = [];
      const addUrl = raw => {
        try {
          const url = new URL(raw, location.href);
          if (url.origin !== location.origin || !/\.js(?:$|\?)/i.test(url.href)) return;
          if (!urls.includes(url.href)) urls.push(url.href);
        } catch {}
      };
      try { Array.from(document.scripts || []).forEach(script => addUrl(script.src)); } catch {}
      try {
        performance.getEntriesByType("resource")
          .filter(entry => entry.initiatorType === "script")
          .forEach(entry => addUrl(entry.name));
      } catch {}

      // Recombee's browser token is public and bundled into SpicyChat's own
      // same-origin app code. Prefer the main app bundles and read a few cached
      // bundles in parallel. The worker normally waits for Home's first native
      // signed recommendation request before reaching this point, so these
      // files should already be in the browser cache instead of competing with
      // SpicyChat's initial page boot.
      const bundlePriority = raw => {
        const value = String(raw || "");
        if (/\/assets\/index-[^/]+\.js(?:$|\?)/i.test(value)) return 0;
        if (/\/assets\/common-[^/]+\.js(?:$|\?)/i.test(value)) return 1;
        if (/\/assets\/vendor-[^/]+\.js(?:$|\?)/i.test(value)) return 2;
        if (/\/assets\//i.test(value)) return 3;
        return 4;
      };
      const prioritized = urls.slice(0, 36).sort((a, b) => bundlePriority(a) - bundlePriority(b));
      const batchSize = 4;
      for (let offset = 0; offset < prioritized.length; offset += batchSize) {
        const batch = prioritized.slice(offset, offset + batchSize);
        const texts = await Promise.all(batch.map(async url => {
          try {
            const response = await nativeFetch(url, { credentials: "same-origin", cache: "force-cache" });
            if (!response.ok) return "";
            return await response.text();
          } catch {
            return "";
          }
        }));
        for (const text of texts) {
          if (text.includes("spicychat-prod")) collectRecombeeTokensFromText(text, scored);
        }
        if ([...scored.values()].some(score => score >= 100)) break;
      }
      const found = [...scored.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([token]) => token)
        .slice(0, 20);
      recombeeTokenCandidatesCache = found;
      recombeeTokenCandidatesCachedAt = Date.now();
      return [...found];
    })().finally(() => { recombeeTokenCandidatesPromise = null; });
    return recombeeTokenCandidatesPromise;
  }

  async function hmacSha1Hex(keyText, message) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(keyText),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function identifyRecombeeTokenFromSignedRequests(candidates) {
    const tokens = [...new Set((candidates || []).map(plausibleRecombeeToken).filter(Boolean))];
    if (!tokens.length) return "";
    collectPerformanceRecombeeSamples();
    const samples = recombeeSignedRequestSamples.slice(0, RECOMBEE_SIGNED_SAMPLE_LIMIT);
    if (!samples.length) return "";

    for (const sample of samples) {
      for (const token of tokens) {
        try {
          const signature = await hmacSha1Hex(token, sample.message);
          if (signature.toLowerCase() === sample.signature) {
            recombeePublicToken = token;
            recombeeTokenCandidatesCache = [token, ...recombeeTokenCandidatesCache.filter(value => value !== token)];
            recombeeTokenCandidatesCachedAt = Date.now();
            return token;
          }
        } catch {}
      }
    }
    return "";
  }

  async function waitForCharacterAuth(timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isJwt(capturedToken) || isGuest(capturedGuest)) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return isJwt(capturedToken) || isGuest(capturedGuest);
  }

  async function checkCharacterAccessible(botId) {
    const hasAuth = await waitForCharacterAuth(5000);
    if (!hasAuth) {
      return {
        ok: false,
        status: "character-auth-not-ready",
        stage: "availability-preflight",
        reason: "This SpicyChat page has not exposed usable character API auth yet.",
        httpStatus: 0,
        availabilityNetworkAttempts: 0,
        availabilityConfirmed: false
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const headers = { Accept: "application/json", "x-app-id": "spicychat" };
      if (isJwt(capturedToken) && capturedToken.length < MAX_TOKEN) headers.Authorization = `Bearer ${capturedToken}`;
      if (isGuest(capturedGuest)) headers["x-guest-userid"] = capturedGuest;
      const response = await nativeFetch(`${API_BASE}${encodeURIComponent(botId)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers,
        signal: controller.signal
      });
      const httpStatus = Number(response?.status || 0);
      const retryAfterMs = responseRetryAfterMs(response);

      if (httpStatus === 404 || httpStatus === 410) {
        return {
          ok: false,
          status: "bot-not-found",
          stage: "availability-preflight",
          reason: `SpicyChat character API returned HTTP ${httpStatus}.`,
          httpStatus,
          availabilityNetworkAttempts: 1,
          availabilityConfirmed: true
        };
      }
      if (httpStatus === 401) {
        if (headers.Authorization) {
          capturedToken = "";
          capturedAt = 0;
          exposeCapturedAuthState();
        }
        return {
          ok: false,
          status: "character-auth-rejected",
          stage: "availability-preflight",
          reason: "SpicyChat rejected this page's current character API authentication (HTTP 401).",
          httpStatus,
          availabilityNetworkAttempts: 1,
          availabilityConfirmed: false
        };
      }
      if (httpStatus === 403) {
        return {
          ok: false,
          status: "character-restricted",
          stage: "availability-preflight",
          reason: "SpicyChat says this character is not accessible to the current account (HTTP 403).",
          httpStatus,
          availabilityNetworkAttempts: 1,
          availabilityConfirmed: false
        };
      }
      if (httpStatus === 429) {
        return {
          ok: false,
          status: "character-rate-limited",
          stage: "availability-preflight",
          reason: "SpicyChat rate-limited the character availability check.",
          httpStatus,
          availabilityNetworkAttempts: 1,
          availabilityConfirmed: false,
          retryable: true,
          retryAfterMs,
          throttleSignal: "429"
        };
      }
      if (!response?.ok) {
        const retryable = httpStatus >= 500 && httpStatus <= 599;
        return {
          ok: false,
          status: "character-api-failed",
          stage: "availability-preflight",
          reason: `SpicyChat character API returned HTTP ${httpStatus || "unknown"}.`,
          httpStatus,
          availabilityNetworkAttempts: 1,
          availabilityConfirmed: false,
          retryable,
          retryAfterMs,
          throttleSignal: retryable ? "5xx" : ""
        };
      }

      let data = null;
      try { data = await response.json(); } catch {}
      if (!data || typeof data !== "object") {
        return {
          ok: false,
          status: "character-api-invalid-response",
          stage: "availability-preflight",
          reason: "SpicyChat character API returned no readable character data.",
          httpStatus,
          availabilityNetworkAttempts: 1,
          availabilityConfirmed: false
        };
      }

      return {
        ok: true,
        status: "available",
        stage: "availability-preflight",
        reason: "SpicyChat character API confirmed the bot is still accessible.",
        httpStatus,
        availabilityNetworkAttempts: 1,
        availabilityConfirmed: true
      };
    } catch (error) {
      return {
        ok: false,
        status: error?.name === "AbortError" ? "character-api-timeout" : "character-api-network-failure",
        stage: "availability-preflight",
        reason: clean(error?.message || error || "Character availability request failed."),
        httpStatus: 0,
        availabilityNetworkAttempts: 1,
        availabilityConfirmed: false,
        retryable: true,
        retryAfterMs: 0,
        throttleSignal: error?.name === "AbortError" ? "timeout" : "network"
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function recommendationWorkerReadiness(preferredToken = "") {
    collectPerformanceRecombeeSamples();
    const authReady = isJwt(capturedToken) || isGuest(capturedGuest);
    const userId = currentRecombeeUserId();
    const preferred = plausibleRecombeeToken(preferredToken);
    const signedSamples = recombeeSignedRequestSamples.length;
    const bootAgeMs = Math.max(0, Date.now() - recommendationWorkerBootAt);

    // A token supplied by the isolated-world cache came from a previous
    // successful Less Like transaction, so it is already safe to reuse. Do not
    // rescan SpicyChat bundles just to re-prove it on every worker boot.
    if (!recombeePublicToken && preferred) recombeePublicToken = preferred;

    let candidates = [...new Set([
      recombeePublicToken,
      preferred,
      ...recombeeTokenCandidatesCache
    ].map(plausibleRecombeeToken).filter(Boolean))];

    // The old worker started bundle discovery immediately after opening Home.
    // On a cold page that competed with SpicyChat's own boot and could take
    // ~20 seconds, eventually triggering an unnecessary full-page reload. Home
    // naturally makes a signed Recombee recommendation request once its native
    // client is ready. Wait for that signal first, then inspect already-cached
    // bundles and verify the correct token OFFLINE against the native signature.
    // If Home never makes such a request, fall back after a short grace period.
    const shouldDiscover = !recombeePublicToken && (
      signedSamples > 0 ||
      bootAgeMs >= RECOMBEE_DISCOVERY_FALLBACK_MS
    );

    if (shouldDiscover) {
      try {
        const discovered = await discoverRecombeeTokenCandidates();
        candidates = [...new Set([...candidates, ...discovered].map(plausibleRecombeeToken).filter(Boolean))];
      } catch {}
    }

    if (!recombeePublicToken && candidates.length && signedSamples) {
      try { await identifyRecombeeTokenFromSignedRequests(candidates); } catch {}
    }

    const validatedTokenReady = !!plausibleRecombeeToken(recombeePublicToken);
    const candidateTokens = [...new Set(candidates.filter(plausibleRecombeeToken))];
    const waitingForNativeSample = !validatedTokenReady && !signedSamples && bootAgeMs < RECOMBEE_DISCOVERY_FALLBACK_MS;
    // If Home has already produced a native signed Recombee request, do not
    // knowingly probe unverified candidates against the ratings endpoint. The
    // native signature gives us an offline oracle; wait for a matching token.
    // Network candidate probing remains only as the fallback for pages where
    // Home never emits a signed recommendation request at all.
    const recombeeReady = validatedTokenReady || (!signedSamples && !waitingForNativeSample && candidateTokens.length > 0);
    const ready = authReady && !!userId && recombeeReady;
    return {
      ok: ready,
      ready,
      status: ready
        ? "recommendation-worker-ready"
        : (waitingForNativeSample ? "recommendation-worker-waiting-native-signature" : "recommendation-worker-waiting"),
      bridgeReady: true,
      authReady,
      userReady: !!userId,
      recombeeReady,
      recombeeValidated: validatedTokenReady,
      candidateTokenCount: candidateTokens.length,
      nativeSignedSamples: signedSamples,
      workerBootAgeMs: bootAgeMs,
      tokenSource: validatedTokenReady
        ? (signedSamples ? "native-signed-request" : "cached-success-token")
        : (candidateTokens.length ? "bundle-candidates" : ""),
      publicToken: validatedTokenReady ? recombeePublicToken : ""
    };
  }

  async function postRecombeeLessLike(botId, userId, preferredToken = "") {
    const preferred = plausibleRecombeeToken(preferredToken);
    let discovered = [];
    let discoveredFallbackLoaded = false;

    // A token learned from an earlier success is the cheapest path. Do not
    // rescan SpicyChat's bundles before trying a token we already know worked.
    if (!recombeePublicToken && !preferred) {
      discovered = await discoverRecombeeTokenCandidates();
      discoveredFallbackLoaded = true;
    }

    let initial = [...new Set([recombeePublicToken, preferred, ...discovered].filter(Boolean))];
    if (!initial.length) {
      discovered = await discoverRecombeeTokenCandidates();
      discoveredFallbackLoaded = true;
      initial = [...new Set(discovered.filter(Boolean))];
    }
    if (!initial.length) {
      return {
        ok: false,
        status: "recombee-token-not-found",
        stage: "token-discovery",
        reason: "No SpicyChat Recombee public-token candidate was found.",
        characterId: botId,
        httpStatus: 0,
        attempts: 0,
        networkAttempts: 0,
        requestSent: false
      };
    }

    // If SpicyChat already made any signed Recombee request on this page, use
    // its valid signature as an offline oracle to identify the correct public
    // token. This avoids probing candidates against the network at all.
    let observedToken = await identifyRecombeeTokenFromSignedRequests(initial);
    let ordered = [...new Set([observedToken, recombeePublicToken, preferred, ...initial].filter(Boolean))];
    let lastStatus = 0;
    let lastReason = "";
    let attempts = 0;
    let networkAttempts = 0;
    let index = 0;

    while (index < ordered.length || !discoveredFallbackLoaded) {
      if (index >= ordered.length && !discoveredFallbackLoaded) {
        discovered = await discoverRecombeeTokenCandidates();
        discoveredFallbackLoaded = true;
        if (!observedToken) observedToken = await identifyRecombeeTokenFromSignedRequests(discovered);
        ordered = [...new Set([...ordered, observedToken, ...discovered].filter(Boolean))].slice(0, 12);
        if (index >= ordered.length) break;
      }

      const token = ordered[index++];
      if (!token || attempts >= 12) break;
      attempts++;
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPath = `/spicychat-prod/ratings/?frontend_timestamp=${timestamp}`;
      let signature = "";
      try {
        signature = await hmacSha1Hex(token, signedPath);
      } catch {
        return {
          ok: false,
          status: "recombee-signing-unavailable",
          stage: "signing",
          reason: "Browser HMAC-SHA1 signing was unavailable.",
          characterId: botId,
          httpStatus: 0,
          attempts,
          networkAttempts,
          requestSent: networkAttempts > 0
        };
      }

      const url = `https://client-rapi-ca-east.recombee.com${signedPath}&frontend_sign=${signature}`;
      try {
        networkAttempts++;
        const response = await nativeFetch(url, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ userId, itemId: botId, rating: -1, cascadeCreate: true })
        });
        lastStatus = Number(response.status || 0);

        if (response.ok) {
          recombeePublicToken = token;
          recombeeTokenCandidatesCache = [token, ...recombeeTokenCandidatesCache.filter(value => value !== token)];
          recombeeTokenCandidatesCachedAt = Date.now();
          return {
            ok: true,
            status: "less-liked",
            stage: "response",
            reason: "Matching Recombee rating request returned 2xx.",
            characterId: botId,
            httpStatus: lastStatus,
            attempts,
            networkAttempts,
            requestSent: true,
            publicToken: token,
            tokenSource: token === observedToken ? "observed-native-signature" : (token === preferred ? "cached-extension-token" : "bundle-candidate")
          };
        }

        let responseText = "";
        try { responseText = String(await response.text()); } catch {}
        lastReason = responseText.slice(0, 300);
        const retryAfterMs = responseRetryAfterMs(response);

        if (lastStatus === 429) {
          return {
            ok: false,
            status: "recombee-rate-limited",
            stage: "response",
            reason: lastReason || "Recombee rate-limited the rating request.",
            characterId: botId,
            httpStatus: lastStatus,
            attempts,
            networkAttempts,
            requestSent: true,
            retryable: true,
            retryAfterMs,
            throttleSignal: "429"
          };
        }

        if (lastStatus >= 500 && lastStatus <= 599) {
          return {
            ok: false,
            status: "recombee-server-error",
            stage: "response",
            reason: lastReason || `Recombee returned HTTP ${lastStatus}.`,
            characterId: botId,
            httpStatus: lastStatus,
            attempts,
            networkAttempts,
            requestSent: true,
            retryable: true,
            retryAfterMs,
            throttleSignal: "5xx"
          };
        }

        const unavailable =
          [404, 410].includes(lastStatus) ||
          /(?:item|character).{0,40}(?:not found|does not exist|unknown)|not found.{0,40}(?:item|character)/i.test(responseText);

        if (unavailable) {
          return {
            ok: false,
            status: "bot-not-found",
            stage: "response",
            reason: lastReason || `Recombee returned HTTP ${lastStatus} for this character ID.`,
            characterId: botId,
            httpStatus: lastStatus,
            attempts,
            networkAttempts,
            requestSent: true
          };
        }

        if (token === recombeePublicToken) recombeePublicToken = "";
      } catch (error) {
        lastReason = String(error?.message || error || "").slice(0, 300);
        // A transport failure says nothing about token validity. Keep the
        // already-validated token cached for a later explicit/manual retry.
        // Once a ratings POST may have left the browser, a fetch exception is
        // ambiguous: retrying with another token could create duplicate -1
        // ratings. Record the failure and let the user explicitly retry it.
        return {
          ok: false,
          status: "recombee-network-error",
          stage: "request",
          reason: lastReason || "The Recombee rating request failed after it may have been sent.",
          characterId: botId,
          httpStatus: 0,
          attempts,
          networkAttempts,
          requestSent: true,
          retryable: false,
          retryAfterMs: 0,
          throttleSignal: "network",
          networkAmbiguous: true
        };
      }
    }

    return {
      ok: false,
      status: "recombee-request-failed",
      stage: "request",
      reason: lastReason || "No signed Less Like request completed successfully.",
      characterId: botId,
      httpStatus: lastStatus,
      attempts,
      networkAttempts,
      requestSent: networkAttempts > 0
    };
  }

  window.addEventListener(RECOMMENDATION_WORKER_PROBE_REQUEST_EVENT, event => {
    const detail = event?.detail || {};
    const requestId = clean(detail.requestId);
    recommendationWorkerReadiness(detail.preferredRecombeeToken).then(result => {
      try {
        window.dispatchEvent(new CustomEvent(RECOMMENDATION_WORKER_PROBE_RESPONSE_EVENT, {
          detail: { requestId, ...result }
        }));
      } catch {}
    }).catch(error => {
      try {
        window.dispatchEvent(new CustomEvent(RECOMMENDATION_WORKER_PROBE_RESPONSE_EVENT, {
          detail: {
            requestId, ok: false, ready: false, status: "recommendation-worker-probe-error",
            reason: clean(error?.message || error)
          }
        }));
      } catch {}
    });
  });

  window.addEventListener(FEEDBACK_REQUEST_EVENT, async event => {
    const detail = event?.detail || {};
    if (!active) return;
    const requestId = clean(detail.requestId);
    const botId = clean(detail.botId).toLowerCase();
    const mode = clean(detail.mode).toLowerCase();
    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(botId) || mode !== "less-like") return;

    const started = Date.now();
    let coalesced = false;
    let work = recombeeFeedbackInFlight.get(botId) || null;
    if (work) {
      coalesced = true;
    } else {
      work = (async () => {
        const availabilityStartedAt = Date.now();
        const availability = await checkCharacterAccessible(botId);
        const availabilityMs = Math.max(0, Date.now() - availabilityStartedAt);
        if (!availability?.ok) {
          return {
            ...availability,
            characterId: botId,
            attempts: 0,
            networkAttempts: 0,
            requestSent: false,
            availabilityMs,
            availabilityHttpStatus: Number(availability?.httpStatus || 0),
            userLookupMs: 0,
            ratingMs: 0,
            ratingHttpStatus: 0
          };
        }

        const userLookupStartedAt = Date.now();
        const userId = currentRecombeeUserId();
        const userLookupMs = Math.max(0, Date.now() - userLookupStartedAt);
        if (!userId) {
          return {
            ok: false,
            status: "recombee-user-not-found",
            stage: "user-discovery",
            reason: "No SpicyChat/Recombee user ID was available in this page context.",
            httpStatus: availability.httpStatus || 0,
            attempts: 0,
            networkAttempts: 0,
            availabilityNetworkAttempts: Number(availability.availabilityNetworkAttempts || 0),
            availabilityConfirmed: true,
            requestSent: false,
            characterId: botId,
            availabilityMs,
            availabilityHttpStatus: Number(availability?.httpStatus || 0),
            userLookupMs,
            ratingMs: 0,
            ratingHttpStatus: 0
          };
        }
        const ratingStartedAt = Date.now();
        const result = await postRecombeeLessLike(botId, userId, detail.preferredRecombeeToken);
        const ratingMs = Math.max(0, Date.now() - ratingStartedAt);
        return {
          ...result,
          availabilityNetworkAttempts: Number(availability.availabilityNetworkAttempts || 0),
          availabilityConfirmed: true,
          availabilityMs,
          availabilityHttpStatus: Number(availability?.httpStatus || 0),
          userLookupMs,
          ratingMs,
          ratingHttpStatus: Number(result?.httpStatus || 0)
        };
      })();
      recombeeFeedbackInFlight.set(botId, work);
    }

    let result;
    try {
      result = await work;
    } finally {
      if (!coalesced && recombeeFeedbackInFlight.get(botId) === work) recombeeFeedbackInFlight.delete(botId);
    }

    feedbackSend({
      requestId,
      ok: !!result?.ok,
      status: result?.status || "recombee-request-failed",
      mode,
      botId,
      httpStatus: Number(result?.httpStatus || 0),
      tokenAttempts: Number(result?.attempts || 0),
      networkAttempts: Number(result?.networkAttempts || 0),
      requestSent: !!result?.requestSent,
      availabilityNetworkAttempts: Number(result?.availabilityNetworkAttempts || 0),
      availabilityConfirmed: !!result?.availabilityConfirmed,
      stage: clean(result?.stage || ""),
      reason: clean(result?.reason || ""),
      characterId: clean(result?.characterId || botId),
      publicToken: plausibleRecombeeToken(result?.publicToken || ""),
      tokenSource: clean(result?.tokenSource || ""),
      availabilityMs: Number(result?.availabilityMs || 0),
      availabilityHttpStatus: Number(result?.availabilityHttpStatus || 0),
      userLookupMs: Number(result?.userLookupMs || 0),
      ratingMs: Number(result?.ratingMs || 0),
      ratingHttpStatus: Number(result?.ratingHttpStatus || 0),
      retryable: !!result?.retryable,
      retryAfterMs: Math.max(0, Number(result?.retryAfterMs || 0) || 0),
      throttleSignal: clean(result?.throttleSignal || ""),
      networkAmbiguous: !!result?.networkAmbiguous,
      elapsedMs: Date.now() - started,
      coalesced,
      executor: "direct-recombee-api"
    });
  });

  try {
    exposeCapturedAuthState();
    setRootAttribute("data-ds-chat-history-main-seq", String(nativeHistoryRequestSeq));
    setRootAttribute("data-ds-chat-history-main-response-seq", String(nativeHistoryResponseSeq));
    setRootAttribute("data-ds-chat-history-main-response-request-seq", "0");
    setRootAttribute("data-ds-chat-history-main-response-status", "0");
    setRootAttribute("data-ds-chat-history-main-response-at", "0");
    setRootAttribute("data-ds-chat-history-main-response-ms", "0");
    setRootAttribute("data-ds-chat-history-main-successes", String(nativeHistorySuccesses));
    setRootAttribute("data-ds-chat-history-main-auth-401s", String(nativeHistoryAuth401s));
    setRootAttribute("data-ds-card-token-main-bridge", "2");
    window.dispatchEvent(new CustomEvent("ds-qol-card-token-bridge-ready-v2", {
      detail: { capturedAuth: !!capturedToken, capturedAt }
    }));
  } catch {}
})();
