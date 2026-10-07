(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || window.__DS_QOL_MY_CHATBOT_CARD_SHORTCUTS__) return;
  window.__DS_QOL_MY_CHATBOT_CARD_SHORTCUTS__ = true;

  const STYLE_ID = "ds-my-chatbot-card-shortcuts-style";
  const CONTROL_ID = "ds-my-chatbot-card-shortcuts-control";
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
      #${CONTROL_ID} {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      #${CONTROL_ID} > summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
        min-height: 28px;
        display: inline-flex;
        align-items: center;
        padding: 0 8px;
        border: 1px solid rgba(148,163,184,.30);
        border-radius: 7px;
        background: rgba(55,65,81,.38);
        font: 600 11px/1.1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #${CONTROL_ID} > summary::-webkit-details-marker { display: none; }
      #${CONTROL_ID}[open] > summary,
      #${CONTROL_ID} > summary:hover { background: rgba(75,85,99,.62); }
      #${CONTROL_ID} .ds-my-chatbot-card-shortcuts-popover {
        position: absolute;
        z-index: 160;
        right: 0;
        top: calc(100% + 6px);
        width: 245px;
        padding: 9px 10px;
        border: 1px solid rgba(148,163,184,.30);
        border-radius: 9px;
        background: rgba(17,24,39,.98);
        box-shadow: 0 10px 28px rgba(0,0,0,.30);
        color: inherit;
        font: 12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #${CONTROL_ID} .ds-my-chatbot-card-shortcuts-popover label {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        cursor: pointer;
        margin: 3px 0;
      }
      #${CONTROL_ID} .ds-my-chatbot-card-shortcuts-popover input {
        margin-top: 2px;
        flex: 0 0 auto;
      }
      #${CONTROL_ID} .ds-my-chatbot-card-shortcuts-hint {
        display: block;
        margin-top: 6px;
        opacity: .68;
        font-size: 10px;
      }
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
      seen.add(id);

      const card = cardFromNode(chatAnchor);
      if (!card) continue;
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

  async function saveToggle(key, checked) {
    const value = !!checked;
    if (DS.state?.settings) DS.state.settings[key] = value;
    try {
      if (typeof DS.saveSettingsPatch === "function") {
        await DS.saveSettingsPatch({ [key]: value }, { immediate: true });
      } else if (typeof DS.storageSet === "function") {
        await DS.storageSet({ settings: { ...(DS.state?.settings || {}), [key]: value } }, { immediate: true });
      }
    } catch {}

    applyNow();

    if (key === FAVORITE_SETTING && value && settings().showCreatorFavoriteButtons === true) {
      DS.updateCreatorFavoriteButtons?.();
      addEditButtons();
    }
  }

  function makeToggle(labelText, key, title = "") {
    const label = document.createElement("label");
    if (title) label.title = title;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = settings()[key] === true;
    input.addEventListener("change", () => saveToggle(key, input.checked));
    const span = document.createElement("span");
    span.textContent = labelText;
    label.append(input, span);
    return label;
  }

  function controlsAnchor() {
    const tab = document.querySelector('a[data-testid="creation-tab-chatbots"]');
    const list = tab?.closest?.("menu")?.querySelector?.("ul");
    if (!list) return null;
    const analytics = [...list.children].find(child => /creator analytics/i.test(String(child.textContent || "")));
    return { list, analytics: analytics || null };
  }

  function ensureControls() {
    if (!isMyChatbotsPage()) {
      document.getElementById(CONTROL_ID)?.closest("li")?.remove();
      return;
    }

    ensureStyle();

    const existing = document.getElementById(CONTROL_ID);
    if (existing) {
      const favorite = existing.querySelector(`[data-setting="${FAVORITE_SETTING}"]`);
      const edit = existing.querySelector(`[data-setting="${EDIT_SETTING}"]`);
      if (favorite) favorite.checked = settings()[FAVORITE_SETTING] === true;
      if (edit) edit.checked = settings()[EDIT_SETTING] === true;
      return;
    }

    const anchor = controlsAnchor();
    if (!anchor) return;

    const li = document.createElement("li");
    li.dataset.dsOwned = "1";
    li.dataset.dsOwner = "qol";
    li.dataset.dsFeature = "my-chatbot-card-shortcuts";

    const details = document.createElement("details");
    details.id = CONTROL_ID;
    details.dataset.dsOwned = "1";

    const summary = document.createElement("summary");
    summary.textContent = "QoL cards";

    const popover = document.createElement("div");
    popover.className = "ds-my-chatbot-card-shortcuts-popover";

    const favoriteToggle = makeToggle(
      "Favorite creator stars on My Chatbots",
      FAVORITE_SETTING,
      "Also requires the main Favorite creator star buttons setting."
    );
    favoriteToggle.querySelector("input").dataset.setting = FAVORITE_SETTING;

    const editToggle = makeToggle(
      "Edit buttons on My Chatbot cards",
      EDIT_SETTING
    );
    editToggle.querySelector("input").dataset.setting = EDIT_SETTING;

    const hint = document.createElement("small");
    hint.className = "ds-my-chatbot-card-shortcuts-hint";
    hint.textContent = "Both are off by default. Edit links keep normal browser Ctrl/Cmd-click, middle-click and context-menu behavior.";

    popover.append(favoriteToggle, editToggle, hint);
    details.append(summary, popover);
    li.appendChild(details);

    if (anchor.analytics) anchor.list.insertBefore(li, anchor.analytics);
    else anchor.list.appendChild(li);
  }

  function applyNow() {
    installFavoriteGuard();

    if (!isMyChatbotsPage()) {
      document.getElementById(CONTROL_ID)?.closest("li")?.remove();
      removeEditButtons();
      return;
    }

    ensureControls();

    if (!favoriteButtonsAllowedHere()) {
      creatorFavoriteCleanup();
    }

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
    if (!isMyChatbotsPage() && !document.getElementById(CONTROL_ID) && !document.querySelector(`.${EDIT_CLASS}`)) return;
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
