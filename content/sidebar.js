(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  let sidebarObserver = null;
  let observedSidebarNav = null;
  let sidebarDirty = true;
  let lastSidebarSettingsSignature = "";

  function sidebarSettingsSignature(settings = {}) {
    const cleanup = Object.keys(settings)
      .filter(key => key.startsWith("hideSidebar"))
      .sort()
      .map(key => `${key}:${settings[key] ? 1 : 0}`)
      .join("|");
    return `${cleanup}|qol:${settings.showQolSidebarButton ? 1 : 0}|qolpos:${String(settings.qolSidebarButtonPlacement || "after-sai")}|enabled:${settings.enabled ? 1 : 0}`;
  }

  function ensureSidebarObserver() {
    const nav = getNav();
    if (!nav) {
      sidebarObserver?.disconnect?.();
      sidebarObserver = null;
      observedSidebarNav = null;
      sidebarDirty = true;
      return;
    }
    if (sidebarObserver && observedSidebarNav === nav) return;

    sidebarObserver?.disconnect?.();
    observedSidebarNav = nav;
    sidebarDirty = true;
    sidebarObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          ["class", "style", "hidden", "aria-hidden", "data-ds-hidden", "data-ds-reason"].includes(String(mutation.attributeName || "")) &&
          (String(mutation.target?.dataset?.dsReason || "").startsWith("sidebar:") ||
           mutation.target?.classList?.contains?.("ds-hidden"))
        ) {
          continue;
        }
        if (DS.mutationIsQolOnly?.(mutation)) continue;
        sidebarDirty = true;
        return;
      }
    });
    sidebarObserver.observe(nav, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "aria-label", "data-tooltip-content", "id", "class", "style", "hidden", "aria-hidden", "data-ds-hidden", "data-ds-reason"]
    });
  }

  function getNav() {
    return document.querySelector("nav") || document.querySelector('[role="navigation"]');
  }

  function textOf(el) {
    if (!el) return "";
    const direct = DS.normalize(el.textContent || "");
    if (direct) return direct;

    // Chrome's installed SpicyChat web-app/compact sidebar removes the visible
    // label text and keeps it only on the tooltip wrapper. Read that fallback
    // so the same cleanup settings work in the normal tab and installed app.
    const tooltip =
      el.getAttribute?.("data-tooltip-content") ||
      el.closest?.("[data-tooltip-content]")?.getAttribute?.("data-tooltip-content") ||
      "";
    return DS.normalize(tooltip);
  }

  function ariaOf(el) {
    return DS.normalize(el?.getAttribute?.("aria-label") || "");
  }

  function hrefOf(el) {
    return String(el?.getAttribute?.("href") || el?.href || "");
  }

  function isSignInElement(el) {
    if (!el) return false;

    const text = textOf(el);
    const aria = ariaOf(el);

    return (
      text.includes("sign in") ||
      aria.includes("sign in") ||
      aria === "login"
    );
  }

  function isSignOutElement(el) {
    if (!el) return false;

    const text = textOf(el);
    const aria = ariaOf(el);

    return text.includes("sign out") || aria.includes("sign out");
  }

  function isSaiToolkitElement(el) {
    return !!el && (el.id === "sai-toolkit-sidebar-btn" || !!el.querySelector?.("#sai-toolkit-sidebar-btn") || !!el.closest?.("#sai-toolkit-sidebar-btn"));
  }

  function protectSaiToolkitSidebarButton() {
    const button = document.getElementById("sai-toolkit-sidebar-btn");
    if (!button) return;
    let el = button;
    for (let i = 0; el && i < 4; i++, el = el.parentElement) {
      if (String(el.dataset?.dsReason || "").startsWith("sidebar:")) DS.unhideElement?.(el);
      el.classList?.remove("ds-hidden", "ds-dimmed");
      if (el.dataset) {
        delete el.dataset.dsHidden;
        if (String(el.dataset.dsReason || "").startsWith("sidebar:")) delete el.dataset.dsReason;
      }
      if (el.tagName === "NAV") break;
    }
  }

  function sidebarRowFor(el) {
    if (!el) return null;
    let node = el instanceof Element ? el : null;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      if (node.classList?.contains("w-full") && node.parentElement?.classList?.contains("flex-col")) return node;
    }
    return el.closest?.(".w-full") || el.closest?.("a") || el;
  }

  function makeQolSidebarButton() {
    const row = document.createElement("div");
    row.className = "w-full ds-qol-sidebar-row";
    row.dataset.dsOwned = "1";

    const button = document.createElement("button");
    button.id = "ds-qol-sidebar-btn";
    button.type = "button";
    button.className = "ds-qol-sidebar-button w-full flex items-center gap-2 px-2.5 h-10 justify-between rounded-md cursor-pointer bg-transparent text-gray-12 dark:text-gray-12 hover:bg-gray-4 dark:hover:bg-gray-4";
    button.title = "SpicyChat QoL";
    button.setAttribute("aria-label", "SpicyChat QoL settings");

    const inner = document.createElement("div");
    inner.className = "flex items-center gap-2";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("ds-qol-sidebar-icon", "flex-none");
    for (const [d] of [
      ["M4 21v-7"], ["M4 10V3"], ["M12 21v-9"], ["M12 8V3"],
      ["M20 21v-5"], ["M20 12V3"], ["M1 14h6"], ["M9 8h6"], ["M17 16h6"]
    ]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }

    const label = document.createElement("p");
    label.className = "ds-qol-sidebar-button-text font-sans text-decoration-skip-ink-none text-underline-position-from-font text-label-lg font-regular text-left truncate";
    label.textContent = "SpicyChat QoL";

    inner.append(svg, label);
    button.appendChild(inner);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      DS.openOptionsTarget?.("general", { search: "Sidebar cleanup" });
    }, true);
    row.appendChild(button);
    return row;
  }

  function findTextButtonRow(label) {
    const nav = getNav();
    if (!nav) return null;
    const wanted = DS.normalize(label);
    const button = DS.qsa("button", nav).find(item => textOf(item) === wanted);
    return sidebarRowFor(button);
  }

  function findHrefRow(pathPart) {
    const nav = getNav();
    if (!nav) return null;
    const link = DS.qsa("a", nav).find(item => hrefOf(item).includes(pathPart));
    return sidebarRowFor(link);
  }

  function placeQolSidebarButton(settings) {
    const existing = document.getElementById("ds-qol-sidebar-btn")?.closest?.(".ds-qol-sidebar-row");
    if (!settings.enabled || !settings.showQolSidebarButton) {
      existing?.remove();
      return;
    }

    const nav = getNav();
    if (!nav) return;
    const row = existing || makeQolSidebarButton();
    const placement = String(settings.qolSidebarButtonPlacement || "after-sai");
    let anchorRow = null;
    let before = false;

    if (placement === "after-recommendations") anchorRow = findHrefRow("/recommended-bots");
    else if (placement === "after-favorites") anchorRow = findHrefRow("/favorite-bots");
    else if (placement === "before-help") {
      anchorRow = findTextButtonRow("Help");
      before = true;
    } else {
      anchorRow = sidebarRowFor(document.getElementById("sai-toolkit-sidebar-btn"));
      if (!anchorRow) anchorRow = findTextButtonRow("Help");
    }

    if (!anchorRow?.parentElement) {
      const scroll = nav.querySelector(":scope > div.flex.flex-col.flex-1") || nav.querySelector("div.flex.flex-col.flex-1");
      const lastSection = scroll ? [...scroll.children].filter(el => el instanceof Element).at(-1) : null;
      if (lastSection) {
        lastSection.appendChild(row);
        return;
      }
      return;
    }

    if (before) {
      if (row.parentElement !== anchorRow.parentElement || row.nextElementSibling !== anchorRow) {
        anchorRow.parentElement.insertBefore(row, anchorRow);
      }
    } else if (row.parentElement !== anchorRow.parentElement || anchorRow.nextElementSibling !== row) {
      anchorRow.insertAdjacentElement("afterend", row);
    }
  }

  function hideSidebarElement(el, reason) {
    if (!el || isSignInElement(el) || isSaiToolkitElement(el)) return;
    DS.hideElement(el, reason);
  }

  function hideButtonById(id, reason) {
    const button = document.getElementById(id);
    if (!button) return;

    hideSidebarElement(button.closest("a") || button, reason);
  }

  function hideLinksByHrefPart(hrefPart, reason) {
    const nav = getNav();
    if (!nav) return;

    DS.qsa("a", nav).forEach(link => {
      const href = hrefOf(link);
      if (href.includes(hrefPart)) {
        hideSidebarElement(link, reason);
      }
    });
  }

  function hideLinksByExactPath(path, reason) {
    const nav = getNav();
    if (!nav) return;

    DS.qsa("a", nav).forEach(link => {
      try {
        const url = new URL(link.href || hrefOf(link), location.origin);
        if (url.pathname === path) {
          hideSidebarElement(link, reason);
        }
      } catch {}
    });
  }

  function hideButtonByExactText(textToMatch, reason) {
    const nav = getNav();
    if (!nav) return;

    const wanted = DS.normalize(textToMatch);

    DS.qsa("button", nav).forEach(button => {
      if (textOf(button) === wanted) {
        hideSidebarElement(button.closest("a") || button, reason);
      }
    });
  }

  function hideLogo() {
    const nav = getNav();
    if (!nav) return;

    DS.qsa(
      'a[aria-label="home"] img, img[alt*="Spicychat"], img[alt*="SpicyChat"]',
      nav
    ).forEach(img => hideSidebarElement(img, "sidebar:logo"));
  }

  const FOOTER_LINK_MATCHERS = {
    terms(link) {
      return ariaOf(link) === "terms" || footerPath(link) === "/terms";
    },
    privacy(link) {
      return ariaOf(link) === "privacy" || footerPath(link) === "/privacy";
    },
    refunds(link) {
      return ariaOf(link) === "refunds" || footerPath(link) === "/refund";
    },
    reporting(link) {
      return ariaOf(link) === "reporting" || footerPath(link) === "/report";
    },
    guidelines(link) {
      const href = hrefOf(link).toLowerCase();
      return ariaOf(link) === "guidelines" || href.includes("community-guidelines");
    },
    support(link) {
      const href = hrefOf(link).toLowerCase();
      return ariaOf(link) === "support" || href.includes("docs.spicychat.ai/support");
    },
    affiliates(link) {
      const href = hrefOf(link).toLowerCase();
      return ariaOf(link) === "affiliates" || href.includes("promote.spicychat.ai");
    }
  };

  function footerPath(link) {
    try {
      return new URL(link?.href || hrefOf(link), location.origin).pathname.replace(/\/+$/, "") || "/";
    } catch {
      return "";
    }
  }

  function hideFooterLink(kind) {
    const nav = getNav();
    const matcher = FOOTER_LINK_MATCHERS[kind];
    if (!nav || typeof matcher !== "function") return;

    DS.qsa("footer a", nav).forEach(link => {
      if (matcher(link)) hideSidebarElement(link, `sidebar:footer-${kind}`);
    });
  }

  function hideAllFooterLinks() {
    Object.keys(FOOTER_LINK_MATCHERS).forEach(hideFooterLink);
  }

  const SOCIAL_LINK_MATCHERS = {
    discord(link) {
      const aria = ariaOf(link);
      const href = hrefOf(link).toLowerCase();
      return aria === "discord" || href.includes("discord");
    },
    x(link) {
      const aria = ariaOf(link);
      const href = hrefOf(link).toLowerCase();
      return aria === "x" || aria === "twitter" || href.includes("twitter.com") || href.includes("x.com");
    },
    reddit(link) {
      const aria = ariaOf(link);
      const href = hrefOf(link).toLowerCase();
      return aria === "reddit" || href.includes("reddit.com");
    },
  };

  function isSocialLink(link) {
    return Object.values(SOCIAL_LINK_MATCHERS).some(matcher => matcher(link));
  }

  function cleanupEmptySocialWrappers() {
    const nav = getNav();
    if (!nav) return;

    DS.qsa("div", nav).forEach(div => {
      const links = DS.qsa("a", div);
      if (!links.length || links.some(isSignInElement)) return;
      if (!links.every(isSocialLink)) return;

      const anyVisible = links.some(link => !link.classList.contains("ds-hidden"));
      if (anyVisible) {
        if (div.dataset?.dsReason === "sidebar:social-links-wrapper") {
          DS.unhideElement?.(div);
        }
      } else {
        hideSidebarElement(div, "sidebar:social-links-wrapper");
      }
    });
  }

  function hideSocialLink(kind) {
    const nav = getNav();
    const matcher = SOCIAL_LINK_MATCHERS[kind];
    if (!nav || typeof matcher !== "function") return;

    DS.qsa("a", nav).forEach(link => {
      if (matcher(link)) hideSidebarElement(link, `sidebar:social-${kind}`);
    });

    cleanupEmptySocialWrappers();
  }

  function hideSocialLinks() {
    Object.keys(SOCIAL_LINK_MATCHERS).forEach(hideSocialLink);
  }

  function classifyAppDownloadElement(el) {
    if (!el) return "";

    // Classify the actual clickable control as a whole. SpicyChat currently uses
    // a generic /download href for its Google Play badge, so looking only at the
    // anchor makes that badge look "generic" and lets the wrong toggle hide it.
    const nodes = [el, ...DS.qsa?.("img", el) || []];
    const aria = nodes.map(node => ariaOf(node)).join(" ");
    const href = hrefOf(el).toLowerCase();
    const alt = nodes.map(node => DS.normalize(node.getAttribute?.("alt") || "")).join(" ");
    const src = nodes.map(node => String(node.getAttribute?.("src") || "").toLowerCase()).join(" ");
    const text = textOf(el);

    const googlePlay =
      aria.includes("playstore") ||
      aria.includes("google play") ||
      href.includes("play.google.com") ||
      alt.includes("playstore") ||
      alt.includes("google play") ||
      src.includes("playstore") ||
      src.includes("googleplay") ||
      src.includes("google-play");

    if (googlePlay) return "google-play";

    const appStore =
      aria.includes("app store") ||
      aria.includes("ios") ||
      href.includes("apps.apple.com") ||
      href.includes("itunes.apple.com") ||
      alt.includes("app store") ||
      alt.includes("ios") ||
      src.includes("appstore") ||
      src.includes("app-store");

    if (appStore) return "app-store";

    const generic =
      aria.includes("download") ||
      href.includes("/download") ||
      alt.includes("download") ||
      text.includes("download app") ||
      text.includes("get the app");

    return generic ? "generic" : "";
  }

  function appDownloadTarget(el) {
    return el?.closest?.("a, button") || el;
  }

  function hideAppDownload(kind = "all") {
    const nav = getNav();
    if (!nav) return;

    const controls = new Set(DS.qsa("footer a, footer button", nav));
    DS.qsa("footer img", nav).forEach(img => {
      if (!img.closest("a, button")) controls.add(img);
    });

    controls.forEach(el => {
      const target = appDownloadTarget(el);
      const detected = classifyAppDownloadElement(target);
      if (!detected) return;
      if (kind !== "all" && detected !== kind) return;

      hideSidebarElement(target, `sidebar:app-download-${detected}`);
    });
  }

  function hideWebVersion() {
    const nav = getNav();
    if (!nav) return;

    DS.qsa("footer p, footer span", nav).forEach(el => {
      if (textOf(el).includes("web version")) {
        hideSidebarElement(el, "sidebar:web-version");
      }
    });
  }

  function hideSignOut() {
    const nav = getNav();
    if (!nav) return;

    DS.qsa("footer button, footer a, button", nav).forEach(el => {
      if (isSignOutElement(el)) {
        hideSidebarElement(el.closest("a") || el, "sidebar:sign-out");
      }
    });
  }

  function keepSignInVisible() {
    const nav = getNav();
    if (!nav) return;

    DS.qsa("button, a", nav).forEach(el => {
      if (!isSignInElement(el)) return;

      let node = el;

      for (
        let i = 0;
        node && node !== document.body && node.id !== "root" && i < 4;
        i++, node = node.parentElement
      ) {
        if (String(node.dataset?.dsReason || "").startsWith("sidebar:")) {
          DS.unhideElement(node);
        }
      }
    });
  }

  function sidebarReasonStillWanted(reason, settings = {}) {
    const key = String(reason || "");
    if (!key.startsWith("sidebar:")) return false;
    if (!settings.enabled) return false;

    const wanted = {
      "sidebar:logo": !!settings.hideSidebarLogo,
      "sidebar:home": !!settings.hideSidebarHome,
      "sidebar:home-text": !!settings.hideSidebarHome,
      "sidebar:chats": !!settings.hideSidebarChats,
      "sidebar:chats-text": !!settings.hideSidebarChats,
      "sidebar:personas": !!settings.hideSidebarPersonas,
      "sidebar:personas-text": !!settings.hideSidebarPersonas,
      "sidebar:create-menu": !!settings.hideSidebarCreateMenu,
      "sidebar:create-chatbot": !!settings.hideSidebarCreateChatbot,
      "sidebar:create-chatbot-link": !!settings.hideSidebarCreateChatbot,
      "sidebar:create-lorebook": !!settings.hideSidebarCreateLorebook,
      "sidebar:create-lorebook-link": !!settings.hideSidebarCreateLorebook,
      "sidebar:create-group": !!settings.hideSidebarCreateGroup,
      "sidebar:create-group-link": !!settings.hideSidebarCreateGroup,
      "sidebar:create-voice": !!settings.hideSidebarCreateVoice,
      "sidebar:my-creations-menu": !!settings.hideSidebarMyCreationsMenu,
      "sidebar:my-chatbots": !!settings.hideSidebarMyChatbots,
      "sidebar:my-chatbots-link": !!settings.hideSidebarMyChatbots,
      "sidebar:my-lorebooks": !!settings.hideSidebarMyLorebooks,
      "sidebar:my-lorebooks-link": !!settings.hideSidebarMyLorebooks,
      "sidebar:my-groups": !!settings.hideSidebarMyGroups,
      "sidebar:my-groups-link": !!settings.hideSidebarMyGroups,
      "sidebar:my-voices": !!settings.hideSidebarMyVoices,
      "sidebar:favorites": !!settings.hideSidebarFavorites,
      "sidebar:favorites-text": !!settings.hideSidebarFavorites,
      "sidebar:recommendations": !!settings.hideSidebarRecommendations,
      "sidebar:recommendations-text": !!settings.hideSidebarRecommendations,
      "sidebar:leaderboard": !!settings.hideSidebarLeaderboard,
      "sidebar:leaderboard-text": !!settings.hideSidebarLeaderboard,
      "sidebar:blocked-creators": !!settings.hideSidebarBlockedCreators,
      "sidebar:blocked-creators-text": !!settings.hideSidebarBlockedCreators,
      "sidebar:subscribe": !!settings.hideSidebarSubscribe,
      "sidebar:subscribe-text": !!settings.hideSidebarSubscribe,
      "sidebar:help-text": !!settings.hideSidebarHelp,
      "sidebar:social-discord": !!settings.hideSidebarSocialLinks || !!settings.hideSidebarSocialDiscord,
      "sidebar:social-x": !!settings.hideSidebarSocialLinks || !!settings.hideSidebarSocialX,
      "sidebar:social-reddit": !!settings.hideSidebarSocialLinks || !!settings.hideSidebarSocialReddit,
      // Wrapper visibility is derived from the child links after their individual
      // settings are applied. Keeping the wrapper hidden merely because *some*
      // social link is disabled makes newly re-enabled links stay invisible.
      "sidebar:social-links-wrapper": false,
      "sidebar:footer-terms": !!settings.hideSidebarFooterLinks || !!settings.hideSidebarFooterTerms,
      "sidebar:footer-privacy": !!settings.hideSidebarFooterLinks || !!settings.hideSidebarFooterPrivacy,
      "sidebar:footer-refunds": !!settings.hideSidebarFooterLinks || !!settings.hideSidebarFooterRefunds,
      "sidebar:footer-reporting": !!settings.hideSidebarFooterLinks || !!settings.hideSidebarFooterReporting,
      "sidebar:footer-guidelines": !!settings.hideSidebarFooterLinks || !!settings.hideSidebarFooterGuidelines,
      "sidebar:footer-support": !!settings.hideSidebarFooterLinks || !!settings.hideSidebarFooterSupport,
      "sidebar:footer-affiliates": !!settings.hideSidebarFooterLinks || !!settings.hideSidebarFooterAffiliates,
      "sidebar:app-download-google-play": !!settings.hideSidebarAppDownload || !!settings.hideSidebarAppDownloadGooglePlay,
      "sidebar:app-download-app-store": !!settings.hideSidebarAppDownload || !!settings.hideSidebarAppDownloadAppStore,
      "sidebar:app-download-generic": !!settings.hideSidebarAppDownload || !!settings.hideSidebarAppDownloadGeneric,
      "sidebar:web-version": !!settings.hideSidebarWebVersion,
      "sidebar:sign-out": !!settings.hideSidebarSignOut
    };

    return !!wanted[key];
  }

  function restoreNoLongerRequestedSidebarElements(settings) {
    const nav = getNav();
    if (!nav) return 0;

    let restored = 0;
    DS.qsa("[data-ds-reason]", nav).forEach(el => {
      const reason = String(el.dataset.dsReason || "");
      if (!reason.startsWith("sidebar:") || sidebarReasonStillWanted(reason, settings)) return;
      DS.unhideElement(el);
      restored += 1;
    });
    return restored;
  }

  function keepNativeNavigationToggleVisible() {
    const selectors = [
      "#navigation-button-menu-toggle-desktop",
      "#navigation-button-menu-toggle-mobile",
      'button[aria-label="navigation-button-menu-toggle-desktop"]',
      'button[aria-label="navigation-button-menu-toggle-mobile"]'
    ];
    for (const button of DS.qsa(selectors.join(","))) {
      let node = button;
      for (let depth = 0; node && node !== document.body && depth < 3; depth++, node = node.parentElement) {
        const reason = String(node.dataset?.dsReason || "");
        if (node.dataset?.dsHidden === "1" && (reason.startsWith("sidebar:") || reason.startsWith("topbar:"))) {
          DS.unhideElement(node);
        }
      }
    }
  }

  DS.applySidebarCleanup = function applySidebarCleanup() {
    const { settings } = DS.state;

    ensureSidebarObserver();
    const settingsSignature = sidebarSettingsSignature(settings);
    if (!sidebarDirty && settingsSignature === lastSidebarSettingsSignature) {
      if (DS.state?.runtimeCounters) {
        DS.state.runtimeCounters.sidebarStablePassSkips = Number(DS.state.runtimeCounters.sidebarStablePassSkips || 0) + 1;
      }
      return;
    }
    sidebarDirty = false;
    lastSidebarSettingsSignature = settingsSignature;

    // Do not unhide every managed row and immediately hide it again on every
    // reconciliation pass. That old restore/reapply loop fought React and was a
    // major source of same-state sidebar mutations in active-use diagnostics.
    // Only restore controls whose corresponding preference was actually turned off.
    restoreNoLongerRequestedSidebarElements(settings);
    keepSignInVisible();
    keepNativeNavigationToggleVisible();
    placeQolSidebarButton(settings);

    if (!settings.enabled) return;

    if (settings.hideSidebarLogo) hideLogo();

    if (settings.hideSidebarHome) {
      hideLinksByExactPath("/", "sidebar:home");
      hideButtonByExactText("Home", "sidebar:home-text");
    }

    if (settings.hideSidebarChats) {
      hideLinksByHrefPart("/chats", "sidebar:chats");
      hideButtonByExactText("Chats", "sidebar:chats-text");
    }

    if (settings.hideSidebarPersonas) {
      hideLinksByHrefPart("/personas", "sidebar:personas");
      hideButtonByExactText("My Personas", "sidebar:personas-text");
    }

    if (settings.hideSidebarCreateMenu) {
      hideButtonById("navigation-button-create", "sidebar:create-menu");
    }

    if (settings.hideSidebarCreateChatbot) {
      hideButtonById("navigation-button-create-character", "sidebar:create-chatbot");
      hideLinksByHrefPart("/chatbot/create", "sidebar:create-chatbot-link");
    }

    if (settings.hideSidebarCreateLorebook) {
      hideButtonById("navigation-button-create-lorebook", "sidebar:create-lorebook");
      hideLinksByHrefPart("/lorebook/create", "sidebar:create-lorebook-link");
    }

    if (settings.hideSidebarCreateGroup) {
      hideButtonById("navigation-button-create-group", "sidebar:create-group");
      hideLinksByHrefPart("/group/create", "sidebar:create-group-link");
    }

    if (settings.hideSidebarCreateVoice) {
      hideButtonById("navigation-button-create-voice", "sidebar:create-voice");
    }

    if (settings.hideSidebarMyCreationsMenu) {
      hideButtonById("navigation-button-creations", "sidebar:my-creations-menu");
    }

    if (settings.hideSidebarMyChatbots) {
      hideButtonById("navigation-button-my-chatbots", "sidebar:my-chatbots");
      hideLinksByHrefPart("/my-creations/chatbots", "sidebar:my-chatbots-link");
    }

    if (settings.hideSidebarMyLorebooks) {
      hideButtonById("navigation-button-my-lorebooks", "sidebar:my-lorebooks");
      hideLinksByHrefPart("/my-creations/lorebooks", "sidebar:my-lorebooks-link");
    }

    if (settings.hideSidebarMyGroups) {
      hideButtonById("navigation-button-my-groups", "sidebar:my-groups");
      hideLinksByHrefPart("/my-creations/groups", "sidebar:my-groups-link");
    }

    if (settings.hideSidebarMyVoices) {
      hideButtonById("navigation-button-my-voices", "sidebar:my-voices");
    }

    if (settings.hideSidebarFavorites) {
      hideLinksByHrefPart("/favorite-bots", "sidebar:favorites");
      hideButtonByExactText("Favorites", "sidebar:favorites-text");
    }

    if (settings.hideSidebarRecommendations) {
      hideLinksByHrefPart("/recommended-bots", "sidebar:recommendations");
      hideButtonByExactText("Recommendations", "sidebar:recommendations-text");
    }

    if (settings.hideSidebarLeaderboard) {
      hideLinksByHrefPart("/creators/leaderboard", "sidebar:leaderboard");
      hideButtonByExactText("Leaderboard", "sidebar:leaderboard-text");
    }

    if (settings.hideSidebarBlockedCreators) {
      hideLinksByHrefPart("/blocked-creators", "sidebar:blocked-creators");
      hideButtonByExactText("Blocked Creators", "sidebar:blocked-creators-text");
    }

    if (settings.hideSidebarSubscribe) {
      hideLinksByHrefPart("/subscribe", "sidebar:subscribe");
      hideButtonByExactText("Subscribe", "sidebar:subscribe-text");
    }

    if (settings.hideSidebarHelp) {
      // The sidebar Help button and footer Support link share the same URL.
      // Match the actual Help button text so the footer stays independent.
      hideButtonByExactText("Help", "sidebar:help-text");
    }

    // Backward compatibility for users who had the old all-social toggle enabled.
    if (settings.hideSidebarSocialLinks) hideSocialLinks();
    if (settings.hideSidebarSocialDiscord) hideSocialLink("discord");
    if (settings.hideSidebarSocialX) hideSocialLink("x");
    if (settings.hideSidebarSocialReddit) hideSocialLink("reddit");

    // Backward compatibility for users who had the old all-footer toggle enabled.
    if (settings.hideSidebarFooterLinks) hideAllFooterLinks();
    if (settings.hideSidebarFooterTerms) hideFooterLink("terms");
    if (settings.hideSidebarFooterPrivacy) hideFooterLink("privacy");
    if (settings.hideSidebarFooterRefunds) hideFooterLink("refunds");
    if (settings.hideSidebarFooterReporting) hideFooterLink("reporting");
    if (settings.hideSidebarFooterGuidelines) hideFooterLink("guidelines");
    if (settings.hideSidebarFooterSupport) hideFooterLink("support");
    if (settings.hideSidebarFooterAffiliates) hideFooterLink("affiliates");

    // Backward compatibility for the old all-app-download toggle.
    if (settings.hideSidebarAppDownload) hideAppDownload("all");
    if (settings.hideSidebarAppDownloadGooglePlay) hideAppDownload("google-play");
    if (settings.hideSidebarAppDownloadAppStore) hideAppDownload("app-store");
    if (settings.hideSidebarAppDownloadGeneric) hideAppDownload("generic");

    if (settings.hideSidebarWebVersion) hideWebVersion();
    if (settings.hideSidebarSignOut) hideSignOut();

    protectSaiToolkitSidebarButton();
    placeQolSidebarButton(settings);

    keepNativeNavigationToggleVisible();
    keepSignInVisible();
  };
})();
