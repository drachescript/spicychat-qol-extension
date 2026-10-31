// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getStore() {
    const store = DS.state.laterBots || { ids: [], meta: {} };
    store.ids = Array.isArray(store.ids) ? store.ids : [];
    store.meta = store.meta && typeof store.meta === "object" ? store.meta : {};
    DS.state.laterBots = store;
    return store;
  }


  function getCardCreator(card) {
    const anchor = card?.querySelector?.("a[href*='/creator/']");
    const text = cleanText(anchor?.textContent || "");

    if (text) return text.startsWith("@") ? text : `@${text}`;

    const href = anchor?.getAttribute?.("href") || "";
    const match = href.match(/\/creator\/([^/?#]+)/i);
    return match?.[1] ? `@${decodeURIComponent(match[1])}` : "";
  }

  function getCardDescription(card) {
    const direct = DS.getCardDescriptionText?.(card);
    if (cleanText(direct)) return cleanText(direct);

    const title = cleanText(DS.getCardTitle?.(card));
    const pieces = DS.qsa("p, span", card)
      .map(el => cleanText(el.textContent))
      .filter(Boolean)
      .filter(text => text !== title)
      .filter(text => !/^@/.test(text))
      .filter(text => !/^\d+$/.test(text))
      .filter(text => text.toLowerCase() !== "for you")
      .sort((a, b) => b.length - a.length);

    return pieces.find(text => text.length > 35) || "";
  }

  function makeLaterMeta(card, anchor, id) {
    const base = DS.makeBotMeta?.({ id, card, anchor }) || {};

    return {
      ...base,
      id,
      name: base.name || DS.getCardTitle?.(card) || id,
      image: base.image || DS.getCardImageUrl?.(card) || "",
      creator: base.creator || getCardCreator(card),
      description: getCardDescription(card),
      // Preserve native card tags at the moment the bot enters Later.
      // Existing records are hydrated from the local archive below.
      tags: [...new Set([
        ...(Array.isArray(base.tags) ? base.tags : []),
        ...(DS.getCardTags?.(card) || []),
        ...[...(card?.querySelectorAll?.('[data-testid="CharacterCardTagRow"] button[aria-label]') || [])]
          .map(node => node.getAttribute('aria-label'))
      ].map(value => cleanText(typeof value === 'string' ? value : value?.name || value?.label || ''))
        .filter(value => value && value.length <= 70 && !/^(chat|profile|favorite|save for later|remove later|opened|image-gen)$/i.test(value)))],
      chatUrl: base.chatUrl || (id ? `${location.origin}/chat/${id}` : anchor?.href || ""),
      profileUrl: base.profileUrl || (id ? `${location.origin}/chatbot/${id}` : ""),
      savedAt: Date.now()
    };
  }

  function isSaved(id) {
    if (!id) return false;
    return DS.state.laterBotIdSet?.has(id) || false;
  }

  DS.cardIsSavedForLater = function cardIsSavedForLater(card, anchor) {
    const id = DS.botIdFromHref?.(anchor?.href || card?.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']")?.href || "") || "";
    return isSaved(id);
  };

  async function toggleLater(card, anchor, button) {
    const id = DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref(anchor?.href || "");
    if (!id) return;

    const store = getStore();
    const beforeStore = JSON.parse(JSON.stringify(store));

    if (DS.state.laterBotIdSet?.has(id)) {
      store.ids = store.ids.filter(item => item !== id);
      DS.state.laterBotIdSet?.delete(id);
      delete store.meta[id];
      button.dataset.dsSaved = "0";
      button.title = "Save for later";
      button.setAttribute("aria-label", "Save for later");
      DS.setQuickStatus?.("Removed from Later.");
    } else {
      store.ids.push(id);
      DS.state.laterBotIdSet?.add(id);
      store.meta[id] = {
        ...(store.meta[id] || {}),
        ...makeLaterMeta(card, anchor, id)
      };
      button.dataset.dsSaved = "1";
      button.title = "Saved for later";
      button.setAttribute("aria-label", "Saved for later");
      DS.setQuickStatus?.(`Saved for later: ${store.meta[id].name || "bot"}`);

      if (DS.state.settings?.hideLaterBotsFromListings && !DS.isChatListPage?.()) {
        DS.hideCard?.(card, "card:saved for later");
        DS.applyListingAutoFill?.();
      }
    }

    await DS.saveLaterBots?.(store);
    await DS.recordLocalChange?.(`Changed Later list: ${store.meta?.[id]?.name || id}`, { [DS.LATER_BOTS_KEY]: beforeStore }, { [DS.LATER_BOTS_KEY]: JSON.parse(JSON.stringify(DS.state.laterBots || store)) });
    DS.updateLaterBotButtons?.();
    DS.applyCardHiding?.();
  }

  function textLower(value) {
    return cleanText(value).toLowerCase();
  }

  function classIncludes(el, needle) {
    return String(el?.className || "").includes(needle);
  }

  function findFavoriteButton(card) {
    const candidates = [];

    const controls = DS.qsa("button, a, [role='button']", card);
    for (const control of controls) {
      if (control.classList?.contains("ds-later-bot-button")) continue;
      if (control.classList?.contains("ds-card-block-button")) continue;
      if (control.classList?.contains("ds-creator-fav-button")) continue;
      if (control.closest?.("#ds-qol-panel")) continue;

      const aria = textLower(control.getAttribute("aria-label"));
      const title = textLower(control.getAttribute("title"));
      const tooltip = textLower(control.getAttribute("data-tooltip-content"));
      const tooltipWrap = control.closest?.("[data-tooltip-content]");
      const tooltipText = textLower(tooltipWrap?.getAttribute?.("data-tooltip-content"));
      const testId = textLower(control.getAttribute("data-testid"));
      const hasHeart = !!control.querySelector?.(
        "svg.lucide-heart, svg[class*='lucide-heart'], svg[class*='heart'], [data-icon*='heart']"
      );

      if (
        hasHeart ||
        aria.includes("favorite") ||
        aria === "like" ||
        title.includes("favorite") ||
        tooltip.includes("favorite") ||
        tooltip.includes("like") ||
        tooltipText.includes("favorite") ||
        tooltipText.includes("like") ||
        testId.includes("favorite")
      ) {
        candidates.push(control);
      }
    }

    // Some SpicyChat card revisions put the heart SVG inside a generic
    // clickable wrapper with no useful aria-label. Pick up that shape too.
    for (const heart of DS.qsa(
      "svg.lucide-heart, svg[class*='lucide-heart'], svg[class*='heart'], [data-icon*='heart']",
      card
    )) {
      const control = heart.closest?.("button, a, [role='button']");
      if (
        control &&
        !control.classList?.contains("ds-creator-fav-button") &&
        !control.classList?.contains("ds-later-bot-button") &&
        !candidates.includes(control)
      ) {
        candidates.push(control);
      }
    }

    return candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.top - br.top || ar.left - br.left;
    })[0] || null;
  }

  function findTopLeftCardActionsHost(card, favorite) {
    let node = favorite;
    const cardRect = card?.getBoundingClientRect?.();

    for (let i = 0; node && i < 8; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;

      const cls = String(node.className || "");
      const rect = node.getBoundingClientRect?.();
      const isAbsolute = cls.includes("absolute");
      const isTopLeftByClass = cls.includes("left") && (cls.includes("top") || cls.includes("[6px]") || cls.includes("[8px]"));
      const isTopLeftByPosition = cardRect && rect
        ? rect.top <= cardRect.top + 28 && rect.left <= cardRect.left + 50
        : false;
      const hasFavorite = node === favorite || !!node.contains?.(favorite);
      const compactActionHost = !!rect && rect.width <= 180 && rect.height <= 72;

      if (hasFavorite && (isAbsolute || compactActionHost) && (isTopLeftByClass || isTopLeftByPosition)) {
        return node;
      }
    }

    return null;
  }

  function findFavoriteActionItem(host, favorite) {
    if (!host || !favorite) return favorite;

    let node = favorite;
    let child = favorite;

    while (node && node.parentElement && node.parentElement !== host) {
      child = node.parentElement;
      node = node.parentElement;

      if (node === document.body || node.id === "root") break;
    }

    if (child?.parentElement === host) return child;
    if (favorite.parentElement === host) return favorite;

    return favorite.closest?.("[data-tooltip-content]") || favorite.parentElement || favorite;
  }


  function createFallbackActionHost(card) {
    let host = card.querySelector?.(":scope > .ds-card-fallback-actions");
    if (host) return host;

    host = document.createElement("div");
    host.className = "ds-card-fallback-actions ds-card-top-left-actions";
    host.dataset.dsActionHost = "later";

    if (getComputedStyle(card).position === "static") {
      card.style.position = "relative";
    }

    card.insertAdjacentElement("afterbegin", host);
    return host;
  }

  function findButtonHost(card) {
    const favorite = findFavoriteButton(card);

    if (favorite) {
      const host = findTopLeftCardActionsHost(card, favorite);

      if (host) {
        const after = findFavoriteActionItem(host, favorite);
        host.classList.add("ds-card-top-left-actions");
        return { host, after };
      }

      // If SpicyChat uses a compact native favorite wrapper without the old
      // absolute-position classes, keep Later beside that native heart instead
      // of falling back to the opposite side of the card.
      const favoriteItem = favorite.closest?.("[data-tooltip-content]") || favorite;
      const nativeHost = favoriteItem?.parentElement;
      if (nativeHost) {
        const rect = nativeHost.getBoundingClientRect?.();
        const containsTitle = !!nativeHost.querySelector?.("a[aria-label^='chat-with-'][title]");
        const containsCreator = !!nativeHost.querySelector?.("a[href*='/creator/']");
        const compact = !!rect && rect.width <= 220 && rect.height <= 90;

        if (compact && !containsTitle && !containsCreator) {
          nativeHost.classList.add("ds-card-top-left-actions", "ds-card-native-favorite-actions");
          return { host: nativeHost, after: favoriteItem };
        }
      }

      // Do not blindly reuse the favorite button's parent chain here. On
      // SpicyChat's My Creations cards that chain can be the whole
      // title/creator column. Applying ds-card-top-left-actions to that
      // column turns it into an inline flex action row and can visually
      // cover/truncate the character name. If there is no real top-left
      // action host, fall through to the profile action or our dedicated
      // overlay host below.
    }

    const profile = DS.findCardProfileButton?.(card);
    if (profile?.parentElement) {
      profile.parentElement.classList.add("ds-card-top-right-actions");
      return { host: profile.parentElement, after: profile };
    }

    return { host: createFallbackActionHost(card), after: null };
  }

  function makeButton(card, anchor, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-later-bot-button";
    button.dataset.dsBotId = id;
    button.dataset.dsSaved = isSaved(id) ? "1" : "0";
    button.title = button.dataset.dsSaved === "1" ? "Saved for later" : "Save for later";
    button.setAttribute("aria-label", button.title);
    button.textContent = "◷";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleLater(card, anchor, button);
    }, true);

    return button;
  }

  DS.removeLaterBotButtons = function removeLaterBotButtons() {
    DS.qsa(".ds-later-bot-button").forEach(button => button.remove());

    // Clean up the bad host class left behind by older builds if the
    // extension is reloaded while My Creations is still open. A normal
    // page refresh would recreate this DOM anyway, but fixing it here
    // makes the patch take effect immediately.
    DS.qsa(".ds-card-top-left-actions").forEach(host => {
      const containsTitle = !!host.querySelector?.("a[aria-label^='chat-with-'][title]");
      const containsCreator = !!host.querySelector?.("a[href*='/creator/']");
      const isDedicatedOverlay = host.classList?.contains("ds-card-fallback-actions");

      if (!isDedicatedOverlay && containsTitle && containsCreator) {
        host.classList.remove("ds-card-top-left-actions");
      }
    });
  };

  DS.updateLaterBotButtons = function updateLaterBotButtons() {
    const settings = DS.state.settings || {};

    const shouldShowButton = !!settings.showLaterBotButtons;

    if (
      !settings.enabled ||
      !shouldShowButton ||
      DS.isSingleChatPage?.() ||
      DS.isChatListPage?.() ||
      DS.isBotProfilePage?.()
    ) {
      DS.removeLaterBotButtons();
      return;
    }

    const cards = DS.collectCards?.() || [];

    for (const { card, anchor } of cards) {
      if (!DS.isRecommendationCardRoot?.(card)) continue;

      const id = DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref(anchor?.href || "");
      if (!id) continue;
      const existing = (DS.qsa?.(".ds-later-bot-button", card) || [])
        .find(button => button.dataset.dsBotId === id);

      if (existing) {
        existing.dataset.dsSaved = isSaved(id) ? "1" : "0";
        existing.title = existing.dataset.dsSaved === "1" ? "Saved for later" : "Save for later";
        existing.setAttribute("aria-label", existing.title);
        continue;
      }

      const { host, after } = findButtonHost(card);
      if (!host) continue;

      const button = makeButton(card, anchor, id);
      if (after && after.parentElement === host) {
        after.insertAdjacentElement("afterend", button);
      } else {
        host.appendChild(button);
      }
    }
  };
})();

}
// The Later collection is a QoL-owned view. Never run native listing operations
// against its cards or interpret their absence as an unfavorite action.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS || DS.__favoritesLaterTabLoaded) return;
  DS.__favoritesLaterTabLoaded = true;
  const PANEL_ID = 'ds-favorites-later-panel';
  const STYLE_ID = 'ds-favorites-later-style';
  const PAGE_SIZE = 48;
  const ui = {active: location.hash === '#later', page: 1, search: '', sort: 'newest', folder: 'all',
    tags: '', excludeTags: '', opened: 'all', safety: 'all', selected: new Set(), changing: false,
    lastStore: null, lastRevision: '', applying: false, searchTimer: null,
    archiveTags: new Map(), archiveRequested: new Set(), tagAttempted: new Set(), fetchingTags: false, tagStatus: ''};
  const enabled = () => /^\/favorite-bots\/?$/i.test(location.pathname) &&
    DS.state?.settings?.enabled !== false && DS.state?.settings?.showLaterFavoritesTab === true;
  DS.isLaterFavoritesTabActive = () => ui.active && enabled();
  const text = value => String(value ?? '').replace(/\s+/g,' ').trim();
  const tokens = value => [...new Set(String(value||'').split(/[,\n]/).map(t=>t.trim().toLowerCase()).filter(Boolean))];
  function normalizeTags(raw) {
    if (typeof raw === 'string') return [...new Set(raw.split(/[,\n]/).map(text).filter(Boolean))];
    if (Array.isArray(raw)) return [...new Set(raw.flatMap(t => normalizeTags(typeof t === 'string' ? t : t?.name || t?.label || t?.tag || t?.title || '')).filter(Boolean))];
    return [];
  }
  function archiveTagList(record) {
    return normalizeTags(record?.fields?.tags || record?.tags || record?.current?.fields?.tags || record?.latest?.fields?.tags || []);
  }
  async function hydrateCachedTags(onPage) {
    const ids=onPage.filter(item=>!item.tags.length&&!ui.archiveRequested.has(item.id)).map(item=>item.id);
    if(!ids.length||typeof DS.largeStorageGetRecords!=='function')return;
    ids.forEach(id=>ui.archiveRequested.add(id));
    try {
      const records=await DS.largeStorageGetRecords(DS.BOT_ARCHIVE_KEY || 'botArchive',ids);
      let changed=false;
      for(const id of ids){const tags=archiveTagList(records?.[id]);ui.archiveTags.set(id,tags);if(tags.length)changed=true;}
      if(changed&&ui.active&&enabled())render();
    }catch { /* Cache unavailable: never block the Later page. */ }
  }
  async function fetchMissingTags(onPage) {
    if(ui.fetchingTags||typeof DS.fetchCharacterArchiveData!=='function')return;
    const missing=onPage.filter(item=>!item.tags.length&&!ui.tagAttempted.has(item.id)).slice(0,12);
    if(!missing.length)return;
    ui.fetchingTags=true;ui.tagStatus=`Loading tags: 0/${missing.length}`;
    let index=0,found=0;const updates={};
    const worker=async()=>{
      while(index<missing.length){
        const item=missing[index++];ui.tagAttempted.add(item.id);
        try{
          const detail=await DS.fetchCharacterArchiveData(item.id);
          const tags=normalizeTags(detail?.tags);
          if(tags.length){updates[item.id]=tags;ui.archiveTags.set(item.id,tags);found++;}
        }catch { /* Unavailable/private bots remain unchanged. */ }
        ui.tagStatus=`Loading tags: ${Math.min(index,missing.length)}/${missing.length}`;
        const progress=document.querySelector(`#${PANEL_ID} [data-later-tag-status]`);
        if(progress)progress.textContent=ui.tagStatus;
      }
    };
    try{
      await Promise.all([worker(),worker()]);
      if(Object.keys(updates).length&&typeof DS.saveLaterBots==='function'){
        const store=DS.state.laterBots||{ids:[],meta:{}};
        const currentIds=new Set(store.ids||[]);
        const next={ids:[...(store.ids||[])],meta:{...(store.meta||{})}};
        for(const [id,tags] of Object.entries(updates))if(currentIds.has(id))next.meta[id]={...(next.meta[id]||{}),tags};
        await DS.saveLaterBots(next);
      }
      ui.tagStatus=found?`Found tags for ${found} bot(s).`:'No new tags available for this batch.';
    }finally{ui.fetchingTags=false;if(ui.active&&enabled())render();}
  }
  function safeUrl(raw, fallback='') {
    try {const url=new URL(String(raw||fallback),location.origin); return /^(https?):$/i.test(url.protocol) ? url.href : fallback;}
    catch {return fallback;}
  }
  function entries() {
    const store = DS.state?.laterBots || {ids:[],meta:{}};
    const fav = DS.state?.favoriteBots?.meta || {};
    const org = DS.state?.botOrganization?.meta || {};
    return [...new Set(store.ids||[])].map((id,index)=>{
      const saved=store.meta?.[id]||{}, backup=fav[id]||{}, organized=org[id]||{};
      const folders=normalizeTags(organized.collections||saved.collections||saved.folders);
      const tags=[...new Set([
        ...normalizeTags(saved.tags),...normalizeTags(saved.tagNames),
        ...normalizeTags(backup.tags),...normalizeTags(ui.archiveTags.get(id)),
        ...normalizeTags(organized.tags)
      ])];
      const isNSFW=typeof saved.nsfw==='boolean'?saved.nsfw:typeof saved.isNSFW==='boolean'?saved.isNSFW:
        typeof backup.nsfw==='boolean'?backup.nsfw:null;
      return {id,index,name:text(saved.name||backup.name||organized.name||id),
        creator:text(saved.creator||backup.creator||organized.creator||''),
        description:text(saved.description||backup.description||organized.description||''),
        image:safeUrl(saved.image||backup.image||organized.image||''),
        chatUrl:safeUrl(saved.chatUrl||backup.chatUrl,`${location.origin}/chat/${encodeURIComponent(id)}`),
        profileUrl:safeUrl(saved.profileUrl||backup.profileUrl,`${location.origin}/chatbot/${encodeURIComponent(id)}`),
        savedAt:Number(saved.savedAt||0),folders,tags,note:text(saved.note||organized.note),isNSFW,
        opened:!!DS.state?.openedChats?.has?.(id),blocked:!!DS.state?.blockedBotIdSet?.has?.(id),
        favorited:backup.favoriteMembership==='current'&&!!backup.lastConfirmedFavoriteAt,
        messages:Number(saved.numMessages||saved.num_messages||backup.numMessages||0),
        createdAt:saved.createdAt||backup.createdAt||null};
    });
  }
  function ensureCss() {
    if(document.getElementById(STYLE_ID))return;
    const e=document.createElement('style');e.id=STYLE_ID;e.textContent=`
      /* Preserve native tabs so a Later/Recovered switch cannot strand the page.
         Only hide native controls/cards while our replacement panel exists. */
      html[data-ds-later-active="1"]:has(#${PANEL_ID}) [data-ds-favorites-native-controls="1"],
      html[data-ds-later-active="1"]:has(#${PANEL_ID}) [data-ds-favorites-native-results="1"]{display:none!important}
      html[data-ds-later-active="1"]:has(#${PANEL_ID}) .ds-later-native-pagination{display:none!important}
      [data-testid="SearchClientCharacterListing"] [role="tablist"]:has(#ds-favorites-later-tab){margin-inline-end:12px;}
      [data-testid="SearchClientCharacterListing"] [role="tablist"]:has(#ds-favorites-later-tab)>#ds-favorites-later-tab{padding-inline:10px;white-space:nowrap;}
      [data-testid="SearchClientCharacterListing"] div:has(> [role="tablist"] > #ds-favorites-later-tab) {column-gap:16px!important;flex-wrap:wrap!important;}
      [data-testid="SearchClientCharacterListing"] [role="tablist"]:has(#ds-favorites-later-tab) + [data-testid="AppliedFiltersBarView"]{min-width:160px;}
      @media(max-width:860px){[data-testid="SearchClientCharacterListing"] [role="tablist"]:has(#ds-favorites-later-tab){margin-inline-end:0;}
        [data-testid="SearchClientCharacterListing"] [role="tablist"]:has(#ds-favorites-later-tab){overflow-x:auto;max-width:100%;}
        [data-testid="SearchClientCharacterListing"] [role="tablist"]:has(#ds-favorites-later-tab) + [data-testid="AppliedFiltersBarView"]{flex-basis:100%;min-width:0;margin-left:0;}}

      #${PANEL_ID}{width:100%;min-width:0;box-sizing:border-box;display:block;padding:18px 0 36px;color:inherit}
      #${PANEL_ID}[hidden]{display:none!important}
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID} .ds-later-heading{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:space-between;margin-bottom:18px}
      #${PANEL_ID} h1{font-size:24px;line-height:1.25;font-weight:700;margin:0}
      #${PANEL_ID} .ds-later-intro,#${PANEL_ID} .ds-later-summary{font-size:13px;color:var(--gray-11,#a5a5a5);margin:6px 0 12px}
      #${PANEL_ID} button,#${PANEL_ID} select,#${PANEL_ID} input{font:inherit;color:inherit}
      #${PANEL_ID} button.ds-later-action{background:var(--gray-3,#1c1c1c);border:1px solid var(--gray-6,#484848);border-radius:8px;padding:7px 11px;cursor:pointer}
      #${PANEL_ID} button.ds-later-action:disabled{opacity:.45;cursor:default}
      #${PANEL_ID} .ds-later-tools{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:0 0 13px}
      #${PANEL_ID} .ds-later-tools input,#${PANEL_ID} .ds-later-tools select{background:var(--gray-2,#111);border:1px solid var(--gray-6,#444);border-radius:8px;padding:8px;min-height:38px;max-width:100%}
      #${PANEL_ID} .ds-later-search{min-width:210px;flex:2 1 260px}
      #${PANEL_ID} .ds-later-tags{flex:1 1 170px}
      #${PANEL_ID} .ds-later-switch{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer}
      #${PANEL_ID} .ds-later-switch input{accent-color:#4195f4}
      #${PANEL_ID} .ds-later-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(174px,1fr));gap:14px}
      #${PANEL_ID} .ds-later-card{min-width:0;position:relative;display:flex;flex-direction:column;border:1px solid var(--gray-5,#363636);border-radius:12px;overflow:hidden;background:var(--gray-2,#151515);content-visibility:auto;contain-intrinsic-size:340px}
      #${PANEL_ID} .ds-later-card[data-selected="1"]{outline:2px solid #a855f7}
      #${PANEL_ID} .ds-later-picture{aspect-ratio:1/1;position:relative;display:block;background:var(--gray-3,#222);overflow:hidden}
      #${PANEL_ID} .ds-later-picture a{display:block;width:100%;height:100%}
      #${PANEL_ID} .ds-later-picture img{display:block;width:100%;height:100%;object-fit:cover;object-position:center}
      #${PANEL_ID} .ds-later-placeholder{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:12px;opacity:.7}
      #${PANEL_ID} .ds-later-select{position:absolute;top:9px;left:9px;width:21px;height:21px;accent-color:#a855f7;z-index:2}
      #${PANEL_ID} .ds-later-card-body{padding:10px;display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
      #${PANEL_ID} .ds-later-title{font-size:15px;font-weight:650;line-height:1.4;color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${PANEL_ID} .ds-later-creator{font-size:12px;color:var(--blue-10,#82baff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${PANEL_ID} .ds-later-desc{font-size:13px;line-height:1.45;opacity:.87;white-space:normal;word-break:break-word;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
      #${PANEL_ID}[data-long-descriptions="1"] .ds-later-desc{-webkit-line-clamp:unset;display:block;max-height:none}
      #${PANEL_ID} .ds-later-badges{display:flex;gap:4px;flex-wrap:wrap}
      #${PANEL_ID} .ds-later-badge{font-size:11px;border:1px solid var(--gray-6,#555);border-radius:5px;padding:2px 5px;color:var(--gray-11,#bbb)}
      #${PANEL_ID} .ds-later-card-actions{margin-top:auto;padding-top:8px;display:flex;align-items:center;flex-wrap:wrap;gap:6px}
      #${PANEL_ID} .ds-later-card-actions .ds-later-opened{display:inline-flex;align-items:center;justify-content:center;font-size:11px;border:1px solid var(--gray-6,#555);border-radius:6px;padding:5px 7px;color:var(--gray-11,#bbb);line-height:1.25}
      #${PANEL_ID} .ds-later-card-actions a,#${PANEL_ID} .ds-later-card-actions button{font-size:12px;padding:5px 7px;border:1px solid var(--gray-6,#555);background:transparent;color:inherit;border-radius:6px;text-decoration:none;cursor:pointer}
      #${PANEL_ID} .ds-later-card-actions a:hover,#${PANEL_ID} .ds-later-card-actions button:hover{background:var(--gray-4,#323232)}
      #${PANEL_ID} .ds-later-pager{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;padding:24px 0 10px}
      #${PANEL_ID} .ds-later-pager button[data-current="1"]{background:var(--blue-9,#0066cb);color:#fff;border-color:var(--blue-9,#0066cb)}
      #${PANEL_ID} .ds-later-empty{padding:40px 15px;text-align:center;opacity:.77}
      @media(max-width:640px){#${PANEL_ID} .ds-later-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:9px}}
    `;document.head?.appendChild(e);
  }
  function host() {
    const native=document.querySelector('[data-testid="SearchClientCharacterListing"]');
    return native?.parentElement ? {native,parent:native.parentElement} : null;
  }
  function setActive(value,reset=true,navigate=true) {
    ui.active=!!value&&enabled();if(ui.active&&reset)ui.page=1;
    if(navigate&&enabled()){
      const next=ui.active?'#later':(location.hash==='#later'?'':location.hash);
      if(location.hash!==next)history.pushState(history.state,'',location.pathname+location.search+next);
    }
    if(ui.active)DS.closeFullFavorites?.(); // Closing Recovered must not clear #later.
    if(!ui.active)ui.selected.clear();mount(true);
  }
  const button=(label,action,click)=>{const b=document.createElement('button');b.type='button';b.className='ds-later-action';b.textContent=label;b.dataset.action=action;b.addEventListener('click',click);return b;};
  async function removeSaved(ids) {
    if(!ids.length||ui.changing)return;
    const previous=DS.state.laterBots||{ids:[],meta:{}};
    const rejected=new Set(ids);
    const updated={ids:(previous.ids||[]).filter(id=>!rejected.has(id)),meta:{...(previous.meta||{})}};
    for(const id of rejected) delete updated.meta[id];
    if(typeof DS.saveLaterBots!=='function')return;
    ui.changing=true;
    try{await DS.saveLaterBots(updated);
      for(const id of rejected)ui.selected.delete(id);
      ui.lastStore=null;render();
    }finally{ui.changing=false;}
  }
  function filtered() {
    const all=entries();const search=ui.search.toLowerCase().trim();
    const withTags=tokens(ui.tags),withoutTags=tokens(ui.excludeTags);
    const opts=DS.state?.settings||{};
    const result=all.filter(x=>{
      if((opts.laterPageHideOpenedBots || ui.opened==='unopened')&&x.opened)return false;
      if(ui.opened==='opened'&&!x.opened)return false;
      if(opts.laterPageHideBlockedBots&&x.blocked)return false;
      if(ui.safety==='sfw'&&x.isNSFW===true)return false;
      if(ui.safety==='nsfw'&&x.isNSFW!==true)return false;
      if(ui.folder!=='all'&&(ui.folder==='__none__'?x.folders.length:!x.folders.includes(ui.folder)))return false;
      if(search&&![x.name,x.creator,x.description,x.note,...x.tags,...x.folders].join(' ').toLowerCase().includes(search))return false;
      if(withTags.length&&!withTags.every(t=>x.tags.some(tag=>tag.toLowerCase()===t)))return false;
      if(withoutTags.some(t=>x.tags.some(tag=>tag.toLowerCase()===t)))return false;
      return true;
    });
    const collator=new Intl.Collator(undefined,{sensitivity:'base'});
    if(ui.sort==='name')result.sort((a,b)=>collator.compare(a.name,b.name));
    else if(ui.sort==='creator')result.sort((a,b)=>collator.compare(a.creator,b.creator)||collator.compare(a.name,b.name));
    else if(ui.sort==='oldest')result.sort((a,b)=>(a.savedAt||Number.MAX_SAFE_INTEGER)-(b.savedAt||Number.MAX_SAFE_INTEGER)||a.index-b.index);
    else result.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0)||a.index-b.index);
    return {all,result};
  }
  function addField(parent,kind,label,value,onChange,options=[]) {
    const field=document.createElement(kind);field.setAttribute('aria-label',label);field.value=value;
    if(kind==='input'){field.type='search';field.placeholder=label;field.className=label==='Search Later bots'?'ds-later-search':'ds-later-tags';}
    else for(const [v,title] of options){const o=document.createElement('option');o.value=v;o.textContent=title;field.append(o);}
    field.value=value;
    field.addEventListener(kind==='input'?'input':'change',()=>onChange(field.value,field));
    parent.append(field);return field;
  }
  function render() {
    if(!ui.active||!enabled())return;
    const panel=document.getElementById(PANEL_ID);if(!panel)return;
    const {all,result}=filtered();const count=Math.max(1,Math.ceil(result.length/PAGE_SIZE));
    ui.page=Math.min(Math.max(1,ui.page),count);
    const onPage=result.slice((ui.page-1)*PAGE_SIZE,ui.page*PAGE_SIZE);
    const settings=DS.state?.settings||{};
    panel.dataset.longDescriptions=settings.expandLongCardDescriptions?'1':'0';
    const fragment=document.createDocumentFragment();
    const heading=document.createElement('div');heading.className='ds-later-heading';
    const h=document.createElement('div');const title=document.createElement('h1');title.textContent='Saved for Later';
    const intro=document.createElement('p');intro.className='ds-later-intro';intro.textContent='Your QoL Later collection · independent of SpicyChat Favorites';h.append(title,intro);
    heading.append(h,button('Back to Favorites','back',()=>setActive(false)));fragment.append(heading);
    const tools=document.createElement('div');tools.className='ds-later-tools';
    const quick=(field,property)=>{ui[property]=field;ui.page=1;render();};
    addField(tools,'input','Search Later bots',ui.search,value=>{ui.search=value;ui.page=1;
      clearTimeout(ui.searchTimer);ui.searchTimer=setTimeout(()=>{if(!ui.active)return;const old=document.activeElement;const pos=old?.selectionStart;render();
        const input=document.querySelector(`#${PANEL_ID} .ds-later-search`);input?.focus();if(pos!=null)input?.setSelectionRange(pos,pos);},220);});
    addField(tools,'select','Sort Later bots',ui.sort,value=>quick(value,'sort'),[
      ['newest','Recently added to Later'],['oldest','Oldest added to Later'],['name','Name A-Z'],['creator','Creator A-Z']]);
    const folderOptions=[...new Set(all.flatMap(x=>x.folders))].sort();
    if(ui.folder!=='all'&&ui.folder!=='__none__'&&!folderOptions.includes(ui.folder))ui.folder='all';
    addField(tools,'select','Folder',ui.folder,value=>quick(value,'folder'),[['all','All folders'],['__none__','No folder'],...folderOptions.map(x=>[x,x])]);
    addField(tools,'select','Opened',ui.opened,value=>quick(value,'opened'),[['all','All opened states'],['unopened','Not opened'],['opened','Already opened']]);
    addField(tools,'select','Content',ui.safety,value=>quick(value,'safety'),[['all','SFW + NSFW'],['sfw','SFW + unknown'],['nsfw','Known NSFW']]);
    fragment.append(tools);
    const tagsRow=document.createElement('div');tagsRow.className='ds-later-tools';
    const textField=(name,key)=>addField(tagsRow,'input',name,ui[key],value=>{ui[key]=value;ui.page=1;clearTimeout(ui.searchTimer);
      ui.searchTimer=setTimeout(()=>{if(!ui.active)return;const pos=document.activeElement?.selectionStart;render();const input=[...panel.querySelectorAll('input')].find(x=>x.getAttribute('aria-label')===name);input?.focus();if(pos!=null)input?.setSelectionRange(pos,pos);},260);});
    textField('Include tags (comma separated)','tags');textField('Exclude tags (comma separated)','excludeTags');
    const enabledOpened=document.createElement('label');enabledOpened.className='ds-later-switch';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!!settings.laterPageHideOpenedBots;
    checkbox.addEventListener('change',async()=>{const value=checkbox.checked;settings.laterPageHideOpenedBots=value;
      try {await DS.saveSettingsPatch?.({laterPageHideOpenedBots:value});}catch{} render();});
    enabledOpened.append(checkbox,document.createTextNode('Hide opened on Later only'));tagsRow.append(enabledOpened);fragment.append(tagsRow);
    const actions=document.createElement('div');actions.className='ds-later-tools';
    actions.append(button('Select page','select-page',()=>{for(const x of onPage)ui.selected.add(x.id);render();}),
      button('Clear selection','clear',()=>{ui.selected.clear();render();}));
    const remove=button(`Remove selected (${ui.selected.size})`,'remove-selected',()=>{
      const ids=[...ui.selected];if(ids.length&&confirm(`Remove ${ids.length} bot(s) from your QoL Later list?\nYour SpicyChat Favorites will not change.`))void removeSaved(ids);
    });remove.disabled=!ui.selected.size||ui.changing;actions.append(remove);
    const missingTags=onPage.filter(item=>!item.tags.length);
    if(missingTags.length&&typeof DS.fetchCharacterArchiveData==='function'){
      const pending=missingTags.filter(item=>!ui.tagAttempted.has(item.id));
      const load=pending.length
        ?button(ui.fetchingTags?'Loading tags…':`Load missing tags (${Math.min(12,pending.length)})`,
          'fetch-tags',()=>void fetchMissingTags(onPage))
        :button('Retry missing tags','retry-tags',()=>{for(const item of missingTags)ui.tagAttempted.delete(item.id);ui.tagStatus='';render();});
      load.disabled=ui.fetchingTags;actions.append(load);
    }
    if(ui.tagStatus){const status=document.createElement('span');status.dataset.laterTagStatus='1';status.className='ds-later-summary';status.textContent=ui.tagStatus;actions.append(status);}
    fragment.append(actions);
    const summary=document.createElement('p');summary.className='ds-later-summary';
    summary.textContent=`${result.length} of ${all.length} Later bots · Page ${ui.page} of ${count} · ${ui.selected.size} selected`;
    fragment.append(summary);
    if(!onPage.length){const empty=document.createElement('div');empty.className='ds-later-empty';empty.textContent=all.length?'No Later bots match your filters.':'No bots saved for Later yet.';fragment.append(empty);}
    const grid=document.createElement('div');grid.className='ds-later-grid';
    for(const [index,item] of onPage.entries()) {
      const card=document.createElement('article');card.className='ds-later-card';card.dataset.selected=ui.selected.has(item.id)?'1':'0';
      card.dataset.dsQolLaterCard='1';
      const picture=document.createElement('div');picture.className='ds-later-picture';
      const mediaLink=document.createElement('a');mediaLink.href=item.chatUrl;mediaLink.title=`Chat with ${item.name}`;
      if(item.image){const img=document.createElement('img');img.src=item.image;img.alt=item.name;
        // First visible row starts immediately; subsequent images can wait for the viewport.
        img.loading=index<8?'eager':'lazy';img.decoding='async';
        if(index<4)img.setAttribute('fetchpriority','high');
        img.addEventListener('error',()=>{img.replaceWith(placeholder());},{once:true});
        mediaLink.append(img);}else mediaLink.append(placeholder());
      function placeholder(){const span=document.createElement('span');span.className='ds-later-placeholder';span.textContent='Image unavailable';return span;}
      picture.append(mediaLink);card.append(picture);
      const check=document.createElement('input');check.type='checkbox';check.className='ds-later-select';check.checked=ui.selected.has(item.id);
      check.setAttribute('aria-label',`Select ${item.name}`);check.addEventListener('change',()=>{
        if(check.checked)ui.selected.add(item.id);else ui.selected.delete(item.id);
        card.dataset.selected=check.checked?'1':'0';
        const removeButton=panel.querySelector('[data-action="remove-selected"]');
        if(removeButton){removeButton.textContent=`Remove selected (${ui.selected.size})`;removeButton.disabled=!ui.selected.size;}
        const line=panel.querySelector('.ds-later-summary');if(line)line.textContent=line.textContent.replace(/\d+ selected/,`${ui.selected.size} selected`);
      });card.append(check);
      const body=document.createElement('div');body.className='ds-later-card-body';
      const a=document.createElement('a');a.className='ds-later-title';a.href=item.chatUrl;a.title=item.name;a.textContent=item.name;body.append(a);
      if(item.creator){const c=document.createElement('span');c.className='ds-later-creator';c.textContent=item.creator;body.append(c);}
      if(item.description||item.note){const d=document.createElement('div');d.className='ds-later-desc';d.textContent=item.description||item.note;d.title=item.description||item.note;body.append(d);}
      const badges=document.createElement('div');badges.className='ds-later-badges';
      const badgesText=[...item.tags.slice(0,15)];if(item.favorited)badgesText.push('Favorite');
      if(item.blocked)badgesText.push('Blocked');if(item.isNSFW===true)badgesText.push('NSFW');
      if(item.messages>0&&settings.showExactMessageCounts)badgesText.push(`${item.messages.toLocaleString()} messages`);
      if(item.createdAt&&settings.showBotCreationDates){const dt=new Date(item.createdAt);if(!Number.isNaN(dt.getTime()))badgesText.push(dt.toLocaleDateString());}
      for(const value of badgesText){const b=document.createElement('span');b.className='ds-later-badge';b.textContent=value;badges.append(b);}
      if(badges.childNodes.length)body.append(badges);
      if(item.folders.length){const fld=document.createElement('div');fld.className='ds-later-summary';fld.textContent=`Folders: ${item.folders.join(', ')}`;body.append(fld);}
      const acts=document.createElement('div');acts.className='ds-later-card-actions';
      const chat=document.createElement('a');chat.href=item.chatUrl;chat.textContent='Chat';
      const profile=document.createElement('a');profile.href=item.profileUrl;profile.textContent='Profile';
      const rm=document.createElement('button');rm.type='button';rm.textContent='Remove Later';
      rm.addEventListener('click',()=>void removeSaved([item.id]));acts.append(chat,profile,rm);
      if(item.opened){const opened=document.createElement('span');opened.className='ds-later-opened';opened.textContent='Opened';acts.append(opened);}
      body.append(acts);card.append(body);grid.append(card);
    }
    fragment.append(grid);
    if(count>1){const nav=document.createElement('nav');nav.className='ds-later-pager';nav.setAttribute('aria-label','Later pages');
      const go=n=>{ui.page=n;render();panel.scrollIntoView({block:'start',behavior:'instant'});};
      const prev=button('‹','prev',()=>go(Math.max(1,ui.page-1)));prev.disabled=ui.page===1;nav.append(prev);
      const buttons=new Set([1,count,ui.page]);for(let offset=-3;offset<=3;offset++)if(ui.page+offset>1&&ui.page+offset<count)buttons.add(ui.page+offset);
      let last=0;for(const p of [...buttons].sort((a,b)=>a-b)){
        if(last&&p-last>1){const ell=document.createElement('span');ell.textContent='…';nav.append(ell);}
        const b=button(String(p),`page-${p}`,()=>go(p));b.dataset.current=p===ui.page?'1':'0';b.setAttribute('aria-current',p===ui.page?'page':'false');nav.append(b);last=p;
      }
      const next=button('›','next',()=>go(Math.min(count,ui.page+1)));next.disabled=ui.page===count;nav.append(next);fragment.append(nav);
    }
    panel.replaceChildren(fragment);
    void hydrateCachedTags(onPage);
    ui.lastStore=DS.state.laterBots;
    ui.lastRevision=`${all.length}|${settings.expandLongCardDescriptions?1:0}|${settings.laterPageHideOpenedBots?1:0}`;
  }
  function markNativePagination(where) {
    // SpicyChat mounts Favorites pagination NEXT TO the listing, not inside it.
    // Mark only that sibling; the CSS hides it solely while the Later tab is open.
    for(const sibling of [...where.parent.children]){
      if(sibling===where.native||sibling.id===PANEL_ID||sibling.dataset?.dsLaterNativePager==='1')continue;
      const nativeNumbers=sibling.querySelector?.('.ds-pagination-qol-layout');
      const likelyPager=nativeNumbers || (sibling.tagName==='DIV' &&
        sibling.classList.contains('justify-center') &&
        sibling.querySelectorAll('button').length>=2 &&
        !sibling.querySelector('[data-testid="SearchClientCharacterListing"]'));
      if(likelyPager){sibling.classList.add('ds-later-native-pagination');sibling.dataset.dsLaterNativePager='1';}
    }
  }
  function mount(force=false) {
    if(ui.applying)return;
    ui.applying=true;
    try{
      const where=host();
      if(!where||!enabled()){
        document.documentElement.removeAttribute('data-ds-later-active');
        document.getElementById(PANEL_ID)?.remove();ui.active=false;return;
      }
      ensureCss();
      if(location.hash==='#later'&&!ui.active)ui.active=true;
      markNativePagination(where);
      const rows=where.native.firstElementChild;
      if(rows?.children?.length>=3){
        const controls=rows.children[0],results=rows.children[rows.children.length-1];
        if(controls.dataset.dsFavoritesNativeControls!=='1')controls.dataset.dsFavoritesNativeControls='1';
        if(results.dataset.dsFavoritesNativeResults!=='1')results.dataset.dsFavoritesNativeResults='1';
      }
      const tabs=where.native.querySelector('[role="tablist"]');
      let launcher=document.getElementById('ds-favorites-later-tab');
      if(tabs&&(!launcher||launcher.parentElement!==tabs)){
        launcher?.remove();launcher=document.createElement('a');launcher.id='ds-favorites-later-tab';
        launcher.href='/favorite-bots#later';launcher.setAttribute('role','tab');launcher.className='relative cursor-pointer bg-transparent gap-sm flex flex-shrink-0 items-center justify-center transition-colors duration-200 min-w-10 text-gray-11 no-underline';
        launcher.addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();setActive(true);});tabs.append(launcher);
      }
      if(launcher){
        const label=`Later (${new Set(DS.state?.laterBots?.ids||[]).size})`;
        if(launcher.textContent!==label)launcher.textContent=label;
        const selected=ui.active?'true':'false';
        if(launcher.getAttribute('aria-selected')!==selected)launcher.setAttribute('aria-selected',selected);
      }
      if(!ui.active){document.documentElement.removeAttribute('data-ds-later-active');
        document.getElementById(PANEL_ID)?.remove();return;}
      let panel=document.getElementById(PANEL_ID);
      if(!panel||panel.previousElementSibling!==where.native){panel?.remove();panel=document.createElement('section');panel.id=PANEL_ID;panel.setAttribute('aria-label','Saved for Later');where.native.insertAdjacentElement('afterend',panel);force=true;}
      if(document.documentElement.dataset.dsLaterActive!=='1')document.documentElement.dataset.dsLaterActive='1';
      if(force||ui.lastStore!==DS.state.laterBots||ui.lastRevision!==`${new Set(DS.state?.laterBots?.ids||[]).size}|${DS.state?.settings?.expandLongCardDescriptions?1:0}|${DS.state?.settings?.laterPageHideOpenedBots?1:0}`)render();
    }finally{ui.applying=false;}
  }
  DS.openLaterFavoritesTab=()=>setActive(true);
  DS.closeLaterFavoritesTab=()=>setActive(false);
  DS.refreshFavoritesLaterTab=mount;
  const onRoute=()=>{if(enabled())setActive(location.hash==='#later',false,false);};
  window.addEventListener('hashchange',onRoute);
  window.addEventListener('popstate',onRoute);
  document.addEventListener('click',e=>{
    if(!ui.active)return;
    const tab=e.target?.closest?.('[data-testid="SearchClientCharacterListing"] [role="tablist"] [role="tab"]');
    if(tab&&tab.id!=='ds-favorites-later-tab'&&tab.id!=='ds-favorites-full-open')setActive(false,false);
  },true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mount(),{once:true});else mount();
})();
}
