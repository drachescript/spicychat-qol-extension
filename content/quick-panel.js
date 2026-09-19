(() => {
  "use strict";

  if (window.__SPICYCHAT_QOL_QUICK_PANEL_V01841__) {
    window.DragonScriptQoL?.scheduleRun?.();
    return;
  }
  window.__SPICYCHAT_QOL_QUICK_PANEL_V01841__ = true;

  const DS = window.DragonScriptQoL;

  const PANEL_MARGIN = 12;
  const TAB_POSITION_KEY = "ds-qol-panel-tab-position-v1";
  const TAB_ENABLED_KEY = "ds-qol-panel-tab-enabled-v2";
  const LEGACY_TAB_ENABLED_KEY = "ds-qol-panel-tab-enabled-v1";
  const PLACEMENTS = new Set([
    "bottom-right",
    "bottom-left",
    "top-right",
    "top-left",
    "sidebar-below-blocked-creators",
    "custom"
  ]);

  const DOCKED_PLACEMENTS = new Set([
    "sidebar-below-blocked-creators"
  ]);

  function getSingleQuickPanel() {
    const panels = [...document.querySelectorAll("#ds-qol-panel")];
    if (!panels.length) return null;

    const primary =
      panels.find(panel => panel.dataset.dsPanelReady === "1") ||
      panels[0];

    panels.forEach(panel => {
      if (panel !== primary) panel.remove();
    });

    return primary;
  }

  function removeAllQuickPanels() {
    document.querySelectorAll("#ds-qol-panel").forEach(panel => panel.remove());
    removeEmptyDockHosts();
  }

  function openOptionsPage() {
    DS.openOptionsTarget?.("general");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function panelNumber(name, fallback, min, max) {
    const raw = Number(DS.state?.settings?.[name]);
    return clamp(Number.isFinite(raw) ? raw : fallback, min, max);
  }

  function getPanelScale() {
    const panelScale = panelNumber("quickPanelUiScale", 100, 80, 125) / 100;
    const accessibilityScale = panelNumber("qolInterfaceScale", 100, 100, 150) / 100;
    return panelScale * accessibilityScale;
  }

  function applyPanelSizing(panel) {
    if (!panel) return;

    const width = panelNumber("quickPanelWidth", 280, 200, 440);
    const scale = getPanelScale();

    panel.style.setProperty("--ds-qol-panel-width", `${width}px`);
    panel.style.setProperty("--ds-qol-panel-zoom", String(scale));
  }

  function configuredPlacement() {
    const value = DS.state?.settings?.quickPanelPlacement || "bottom-right";

    // 0.1.8.25 had a chat-header dock. It ended up covering messages too easily,
    // so old saved values fall back to the safe bottom corner.
    if (value === "chat-header") return "bottom-right";

    return PLACEMENTS.has(value) ? value : "bottom-right";
  }

  function defaultTabPanelEnabled() {
    return DS.state?.settings?.quickPanelEnabledByDefaultInTab !== false;
  }

  function readTabPanelEnabledOverride() {
    try {
      // Old overrides could survive updates and permanently suppress a panel that
      // is configured to be enabled by default. Discard that old one-time state.
      if (sessionStorage.getItem(LEGACY_TAB_ENABLED_KEY) !== null) {
        sessionStorage.removeItem(LEGACY_TAB_ENABLED_KEY);
      }

      const value = sessionStorage.getItem(TAB_ENABLED_KEY);
      if (value === "1") return true;
      if (value === "0") return false;
    } catch {}

    return null;
  }

  function writeTabPanelEnabledOverride(enabled) {
    try {
      const next = !!enabled;

      // Matching the configured default does not need a permanent tab override.
      // This lets later settings changes apply instead of the popup state winning forever.
      if (next === defaultTabPanelEnabled()) {
        sessionStorage.removeItem(TAB_ENABLED_KEY);
        return;
      }

      sessionStorage.setItem(TAB_ENABLED_KEY, next ? "1" : "0");
    } catch {}
  }

  DS.isQuickPanelEnabledForTab = function isQuickPanelEnabledForTab() {
    const override = readTabPanelEnabledOverride();
    if (override !== null) return override;
    return DS.state?.settings?.quickPanelEnabledByDefaultInTab !== false;
  };

  DS.setQuickPanelEnabledForTab = function setQuickPanelEnabledForTab(enabled) {
    writeTabPanelEnabledOverride(!!enabled);

    if (!enabled) {
      removeAllQuickPanels();
    } else {
      DS.createQuickPanel?.();
      DS.updateQuickPanel?.();
    }
  };

  function readTabPanelPosition() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(TAB_POSITION_KEY) || "null");
      if (!parsed || !Number.isFinite(Number(parsed.xPercent)) || !Number.isFinite(Number(parsed.yPercent))) {
        return null;
      }

      return {
        xPercent: clamp(Number(parsed.xPercent), 0, 100),
        yPercent: clamp(Number(parsed.yPercent), 0, 100),
        basePlacement: String(parsed.basePlacement || "")
      };
    } catch {
      return null;
    }
  }

  function writeTabPanelPosition(xPercent, yPercent, basePlacement) {
    try {
      sessionStorage.setItem(
        TAB_POSITION_KEY,
        JSON.stringify({
          xPercent: clamp(Number(xPercent) || 0, 0, 100),
          yPercent: clamp(Number(yPercent) || 0, 0, 100),
          basePlacement: String(basePlacement || configuredPlacement())
        })
      );
    } catch {}
  }

  function activeTabPanelPosition() {
    const stored = readTabPanelPosition();
    if (!stored) return null;

    return stored.basePlacement === configuredPlacement() ? stored : null;
  }

  function getPlacement() {
    return activeTabPanelPosition() ? "custom" : configuredPlacement();
  }

  function panelSize(panel) {
    const rect = panel.getBoundingClientRect();
    return {
      width: rect.width || 260,
      height: rect.height || 100
    };
  }

  function visibleComposerRect() {
    if (!DS.isSingleChatPage?.()) return null;

    const candidates = [
      ...document.querySelectorAll("textarea"),
      ...document.querySelectorAll("button[aria-label='send-message']")
    ].filter(el => {
      if (el.closest("#ds-qol-panel")) return false;

      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width > 28 &&
        rect.height > 20 &&
        rect.bottom > window.innerHeight * 0.45 &&
        rect.top < window.innerHeight &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });

    if (!candidates.length) return null;

    let left = window.innerWidth;
    let right = 0;
    let top = window.innerHeight;
    let bottom = 0;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      left = Math.min(left, rect.left);
      right = Math.max(right, rect.right);
      top = Math.min(top, rect.top);
      bottom = Math.max(bottom, rect.bottom);
    }

    return { left, right, top, bottom };
  }

  function panelHorizontalRange(panel, proposedX = null) {
    const size = panelSize(panel);
    let left = Number(proposedX);

    if (!Number.isFinite(left)) {
      const rect = panel.getBoundingClientRect();
      left = Number.isFinite(rect.left) ? rect.left : PANEL_MARGIN;
    }

    return {
      left,
      right: left + size.width
    };
  }

  function rangesOverlapHorizontally(a, b, padding = 4) {
    return !(a.right <= b.left + padding || a.left >= b.right - padding);
  }

  function composerBottomReserve(panel, proposedX = null) {
    const composer = visibleComposerRect();
    if (!composer || !panel) return PANEL_MARGIN;

    const panelRange = panelHorizontalRange(panel, proposedX);
    if (!rangesOverlapHorizontally(panelRange, composer, 6)) {
      return PANEL_MARGIN;
    }

    return Math.max(
      PANEL_MARGIN,
      Math.ceil(window.innerHeight - composer.top + PANEL_MARGIN)
    );
  }

  function floatingPanelBounds(panel, proposedX = null) {
    const size = panelSize(panel);
    const maxX = Math.max(PANEL_MARGIN, window.innerWidth - size.width - PANEL_MARGIN);
    const x = clamp(
      Number.isFinite(Number(proposedX)) ? Number(proposedX) : panel.getBoundingClientRect().left,
      PANEL_MARGIN,
      maxX
    );
    const safeBottom = composerBottomReserve(panel, x);
    const maxY = Math.max(
      PANEL_MARGIN,
      window.innerHeight - size.height - safeBottom
    );

    return { size, maxX, maxY };
  }

  function defaultCustomPercent(name, fallback) {
    return panelNumber(name, fallback, 0, 100);
  }


  function isDockedPlacement(placement) {
    return DOCKED_PLACEMENTS.has(placement);
  }

  function panelDockHost(id, className) {
    let host = document.getElementById(id);
    if (!host) {
      host = document.createElement("div");
      host.id = id;
      host.className = className;
    }
    return host;
  }

  function movePanelToDocument(panel) {
    if (!panel || panel.parentElement === document.documentElement) return;
    document.documentElement.appendChild(panel);
  }

  function removeEmptyDockHosts() {
    [
      "ds-qol-chat-header-dock",
      "ds-qol-sidebar-dock"
    ].forEach(id => {
      const host = document.getElementById(id);
      if (host && !host.contains(document.getElementById("ds-qol-panel"))) {
        host.remove();
      }
    });
  }

  function findSidebarBlockedCreatorsTarget() {
    const link =
      DS.getStablePageElement?.("quick-panel-blocked-creators-link", "a[href='/blocked-creators'],a[href$='/blocked-creators'],a[href*='/blocked-creators']") ||
      document.querySelector("a[href='/blocked-creators'],a[href$='/blocked-creators'],a[href*='/blocked-creators']");

    if (!link) return null;

    return link.closest(".w-full") || link.parentElement;
  }

  function dockPanel(panel, placement) {
    if (placement === "sidebar-below-blocked-creators") {
      const target = findSidebarBlockedCreatorsTarget();
      if (!target) return false;

      const host = panelDockHost("ds-qol-sidebar-dock", "ds-qol-dock ds-qol-sidebar-dock");
      if (!host.parentElement) target.insertAdjacentElement("afterend", host);
      if (panel.parentElement !== host) host.appendChild(panel);
      removeEmptyDockHosts();
      return true;
    }

    return false;
  }

  function makePanelFixedAtCurrentSpot(panel) {
    const rect = panel.getBoundingClientRect();
    movePanelToDocument(panel);

    panel.style.position = "fixed";
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.dataset.dsPanelPlacement = "custom";
  }

  function getSidebarSafeLeft() {
    const nav = DS.getStablePageElement?.("quick-panel-nav", "nav") || document.querySelector("nav");
    if (!nav) return PANEL_MARGIN;

    const rect = nav.getBoundingClientRect();
    const style = getComputedStyle(nav);

    if (
      rect.width > 44 &&
      rect.height > 80 &&
      rect.left <= 4 &&
      rect.right < window.innerWidth * 0.55 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    ) {
      return Math.round(rect.right + PANEL_MARGIN);
    }

    return PANEL_MARGIN;
  }

  function getTopSafeOffset() {
    const candidates = [
      ...document.querySelectorAll("header, [class*='sticky'][class*='top-0'], .sticky.top-0")
    ];

    let bottom = 0;

    for (const el of candidates) {
      if (el.closest("#ds-qol-panel")) continue;

      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      if (
        rect.width > 80 &&
        rect.height >= 32 &&
        rect.top <= 6 &&
        rect.bottom > bottom &&
        rect.bottom < 140 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      ) {
        bottom = rect.bottom;
      }
    }

    return Math.round(Math.max(PANEL_MARGIN, bottom + PANEL_MARGIN));
  }

  function setPanelFixedMaxHeight(panel, top, bottom = PANEL_MARGIN) {
    const scale = getPanelScale();
    const maxPercent = panelNumber("quickPanelMaxHeightPercent", 80, 25, 95);
    const viewportLimit = window.innerHeight * (maxPercent / 100);
    const availableVisual = Math.max(
      140,
      Math.min(viewportLimit, window.innerHeight - top - bottom)
    );

    panel.style.setProperty(
      "--ds-qol-body-max-height",
      `${Math.max(80, Math.floor((availableVisual - 52) / scale))}px`
    );
  }

  function fitPanelToVisibleContent(panel) {
    if (!panel) return;

    const body = panel.querySelector(".ds-qol-body");
    const head = panel.querySelector(".ds-qol-head");

    panel.style.setProperty("height", "auto", "important");
    panel.style.setProperty("min-height", "0", "important");
    panel.style.setProperty("max-height", "none", "important");
    panel.style.setProperty("block-size", "auto", "important");

    if (panel.classList.contains("ds-closed") || !body || !head) return;

    const scale = getPanelScale();
    const maxPercent = panelNumber("quickPanelMaxHeightPercent", 80, 25, 95);
    const topOffset = Number.parseFloat(panel.style.top || "") || PANEL_MARGIN;
    const bottomOffset = Math.max(
      Number.parseFloat(panel.style.bottom || "") || PANEL_MARGIN,
      composerBottomReserve(panel)
    );
    const viewportLimit = window.innerHeight * (maxPercent / 100);
    const availableVisual = Math.max(
      140,
      Math.min(viewportLimit, window.innerHeight - topOffset - bottomOffset)
    );

    const panelStyle = getComputedStyle(panel);
    const bodyStyle = getComputedStyle(body);
    const chromeCss =
      head.getBoundingClientRect().height / scale +
      (Number.parseFloat(panelStyle.paddingTop) || 0) +
      (Number.parseFloat(panelStyle.paddingBottom) || 0) +
      (Number.parseFloat(panelStyle.borderTopWidth) || 0) +
      (Number.parseFloat(panelStyle.borderBottomWidth) || 0) +
      (Number.parseFloat(bodyStyle.marginTop) || 0);
    const bodyLimitCss = Math.max(80, Math.floor(availableVisual / scale - chromeCss));

    body.style.setProperty("height", "auto", "important");
    body.style.setProperty("min-height", "0", "important");
    body.style.setProperty("max-height", `${bodyLimitCss}px`, "important");
    body.style.setProperty("flex", "0 0 auto", "important");
    body.style.setProperty(
      "overflow-y",
      body.scrollHeight > bodyLimitCss + 2 ? "auto" : "visible",
      "important"
    );
  }

  function panelRouteKey() {
    return `${location.pathname}${location.search}`;
  }

  function setPanelClosed(panel, closed) {
    if (!panel) return;

    panel.classList.toggle("ds-closed", !!closed);

    const toggle = panel.querySelector(".ds-qol-toggle");
    if (toggle) {
      toggle.textContent = closed ? "+" : "-";
      toggle.title = closed ? "Expand" : "Collapse";
    }
  }

  function applyDefaultPanelStateForRoute(panel, force = false) {
    const route = panelRouteKey();
    if (!force && panel.dataset.dsPanelRoute === route) return;

    panel.dataset.dsPanelRoute = route;
    delete panel.dataset.dsManualPanelOpen;
    delete panel.dataset.dsAutoCollapsedForOverlap;
    setPanelClosed(panel, !!DS.state?.settings?.quickPanelDefaultClosed);
  }

  function applyQuickPanelPosition(panel) {
    if (!panel || panel.classList.contains("ds-qol-dragging")) return;

    const settings = DS.state?.settings || {};
    const placement = getPlacement();

    panel.classList.toggle("ds-qol-draggable", !!settings.quickPanelDraggable);
    panel.dataset.dsPanelPlacement = placement;
    applyPanelSizing(panel);

    panel.style.left = "";
    panel.style.right = "";
    panel.style.top = "";
    panel.style.bottom = "";
    panel.style.position = "";
    panel.style.height = "";
    panel.style.minHeight = "";
    panel.style.maxHeight = "";
    panel.style.removeProperty("--ds-qol-body-max-height");

    if (dockPanel(panel, placement)) {
      return;
    }

    movePanelToDocument(panel);
    removeEmptyDockHosts();

    const topSafe = getTopSafeOffset();
    const leftSafe = getSidebarSafeLeft();
    const size = panelSize(panel);
    const viewportMaxX = Math.max(
      PANEL_MARGIN,
      window.innerWidth - size.width - PANEL_MARGIN
    );

    panel.style.position = "fixed";

    if (placement === "custom") {
      const tabPosition = activeTabPanelPosition();
      const xPercent = tabPosition?.xPercent ?? defaultCustomPercent("quickPanelCustomXPercent", 70);
      const yPercent = tabPosition?.yPercent ?? defaultCustomPercent("quickPanelCustomYPercent", 12);
      const x = clamp((viewportMaxX * xPercent) / 100, PANEL_MARGIN, viewportMaxX);
      const { maxY } = floatingPanelBounds(panel, x);
      const y = clamp((maxY * yPercent) / 100, PANEL_MARGIN, maxY);
      const safeBottom = composerBottomReserve(panel, x);

      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      setPanelFixedMaxHeight(panel, y, safeBottom);
      return;
    }

    let projectedX = PANEL_MARGIN;

    if (placement.includes("right")) {
      panel.style.right = `${PANEL_MARGIN}px`;
      projectedX = viewportMaxX;
    }

    if (placement.includes("left")) {
      panel.style.left = `${leftSafe}px`;
      projectedX = clamp(leftSafe, PANEL_MARGIN, viewportMaxX);
    }

    const safeBottom = composerBottomReserve(panel, projectedX);

    if (placement.includes("top")) {
      panel.style.top = `${topSafe}px`;
      setPanelFixedMaxHeight(panel, topSafe, safeBottom);
    }

    if (placement.includes("bottom")) {
      panel.style.bottom = `${safeBottom}px`;
      setPanelFixedMaxHeight(panel, PANEL_MARGIN, safeBottom);
    }
  }

  function rectsOverlap(a, b, padding = 4) {
    return !(
      a.right <= b.left + padding ||
      a.left >= b.right - padding ||
      a.bottom <= b.top + padding ||
      a.top >= b.bottom - padding
    );
  }

  function panelCoversChatContent(panel) {
    if (!panel || !DS.isSingleChatPage?.()) return false;
    if (panel.classList.contains("ds-closed")) return false;
    if (isDockedPlacement(getPlacement())) return false;

    const panelRect = panel.getBoundingClientRect();
    const targets = [
      ...document.querySelectorAll("[id^='message-']"),
      ...document.querySelectorAll("textarea")
    ].filter(el => {
      if (el.closest("#ds-qol-panel")) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width > 40 &&
        rect.height > 20 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });

    return targets.some(el => rectsOverlap(panelRect, el.getBoundingClientRect(), 6));
  }

  function panelInteractionActive(panel) {
    if (!panel) return false;
    if (panel.contains(document.activeElement)) return true;
    return Date.now() < Number(panel.dataset.dsInteractionUntil || 0);
  }

  function applyOverlapAutoCollapse(panel) {
    const settings = DS.state?.settings || {};

    if (panelInteractionActive(panel)) return false;

    if (settings.quickPanelAutoCollapseOverlap === false) return false;
    if (panel.dataset.dsManualPanelOpen === "1") return false;
    if (!panelCoversChatContent(panel)) return false;

    panel.dataset.dsAutoCollapsedForOverlap = "1";
    setPanelClosed(panel, true);
    return true;
  }

  function persistCustomPanelPosition(panel, x, y) {
    const { maxX, maxY } = floatingPanelBounds(panel, x);
    const xPercent = maxX > 0 ? (clamp(x, PANEL_MARGIN, maxX) / maxX) * 100 : 0;
    const yPercent = maxY > 0 ? (clamp(y, PANEL_MARGIN, maxY) / maxY) * 100 : 0;

    writeTabPanelPosition(xPercent, yPercent, configuredPlacement());
  }

  function installPanelDragging(panel) {
    if (!panel || panel.dataset.dsDragInstalled === "1") return;
    panel.dataset.dsDragInstalled = "1";

    const head = panel.querySelector(".ds-qol-head");
    if (!head) return;

    let dragging = null;

    const stopDragging = event => {
      if (!dragging) return;

      try {
        event?.preventDefault?.();
      } catch {}

      const rect = panel.getBoundingClientRect();
      dragging = null;
      panel.classList.remove("ds-qol-dragging");

      persistCustomPanelPosition(panel, rect.left, rect.top);
    };

    const moveDragging = event => {
      if (!dragging) return;

      const size = panelSize(panel);
      const maxX = Math.max(PANEL_MARGIN, window.innerWidth - size.width - PANEL_MARGIN);
      const x = clamp(event.clientX - dragging.offsetX, PANEL_MARGIN, maxX);
      const { maxY } = floatingPanelBounds(panel, x);
      const y = clamp(event.clientY - dragging.offsetY, PANEL_MARGIN, maxY);
      const safeBottom = composerBottomReserve(panel, x);

      panel.dataset.dsPanelPlacement = "custom";
      panel.style.position = "fixed";
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      setPanelFixedMaxHeight(panel, y, safeBottom);

      event.preventDefault();
    };

    head.addEventListener("pointerdown", event => {
      const settings = DS.state?.settings || {};
      if (!settings.quickPanelDraggable) return;
      if (event.button !== 0) return;
      if (event.target?.closest?.("button, input, select, textarea, a")) return;

      makePanelFixedAtCurrentSpot(panel);

      const rect = panel.getBoundingClientRect();
      dragging = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };

      panel.classList.add("ds-qol-dragging");

      event.preventDefault();
    });

    document.addEventListener("pointermove", moveDragging, true);
    document.addEventListener("pointerup", stopDragging, true);
    document.addEventListener("pointercancel", stopDragging, true);

    const refreshForComposer = event => {
      const target = event?.target;
      if (!target || target.closest?.("#ds-qol-panel")) return;
      if (!target.matches?.("textarea, input[placeholder*='Message'], [contenteditable='true']")) return;

      requestAnimationFrame(() => {
        applyQuickPanelPosition(panel);
        fitPanelToVisibleContent(panel);
      });
    };

    document.addEventListener("input", refreshForComposer, true);
    document.addEventListener("focusin", refreshForComposer, true);

    window.addEventListener("resize", () => {
      applyQuickPanelPosition(panel);
      fitPanelToVisibleContent(panel);
    });
  }

  DS.setQuickStatus = function setQuickStatus(text, sticky = false) {
    const el = document.getElementById("ds-qol-status");

    if (!el) return;

    el.textContent = text;

    clearTimeout(DS.state.quickPanelStatusTimer);

    if (!sticky) {
      DS.state.quickPanelStatusTimer = setTimeout(
        () => DS.updateQuickPanel?.(),
        2500
      );
    }
  };

  DS.createQuickPanel = function createQuickPanel() {
    const { settings } = DS.state;

    if (
      !settings.showQuickPanel ||
      !DS.isQuickPanelEnabledForTab?.()
    ) {
      removeAllQuickPanels();
      return;
    }

    const existing = getSingleQuickPanel();
    if (existing) {
      if (existing.dataset.dsPanelReady === "1") {
        applyDefaultPanelStateForRoute(existing);
        return;
      }

      existing.remove();
    }

    const panel = document.createElement("div");
    panel.id = "ds-qol-panel";

    DS.setSafeMarkup(panel, `
      <div class="ds-qol-head">
        <span class="ds-qol-title">SpicyChat QoL</span>
        <button class="ds-qol-toggle" type="button" title="Collapse">-</button>
      </div>

      <div class="ds-qol-body">
        <div class="ds-qol-status" id="ds-qol-status">Loading...</div>

        <div class="ds-qol-row" id="ds-qol-normal-row">
          <button id="ds-qol-options" type="button">Options</button>
          <button id="ds-qol-fill-listing" type="button">Fill now</button>
        </div>

        <div id="ds-qol-chat-list-tools">
          <div id="ds-qol-chat-search-wrap">
            <input
              id="ds-qol-chat-search"
              type="text"
              placeholder="Search chats, descriptions, messages..."
            >
          </div>

          <div id="ds-qol-chat-sort-wrap">
            <select id="ds-qol-chat-sort">
              <option value="default">Last messaged / default</option>
              <option value="messages-desc">Most messages first</option>
              <option value="messages-asc">Fewest messages first</option>
              <option value="alpha-asc">Alphabetical A-Z</option>
              <option value="alpha-desc">Alphabetical Z-A</option>
            </select>
          </div>

          <div id="ds-qol-chat-filter-wrap">
            <select id="ds-qol-chat-opened-filter" aria-label="Filter chats by opened state">
              <option value="all">All chats</option>
              <option value="opened">Opened/known only</option>
              <option value="unopened">Unopened only</option>
            </select>
            <select id="ds-qol-chat-message-filter" aria-label="Filter chats by message count">
              <option value="all">All message counts</option>
              <option value="0">0 messages</option>
              <option value="1-9">1-9 messages</option>
              <option value="10-49">10-49 messages</option>
              <option value="50-99">50-99 messages</option>
              <option value="100-499">100-499 messages</option>
              <option value="500+">500+ messages</option>
              <option value="unknown">Unknown count</option>
            </select>
            <select id="ds-qol-chat-saved-filter" aria-label="Filter chats by local saved state">
              <option value="all">All saved states</option>
              <option value="favorite">Favorite history</option>
              <option value="later">Later</option>
              <option value="both">Favorite + Later</option>
              <option value="saved">Any locally saved</option>
              <option value="neither">Neither</option>
            </select>
            <select id="ds-qol-chat-blocked-filter" aria-label="Filter chats by blocked state">
              <option value="all">All blocked states</option>
              <option value="blocked">Blocked only</option>
              <option value="unblocked">Not blocked</option>
            </select>
            <span id="ds-qol-chat-filter-summary" class="ds-qol-small-note">Showing 0/0</span>
          </div>

          <div class="ds-qol-row" id="ds-qol-chat-list-buttons">
            <button id="ds-qol-scan-visible" type="button">Scan visible</button>
            <button id="ds-qol-load-all-chats" type="button">Load all</button>
          </div>
        </div>

        <div id="ds-qol-smart-filter-pins-row" class="ds-qol-smart-filter-pins" style="display:none;">
          <span class="ds-qol-small-note">Pinned filters</span>
          <div id="ds-qol-smart-filter-pins" class="ds-qol-row"></div>
        </div>

        <div id="ds-qol-current-chat-search-tools">
          <div class="ds-qol-current-chat-search-head">
            <span>Search this chat</span>
            <span id="ds-qol-current-chat-search-count">0 / 0</span>
          </div>
          <input
            id="ds-qol-current-chat-search"
            type="search"
            placeholder="Search messages..."
            autocomplete="off"
            aria-label="Search this chat"
          >
          <select id="ds-qol-current-chat-search-scope" aria-label="Search messages from">
            <option value="all">All messages</option>
            <option value="bot">Bot messages</option>
            <option value="user">Your messages</option>
          </select>
          <div class="ds-qol-row" id="ds-qol-current-chat-search-nav">
            <button id="ds-qol-current-chat-search-prev" type="button" title="Previous result">Previous</button>
            <button id="ds-qol-current-chat-search-next" type="button" title="Next result">Next</button>
          </div>
          <button id="ds-qol-current-chat-search-load-older" type="button" hidden>Load older</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-focus-row">
          <button id="ds-qol-focus-mode" type="button">Focus mode</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-character-profile-row">
          <button id="ds-qol-character-profile" type="button">Character profile</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-saved-snippets-row">
          <button id="ds-qol-saved-snippets" type="button">Saved snippets</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-context-keeper-row">
          <button id="ds-qol-context-keeper" type="button">Context keeper</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-story-day-row">
          <button id="ds-qol-story-day" type="button">Storydate</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-rp-state-row">
          <button id="ds-qol-rp-state" type="button">RP State</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-auto-voice-row">
          <button id="ds-qol-auto-voice" type="button">Auto voice: Off</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-auto-asterisk-row">
          <button id="ds-qol-auto-asterisk" type="button">Auto *: Off</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-translation-row">
          <button id="ds-qol-auto-translate" type="button">Auto translate: Off</button>
          <button id="ds-qol-translate-visible" type="button">Translate visible</button>
        </div>

        <div class="ds-qol-row ds-qol-soundscape-row" id="ds-qol-soundscape-row">
          <select id="ds-qol-soundscape-select" aria-label="Soundscape"></select>
          <button id="ds-qol-soundscape-toggle" type="button">Play</button>
        </div>

        <div class="ds-qol-row" id="ds-qol-chat-row">
          <button id="ds-qol-copy-chat" type="button">Copy chat</button>
          <button id="ds-qol-export-chat" type="button">Export chat</button>
        </div>
      </div>
    `);

    panel.dataset.dsPanelReady = "1";
    document.documentElement.appendChild(panel);
    applyDefaultPanelStateForRoute(panel, true);
    installPanelDragging(panel);

    panel.querySelector(".ds-qol-toggle")?.addEventListener("click", () => {
      const opening = panel.classList.contains("ds-closed");
      setPanelClosed(panel, !opening);

      if (opening) panel.dataset.dsManualPanelOpen = "1";
      else delete panel.dataset.dsManualPanelOpen;

      requestAnimationFrame(() => {
        applyQuickPanelPosition(panel);
        fitPanelToVisibleContent(panel);
      });
    });

    panel.querySelector("#ds-qol-options")?.addEventListener("click", openOptionsPage);

    panel.querySelector("#ds-qol-fill-listing")?.addEventListener("click", async () => {
      if (DS.state.autoFillRunning) {
        DS.stopListingAutoFill?.();
        DS.updateQuickPanel?.();
        return;
      }
      await DS.manualListingAutoFill?.();
    });

    panel.querySelector("#ds-qol-scan-visible")?.addEventListener("click", async () => {
      await DS.importVisibleOpenedChats?.({ force: true });
      await DS.runAll?.();
      DS.setQuickStatus("Visible page scanned.");
    });

    panel.querySelector("#ds-qol-load-all-chats")?.addEventListener("click", async () => {
      await DS.manualLoadAllChatsAndImport?.();
    });

    panel.querySelector("#ds-qol-auto-voice")?.addEventListener("click", () => {
      DS.toggleAutoVoice?.();
      DS.applyAutoVoice?.();
      DS.updateQuickPanel?.();
    });

    panel.querySelector("#ds-qol-auto-asterisk")?.addEventListener("click", async () => {
      await DS.toggleAutoPairAsterisks?.();
      DS.updateQuickPanel?.();
    });

    panel.querySelector("#ds-qol-auto-translate")?.addEventListener("click", async () => {
      const settings = DS.state?.settings || {};
      if (!settings.enableTranslation) return;
      const next = { ...settings, translationAutoAi: !settings.translationAutoAi };
      DS.state.settings = next;
      await DS.storageSet?.({ settings: next });
      DS.applyTranslationTools?.();
      DS.updateQuickPanel?.();
    });

    panel.querySelector("#ds-qol-translate-visible")?.addEventListener("click", async () => {
      const button = panel.querySelector("#ds-qol-translate-visible");
      if (button) { button.disabled = true; button.textContent = "Translating..."; }
      try { await DS.translateVisibleMessages?.(); }
      finally {
        if (button) { button.disabled = false; button.textContent = "Translate visible"; }
      }
    });

    panel.querySelector("#ds-qol-soundscape-select")?.addEventListener("change", async event => {
      await DS.setActiveSoundscape?.(event.target.value);
      DS.updateQuickPanel?.();
    });

    panel.querySelector("#ds-qol-soundscape-toggle")?.addEventListener("click", async () => {
      const button = panel.querySelector("#ds-qol-soundscape-toggle");
      if (button) button.disabled = true;
      try { await DS.toggleSoundscapePlayback?.(); }
      finally { if (button) button.disabled = false; DS.updateQuickPanel?.(); }
    });

    panel.querySelector("#ds-qol-copy-chat")?.addEventListener("click", async () => {
      await DS.copyCurrentChat?.();
    });

    panel.querySelector("#ds-qol-export-chat")?.addEventListener("click", async () => {
      await DS.exportCurrentChat?.();
    });

    panel.querySelector("#ds-qol-chat-search")?.addEventListener("input", () => {
      DS.applyChatListTools?.();
    });

    panel.querySelector("#ds-qol-chat-sort")?.addEventListener("change", async event => {
      const next = { ...(DS.state.settings || {}), chatListSortMode: event.target.value };
      DS.state.settings = next;
      await DS.storageSet?.({ settings: next });
      DS.applyChatListTools?.();
    });

    panel.querySelector("#ds-qol-chat-opened-filter")?.addEventListener("change", async event => {
      const next = { ...(DS.state.settings || {}), chatListOpenedFilter: event.target.value };
      DS.state.settings = next;
      await DS.storageSet?.({ settings: next });
      DS.applyChatListTools?.();
    });

    panel.querySelector("#ds-qol-chat-message-filter")?.addEventListener("change", async event => {
      const next = { ...(DS.state.settings || {}), chatListMessageFilter: event.target.value };
      DS.state.settings = next;
      await DS.storageSet?.({ settings: next });
      DS.applyChatListTools?.();
    });

    panel.querySelector("#ds-qol-chat-saved-filter")?.addEventListener("change", async event => {
      const next = { ...(DS.state.settings || {}), chatListSavedFilter: event.target.value };
      DS.state.settings = next;
      await DS.storageSet?.({ settings: next });
      DS.applyChatListTools?.();
    });

    panel.querySelector("#ds-qol-chat-blocked-filter")?.addEventListener("change", async event => {
      const next = { ...(DS.state.settings || {}), chatListBlockedFilter: event.target.value };
      DS.state.settings = next;
      await DS.storageSet?.({ settings: next });
      DS.applyChatListTools?.();
    });

    DS.bindChatSearchQuickPanel?.();

    panel.querySelector("#ds-qol-focus-mode")?.addEventListener("click", () => {
      DS.toggleFocusMode?.();
    });

    panel.querySelector("#ds-qol-character-profile")?.addEventListener("click", () => {
      DS.openCharacterQolProfile?.();
    });

    panel.querySelector("#ds-qol-saved-snippets")?.addEventListener("click", () => {
      DS.openSavedSnippets?.();
    });

    panel.querySelector("#ds-qol-context-keeper")?.addEventListener("click", () => {
      DS.openContextKeeper?.();
    });

    panel.querySelector("#ds-qol-story-day")?.addEventListener("click", () => {
      DS.openStoryDayTracker?.();
    });

    panel.querySelector("#ds-qol-rp-state")?.addEventListener("click", () => {
      DS.openRpStateTracker?.();
    });

    const keepPanelInteractionStable = () => {
      panel.dataset.dsInteractionUntil = String(Date.now() + 1200);
    };

    panel.addEventListener("pointerdown", keepPanelInteractionStable, true);
    panel.addEventListener("focusin", keepPanelInteractionStable, true);
    panel.addEventListener("change", keepPanelInteractionStable, true);
    panel.addEventListener("focusout", () => {
      panel.dataset.dsInteractionUntil = String(Date.now() + 180);
      setTimeout(() => DS.updateQuickPanel?.(), 220);
    }, true);

    DS.updateQuickPanel({ forceLayout: true });
  };

  function moveIfPresent(body, el) {
    if (body && el && el.parentElement === body) body.appendChild(el);
  }

  function setShown(el, shown, display = "") {
    if (!el) return false;
    const next = shown ? display : "none";
    if (el.style.display === next) return false;
    el.style.display = next;
    return true;
  }

  function setText(el, value) {
    if (!el) return false;
    const next = String(value ?? "");
    if (el.textContent === next) return false;
    el.textContent = next;
    return true;
  }

  function setAttr(el, name, value) {
    if (!el) return false;
    const next = String(value ?? "");
    if (el.getAttribute(name) === next) return false;
    el.setAttribute(name, next);
    return true;
  }

  const PANEL_SIGNATURE_SETTINGS = [
    "quickPanelShowStatus", "quickPanelShowFeatureSummary", "quickPanelStatusShowOpened", "quickPanelStatusShowBlocked",
    "quickPanelShowOptions", "quickPanelShowFillNow", "showChatListTools", "quickPanelShowChatSearch", "quickPanelShowChatSort",
    "quickPanelShowScanVisible", "quickPanelShowLoadAll", "showChatSearch", "chatSearchShowPanel", "enableFocusMode",
    "enableCharacterQolProfiles", "enableSavedTextSnippets", "enableContextKeeper", "enableStoryDayTracker", "storyDayTrackerShowQuickPanel", "enableRpStateTracker", "rpStateShowQuickPanel", "quickPanelShowAutoVoice", "autoPairAsterisks",
    "quickPanelShowAutoAsterisk", "enableTranslation", "quickPanelShowTranslation", "translationAutoAi", "enableSoundscapes",
    "quickPanelShowSoundscapes", "showChatExportButton", "quickPanelShowExport", "chatListSortMode", "chatListOpenedFilter",
    "chatListMessageFilter", "chatListSavedFilter", "chatListBlockedFilter", "chatPerformanceMode", "enableSmartFilterPresets",
    "quickPanelShowSmartFilterPins", "quickPanelWidth", "quickPanelUiScale", "qolInterfaceScale", "quickPanelMaxHeightPercent",
    "quickPanelPlacement", "quickPanelCustomXPercent", "quickPanelCustomYPercent", "quickPanelDraggable"
  ];

  function quickPanelStateSignature(panel, settings, onChatListPage, onSingleChatPage) {
    const page = DS.getPageState?.() || {};
    const refill = !onSingleChatPage && !onChatListPage ? (DS.getListingAutoFillStatus?.() || {}) : {};
    const sound = DS.getSoundscapePanelState?.() || {};
    const story = DS.getStoryDaySnapshot?.() || {};
    const rpState = DS.getRpStateSnapshot?.() || {};
    const settingsPart = PANEL_SIGNATURE_SETTINGS.map(key => `${key}:${String(settings?.[key] ?? "")}`).join("|");
    const visibleChats = onChatListPage && settings.quickPanelShowStatus !== false
      ? (document.querySelectorAll("a[href*='/chat/']")?.length || 0)
      : 0;
    return [
      page.href || location.href,
      panel.classList.contains("ds-closed") ? 1 : 0,
      settingsPart,
      DS.state.openedChats?.size || 0,
      (DS.state.blockedBots?.ids?.length || 0) + (DS.state.blockedBots?.names?.length || 0),
      DS.state.savedPersonas?.length || 0,
      DS.state.manualImportRunning ? 1 : 0,
      onSingleChatPage ? (DS.isFocusModeActive?.() ? 1 : 0) : 0,
      onSingleChatPage ? (DS.hasCurrentCharacterQolProfile?.() ? 1 : 0) : 0,
      onSingleChatPage ? (DS.isAutoVoiceEnabled?.() ? 1 : 0) : 0,
      onSingleChatPage ? (DS.isNativeVoiceAvailable?.() ? 1 : 0) : 0,
      `${sound.playing ? 1 : 0}:${sound.activeId || ""}:${(sound.scenes || []).map(scene => `${scene.id}:${scene.name}`).join(",")}`,
      `${story.code || ""}:${story.pending || 0}`,
      `${rpState.count || 0}:${rpState.pending || 0}:${(rpState.items || []).map(item => `${item.id || item.key}:${item.updatedAt || 0}:${item.includeInContext === false ? 0 : 1}`).join(",")}`,
      `${refill.running ? 1 : 0}:${refill.stopping ? 1 : 0}:${refill.visible || 0}:${refill.hidden || 0}:${refill.pagesLoaded || 0}:${refill.lastError || ""}`,
      visibleChats
    ].join("~");
  }

  function orderQuickPanelSections(panel, onChatListPage, onSingleChatPage) {
    const body = panel?.querySelector(".ds-qol-body");
    if (!body) return;

    const status = document.getElementById("ds-qol-status");
    const normalRow = document.getElementById("ds-qol-normal-row");
    const chatListTools = document.getElementById("ds-qol-chat-list-tools");
    const smartFilterPinsRow = document.getElementById("ds-qol-smart-filter-pins-row");
    const currentChatSearchTools = document.getElementById("ds-qol-current-chat-search-tools");
    const focusRow = document.getElementById("ds-qol-focus-row");
    const characterProfileRow = document.getElementById("ds-qol-character-profile-row");
    const savedSnippetsRow = document.getElementById("ds-qol-saved-snippets-row");
    const contextKeeperRow = document.getElementById("ds-qol-context-keeper-row");
    const storyDayRow = document.getElementById("ds-qol-story-day-row");
    const oocRow = document.getElementById("ds-qol-ooc-row");
    const personaRow = document.getElementById("ds-qol-persona-row");
    const autoVoiceRow = document.getElementById("ds-qol-auto-voice-row");
    const autoAsteriskRow = document.getElementById("ds-qol-auto-asterisk-row");
    const translationRow = document.getElementById("ds-qol-translation-row");
    const soundscapeRow = document.getElementById("ds-qol-soundscape-row");
    const chatRow = document.getElementById("ds-qol-chat-row");

    const desired = [status, normalRow];
    if (onSingleChatPage) {
      desired.push(
        currentChatSearchTools,
        focusRow,
        characterProfileRow,
        savedSnippetsRow,
        contextKeeperRow,
        storyDayRow,
        oocRow,
        personaRow,
        autoVoiceRow,
        autoAsteriskRow,
        translationRow,
        soundscapeRow,
        chatRow
      );
    } else if (onChatListPage) {
      desired.push(chatListTools);
    } else {
      desired.push(smartFilterPinsRow, soundscapeRow, chatRow);
    }

    const wanted = desired.filter(el => el && el.parentElement === body);
    const wantedSet = new Set(wanted);
    const current = [...body.children].filter(el => wantedSet.has(el));
    const alreadyOrdered = current.length === wanted.length && current.every((el, index) => el === wanted[index]);
    if (alreadyOrdered) return;

    const fragment = document.createDocumentFragment();
    wanted.forEach(el => fragment.appendChild(el));
    body.appendChild(fragment);
  }

  function quickPanelLayoutSignature(panel, onChatListPage, onSingleChatPage) {
    const settings = DS.state?.settings || {};
    const body = panel?.querySelector(".ds-qol-body");
    const visibleState = body
      ? [...body.children].map(el => `${el.id || el.className}:${el.style.display}:${el.hidden ? 1 : 0}`).join("|")
      : "";
    return [
      location.pathname,
      onChatListPage ? 1 : 0,
      onSingleChatPage ? 1 : 0,
      configuredPlacement(),
      panelNumber("quickPanelWidth", 280, 200, 440),
      getPanelScale(),
      panelNumber("quickPanelMaxHeightPercent", 80, 25, 95),
      Number(settings.quickPanelCustomXPercent ?? 70),
      Number(settings.quickPanelCustomYPercent ?? 12),
      settings.quickPanelDraggable ? 1 : 0,
      panel.classList.contains("ds-closed") ? 1 : 0,
      visibleState
    ].join("~");
  }

  function enabledFeatureCountForCurrentPage(settings) {
    const common = [
      "saiToolkitCompatibility",
      "hidePremium",
      "hideFloatingPremiumPopups",
      "hideAdvertBanners",
      "hideNotifications",
      "hideTabNotificationBadge"
    ];
    const chat = [
      "showChatTopBarTools",
      "chatTopBarAddLaterButton",
      "showPerCharacterChatHistory",
      "showQuickNewChatButton",
      "enableBulkMemoryManager",
      "showAsteriskButton",
      "autoPairAsterisks",
      "showFormattingToolbar",
      "showChatSearch",
      "enableFocusMode",
      "enableCharacterQolProfiles",
      "enableSavedTextSnippets",
      "enableContextKeeper",
      "enableStoryDayTracker",
      "enableRpFormatRepair",
      "enableChatBubbleCustomization",
      "androidTopBarMenu",
      "allowTypingWhileAiResponding",
      "keepChatPositionWhileTyping",
      "showScrollToTopButton",
      "showScrollToBottomButton",
      "protectDraftDuringMessageRemoval",
      "failedMessageHelper",
      "chatPerformanceMode",
      "showChatExportButton",
      "showOocTools",
      "showPersonaQuickSwitch",
      "enableTranslation",
      "enableSoundscapes"
    ];
    const chatList = [
      "showChatListTools",
      "showSavedChatQuickActions",
      "showRandomChatButton",
      "trackOpenedChats",
      "importOpenedFromChatsPage",
      "hideOpenedChats"
    ];
    const listing = [
      "blockCards",
      "showCreatorFavoriteButtons",
      "trackFavoriteBots",
      "showLaterBotButtons",
      "hideHomeForYouCards",
      "expandLongCardDescriptions",
      "hideGroupChats",
      "showLorebookFilters",
      "enableSmartFilterPresets",
      "enableCreationAudit",
      "enableBotOrganizer",
      "enableRecommendationHelpers",
      "enableLanguageFilter",
      "autoFillListings",
      "hideOpenedChats"
    ];

    const keys = [
      ...common,
      ...(DS.isSingleChatPage?.() ? chat : (DS.isChatListPage?.() ? chatList : listing))
    ];
    let count = new Set(keys).size
      ? [...new Set(keys)].filter(key => settings?.[key] === true).length
      : 0;

    if (DS.isSingleChatPage?.()) {
      const metadataEnabled = !!(
        settings?.showGenerationMetadata ||
        settings?.showMessageTimestamps ||
        settings?.showGenerationModel ||
        settings?.showGenerationElapsed ||
        settings?.showGenerationSettings
      );
      const quickActionsEnabled = !!(
        settings?.messageQuickActionCopy ||
        settings?.messageQuickActionEdit ||
        settings?.messageQuickActionRemoveImage ||
        settings?.messageQuickActionResend ||
        settings?.messageQuickActionReport
      );
      if (metadataEnabled) count++;
      if (quickActionsEnabled) count++;
    }

    return count;
  }


  function renderQuickPanelSmartFilterPins(panel, settings, onChatListPage, onSingleChatPage) {
    const row = panel?.querySelector?.("#ds-qol-smart-filter-pins-row");
    const host = panel?.querySelector?.("#ds-qol-smart-filter-pins");
    if (!row || !host) return;

    const show = !!(
      !onSingleChatPage &&
      !onChatListPage &&
      settings.enableSmartFilterPresets &&
      settings.quickPanelShowSmartFilterPins
    );
    const pinned = show ? (DS.getPinnedSmartFilterPresets?.() || []) : [];
    const signature = pinned.map(item => `${item.id}:${item.name}`).join("|");

    if (host.dataset.dsPinsSignature !== signature) {
      host.dataset.dsPinsSignature = signature;
      host.replaceChildren();
      for (const preset of pinned) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = preset.name;
        button.title = `Apply Smart Filter preset: ${preset.name}`;
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const applied = await DS.applySmartFilterPresetById?.(preset.id);
            if (applied) DS.setQuickStatus?.(`Applied filter preset: ${preset.name}.`);
          } finally {
            button.disabled = false;
          }
        });
        host.appendChild(button);
      }
    }

    setShown(row, show && pinned.length > 0, "block");
  }

  DS.updateQuickPanel = function updateQuickPanel({ forceLayout = false, bypassThrottle = false } = {}) {
    const panel = getSingleQuickPanel();
    if (!panel) return;
    if (panelInteractionActive(panel)) return;

    // Busy chat pages can ask the panel to refresh several times during one React
    // burst. Keep forced layout work immediate, but fold ordinary refreshes into a
    // short trailing update instead of rebuilding the same controls repeatedly.
    if (!forceLayout && !bypassThrottle) {
      const now = performance.now();
      const last = Number(DS.state.quickPanelLastUpdateAt || 0);
      const minGap = 90;
      const elapsed = now - last;
      if (last && elapsed < minGap) {
        const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
        counters.quickPanelUpdateCoalesced = Number(counters.quickPanelUpdateCoalesced || 0) + 1;
        if (!DS.state.quickPanelTrailingUpdateTimer) {
          DS.state.quickPanelTrailingUpdateTimer = setTimeout(() => {
            DS.state.quickPanelTrailingUpdateTimer = 0;
            DS.updateQuickPanel?.({ bypassThrottle: true });
          }, Math.max(16, minGap - elapsed));
        }
        return;
      }
      DS.state.quickPanelLastUpdateAt = now;
    } else {
      DS.state.quickPanelLastUpdateAt = performance.now();
    }

    applyDefaultPanelStateForRoute(panel);
    panel.querySelector(".ds-qol-head")?.removeAttribute("title");

    const {
      settings,
      openedChats,
      blockedBots,
      savedPersonas,
      manualImportRunning
    } = DS.state;

    const page = DS.getPageState?.() || {};
    const onChatListPage = !!page.isChatListPage;
    const onSingleChatPage = !!page.isSingleChatPage;
    const stateSignature = quickPanelStateSignature(panel, settings, onChatListPage, onSingleChatPage);
    if (!forceLayout && panel.dataset.dsStateSignature === stateSignature) {
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.quickPanelStateSkips = Number(counters.quickPanelStateSkips || 0) + 1;
      return;
    }
    panel.dataset.dsStateSignature = stateSignature;

    if (onSingleChatPage) {
      DS.ensureOocPanel?.();
      DS.ensurePersonaQuickSwitchPanel?.();
    }

    orderQuickPanelSections(panel, onChatListPage, onSingleChatPage);
    renderQuickPanelSmartFilterPins(panel, settings, onChatListPage, onSingleChatPage);

    const status = document.getElementById("ds-qol-status");
    setShown(status, settings.quickPanelShowStatus !== false || !!settings.quickPanelShowFeatureSummary);

    const optionsButton = document.getElementById("ds-qol-options");
    const fillButton = document.getElementById("ds-qol-fill-listing");
    const showOptions = settings.quickPanelShowOptions !== false;
    const showFill = !!(
      settings.quickPanelShowFillNow !== false &&
      !onSingleChatPage &&
      !onChatListPage
    );

    setShown(optionsButton, showOptions);
    setShown(fillButton, showFill);
    if (fillButton) {
      const refill = DS.getListingAutoFillStatus?.() || {};
      if (refill.running) {
        setText(fillButton, refill.stopping ? "Stopping..." : "Stop refill");
        fillButton.title = "Finish the current helper page, then stop listing refill";
      } else {
        setText(fillButton, "Fill now");
        fillButton.title = `Fill this listing toward ${Number(refill.target || settings.autoFillTargetCards || 50)} visible cards`;
      }
    }
    setShown(document.getElementById("ds-qol-normal-row"), showOptions || showFill, "flex");

    const showChatTools = !!(onChatListPage && settings.showChatListTools);
    const showSearch = showChatTools && settings.quickPanelShowChatSearch !== false;
    const showSort = showChatTools && settings.quickPanelShowChatSort !== false;
    const showScan = showChatTools && settings.quickPanelShowScanVisible !== false;
    const showLoadAll = showChatTools && settings.quickPanelShowLoadAll !== false;

    setShown(document.getElementById("ds-qol-chat-search-wrap"), showSearch);
    setShown(document.getElementById("ds-qol-chat-sort-wrap"), showSort);
    setShown(document.getElementById("ds-qol-scan-visible"), showScan);
    setShown(document.getElementById("ds-qol-load-all-chats"), showLoadAll);
    setShown(document.getElementById("ds-qol-chat-list-buttons"), showScan || showLoadAll, "flex");
    setShown(
      document.getElementById("ds-qol-chat-list-tools"),
      showChatTools && (showSearch || showSort || showScan || showLoadAll),
      "block"
    );

    const showCurrentChatSearch = !!(
      onSingleChatPage &&
      settings.showChatSearch &&
      settings.chatSearchShowPanel !== false
    );
    setShown(
      document.getElementById("ds-qol-current-chat-search-tools"),
      showCurrentChatSearch,
      "block"
    );
    if (showCurrentChatSearch) {
      DS.bindChatSearchQuickPanel?.();
    }

    const showFocusMode = !!(onSingleChatPage && settings.enableFocusMode);
    setShown(document.getElementById("ds-qol-focus-row"), showFocusMode, "flex");
    const focusButton = document.getElementById("ds-qol-focus-mode");
    if (focusButton) {
      setText(focusButton, DS.isFocusModeActive?.() ? "Exit focus" : "Focus mode");
    }

    const showCharacterProfile = !!(onSingleChatPage && settings.enableCharacterQolProfiles);
    const characterProfileButton = document.getElementById("ds-qol-character-profile");
    if (characterProfileButton) {
      const custom = !!DS.hasCurrentCharacterQolProfile?.();
      setText(characterProfileButton, custom ? "Character profile: Custom" : "Character profile: Global");
      characterProfileButton.title = custom
        ? "Edit this character's QoL overrides"
        : "Create QoL overrides for this character";
    }
    setShown(characterProfileButton, showCharacterProfile);
    setShown(document.getElementById("ds-qol-character-profile-row"), showCharacterProfile, "flex");

    const showSavedSnippets = !!(onSingleChatPage && settings.enableSavedTextSnippets);
    setShown(document.getElementById("ds-qol-saved-snippets-row"), showSavedSnippets, "flex");

    const showContextKeeper = !!(onSingleChatPage && settings.enableContextKeeper);
    setShown(document.getElementById("ds-qol-context-keeper-row"), showContextKeeper, "flex");

    const showStoryDay = !!(onSingleChatPage && settings.enableStoryDayTracker && settings.storyDayTrackerShowQuickPanel !== false);
    const storyDayButton = document.getElementById("ds-qol-story-day");
    if (storyDayButton) {
      const snap = DS.getStoryDaySnapshot?.();
      setText(storyDayButton, snap ? `Storydate ${snap.code}` : "Storydate");
      storyDayButton.title = snap ? `Day ${snap.day}${snap.phase && snap.phase !== "unknown" ? ` · ${snap.phase}` : ""}${snap.pending ? ` · ${snap.pending} suggestion${snap.pending === 1 ? "" : "s"}` : ""}` : "Open Internal Day Tracker";
    }
    setShown(document.getElementById("ds-qol-story-day-row"), showStoryDay, "flex");

    const showRpState = !!(onSingleChatPage && settings.enableRpStateTracker && settings.rpStateShowQuickPanel !== false);
    const rpStateButton = document.getElementById("ds-qol-rp-state");
    if (rpStateButton) {
      const snap = DS.getRpStateSnapshot?.();
      const count = Number(snap?.count || 0);
      const pending = Number(snap?.pending || 0);
      setText(rpStateButton, count ? `RP State · ${count}` : "RP State");
      rpStateButton.title = pending
        ? `${count} current state item${count === 1 ? "" : "s"} · ${pending} suggestion${pending === 1 ? "" : "s"}`
        : `${count} current state item${count === 1 ? "" : "s"}`;
    }
    setShown(document.getElementById("ds-qol-rp-state-row"), showRpState, "flex");

    const autoVoiceEnabled = !!DS.isAutoVoiceEnabled?.();
    const nativeVoiceAvailable = !!DS.isNativeVoiceAvailable?.();
    const showAutoVoice = !!(
      onSingleChatPage &&
      settings.quickPanelShowAutoVoice !== false &&
      (nativeVoiceAvailable || autoVoiceEnabled)
    );
    const autoVoiceButton = document.getElementById("ds-qol-auto-voice");
    if (autoVoiceButton) {
      setText(autoVoiceButton, autoVoiceEnabled
        ? (nativeVoiceAvailable ? "Auto voice: On" : "Auto voice: On (waiting)")
        : "Auto voice: Off");
      setAttr(autoVoiceButton, "aria-pressed", autoVoiceEnabled ? "true" : "false");
      autoVoiceButton.title = nativeVoiceAvailable
        ? "Automatically use SpicyChat's Listen button for each new AI reply"
        : "Waiting for SpicyChat's Listen button to become available";
    }
    setShown(autoVoiceButton, showAutoVoice);
    setShown(document.getElementById("ds-qol-auto-voice-row"), showAutoVoice, "flex");

    const autoAsteriskEnabled = !!settings.autoPairAsterisks;
    const showAutoAsterisk = !!(
      onSingleChatPage &&
      settings.quickPanelShowAutoAsterisk !== false
    );
    const autoAsteriskButton = document.getElementById("ds-qol-auto-asterisk");
    if (autoAsteriskButton) {
      setText(autoAsteriskButton, autoAsteriskEnabled ? "Auto *: On" : "Auto *: Off");
      setAttr(autoAsteriskButton, "aria-pressed", autoAsteriskEnabled ? "true" : "false");
      autoAsteriskButton.title = "Automatically insert the matching closing asterisk while typing";
    }
    setShown(autoAsteriskButton, showAutoAsterisk);
    setShown(document.getElementById("ds-qol-auto-asterisk-row"), showAutoAsterisk, "flex");

    const showTranslation = !!(
      onSingleChatPage &&
      settings.enableTranslation &&
      settings.quickPanelShowTranslation
    );
    const autoTranslateButton = document.getElementById("ds-qol-auto-translate");
    if (autoTranslateButton) {
      setText(autoTranslateButton, settings.translationAutoAi ? "Auto translate: On" : "Auto translate: Off");
      setAttr(autoTranslateButton, "aria-pressed", settings.translationAutoAi ? "true" : "false");
      autoTranslateButton.title = "Automatically translate AI replies that do not look like a language you already understand";
    }
    setShown(autoTranslateButton, showTranslation);
    setShown(document.getElementById("ds-qol-translate-visible"), showTranslation);
    setShown(document.getElementById("ds-qol-translation-row"), showTranslation, "flex");

    const soundscapeState = DS.getSoundscapePanelState?.() || { scenes: [], playing: false, activeId: "", allowedHere: false };
    const showSoundscapes = !!(
      settings.enableSoundscapes &&
      settings.quickPanelShowSoundscapes &&
      soundscapeState.allowedHere &&
      soundscapeState.scenes?.length
    );
    const soundscapeSelect = document.getElementById("ds-qol-soundscape-select");
    const soundscapeSignature = (soundscapeState.scenes || []).map(scene => `${scene.id}:${scene.name}`).join("|");
    if (soundscapeSelect && soundscapeSelect.dataset.dsSoundscapeSignature !== soundscapeSignature) {
      soundscapeSelect.dataset.dsSoundscapeSignature = soundscapeSignature;
      soundscapeSelect.replaceChildren();
      for (const scene of soundscapeState.scenes || []) {
        const option = document.createElement("option");
        option.value = scene.id;
        option.textContent = scene.name;
        soundscapeSelect.appendChild(option);
      }
    }
    if (soundscapeSelect && soundscapeState.activeId && soundscapeSelect.value !== soundscapeState.activeId) soundscapeSelect.value = soundscapeState.activeId;
    const soundscapeToggle = document.getElementById("ds-qol-soundscape-toggle");
    if (soundscapeToggle) {
      setText(soundscapeToggle, soundscapeState.playing ? "Pause" : "Play");
      setAttr(soundscapeToggle, "aria-pressed", soundscapeState.playing ? "true" : "false");
    }
    setShown(document.getElementById("ds-qol-soundscape-row"), showSoundscapes, "flex");

    const showExport = !!(
      onSingleChatPage &&
      settings.showChatExportButton &&
      settings.quickPanelShowExport !== false &&
      !DS.shouldDeferToSaiToolkit?.("chat-export")
    );
    setShown(document.getElementById("ds-qol-copy-chat"), showExport);
    setShown(document.getElementById("ds-qol-export-chat"), showExport);
    setShown(document.getElementById("ds-qol-chat-row"), showExport, "flex");

    const sort = document.getElementById("ds-qol-chat-sort");
    const storedSortMode = settings.chatListSortMode || "default";

    if (sort && document.activeElement !== sort && sort.value !== storedSortMode) {
      sort.value = storedSortMode;
    }

    const openedFilter = document.getElementById("ds-qol-chat-opened-filter");
    const storedOpenedFilter = ["all", "opened", "unopened"].includes(settings.chatListOpenedFilter) ? settings.chatListOpenedFilter : "all";
    if (openedFilter && document.activeElement !== openedFilter && openedFilter.value !== storedOpenedFilter) openedFilter.value = storedOpenedFilter;

    const messageFilter = document.getElementById("ds-qol-chat-message-filter");
    const storedMessageFilter = ["all", "0", "1-9", "10-49", "50-99", "100-499", "500+", "unknown"].includes(settings.chatListMessageFilter) ? settings.chatListMessageFilter : "all";
    if (messageFilter && document.activeElement !== messageFilter && messageFilter.value !== storedMessageFilter) messageFilter.value = storedMessageFilter;

    const savedFilter = document.getElementById("ds-qol-chat-saved-filter");
    const storedSavedFilter = ["all", "favorite", "later", "both", "saved", "neither"].includes(settings.chatListSavedFilter) ? settings.chatListSavedFilter : "all";
    if (savedFilter && document.activeElement !== savedFilter && savedFilter.value !== storedSavedFilter) savedFilter.value = storedSavedFilter;

    const blockedFilter = document.getElementById("ds-qol-chat-blocked-filter");
    const storedBlockedFilter = ["all", "blocked", "unblocked"].includes(settings.chatListBlockedFilter) ? settings.chatListBlockedFilter : "all";
    if (blockedFilter && document.activeElement !== blockedFilter && blockedFilter.value !== storedBlockedFilter) blockedFilter.value = storedBlockedFilter;

    if (status && !manualImportRunning) {
      const blockedCount = blockedBots.ids.length + blockedBots.names.length;
      const parts = [];

      if (settings.quickPanelStatusShowOpened !== false) {
        parts.push(`${openedChats.size} opened stored`);
      }

      if (settings.quickPanelStatusShowBlocked !== false) {
        parts.push(`${blockedCount} blocked`);
      }

      if (settings.quickPanelShowFeatureSummary) {
        const featureCount = enabledFeatureCountForCurrentPage(settings);
        parts.push(`${featureCount} QoL feature${featureCount === 1 ? "" : "s"} enabled here`);
        if (DS.detectSaiToolkit?.({ persist: false })) parts.push("S.AI Toolkit detected");
      }

      if (onSingleChatPage) {
        parts.push(`${savedPersonas.length} personas saved`);
        if (settings.chatPerformanceMode) parts.push("Performance mode on");
      } else if (onChatListPage) {
        const visibleChatLinks = DS.qsa("a[href*='/chat/']").length;
        parts.push(`${visibleChatLinks} chats visible`);
      } else {
        const fillStatus = DS.getListingAutoFillStatus?.();
        if (fillStatus) {
          parts.push(`${fillStatus.visible} visible`);
          parts.push(`${fillStatus.hidden} hidden`);
          if (fillStatus.running || fillStatus.paused) {
            parts.push(`${fillStatus.pagesLoaded}/${fillStatus.maxAttempts} refill pages`);
            if (fillStatus.metadataExtracted) parts.push(`${fillStatus.metadataExtracted} card metadata captured`);
            if (fillStatus.tagsRestored) parts.push(`${fillStatus.tagsRestored} tag sets restored`);
            if (fillStatus.duplicates) parts.push(`${fillStatus.duplicates} duplicates skipped`);
            if (fillStatus.lastError) parts.push(`last refill error: ${fillStatus.lastError}`);
          }
        }
      }

      setText(status, parts.length ? `${parts.join(". ")}.` : "");
    }

    if (!panelInteractionActive(panel)) {
      const layoutSignature = quickPanelLayoutSignature(panel, onChatListPage, onSingleChatPage);
      const unchangedLayout = !forceLayout && panel.dataset.dsLayoutSignature === layoutSignature;
      if (unchangedLayout) {
        const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
        counters.quickPanelLayoutSkips = Number(counters.quickPanelLayoutSkips || 0) + 1;
        return;
      }
      panel.dataset.dsLayoutSignature = layoutSignature;

      applyQuickPanelPosition(panel);
      fitPanelToVisibleContent(panel);

      requestAnimationFrame(() => {
        if (applyOverlapAutoCollapse(panel)) {
          panel.dataset.dsLayoutSignature = "";
          applyQuickPanelPosition(panel);
          fitPanelToVisibleContent(panel);
        }
      });
    }
  };

  DS.removeQuickPanelIfDisabled = function removeQuickPanelIfDisabled() {
    if (DS.state.settings.enabled && DS.state.settings.showQuickPanel && DS.isQuickPanelEnabledForTab?.()) {
      getSingleQuickPanel();
      return;
    }

    removeAllQuickPanels();
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "DS_GET_QUICK_PANEL_TAB_STATE") {
      const globallyEnabled = !!DS.state?.settings?.enabled && !!DS.state?.settings?.showQuickPanel;
      const tabEnabled = !!DS.isQuickPanelEnabledForTab?.();

      sendResponse({
        ok: true,
        globallyEnabled,
        tabEnabled,
        enabled: globallyEnabled && tabEnabled,
        defaultEnabled: DS.state?.settings?.quickPanelEnabledByDefaultInTab !== false
      });
      return false;
    }

    if (message?.type === "DS_SET_QUICK_PANEL_TAB_STATE") {
      DS.setQuickPanelEnabledForTab?.(!!message.enabled);
      sendResponse({
        ok: true,
        enabled: !!message.enabled
      });
      return false;
    }

    return false;
  });
})();
