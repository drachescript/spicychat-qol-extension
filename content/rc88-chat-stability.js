(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const SNAPSHOT_KEY = "nativeChatAppearanceLockV1";
  const STYLE_ID = "ds-rc88-chat-stability-style";
  const INLINE_TOOLS_ID = "ds-rc88-composer-inline-tools";
  const USER_BUBBLE_ATTR = "data-ds-native-user-appearance";
  const MAX_SCAN_DELAY = 180;

  const state = {
    snapshot: null,
    snapshotLoaded: false,
    scanTimer: null,
    observer: null,
    storedSettings: null,
    captureBound: new WeakSet(),
    composerPaddingBefore: new WeakMap()
  };

  function settings() {
    return {
      ...(DS.DEFAULT_SETTINGS || {}),
      ...(DS.state?.settings || {}),
      ...(state.storedSettings || {})
    };
  }

  function shortcutToolsWanted(cfg = settings()) {
    return !!(
      cfg.showAsteriskButton ||
      (cfg.showFormattingToolbar && (cfg.formatToolbarAsterisk !== false || cfg.formatToolbarBackticks))
    );
  }

  function observerWanted(cfg = settings()) {
    if (cfg.deepSleepDisabledFeatures === false) return true;
    return !!(cfg.persistSpicyChatUserAppearance || shortcutToolsWanted(cfg));
  }

  function onChatRoute() {
    return /^\/chat\/[^/]+/i.test(location.pathname || "");
  }

  function normalizeHex(value) {
    const raw = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      return `#${raw.slice(1).split("").map(x => x + x).join("")}`.toLowerCase();
    }
    return "";
  }

  function storageGet(keys) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(keys, result => resolve(result || {}));
      } catch {
        resolve({});
      }
    });
  }

  function storageSet(payload) {
    return new Promise(resolve => {
      try { chrome.storage.local.set(payload, () => resolve()); }
      catch { resolve(); }
    });
  }

  async function loadSnapshot() {
    if (state.snapshotLoaded) return state.snapshot;
    state.snapshotLoaded = true;
    const result = await storageGet([SNAPSHOT_KEY]);
    const raw = result?.[SNAPSHOT_KEY];
    if (raw && typeof raw === "object") {
      state.snapshot = {
        userBackground: normalizeHex(raw.userBackground),
        userText: normalizeHex(raw.userText),
        userTextMode: String(raw.userTextMode || "custom"),
        capturedAt: Number(raw.capturedAt || 0),
        source: String(raw.source || "native")
      };
    }
    return state.snapshot;
  }

  function effectiveSnapshot() {
    const snap = state.snapshot || {};
    const userBackground = normalizeHex(snap.userBackground);
    const userText = normalizeHex(snap.userText);
    if (!userBackground && !userText) return null;
    return {
      userBackground,
      userText,
      userTextMode: String(snap.userTextMode || "custom"),
      source: "native-capture"
    };
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }
    const snap = effectiveSnapshot();
    const appearanceRules = snap ? `
      ${snap.userBackground ? `[${USER_BUBBLE_ATTR}="1"]{background-color:${snap.userBackground}!important}` : ""}
      ${snap.userText ? `[${USER_BUBBLE_ATTR}="1"] [data-ds-native-normal-text="1"]{color:${snap.userText}!important}
      [${USER_BUBBLE_ATTR}="1"] [data-ds-native-normal-text="1"] q{color:${snap.userText}!important}` : ""}
    ` : "";
    style.textContent = `
      #${INLINE_TOOLS_ID}{display:flex;align-items:center;gap:2px;flex:0 0 auto;z-index:6;pointer-events:auto}
      #${INLINE_TOOLS_ID}[data-ds-placement="inside-right"]{position:absolute;right:6px;bottom:4px}
      #${INLINE_TOOLS_ID}[data-ds-placement="outside-left"],#${INLINE_TOOLS_ID}[data-ds-placement="outside-right"]{position:static;align-self:flex-end;margin-bottom:2px}
      #${INLINE_TOOLS_ID}>*{margin:0!important;flex:0 0 auto!important}
      #${INLINE_TOOLS_ID} button{width:27px!important;height:27px!important;min-width:27px!important;padding:0!important;border-radius:8px!important}
      ${appearanceRules}
      @media(max-width:700px){#${INLINE_TOOLS_ID}[data-ds-placement="inside-right"]{right:4px}#${INLINE_TOOLS_ID}{gap:1px}#${INLINE_TOOLS_ID} button{width:25px!important;height:25px!important;min-width:25px!important;font-size:12px!important}}
    `;
  }

  function textOwn(node) {
    if (!(node instanceof Element)) return "";
    return String(node.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findAppearancePanel() {
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,div,span,p")]
      .filter(node => textOwn(node) === "my messages");
    for (const heading of headings) {
      let node = heading;
      for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
        const text = textOwn(node);
        const colors = node.querySelectorAll?.('input[type="color"]')?.length || 0;
        const selects = node.querySelectorAll?.("select")?.length || 0;
        if (colors >= 1 && /background color/.test(text) && /normal text/.test(text) && (colors >= 2 || selects >= 1)) return node;
      }
    }
    return null;
  }

  function controlForLabel(panel, wanted, type) {
    if (!(panel instanceof Element)) return null;
    const wantedLower = wanted.toLowerCase();
    for (const label of panel.querySelectorAll("label")) {
      const text = textOwn(label);
      if (!text.includes(wantedLower)) continue;
      const direct = label.querySelector(type);
      if (direct) return direct;
      const forId = label.getAttribute("for");
      if (forId) {
        const escaped = globalThis.CSS?.escape ? CSS.escape(forId) : forId.replace(/[^a-z0-9_-]/gi, "\\$&");
        const byFor = panel.querySelector(`#${escaped}`);
        if (byFor?.matches?.(type)) return byFor;
      }
    }
    // SpicyChat sometimes renders the label text and control in sibling wrappers.
    const labels = [...panel.querySelectorAll("div,span,p")].filter(node => textOwn(node) === wantedLower);
    for (const label of labels) {
      const parent = label.parentElement;
      const nearby = parent?.querySelector?.(type) || parent?.nextElementSibling?.querySelector?.(type);
      if (nearby) return nearby;
    }
    return null;
  }

  async function captureAppearancePanel(panel, source = "native") {
    if (!(panel instanceof Element) || !settings().persistSpicyChatUserAppearance) return;
    const background = controlForLabel(panel, "background color", 'input[type="color"]');
    const normalTextColor = controlForLabel(panel, "normal text color", 'input[type="color"]');
    const normalTextMode = controlForLabel(panel, "normal text", "select");
    const next = {
      userBackground: normalizeHex(background?.value),
      userText: normalizeHex(normalTextColor?.value),
      userTextMode: String(normalTextMode?.value || "custom"),
      capturedAt: Date.now(),
      source
    };
    if (!next.userBackground && !next.userText) return;
    const prev = state.snapshot || {};
    if (next.userBackground === prev.userBackground && next.userText === prev.userText && next.userTextMode === prev.userTextMode) return;
    state.snapshot = next;
    state.snapshotLoaded = true;
    await storageSet({ [SNAPSHOT_KEY]: next });
    ensureStyle();
    applyAppearanceToMessages();
    DS.runtimeLog?.("info", "appearance-lock", "Captured SpicyChat My messages appearance", {
      background: !!next.userBackground,
      text: !!next.userText,
      mode: next.userTextMode
    });
  }

  function bindAppearanceCapture() {
    if (!settings().persistSpicyChatUserAppearance) return;
    const panel = findAppearancePanel();
    if (!panel || state.captureBound.has(panel)) return;
    state.captureBound.add(panel);
    captureAppearancePanel(panel, "native-panel").catch(() => {});
    const handler = () => {
      clearTimeout(panel.__dsAppearanceCaptureTimer);
      panel.__dsAppearanceCaptureTimer = setTimeout(() => captureAppearancePanel(panel, "native-panel-change").catch(() => {}), 80);
    };
    panel.addEventListener("input", handler, true);
    panel.addEventListener("change", handler, true);
  }

  function markUserBubbleFromQuickActions(quickActions) {
    const row = quickActions?.parentElement?.parentElement;
    const bubble = row?.parentElement;
    if (!(bubble instanceof HTMLElement) || !(row instanceof HTMLElement)) return;
    if (!row.classList.contains("flex-row-reverse")) return;
    bubble.setAttribute(USER_BUBBLE_ATTR, "1");
    const messageBody = [...bubble.children].find(child => child instanceof Element && child.querySelector?.("[class*='overflow-wrap']"));
    const root = messageBody?.querySelector?.("[class*='overflow-wrap']") || bubble.querySelector("[class*='overflow-wrap']");
    if (!root) return;
    for (const span of root.querySelectorAll(":scope > span")) {
      if (span.querySelector("em,code,.ds-alternate-dialogue")) {
        span.removeAttribute("data-ds-native-normal-text");
        continue;
      }
      span.setAttribute("data-ds-native-normal-text", "1");
    }
  }

  function applyAppearanceToMessages() {
    if (!settings().persistSpicyChatUserAppearance || !onChatRoute()) {
      document.querySelectorAll(`[${USER_BUBBLE_ATTR}]`).forEach(node => {
        node.removeAttribute(USER_BUBBLE_ATTR);
        node.querySelectorAll("[data-ds-native-normal-text]").forEach(child => child.removeAttribute("data-ds-native-normal-text"));
      });
      return;
    }
    ensureStyle();
    if (!effectiveSnapshot()) return;
    document.querySelectorAll(".ds-message-quick-actions").forEach(markUserBubbleFromQuickActions);
    // Fallback for chats where message quick actions are disabled: current
    // SpicyChat user bubbles use the mirrored header row.
    document.querySelectorAll("div.flex.justify-between.items-center.gap-md.flex-row-reverse").forEach(row => {
      const bubble = row.parentElement;
      if (!(bubble instanceof HTMLElement) || !bubble.querySelector("[class*='overflow-wrap']")) return;
      bubble.setAttribute(USER_BUBBLE_ATTR, "1");
      const root = bubble.querySelector("[class*='overflow-wrap']");
      root?.querySelectorAll(":scope > span").forEach(span => {
        if (!span.querySelector("em,code,.ds-alternate-dialogue")) span.setAttribute("data-ds-native-normal-text", "1");
      });
    });
  }

  function findComposer() {
    const textarea = document.querySelector('textarea[placeholder="Message..."],textarea[placeholder*="Message"]');
    if (!(textarea instanceof HTMLTextAreaElement)) return null;
    const bubble = textarea.closest("div.grow.border-1") || textarea.parentElement?.parentElement;
    const row = bubble?.closest("div.flex.items-end.gap-sm.w-full") || bubble?.parentElement?.parentElement;
    return bubble instanceof HTMLElement && row instanceof HTMLElement ? { textarea, bubble, row } : null;
  }

  function composerShortcutCandidates(row) {
    if (!(row instanceof Element)) return [];
    const selectors = [
      ".ds-chat-asterisk-shortcut-wrapper",
      ".ds-chat-backtick-shortcut-wrapper",
      "[data-ds-composer-shortcut='asterisk']",
      "[data-ds-composer-shortcut='backtick']"
    ];
    const found = new Set();
    for (const selector of selectors) row.querySelectorAll(selector).forEach(node => found.add(node));
    for (const button of row.querySelectorAll("button")) {
      const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`.toLowerCase();
      if (!/(asterisk|backtick)/.test(label)) continue;
      const wrapper = button.closest(".inline-flex") || button;
      if (wrapper.id === INLINE_TOOLS_ID || wrapper.closest?.(`#${INLINE_TOOLS_ID}`)) continue;
      found.add(wrapper);
    }
    return [...found].filter(node => node instanceof HTMLElement);
  }

  function stabilizeComposerTools() {
    if (!onChatRoute()) return;
    const composer = findComposer();
    if (!composer) return;
    const tools = composerShortcutCandidates(composer.row);
    let holder = document.getElementById(INLINE_TOOLS_ID);
    if (!tools.length && !holder) return;
    if (!holder) {
      holder = document.createElement("div");
      holder.id = INLINE_TOOLS_ID;
      holder.setAttribute("data-ds-owned", "1");
    }
    for (const tool of tools) {
      if (tool === holder || holder.contains(tool)) continue;
      holder.appendChild(tool);
    }
    const count = holder.children.length;
    if (!count) {
      holder.remove();
      const before = state.composerPaddingBefore.get(composer.textarea);
      if (before != null) composer.textarea.style.paddingRight = before;
      return;
    }

    const cfg = settings();
    const placement = ["inside-right", "outside-left", "outside-right"].includes(cfg.composerShortcutPlacement)
      ? cfg.composerShortcutPlacement
      : "inside-right";
    holder.setAttribute("data-ds-placement", placement);

    if (placement === "inside-right") {
      composer.bubble.style.position = composer.bubble.style.position || "relative";
      if (holder.parentElement !== composer.bubble) composer.bubble.appendChild(holder);
      if (!state.composerPaddingBefore.has(composer.textarea)) state.composerPaddingBefore.set(composer.textarea, composer.textarea.style.paddingRight || "");
      composer.textarea.style.paddingRight = `${Math.max(42, 10 + count * 29)}px`;
    } else {
      const before = state.composerPaddingBefore.get(composer.textarea);
      if (before != null) composer.textarea.style.paddingRight = before;
      if (placement === "outside-left") {
        if (holder.parentElement !== composer.row || holder.nextElementSibling !== composer.bubble) composer.row.insertBefore(holder, composer.bubble);
      } else {
        const afterBubble = composer.bubble.nextSibling;
        if (holder.parentElement !== composer.row || holder.previousElementSibling !== composer.bubble) composer.row.insertBefore(holder, afterBubble);
      }
    }
    ensureStyle();
  }

  function syncObserver() {
    const wanted = observerWanted();
    if (!wanted || !document.body) {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
        const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
        counters.disabledFeatureObserverSleeps = Number(counters.disabledFeatureObserverSleeps || 0) + 1;
      }
      return;
    }
    if (state.observer) return;
    state.observer = new MutationObserver(mutations => {
      if (!mutations.some(m => m.addedNodes?.length || m.removedNodes?.length)) return;
      if (!DS.mutationsHaveNativeChanges?.(mutations)) return;
      schedule();
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  function run() {
    state.scanTimer = null;
    const cfg = settings();
    if (cfg.persistSpicyChatUserAppearance) {
      bindAppearanceCapture();
      applyAppearanceToMessages();
    } else if (document.querySelector(`[${USER_BUBBLE_ATTR}]`)) {
      applyAppearanceToMessages();
    }
    if (shortcutToolsWanted(cfg) || document.getElementById(INLINE_TOOLS_ID)) stabilizeComposerTools();
    syncObserver();
  }

  function schedule() {
    if (state.scanTimer) return;
    state.scanTimer = setTimeout(run, MAX_SCAN_DELAY);
  }

  async function init() {
    const initial = await storageGet([SNAPSHOT_KEY, "settings"]);
    state.storedSettings = initial?.settings && typeof initial.settings === "object" ? initial.settings : null;
    const raw = initial?.[SNAPSHOT_KEY];
    state.snapshotLoaded = true;
    if (raw && typeof raw === "object") {
      state.snapshot = {
        userBackground: normalizeHex(raw.userBackground),
        userText: normalizeHex(raw.userText),
        userTextMode: String(raw.userTextMode || "custom"),
        capturedAt: Number(raw.capturedAt || 0),
        source: String(raw.source || "native")
      };
    }
    run();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.settings) {
        state.storedSettings = changes.settings.newValue && typeof changes.settings.newValue === "object" ? changes.settings.newValue : null;
        schedule();
      }
      if (changes[SNAPSHOT_KEY]) {
        const nextRaw = changes[SNAPSHOT_KEY].newValue;
        state.snapshot = nextRaw && typeof nextRaw === "object" ? nextRaw : null;
        state.snapshotLoaded = true;
        schedule();
      }
    });
    window.addEventListener("popstate", schedule, true);
    window.addEventListener("hashchange", schedule, true);
  }

  init().catch(() => {});
})();
