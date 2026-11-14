// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const BRIDGE_ATTR = "data-ds-message-action-bridge";
  let quickActionState = new WeakMap();

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function getMessageRoot(button) {
    // A native header can contain dropdowns and message-looking text too.
    // Never attach per-message controls outside a real message-scoped root.
    return button?.closest?.("div[id^='message-']") || null;
  }

  function getDropdownHolder(button) {
    const root = getMessageRoot(button);
    if (!root) return null;
    const parent = button.parentElement;
    if (!parent || parent === root || !root.contains(parent)) return null;
    // Native chat V2 sometimes wraps the *same* dropdown in a new .relative
    // element during a React update. Anchor to the stable message action row,
    // or the old bar can remain outside while a second bar is added inside.
    const candidates = [button.closest(".flex.items-center.gap-sm"), button.closest(".relative"), parent];
    for (const holder of candidates) {
      if (!holder || holder === root || !root.contains(holder)) continue;
      if (holder.querySelector("textarea, div[class*='overflow-wrap']")) continue;
      if (holder.querySelectorAll("button[aria-label='message-dropdown']").length !== 1) continue;
      return holder;
    }
    return null;
  }

  function isAiMessage(button) {
    const root = getMessageRoot(button);
    return !!root?.querySelector("a[href*='/chatbot/'], a[aria-label='chatbot-profile']");
  }

  function hasUploadedUserImage(sourceButton) {
    if (!sourceButton || isAiMessage(sourceButton)) return false;

    let node = sourceButton;
    for (let i = 0; node && i < 12; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;

      const image = node.querySelector?.(
        "img[src*='/chat_user_images/'], img[src*='chat_user_images']"
      );
      if (image) return true;
    }

    return false;
  }

  function makeActionButton(action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-message-quick-action";
    button.dataset.dsMessageAction = action.label;
    button.setAttribute("aria-label", `QoL ${action.label}`);
    button.title = action.label;
    button.textContent = action.icon;
    return button;
  }

  function getEnabledActions(sourceButton) {
    const settings = DS.state?.settings || {};
    const ai = isAiMessage(sourceButton);
    const actions = [];

    // Copy, Edit and Report are controlled only by their individual switches.
    // The Settings "Copy + Edit + Report" checkbox is a group toggle that
    // updates those switches; it is deliberately not a runtime override.
    // This means turning Report off always hides Report even if the group
    // toggle had previously been used.
    const canReport = settings.messageQuickActionReport === true && ai;
    const canCopy = settings.messageQuickActionCopy === true;
    const canEdit = settings.messageQuickActionEdit === true;
    const canRemoveImage = settings.messageQuickActionRemoveImage === true && !ai && hasUploadedUserImage(sourceButton);
    const canResend = settings.messageQuickActionResend === true && !ai && !!getDirectCopyText(sourceButton);

    if (ai) {
      if (canReport) actions.push({ label: "Report", icon: "⚑" });
      if (canCopy) actions.push({ label: "Copy", icon: "⧉" });
      if (canEdit) actions.push({ label: "Edit", icon: "✎" });
      return actions;
    }

    if (canEdit) actions.push({ label: "Edit", icon: "✎" });
    if (canCopy) actions.push({ label: "Copy", icon: "⧉" });
    if (canResend) actions.push({ label: "Resend", icon: "↻" });
    if (canRemoveImage) actions.push({ label: "Remove Image", icon: "⌫" });

    return actions;
  }

  function clickDropdown(button) {
    // The native V2 menu is React-owned. A fabricated pointer sequence followed
    // by click() can toggle it twice, leaving the Edit action closed.
    try { button.click(); return true; } catch { return false; }
  }

  function nativeMessageEditor(root) {
    return root?.querySelector?.("textarea, [contenteditable='true']") || null;
  }

  function showNativeEditFallback(sourceButton) {
    const holder = getDropdownHolder(sourceButton);
    if (holder) holder.classList.add("ds-message-native-edit-fallback");
  }

  function clearNativeEditFallback(sourceButton) {
    const holder = getDropdownHolder(sourceButton);
    holder?.classList.remove("ds-message-native-edit-fallback");
  }

  async function waitForNativeEdit(root, timeoutMs = 900) {
    const attempts = Math.ceil(timeoutMs / 60);
    for (let i = 0; i < attempts; i++) {
      if (root?.isConnected && nativeMessageEditor(root)) return true;
      await DS.sleep(60);
    }
    return !!(root?.isConnected && nativeMessageEditor(root));
  }

  function menuButtons(label, sourceButton, includeHidden = false) {
    const holder = getDropdownHolder(sourceButton);
    // SpicyChat's newer portal menu also exposes stable action test IDs.
    // Use them as a fallback if native button labels change; never click
    // another message's QoL toolbar or an unrelated dialog.
    const nativeTestId = {
      Copy: "message-action-copy",
      Edit: "message-action-edit",
      Report: "message-action-report"
    }[label];
    const exact = `button[aria-label='${CSS.escape(label)}']` +
      (nativeTestId ? `, button[data-testid='${nativeTestId}']` : "");
    const accept = button => {
      if (button.closest("#ds-qol-panel, .ds-message-quick-actions")) return false;
      return includeHidden || isVisible(button);
    };

    const local = holder ? DS.qsa(exact, holder).filter(accept) : [];
    if (local.length) return local;

    const sourceRect = sourceButton.getBoundingClientRect();
    return DS.qsa(exact)
      .filter(accept)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const ad = Math.abs(ar.top - sourceRect.top) + Math.abs(ar.left - sourceRect.left);
        const bd = Math.abs(br.top - sourceRect.top) + Math.abs(br.left - sourceRect.left);
        return ad - bd;
      });
  }

  function beginSilentBridge() {
    DS.setAttributeIfChanged?.(document.documentElement, BRIDGE_ATTR, "1");
  }

  function endSilentBridge(delay = 0) {
    window.setTimeout(() => {
      if (document.documentElement.hasAttribute(BRIDGE_ATTR)) document.documentElement.removeAttribute(BRIDGE_ATTR);
    }, delay);
  }

  function getDirectCopyText(sourceButton) {
    const root = getMessageRoot(sourceButton);
    if (!root) return "";

    // SpicyChat's normal rendered message body is made from leading-6 spans.
    // Restrict direct-copy to that known structure so headers, Directed/OOC
    // controls, translation UI and other message chrome never get copied by
    // accident. Unknown/new structures fall back to SpicyChat's own Copy.
    const bodyHost = root.querySelector("div[class*='overflow-wrap']");
    if (!bodyHost) return "";

    const lines = Array.from(bodyHost.querySelectorAll("span.leading-6"))
      .filter(span => !span.closest(".ds-translation-output, .ds-message-quick-actions, [data-ds-translation-output]"))
      .map(span => cleanText(span.textContent))
      .filter(Boolean);

    if (!lines.length) return "";
    return lines.join("\n");
  }


  function findComposerTextarea() {
    const fields = DS.qsa("textarea")
      .filter(field => isVisible(field))
      .filter(field => {
        const placeholder = cleanText(field.getAttribute("placeholder") || "").toLowerCase();
        if (placeholder.includes("enter something")) return false;
        return !field.closest("div[id^='message-'], #ds-qol-panel");
      });
    return fields.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
  }

  function setComposerText(value) {
    const field = findComposerTextarea();
    if (!field) {
      DS.setQuickStatus?.("Could not find the chat message box.");
      return false;
    }

    const next = String(value || "");
    const current = String(field.value || "");
    if (current.trim() && current !== next) {
      const replace = window.confirm("Replace your current draft with this older message?");
      if (!replace) return false;
    }

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(field, next); else field.value = next;
    try {
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: next }));
    } catch {
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.focus({ preventScroll: false });
    try { field.setSelectionRange(next.length, next.length); } catch {}
    DS.setQuickStatus?.("Restored message to the composer. Review it, then send when ready.");
    return true;
  }

  function runResend(sourceButton) {
    const text = getDirectCopyText(sourceButton);
    if (!text) {
      DS.setQuickStatus?.("Could not read this message safely for resend.");
      return false;
    }
    return setComposerText(text);
  }

  async function runMenuAction(sourceButton, label) {
    // Delegate all operations to SpicyChat's own menu. Do not click a stale
    // hidden portal's Edit item or report success before the editor opens.
    const edit = label === "Edit";
    const root = getMessageRoot(sourceButton);
    if (!root?.isConnected || !sourceButton?.isConnected) return false;
    if (!edit) beginSilentBridge();

    // Quick actions hide SpicyChat's original menu trigger. For Edit, unhide
    // it *before* opening the menu so the native portal has a valid anchor.
    // If opening fails, leave it available as a manual fallback.
    if (edit) showNativeEditFallback(sourceButton);
    const previouslyVisible = edit ? new Set(menuButtons(label, sourceButton, false)) : null;
    let editOpened = false;

    try {
      if (!clickDropdown(sourceButton)) return false;
      let actionButton = null;
      for (let i = 0; i < 16; i++) {
        const candidates = menuButtons(label, sourceButton, !edit);
        actionButton = edit
          ? (candidates.find(button => {
              if (previouslyVisible.has(button) || !button.isConnected || button.disabled) return false;
              if (button.getAttribute("aria-disabled") === "true") return false;
              const menu = button.closest("[role='menu'], div.absolute.w-max, [data-testid*='MessageMenu']")
                || (button.parentElement?.querySelector("button[aria-label='Copy']") ? button.parentElement : null);
              if (!menu) return false;
              const sourceRect = sourceButton.getBoundingClientRect();
              const actionRect = button.getBoundingClientRect();
              return Math.abs(actionRect.top - sourceRect.top) < 650;
            }) || null)
          : (candidates[0] || null);
        if (actionButton) break;
        await DS.sleep(60);
      }

      if (!actionButton) {
        DS.setQuickStatus?.(edit
          ? "Could not open Edit automatically. Use the restored three-dot menu."
          : `${label} is not available on this message.`);
        return false;
      }

      // A single native click is sufficient. DS.realClick sends extra pointer
      // events that can toggle React menus a second time.
      actionButton.click();
      if (edit) {
        editOpened = await waitForNativeEdit(root);
        if (!editOpened) {
          DS.setQuickStatus?.("Edit did not open. Try the visible three-dot menu on this message.");
          return false;
        }
        DS.setQuickStatus?.("Message editor opened.");
        return true;
      }
      DS.setQuickStatus?.(`${label} clicked.`);
      return true;
    } finally {
      if (!edit) endSilentBridge(120);
      if (edit && editOpened) clearNativeEditFallback(sourceButton);
    }
  }

  async function runAction(sourceButton, action) {
    const settings = DS.state?.settings || {};

    if (action.label === "Copy") {
      // Always invoke SpicyChat's native Copy action. Reading textContent from
      // rendered Markdown spans loses *actions*, **emphasis**, and other
      // original source formatting. If the native action is unavailable, do
      // not silently copy a different/plain-text representation instead.
      return runMenuAction(sourceButton, "Copy");
    }

    if (action.label === "Resend") {
      return runResend(sourceButton);
    }

    if (action.label === "Remove Image" && settings.messageQuickActionConfirmRemoveImage === true) {
      const confirmed = window.confirm("Remove the uploaded image from this message?");
      if (!confirmed) return false;
    }

    return runMenuAction(sourceButton, action.label);
  }

  // An independent bottom shortcut for native message actions. Never move
  // React-owned nodes or create another message mutation observer.
  function bottomActionHost(dropdownButton) {
    const root = dropdownButton.closest("div[id^='message-']") || getMessageRoot(dropdownButton);
    if (!root?.isConnected) return null;
    const native = root.querySelector(
      'button[aria-label="RefreshCcw-button"], button[aria-label="MessageSquarePlus-button"], button[aria-label="Star-button"], button[aria-label="Volume2-button"], button[aria-label="ThumbsUp-button"], button[aria-label="ThumbsDown-button"]'
    );
    if (!native || !native.isConnected) return null;
    const host = native.parentElement;
    // Restrict to the native button row, not a message bubble or chat header.
    return host && host !== root && host.querySelectorAll("button").length <= 15 ? host : null;
  }

  function bottomMenuHealthy(dropdownButton, settings) {
    if (settings.messageBottomMenuShortcut !== true) return true;
    const root = dropdownButton.closest("div[id^='message-']") || getMessageRoot(dropdownButton);
    const host = bottomActionHost(dropdownButton);
    return !host || !![...host.querySelectorAll(":scope > .ds-qol-message-bottom-menu")]
      .find(node => node.dataset.dsSourceMessage === root?.id && node.isConnected);
  }

  function ensureBottomMenu(dropdownButton) {
    const settings = DS.state?.settings || {};
    const root = dropdownButton.closest("div[id^='message-']") || getMessageRoot(dropdownButton);
    if (!root?.isConnected) return;
    const host = bottomActionHost(dropdownButton);
    const existing = root.querySelector(".ds-qol-message-bottom-menu");
    if (settings.messageBottomMenuShortcut !== true || !host) { existing?.remove(); return; }
    if (existing?.parentElement === host) return;
    existing?.remove();
    const wrap = document.createElement("span");
    wrap.className = "ds-qol-message-bottom-menu";
    wrap.dataset.dsSourceMessage = root.id || "";
    const launcher = document.createElement("button");
    launcher.type = "button"; launcher.className = "ds-qol-message-bottom-launcher";
    launcher.textContent = "⋯"; launcher.title = "Message actions";
    launcher.setAttribute("aria-label", "Message actions");
    launcher.setAttribute("aria-expanded", "false");
    const menu = document.createElement("span"); menu.className = "ds-qol-message-bottom-menu-panel";
    menu.hidden = true; menu.setAttribute("role", "menu");
    const items = isAiMessage(dropdownButton)
      ? ["Copy", "Edit", "Report"]
      : ["Copy", "Edit", ...(hasUploadedUserImage(dropdownButton) ? ["Remove Image"] : [])];
    for (const label of items) {
      const choice = document.createElement("button"); choice.type = "button";
      choice.textContent = label; choice.setAttribute("role", "menuitem");
      choice.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        menu.hidden = true; launcher.setAttribute("aria-expanded", "false");
        if (!dropdownButton.isConnected || DS.state?.chatExportLock?.active) return;
        void runAction(dropdownButton, { label }).catch(() => DS.setQuickStatus?.(`${label} failed.`));
      });
      menu.appendChild(choice);
    }
    launcher.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      const shouldOpen = menu.hidden;
      for (const open of document.querySelectorAll(".ds-qol-message-bottom-menu-panel:not([hidden])")) {
        open.hidden = true;
        open.parentElement?.querySelector(".ds-qol-message-bottom-launcher")?.setAttribute("aria-expanded", "false");
      }
      menu.hidden = !shouldOpen;
      launcher.setAttribute("aria-expanded", String(shouldOpen));
    });
    wrap.append(launcher, menu);
    host.appendChild(wrap);
  }

  document.addEventListener("click", event => {
    if (event.target?.closest?.(".ds-qol-message-bottom-menu")) return;
    for (const menu of document.querySelectorAll(".ds-qol-message-bottom-menu-panel:not([hidden])")) {
      menu.hidden = true;
      menu.parentElement?.querySelector(".ds-qol-message-bottom-launcher")?.setAttribute("aria-expanded", "false");
    }
  }, true);

  function repairContextKeeperForDropdown(dropdownButton) {
    const root = getMessageRoot(dropdownButton);
    if (!root) return;
    try { DS.ensureContextKeeperMessageButtonForRoot?.(root); } catch {}
  }

  function ensureQuickActions(dropdownButton, settingsSignature) {
    if (!dropdownButton || dropdownButton.closest("#ds-qol-panel, .ds-message-quick-actions")) return;
    const settings = DS.state?.settings || {};

    // Guard before hiding SpicyChat's native menu or creating a QoL toolbar.
    // A header dropdown or stale React portal must remain untouched.
    if (!getMessageRoot(dropdownButton)) return;
    const holder = getDropdownHolder(dropdownButton);
    if (!holder) {
      // If SpicyChat moved the native menu to an unfamiliar header, keep
      // that native control accessible rather than leaving it CSS-hidden.
      const root = getMessageRoot(dropdownButton);
      root?.querySelectorAll(".ds-message-dropdown-hidden").forEach(old => {
        if (old.contains(dropdownButton) && !old.querySelector(".ds-message-quick-actions"))
          DS.setClassState?.(old, "ds-message-dropdown-hidden", false);
      });
      return;
    }

    // One message may have a previously injected bar at an older wrapper.
    // Reuse it at the current anchor and remove extras before evaluating state.
    const root = getMessageRoot(dropdownButton);
    let bar = holder.querySelector(":scope > .ds-message-quick-actions");
    const oldBars = Array.from(root.querySelectorAll(".ds-message-quick-actions"));
    if (!bar && oldBars.length) {
      bar = oldBars[0];
      holder.insertBefore(bar, holder.firstChild);
    }
    for (const stale of oldBars) {
      if (stale !== bar) stale.remove();
    }
    // A previous run may have hidden an older nested wrapper. When the
    // button moves, don't leave that stale class hiding native controls.
    for (const staleHolder of root.querySelectorAll(".ds-message-dropdown-hidden")) {
      if (staleHolder !== holder) DS.setClassState?.(staleHolder, "ds-message-dropdown-hidden", false);
    }
    const actions = getEnabledActions(dropdownButton);
    const signature = JSON.stringify(actions.map(action => action.label));

    // Only replace SpicyChat's three-dot launcher when this particular message
    // actually has at least one enabled QoL action. This matters when users
    // enable just Remove Image or Resend: unrelated messages keep their normal
    // native menu instead of being left with neither quick actions nor dots.
    if (!actions.length) {
      DS.setClassState?.(holder, "ds-message-dropdown-hidden", false);
      bar?.remove();
      DS.setDatasetIfChanged?.(dropdownButton, "dsMessageQuickReady", settingsSignature);
      const root = getMessageRoot(dropdownButton);
      rememberQuickActionState(dropdownButton, settingsSignature, root, holder, null, false);
      repairContextKeeperForDropdown(dropdownButton);
      return;
    }

    DS.setClassState?.(holder, "ds-message-dropdown-hidden", settings.messageBottomMenuShortcut !== true);

    if (!bar) {
      bar = document.createElement("div");
      bar.className = "ds-message-quick-actions";
      holder.insertBefore(bar, holder.firstChild);
    }

    if (bar.dataset.dsActionSignature === signature &&
        bar.querySelectorAll(":scope > .ds-message-quick-action").length === actions.length &&
        actions.every(action => !!bar.querySelector(`:scope > .ds-message-quick-action[data-ds-message-action="${CSS.escape(action.label)}"]`))) {
      DS.setDatasetIfChanged?.(dropdownButton, "dsMessageQuickReady", settingsSignature);
      const root = getMessageRoot(dropdownButton);
      rememberQuickActionState(dropdownButton, settingsSignature, root, holder, bar, true);
      repairContextKeeperForDropdown(dropdownButton);
      return;
    }

    DS.setDatasetIfChanged?.(bar, "dsActionSignature", signature);
    bar.replaceChildren();

    for (const action of actions) {
      const button = makeActionButton(action);
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (button.dataset.dsActionBusy === "1") return;
        if (DS.state?.chatExportLock?.active) {
          DS.setQuickStatus?.("Chat export is in progress.");
          return;
        }

        button.dataset.dsActionBusy = "1";
        runAction(dropdownButton, action).then(success => {
          if (!success || action.label !== "Remove Image") return;

          // SpicyChat removes the attachment asynchronously. Re-check this
          // message shortly afterwards so the image-only action disappears.
          window.setTimeout(() => {
            delete dropdownButton.dataset.dsMessageQuickReady;
            DS.applyMessageOptions?.();
          }, 250);
        }).catch(() => {
          if (action.label === "Edit") showNativeEditFallback(dropdownButton);
          DS.setQuickStatus?.(`${action.label} failed. Use the native message menu.`);
        }).finally(() => {
          delete button.dataset.dsActionBusy;
        });
      });
      bar.appendChild(button);
    }

    DS.setDatasetIfChanged?.(dropdownButton, "dsMessageQuickReady", settingsSignature);
    rememberQuickActionState(dropdownButton, settingsSignature, root, holder, bar, true);
    repairContextKeeperForDropdown(dropdownButton);
  }

  function rememberQuickActionState(button, signature, root, holder, bar, hasActions) {
    quickActionState.set(button, {
      signature,
      root,
      revision: Number(DS.getMessageRootRevision?.(root) || 0),
      holder,
      bar,
      hasActions,
      // Native message text can update without remounting the toolbar. Keep
      // these references so an unchanged Copy/Edit bar needs no selector scans.
      actionSignature: hasActions ? bar?.dataset.dsActionSignature : "",
      actionButtons: hasActions ? Array.from(bar.children) : []
    });
  }

  function cleanup() {
    DS.qsa(".ds-message-quick-actions").forEach(el => el.remove());
    DS.qsa(".ds-qol-message-bottom-menu").forEach(el => el.remove());
    DS.qsa(".ds-message-dropdown-hidden").forEach(el => {
      DS.setClassState?.(el, "ds-message-dropdown-hidden", false);
    });
    DS.qsa(".ds-message-native-edit-fallback").forEach(el => el.classList.remove("ds-message-native-edit-fallback"));
    DS.qsa("button[aria-label='message-dropdown'][data-ds-message-quick-ready]").forEach(button => {
      delete button.dataset.dsMessageQuickReady;
    });
    document.documentElement.removeAttribute(BRIDGE_ATTR);
    DS.state.messageOptionsSettingsSignature = "";
    quickActionState = new WeakMap();
  }

  function settingsSignature(settings) {
    return [
      settings.messageQuickActionCopy === true ? 1 : 0,
      settings.messageQuickActionEdit === true ? 1 : 0,
      settings.messageQuickActionRemoveImage === true ? 1 : 0,
      settings.messageQuickActionResend === true ? 1 : 0,
      settings.messageQuickActionConfirmRemoveImage === true ? 1 : 0,
      settings.messageQuickActionReport === true ? 1 : 0,
      settings.messageBottomMenuShortcut === true ? 1 : 0
    ].join("");
  }


  function quickActionRevisionStateHealthy(button, signature) {
    const state = quickActionState.get(button);
    if (!state || state.signature !== signature) return false;
    const root = getMessageRoot(button);
    if (!root || state.root !== root || !root.isConnected) return false;
    if (root.querySelectorAll(".ds-message-quick-actions").length > 1) return false;
    // Revisions represent message-body changes too. Copy/Edit/Report labels do
    // not depend on the text, so only dynamic user actions (Resend/Remove Image)
    // need to be recomputed after a content revision.
    const settings = DS.state?.settings || {};
    const dynamicActions = settings.messageQuickActionResend === true ||
      settings.messageQuickActionRemoveImage === true;
    if (dynamicActions && Number(DS.getMessageRootRevision?.(root) || 0) !== Number(state.revision || 0)) return false;
    if (!state.holder?.isConnected || !getMessageRoot(button) || state.holder !== getDropdownHolder(button)) return false;
    if (button.dataset.dsMessageQuickReady !== signature) return false;
    if (state.hasActions) {
      const bar = state.bar;
      if (!bar?.isConnected || bar.parentElement !== state.holder ||
          bar.dataset.dsActionSignature !== state.actionSignature) return false;
      const children = state.actionButtons || [];
      return children.length > 0 && bar.childElementCount === children.length &&
        children.every((child, index) => child.parentElement === bar && bar.children[index] === child);
    }
    return !state.holder.querySelector(":scope > .ds-message-quick-actions");
  }

  function quickActionBarHealthy(button, signature) {
    const holder = getDropdownHolder(button);
    const bar = holder?.querySelector?.(":scope > .ds-message-quick-actions");
    if (!bar || getMessageRoot(button)?.querySelectorAll(".ds-message-quick-actions").length > 1) return false;
    const actions = getEnabledActions(button);
    return bar.dataset.dsActionSignature === JSON.stringify(actions.map(action => action.label)) &&
      button.dataset.dsMessageQuickReady === signature &&
      bar.querySelectorAll(":scope > .ds-message-quick-action").length === actions.length &&
      actions.every(action => !!bar.querySelector(`:scope > .ds-message-quick-action[data-ds-message-action="${CSS.escape(action.label)}"]`));
  }

  function hasAnyQuickActionEnabled(settings) {
    return (
      settings.messageQuickActionCopy === true ||
      settings.messageQuickActionEdit === true ||
      settings.messageQuickActionRemoveImage === true ||
      settings.messageQuickActionResend === true ||
      settings.messageQuickActionReport === true ||
      settings.messageBottomMenuShortcut === true
    );
  }

  DS.applyMessageOptions = function applyMessageOptions() {
    const settings = DS.state?.settings || {};
    if (DS.state?.chatExportLock?.active) return;

    if (!settings.enabled || !DS.isSingleChatPage?.() || !hasAnyQuickActionEnabled(settings)) {
      if (DS.state.messageOptionsWasActive) cleanup();
      DS.state.messageOptionsWasActive = false;
      return;
    }

    DS.state.messageOptionsWasActive = true;
    const signature = settingsSignature(settings);
    const signatureChanged = DS.state.messageOptionsSettingsSignature !== signature;
    DS.state.messageOptionsSettingsSignature = signature;

    const laneRoots = !signatureChanged ? (DS.getCurrentMessageLaneRoots?.() || []) : [];
    let buttons = [];

    if (laneRoots.length) {
      buttons = laneRoots.flatMap(root => {
        if (DS.isMessageEditPending?.(root)) return [];
        if (settings.chatPerformanceMode && root.classList.contains("ds-chat-message-far")) return [];
        return DS.qsa("button[aria-label='message-dropdown']", root)
          .filter(button => !quickActionRevisionStateHealthy(button, signature) || !bottomMenuHealthy(button, settings));
      });
      const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.messageOptionsIncrementalUpdates = Number(counters.messageOptionsIncrementalUpdates || 0) + 1;
    } else {
      const roots = DS.getMessageEnhancerRoots?.({ newest: 24, margin: 1400 }) || [];
      if (roots.length) {
        buttons = roots.flatMap(root => {
          if (settings.chatPerformanceMode && root.classList.contains("ds-chat-message-far")) return [];
          return DS.qsa("button[aria-label='message-dropdown']", root)
            .filter(button => signatureChanged || !quickActionRevisionStateHealthy(button, signature) || !bottomMenuHealthy(button, settings));
        });
      } else {
        let selector = "button[aria-label='message-dropdown']";
        if (settings.chatPerformanceMode) selector = `[id^='message-']:not(.ds-chat-message-far) button[aria-label='message-dropdown']`;
        buttons = DS.qsa(selector);
        if (!signatureChanged) buttons = buttons.filter(button => !quickActionRevisionStateHealthy(button, signature) || !bottomMenuHealthy(button, settings));
      }
    }

    buttons
      .filter(button => !!getMessageRoot(button))
      .filter(button => !button.closest("#ds-qol-panel"))
      .filter(button => !DS.isMessageEditPending?.(button.closest("div[id^='message-']")))
      .forEach(button => {
        ensureQuickActions(button, signature);
        ensureBottomMenu(button);
      });
  };

  // SpicyChat can replace an already-decorated message toolbar without changing
  // the original dropdown button's settings marker. Keep a tiny newest-message
  // watchdog so Copy/Edit/Report/Remove Image repairs itself without requiring a
  // settings toggle or a full-chat rescan.
  let quickActionRepairTimer = 0;

  function repairNewestQuickActions() {
    quickActionRepairTimer = 0;
    const settings = DS.state?.settings || {};
    if (document.hidden || !settings.enabled || !DS.isSingleChatPage?.() || !(hasAnyQuickActionEnabled(settings) || (settings.enableContextKeeper && settings.contextKeeperMessageButtons))) return;
    if (DS.state?.chatExportLock?.active) return;
    const quietUntil = Math.max(
      Number(DS.state?.chatStartupQuietUntil || 0),
      Number(DS.state?.chatReplyRenderQuietUntil || 0),
      Number(DS.state?.chatEnhancerQuietUntil || 0)
    );
    if (Date.now() < quietUntil) {
      scheduleQuickActionRepair(Math.min(1800, Math.max(300, quietUntil - Date.now() + 100)));
      return;
    }

    const signature = settingsSignature(settings);
    const roots = DS.getMessageEnhancerRoots?.({ forceLazy: true, newest: 12, margin: 900, respectLane: false }) || [];
    const buttons = roots.length
      ? roots.flatMap(root => DS.qsa("button[aria-label='message-dropdown']", root))
      : DS.qsa("button[aria-label='message-dropdown']").slice(-12);

    let repaired = 0;
    for (const button of buttons) {
      if (button.closest("#ds-qol-panel") || DS.isMessageEditPending?.(button.closest("div[id^='message-']"))) continue;
      if (hasAnyQuickActionEnabled(settings) && !quickActionRevisionStateHealthy(button, signature) && !quickActionBarHealthy(button, signature)) {
        ensureQuickActions(button, signature);
        repaired += 1;
      }
      if (settings.messageBottomMenuShortcut) ensureBottomMenu(button);
      // Keep may have been removed by a toolbar-only React remount even if
      // the quick-action bar is already healthy.
      repairContextKeeperForDropdown(button);
    }
    if (repaired) {
      const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.messageQuickActionSelfRepairs = Number(counters.messageQuickActionSelfRepairs || 0) + repaired;
    }
  }

  function scheduleQuickActionRepair(delay = 6500) {
    clearTimeout(quickActionRepairTimer);
    // An explicit zero means urgent recovery. Number(0) || 6500 previously
    // turned it into a long delay, leaving Copy/Edit absent after remounts.
    const wait = Number.isFinite(Number(delay)) ? Number(delay) : 6500;
    quickActionRepairTimer = window.setTimeout(repairNewestQuickActions, Math.max(250, wait));
  }

  DS.repairMessageToolbarForRoot = function repairMessageToolbarForRoot(root) {
    if (!(root instanceof Element) || !root.isConnected || !DS.isSingleChatPage?.()) return;
    const settings = DS.state?.settings || {};
    if (!settings.enabled || DS.isMessageEditPending?.(root)) return;
    const signature = settingsSignature(settings);
    root.querySelectorAll("button[aria-label='message-dropdown']").forEach(button => {
      if (hasAnyQuickActionEnabled(settings) && !quickActionRevisionStateHealthy(button, signature) && !quickActionBarHealthy(button, signature)) {
        ensureQuickActions(button, signature);
      }
      ensureBottomMenu(button);
      repairContextKeeperForDropdown(button);
    });
  };

  // Target only newly mounted native toolbar controls. Avoid scanning message
  // bodies on every token while the AI is streaming.
  let remountTimer = 0;
  const remountRoots = new Set();
  const toolbarRemountObserver = new MutationObserver(mutations => {
    const settings = DS.state?.settings || {};
    if (document.hidden || !settings.enabled || !DS.isSingleChatPage?.()) return;
    if (!(hasAnyQuickActionEnabled(settings) || (settings.enableContextKeeper && settings.contextKeeperMessageButtons))) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (!(node instanceof Element) || node.closest?.(".ds-message-quick-actions")) continue;
        if (!node.matches?.("button[aria-label='message-dropdown']") && !node.querySelector?.("button[aria-label='message-dropdown']")) continue;
        const root = node.closest?.("div[id^='message-']") || node.querySelector?.("button[aria-label='message-dropdown']")?.closest?.("div[id^='message-']");
        if (root) remountRoots.add(root);
      }
    }
    if (!remountRoots.size || remountTimer) return;
    remountTimer = window.setTimeout(() => {
      remountTimer = 0;
      const roots = [...remountRoots];
      remountRoots.clear();
      for (const root of roots.slice(0, 32)) DS.repairMessageToolbarForRoot?.(root);
    }, 180);
  });
  const beginToolbarObserver = () => {
    if (document.body) toolbarRemountObserver.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) beginToolbarObserver();
  else document.addEventListener("DOMContentLoaded", beginToolbarObserver, { once: true });

  window.setInterval(() => {
    const settings = DS.state?.settings || {};
    if (document.hidden || !settings.enabled || !DS.isSingleChatPage?.()) return;
    if (!hasAnyQuickActionEnabled(settings) && !(settings.enableContextKeeper && settings.contextKeeperMessageButtons)) return;
    scheduleQuickActionRepair(0);
  }, 7000);
  window.addEventListener("pageshow", () => scheduleQuickActionRepair(450), true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleQuickActionRepair(450);
  }, true);

})();

}
