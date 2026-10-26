// Opt-in, read-only long-chat history navigator. Never mounts history in native chat.
// No optional initialization in a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const PAGE_SIZES = [200, 100, 50]; // Match the existing export reader's verified fallback order.
  const NEARBY_AUTO_PAGES = 12;
  const CHECKPOINT_KEY = 'dsQolHistoryNavV1:';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const MAX_PAGES = 2000;
  const PAUSE_MS = 180;
  const NATIVE_MAX_BATCHES = 6; // Per deliberate click; never auto-load an entire long chat.
  const NATIVE_SETTLE_MS = 260;
  const PANEL_ID = 'ds-qol-history-navigator';
  let session = null;
  let generation = 0;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const setting = () => DS.state?.settings || {};
  const bookmarksAllowed = () => !!setting().enabled && !!setting().enableMessageBookmarks &&
    !!DS.isSingleChatPage?.();
  // The full History button remains opt-in. A deliberate Jump click can open
  // an older saved bookmark without silently changing that preference.
  const allowed = () => bookmarksAllowed() && !!setting().enableChatHistoryNavigator;
  function route() {
    const m = location.pathname.match(/^\/chat\/([^/?#]+)\/([^/?#]+)/i);
    if (!m || !UUID.test(m[1]) || !UUID.test(m[2])) return null;
    return { bot: m[1].toLowerCase(), chat: m[2].toLowerCase() };
  }
  const isCurrent = ctx => !!ctx && bookmarksAllowed() &&
    (allowed() || ctx.bookmarkOnly === true) && session === ctx && ctx.serial === generation &&
    location.pathname.startsWith(`/chat/${ctx.bot}/${ctx.chat}`) && !ctx.closed;
  function element(tag, value = '', className = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value) el.textContent = value;
    return el;
  }
  const action = (title, handler) => {
    const btn = element('button', title);
    btn.type = 'button';
    btn.addEventListener('click', handler);
    return btn;
  };
  function freshIndex() {
    return { version: 2, pageSize: 200, total: 0, head: '', complete: false,
      pages: [], hits: {}, updatedAt: 0 };
  }
  function safeIndex(value) {
    if (value?.version !== 2 || !PAGE_SIZES.includes(value.pageSize) || !Array.isArray(value.pages) ||
      value.pages.length > MAX_PAGES || typeof value.head !== 'string') return freshIndex();
    const pages = value.pages;
    if (pages.some((p, i) => !p || (i && p.cursor !== pages[i-1].lastId) ||
      typeof p.cursor !== 'string' || !UUID.test(p.firstId) || !UUID.test(p.lastId) ||
      !Number.isInteger(p.count) || p.count < 1 || p.count > value.pageSize)) return freshIndex();
    if (pages[0] && pages[0].cursor !== '') return freshIndex();
    const hits = {};
    if (value.hits && typeof value.hits === 'object') {
      for (const [id, page] of Object.entries(value.hits)) {
        if (UUID.test(id) && Number.isInteger(page) && page >= 0 && page < pages.length) hits[id] = page;
      }
    }
    return { version: 2, pageSize: value.pageSize, total: Math.max(0, Number(value.total) || 0),
      head: value.head, complete: !!value.complete, pages, hits, updatedAt: Number(value.updatedAt)||0 };
  }
  function status(ctx, message) { if (isCurrent(ctx) && ctx.status) ctx.status.textContent = message; }
  function ensureCurrent(ctx) {
    if (!isCurrent(ctx) || ctx.cancel || document.hidden) throw Error('Navigation stopped: chat changed, viewer closed, or tab hidden.');
  }
  async function getPage(ctx, cursor = '', fresh = false, pageSize = ctx.index.pageSize) {
    ensureCurrent(ctx);
    const reader = DS.fetchChatHistoryPageShared || DS.fetchChatHistoryPage;
    if (typeof reader !== 'function') throw Error('Authenticated history reader unavailable.');
    // Read-only history fetches can safely retry temporary network/server failures.
    // Do not retry authentication failures or rejected page-size requests here.
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      ensureCurrent(ctx);
      try {
        res = await reader(ctx.bot, ctx.chat, { limit: pageSize, lastId: cursor, forceRefresh: fresh });
        break;
      } catch (error) {
        const code = Number(error?.httpStatus || 0);
        const kind = String(error?.status || error?.message || '').toLowerCase();
        const temporary = [408, 425, 429].includes(code) || code >= 500 ||
          /timeout|network|bridge-timeout/.test(kind);
        if (!temporary || attempt === 2) throw error;
        status(ctx, `History request interrupted. Retrying (${attempt + 1}/2)…`);
        await delay([450, 1000][attempt]);
      }
    }
    ensureCurrent(ctx);
    const value = res?.data || {};
    if (res?.ok === false) throw Error(`History request failed: ${res.status || res.httpStatus || 'unknown error'}`);
    const rows = value.messages;
    if (!Array.isArray(rows) || rows.some(m => !m || !UUID.test(m.id))) throw Error('History response has no valid message list.');
    const ids = new Set(rows.map(x => x.id));
    if (ids.size !== rows.length) throw Error('History response contains repeated message IDs; indexing stopped.');
    return { rows, pageSize, total: Math.max(0, Number(value.num_messages) || 0),
      oldest: rows.at(-1) || null, newest: rows[0] || null };
  }
  async function respectNativeQuiet(ctx) {
    // Consult QoL's shared interaction quiet windows; no additional observers or polling.
    for (let tries = 0; tries < 50; tries++) {
      ensureCurrent(ctx);
      const state = DS.state || {};
      const busyUntil = Math.max(Number(state.nativeActionQuietUntil || 0),
        Number(state.chatHistoryBatchUntil || 0));
      if (!state.bulkChatHistoryLoadActive && Date.now() >= busyUntil) return;
      status(ctx, 'Paused while SpicyChat is rendering or handling chat actions…');
      await delay(Math.min(600, Math.max(250, busyUntil - Date.now())));
    }
    throw Error('SpicyChat is busy. Index paused; resume when the chat is idle.');
  }
  function rememberPage(ctx, cursor, page) {
    const index = ctx.index;
    if (!page.rows.length) { index.complete = true; return; }
    const newest = page.rows[0].id;
    const oldest = page.rows.at(-1).id;
    const known = index.pages.length;
    if (known && cursor !== index.pages[known - 1].lastId) throw Error('The message cursor changed. Rebuild the index.');
    if (!known) {
      if (cursor) throw Error('The initial history page must start at the newest message.');
      index.head = newest;
    }
    // Cursor-page num_messages may differ from the first response (the export
    // reader also takes the first count as its snapshot). A changing aggregate
    // is not proof that any message ID moved. Boundary checks below are the
    // actual index invariants. Only a changed head invalidates a saved index.
    const entry = { cursor, firstId: newest, lastId: oldest, count: page.rows.length };
    index.pages.push(entry);
    if (page.total && !index.total) index.total = page.total;
    // Only bookmarked IDs are stored, never message text or full history.
    for (const row of page.rows) if (ctx.bookmarkIds.has(row.id)) index.hits[row.id] = known;
    // As in Chat Export: a short page alone does not prove the chain ended.
    index.complete = page.oldest && Object.prototype.hasOwnProperty.call(page.oldest, 'prev_id')
      ? page.oldest.prev_id == null : page.rows.length < index.pageSize;
    index.updatedAt = Date.now();
  }
  async function checkpoint(ctx) {
    if (!isCurrent(ctx)) return;
    const data = JSON.parse(JSON.stringify(ctx.index));
    const saved = await DS.storageSet?.({ [`${CHECKPOINT_KEY}${ctx.chat}`]: data }, { immediate: true });
    if (saved === false) throw Error('Could not save the history index.');
  }
  async function bookmarkIds(ctx) {
    const items = await DS.listChatBookmarks?.(ctx.chat);
    if (!isCurrent(ctx)) return;
    ctx.bookmarkIds = new Set((items || []).map(b => String(b?.messageId || '').replace(/^message-/,'')).filter(id => UUID.test(id)));
  }
  function pageCache(ctx, pageNo, rows) {
    ctx.cache.delete(pageNo);
    ctx.cache.set(pageNo, rows);
    while (ctx.cache.size > 3) ctx.cache.delete(ctx.cache.keys().next().value);
  }
  async function readPosition(ctx, pageNo) {
    ensureCurrent(ctx);
    const anchor = ctx.index.pages[pageNo];
    if (!anchor) throw Error('That page is not indexed yet. Use Index 10 pages or Index to beginning.');
    const cached = ctx.cache.get(pageNo);
    if (cached) return cached;
    const response = await getPage(ctx, anchor.cursor);
    if (response.rows[0]?.id !== anchor.firstId || response.rows.at(-1)?.id !== anchor.lastId) {
      throw Error('Saved page boundaries changed. Use Rebuild index before jumping.');
    }
    pageCache(ctx, pageNo, response.rows);
    return response.rows;
  }
  function indexedMessages(ctx) {
    return ctx.index.pages.reduce((count, page) => count + page.count, 0);
  }
  function pageForOffset(ctx, offset) {
    if (offset < 0) return -1;
    let traversed = 0;
    for (let page = 0; page < ctx.index.pages.length; page++) {
      traversed += ctx.index.pages[page].count;
      if (offset < traversed) return page;
    }
    return -1;
  }
  function controls(ctx) {
    if (!isCurrent(ctx)) return;
    ctx.summary.textContent = `Indexed ${ctx.index.pages.length} page${ctx.index.pages.length===1?'':'s'} · ` +
      `${ctx.index.total || '?'} messages at open · ${ctx.index.complete ? 'Reached beginning' : 'Partial index'}`;
    ctx.newer.disabled = ctx.busy || ctx.position <= 0;
    ctx.older.disabled = ctx.busy || (ctx.position >= ctx.index.pages.length-1 && ctx.index.complete);
    ctx.start.disabled = ctx.busy || !ctx.index.complete;
    ctx.latest.disabled = ctx.busy;
    ctx.ten.disabled = ctx.busy || ctx.index.complete;
    ctx.all.disabled = ctx.busy || ctx.index.complete;
    ctx.target.disabled = ctx.busy || ctx.index.complete || ctx.targetOffset == null;
    ctx.stop.disabled = !ctx.busy;
    ctx.jump.disabled = ctx.busy;
    if (ctx.nativeJump) { ctx.nativeJump.disabled = ctx.busy || !UUID.test(ctx.focusId || ''); ctx.nativeJump.title = ctx.focusId ? 'Try to load this selected message in SpicyChat (experimental, bounded batches)' : 'Select a message first'; }
    ctx.rebuild.disabled = ctx.busy;
  }
  // Experimental native jumping deliberately uses SpicyChat's own Load Previous
  // Messages control. The read-only API cannot mutate React's chat state safely.
  // No injected message nodes, React state mutation, extra observer or auto reload.
  function nativeMessageRoot(id) {
    if (!UUID.test(id)) return null;
    const root = document.getElementById?.(`message-${id}`);
    return root?.isConnected ? root : null;
  }
  function nativeHistoryButton() {
    // Limit lookup to the native chat scrolling region; never select QoL's
    // navigator buttons, unrelated page actions or an offscreen helper tab.
    const scope = document.querySelector?.('.custom-scroll') || document;
    return [...(scope.querySelectorAll?.('button') || [])].find(btn =>
      !btn.closest?.('#ds-qol-history-navigator') && !btn.disabled &&
      /load previous messages/i.test(String(btn.textContent || btn.getAttribute?.('aria-label') || '').trim())) || null;
  }
  async function jumpIntoNative(ctx) {
    if (!isCurrent(ctx) || ctx.busy) return;
    const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    perf.nativeHistoryJumpAttempts = Number(perf.nativeHistoryJumpAttempts || 0) + 1;
    const id = ctx.focusId;
    if (!UUID.test(id)) { status(ctx, 'Select a message below first.'); return; }
    // Existing mounted message: no network traffic, no native load clicks.
    const reveal = () => {
      const root = nativeMessageRoot(id);
      if (!root) return false;
      try { root.scrollIntoView({ block: 'center', behavior: 'auto' }); }
      catch { root.scrollIntoView?.(); }
      root.classList?.add?.('ds-chat-nav-target');
      setTimeout(() => { if (root.isConnected) root.classList?.remove?.('ds-chat-nav-target'); }, 1200);
      perf.nativeHistoryJumpCompleted = Number(perf.nativeHistoryJumpCompleted || 0) + 1;
      status(ctx, 'Jumped to the message in SpicyChat.');
      return true;
    };
    if (reveal()) { closeViewer(); return; }
    if (document.hidden) { status(ctx, 'Return to the chat tab before trying native jumping.'); return; }
    if (DS.isQolWorkerTab?.() || DS.state?.bulkChatHistoryLoadActive) {
      status(ctx, 'Native history is already loading. Try again when it finishes.'); return;
    }
    ctx.busy = true; ctx.cancel = false; controls(ctx);
    let loaded = 0, reason = '';
    try {
      for (; loaded < NATIVE_MAX_BATCHES; loaded++) {
        ensureCurrent(ctx);
        if (ctx.cancel || document.hidden) { reason = 'Native jump stopped.'; break; }
        const state = DS.state || {};
        if (state.bulkChatHistoryLoadActive || Date.now() < Number(state.nativeActionQuietUntil || 0) ||
            Date.now() < Number(state.userTypingUntil || 0)) {
          reason = 'SpicyChat is busy with a native action or typing. Resume when idle.'; break;
        }
        const btn = nativeHistoryButton();
        if (!btn) { reason = 'SpicyChat has no available Load Previous Messages button.'; break; }
        const before = document.querySelector?.('.custom-scroll [id^="message-"]')?.id || '';
        btn.click(); // Native handler, not synthetic API writes.
        perf.nativeHistoryJumpPagesLoaded = Number(perf.nativeHistoryJumpPagesLoaded || 0) + 1;
        let changed = false;
        for (let tries = 0; tries < 22; tries++) {
          await delay(NATIVE_SETTLE_MS);
          ensureCurrent(ctx);
          if (ctx.cancel || document.hidden) break;
          if (nativeMessageRoot(id)) { changed = true; break; }
          const after = document.querySelector?.('.custom-scroll [id^="message-"]')?.id || '';
          if (after && after !== before) { changed = true; break; }
        }
        if (nativeMessageRoot(id)) break;
        if (!changed || ctx.cancel) { reason = changed ? 'Stopped.' : 'The native chat did not load an older page.'; break; }
        status(ctx, `Native history loaded ${loaded + 1} page${loaded ? 's' : ''} (experimental).`);
        await delay(350);
      }
      // Keep the viewer open after a failed/partial attempt; users can retry.
      if (nativeMessageRoot(id)) { ctx.busy = false; if (reveal()) { closeViewer(); return; } }
      else {
        perf.nativeHistoryJumpPartial = Number(perf.nativeHistoryJumpPartial || 0) + 1;
        status(ctx, `${reason || 'Target is still outside mounted chat.'} Loaded ${Math.min(loaded + 1, NATIVE_MAX_BATCHES)} native batch(es) this attempt. Try again to continue, or use the read-only viewer. No full-chat auto-load.`);
      }
    } catch (error) { if (isCurrent(ctx)) status(ctx, `Native jump stopped: ${error?.message || error}`); }
    finally { ctx.busy = false; ctx.cancel = false; controls(ctx); }
  }
  function selectMessage(ctx, id) {
    if (!UUID.test(id)) return;
    ctx.focusId = id;
    for (const item of ctx.messages.querySelectorAll?.('[data-message-id]') || []) {
      const selected = item.dataset.messageId === id;
      item.classList.toggle?.('ds-qol-history-highlight', selected);
      item.setAttribute?.('aria-selected', selected ? 'true' : 'false');
    }
    controls(ctx);
  }
  function drawRows(ctx, rows, focusId = '') {
    if (!isCurrent(ctx)) return;
    ctx.messages.replaceChildren();
    ctx.focusId = UUID.test(focusId) ? focusId : '';
    const total = ctx.index.total;
    const fromNewest = ctx.index.pages.slice(0, ctx.position).reduce((sum, p) => sum + p.count, 0);
    const label = `Page ${ctx.position + 1} from latest · ` +
      (total ? `messages ${Math.max(1,total-fromNewest-rows.length+1)}–${total-fromNewest}` : `${rows.length} messages`);
    ctx.location.textContent = label;
    for (const [i, row] of rows.slice().reverse().entries()) {
      const pos = rows.length - i - 1;
      const id = row.id;
      const number = total ? total - fromNewest - pos : 0;
      const item = element('article', '', 'ds-qol-history-item');
      item.dataset.messageId = id;
      item.tabIndex = 0;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', id === ctx.focusId ? 'true' : 'false');
      item.addEventListener('click', event => { if (!event.target?.closest?.('button')) selectMessage(ctx, id); });
      item.addEventListener('keydown', event => { if (event.key === 'Enter') selectMessage(ctx, id); });
      if (id === focusId) item.classList.add('ds-qol-history-highlight');
      const top = element('div', '', 'ds-qol-history-item-head');
      const who = ['user','human'].includes(String(row.role).toLowerCase()) ? 'You' : 'Bot';
      top.append(element('strong', `${who}${number > 0 ? ` · #${number}` : ''}`));
      const mark = action(ctx.bookmarkIds.has(id) ? '★ Saved' : '☆ Bookmark', async () => {
        mark.disabled = true;
        try {
          const active = await DS.toggleHistoryMessageBookmark?.({ messageId: `message-${id}`, role: who === 'You' ? 'user':'bot',
            preview: String(row.content || row.text || '').slice(0, 220) });
          await bookmarkIds(ctx);
          if (ctx.bookmarkIds.has(id)) ctx.index.hits[id] = ctx.position;
          else delete ctx.index.hits[id];
          await checkpoint(ctx);
          mark.textContent = active ? '★ Saved' : '☆ Bookmark';
        } catch (error) { status(ctx, `Bookmark not saved: ${error.message || error}`); }
        finally { mark.disabled = false; }
      });
      top.append(mark);
      const content = typeof row.content === 'string' ? row.content :
        (typeof row.text === 'string' ? row.text : '[This message has non-text content]');
      const text = element('div', content, 'ds-qol-history-body');
      item.append(top, text);
      if (id === focusId) item.dataset.focus = '1';
      ctx.messages.append(item);
    }
    if (!ctx.focusId && rows.length) ctx.focusId = rows.at(-1).id;
    if (!rows.length) ctx.messages.append(element('p','No messages in this page.'));
    const active = ctx.messages.querySelector('[data-focus="1"]');
    if (active) active.scrollIntoView?.({ block: 'nearest' });
    else ctx.messages.scrollTop = 0;
    controls(ctx);
  }
  async function showPage(ctx, pageNo, focus = '') {
    if (!isCurrent(ctx)) return;
    if (ctx.busy) return;
    ctx.busy = true; controls(ctx); status(ctx, 'Loading one read-only page…');
    try {
      let rows;
      if (pageNo === ctx.index.pages.length && !ctx.index.complete) {
        const cursor = ctx.index.pages.at(-1)?.lastId || '';
        const next = await getPage(ctx, cursor);
        if (!next.rows.length) { ctx.index.complete = true; await checkpoint(ctx); pageNo--; }
        else {
          rememberPage(ctx, cursor, next); pageCache(ctx, pageNo, next.rows);
          await checkpoint(ctx);
        }
      }
      ctx.position = Math.max(0, pageNo);
      rows = await readPosition(ctx, ctx.position);
      drawRows(ctx, rows, focus);
      status(ctx, 'Read-only page loaded. The live conversation has not been expanded.');
    } catch (error) { status(ctx, String(error?.message || error)); }
    finally { ctx.busy = false; controls(ctx); }
  }
  // Use the same authenticated reader and 200 -> 100 -> 50 fallback as chat export.
  // Only page-size rejections select a smaller page; auth and network failures stay visible.
  async function getFirstPage(ctx) {
    let lastError;
    for (const size of PAGE_SIZES) {
      try {
        const page = await getPage(ctx, '', true, size);
        // Some deployments may silently cap page sizes instead of returning 4xx.
        // Avoid using 200-position arithmetic for a server that only sent 50.
        const hasOlder = page.oldest && page.oldest.prev_id != null;
        if (page.rows.length && page.rows.length < size && hasOlder && size > 50) continue;
        ctx.index.pageSize = size;
        return page;
      } catch (error) {
        lastError = error;
        if (![400, 404, 413, 422].includes(Number(error?.httpStatus || 0))) break;
      }
    }
    throw lastError || Error('The history reader could not fetch the newest page.');
  }
  async function scan(ctx, full = false, seekId = '', targetOffset = null) {
    if (!isCurrent(ctx) || ctx.busy) return false;
    ctx.busy = true; ctx.cancel = false; controls(ctx);
    let count = 0;
    let success = false;
    const max = full || targetOffset != null ? MAX_PAGES : 10;
    try {
      await bookmarkIds(ctx);
      status(ctx, 'Indexing started…');
      const seen = new Set(ctx.index.pages.map(p => p.cursor));
      while (!ctx.index.complete && count < max && ctx.index.pages.length < MAX_PAGES) {
        ensureCurrent(ctx);
        await respectNativeQuiet(ctx);
        const cursor = ctx.index.pages.at(-1)?.lastId || '';
        if (seen.has(cursor)) throw Error('Repeated history cursor. Indexing stopped to prevent a loop.');
        seen.add(cursor);
        const page = await getPage(ctx, cursor);
        ensureCurrent(ctx);
        if (!page.rows.length) ctx.index.complete = true;
        else {
          rememberPage(ctx, cursor, page);
          const number = ctx.index.pages.length - 1;
          if ((seekId && page.rows.some(row => row.id === seekId)) ||
              (targetOffset != null && indexedMessages(ctx) > targetOffset))
            pageCache(ctx, number, page.rows);
        }
        count++;
        status(ctx, `Indexed ${ctx.index.pages.length} pages · ${indexedMessages(ctx)} messages checked. ${ctx.index.complete ? 'Beginning reached.' : 'Working…'}`);
        controls(ctx);
        if (count % 5 === 0 || ctx.index.complete) await checkpoint(ctx);
        if ((seekId && ctx.index.hits[seekId] != null) ||
            (targetOffset != null && indexedMessages(ctx) > targetOffset)) break;
        if (!ctx.index.complete) await delay(PAUSE_MS);
      }
      await checkpoint(ctx);
      success = true;
      if (ctx.index.complete && ctx.index.total && indexedMessages(ctx) !== ctx.index.total) {
        status(ctx, 'Beginning reached. The displayed total includes messages outside this active history chain; bookmarks use stable message IDs.');
      } else if (seekId && ctx.index.hits[seekId] == null) {
        status(ctx, ctx.index.complete ? 'Bookmark not found in active history.' : 'Bookmark not found yet. Continue indexing.');
      } else if (targetOffset != null && indexedMessages(ctx) <= targetOffset) {
        status(ctx, 'End of available history reached before that position. Try an earlier message number.');
      } else {
        status(ctx, ctx.index.complete ? 'Beginning reached; available history is indexed.' :
          `Indexed ${count} more pages. Continue whenever you want.`);
      }
    } catch (error) {
      if (isCurrent(ctx)) { await checkpoint(ctx).catch(() => {}); status(ctx, `Index paused: ${error?.message || error}`); }
    } finally { ctx.busy = false; ctx.cancel = false; controls(ctx); }
    return success;
  }
  async function jumpToNumber(ctx) {
    if (!isCurrent(ctx) || ctx.busy) return;
    const n = Number(ctx.number.value);
    const total = ctx.index.total;
    if (!Number.isSafeInteger(n) || n < 1 || !total || n > total) {
      status(ctx, `Enter a message number between 1 and ${total || '?'} (from the beginning).`); return;
    }
    const offset = total - n;
    let pageNo = pageForOffset(ctx, offset);
    if (pageNo < 0) {
      const missing = offset - indexedMessages(ctx) + 1;
      if (missing > NEARBY_AUTO_PAGES * ctx.index.pageSize) {
        ctx.targetOffset = offset;
        const approximatePages = Math.ceil(missing / ctx.index.pageSize);
        status(ctx, `Message #${n} needs about ${approximatePages} older pages. Select “Index to target” to fetch them without loading them in chat.`);
        controls(ctx);
        return;
      }
      status(ctx, `Loading older history for message #${n}…`);
      const completed = await scan(ctx, false, '', offset);
      if (!completed) return;
      pageNo = pageForOffset(ctx, offset);
      if (pageNo < 0) { status(ctx, 'That message position is not in the available history chain.'); return; }
    }
    const rows = await readPosition(ctx, pageNo).catch(error => { status(ctx,error.message);return null; });
    if (!rows) return;
    const before = ctx.index.pages.slice(0, pageNo).reduce((sum,p) => sum + p.count, 0);
    const pos = offset - before;
    if (!rows[pos]) { status(ctx, 'That position could not be matched to a message. Try Rebuild index.'); return; }
    ctx.targetOffset = null;
    await showPage(ctx, pageNo, rows[pos].id);
  }
  async function findBookmark(ctx, entry) {
    if (!isCurrent(ctx)) return;
    const id = String(entry?.messageId || '').replace(/^message-/, '').toLowerCase();
    if (!UUID.test(id)) { status(ctx, 'Bookmark has no usable message ID.'); return; }
    await bookmarkIds(ctx);
    let pageNo = ctx.index.hits[id];
    if (pageNo == null && ctx.index.pages.length) {
      // Bookmarks created after the index was built may not have been recorded
      // in its small saved hit map. Search known page boundaries on demand.
      ctx.busy = true; ctx.cancel = false; controls(ctx);
      try {
        for (let i = 0; i < ctx.index.pages.length; i++) {
          ensureCurrent(ctx);
          const rows = await readPosition(ctx, i);
          if (rows.some(row => row.id === id)) {
            pageNo = i; ctx.index.hits[id] = i;
            await checkpoint(ctx);
            break;
          }
          if (i % 10 === 0) status(ctx, `Searching previously indexed pages (${i + 1}/${ctx.index.pages.length})…`);
          await delay(PAUSE_MS);
        }
      } catch (error) { status(ctx, String(error?.message || error)); }
      finally { ctx.busy = false; ctx.cancel = false; controls(ctx); }
    }
    if (pageNo == null && !ctx.index.complete && isCurrent(ctx)) {
      status(ctx, 'Searching older pages for this bookmark…');
      await scan(ctx, true, id);
      pageNo = ctx.index.hits[id];
    }
    if (pageNo != null && isCurrent(ctx)) await showPage(ctx, pageNo, id);
    else if (isCurrent(ctx)) status(ctx, 'Bookmark not found in active conversation history.');
  }
  async function openViewer(bookmark = null) {
    if (!allowed() && !(bookmark?.messageId && bookmarksAllowed())) return false;
    const ids = route();
    if (!ids) return false;
    if (session && isCurrent(session)) {
      if (bookmark) void findBookmark(session, bookmark);
      return;
    }
    closeViewer();
    const ctx = { ...ids, serial: ++generation, closed: false, cancel: false, busy: false,
      bookmarkOnly: !allowed(),
      cache: new Map(), bookmarkIds: new Set(), index: freshIndex(), position: 0, targetOffset: null, focusId: '' };
    session = ctx;
    const overlay = element('div', '', 'ds-tool-modal-overlay');
    overlay.id = PANEL_ID;
    const modal = element('section', '', 'ds-qol-history-viewer ds-qol-history-dialog');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-label', 'Read-only chat history');
    const header = element('div', '', 'ds-tool-modal-head');
    header.append(element('h3', 'Chat history'));
    header.append(element('span', 'Experimental', 'ds-qol-history-beta'));
    const close = action('×', closeViewer); close.setAttribute('aria-label', 'Close history navigator'); header.append(close);
    ctx.summary = element('p', 'Loading index…', 'ds-qol-history-summary');
    ctx.location = element('p', '', 'ds-qol-history-location');
    const toolbar = element('div', '', 'ds-qol-history-controls');
    ctx.start = action('Beginning', () => showPage(ctx, ctx.index.pages.length - 1));
    ctx.newer = action('← Newer', () => showPage(ctx, ctx.position - 1));
    ctx.older = action('Older →', () => showPage(ctx, ctx.position + 1));
    ctx.latest = action('Latest', () => showPage(ctx, 0));
    toolbar.append(ctx.start, ctx.newer, ctx.older, ctx.latest);
    const seek = element('div', '', 'ds-qol-history-controls');
    ctx.number = document.createElement('input'); ctx.number.type = 'number'; ctx.number.min = '1';
    ctx.number.placeholder = 'Message position (user + bot)'; ctx.number.setAttribute('aria-label','Message position from beginning, counting both sides');
    ctx.jump = action('Go to #', () => void jumpToNumber(ctx));
    ctx.number.addEventListener('keydown', event => { if (event.key === 'Enter') void jumpToNumber(ctx); });
    seek.append(ctx.number, ctx.jump);
    const numberNote = element('p', 'Positions count both user and bot messages. A number written inside a message is not its position.', 'ds-qol-history-number-note');
    const indexing = element('div', '', 'ds-qol-history-controls');
    ctx.ten = action('Index 10 pages', () => void scan(ctx, false));
    ctx.all = action('Index to beginning', () => void scan(ctx, true));
    ctx.target = action('Index to target', async () => {
      if (ctx.targetOffset == null) { status(ctx, 'Enter a message number and select Go to # first.'); return; }
      const offset = ctx.targetOffset;
      const done = await scan(ctx, false, '', offset);
      if (done && pageForOffset(ctx, offset) >= 0) { ctx.targetOffset = null; await jumpToNumber(ctx); }
    });
    ctx.stop = action('Stop', () => { ctx.cancel = true; });
    ctx.rebuild = action('Rebuild index', async () => {
      ctx.index = freshIndex(); ctx.cache.clear(); ctx.position = 0; ctx.targetOffset = null;
      await checkpoint(ctx); await initialize(ctx);
    });
    indexing.append(ctx.ten, ctx.target, ctx.all, ctx.stop, ctx.rebuild);
    ctx.messages = element('div', '', 'ds-qol-history-messages');
    ctx.messages.setAttribute('role', 'listbox');
    ctx.nativeRow = element('div', '', 'ds-qol-history-native-actions');
    ctx.nativeJump = action('Jump in chat · Experimental', () => void jumpIntoNative(ctx));
    ctx.nativeNote = element('span', 'Uses SpicyChat’s own older-message button, at most 6 pages per attempt. May be slow in long chats.');
    ctx.nativeRow.append(ctx.nativeJump, ctx.nativeNote);
    ctx.status = element('p', 'Read-only: SpicyChat chat history will not be expanded.', 'ds-qol-history-status');
    if (ctx.bookmarkOnly) {
      // No passive History launcher or numbered search when its setting is off.
      // Saved bookmark jumps still work on demand and can be cancelled.
      seek.hidden = true; numberNote.hidden = true;
      ctx.ten.hidden = true; ctx.target.hidden = true; ctx.all.hidden = true; ctx.rebuild.hidden = true;
      ctx.summary.title = 'Temporary read-only viewer for this saved bookmark';
    }
    modal.append(header, ctx.summary, toolbar, seek, numberNote, indexing, ctx.location, ctx.messages, ctx.nativeRow, ctx.status);
    overlay.append(modal);
    ctx.overlay = overlay;
    overlay.addEventListener('click', event => { if (event.target === overlay) closeViewer(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') closeViewer(); });
    document.body.append(overlay);
    controls(ctx);
    await initialize(ctx);
    if (bookmark && isCurrent(ctx)) void findBookmark(ctx, bookmark);
  }
  async function initialize(ctx) {
    if (!isCurrent(ctx)) return;
    if (ctx.busy) return;
    ctx.busy = true; controls(ctx);
    try {
      await bookmarkIds(ctx);
      const saved = await DS.storageGet?.([`${CHECKPOINT_KEY}${ctx.chat}`]);
      if (!isCurrent(ctx)) return;
      const prior = safeIndex(saved?.[`${CHECKPOINT_KEY}${ctx.chat}`]);
      const latest = await getFirstPage(ctx);
      const acceptedSize = ctx.index.pageSize;
      ensureCurrent(ctx);
      if (prior.pages.length && prior.pageSize === acceptedSize && prior.head === latest.newest?.id &&
          prior.pages[0].count === latest.rows.length && prior.pages[0].lastId === latest.oldest?.id) {
        ctx.index = prior;
      } else {
        ctx.index = freshIndex(); ctx.index.pageSize = acceptedSize;
        if (latest.rows.length) rememberPage(ctx, '', latest);
        else ctx.index.complete = true;
        await checkpoint(ctx);
      }
      pageCache(ctx, 0, latest.rows);
      ctx.position = 0;
      drawRows(ctx, latest.rows);
      status(ctx, prior.pages.length && prior.head !== latest.newest?.id
        ? 'The newest message changed; the old page index was restarted. Bookmarks are preserved.'
        : 'Ready. Older pages and indexing run only when you request them.');
    } catch (error) { status(ctx, `History unavailable: ${error?.message || error}`); }
    finally { ctx.busy = false; controls(ctx); }
  }
  function closeViewer() {
    const ctx = session;
    if (!ctx) return;
    ctx.cancel = true; ctx.closed = true; generation++;
    // Preserve the pages indexed so far even if the viewer is closed while a
    // request is in flight. Do not wait for that request or issue another one.
    if (ctx.index.pages.length) {
      const saved = JSON.parse(JSON.stringify(ctx.index));
      void Promise.resolve(DS.storageSet?.({ [`${CHECKPOINT_KEY}${ctx.chat}`]: saved }, { immediate: true }))
        .catch(() => {});
    }
    ctx.overlay?.remove(); ctx.cache.clear();
    session = null;
  }
  function ensureLauncher() {
    if (!allowed()) {
      document.querySelectorAll('.ds-qol-history-launcher').forEach(el => el.remove());
      // Do not close a user-requested bookmark jump just because the optional
      // full History Navigator is disabled; do close it if bookmarks turn off.
      if (session && (!session.bookmarkOnly || !bookmarksAllowed())) closeViewer();
      return;
    }
    const host = document.querySelector('.ds-chat-title-actions-host') ||
      document.querySelector('a[aria-label="chatbot-profile"]')?.parentElement;
    if (!host || host.querySelector('.ds-qol-history-launcher')) return;
    const btn = action('History', () => void openViewer());
    btn.className = 'ds-qol-history-launcher';
    btn.title = 'Read older messages without loading them into the live chat';
    host.append(btn);
  }
  DS.applyChatHistoryNavigator = ensureLauncher;
  DS.removeChatHistoryNavigator = () => { document.querySelectorAll('.ds-qol-history-launcher').forEach(el => el.remove()); closeViewer(); };
  DS.openChatHistoryBookmark = entry => {
    if (!bookmarksAllowed() || !entry?.messageId || !route()) return false;
    void openViewer(entry);
    return true;
  };
  DS.openChatHistoryNavigator = () => { if (allowed()) void openViewer(); };
})();
}
