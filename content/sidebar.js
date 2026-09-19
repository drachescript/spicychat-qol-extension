(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

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
      if (!anyVisible) hideSidebarElement(div, "sidebar:social-links-wrapper");
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
    const aria = ariaOf(el);
    const href = hrefOf(el).toLowerCase();
    const alt = DS.normalize(el.getAttribute?.("alt") || "");
    const src = String(el.getAttribute?.("src") || "").toLowerCase();
    const text = textOf(el);

    const googlePlay =
      aria.includes("playstore") ||
      aria.includes("google play") ||
      href.includes("play.google.com") ||
      alt.includes("playstore") ||
      alt.includes("google play") ||
      src.includes("playstore") ||
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
    // For individual app-store controls, never climb into a shared wrapper:
    // hiding a Google Play badge must not accidentally hide the iOS badge too.
    return el?.closest?.("a, button") || el;
  }

  function hideAppDownload(kind = "all") {
    const nav = getNav();
    if (!nav) return;

    DS.qsa("footer a, footer button, footer img", nav).forEach(el => {
      const detected = classifyAppDownloadElement(el);
      if (!detected) return;
      if (kind !== "all" && detected !== kind) return;

      hideSidebarElement(appDownloadTarget(el), `sidebar:app-download-${detected}`);
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

  function resetSidebarCleanup() {
    const nav = getNav();
    if (!nav) return;

    DS.qsa("[data-ds-reason]", nav).forEach(el => {
      if (String(el.dataset.dsReason || "").startsWith("sidebar:")) {
        DS.unhideElement(el);
      }
    });
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

    resetSidebarCleanup();
    keepSignInVisible();
    keepNativeNavigationToggleVisible();

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

    keepNativeNavigationToggleVisible();
    keepSignInVisible();
  };
})();
