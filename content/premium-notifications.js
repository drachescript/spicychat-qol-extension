(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  const CLEAN_FAVICON = "https://spicychat.ai/Assets/siteicons/1.0.1/spicychat/favicon.ico";

  let guardInstalled = false;
  let notificationObserver = null;
  let notificationObservedNode = null;
  let headObserver = null;
  let guardTimer = null;
  let repairTimer = null;
  let autoReadCooldownUntil = 0;
  let autoReadInFlight = false;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizedText(el) {
    return DS.normalize(cleanText(el?.textContent || ""));
  }

  function isSubscriptionPageContent(el) {
    if (!DS.isSubscribePage?.() || !el) return false;
    if (el.closest?.("nav, aside, header, footer, #ds-qol-panel")) return false;
    return !!el.closest?.("#root");
  }

  function restoreSubscriptionPageContent() {
    if (!DS.isSubscribePage?.()) return;
    DS.qsa("[data-ds-reason^='premium:']").forEach(el => {
      if (isSubscriptionPageContent(el)) DS.unhideElement?.(el);
    });
  }

  function unhideIfReason(reason, predicate) {
    DS.qsa(`[data-ds-reason='${reason}'], .ds-hidden`).forEach(el => {
      if (el.dataset.dsReason !== reason) return;
      if (predicate && !predicate(el)) return;
      DS.unhideElement?.(el);
    });
  }

  function isModelSelector(el) {
    const text = normalizedText(el);
    if (!text) return false;

    const hasModelHeading =
      text.includes("select a model") ||
      text.includes("choose a model") ||
      text.includes("model selection");

    const hasModelBadges =
      /\b\d{1,3}b\b/i.test(text) ||
      /\b\d{1,3}k\b/i.test(text) ||
      text.includes("true supporter") ||
      text.includes("get a taste");

    const hasKnownModelCopy =
      text.includes("storytelling") ||
      text.includes("roleplay") ||
      text.includes("staying consistently in character") ||
      text.includes("multiple languages") ||
      text.includes("longer conversations");

    const hasManyModelRows =
      DS.qsa("p", el).filter(p => {
        const value = cleanText(p.textContent);
        return /\b(\d{1,3}b|\d{1,3}k|true supporter|get a taste)\b/i.test(value);
      }).length >= 2;

    return (
      (hasModelHeading && (hasModelBadges || hasKnownModelCopy)) ||
      (hasModelHeading && hasManyModelRows)
    );
  }

  function isRealContextLimitPopup(el) {
    const text = normalizedText(el);
    if (!text) return false;

    if (isModelSelector(el)) return false;

    const firstPart = text.slice(0, 900);

    const hasHardContextText =
      firstPart.includes("context limit reached") ||
      firstPart.includes("reached the context limit") ||
      firstPart.includes("conversation is too long") ||
      firstPart.includes("memory limit reached");

    if (hasHardContextText) return true;

    const hasUpgradeText =
      firstPart.includes("upgrade now") ||
      firstPart.includes("upgrade for") ||
      firstPart.includes("get premium") ||
      firstPart.includes("subscribe now");

    const hasPopupShape =
      el.matches("[role='dialog'], [aria-modal='true'], div.fixed") ||
      !!el.closest("[role='dialog'], [aria-modal='true']");

    return hasPopupShape && hasUpgradeText && !isModelSelector(el);
  }

  function hideFloatingPremiumPopups() {
    DS.qsa('[data-testid="FloatingUpgradeCta"]').forEach(el => {
      DS.hideElement(el, "premium:floating-upgrade-cta");
    });

    DS.qsa('[data-testid="FloatingUpgradeCta-DismissButton"]').forEach(button => {
      try {
        DS.realClick(button);
      } catch {}
    });

    unhideIfReason("premium:floating-context-limit", isModelSelector);

    DS.qsa("div.fixed, [role='dialog'], [aria-modal='true']").forEach(el => {
      if (isRealContextLimitPopup(el)) {
        DS.hideElement(el, "premium:floating-context-limit");
      }
    });
  }

  function isStandardIconLink(link) {
    if (!(link instanceof HTMLLinkElement)) return false;
    const rel = String(link.rel || "").toLowerCase();
    if (rel.includes("apple-touch-icon")) return false;
    return rel.split(/\s+/).includes("icon") || rel.includes("shortcut icon");
  }

  function getStandardIconLinks() {
    return Array.from(document.querySelectorAll("link[rel]")).filter(isStandardIconLink);
  }

  function faviconLooksLikeUnreadBadge() {
    return getStandardIconLinks().some(link => {
      const href = String(link.getAttribute("href") || link.href || "");
      if (!href) return false;
      if (href === CLEAN_FAVICON) return false;
      return (
        href.startsWith("data:image/") ||
        href.startsWith("blob:") ||
        /announcekit/i.test(href)
      );
    });
  }

  function titleLooksLikeUnreadBadge() {
    return /^\s*(?:\(\d+\)|\[\d+\])\s*/.test(document.title || "");
  }

  function cleanNotificationTitle() {
    const current = String(document.title || "");
    const cleaned = current.replace(/^\s*(?:\(\d+\)|\[\d+\])\s*/, "");
    if (cleaned !== current) document.title = cleaned;
  }

  function restoreCleanFavicon() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.hideTabNotificationBadge) return;

    const links = getStandardIconLinks();
    const targets = links.length ? links : [document.createElement("link")];

    for (const link of targets) {
      if (!link.isConnected) document.head.appendChild(link);
      link.setAttribute("rel", "icon");
      link.setAttribute("type", "image/x-icon");
      link.setAttribute("sizes", "32x32");
      if (link.getAttribute("href") !== CLEAN_FAVICON) {
        link.setAttribute("href", CLEAN_FAVICON);
      }
    }

    cleanNotificationTitle();
  }

  function scheduleFaviconRepair(delay = 0) {
    clearTimeout(repairTimer);
    repairTimer = setTimeout(restoreCleanFavicon, delay);
  }

  function visibleUnreadBadges() {
    return Array.from(document.querySelectorAll(".announcekit-widget-badge")).filter(badge => {
      if (badge.classList.contains("announcekit-widget-badge-hidden")) return false;
      const inlineVisibility = String(badge.style?.visibility || "").toLowerCase();
      const inlineDisplay = String(badge.style?.display || "").toLowerCase();
      return inlineVisibility !== "hidden" && inlineDisplay !== "none";
    });
  }

  function badgeUnreadCount() {
    let total = 0;

    for (const badge of visibleUnreadBadges()) {
      const text = cleanText(badge.textContent);
      const match = text.match(/\d+/);
      total += match ? Math.max(1, Number(match[0]) || 1) : 1;
    }

    return total;
  }

  function badgeHasUnreadState() {
    return badgeUnreadCount() > 0;
  }

  function hasUnreadSignal() {
    return badgeHasUnreadState() || faviconLooksLikeUnreadBadge() || titleLooksLikeUnreadBadge();
  }

  function closeNotificationPanel(button, delay = 0) {
    setTimeout(() => {
      try {
        document.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
        }));
      } catch {}

      try {
        if (button?.getAttribute("aria-expanded") === "true") {
          DS.realClick(button);
        } else {
          document.body?.click();
        }
      } catch {}

      scheduleFaviconRepair(0);
      scheduleFaviconRepair(800);
    }, Math.max(0, Number(delay) || 0));
  }

  async function waitForUnreadToClear(timeoutMs = 3200) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (!badgeHasUnreadState() && !titleLooksLikeUnreadBadge()) return true;
      await DS.sleep?.(120);
    }

    return !badgeHasUnreadState() && !titleLooksLikeUnreadBadge();
  }

  async function maybeAutoReadBackgroundNotification(forceUnreadSignal = false) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.autoReadNotifications) return;
    if (!document.hidden) return;
    if (autoReadInFlight || Date.now() < autoReadCooldownUntil) return;
    if (!forceUnreadSignal && !hasUnreadSignal()) return;

    const button = document.querySelector("button[aria-label='notifications']");
    if (!button) return;

    // AnnounceKit renders one badge launcher whose text is the unread count.
    // Clicking that <a> follows news.spicychat.ai instead of reliably opening
    // SpicyChat's in-page notification widget, so always use the bell trigger.
    const unreadBefore = Math.max(1, badgeUnreadCount());
    autoReadInFlight = true;
    autoReadCooldownUntil = Date.now() + 6000;

    try {
      DS.realClick(button);
      const cleared = await waitForUnreadToClear(3600);
      closeNotificationPanel(button, cleared ? 150 : 350);

      if (!cleared && document.hidden) {
        // Multiple pending updates can take another widget-open cycle. Retry soon
        // instead of waiting the old 30-second cooldown.
        autoReadCooldownUntil = Date.now() + 4500;
        setTimeout(() => runNotificationGuard(true), 4700);
      }

      if (DS.state?.settings?.debug) {
        console.debug(`[${DS.EXT_NAME}] notification auto-read`, {
          unreadBefore,
          unreadAfter: badgeUnreadCount(),
          cleared
        });
      }
    } catch (error) {
      if (DS.state?.settings?.debug) {
        console.warn(`[${DS.EXT_NAME}] notification auto-read failed`, error);
      }
    } finally {
      autoReadInFlight = false;
    }
  }

  function runNotificationGuard(forceUnreadSignal = false) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled) return;

    maybeAutoReadBackgroundNotification(forceUnreadSignal).catch(() => {});
    if (settings.hideTabNotificationBadge) restoreCleanFavicon();
  }

  function observeNotificationBadge() {
    const button = document.querySelector("button[aria-label='notifications']");
    const node =
      button?.closest("[data-announcekit-mode]") ||
      document.querySelector("[data-announcekit-mode]") ||
      document.querySelector(".announcekit-widget-badge")?.parentElement;

    if (!node || node === notificationObservedNode) return;

    notificationObserver?.disconnect();
    notificationObservedNode = node;
    notificationObserver = new MutationObserver(() => {
      runNotificationGuard(false);
    });
    notificationObserver.observe(node, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "href", "aria-expanded"],
    });
  }

  function notificationGuardNeeded() {
    const settings = DS.state?.settings || {};
    return !!(settings.enabled && (settings.autoReadNotifications || settings.hideTabNotificationBadge));
  }

  function teardownNotificationGuard() {
    notificationObserver?.disconnect();
    notificationObserver = null;
    notificationObservedNode = null;
    headObserver?.disconnect();
    headObserver = null;
    clearInterval(guardTimer);
    guardTimer = null;
    clearTimeout(repairTimer);
    repairTimer = null;
    guardInstalled = false;
  }

  function installNotificationGuard() {
    if (!notificationGuardNeeded()) {
      teardownNotificationGuard();
      return;
    }

    if (guardInstalled) {
      observeNotificationBadge();
      return;
    }

    guardInstalled = true;

    headObserver = new MutationObserver(mutations => {
      let faviconMutation = false;
      let unreadFaviconMutation = false;

      for (const mutation of mutations) {
        if (mutation.type === "attributes" && isStandardIconLink(mutation.target)) {
          faviconMutation = true;
          const href = String(mutation.target.getAttribute("href") || mutation.target.href || "");
          if (href.startsWith("data:image/") || href.startsWith("blob:") || /announcekit/i.test(href)) {
            unreadFaviconMutation = true;
          }
          continue;
        }

        if (mutation.type === "childList") {
          const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
          for (const node of changedNodes) {
            if (isStandardIconLink(node)) {
              faviconMutation = true;
              const href = String(node.getAttribute?.("href") || node.href || "");
              if (href.startsWith("data:image/") || href.startsWith("blob:") || /announcekit/i.test(href)) {
                unreadFaviconMutation = true;
              }
            }

            if (node?.nodeName === "TITLE" && titleLooksLikeUnreadBadge()) {
              unreadFaviconMutation = true;
            }
          }
        }
      }

      runNotificationGuard(unreadFaviconMutation);
      if (faviconMutation) scheduleFaviconRepair(25);
    });

    headObserver.observe(document.head, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["href"],
    });

    document.addEventListener("visibilitychange", () => {
      runNotificationGuard(false);
    });

    window.addEventListener("pageshow", () => {
      runNotificationGuard(false);
    });

    guardTimer = setInterval(() => {
      observeNotificationBadge();
      runNotificationGuard(false);
    }, 10000);

    observeNotificationBadge();
    runNotificationGuard(false);
  }

  DS.hidePremiumStuff = function hidePremiumStuff() {
    const { settings } = DS.state;
    if (!settings.enabled) return;

    // Repair anything older versions accidentally hid.
    unhideIfReason("premium:floating-context-limit", isModelSelector);
    restoreSubscriptionPageContent();

    if (settings.hideFloatingPremiumPopups) {
      hideFloatingPremiumPopups();
    }

    if (!settings.hidePremium) return;

    const selectors = [
      "[data-testid='GetPremiumButton']",
      "a[href*='/subscribe']",
      "a[href*='subscribe']",
      "[data-tooltip-content='Subscribe']"
    ];

    for (const selector of selectors) {
      DS.qsa(selector).forEach(el => {
        if (isSubscriptionPageContent(el)) return;
        if (el.closest("[data-testid='CurrentPlan-PlanCard'], [data-testid='CurrentPlan-PlanCardLink']")) {
          return;
        }

        const target = el.closest("button, a, [role='dialog']") || el;
        DS.hideElement(target, "premium:selector");
      });
    }

    DS.qsa("button, a, [role='dialog'], [class*='modal'], [class*='popup']").forEach(el => {
      if (isSubscriptionPageContent(el)) return;
      if (isModelSelector(el)) return;
      if (el.closest("[data-testid='CurrentPlan-PlanCard'], [data-testid='CurrentPlan-PlanCardLink']")) return;

      const text = normalizedText(el);
      if (!text) return;

      const premiumText =
        text.includes("get premium") ||
        text.includes("upgrade to premium") ||
        text.includes("unlock premium") ||
        text.includes("subscribe now") ||
        text.includes("premium plan");

      if (premiumText) DS.hideElement(el, "premium:text");
    });
  };

  DS.handleNotifications = function handleNotifications() {
    const { settings } = DS.state;

    if (!settings.enabled) {
      teardownNotificationGuard();
      unhideIfReason("notifications");
      return;
    }

    if (notificationGuardNeeded()) {
      installNotificationGuard();
      observeNotificationBadge();
      runNotificationGuard(false);
    } else {
      teardownNotificationGuard();
    }

    if (settings.hideNotifications) {
      DS.qsa("button[aria-label='notifications']").forEach(el => {
        DS.hideElement(el.closest("div") || el, "notifications");
      });

      DS.qsa(".announcekit-widget-badge, [data-announcekit-mode]").forEach(el => {
        DS.hideElement(el, "notifications");
      });
    } else {
      unhideIfReason("notifications");
    }
  };
})();
