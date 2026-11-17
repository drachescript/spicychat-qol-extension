'use strict';
// Explicitly started, read-only research export. Independent of DS_NATIVE_MEMORY_PROBE:
// the probe continues to return counts only and never exposes Memory text/IDs.
(() => {
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const enabled = async () => {
    const values = await chrome.storage.local.get(['settings', 'dsSettingV1:enabled', 'dsSettingV1:showBulkChatResearchExport']);
    return (values['dsSettingV1:enabled'] ?? values.settings?.enabled) !== false &&
      (values['dsSettingV1:showBulkChatResearchExport'] ?? values.settings?.showBulkChatResearchExport) === true;
  };
  const safeSender = sender => {
    try {
      const u = new URL(sender?.url || sender?.tab?.url || '');
      return u.protocol === 'https:' && /^(?:www\.)?spicychat\.ai$/.test(u.hostname) &&
        u.pathname === '/chats' && u.searchParams.get('ds-research-export') === '1';
    } catch { return false; }
  };
  function memoryRows(json) {
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.memories)) return json.memories;
    if (Array.isArray(json?.data?.memories)) return json.data.memories;
    if (Array.isArray(json?.data)) return json.data;
    return null;
  }
  const inFlight = new Set();
  dsqRegisterBackgroundMessageHandler('DS_RESEARCH_MEMORY_READ', 'bulk-chat-research', (message, sender, respond) => {
    const conversationId = String(message?.conversationId || '').toLowerCase();
    const token = String(message?.authToken || '');
    if (!safeSender(sender) || !UUID.test(conversationId) || !JWT.test(token) || token.length > 12000 ||
        !/^[a-zA-Z0-9_-]{12,90}$/.test(String(message?.runId || ''))) {
      respond({ ok: false, status: 'invalid-request' });
      return false;
    }
    if (inFlight.has(conversationId)) { respond({ ok: false, status: 'already-reading' }); return false; }
    inFlight.add(conversationId);
    (async () => {
      if (!await enabled()) return { ok: false, status: 'not-enabled' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const headers = {
          Authorization: `Bearer ${token}`, Accept: 'application/json',
          'x-app-id': 'spicychat', 'x-platform': 'WEB', 'x-platform-os': 'DESKTOP'
        };
        const response = await fetch(`https://prod.nd-api.com/conversations/${conversationId}/memories`, {
          method: 'GET', headers, credentials: 'include', cache: 'no-store', signal: controller.signal
        });
        if (!response.ok) return { ok: false, status: response.status === 401 ? 'auth-rejected' :
          response.status === 403 ? 'access-denied' : response.status === 429 ? 'rate-limited' : 'http-failed',
          httpStatus: response.status, retryAfterMs: Math.min(60000, Math.max(0, Number(response.headers.get('Retry-After')) || 0) * 1000) };
        const contentLength = Number(response.headers.get('Content-Length') || 0);
        if (contentLength > 16 * 1024 * 1024) return { ok: false, status: 'memory-response-too-large' };
        const text = await response.text();
        if (text.length > 16 * 1024 * 1024) return { ok: false, status: 'memory-response-too-large' };
        let raw; try { raw = JSON.parse(text); } catch { return { ok: false, status: 'invalid-json' }; }
        const items = memoryRows(raw);
        if (!items || items.length > 5000) return { ok: false, status: 'unexpected-memory-format' };
        return { ok: true, status: items.length ? 'ok' : 'empty', httpStatus: response.status,
          conversationId, memories: items };
      } catch (error) {
        return { ok: false, status: error?.name === 'AbortError' ? 'timeout' : 'network-error' };
      } finally { clearTimeout(timer); }
    })().then(respond, () => respond({ ok: false, status: 'request-error' }))
      .finally(() => inFlight.delete(conversationId));
    return true;
  });
  dsqRegisterBackgroundMessageHandler('DS_RESEARCH_VERIFY_DOWNLOAD', 'bulk-chat-research', (message, sender, respond) => {
    if (!safeSender(sender) || typeof chrome.downloads?.search !== 'function') {
      respond({ ok: false, status: 'download-verification-unavailable' }); return false;
    }
    const filename = String(message?.filename || '');
    const expected = Number(message?.expectedBytes);
    const after = Number(message?.after || 0);
    if (!/^spicychat-research-[a-zA-Z0-9_-]+-part-\d{3,}\.zip$/.test(filename) ||
      !(expected > 100) || expected > 300 * 1000 * 1000 || after <= 0) {
      respond({ ok: false, status: 'invalid-verification-request' }); return false;
    }
    chrome.downloads.search({ orderBy: ['-startTime'], limit: 50 }, items => {
      if (chrome.runtime.lastError) { respond({ ok: false, status: 'downloads-permission-unavailable' }); return; }
      const match = (items || []).find(item => {
        const name = String(item.filename || '').replace(/\\/g, '/').split('/').pop();
        return name === filename && Number(Date.parse(item.startTime || '')) >= after - 30000;
      });
      if (!match) { respond({ ok: false, status: 'download-not-found' }); return; }
      const written = Number(match.fileSize || match.bytesReceived || 0);
      respond({ ok: match.state === 'complete' && !match.error && written === expected,
        status: match.state === 'complete' ? (written === expected ? 'verified' : 'size-mismatch') : String(match.state || 'pending'),
        bytesWritten: written });
    });
    return true;
  });
})();
