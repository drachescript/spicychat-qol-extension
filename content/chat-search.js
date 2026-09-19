(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const FLOATING_PANEL_ID = "ds-chat-search-panel";
  const BUTTON_CLASS = "ds-chat-search-button";
  const MATCH_CLASS = "ds-chat-search-match";
  const CURRENT_CLASS = "ds-chat-search-current";
  const MESSAGE_SELECTOR = "div[id^='message-']";

  let matches = [];
  let currentIndex = -1;
  let query = "";
  let scope = "all";
  let lastSearchSignature = "";
  let lastSearchDomRevision = -1;
  let lastSearchTextRevision = -1;
  let loadOlderRunning = false;

  function settings() { return DS.state?.settings || {}; }
  function isEnabled() { const s = settings(); return !!s.enabled && !!s.showChatSearch && !!DS.isSingleChatPage?.(); }
  function showPanelPlacement() { return settings().chatSearchShowPanel !== false; }
  function showFindButtonPlacement() { return !!settings().chatSearchShowFindButton; }
  function cleanText(value) { return String(value || "").replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\s+/g, " ").trim(); }
  function visible(el) {
    if (!(el instanceof Element) || !document.contains(el)) return false;
    try { const style = getComputedStyle(el); if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false; } catch {}
    return el.getClientRects().length > 0;
  }
  function messageRoots() {
    return Array.from(document.querySelectorAll(MESSAGE_SELECTOR))
      .filter(root => !root.parentElement?.closest?.(MESSAGE_SELECTOR))
      .filter(visible)
      .sort((a,b) => a === b ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }
  function messageRole(root) { return root.querySelector("a[href*='/chatbot/'], a[aria-label='chatbot-profile']") ? "bot" : "user"; }
  function messageText(root) { return typeof DS.getCachedMessageText === "function" ? DS.getCachedMessageText(root) : cleanText(root.textContent); }

  function optionState() {
    const s = settings();
    return {
      exactPhrase: !!s.chatSearchExactPhrase,
      caseSensitive: !!s.chatSearchCaseSensitive,
      wholeWord: !!s.chatSearchWholeWord,
      regex: !!s.chatSearchRegex,
      loadUntilMatch: !!s.chatSearchLoadUntilMatch
    };
  }
  function regexEscape(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function buildMatcher() {
    const opts = optionState();
    const raw = cleanText(query);
    if (!raw) return null;
    const flags = opts.caseSensitive ? "" : "i";
    try {
      if (opts.regex) return { test: text => new RegExp(raw, flags).test(text), error: "" };
      const parts = opts.exactPhrase ? [raw] : raw.split(/\s+/).filter(Boolean);
      const expressions = parts.map(part => new RegExp(opts.wholeWord ? `\\b${regexEscape(part)}\\b` : regexEscape(part), flags));
      return { test: text => expressions.every(re => re.test(text)), error: "" };
    } catch (error) {
      return { test: () => false, error: String(error?.message || error || "Invalid search") };
    }
  }

  function quickPanelInput() { return document.getElementById("ds-qol-current-chat-search"); }
  function quickPanelScope() { return document.getElementById("ds-qol-current-chat-search-scope"); }
  function floatingPanel() { return document.getElementById(FLOATING_PANEL_ID); }
  function allInputs() { return [quickPanelInput(), floatingPanel()?.querySelector(".ds-chat-search-input") || null].filter(Boolean); }
  function allScopes() { return [quickPanelScope(), floatingPanel()?.querySelector(".ds-chat-search-scope") || null].filter(Boolean); }
  function allCounters() { return [document.getElementById("ds-qol-current-chat-search-count"), floatingPanel()?.querySelector(".ds-chat-search-count") || null].filter(Boolean); }
  function allPreviousButtons() { return [document.getElementById("ds-qol-current-chat-search-prev"), floatingPanel()?.querySelector(".ds-chat-search-prev") || null].filter(Boolean); }
  function allNextButtons() { return [document.getElementById("ds-qol-current-chat-search-next"), floatingPanel()?.querySelector(".ds-chat-search-next") || null].filter(Boolean); }
  function allLoadOlderButtons() { return [document.getElementById("ds-qol-current-chat-search-load-older"), floatingPanel()?.querySelector(".ds-chat-search-load-older") || null].filter(Boolean); }
  function allErrorHosts() { return [...document.querySelectorAll(".ds-chat-search-error")]; }

  function syncAdvancedControls() {
    const opts = optionState();
    document.querySelectorAll("[data-ds-chat-search-option]").forEach(input => {
      const key = input.dataset.dsChatSearchOption;
      if (key in opts && input.checked !== !!opts[key]) input.checked = !!opts[key];
    });
  }
  async function updateSearchSetting(key, checked) {
    const map = { exactPhrase:"chatSearchExactPhrase", caseSensitive:"chatSearchCaseSensitive", wholeWord:"chatSearchWholeWord", regex:"chatSearchRegex", loadUntilMatch:"chatSearchLoadUntilMatch" };
    const settingKey = map[key];
    if (!settingKey) return;
    const next = { ...(DS.state.settings || {}), [settingKey]: !!checked };
    DS.state.settings = next;
    await DS.storageSet?.({ settings: next });
    runSearch({ keepCurrent: true, scroll: false, force: true });
    syncControls();
  }
  function ensureAdvancedControls(host) {
    if (!host || host.querySelector(".ds-chat-search-advanced")) return;
    const details = document.createElement("details"); details.className = "ds-chat-search-advanced";
    const summary = document.createElement("summary"); summary.textContent = "Search options"; details.appendChild(summary);
    const options = [
      ["exactPhrase","Exact phrase"],
      ["caseSensitive","Case sensitive"],
      ["wholeWord","Whole words"],
      ["regex","Regex / advanced"],
      ["loadUntilMatch","Load older until a match"]
    ];
    const grid = document.createElement("div"); grid.className = "ds-chat-search-option-grid";
    for (const [key,label] of options) {
      const wrap = document.createElement("label");
      const input = document.createElement("input"); input.type = "checkbox"; input.dataset.dsChatSearchOption = key;
      input.addEventListener("change", () => updateSearchSetting(key, input.checked));
      wrap.append(input, document.createTextNode(` ${label}`)); grid.appendChild(wrap);
    }
    const error = document.createElement("div"); error.className = "ds-chat-search-error";
    details.append(grid, error); host.appendChild(details); syncAdvancedControls();
  }

  function syncControls(error = "") {
    allInputs().forEach(input => { if (input.value !== query) input.value = query; });
    allScopes().forEach(select => { if (select.value !== scope) select.value = scope; });
    const counterText = matches.length && currentIndex >= 0 ? `${currentIndex + 1} / ${matches.length}` : `0 / ${matches.length}`;
    allCounters().forEach(counter => { DS.setTextIfChanged?.(counter, counterText) ?? (counter.textContent = counterText); });
    const disabled = !matches.length;
    allPreviousButtons().forEach(button => { if (button.disabled !== disabled) button.disabled = disabled; });
    allNextButtons().forEach(button => { if (button.disabled !== disabled) button.disabled = disabled; });
    allErrorHosts().forEach(host => {
      DS.setTextIfChanged?.(host, error) ?? (host.textContent = error);
      const hidden = !error;
      if (host.hidden !== hidden) host.hidden = hidden;
    });
    syncAdvancedControls();
  }
  function clearHighlights() { document.querySelectorAll(`.${MATCH_CLASS}, .${CURRENT_CLASS}`).forEach(root => root.classList.remove(MATCH_CLASS, CURRENT_CLASS)); }
  function setCurrent(index, { scroll = true } = {}) {
    if (!matches.length) { currentIndex = -1; syncControls(); return; }
    currentIndex = ((index % matches.length) + matches.length) % matches.length;
    matches.forEach((root,i) => root.classList.toggle(CURRENT_CLASS, i === currentIndex));
    const current = matches[currentIndex];
    if (scroll && current) {
      if (typeof DS.navigateChatTo === "function") DS.navigateChatTo(current, { reason: "search" });
      else { try { current.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" }); } catch { current.scrollIntoView?.(); } }
    }
    syncControls();
  }
  function searchSignature() {
    const o = optionState();
    return JSON.stringify([query, scope, o.exactPhrase, o.caseSensitive, o.wholeWord, o.regex]);
  }

  function matchesScope(root) {
    const role = messageRole(root);
    if (scope === "bot" && role !== "bot") return false;
    if (scope === "user" && role !== "user") return false;
    if (scope === "bookmarked" && !DS.isChatMessageBookmarked?.(root)) return false;
    return true;
  }

  function rootMatches(root, matcher) {
    return !!(root?.isConnected && visible(root) && matchesScope(root) && matcher.test(messageText(root)));
  }

  function sortMatches() {
    matches = [...new Set(matches.filter(root => root?.isConnected && visible(root)))];
    matches.sort((a, b) => a === b ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  function runSearch({ keepCurrent = true, scroll = false, force = false } = {}) {
    if (!isEnabled()) { clearSearchState(); return; }

    const signature = searchSignature();
    const domRevision = Number(DS.state?.domRevision || 0);
    const textRevision = Number(DS.state?.messageTextRevision || 0);
    const configChanged = signature !== lastSearchSignature;
    const revisionsChanged = domRevision !== lastSearchDomRevision || textRevision !== lastSearchTextRevision;

    if (!force && !configChanged && !revisionsChanged) { syncControls(); return; }

    const previousRoot = keepCurrent && currentIndex >= 0 ? matches[currentIndex] : null;
    const matcher = buildMatcher();
    lastSearchSignature = signature;
    lastSearchDomRevision = domRevision;
    lastSearchTextRevision = textRevision;

    if (!matcher) { clearHighlights(); matches = []; currentIndex = -1; syncControls(); return; }
    if (matcher.error) { clearHighlights(); matches = []; currentIndex = -1; syncControls(matcher.error); return; }

    const dirtyRoots = !force && !configChanged ? (DS.getCurrentMessageLaneRoots?.() || []) : [];
    const canIncremental = dirtyRoots.length > 0 && matches.length >= 0;

    if (canIncremental) {
      const dirty = new Set(dirtyRoots);
      const kept = [];
      for (const root of matches) {
        if (!root?.isConnected) continue;
        if (dirty.has(root)) {
          root.classList.remove(MATCH_CLASS, CURRENT_CLASS);
          continue;
        }
        kept.push(root);
      }
      matches = kept;

      for (const root of dirty) {
        if (!rootMatches(root, matcher)) continue;
        root.classList.add(MATCH_CLASS);
        matches.push(root);
      }
      sortMatches();
      const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.chatSearchIncrementalUpdates = Number(counters.chatSearchIncrementalUpdates || 0) + 1;
      counters.chatSearchDirtyRoots = Number(counters.chatSearchDirtyRoots || 0) + dirty.size;
    } else {
      clearHighlights();
      matches = [];
      for (const root of messageRoots()) {
        if (!rootMatches(root, matcher)) continue;
        root.classList.add(MATCH_CLASS);
        matches.push(root);
      }
      const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.chatSearchFullPasses = Number(counters.chatSearchFullPasses || 0) + 1;
    }

    if (!matches.length) { currentIndex = -1; syncControls(); return; }
    const previousIndex = previousRoot ? matches.indexOf(previousRoot) : -1;
    setCurrent(previousIndex >= 0 ? previousIndex : Math.min(Math.max(currentIndex, 0), matches.length - 1), { scroll });
  }
  function setQuery(value, { scroll = false } = {}) { query = cleanText(value); lastSearchSignature = ""; runSearch({ keepCurrent:false, scroll, force:true }); }
  function setScope(value) { scope = ["all","bot","user","bookmarked"].includes(value) ? value : "all"; lastSearchSignature = ""; runSearch({ keepCurrent:false, scroll:false, force:true }); }

  function findLoadPreviousMessagesButton() {
    return Array.from(document.querySelectorAll("button"))
      .filter(button => visible(button) && !button.closest(`#${FLOATING_PANEL_ID}`) && !button.closest("#ds-qol-panel"))
      .find(button => !!button.querySelector("[data-translate-key='chat:page.action.loadPreviousMessages']") || cleanText(button.textContent).toLowerCase().includes("load previous messages")) || null;
  }
  function updateLoadOlderButtons() {
    const available = !!(isEnabled() && findLoadPreviousMessagesButton());
    const until = optionState().loadUntilMatch && !!query;
    allLoadOlderButtons().forEach(button => {
      const hidden = !available;
      if (button.hidden !== hidden) button.hidden = hidden;
      const text = until ? "Find older match" : "Load older";
      DS.setTextIfChanged?.(button, text) ?? (button.textContent = text);
      const title = until ? "Keep loading older SpicyChat message batches until this search finds a match or history runs out" : "Load the next batch of older SpicyChat messages and search again";
      DS.setAttributeIfChanged?.(button, "title", title) ?? (button.title = title);
    });
  }
  async function clickLoadPrevious() {
    const button = findLoadPreviousMessagesButton(); if (!button) return false;
    const oldCount = document.querySelectorAll(MESSAGE_SELECTOR).length;
    if (typeof DS.realClick === "function") DS.realClick(button, { scroll:false }); else button.click();
    for (let i=0;i<20;i++) { await DS.sleep?.(120); if (document.querySelectorAll(MESSAGE_SELECTOR).length > oldCount || !findLoadPreviousMessagesButton()) break; }
    DS.state.domRevision = Number(DS.state.domRevision || 0) + 1;
    lastSearchSignature = "";
    return true;
  }
  async function loadOlder() {
    if (loadOlderRunning) return;
    if (!findLoadPreviousMessagesButton()) { updateLoadOlderButtons(); DS.setQuickStatus?.("No older messages are available to load."); return; }
    loadOlderRunning = true;
    const buttons = allLoadOlderButtons(); buttons.forEach(button => button.disabled = true);
    try {
      const until = optionState().loadUntilMatch && !!query;
      let batches = 0;
      do {
        const ok = await clickLoadPrevious(); if (!ok) break;
        batches++;
        runSearch({ keepCurrent:true, scroll:false, force:true });
        if (!until || matches.length || !findLoadPreviousMessagesButton() || batches >= 30) break;
      } while (true);
      if (matches.length) { setCurrent(0, { scroll:true }); DS.setQuickStatus?.(`Found ${matches.length} matching message${matches.length === 1 ? "" : "s"}.`); }
      else if (!findLoadPreviousMessagesButton()) DS.setQuickStatus?.("Reached the oldest loaded history without finding a match.");
      else DS.setQuickStatus?.(`Loaded ${batches} older batch${batches === 1 ? "" : "es"}.`);
    } finally { loadOlderRunning = false; buttons.forEach(button => button.disabled = false); updateLoadOlderButtons(); }
  }

  function clearSearchState() { clearHighlights(); matches=[]; currentIndex=-1; query=""; scope="all"; lastSearchSignature=""; lastSearchDomRevision=-1; lastSearchTextRevision=-1; syncControls(); }
  function bindControlSet({ input, scopeSelect, prev, next, loadOlderButton, closeButton = null, advancedHost = null }) {
    if (!input || input.dataset.dsChatSearchBound === "1") { if (advancedHost) ensureAdvancedControls(advancedHost); return; }
    input.dataset.dsChatSearchBound = "1";
    input.addEventListener("input", () => setQuery(input.value));
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); setCurrent(currentIndex + (event.shiftKey ? -1 : 1)); }
      else if (event.key === "Escape") { event.preventDefault(); clearSearchState(); if (closeButton) closeFloatingPanel(); else input.blur(); }
    });
    scopeSelect?.addEventListener("change", () => setScope(scopeSelect.value));
    prev?.addEventListener("click", () => setCurrent(currentIndex - 1)); next?.addEventListener("click", () => setCurrent(currentIndex + 1));
    loadOlderButton?.addEventListener("click", loadOlder); closeButton?.addEventListener("click", () => { clearSearchState(); closeFloatingPanel(); });
    if (advancedHost) ensureAdvancedControls(advancedHost);
  }
  function ensureScopeOptions(select) {
    if (!select) return;
    if (![...select.options].some(opt => opt.value === "bookmarked")) {
      const option = document.createElement("option"); option.value = "bookmarked"; option.textContent = "Bookmarked messages"; select.appendChild(option);
    }
  }
  function bindQuickPanelControls() {
    const input=quickPanelInput(), select=quickPanelScope(); ensureScopeOptions(select);
    const host = document.getElementById("ds-qol-current-chat-search-tools");
    bindControlSet({ input, scopeSelect:select, prev:document.getElementById("ds-qol-current-chat-search-prev"), next:document.getElementById("ds-qol-current-chat-search-next"), loadOlderButton:document.getElementById("ds-qol-current-chat-search-load-older"), advancedHost:host });
    syncControls(); updateLoadOlderButtons();
  }
  function createFloatingPanel() {
    let host=floatingPanel(); if (host) return host;
    host=document.createElement("div"); host.id=FLOATING_PANEL_ID; host.setAttribute("role","search"); host.setAttribute("aria-label","Search inside current chat");
    const input=document.createElement("input"); input.className="ds-chat-search-input"; input.type="search"; input.placeholder="Search this chat..."; input.autocomplete="off"; input.spellcheck=false; input.setAttribute("aria-label","Search this chat");
    const select=document.createElement("select"); select.className="ds-chat-search-scope"; select.setAttribute("aria-label","Search messages from");
    [["all","All"],["bot","Bot"],["user","You"],["bookmarked","Bookmarked"]].forEach(([v,l]) => { const o=document.createElement("option"); o.value=v; o.textContent=l; select.appendChild(o); });
    const prev=document.createElement("button"); prev.type="button"; prev.className="ds-chat-search-prev"; prev.textContent="‹"; prev.title="Previous result";
    const next=document.createElement("button"); next.type="button"; next.className="ds-chat-search-next"; next.textContent="›"; next.title="Next result";
    const count=document.createElement("span"); count.className="ds-chat-search-count"; count.textContent="0 / 0";
    const load=document.createElement("button"); load.type="button"; load.className="ds-chat-search-load-older"; load.textContent="Load older";
    const close=document.createElement("button"); close.type="button"; close.className="ds-chat-search-close"; close.textContent="×"; close.title="Close chat search";
    host.append(input,select,prev,next,count,load,close); document.documentElement.appendChild(host);
    bindControlSet({ input,scopeSelect:select,prev,next,loadOlderButton:load,closeButton:close,advancedHost:host }); syncControls(); updateLoadOlderButtons();
    setTimeout(() => { try { input.focus({preventScroll:true}); } catch { input.focus(); } },0); return host;
  }
  function closeFloatingPanel() { floatingPanel()?.remove(); }
  function getProfileAnchor() { return document.querySelector("a[aria-label='chatbot-profile'][href*='/chatbot/']"); }
  function ensureHeaderButton() {
    if (!showFindButtonPlacement()) { removeHeaderButton(); return null; }
    const profile=getProfileAnchor(), host=profile?.parentElement; if (!profile || !host) return null; DS.setClassState?.(host, "ds-chat-title-actions-host", true);
    let actions=host.querySelector(":scope > .ds-chat-title-buttons"); if (!actions) { actions=document.createElement("span"); actions.className="ds-chat-title-buttons"; profile.insertAdjacentElement("afterend",actions); }
    let button=actions.querySelector(`.${BUTTON_CLASS}`); if (!button) { button=document.createElement("button"); button.type="button"; button.className=`ds-chat-title-mini-button ${BUTTON_CLASS}`; button.textContent="Find"; button.title="Search inside current chat"; button.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); if (floatingPanel()) { clearSearchState(); closeFloatingPanel(); } else createFloatingPanel(); },true); actions.appendChild(button); }
    return button;
  }
  function removeHeaderButton() { document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(b=>b.remove()); document.querySelectorAll(".ds-chat-title-buttons").forEach(a=>{if(!a.children.length)a.remove();}); }
  function removeAll() { clearSearchState(); closeFloatingPanel(); removeHeaderButton(); document.querySelectorAll(".ds-chat-search-advanced").forEach(el=>el.remove()); DS.state.chatSearchWasActive=false; }

  DS.applyChatSearch = function applyChatSearch() {
    if (!isEnabled()) { removeAll(); return; }
    DS.state.chatSearchWasActive=true;
    if (showPanelPlacement()) bindQuickPanelControls();
    ensureHeaderButton(); if (!showFindButtonPlacement()) closeFloatingPanel();
    if (query) runSearch({ keepCurrent:true, scroll:false });
    updateLoadOlderButtons(); syncControls();
  };
  DS.bindChatSearchQuickPanel=bindQuickPanelControls;
  DS.refreshChatSearch=()=>runSearch({keepCurrent:true,scroll:false,force:true});
  DS.chatSearchPrevious=()=>setCurrent(currentIndex-1); DS.chatSearchNext=()=>setCurrent(currentIndex+1); DS.chatSearchLoadOlder=loadOlder; DS.chatSearchReset=clearSearchState;
  DS.openChatSearch=function openChatSearch(){ if(!isEnabled()) return DS.setQuickStatus?.("Enable Search inside current chat in Settings first."); if(showFindButtonPlacement()){createFloatingPanel();return;} if(!showPanelPlacement()) return DS.setQuickStatus?.("Choose a Search Inside Current Chat placement in Settings first."); DS.createQuickPanel?.(); DS.updateQuickPanel?.(); bindQuickPanelControls(); const panel=document.getElementById("ds-qol-panel"); if(panel?.classList.contains("ds-closed")) panel.querySelector(".ds-qol-toggle")?.click(); const input=quickPanelInput(); if(input)setTimeout(()=>{try{input.focus({preventScroll:true})}catch{input.focus()}},0);};
  DS.removeChatSearch=removeAll;
})();
