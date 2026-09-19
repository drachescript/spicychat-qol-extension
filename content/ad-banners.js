(() => {
  "use strict";

  if (window.__SPICYCHAT_QOL_AD_BANNERS_V01849__) return;
  window.__SPICYCHAT_QOL_AD_BANNERS_V01849__ = true;

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalized(value) {
    return DS.normalize
      ? DS.normalize(value)
      : cleanText(value).toLowerCase();
  }

  function isVisible(el) {
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const style = getComputedStyle(el);

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  function settingEnabled() {
    const settings = DS.state?.settings || {};
    return settings.hideAdvertBanners !== false;
  }

  function isProtectedArea(el) {
    return !!el.closest(
      [
        "#ds-qol-panel",
        "#ds-chat-export-modal",
        "nav",
        "aside",
        "header",
        "footer",
        "form",
        "[data-field-name]",
        "[contenteditable='true']",
        "[role='dialog']",
        "[data-testid='ChatModelTierCapabilityGate']",
        "[data-testid='LocaleSelector']"
      ].join(", ")
    );
  }

  function hasPromoPhrase(text) {
    const value = normalized(text);

    return [
      "unlock more memory",
      "get more memory",
      "more memory",
      "upgrade to 16k",
      "remembers more",
      "deeper roleplay",
      "don't just imagine it",
      "dont just imagine it",
      "unlock dynamic, in-chat images",
      "unlock dynamic in-chat images",
      "in-chat images",
      "see the action",
      "custom voices",
      "custom voices are here",
      "unlock custom voices",
      "create your voice",
      "build worlds they remember",
      "lorebooks give characters extra memory",
      "create lorebook",
      "create a lorebook",
      "new lorebook",
      "go annual & save",
      "go annual and save",
      "switch to annual",
      "yearly plan",
      "premium membership",
      "try premium",
      "upgrade now",
      "pricing update",
      "price update",
      "pricing changes",
      "new pricing",
      "subscription pricing"
    ].some(phrase => value.includes(phrase));
  }

  function imageLooksPromotional(img) {
    if (!img) return false;

    const alt = normalized(img.getAttribute("alt") || "");
    const src = normalized(img.getAttribute("src") || "");
    const combined = `${alt} ${src}`;

    return [
      "custom voices",
      "build worlds",
      "lorebook",
      "go annual",
      "annualdesk",
      "tts-v3-desktop",
      "lorebooks-desktop",
      "desktop_1_-_3000x380",
      "desktop_1__1_",
      "desktop-2.png",
      "16k-memory",
      "unlock more memory",
      "don't just imagine it",
      "dont just imagine it"
    ].some(phrase => combined.includes(phrase));
  }

  function rootHasPromoSignal(root) {
    if (!root) return false;
    if (hasPromoPhrase(root.textContent || "")) return true;

    return DS.qsa("img", root).some(imageLooksPromotional);
  }

  function hasPromoCta(root) {
    const ctaText = DS.qsa("button, a", root)
      .map(el => normalized(el.textContent || el.getAttribute("aria-label") || ""))
      .join(" | ");

    return [
      "get more memory",
      "unlock more memory",
      "upgrade",
      "upgrade now",
      "create your voice",
      "create lorebook",
      "create a lorebook",
      "switch to annual",
      "get started",
      "try now",
      "try premium",
      "subscribe",
      "learn more",
      "see the action"
    ].some(phrase => ctaText.includes(phrase));
  }

  function isSnapSlide(el) {
    if (!el || el === document.body || el === document.documentElement) return false;

    if (el.classList?.contains("snap-center")) return true;

    const inlineStyle = String(el.getAttribute?.("style") || "").toLowerCase();
    if (inlineStyle.includes("scroll-snap-align")) return true;

    try {
      return getComputedStyle(el).scrollSnapAlign === "center";
    } catch {
      return false;
    }
  }

  function findSnapSlide(el) {
    let node = el;

    for (let i = 0; node && i < 10; i++, node = node.parentElement) {
      if (node === document.body || node === document.documentElement || node.id === "root") break;
      if (isSnapSlide(node)) return node;
    }

    return null;
  }

  function snapSlidesInside(root) {
    if (!root) return [];

    return DS.qsa("div", root).filter(isSnapSlide);
  }

  function findCarouselShell(slide) {
    if (!slide) return null;

    let node = slide.parentElement;
    let best = null;

    for (let i = 0; node && i < 3; i++, node = node.parentElement) {
      if (
        node === document.body ||
        node === document.documentElement ||
        node.id === "root" ||
        isProtectedArea(node)
      ) {
        break;
      }

      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.height > 460 || rect.width < 260) break;

      const slides = snapSlidesInside(node);
      if (!slides.includes(slide)) continue;

      // New SpicyChat promo carousels use full-width snap-center children inside
      // a fixed-height (~190px) shell. Hiding only the inner banner leaves that
      // shell behind as a black/empty rectangle, so collapse the shell instead.
      if (slides.length >= 2 || rect.height <= 260) {
        best = node;
      }
    }

    return best;
  }

  function looksLikeBanner(el) {
    if (!el || isProtectedArea(el) || !isVisible(el)) return false;
    if (!rootHasPromoSignal(el)) return false;

    const rect = el.getBoundingClientRect();
    const hasCta = hasPromoCta(el);
    const hasPromoImage = DS.qsa("img", el).some(imageLooksPromotional);

    const bannerSized =
      rect.width >= 280 &&
      rect.height >= 60 &&
      rect.height <= 460;

    const cardSized =
      rect.width >= 220 &&
      rect.height >= 100 &&
      rect.height <= 520;

    return (bannerSized || cardSized) && (hasCta || hasPromoImage || rect.height >= 140);
  }

  function findBannerRoot(el) {
    const slide = findSnapSlide(el);

    if (slide && rootHasPromoSignal(slide)) {
      return findCarouselShell(slide) || slide;
    }

    let node = el;
    let best = null;

    for (let i = 0; node && i < 10; i++, node = node.parentElement) {
      if (
        node === document.body ||
        node === document.documentElement ||
        node.id === "root"
      ) {
        break;
      }

      if (looksLikeBanner(node)) {
        best = node;
        continue;
      }

      if (best) {
        const rect = node.getBoundingClientRect();
        if (rect.height > 520 || rect.width < 220) break;
      }
    }

    return best;
  }

  function candidateElements() {
    return DS.qsa("p, h1, h2, h3, span, button, a, img")
      .filter(el => !isProtectedArea(el))
      .filter(el => {
        if (el.tagName === "IMG") return imageLooksPromotional(el);
        return hasPromoPhrase(el.textContent || el.getAttribute("aria-label") || "");
      });
  }

  function unhideOldAdvertBanners() {
    DS.qsa("[data-ds-reason^='ad-banner']").forEach(el => {
      if (typeof DS.unhideElement === "function") {
        DS.unhideElement(el);
      } else {
        el.classList.remove("ds-hidden");
        delete el.dataset.dsHidden;
        delete el.dataset.dsReason;
      }
    });
  }

  function restoreProtectedAdvertHides() {
    // A creator's own text can legitimately contain promo-like phrases such as
    // "remembers more" or "more memory". Never leave form/editor content hidden
    // just because it happens to match wording used by a SpicyChat banner.
    DS.qsa("[data-ds-reason^='ad-banner']").forEach(el => {
      if (!isProtectedArea(el)) return;

      if (typeof DS.unhideElement === "function") {
        DS.unhideElement(el);
      } else {
        el.classList.remove("ds-hidden");
        delete el.dataset.dsHidden;
        delete el.dataset.dsReason;
      }
    });
  }

  function migrateHiddenInnerBanners() {
    const hidden = DS.qsa("[data-ds-reason^='ad-banner']");

    for (const oldRoot of hidden) {
      const slide = findSnapSlide(oldRoot);
      const shell = slide ? findCarouselShell(slide) : null;
      const replacement = shell || slide;

      if (!replacement || replacement === oldRoot) continue;

      const reason = oldRoot.dataset.dsReason || "ad-banner:promo";
      DS.unhideElement?.(oldRoot);
      DS.hideElement?.(replacement, reason);
    }
  }

  function reasonForRoot(root) {
    const text = normalized(root?.textContent || "");
    const imageText = DS.qsa("img", root)
      .map(img => normalized(`${img.alt || ""} ${img.src || ""}`))
      .join(" ");
    const combined = `${text} ${imageText}`;

    if (combined.includes("annual")) return "annual";
    if (combined.includes("memory")) return "memory";
    if (combined.includes("voice") || combined.includes("tts-v3")) return "voices";
    if (combined.includes("lorebook")) return "lorebook";
    return "promo";
  }

  DS.applyAdvertBannerCleanup = function applyAdvertBannerCleanup() {
    // The subscription page is the product itself. Plan cards, current-plan
    // notices and labels such as "Most Popular" are real page content, not ads.
    if (DS.isSubscribePage?.()) {
      unhideOldAdvertBanners();
      return;
    }

    // Lorebook pages contain real product UI whose headings and buttons use
    // the same words as promotional banners. Never treat that workspace as an ad.
    if (DS.isLorebookPage?.()) {
      unhideOldAdvertBanners();
      return;
    }

    if (!settingEnabled()) {
      unhideOldAdvertBanners();
      return;
    }

    // Undo any older false-positive hides inside creator/editor forms before
    // scanning for real promotional banners.
    restoreProtectedAdvertHides();

    // v0.1.8.48 could hide only the inner content of SpicyChat's new snap
    // carousel, leaving a black 190px slot. Promote those old hides outward.
    migrateHiddenInnerBanners();

    const roots = [
      ...new Set(
        candidateElements()
          .map(findBannerRoot)
          .filter(Boolean)
      )
    ];

    for (const root of roots) {
      if (root.dataset.dsHidden === "1") continue;

      const reason = `ad-banner:${reasonForRoot(root)}`;

      if (typeof DS.hideElement === "function") {
        DS.hideElement(root, reason);
      } else {
        root.classList.add("ds-hidden");
        root.dataset.dsHidden = "1";
        root.dataset.dsReason = reason;
      }
    }
  };
})();
