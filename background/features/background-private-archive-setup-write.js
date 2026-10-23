'use strict';
// Opt-in private Archive setup: two fixed writes, authorized from the user's
// Lorebook creation tab. The site XHR bridge can fail at CORS/preflight before
// returning an HTTP status; the extension origin has prod.nd-api.com permission.
// Never store, log, or return the short-lived Firebase token.
(() => {
  const TYPE = 'DS_PRIVATE_ARCHIVE_SETUP_WRITE';
  const KEY = 'dsQolPrivateArchiveSetupV1';
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const busy = new Set();
  const storedJob = () => new Promise(resolve => chrome.storage.local.get(KEY, r => resolve(chrome.runtime.lastError ? null : r?.[KEY] || null)));
  function validToken(value) {
    if (typeof value !== 'string' || value.length > 12000 || !JWT.test(value)) return false;
    try {
      const body = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(atob(body.padEnd(Math.ceil(body.length / 4) * 4, '=')));
      return Number(json.exp || 0) * 1000 > Date.now() + 30000;
    } catch { return false; }
  }
  function validPayload(path, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (path === '/save-image') return Object.keys(value).length === 2 &&
      value.image_type === 'image/png' && value.hash === '1cb2bc293cab0f4bc7bf203e3829aee7';
    if (path === '/lorebooks') return Object.keys(value).length === 5 &&
      value.name === 'SpicyChat QoL Archive' &&
      typeof value.description === 'string' && value.description.length <= 100 &&
      value.visibility === 'private' && Array.isArray(value.tags) && value.tags.length === 0 &&
      typeof value.avatar_url === 'string' &&
      /^avatars\/[a-z0-9._/-]{1,250}\.(?:png|jpg|jpeg|webp)$/i.test(value.avatar_url) &&
      !value.avatar_url.includes('..');
    return false;
  }
  dsqRegisterBackgroundMessageHandler(TYPE, 'private-lorebook-bridge', (message, sender, respond) => {
    const page = String(sender?.url || sender?.tab?.url || '');
    let tokenFromUrl = '';
    try {
      const url = new URL(page);
      if (url.protocol === 'https:' && (url.hostname === 'spicychat.ai' || url.hostname === 'www.spicychat.ai') &&
        url.pathname === '/lorebook/create') tokenFromUrl = url.searchParams.get('dsQolArchiveSetup') || '';
    } catch {}
    const path = String(message?.path || '');
    const method = String(message?.method || '');
    const authToken = message?.authToken;
    if (!sender?.tab?.id || !UUID.test(tokenFromUrl) || method !== 'POST' ||
      !['/save-image', '/lorebooks'].includes(path) || !validPayload(path, message?.payload) ||
      !validToken(authToken) || tokenFromUrl !== message?.setupToken) {
      respond({ok:false,status:'blocked'}); return false;
    }
    if (busy.has(tokenFromUrl)) { respond({ok:false,status:'already-running'}); return false; }
    busy.add(tokenFromUrl);
    (async () => {
      const job = await storedJob();
      const expectedStatus = path === '/save-image' ? 'preparing' : 'submitting';
      if (job?.token !== tokenFromUrl || job?.status !== expectedStatus ||
        Date.now() - Number(job.createdAt || 0) > 5 * 60 * 1000) return {ok:false,status:'setup-expired-or-changed'};
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 16000);
      try {
        const headers = {
          Accept: 'application/json, text/plain, */*',
          Authorization: 'Bearer ' + authToken,
          'Content-Type': 'application/json',
          'x-app-id': 'spicychat', 'x-platform': 'WEB', 'x-platform-os': 'DESKTOP',
        };
        const version = String(message?.appVersion || '');
        if (/^[\w.\-]{1,32}$/.test(version)) headers['x-app-version'] = version;
        const response = await fetch('https://prod.nd-api.com' + path, {
          method: 'POST', credentials: 'include', cache: 'no-store', headers,
          body: JSON.stringify(message.payload), signal: ctl.signal,
        });
        if (!response.ok) return {ok:false,status:'http',httpStatus:response.status};
        const data = await response.json().catch(() => null);
        if (!data || typeof data !== 'object') return {ok:false,status:'invalid-response',httpStatus:response.status};
        return {ok:true,status:'success',httpStatus:response.status,data};
      } catch (e) {
        return {ok:false,status:e?.name === 'AbortError' ? 'timeout' : 'background-network-error'};
      } finally {clearTimeout(timer);}
    })().then(respond).catch(() => respond({ok:false,status:'internal-error'})).finally(() => busy.delete(tokenFromUrl));
    return true;
  });
})();
