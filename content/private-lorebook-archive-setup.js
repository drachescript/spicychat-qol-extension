// v0.2.57: explicit, one-time private Archive Lorebook setup.
// Uploads the bundled QoL picture with SpicyChat's signed-upload API; then
// creates ONE private Lorebook. Never attaches the Archive to a bot.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const KEY = 'dsQolPrivateArchiveSetupV1';
  const NAME = 'SpicyChat QoL Archive';
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const queryToken = new URLSearchParams(location.search).get('dsQolArchiveSetup');
  if (queryToken && UUID.test(queryToken)) sessionStorage.setItem('dsQolArchiveSetupTokenV1', queryToken);
  const token = queryToken || sessionStorage.getItem('dsQolArchiveSetupTokenV1');
  if (!UUID.test(token || '') || location.pathname !== '/lorebook/create') return;
  let banner = null, started = false, done = false;
  function status(message) {
    if (!banner) {
      banner = document.createElement('section');
      banner.id = 'ds-qol-archive-setup-status';
      banner.setAttribute('role', 'status');
      Object.assign(banner.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483600',
        background: '#162330', color: '#ecf3ff', border: '1px solid #57708b',
        padding: '14px', borderRadius: '10px', maxWidth: '390px',
        boxShadow: '0 6px 30px #0008', fontSize: '14px',
      });
      document.body.append(banner);
    }
    banner.textContent = 'QoL Private Archive Setup — ' + message;
  }
  const read = keys => new Promise((resolve, reject) => chrome.storage.local.get(keys, result =>
    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(result || {})));
  const write = values => new Promise((resolve, reject) => chrome.storage.local.set(values, () =>
    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
  async function api(path, method = 'GET', payload) {
    const request = window.DragonScriptQoL?.privateLorebookAuth?.request;
    if (typeof request !== 'function') throw Error('Private Lorebook authentication is unavailable. No changes made.');
    return request(path, method, payload);
  }
  async function mark(job, patch) {
    await write({[KEY]: {...job, ...patch, updatedAt: Date.now()}});
  }
  async function verifyAndConfigure(id, job, accountId) {
    const book = await api('/lorebooks/' + id + '?sortBy=priority&lastSortPriority=0');
    if (!book || String(book.id || '').toLowerCase() !== id.toLowerCase() ||
      book.creator_user_id !== accountId || book.visibility !== 'private' ||
      book.name !== NAME || Number(book.numAttachedCharacters) !== 0) {
      throw Error('The Archive could not be verified as your private Lorebook, not connected to any bot. Its ID was not saved.');
    }
    const index = (await read(['dsSettingsIndexV1'])).dsSettingsIndexV1;
    const keys = new Set(Array.isArray(index) ? index : []);
    keys.add('privateLorebookArchiveId');
    await write({
      'dsSettingV1:privateLorebookArchiveId': id.toLowerCase(),
      dsSettingsIndexV1: [...keys].sort(),
      dsGranularSettingsV1: true,
      dsSettingsRevisionV1: Date.now(),
    });
    await mark(job, {status: 'complete', lorebookId: id});
    done = true;
    sessionStorage.removeItem('dsQolArchiveSetupTokenV1');
    status('Created and verified your private Archive with the QoL cover. It is not connected to any bot.');
    // Show the real saved Lorebook; no bot attachment or editor manipulation.
    setTimeout(() => { if (!window.__DSQ_TAB_GATE__?.paused) location.assign('/lorebook/edit/' + id); }, 1200);
  }
  // Keep the visible native form useful even though Archive creation uses the
  // verified API route. If the API is unavailable, the user's approved details
  // remain visible instead of an apparently untouched page.
  function setReactValue(element, value) {
    if (!element) return false;
    const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (!setter) return false;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', {bubbles:true}));
    element.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }
  async function prepareVisibleForm(job) {
    if (typeof document.querySelector !== 'function') return false;
    const until=Date.now()+8500;
    let nameField,descriptionField;
    while (Date.now()<until) {
      nameField=document.querySelector('[data-field-name="name"] input[name="name"]');
      descriptionField=document.querySelector('[data-field-name="description"] textarea[name="description"]');
      if(nameField && descriptionField) break;
      await new Promise(resolve=>setTimeout(resolve,180));
    }
    if (!nameField || !descriptionField) return false;
    setReactValue(nameField, NAME);
    setReactValue(descriptionField, String(job.description || 'Private archive for conversation history stored by SpicyChat QoL.').slice(0,100));
    const privateButton=document.querySelector('[data-testid="LorebookVisibilityField-PrivateButton"]');
    if (privateButton?.getAttribute('aria-pressed') !== 'true') privateButton?.click();
    return true;
  }
  function validateSignedUrl(raw) {
    if (typeof raw !== 'string' || raw.length > 10000) throw Error('SpicyChat did not return a valid image upload address.');
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !/(^|\.)(?:amazonaws\.com|cloudflarestorage\.com|googleapis\.com|nd-api\.com)$/.test(url.hostname)) {
      throw Error('SpicyChat returned an unexpected image storage host. No image was uploaded.');
    }
    return url.href;
  }
  const ICON_MD5 = '1cb2bc293cab0f4bc7bf203e3829aee7';
  const ICON_SHA256 = '1cb79c6d23db0c3ce9d092d1b72de254168a11316c9e64c5be4d0c2c0adcf924';
  async function uploadQolCover() {
    const file = await fetch(chrome.runtime.getURL('icons/qol-archive-cover.png'));
    if (!file.ok) throw Error('Could not read the packaged QoL cover image.');
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength < 1000 || bytes.byteLength > 2 * 1024 * 1024) throw Error('The bundled QoL cover is invalid.');
    // The precomputed MD5 is for this exact packaged image. Unlike SHA-256,
    // browser SubtleCrypto does not support MD5; validate SHA-256 before reuse.
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
    if (actual !== ICON_SHA256) throw Error('QoL cover integrity check failed. No changes made.');
    status('Requesting a secure upload for the real QoL picture…');
    const signed = await api('/save-image', 'POST', {image_type: 'image/png', hash: ICON_MD5});
    const key = String(signed?.key || '');
    if (!/^avatars\/[A-Za-z0-9._/-]{1,250}\.(?:png|jpg|jpeg|webp)$/i.test(key) || key.includes('..')) {
      throw Error('SpicyChat returned an invalid image reference. No Lorebook created.');
    }
    const url = validateSignedUrl(signed?.signed_url);
    status('Uploading the QoL picture securely to SpicyChat image storage…');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 30000);
    try {
      const result = await fetch(url, {
        method: 'PUT', headers: {'Content-Type': 'image/png'},
        body: new Blob([bytes], {type: 'image/png'}), signal: abort.signal,
      });
      if (!result.ok) throw Error('Image storage rejected the QoL cover (HTTP ' + result.status + '). No Lorebook created.');
    } finally { clearTimeout(timer); }
    return key;
  }
  async function run() {
    if (started || done || !document.body) return;
    started = true;
    let job = null;
    try {
      job = (await read([KEY]))[KEY];
      if (!job || job.token !== token || job.status !== 'ready' ||
        Date.now() - Number(job.createdAt) > 5 * 60 * 1000) return;
      status('Preparing your private Archive details…');
      await prepareVisibleForm(job);
      status('Checking your SpicyChat session and existing private Archives…');
      const user = await api('/v2/users');
      const accountId = String(user?.user?.id || '');
      if (!accountId) throw Error('Could not verify the signed-in SpicyChat account.');
      const books = await api('/lorebooks');
      if (!Array.isArray(books)) throw Error('Could not check for existing Lorebooks. Nothing was created.');
      const matches = books.filter(book => book.name === NAME && book.creator_user_id === accountId &&
        book.visibility === 'private' && Number(book.numAttachedCharacters) === 0 && UUID.test(book.id));
      if (matches.length > 1) throw Error('Multiple private QoL Archives exist. Select an Archive ID manually in Settings.');
      if (matches.length === 1) {
        await verifyAndConfigure(matches[0].id, job, accountId);
        return;
      }
      await mark(job, {status: 'preparing'});
      const avatar_url = await uploadQolCover();
      if (window.__DSQ_TAB_GATE__?.paused) throw Error('QoL was disabled; Archive creation cancelled.');
      // Read-only preflight again before the only Lorebook-creation write.
      const current = await api('/v2/users');
      if (String(current?.user?.id || '') !== accountId) throw Error('Signed-in account changed. No Lorebook created.');
      // Mark BEFORE a potentially ambiguous create response; never auto-retry a POST.
      await mark(job, {status: 'submitting'});
      status('Creating one private Archive Lorebook with the uploaded QoL picture…');
      const created = await api('/lorebooks', 'POST', {
        name: NAME,
        description: String(job.description || 'Private archive for conversation history stored by SpicyChat QoL.').slice(0, 100),
        tags: [],
        avatar_url,
        visibility: 'private',
      });
      const id = String(created?.id || '');
      if (!UUID.test(id)) throw Error('SpicyChat created an uncertain result. Check My Lorebooks before retrying.');
      await mark(job, {status: 'verifying', lorebookId: id});
      status('Checking the saved Archive and its privacy settings…');
      await verifyAndConfigure(id, job, accountId);
    } catch (error) {
      const message = String(error?.message || error);
      if (job) {
        const statusValue = job.status === 'submitting' || (await read([KEY]))[KEY]?.status === 'submitting'
          ? 'verification-needed' : 'failed';
        await mark(job, {status: statusValue, error: message}).catch(() => {});
      }
      status(message);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => run(), {once: true});
  else run();
})();
}
