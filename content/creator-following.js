(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  function normalizeHandle(value) {
    return String(value || "")
      .replace(/^https?:\/\/[^/]+\/creator\//i, "")
      .replace(/^\/creator\//i, "")
      .replace(/[?#].*$/g, "")
      .replace(/^@+/, "")
      .trim();
  }

  function handleFromHref(href) {
    try {
      const url = new URL(href, location.origin);
      const match = url.pathname.match(/^\/creator\/([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    } catch {
      return "";
    }
  }

  function currentCreatorHandle() {
    const match = String(location.pathname || "").match(/^\/creator\/([^/?#]+)/i);
    return match ? normalizeHandle(decodeURIComponent(match[1])) : "";
  }

  function normalizeStore(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      handles: DS.uniqueClean(Array.isArray(source.handles) ? source.handles.map(normalizeHandle) : []),
      meta: source.meta && typeof source.meta === "object" ? source.meta : {}
    };
  }

  function getStore() {
    DS.state.followedCreators = normalizeStore(DS.state.followedCreators);
    return DS.state.followedCreators;
  }

  function labelFor(anchor, handle) {
    const text = String(anchor?.textContent || "").replace(/\s+/g, " ").trim();
    return text || `@${handle}`;
  }

  DS.normalizeFollowedCreatorStore = normalizeStore;
  DS.canFollowCreator = handle => !!normalizeHandle(handle);
  DS.canNotifyForCreator = handle => !!normalizeHandle(handle);

  DS.isFollowedCreator = function isFollowedCreator(handleOrHref) {
    const handle = normalizeHandle(String(handleOrHref || "").includes("/creator/") ? handleFromHref(handleOrHref) : handleOrHref);
    return !!handle && getStore().handles.includes(handle);
  };

  async function toggle(anchor, button) {
    const handle = normalizeHandle(button?.dataset.dsCreatorHandle || handleFromHref(anchor?.href || ""));
    if (!handle) return;

    const store = getStore();
    const exists = store.handles.includes(handle);
    if (exists) {
      store.handles = store.handles.filter(item => item !== handle);
      delete store.meta[handle];
      DS.setQuickStatus?.(`Unfollowed @${handle}.`);
    } else {
      const label = button?.dataset?.dsCreatorLabel || labelFor(anchor, handle);
      store.handles.push(handle);
      store.meta[handle] = {
        ...(store.meta[handle] || {}),
        handle,
        name: label,
        url: `https://spicychat.ai/creator/${encodeURIComponent(handle)}`,
        savedAt: Date.now()
      };
      DS.setQuickStatus?.(`Following ${label}.`);
    }

    store.handles = DS.uniqueClean(store.handles.map(normalizeHandle));
    DS.state.followedCreators = store;
    await DS.saveFollowedCreators?.(store);
    DS.updateCreatorFollowButtons?.();
  }

  function updateButton(button) {
    const handle = normalizeHandle(button.dataset.dsCreatorHandle);
    const following = DS.isFollowedCreator(handle);
    button.textContent = following ? "Following" : "Follow";
    button.classList.toggle("is-following", following);
    button.classList.remove("is-consent-pending");
    button.setAttribute("aria-pressed", following ? "true" : "false");
    button.title = following
      ? `Unfollow @${handle}`
      : `Follow @${handle} locally with SpicyChat QoL and optionally watch for new public bots`;
  }

  DS.removeCreatorFollowButtons = function removeCreatorFollowButtons() {
    document.querySelectorAll(".ds-creator-follow-button").forEach(button => button.remove());
  };

  DS.updateCreatorFollowButtons = function updateCreatorFollowButtons() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.showFollowCreatorButtons) {
      DS.removeCreatorFollowButtons();
      return;
    }

    for (const anchor of DS.qsa?.("a[href*='/creator/']") || []) {
      if (anchor.closest("#ds-qol-panel, .ds-creator-follow-row, .ds-creator-fav-row")) continue;
      const handle = normalizeHandle(handleFromHref(anchor.href || ""));
      if (!handle) continue;
      const following = DS.isFollowedCreator(handle);

      let button = anchor.parentElement?.querySelector?.(`:scope > .ds-creator-follow-button[data-ds-creator-handle="${CSS.escape(handle)}"]`) || null;
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "ds-creator-follow-button";
        button.dataset.dsCreatorHandle = handle;
        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          toggle(anchor, button);
        });
        const favoriteButton = anchor.parentElement?.querySelector?.(`:scope > .ds-creator-fav-button[data-ds-creator-handle="${CSS.escape(handle)}"]`);
        if (favoriteButton) favoriteButton.insertAdjacentElement("afterend", button);
        else anchor.insertAdjacentElement("afterend", button);
      }
      updateButton(button);
    }

    // Creator profile headings do not contain a /creator/ link of their own.
    // Keep Follow / Following available there too, especially when QoL filters
    // hide every card and therefore remove the card-level creator links.
    const pageHandle = currentCreatorHandle();
    if (pageHandle) {
      const titleText = document.querySelector('[data-translate-key="creator:page.title"]');
      const titleHost = titleText?.parentElement || null;
      if (titleHost && !titleHost.closest("#ds-qol-panel")) {
        let pageButton = titleHost.querySelector(`:scope > .ds-creator-follow-button[data-ds-creator-page="1"]`);
        if (!pageButton) {
          pageButton = document.createElement("button");
          pageButton.type = "button";
          pageButton.className = "ds-creator-follow-button ds-creator-follow-page-button";
          pageButton.dataset.dsCreatorPage = "1";
          pageButton.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            toggle(titleText, pageButton);
          });
          titleHost.appendChild(pageButton);
        }
        pageButton.dataset.dsCreatorHandle = pageHandle;
        pageButton.dataset.dsCreatorLabel = `@${pageHandle}`;
        updateButton(pageButton);
      }
    }
  };
})();
