(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || window.__DS_QOL_MY_CHATBOT_CARD_SHORTCUTS__) return;
  window.__DS_QOL_MY_CHATBOT_CARD_SHORTCUTS__ = true;

  const STYLE_ID = "ds-my-chatbot-card-shortcuts-style";
  const EDIT_CLASS = "ds-my-chatbot-edit-button";
  const FAVORITE_SETTING = "showCreatorFavoriteButtonsOnMyChatbots";
  const EDIT_SETTING = "showMyChatbotEditButtons";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i;

  let favoriteWrapperInstalled = false;
  let favoriteOriginal = null;
  let applyTimer = null;
  let observer = null;

  function settings() {
    return DS.state?.settings || {};
  }

  function normalizedPath() {
    return String(location.pathname || "/")
      .replace(/^\/[a-z]{2}(?=\/)/i, "")
      .replace(/\/+$/, "") || "/";
  }

  function isMyChatbotsPage() {
    return normalizedPath() === "/my-creations/chatbots";
  }

  function favoriteButtonsAllowedHere() {
    return !isMyChatbotsPage() || settings()[FAVORITE_SETTING] === true;
  }

  function editButtonsEnabled() {
    return isMyChatbotsPage() &&
      settings().enabled !== false &&
      settings()[EDIT_SETTING] === true;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.dsOwned = "1";
    style.textContent = `
      .${EDIT_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 19px;
        height: 19px;
        flex: 0 0 19px;
        border-radius: 5px;
        color: inherit;
        opacity: .78;
        text-decoration: none;
        background: transparent;
      }
      .${EDIT_CLASS}:hover {
        opacity: 1;
        background: rgba(148,163,184,.16);
      }
      .${EDIT_CLASS} svg {
        width: 12px;
        height: 12px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function creatorFavoriteCleanup() {
    DS.removeCreatorFavoriteButtons?.();
  }

  function installFavoriteGuard() {
    if (favoriteWrapperInstalled) return true;
    const current = DS.updateCreatorFavoriteButtons;
    if (typeof current !== "function") return false;

    favoriteOriginal = current;
    DS.updateCreatorFavoriteButtons = function guardedCreatorFavoriteButtons(...args) {
      if (!favoriteButtonsAllowedHere()) {
        creatorFavoriteCleanup();
        return;
      }
      return favoriteOriginal.apply(this, args);
    };

    favoriteWrapperInstalled = true;
    return true;
  }

  function cardFromNode(node) {
    let current = node instanceof Element ? node : node?.parentElement;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      if (!(current instanceof Element)) continue;
      const cls = String(current.className || "");
      if (/\bgroup\b/.test(cls) && /rounded-xl/.test(cls) && current.querySelector("svg.lucide-ellipsis-vertical")) {
        return current;
      }
    }
    return null;
  }

  function botIdFromHref(href) {
    try {
      const url = new URL(String(href || ""), location.origin);
      const match = url.pathname.match(/^\/chat\/([0-9a-f-]{20,})(?:\/|$)/i);
      const id = String(match?.[1] || "").toLowerCase();
      return UUID_RE.test(id) ? id : "";
    } catch {
      return "";
    }
  }

  function botIdFromCard(card) {
    if (!card) return "";
    for (const anchor of card.querySelectorAll("a[href*='/chat/']")) {
      const id = botIdFromHref(anchor.getAttribute("href") || anchor.href);
      if (id) return id;
    }
    return "";
  }

  function makePencilLink(id) {
    const link = document.createElement("a");
    link.className = EDIT_CLASS;
    link.dataset.dsOwned = "1";
    link.dataset.dsOwner = "qol";
    link.dataset.dsFeature = "my-chatbot-edit-links";
    link.dataset.dsChatbotId = id;
    link.href = `/chatbot/edit/${encodeURIComponent(id)}`;
    link.title = "Edit chatbot";
    link.setAttribute("aria-label", "Edit chatbot");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path1.setAttribute("d", "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z");
    const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path2.setAttribute("d", "m15 5 4 4");
    svg.append(path1, path2);
    link.appendChild(svg);
    return link;
  }

  function removeEditButtons() {
    document.querySelectorAll(`.${EDIT_CLASS}`).forEach(node => node.remove());
  }

  function addEditButtons() {
    if (!editButtonsEnabled()) {
      removeEditButtons();
      return;
    }

    const seen = new Set();
    for (const chatAnchor of document.querySelectorAll("a[href*='/chat/']")) {
      const id = botIdFromHref(chatAnchor.getAttribute("href") || chatAnchor.href);
      if (!id || seen.has(id)) continue;
      const card = cardFromNode(chatAnchor);
      if (!card) continue;
      seen.add(id);
      if (card.querySelector(`.${EDIT_CLASS}[data-ds-chatbot-id="${CSS.escape(id)}"]`)) continue;

      const creator = card.querySelector("a[aria-label='creator'][href*='/creator/'], a[href*='/creator/']");
      const row = creator?.parentElement;
      if (!creator || !row) continue;

      const link = makePencilLink(id);
      const existingStar = row.querySelector(":scope > .ds-creator-fav-button");
      if (existingStar) existingStar.insertAdjacentElement("afterend", link);
      else creator.insertAdjacentElement("afterend", link);
    }
  }

  function applyNow() {
    installFavoriteGuard();

    if (!isMyChatbotsPage()) {
      removeEditButtons();
      return;
    }


    if (!favoriteButtonsAllowedHere()) {
      creatorFavoriteCleanup();
    }

    if (editButtonsEnabled()) ensureStyle();
    addEditButtons();
  }

  function scheduleApply(delay = 80) {
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyTimer = null;
      applyNow();
    }, Math.max(0, Number(delay) || 0));
  }

  function onNativeMenuCtrlClick(event) {
    if (!editButtonsEnabled() || !(event.ctrlKey || event.metaKey)) return;
    const target = event.target instanceof Element ? event.target : null;
    const ellipsis = target?.closest?.("svg.lucide-ellipsis-vertical");
    if (!ellipsis) return;
    const card = cardFromNode(ellipsis);
    const id = botIdFromCard(card);
    if (!id) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    window.open(`/chatbot/edit/${encodeURIComponent(id)}`, "_blank", "noopener");
  }

  document.addEventListener("click", onNativeMenuCtrlClick, true);

  observer = new MutationObserver(mutations => {
    if (!isMyChatbotsPage() && !document.querySelector(`.${EDIT_CLASS}`)) return;
    if (typeof DS.mutationsHaveNativeChanges === "function" && !DS.mutationsHaveNativeChanges(mutations)) return;
    scheduleApply(90);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("popstate", () => scheduleApply(50), true);
  window.addEventListener("focus", () => scheduleApply(60), true);

  installFavoriteGuard();
  scheduleApply(0);
  setTimeout(() => scheduleApply(0), 250);
  setTimeout(() => scheduleApply(0), 900);
})();
