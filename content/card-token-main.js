(() => {
  "use strict";

  if (window.__dsCardTokenMainBridgeV1) return;
  window.__dsCardTokenMainBridgeV1 = true;
  // Chrome/Brave loads this file directly in MAIN world at document_start.
  // Expose readiness immediately so the isolated-world loader does not race the
  // site's first authenticated history request or inject a redundant copy.
  try { document.documentElement?.setAttribute("data-ds-card-token-main-bridge", "2"); } catch {}

  const REQUEST_EVENT = "ds-qol-card-token-request-v2";
  const RESPONSE_EVENT = "ds-qol-card-token-response-v2";
  const HISTORY_REQUEST_EVENT = "ds-qol-chat-history-request-v1";
  const HISTORY_RESPONSE_EVENT = "ds-qol-chat-history-response-v1";
  const HISTORY_NATIVE_REQUEST_EVENT = "ds-qol-chat-history-native-request-v1";
  const HISTORY_NATIVE_RESPONSE_EVENT = "ds-qol-chat-history-native-response-v1";
  const CONTROL_EVENT = "ds-qol-card-token-bridge-control-v1";
  const API_BASE = "https://prod.nd-api.com/v2/characters/";
  const MESSAGE_API_BASE = "https://prod.nd-api.com/characters/";
  const API_HOST = "prod.nd-api.com";
  const MAX_TOKEN = 12000;
  const TIMEOUT_MS = 7000;

  let capturedToken = "";
  let capturedGuest = "";
  let capturedAt = 0;
  let nativeHistoryRequestSeq = 0;
  let nativeHistoryResponseSeq = 0;
  let nativeHistorySuccesses = 0;
  let nativeHistoryAuth401s = 0;

  const clean = value => String(value || "").trim();
  const isJwt = value => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clean(value));
  const isGuest = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean(value));

  function exposeCapturedAuthState() {
    try {
      document.documentElement?.setAttribute("data-ds-card-token-main-auth", isJwt(capturedToken) ? "1" : "0");
      document.documentElement?.setAttribute("data-ds-card-token-main-guest", isGuest(capturedGuest) ? "1" : "0");
      document.documentElement?.setAttribute("data-ds-card-token-main-auth-at", String(Math.max(0, Number(capturedAt || 0))));
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
      document.documentElement?.setAttribute("data-ds-chat-history-main-seq", String(nativeHistoryRequestSeq));
      document.documentElement?.setAttribute("data-ds-chat-history-main-at", String(at));
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
      document.documentElement?.setAttribute("data-ds-chat-history-main-response-seq", String(nativeHistoryResponseSeq));
      document.documentElement?.setAttribute("data-ds-chat-history-main-response-request-seq", String(requestSeq));
      document.documentElement?.setAttribute("data-ds-chat-history-main-response-status", String(httpStatus));
      document.documentElement?.setAttribute("data-ds-chat-history-main-response-at", String(at));
      document.documentElement?.setAttribute("data-ds-chat-history-main-response-ms", String(elapsedMs));
      document.documentElement?.setAttribute("data-ds-chat-history-main-successes", String(nativeHistorySuccesses));
      document.documentElement?.setAttribute("data-ds-chat-history-main-auth-401s", String(nativeHistoryAuth401s));
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
    try { document.documentElement?.setAttribute("data-ds-card-token-main-active", active ? "1" : "0"); } catch {}
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

  try {
    exposeCapturedAuthState();
    document.documentElement?.setAttribute("data-ds-chat-history-main-seq", String(nativeHistoryRequestSeq));
    document.documentElement?.setAttribute("data-ds-chat-history-main-response-seq", String(nativeHistoryResponseSeq));
    document.documentElement?.setAttribute("data-ds-chat-history-main-response-request-seq", "0");
    document.documentElement?.setAttribute("data-ds-chat-history-main-response-status", "0");
    document.documentElement?.setAttribute("data-ds-chat-history-main-response-at", "0");
    document.documentElement?.setAttribute("data-ds-chat-history-main-response-ms", "0");
    document.documentElement?.setAttribute("data-ds-chat-history-main-successes", String(nativeHistorySuccesses));
    document.documentElement?.setAttribute("data-ds-chat-history-main-auth-401s", String(nativeHistoryAuth401s));
    document.documentElement?.setAttribute("data-ds-card-token-main-bridge", "2");
    window.dispatchEvent(new CustomEvent("ds-qol-card-token-bridge-ready-v2", {
      detail: { capturedAuth: !!capturedToken, capturedAt }
    }));
  } catch {}
})();
