(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  const state = {
    composerObserver: null,
    observedTextareas: new WeakSet(),
    listenersInstalled: false,
    guardUntil: 0,
    guardTop: 0,
    guardContainer: null,
    guardRaf: 0,
    guardTimer: 0,
    mobileObserver: null,
    mobileListenersInstalled: false,
    mobileNormalizeRaf: 0,
    editResizeRaf: 0,
    editResizeTimer: 0,
    editLayoutOriginalStyles: new WeakMap(),
    editLayoutTouchedNodes: new Set(),
    editLayoutDiagRoots: new WeakSet(),
    pendingComposerHeightRepairs: new WeakSet()
  };

  function settings() {
    return DS.state?.settings || {};
  }

  function enabled() {
    return !!settings().enabled && DS.isSingleChatPage?.();
  }

  function shouldKeepComposerEnabled() {
    return enabled() && settings().allowTypingWhileAiResponding !== false;
  }

  function isMessageTextarea(el) {
    if (!el || el.tagName !== "TEXTAREA") return false;

    const placeholder = String(el.getAttribute("placeholder") || "").toLowerCase();
    const maxLength = String(el.getAttribute("maxlength") || "");

    return (
      placeholder.includes("message") ||
      maxLength === "10000" ||
      !!el.closest("form, [role='main'], #root")
    );
  }

  function getMessageTextareas() {
    return DS.qsa("textarea")
      .filter(isMessageTextarea)
      .filter(textarea => !textarea.closest("#ds-qol-panel, #ds-chat-export-modal"));
  }

  function isPrimaryComposerTextarea(textarea) {
    return !!(
      textarea &&
      textarea.isConnected &&
      isMessageTextarea(textarea) &&
      !textarea.closest("div[id^='message-']")
    );
  }

  function composerHeightLooksCollapsed(textarea) {
    if (!isPrimaryComposerTextarea(textarea)) return false;

    const rect = textarea.getBoundingClientRect?.();
    if (!rect || rect.width < 120) return false;

    let computed = null;
    try { computed = getComputedStyle(textarea); } catch {}
    if (computed && (computed.display === "none" || computed.visibility === "hidden")) return false;

    const inlineHeight = Number.parseFloat(String(textarea.style.height || ""));
    const rectCollapsed = rect.height > 0 && rect.height < 18;
    const inlineCollapsed = Number.isFinite(inlineHeight) && inlineHeight <= 4;
    return inlineCollapsed || rectCollapsed;
  }

  function repairCollapsedComposerHeight(textarea) {
    if (!composerHeightLooksCollapsed(textarea)) return false;

    const previousInlineHeight = Number.parseFloat(String(textarea.style.height || ""));
    const previousRectHeight = Number(textarea.getBoundingClientRect?.().height || 0);
    const scrollHeight = Math.ceil(Number(textarea.scrollHeight || 0));
    const wantedHeight = Math.max(28, Math.min(188, scrollHeight || 28));

    // SpicyChat's normal empty composer is 28px tall. A rare autosize race can
    // leave the textarea at 0px while the surrounding composer remains mounted,
    // making the whole input bar look like a thin line. Only repair clearly
    // collapsed, visible main composers; normal autosizing remains native.
    textarea.style.height = `${wantedHeight}px`;

    DS.diagEvent?.("composer-control", "collapsed-height-repaired", {
      previousInlineHeight: Number.isFinite(previousInlineHeight) ? previousInlineHeight : null,
      previousRectHeight: Math.round(previousRectHeight * 10) / 10,
      wantedHeight
    });

    return true;
  }

  function scheduleComposerHeightRepair(textarea) {
    if (!composerHeightLooksCollapsed(textarea)) return;
    if (state.pendingComposerHeightRepairs.has(textarea)) return;
    state.pendingComposerHeightRepairs.add(textarea);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        state.pendingComposerHeightRepairs.delete(textarea);
        if (!shouldKeepComposerEnabled()) return;
        repairCollapsedComposerHeight(textarea);
      });
    });
  }

  function forceEnableTextarea(textarea) {
    if (!shouldKeepComposerEnabled() || !textarea) return;

    if (textarea.disabled) textarea.disabled = false;
    if (textarea.hasAttribute("disabled")) textarea.removeAttribute("disabled");
    if (textarea.readOnly) textarea.readOnly = false;
    if (textarea.hasAttribute("readonly")) textarea.removeAttribute("readonly");
    if (textarea.getAttribute("aria-disabled") === "true") textarea.setAttribute("aria-disabled", "false");
    if (textarea.getAttribute("aria-readonly") === "true") textarea.setAttribute("aria-readonly", "false");

    DS.setClassState?.(textarea, "ds-composer-forced-enabled", true);
    scheduleComposerHeightRepair(textarea);
  }

  function shouldKeepChatPositionWhileTyping() {
    return enabled() && settings().keepChatPositionWhileTyping === true;
  }

  function getChatScrollContainer(textarea = null) {
    const message = DS.qs?.("[id^='message-']");
    const candidates = [
      textarea?.closest?.(".overflow-auto, .custom-scroll"),
      message?.closest?.(".overflow-auto, .custom-scroll"),
      DS.qs?.(".custom-scroll.overflow-auto"),
      DS.qs?.("div.absolute.h-full.overflow-auto")
    ].filter(Boolean);

    return candidates.find(el => el.scrollHeight > el.clientHeight + 20) || null;
  }

  function distanceFromBottom(container) {
    return Math.max(0, container.scrollHeight - container.clientHeight - container.scrollTop);
  }

  function stopTypingScrollGuard() {
    state.guardUntil = 0;
    state.guardContainer = null;
    cancelAnimationFrame(state.guardRaf);
    clearTimeout(state.guardTimer);
  }

  function runTypingScrollGuard() {
    cancelAnimationFrame(state.guardRaf);

    const tick = () => {
      const container = state.guardContainer;
      if (!container || performance.now() >= state.guardUntil) {
        stopTypingScrollGuard();
        return;
      }

      if (Math.abs(container.scrollTop - state.guardTop) > 1) {
        container.scrollTop = state.guardTop;
      }

      state.guardRaf = requestAnimationFrame(tick);
    };

    state.guardRaf = requestAnimationFrame(tick);
    clearTimeout(state.guardTimer);
    state.guardTimer = setTimeout(stopTypingScrollGuard, 320);
  }

  function armTypingScrollGuard(textarea) {
    if (!shouldKeepChatPositionWhileTyping()) return;

    const container = getChatScrollContainer(textarea);
    if (!container || distanceFromBottom(container) <= 120) return;

    state.guardContainer = container;
    state.guardTop = container.scrollTop;
    state.guardUntil = performance.now() + 260;
    runTypingScrollGuard();
  }

  function installTypingScrollGuard() {
    if (state.listenersInstalled) return;
    state.listenersInstalled = true;

    document.addEventListener("beforeinput", event => {
      const textarea = event.target;
      if (!isMessageTextarea(textarea)) return;
      armTypingScrollGuard(textarea);
    }, true);

    document.addEventListener("input", event => {
      const textarea = event.target;
      if (!isMessageTextarea(textarea)) return;
      if (state.guardContainer) runTypingScrollGuard();
    }, true);

    document.addEventListener("keydown", event => {
      const textarea = event.target;
      if (!isMessageTextarea(textarea)) return;

      if (event.key === "Enter" && !event.shiftKey) {
        stopTypingScrollGuard();
      } else {
        armTypingScrollGuard(textarea);
      }
    }, true);

    document.addEventListener("pointerdown", event => {
      if (event.target?.closest?.("button[type='submit'], button[aria-label*='send' i]")) {
        stopTypingScrollGuard();
      }
    }, true);

    document.addEventListener("wheel", stopTypingScrollGuard, { capture: true, passive: true });
    document.addEventListener("touchstart", stopTypingScrollGuard, { capture: true, passive: true });
  }

  function ensureComposerObserver() {
    if (!state.composerObserver) {
      state.composerObserver = new MutationObserver(mutations => {
        if (!shouldKeepComposerEnabled()) return;

        for (const mutation of mutations) {
          const textarea = mutation.target;
          if (!isMessageTextarea(textarea)) continue;
          forceEnableTextarea(textarea);
          if (mutation.attributeName === "style") scheduleComposerHeightRepair(textarea);
        }
      });
    }

    for (const textarea of getMessageTextareas()) {
      if (state.observedTextareas.has(textarea)) continue;
      state.observedTextareas.add(textarea);
      state.composerObserver.observe(textarea, {
        attributes: true,
        attributeFilter: ["disabled", "readonly", "aria-disabled", "aria-readonly", "style"]
      });
    }
  }

  function disconnectComposerObserver() {
    state.composerObserver?.disconnect();
    state.observedTextareas = new WeakSet();
  }

  function mobileLayoutActive() {
    try {
      return window.matchMedia?.("(max-width: 760px), (pointer: coarse)")?.matches ?? window.innerWidth <= 760;
    } catch {
      return window.innerWidth <= 760;
    }
  }

  function androidAppRuntime() {
    const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
    return !!(
      env.android ||
      window.__spicyChatQolAndroidWebView ||
      window.__spicyChatQolAndroidApp ||
      window.AndroidBridge ||
      window.SpicyChatQoLAndroidBridge
    );
  }

  function composerTextarea() {
    return getMessageTextareas().find(textarea => !textarea.closest("div[id^='message-']")) || null;
  }

  function normalizeMobileSendWrapper() {
    if (!mobileLayoutActive()) return;
    const textarea = composerTextarea();
    if (!textarea) return;

    const scope = textarea.closest("form") || textarea.parentElement?.parentElement?.parentElement || textarea.parentElement;
    const buttons = [...(scope?.querySelectorAll?.("button") || [])];
    const send = buttons.find(button => {
      const label = String(button.getAttribute("aria-label") || button.title || "").toLowerCase();
      return button.type === "submit" || label.includes("send");
    });
    if (!send) return;

    DS.setClassState?.(send, "ds-mobile-chat-send-button", true);
    const wrapper = send.parentElement;
    if (wrapper && wrapper !== scope) DS.setClassState?.(wrapper, "ds-mobile-chat-send-wrapper", true);
  }

  function buttonLabels(node) {
    return Array.from(node?.querySelectorAll?.("button") || [])
      .map(button => [
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.getAttribute("data-translate-key"),
        button.textContent
      ]
        .filter(Boolean)
        .join(" ")
        .trim()
        .toLowerCase())
      .filter(Boolean);
  }

  function isMessageEditTextarea(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return false;

    const messageRoot = textarea.closest("div[id^='message-']");
    if (!messageRoot) return false;

    let node = textarea.parentElement;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      const labels = buttonLabels(node);
      const hasSave = labels.some(label => label === "save" || label.includes("save"));
      const hasCancel = labels.some(label => label === "cancel" || label.includes("cancel"));

      if (hasSave && hasCancel) return true;
      if (node === messageRoot) break;
    }

    // SpicyChat sometimes mounts the textarea one render before Save/Cancel.
    // A textarea inside a message card is not the normal composer, so treat it
    // as an editor during that short mount window.
    return true;
  }

  function messageEditShell(textarea) {
    const messageRoot = textarea.closest("div[id^='message-']");
    let node = textarea.parentElement;

    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;

      const labels = buttonLabels(node);
      const hasSave = labels.some(label => label === "save" || label.includes("save"));
      const hasCancel = labels.some(label => label === "cancel" || label.includes("cancel"));

      if (hasSave && hasCancel) return node;
      if (messageRoot && node === messageRoot) break;
    }

    return textarea.parentElement;
  }

  function buttonDescriptor(button) {
    return [
      button?.getAttribute?.("aria-label"),
      button?.getAttribute?.("title"),
      button?.getAttribute?.("data-translate-key"),
      button?.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function findMessageEditControls(textarea) {
    const messageRoot = textarea.closest("div[id^='message-']");
    if (!messageRoot) {
      return { messageRoot: null, save: null, cancel: null, group: null };
    }

    const buttons = Array.from(messageRoot.querySelectorAll("button"));
    const save = buttons.find(button => buttonDescriptor(button).includes("save")) || null;
    const cancel = buttons.find(button => buttonDescriptor(button).includes("cancel")) || null;

    if (!save || !cancel) {
      return { messageRoot, save, cancel, group: null };
    }

    let group = save;
    while (group && group !== messageRoot && !group.contains(cancel)) {
      group = group.parentElement;
    }

    if (!(group instanceof HTMLElement)) group = null;

    // Include the character counter when it lives in the same compact controls
    // footer. This is the block that SpicyChat currently pushes to the bottom
    // of a very tall edit card on Android.
    const counter = Array.from(
      messageRoot.querySelectorAll("span, p, div")
    ).find(element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.contains(textarea)) return false;
      const value = String(element.textContent || "").trim();
      return /^\d+\s*\/\s*10000$/.test(value);
    }) || null;

    if (group && counter) {
      let candidate = group;
      while (
        candidate &&
        candidate !== messageRoot &&
        !candidate.contains(counter)
      ) {
        candidate = candidate.parentElement;
      }

      if (
        candidate instanceof HTMLElement &&
        candidate !== messageRoot &&
        !candidate.contains(textarea)
      ) {
        group = candidate;
      }
    }

    return { messageRoot, save, cancel, group };
  }

  function rememberEditLayoutStyle(node, property) {
    if (!(node instanceof HTMLElement)) return;

    let saved = state.editLayoutOriginalStyles.get(node);
    if (!saved) {
      saved = new Map();
      state.editLayoutOriginalStyles.set(node, saved);
      state.editLayoutTouchedNodes.add(node);
    }

    if (!saved.has(property)) {
      saved.set(property, {
        value: node.style.getPropertyValue(property),
        priority: node.style.getPropertyPriority(property)
      });
    }
  }

  function setEditLayoutStyle(node, property, value) {
    if (!(node instanceof HTMLElement)) return;
    rememberEditLayoutStyle(node, property);
    node.style.setProperty(property, value, "important");
  }

  function restoreEditLayoutNode(node) {
    const saved = state.editLayoutOriginalStyles.get(node);
    if (saved) {
      for (const [property, original] of saved.entries()) {
        if (original.value) {
          node.style.setProperty(
            property,
            original.value,
            original.priority || ""
          );
        } else {
          node.style.removeProperty(property);
        }
      }
    }

    node.removeAttribute?.("data-ds-mobile-message-edit-shell");
    node.removeAttribute?.("data-ds-mobile-message-edit-gap");
    state.editLayoutOriginalStyles.delete(node);
    state.editLayoutTouchedNodes.delete(node);
  }

  function cleanupStaleMessageEditLayoutFixes() {
    for (const node of [...state.editLayoutTouchedNodes]) {
      const messageRoot = node.matches?.("div[id^='message-']")
        ? node
        : node.closest?.("div[id^='message-']");

      const stillEditing = !!messageRoot && Array.from(
        messageRoot.querySelectorAll("textarea")
      ).some(isMessageEditTextarea);

      if (!node.isConnected || !stillEditing) {
        restoreEditLayoutNode(node);
      }
    }
  }

  function compactMessageEditNode(node, { allowOverflow = false } = {}) {
    if (!(node instanceof HTMLElement)) return;

    const style = getComputedStyle(node);

    setEditLayoutStyle(node, "min-height", "0px");
    setEditLayoutStyle(node, "height", "auto");
    setEditLayoutStyle(node, "max-height", "none");

    if (allowOverflow) {
      setEditLayoutStyle(node, "overflow", "visible");
      setEditLayoutStyle(node, "overflow-y", "visible");
    }

    const flexGrow = Number.parseFloat(style.flexGrow || "0");
    if (Number.isFinite(flexGrow) && flexGrow > 0) {
      setEditLayoutStyle(node, "flex-grow", "0");
      setEditLayoutStyle(node, "flex-basis", "auto");
    }

    if (style.marginTop === "auto") {
      setEditLayoutStyle(node, "margin-top", "0px");
    }

    if (
      (style.display.includes("flex") || style.display.includes("grid")) &&
      /space-between|space-around|space-evenly/.test(style.justifyContent)
    ) {
      setEditLayoutStyle(node, "justify-content", "flex-start");
    }

    if (
      (style.display.includes("flex") || style.display.includes("grid")) &&
      /space-between|space-around|space-evenly/.test(style.alignContent)
    ) {
      setEditLayoutStyle(node, "align-content", "flex-start");
    }
  }

  function repairMessageEditAncestors(textarea, wantedHeight) {
    const shell = messageEditShell(textarea);
    const {
      messageRoot,
      group: controlsGroup
    } = findMessageEditControls(textarea);

    if (!messageRoot) return;

    const textareaRect = textarea.getBoundingClientRect();
    const controlsRect = controlsGroup?.getBoundingClientRect?.() || null;
    const measuredGap = controlsRect
      ? Math.max(0, controlsRect.top - textareaRect.bottom)
      : 0;

    // SpicyChat's mobile edit card can retain a full-height/flex spacer after
    // the textarea itself has already been resized. That leaves Save/Cancel
    // several screens below the actual field. Only switch to the aggressive
    // compact path when the real measured gap is clearly abnormal.
    const gapIsHuge = measuredGap > 56;

    let node = textarea.parentElement;
    for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;

      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const clips =
        style.overflow === "hidden" ||
        style.overflow === "clip" ||
        style.overflowY === "hidden" ||
        style.overflowY === "clip";
      const tooShort = rect.height > 0 && rect.height + 4 < wantedHeight;

      if (clips || tooShort || node === shell || gapIsHuge) {
        node.dataset.dsMobileMessageEditShell = "1";
        compactMessageEditNode(node, {
          allowOverflow: node !== messageRoot
        });
      }

      if (node === messageRoot) break;
    }

    if (gapIsHuge && controlsGroup) {
      // Collapse the controls side of the flex tree as well. In the current
      // SpicyChat mobile DOM, an mt-auto/flex-grow ancestor is what creates the
      // giant blank area seen between the editor and character count/buttons.
      let controlNode = controlsGroup;
      for (
        let depth = 0;
        controlNode && depth < 8;
        depth++, controlNode = controlNode.parentElement
      ) {
        if (!(controlNode instanceof HTMLElement)) continue;

        controlNode.dataset.dsMobileMessageEditGap = "1";
        compactMessageEditNode(controlNode);

        if (controlNode === controlsGroup) {
          setEditLayoutStyle(controlNode, "margin-top", "8px");

          const style = getComputedStyle(controlNode);
          if (style.position === "absolute" || style.position === "fixed") {
            setEditLayoutStyle(controlNode, "position", "static");
            setEditLayoutStyle(controlNode, "top", "auto");
            setEditLayoutStyle(controlNode, "bottom", "auto");
          }
        }

        if (controlNode === shell || controlNode === messageRoot) break;
      }

      // The message root itself may carry the minimum height that survives
      // textarea autosizing, so compact it only after the large-gap check.
      compactMessageEditNode(messageRoot);

      if (!state.editLayoutDiagRoots.has(messageRoot)) {
        state.editLayoutDiagRoots.add(messageRoot);
        DS.diagEvent?.("composer-control", "message-edit-gap-compacted", {
          measuredGap: Math.round(measuredGap),
          wantedHeight: Math.round(wantedHeight)
        });
      }
    }
  }

  function resizeAndroidMessageEdit(textarea) {
    if (!androidAppRuntime() || !mobileLayoutActive()) return false;
    if (!isMessageEditTextarea(textarea) || !textarea.isConnected) return false;

    const viewportHeight = Math.max(
      320,
      Number(window.visualViewport?.height || window.innerHeight || 640)
    );

    const minHeight = 96;
    // Leave enough room for Save/Cancel and the keyboard, but give long edits
    // more space before switching to an internal scroll area.
    const maxHeight = Math.max(240, Math.min(640, viewportHeight * 0.78));
    const previousScrollTop = Number(textarea.scrollTop || 0);
    const selectionEnd = Number(textarea.selectionEnd ?? textarea.value.length);
    const editingAtEnd = selectionEnd >= Math.max(0, textarea.value.length - 1);

    // Measure from the content, not the previous explicit height.
    textarea.style.setProperty("height", "auto", "important");
    textarea.style.setProperty("min-height", `${minHeight}px`, "important");
    textarea.style.setProperty("max-height", `${maxHeight}px`, "important");
    textarea.style.setProperty("box-sizing", "border-box", "important");
    textarea.style.setProperty("line-height", "1.5", "important");
    textarea.style.setProperty("padding-top", "6px", "important");
    textarea.style.setProperty("padding-bottom", "18px", "important");
    textarea.style.setProperty("scroll-padding-bottom", "22px", "important");
    textarea.style.setProperty("overscroll-behavior", "contain", "important");

    const naturalHeight = Math.ceil(textarea.scrollHeight + 12);
    const wantedHeight = Math.max(
      minHeight,
      Math.min(maxHeight, naturalHeight)
    );
    const capped = naturalHeight > maxHeight;

    textarea.style.setProperty("height", `${wantedHeight}px`, "important");
    textarea.style.setProperty(
      "overflow-y",
      capped ? "auto" : "hidden",
      "important"
    );

    textarea.dataset.dsMobileMessageEditFixed = "1";
    repairMessageEditAncestors(textarea, wantedHeight);

    // Once a long edit reaches the cap, keeping the textarea at the correct
    // height is not enough: Android WebView can leave the newest line partly
    // below the internal scroll viewport. Keep the active caret/end visible.
    const restoreEditScroll = () => {
      if (!textarea.isConnected) return;
      const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
      if (!capped || maxScroll <= 0) {
        textarea.scrollTop = 0;
        return;
      }

      if (document.activeElement === textarea && editingAtEnd) {
        textarea.scrollTop = maxScroll;
      } else {
        textarea.scrollTop = Math.max(0, Math.min(previousScrollTop, maxScroll));
      }
    };

    restoreEditScroll();
    requestAnimationFrame(restoreEditScroll);
    return true;
  }

  function normalizeAndroidMessageEditors() {
    if (!androidAppRuntime() || !mobileLayoutActive()) return;

    cleanupStaleMessageEditLayoutFixes();

    document.querySelectorAll("textarea").forEach(textarea => {
      if (isMessageEditTextarea(textarea)) {
        resizeAndroidMessageEdit(textarea);
      }
    });
  }

  function scheduleAndroidMessageEditResize(textarea = null) {
    if (!androidAppRuntime() || !mobileLayoutActive()) return;

    cancelAnimationFrame(state.editResizeRaf);
    clearTimeout(state.editResizeTimer);

    state.editResizeRaf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (textarea?.isConnected && isMessageEditTextarea(textarea)) {
          resizeAndroidMessageEdit(textarea);
        } else {
          normalizeAndroidMessageEditors();
        }
      });
    });

    // SpicyChat/React can write its own height at the end of the input event.
    // One bounded delayed pass fixes that race without an endless observer loop.
    state.editResizeTimer = setTimeout(() => {
      if (textarea?.isConnected && isMessageEditTextarea(textarea)) {
        resizeAndroidMessageEdit(textarea);
      } else {
        normalizeAndroidMessageEditors();
      }
    }, 90);
  }

  function scheduleMobileSendWrapperNormalize() {
    cancelAnimationFrame(state.mobileNormalizeRaf);
    state.mobileNormalizeRaf = requestAnimationFrame(() => {
      normalizeMobileSendWrapper();
      normalizeAndroidMessageEditors();
    });
  }

  function installMobileChatLayoutFixes() {
    if (!mobileLayoutActive() || state.mobileListenersInstalled) return;
    state.mobileListenersInstalled = true;

    const mobileMutationTouchesComposer = records => records.some(record => {
      if (record.type !== "childList") return false;

      const nodes = [
        ...Array.from(record.addedNodes || []),
        ...Array.from(record.removedNodes || [])
      ];

      return nodes.some(node => {
        if (!(node instanceof Element)) return false;

        const selector = [
          "textarea",
          "[contenteditable='true']",
          "button[aria-label='generate-image']",
          "button[data-testid='ImageGenerationButton']"
        ].join(",");

        if (node.matches?.(selector)) return true;
        if (node.querySelector?.(selector)) return true;

        // A composer/edit wrapper can be replaced while the actual textarea is
        // a sibling rather than a descendant of the changed node.
        const parent = node.parentElement;
        return !!parent?.querySelector?.(selector);
      });
    });

    state.mobileObserver = new MutationObserver(records => {
      if (!mobileMutationTouchesComposer(records)) return;
      scheduleMobileSendWrapperNormalize();
    });

    const mobileObserveRoot = document.body || document.documentElement;
    if (mobileObserveRoot instanceof Node) {
      state.mobileObserver.observe(mobileObserveRoot, {
        childList: true,
        subtree: true
      });
    }

    document.addEventListener("focusin", event => {
      const textarea = event.target;
      if (!isMessageEditTextarea(textarea)) return;
      scheduleAndroidMessageEditResize(textarea);
    }, true);

    document.addEventListener("input", event => {
      const textarea = event.target;
      if (!isMessageEditTextarea(textarea)) return;
      scheduleAndroidMessageEditResize(textarea);
    }, true);

    window.addEventListener("resize", () => {
      scheduleMobileSendWrapperNormalize();
      scheduleAndroidMessageEditResize();
    }, { passive: true });

    window.visualViewport?.addEventListener("resize", () => {
      scheduleAndroidMessageEditResize();
    }, { passive: true });
  }

  DS.applyMobileChatLayoutFixes = function applyMobileChatLayoutFixes() {
    if (!enabled() || !mobileLayoutActive()) return;
    installMobileChatLayoutFixes();
    normalizeMobileSendWrapper();
    normalizeAndroidMessageEditors();
  };

  DS.beginFollowNewestChatMessage = () => {};
  DS.isFollowingNewestMessage = () => false;

  DS.applyComposerControl = function applyComposerControl() {
    if (shouldKeepChatPositionWhileTyping()) {
      installTypingScrollGuard();
    } else {
      stopTypingScrollGuard();
    }

    if (!shouldKeepComposerEnabled()) {
      disconnectComposerObserver();
      if (DS.state.composerControlWasActive) {
        getMessageTextareas().forEach(textarea => {
          DS.setClassState?.(textarea, "ds-composer-forced-enabled", false);
        });
      }
      DS.state.composerControlWasActive = false;
      return;
    }

    DS.state.composerControlWasActive = true;
    ensureComposerObserver();
    getMessageTextareas().forEach(textarea => {
      forceEnableTextarea(textarea);
      scheduleComposerHeightRepair(textarea);
    });
  };
})();
