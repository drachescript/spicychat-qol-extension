// Local report-link collector. No automatic reports, uploads or network calls.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const BUTTON = ".ds-report-link-button";
  const REPORT_LISTING = /^\/(?:[a-z]{2}(?:\/|$))?(?:recommended-bots\/?)?$/i;
  let saved = null;
  let readPromise = null;
  let listenerInstalled = false;
  let storageListenerInstalled = false;
  let collectorActive = false;
  let displayedRoute = "";
  let lastCards = null;
  let lastRevision = -1;

  function botIdFromLink(link) {
    if (!link?.href) return "";
    const id = String(DS.botIdFromHref?.(link.href) || "").toLowerCase();
    if (!UUID.test(id)) return "";
    try {
      const url = new URL(link.href, location.href);
      if (!/^(?:www\.)?spicychat\.ai$/i.test(url.hostname) || url.protocol !== "https:") return "";
      if (!/^\/(?:chat|chatbot)\//i.test(url.pathname)) return "";
    } catch { return ""; }
    return id;
  }
  function cardLink(card, preferred) {
    if (botIdFromLink(preferred)) return preferred;
    return card?.querySelector?.("a[aria-label^='chat-with-'][href*='/chat/'], a[href*='/chatbot/'], a[href*='/chat/']") || null;
  }
  function pictureHost(card, anchor) {
    // Never overlay chat-message, navigation or generated QoL thumbnail images.
    const image = card?.querySelector?.("a[href*='/chat/'] img, a[href*='/chatbot/'] img") ||
      card?.querySelector?.("img[src*='cdn.nd-api.com'], img[src*='avatars']");
    if (!image) return null;
    const imageLink = image.closest?.("a[href]");
    // Buttons are siblings of the native image link, never nested inside it.
    const host = imageLink?.parentElement && card.contains(imageLink) ? imageLink.parentElement : image.parentElement;
    if (!host || host === card || !card.contains(host) || host.closest?.("nav, header, [role='navigation']")) return null;
    // A large unrelated container can position the icon over the description.
    // Require the host to be in the image part of this card.
    if (host.querySelector?.("textarea, [data-testid='ChatMessageItem']")) return null;
    return host;
  }
  function updateButton(button, id) {
    if (button.dataset.dsReportId !== id) button.dataset.dsReportId = id;
    const wasSaved = !!saved?.has(`https://spicychat.ai/chatbot/${id}`);
    button.classList.toggle("ds-report-link-saved", wasSaved);
    button.textContent = wasSaved ? "✓" : "+";
    const label = wasSaved ? "Already in report link list" : "Add this bot to report link list";
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  function send(message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout = 0;
      const finish = (response, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error instanceof Error ? error : new Error(String(error)));
        else resolve(response || null);
      };
      timeout = setTimeout(() => finish(null, new Error("Collector request timed out")), 10000);
      try {
        let pending;
        try { pending = chrome.runtime.sendMessage(message, response => finish(response, chrome.runtime?.lastError?.message || "")); }
        catch (_) { pending = chrome.runtime.sendMessage(message); }
        if (pending && typeof pending.then === "function") pending.then(finish, error => finish(null, error));
      } catch (error) { finish(null, error); }
    });
  }
  async function readOnce() {
    if (saved) return saved;
    if (!readPromise) {
      readPromise = send({ type: "DS_REPORT_LINK_GET" }).then(response => {
        if (!response?.ok || !Array.isArray(response.links)) throw new Error("Collector storage unavailable");
        saved = new Set(response.links);
        return saved;
      }).catch(() => null).finally(() => { readPromise = null; });
    }
    return readPromise;
  }
  function onClick(event) {
    const target = event.target;
    const button = target?.closest?.(BUTTON);
    if (!button || !document.contains(button)) return;
    // SPA navigation can change the route before the next normal render pass.
    if (!REPORT_LISTING.test(DS.normalizedRoutePath?.() || location.pathname)) { cleanup(); return; }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (!DS.state?.settings?.enabled || button.disabled) return;
    const card = button.closest("[data-ds-report-card='1']");
    const id = botIdFromLink(cardLink(card));
    if (!id || !card || !card.contains(button)) return;
    if (saved?.has(`https://spicychat.ai/chatbot/${id}`)) {
      updateButton(button, id);
      return;
    }
    button.disabled = true;
    button.textContent = "…";
    send({ type: "DS_REPORT_LINK_ADD", id }).then(response => {
      if (!response?.ok) throw new Error(response?.error || "Could not save link");
      saved ||= new Set();
      saved.add(response.link);
      for (const other of document.querySelectorAll(BUTTON)) {
        if (other.dataset.dsReportId === id) updateButton(other, id);
      }
      DS.setQuickStatus?.(response.added ? `Bot link saved (${response.count})` : "Bot link already saved");
    }).catch(error => {
      DS.setQuickStatus?.(`Report collector: ${error?.message || "storage failed"}`);
      button.textContent = "!";
    }).finally(() => { button.disabled = false; if (button.isConnected && id === botIdFromLink(cardLink(card))) updateButton(button, id); });
  }
  function onStorageChange(changes, area) {
    if (area !== "local" || !changes?.dsReportBotLinksV1 || !collectorActive) return;
    const next = changes.dsReportBotLinksV1.newValue;
    const links = Array.isArray(next) ? next.filter(value => /^https:\/\/spicychat\.ai\/chatbot\/[0-9a-f-]{36}$/i.test(String(value))) : [];
    saved = new Set(links);
    for (const button of document.querySelectorAll(BUTTON)) {
      const id = button.dataset.dsReportId || "";
      if (UUID.test(id)) updateButton(button, id);
    }
  }
  function cleanup() {
    if (!collectorActive) return;
    collectorActive = false;
    if (listenerInstalled) { document.removeEventListener("click", onClick, true); listenerInstalled = false; }
    if (storageListenerInstalled) { chrome.storage?.onChanged?.removeListener?.(onStorageChange); storageListenerInstalled = false; }
    saved = null;
    document.querySelectorAll(BUTTON).forEach(button => button.remove());
    document.querySelectorAll("[data-ds-report-card='1']").forEach(card => delete card.dataset.dsReportCard);
    document.querySelectorAll(".ds-report-link-image-host").forEach(host => host.classList.remove("ds-report-link-image-host"));
    displayedRoute = "";
    lastCards = null;
    lastRevision = -1;
  }
  DS.removeReportLinkCollector = cleanup;
  DS.applyReportLinkCollector = function applyReportLinkCollector() {
    if (!REPORT_LISTING.test(DS.normalizedRoutePath?.() || location.pathname) || !DS.state?.settings?.enabled || DS.state.settings.enableReportLinkCollector !== true || DS.isQolPausedForTab?.()) { cleanup(); return; }
    const cards = DS.collectCards?.() || [];
    const route = location.href;
    const revision = Number(DS.state?.domRevision || 0);
    // The collector follows the existing changed-card pipeline. Identical
    // collections do not rescan picture subtrees on every scheduled pass.
    if (route === displayedRoute && cards === lastCards && revision === lastRevision) return;
    displayedRoute = route;
    lastCards = cards;
    lastRevision = revision;
    collectorActive = true;
    if (!listenerInstalled) { document.addEventListener("click", onClick, true); listenerInstalled = true; }
    if (!storageListenerInstalled && chrome.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener(onStorageChange);
      storageListenerInstalled = true;
    }
    if (!saved) readOnce().then(links => {
      if (!links) return;
      for (const button of document.querySelectorAll(BUTTON)) {
        if (UUID.test(button.dataset.dsReportId || "")) updateButton(button, button.dataset.dsReportId);
      }
    });
    for (const {card, anchor} of cards) {
      // collectCards already excludes chat-message and navigation links.
      // Accept the differing native image wrappers on Home and Recommendations.
      if (!card?.isConnected || card.closest?.("nav, [role='navigation'], [data-testid='ChatMessageItem']")) continue;
      const link = cardLink(card, anchor);
      const id = botIdFromLink(link);
      if (!id) continue;
      const host = pictureHost(card, link);
      if (!host) continue;
      const imageLink = host.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
      if (imageLink && botIdFromLink(imageLink) && botIdFromLink(imageLink) !== id) continue;
      card.dataset.dsReportCard = "1";
      // A recycled card may have moved its image. Remove old detached-from-
      // picture controls rather than keeping an icon over another bot.
      for (const old of card.querySelectorAll?.(BUTTON) || []) if (old.parentElement !== host) old.remove();
      let button = host.querySelector(":scope > .ds-report-link-button");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "ds-report-link-button";
        DS.markQolOwned?.(button, "report-collector");
        host.classList.add("ds-report-link-image-host");
        host.appendChild(button);
      }
      updateButton(button, id);
    }
  };
  // A single listener stays installed while QoL is active, without retaining
  // card references. Page teardown releases every DOM card automatically.
})();
