"use strict";
// Optional background service, imported before background event registration.
function wikiOriginPattern(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol)) return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

function hasOptionalOrigin(origin) {
  return new Promise(resolve => {
    try {
      chrome.permissions.contains({ origins: [origin] }, ok => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(!!ok);
      });
    } catch { resolve(false); }
  });
}

function requestOptionalOrigin(origin) {
  return new Promise(resolve => {
    try {
      chrome.permissions.request({ origins: [origin] }, ok => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message || "Could not request site access." });
        else resolve({ ok: !!ok, error: ok ? "" : "Site access was not granted." });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
    }
  });
}

async function fetchWikiPageSource(value) {
  const origin = wikiOriginPattern(value);
  if (!origin) return { ok: false, error: "Only http:// and https:// wiki/article URLs are supported." };
  if (!await hasOptionalOrigin(origin)) return { ok: false, requiresPermission: true, origin };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(String(value), {
      method: "GET",
      redirect: "follow",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.2" }
    });
    if (!response.ok) return { ok: false, error: `Wiki page returned HTTP ${response.status}.`, status: response.status };
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if (type && !/(text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml)/i.test(type)) {
      return { ok: false, error: `That URL returned ${type.split(";")[0] || "a non-text file"}, not a wiki/article page.` };
    }
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > 5_000_000) return { ok: false, error: "That page is larger than 5 MB. Try a more specific article or paste the article text instead." };
    const html = await response.text();
    if (!html || html.length < 20) return { ok: false, error: "The page returned no readable content." };
    if (html.length > 5_000_000) return { ok: false, error: "That page is larger than 5 MB. Try a more specific article or paste the article text instead." };
    return {
      ok: true,
      html,
      finalUrl: response.url || String(value),
      contentType: type,
      status: response.status
    };
  } catch (error) {
    const message = error?.name === "AbortError" ? "Fetching that page timed out after 20 seconds." : (error?.message || String(error));
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}


