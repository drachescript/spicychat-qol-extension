(() => {
  "use strict";

  if (window.__SPICYCHAT_QOL_AD_BANNERS_V01849__) return;
  window.__SPICYCHAT_QOL_AD_BANNERS_V01849__ = true;

  const DS = window.DragonScriptQoL;

  let bannerDirty = true;
  let bannerDirtyReason = "startup";
  let bannerDirtyNodes = new Set();
  let bannerRouteKey = "";
  let bannerSettingState = null;
  let cachedBannerRoots = new Set();
  const processedBannerState = new WeakMap();

  function routeKey() {
    return `${location.pathname || ""}${location.search || ""}`;
  }

  function normalizeDirtyNode(node) {
    if (node instanceof Element) return node;
    if (node?.parentElement instanceof Element) return node.parentElement;
    return null;
  }

  function markBannerDirty(reason = "mutation", nodes = []) {
    bannerDirty = true;
    bannerDirtyReason = String(reason || "mutation").slice(0, 80);
    for (const raw of Array.isArray(nodes) ? nodes : [nodes]) {
      const node = normalizeDirtyNode(raw);
      if (node?.isConnected) bannerDirtyNodes.add(node);
    }
    if (bannerDirtyNodes.size > 24) bannerDirtyNodes = new Set([...bannerDirtyNodes].slice(-24));
  }

  DS.markAdvertBannerDirty = markBannerDirty;

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

  function queryWithin(scope, selector) {
    if (!scope) return [];
    if (scope === document) return DS.qsa(selector);
    const out = [];
    if (scope instanceof Element && scope.matches?.(selector)) out.push(scope);
    scope.querySelectorAll?.(selector).forEach(el => out.push(el));
    return out;
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

  function candidateElements(scopes = null) {
    const seen = new Set();
    const out = [];
    const searchScopes = Array.isArray(scopes) ? scopes : bannerDiscoveryScopes();
    for (const scope of searchScopes) {
      for (const el of queryWithin(scope, "p, h1, h2, h3, span, button, a, img")) {
        if (seen.has(el) || isProtectedArea(el) || el.closest?.("[id^='message-']")) continue;
        seen.add(el);
        const matches = el.tagName === "IMG"
          ? imageLooksPromotional(el)
          : hasPromoPhrase((el.textContent || el.getAttribute("aria-label") || "").slice(0, 2400));
        if (matches) out.push(el);
      }
    }
    return out;
  }

  function quickPromoRelevant(node) {
    const el = normalizeDirtyNode(node);
    if (!el || el.closest?.("[id^='message-'], #ds-qol-panel, #ds-chat-export-modal, form, [contenteditable='true']")) return false;
    for (const root of cachedBannerRoots) {
      if (root?.isConnected && (root === el || root.contains(el))) return true;
    }
    if (el.tagName === "IMG" && imageLooksPromotional(el)) return true;
    if (el === document.documentElement || el === document.body || el.id === "root" || Number(el.childElementCount || 0) > 80) return false;
    // Message-list growth must not wake advert cleanup just because an ancestor
    // happens to contain an old promotional element elsewhere on the page.
    if (DS.isSingleChatPage?.() && el.querySelector?.("[id^='message-']") && !el.matches?.("[role='banner'], .snap-center, [style*='scroll-snap-align']")) return false;
    const directText = cleanText(el.getAttribute?.("aria-label") || el.textContent || "");
    if (directText && directText.length <= 2400 && hasPromoPhrase(directText)) return true;
    const promoImage = el.querySelector?.("img");
    if (promoImage && imageLooksPromotional(promoImage)) return true;
    if (el.matches?.(".snap-center, [style*='scroll-snap-align']") || el.querySelector?.(".snap-center, [style*='scroll-snap-align']")) {
      const text = cleanText(el.textContent || "").slice(0, 2400);
      return hasPromoPhrase(text) || !![...el.querySelectorAll?.("img") || []].slice(0, 4).find(imageLooksPromotional);
    }
    return false;
  }

  function mutationsRelevant(mutations = []) {
    const nodes = [];
    let relevant = false;
    for (const mutation of mutations || []) {
      const target = normalizeDirtyNode(mutation?.target);
      if (target && quickPromoRelevant(target)) { relevant = true; nodes.push(target); }
      for (const node of [...(mutation?.addedNodes || []), ...(mutation?.removedNodes || [])]) {
        const el = normalizeDirtyNode(node);
        if (el && quickPromoRelevant(el)) { relevant = true; nodes.push(el); }
      }
    }
    if (relevant) markBannerDirty("banner-subtree-mutation", nodes);
    return relevant;
  }

  DS.advertBannerMutationsRelevant = mutationsRelevant;
  DS.isAdvertBannerCleanupDirty = function isAdvertBannerCleanupDirty() {
    const currentRoute = routeKey();
    const enabled = settingEnabled();
    if (currentRoute !== bannerRouteKey) markBannerDirty("route");
    if (enabled !== bannerSettingState) markBannerDirty("settings");
    return bannerDirty;
  };

  const PROMO_IMAGE_SELECTOR = [
    "img[src*='annualdesk' i]",
    "img[src*='tts-v3-desktop' i]",
    "img[src*='lorebooks-desktop' i]",
    "img[src*='desktop_1_-_3000x380' i]",
    "img[src*='desktop_1__1_' i]",
    "img[src*='desktop-2.png' i]",
    "img[src*='16k-memory' i]",
    "img[alt*='custom voices' i]",
    "img[alt*='build worlds' i]",
    "img[alt*='lorebook' i]",
    "img[alt*='go annual' i]",
    "img[alt*='unlock more memory' i]"
  ].join(", ");

  function bannerDiscoveryScopes() {
    const scopes = new Set();
    // Use structural/banner anchors and known promo-image signatures. Avoid an
    // `img`-all document walk: chat media can grow for hours and must not make
    // banner cleanup progressively more expensive. New/changed standalone
    // banners are also caught directly from their MutationObserver subtree.
    document.querySelectorAll?.("[role='banner'], .snap-center, [style*='scroll-snap-align'], [data-ds-reason^='ad-banner']").forEach(node => {
      if (node instanceof Element && !isProtectedArea(node)) scopes.add(node);
    });
    document.querySelectorAll?.(PROMO_IMAGE_SELECTOR).forEach(img => {
      if (!imageLooksPromotional(img) || isProtectedArea(img)) return;
      const slide = findSnapSlide(img);
      scopes.add(slide || img.parentElement || img);
    });
    for (const root of cachedBannerRoots) if (root?.isConnected) scopes.add(root);
    return [...scopes].filter(Boolean).slice(0, 48);
  }

  function dirtySearchScopes() {
    const scopes = new Set();
    for (const raw of bannerDirtyNodes) {
      let node = normalizeDirtyNode(raw);
      for (let i = 0; node && node !== document.body && i < 4; i++, node = node.parentElement) {
        scopes.add(node);
        if (isSnapSlide(node) || node.matches?.("header, [role='banner']")) break;
        if (node.matches?.("main") && i > 0) break;
      }
    }
    return [...scopes].slice(0, 24);
  }

  function bannerRevision(root) {
    if (!root?.isConnected) return "detached";
    const text = cleanText(root.textContent || "").slice(0, 3000);
    const images = root.querySelectorAll?.("img")?.length || 0;
    const buttons = root.querySelectorAll?.("button, a")?.length || 0;
    return `${text.length}|${images}|${buttons}|${normalized(text).slice(0, 180)}`;
  }

  function unhideOldAdvertBanners() {
    cachedBannerRoots = new Set();
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
    const currentRoute = routeKey();
    const enabled = settingEnabled();
    if (currentRoute !== bannerRouteKey) markBannerDirty("route");
    if (enabled !== bannerSettingState) markBannerDirty("settings");

    const trigger = bannerDirtyReason || "unknown";
    const traceToken = DS.isDiagnosticTraceActive?.("deep")
      ? DS.diagOperationStart?.("advert-banners", "refresh", { trigger })
      : null;
    const started = typeof performance !== "undefined" ? performance.now() : 0;
    let nodesChecked = 0;
    let rootsChecked = 0;
    let changed = 0;
    let skipped = 0;
    let cacheHit = false;

    try {
      if (!bannerDirty) {
        cacheHit = true;
        return;
      }

      const routeChanged = bannerRouteKey !== currentRoute;
      const settingChanged = bannerSettingState !== enabled;

      // These routes contain real product/editor UI whose words overlap with
      // promotional banners. Only perform the one-time cleanup when the route
      // or setting actually changes; never scan them because a chat message did.
      if (DS.isSubscribePage?.() || DS.isLorebookPage?.() || /^\/group\/create(?:\/|$)/i.test(String(location.pathname || "")) || !enabled) {
        if (routeChanged || settingChanged || document.querySelector("[data-ds-reason^='ad-banner']")) unhideOldAdvertBanners();
        bannerRouteKey = currentRoute;
        bannerSettingState = enabled;
        bannerDirty = false;
        bannerDirtyReason = "";
        bannerDirtyNodes.clear();
        return;
      }

      const connectedCached = [...cachedBannerRoots].filter(root => root?.isConnected);
      cachedBannerRoots = new Set(connectedCached);
      const scopes = dirtySearchScopes();
      const fullDiscovery = routeChanged || settingChanged || (!scopes.length && !connectedCached.length);

      if (fullDiscovery) {
        restoreProtectedAdvertHides();
        migrateHiddenInnerBanners();
      }

      const candidates = candidateElements(fullDiscovery ? bannerDiscoveryScopes() : scopes);
      nodesChecked = candidates.length;
      const roots = [...new Set(candidates.map(findBannerRoot).filter(Boolean))];
      rootsChecked = roots.length;

      for (const root of roots) {
        if (root.dataset.dsHidden === "1") { skipped += 1; cachedBannerRoots.add(root); continue; }
        const revision = bannerRevision(root);
        if (!settingChanged && processedBannerState.get(root) === revision) { skipped += 1; continue; }
        processedBannerState.set(root, revision);
        const reason = `ad-banner:${reasonForRoot(root)}`;
        if (typeof DS.hideElement === "function") {
          DS.hideElement(root, reason);
        } else {
          if (!root.classList.contains("ds-hidden")) root.classList.add("ds-hidden");
          if (root.dataset.dsHidden !== "1") root.dataset.dsHidden = "1";
          if (root.dataset.dsReason !== reason) root.dataset.dsReason = reason;
        }
        cachedBannerRoots.add(root);
        changed += 1;
      }

      bannerRouteKey = currentRoute;
      bannerSettingState = enabled;
      bannerDirty = false;
      bannerDirtyReason = "";
      bannerDirtyNodes.clear();
    } finally {
      const durationMs = started ? Math.round((performance.now() - started) * 10) / 10 : 0;
      DS.traceEvent?.("advert-banners", "refresh-summary", {
        trigger, nodesChecked, rootsChecked, changed, skipped, cacheHit, durationMs
      }, { level: "deep" });
      if (traceToken) DS.diagOperationEnd?.(traceToken, {
        outcome: cacheHit ? "skipped" : "ok",
        counts: { scanned: nodesChecked, changed, skipped, errors: 0 },
        meta: { trigger, rootsChecked, cacheHit, durationMs }
      });
    }
  };
})();
