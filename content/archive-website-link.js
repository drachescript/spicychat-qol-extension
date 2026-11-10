// External public archive shortcut. No fetches or background observers.
// Called by the existing route/listing scheduler only when needed.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const CLASS = "ds-archive-website-link";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const BASE = "https://spicychatarchive.drache.uk/bot/?id=";
  let lastRoute = "";
  let lastRevision = -1;
  let lastEnabled = null;

  const botId = raw => {
    const id = String(raw || "").trim();
    return UUID.test(id) ? id.toLowerCase() : "";
  };
  const linkFor = id => BASE + encodeURIComponent(id);
  const active = () => DS.state?.settings?.enabled !== false &&
    DS.state?.settings?.showArchiveWebsiteLinks === true;

  function createLink(id, context) {
    const anchor = document.createElement("a");
    anchor.className = CLASS + " ds-archive-website-link-" + context;
    anchor.dataset.dsArchiveBotId = id;
    anchor.href = linkFor(id);
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = "Archive ↗";
    anchor.title = "Open this bot in the independent SpicyChat Archive (may not have a saved record)";
    anchor.setAttribute("aria-label", "Open bot in SpicyChat Archive (new tab)");
    anchor.style.cssText = "display:inline-flex;align-items:center;justify-content:center;" +
      "gap:4px;padding:5px 8px;border:1px solid rgba(148,163,184,.5);border-radius:7px;" +
      "background:rgba(21,26,38,.92);color:#f5f5f5;font:600 11px/1.3 system-ui,sans-serif;" +
      "text-decoration:none;white-space:nowrap;cursor:pointer;";
    // Native bot cards often have delegated click handlers on their wrapper.
    for (const type of ["pointerdown", "mousedown", "click"]) {
      anchor.addEventListener(type, event => event.stopPropagation());
    }
    return anchor;
  }

  function cleanup() {
    document.querySelectorAll("." + CLASS).forEach(link => link.remove());
  }

  function addToCard(card, nativeAnchor) {
    if (!card?.isConnected || !nativeAnchor || card.closest?.("nav, header, footer, aside")) return;
    if (card.closest?.("#ds-qol-panel, [role='dialog']")) return;
    const id = botId(DS.botIdFromHref?.(nativeAnchor.href) || DS.chatIdFromHref?.(nativeAnchor.href));
    if (!id) return;
    // Do not insert a link within another link or add controls to giant grids.
    if (card === nativeAnchor || card.closest?.("a[href]")) return;
    if (card.querySelectorAll("a[href*='/chat/'],a[href*='/chatbot/']").length > 8) return;
    let link = [...card.children].find(el => el.classList?.contains(CLASS));
    if (link && link.dataset.dsArchiveBotId === id) return;
    link?.remove();
    link = createLink(id, "card");
    if (getComputedStyle(card).position === "static") card.style.position = "relative";
    link.style.position = "absolute";
    link.style.bottom = "7px";
    link.style.right = "7px";
    link.style.zIndex = "10";
    card.appendChild(link);
  }

  function addToProfile() {
    const path = String(location.pathname || "");
    const match = path.match(/^\/(?:[a-z]{2}\/)?chatbot\/([^/?#]+)\/?$/i);
    const id = botId(match?.[1]);
    if (!id || !DS.isBotProfilePage?.()) return;
    const heading = [...document.querySelectorAll("h1")].find(el => !el.closest("header,nav,[role='dialog']"));
    if (!heading) return;
    let link = document.querySelector("." + CLASS + ".ds-archive-website-link-profile");
    if (link?.dataset.dsArchiveBotId === id && link.isConnected) return;
    link?.remove();
    link = createLink(id, "profile");
    link.style.margin = "8px 0";
    heading.insertAdjacentElement("afterend", link);
  }

  DS.applyArchiveWebsiteLinks = function applyArchiveWebsiteLinks() {
    const enabled = active();
    const route = String(location.href || "");
    const revision = Number(DS.state?.domRevision || 0);
    if (!enabled) {
      if (lastEnabled !== false || document.querySelector("." + CLASS)) cleanup();
      lastEnabled = false;
      lastRoute = route;
      lastRevision = revision;
      return;
    }
    if (lastRoute === route && lastRevision === revision && lastEnabled === true) return;
    lastRoute = route;
    lastRevision = revision;
    lastEnabled = true;

    const page = DS.getPageState?.() || {};
    if (page.isBotProfilePage) {
      document.querySelectorAll("." + CLASS + ".ds-archive-website-link-card").forEach(el => el.remove());
      addToProfile();
    } else if (page.routeType === "listing" || page.routeType === "creator-listing" || page.isFavoriteBotsPage || page.isMyCreationsChatbotsPage) {
      document.querySelectorAll("." + CLASS + ".ds-archive-website-link-profile").forEach(el => el.remove());
      for (const {card, anchor} of DS.collectCards?.() || []) addToCard(card, anchor);
    } else {
      cleanup();
    }
  };
})();
}
