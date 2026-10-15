// Optional, read-only public Lorebook discovery helpers.
// Uses the current PUBLIC Lorebook page and associations already saved by QoL.
// Never fetches bot details or visits private/unlisted creator editors.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const ROOT_ID = 'ds-lorebook-connections';
  const TOOLBAR_ID = 'ds-lorebook-author-filter';
  const HIDDEN_CLASS = 'ds-lorebook-author-filter-hidden';
  const UUID = /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i;
  const LINK_KEY = 'chatbotLorebookLinks';
  let currentId = '';
  let loaded = false;
  let localLinks = [];
  let loading = false;
  let authorQuery = '';
  let filterTimer = 0;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const profileId = () => (location.pathname.match(/^\/lorebook\/([0-9a-f-]{20,})(?:\/|$)/i)?.[1] || '').toLowerCase();
  const isListing = () => /^\/lorebooks(?:\/|$)/i.test(location.pathname);
  const allowed = () => DS.state?.settings?.enabled !== false && DS.state?.settings?.showLorebookConnections === true;
  function mainContent() {
    return document.querySelector('main, [role="main"]') || null;
  }
  function creatorAnchor(main) {
    return [...(main?.querySelectorAll("a[href*='/creator/']") || [])]
      .find(anchor => !anchor.closest(`#${ROOT_ID},#${TOOLBAR_ID}`) && /^https?:$/.test(new URL(anchor.href).protocol));
  }
  async function loadLocalLinks(id) {
    if (loading || loaded) return;
    loading = true;
    try {
      const result = await DS.storageGet?.([LINK_KEY]) || {};
      const entries = Object.entries(result[LINK_KEY] && typeof result[LINK_KEY] === 'object' ? result[LINK_KEY] : {});
      // Only links saved by QoL's own creator workflow, which records an exact Lorebook UUID.
      localLinks = entries.filter(([botId, link]) => UUID.test(botId) &&
        String(link?.lorebookId || '').toLowerCase() === id)
        .slice(0, 250)
        .map(([botId, link]) => ({ botId, name: clean(link?.chatbotName || '') }));
      loaded = true;
    } catch { localLinks = []; loaded = true; }
    finally { loading = false; }
  }
  function makeLink(href, text) {
    const link = document.createElement('a'); link.href = href;
    link.textContent = text; link.rel = 'noopener noreferrer';
    return link;
  }
  async function expand(root, id) {
    await loadLocalLinks(id);
    if (!root.isConnected || profileId() !== id) return;
    const details = root.querySelector('.ds-lb-connections-details');
    details.replaceChildren();
    const helper = document.createElement('p');
    helper.textContent = 'Only connections saved by your own QoL creator tools are listed. This is not a complete list of bots using the Lorebook, and does not check private bots.';
    details.append(helper);
    if (!localLinks.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No exact Lorebook-to-bot links are saved locally.';
      details.append(empty);
    } else {
      const list = document.createElement('ul');
      for (const { botId, name } of localLinks) {
        const li = document.createElement('li');
        li.appendChild(makeLink(`/chatbot/${encodeURIComponent(botId)}`, name || `Bot ${botId.slice(0, 8)}…`));
        list.append(li);
      }
      details.append(list);
    }
  }
  function renderProfile() {
    const id = profileId();
    if (!id) { document.getElementById(ROOT_ID)?.remove(); currentId = ''; loaded = false; return; }
    const main = mainContent();
    const heading = main?.querySelector('h1');
    // Fail closed when the page is private, unavailable, or native public data
    // has not loaded. Do not infer public status from the URL alone.
    const denied = /(?:private|restricted|not found|unavailable)/i.test(clean(heading?.textContent).slice(0, 100));
    if (!main || !heading || denied) { document.getElementById(ROOT_ID)?.remove(); return; }
    if (id !== currentId) { currentId = id; loaded = false; localLinks = []; document.getElementById(ROOT_ID)?.remove(); }
    const nativeAuthor = creatorAnchor(main);
    let root = document.getElementById(ROOT_ID);
    if (root && !main.contains(root)) { root.remove(); root = null; }
    if (!root) {
      root = document.createElement('section'); root.id = ROOT_ID;
      root.setAttribute('aria-label', 'Lorebook discovery');
      root.dataset.dsOwned = '1';
      const title = document.createElement('strong'); title.textContent = 'Lorebook discovery';
      const label = document.createElement('p'); label.className = 'ds-lb-connections-intro';
      label.textContent = 'Creator navigation and known local chatbot connections (read-only).';
      const by = document.createElement('div'); by.className = 'ds-lb-connections-creator';
      const toggle = document.createElement('button'); toggle.type = 'button';
      toggle.textContent = 'Show locally linked bots'; toggle.setAttribute('aria-expanded', 'false');
      const details = document.createElement('div'); details.className = 'ds-lb-connections-details'; details.hidden = true;
      toggle.addEventListener('click', async () => {
        const next = details.hidden;
        details.hidden = !next; toggle.setAttribute('aria-expanded', String(next));
        if (next) { details.textContent = 'Reading local links…'; await expand(root, id); }
      });
      root.append(title, label, by, toggle, details);
      heading.insertAdjacentElement('afterend', root);
    }
    const by = root.querySelector('.ds-lb-connections-creator');
    by.replaceChildren();
    if (nativeAuthor) by.append(makeLink(nativeAuthor.href, `Visit creator: ${clean(nativeAuthor.textContent) || 'profile'}`));
    else by.textContent = 'Creator profile link not available on this page.';
  }
  function listingCards() {
    const anchors = [...document.querySelectorAll("main a[href*='/lorebook/'],[role='main'] a[href*='/lorebook/']")];
    const seen = new Set(); const result = [];
    for (const anchor of anchors) {
      const id = anchor.href.match(/\/lorebook\/([0-9a-f-]{20,})(?:[/?#]|$)/i)?.[1]?.toLowerCase();
      if (!id || seen.has(id) || !UUID.test(id)) continue;
      const card = anchor.closest('div.relative.group.rounded-xl, div[class*="rounded-xl"]');
      if (!card) continue;
      seen.add(id);
      const meta = DS.getPublicLorebookCardMeta?.(card, anchor) || {};
      const author = clean(meta.creator || card.querySelector("a[href*='/creator/']")?.textContent);
      result.push({ card, author });
    }
    return result;
  }
  function applyAuthorFilter() {
    if (!isListing() || !allowed()) return;
    const q = authorQuery.toLocaleLowerCase();
    let total = 0, showing = 0;
    for (const { card, author } of listingCards()) {
      total++;
      const hidden = !!q && !author.toLocaleLowerCase().includes(q);
      card.classList.toggle(HIDDEN_CLASS, hidden);
      if (!hidden) showing++;
    }
    const count = document.querySelector(`#${TOOLBAR_ID} .ds-lb-author-count`);
    if (count) count.textContent = `${showing}/${total} loaded Lorebooks`;
  }
  function listing() {
    const main = mainContent();
    const cards = listingCards();
    if (!main || !cards.length) return;
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar || !main.contains(toolbar)) {
      toolbar?.remove(); toolbar = document.createElement('section');
      toolbar.id = TOOLBAR_ID; toolbar.dataset.dsOwned = '1';
      const label = document.createElement('label'); label.textContent = 'Filter loaded Lorebooks by creator';
      const input = document.createElement('input'); input.type = 'search';
      input.placeholder = 'Creator name (loaded cards only)';
      input.setAttribute('aria-label', 'Filter loaded Lorebooks by creator');
      input.addEventListener('input', () => { authorQuery = input.value; applyAuthorFilter(); });
      const count = document.createElement('span'); count.className = 'ds-lb-author-count';
      label.append(input); toolbar.append(label, count);
      main.insertBefore(toolbar, main.firstChild);
    }
    applyAuthorFilter();
  }
  function stop() {
    document.getElementById(ROOT_ID)?.remove(); document.getElementById(TOOLBAR_ID)?.remove();
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach(node => node.classList.remove(HIDDEN_CLASS));
    currentId = ''; loaded = false; localLinks = []; authorQuery = '';
    clearTimeout(filterTimer); filterTimer = 0;
  }
  DS.removeLorebookConnections = stop;
  DS.applyLorebookConnections = function applyLorebookConnections() {
    if (!allowed() || (!profileId() && !isListing())) {
      if (document.getElementById(ROOT_ID) || document.getElementById(TOOLBAR_ID) ||
          document.querySelector(`.${HIDDEN_CLASS}`)) stop();
      return;
    }
    if (profileId()) { document.getElementById(TOOLBAR_ID)?.remove(); renderProfile(); }
    else { document.getElementById(ROOT_ID)?.remove(); listing(); }
  };
})();
}
