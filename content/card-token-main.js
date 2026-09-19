(() => {
  "use strict";

  if (window.__dsCardTokenMainBridgeV1) return;
  window.__dsCardTokenMainBridgeV1 = true;

  const REQUEST_EVENT = "ds-qol-card-token-request-v2";
  const RESPONSE_EVENT = "ds-qol-card-token-response-v2";
  const CONTROL_EVENT = "ds-qol-card-token-bridge-control-v1";
  const API_BASE = "https://prod.nd-api.com/v2/characters/";
  const API_HOST = "prod.nd-api.com";
  const MAX_TOKEN = 12000;
  const TIMEOUT_MS = 7000;

  let capturedToken = "";
  let capturedGuest = "";
  let capturedAt = 0;

  const clean = value => String(value || "").trim();
  const isJwt = value => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clean(value));
  const isGuest = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean(value));

  function exposeCapturedAuthState() {
    try { document.documentElement?.setAttribute("data-ds-card-token-main-auth", isJwt(capturedToken) ? "1" : "0"); } catch {}
  }

  function urlIsApi(input) {
    try {
      const url = new URL(typeof input === "string" ? input : input?.url || "", location.href);
      return url.hostname === API_HOST;
    } catch {
      return false;
    }
  }

  function rememberHeader(name, value) {
    const key = clean(name).toLowerCase();
    const raw = clean(value);
    if (key === "authorization") {
      const token = raw.replace(/^bearer\s+/i, "").trim();
      if (token && token.length < MAX_TOKEN && isJwt(token)) {
        capturedToken = token;
        capturedAt = Date.now();
        exposeCapturedAuthState();
      }
    } else if (key === "x-guest-userid" && isGuest(raw)) {
      capturedGuest = raw;
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
  let active = true;
  let hooksInstalled = false;

  function observedFetch(input, init) {
    try {
      if (active && urlIsApi(input)) {
        scanHeaders(input instanceof Request ? input.headers : null);
        scanHeaders(init?.headers);
      }
    } catch {}
    return nativeFetch(input, init);
  }

  function observedOpen(method, url, ...rest) {
    try { this.__dsCardTokenApi = active && urlIsApi(url); } catch { this.__dsCardTokenApi = false; }
    return nativeOpen.call(this, method, url, ...rest);
  }

  function observedSetRequestHeader(name, value) {
    try { if (active && this.__dsCardTokenApi) rememberHeader(name, value); } catch {}
    return nativeSetRequestHeader.call(this, name, value);
  }

  function installHooks() {
    if (hooksInstalled || !active) return;
    if (nativeFetch && window.fetch === nativeFetchRaw) window.fetch = observedFetch;
    if (XHR?.prototype && nativeOpen && nativeSetRequestHeader) {
      if (XHR.prototype.open === nativeOpen) XHR.prototype.open = observedOpen;
      if (XHR.prototype.setRequestHeader === nativeSetRequestHeader) XHR.prototype.setRequestHeader = observedSetRequestHeader;
    }
    hooksInstalled = true;
  }

  function uninstallHooks() {
    if (!hooksInstalled) return;
    if (window.fetch === observedFetch && nativeFetchRaw) window.fetch = nativeFetchRaw;
    if (XHR?.prototype) {
      if (XHR.prototype.open === observedOpen && nativeOpen) XHR.prototype.open = nativeOpen;
      if (XHR.prototype.setRequestHeader === observedSetRequestHeader && nativeSetRequestHeader) XHR.prototype.setRequestHeader = nativeSetRequestHeader;
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

  try {
    exposeCapturedAuthState();
    document.documentElement?.setAttribute("data-ds-card-token-main-bridge", "2");
    window.dispatchEvent(new CustomEvent("ds-qol-card-token-bridge-ready-v2", {
      detail: { capturedAuth: !!capturedToken, capturedAt }
    }));
  } catch {}
})();
