(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const REASON = "main-footer:";

  function clean(el) {
    return DS.normalize?.(el?.textContent || "") || String(el?.textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function mainFooterRoot() {
    const anchors = [...document.querySelectorAll("a[href*='/2257']")];
    for (const anchor of anchors) {
      let node = anchor.parentElement;
      for (let i = 0; node && i < 8 && node !== document.body; i++, node = node.parentElement) {
        const text = clean(node);
        if (text.includes("owned & operated by") && text.includes("resources") && text.includes("community")) return node;
      }
    }

    const owned = [...document.querySelectorAll("span, p, div")].find(el => clean(el) === "owned & operated by:");
    if (owned) {
      let node = owned.parentElement;
      for (let i = 0; node && i < 8 && node !== document.body; i++, node = node.parentElement) {
        const text = clean(node);
        if (text.includes("resources") && text.includes("community")) return node;
      }
    }
    return null;
  }

  function reset() {
    DS.qsa?.(`[data-ds-reason^="${REASON}"]`).forEach(el => DS.unhideElement?.(el));
  }

  function hide(el, suffix) {
    if (el) DS.hideElement?.(el, `${REASON}${suffix}`);
  }

  function sectionByHeading(root, heading) {
    const wanted = DS.normalize?.(heading) || heading.toLowerCase();
    const label = [...root.querySelectorAll("span, p, strong")].find(el => clean(el) === wanted);
    if (!label) return null;
    let node = label.parentElement;
    for (let i = 0; node && i < 4 && node !== root; i++, node = node.parentElement) {
      if (node.querySelectorAll?.("a").length >= 1 || /flex-col/.test(String(node.className || ""))) return node;
    }
    return label.parentElement;
  }

  function companyBlocks(root) {
    return [...root.querySelectorAll("span, p")]
      .filter(el => clean(el) === "owned & operated by:")
      .map(el => el.parentElement)
      .filter(Boolean);
  }

  function appDownloadBlocks(root) {
    const found = new Set();
    root.querySelectorAll("a[href='/download'], a[href*='play.google.com'], a[href*='apps.apple.com'], img[src*='GooglePlay'], img[src*='appstore' i]").forEach(el => {
      const target = el.closest?.("a") || el;
      const wrapper = target.parentElement && target.parentElement.children.length <= 3 ? target.parentElement : target;
      found.add(wrapper);
    });
    return [...found];
  }

  DS.applyMainFooterManagement = function applyMainFooterManagement() {
    reset();
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableMainFooterManagement) return;
    const root = mainFooterRoot();
    if (!root) return;

    root.dataset.dsMainFooterRoot = "1";
    if (settings.hideMainFooterEntirely) {
      hide(root, "all");
      return;
    }
    if (settings.hideMainFooterCompany) companyBlocks(root).forEach(el => hide(el, "company"));
    if (settings.hideMainFooterResources) hide(sectionByHeading(root, "Resources"), "resources");
    if (settings.hideMainFooterCommunity) hide(sectionByHeading(root, "Community"), "community");
    if (settings.hideMainFooterJoinUs) {
      root.querySelectorAll("span, p, strong").forEach(el => {
        if (clean(el) === "join us") hide(sectionByHeading(root, "Join Us") || el.parentElement, "join-us");
      });
    }
    if (settings.hideMainFooterAppDownload) appDownloadBlocks(root).forEach(el => hide(el, "app-download"));
    if (settings.hideMainFooter2257) {
      root.querySelectorAll("a[href*='/2257']").forEach(el => hide(el, "2257"));
    }
  };

  DS.removeMainFooterManagement = function removeMainFooterManagement() {
    reset();
    document.querySelectorAll("[data-ds-main-footer-root]").forEach(el => delete el.dataset.dsMainFooterRoot);
  };
})();
