(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  let selectedMemories = new Set();
  let deleting = false;
  let checkingPins = false;
  let pinningSelected = false;
  let loadingMoreMemories = false;
  let scanningPinnedOrder = false;
  let applyingPinnedOrder = false;
  let importingMemories = false;
  let pinnedOrderDraft = [];
  const autoLoadedManagers = new WeakSet();
  let lastManager = null;
  let lastMemoryMenuTrigger = null;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return !!(rect.width || rect.height);
  }

  function getManager() {
    const exactMatches = [...document.querySelectorAll('[data-testid="ChatMemoryManagerCapabilityGate"]')];
    const exact = exactMatches.find(isVisible) || exactMatches[exactMatches.length - 1] || null;
    if (exact) return exact;

    // Compatibility fallback: SpicyChat has changed the Memories wrapper more
    // than once. Prefer their translation keys / native memory controls over
    // layout or generated class names so the helper can survive those changes.
    const roots = [...document.querySelectorAll('[role="dialog"], [data-slot="dialog"], [aria-modal="true"]')].reverse();
    for (const root of roots) {
      if (!isVisible(root)) continue;
      if (root.querySelector('[data-translate-key^="chat:modal.memories."]')) return root;
      const hasMemoryField = [...root.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')].some(field => {
        const placeholder = cleanText(field.getAttribute?.("placeholder")).toLowerCase();
        return /add (?:a )?new memory|memory/.test(placeholder);
      });
      const text = cleanText(root.textContent).toLowerCase();
      if (hasMemoryField && /(?:^|\s)memories(?:\s|$)/.test(text)) return root;
    }
    return null;
  }

  function memoryRowFromTrigger(trigger, manager) {
    let node = trigger?.parentElement;

    while (node && node !== manager) {
      const textNode = node.querySelector?.("div[class*='overflow-wrap'] span");
      const triggers = node.querySelectorAll?.("button[data-slot='trigger'][aria-haspopup='true']") || [];

      if (textNode && triggers.length === 1 && triggers[0] === trigger) {
        return {
          row: node,
          trigger,
          textNode,
          rawText: String(textNode.textContent || "").trim(),
          text: cleanText(textNode.textContent)
        };
      }

      node = node.parentElement;
    }

    return null;
  }

  function getMemoryRows(manager = getManager()) {
    if (!manager) return [];

    const seen = new Set();
    const rows = [];

    for (const trigger of manager.querySelectorAll("button[data-slot='trigger'][aria-haspopup='true']")) {
      const found = memoryRowFromTrigger(trigger, manager);
      if (!found?.text || seen.has(found.row)) continue;
      seen.add(found.row);
      rows.push(found);
    }

    return rows;
  }

  function updateToolbar(manager = getManager()) {
    const toolbar = manager?.querySelector("#ds-memory-bulk-toolbar");
    if (!toolbar) return;

    const rows = getMemoryRows(manager);
    const available = new Set(rows.map(item => item.text));
    selectedMemories = new Set([...selectedMemories].filter(text => available.has(text)));

    for (const item of rows) {
      const box = item.row.querySelector("input.ds-memory-select-box");
      if (box) box.checked = selectedMemories.has(item.text);
      item.row.classList.toggle("ds-memory-selected", selectedMemories.has(item.text));
    }

    const count = selectedMemories.size;
    const countEl = toolbar.querySelector(".ds-memory-selected-count");
    const deleteButton = toolbar.querySelector(".ds-memory-delete-selected");
    const pinButton = toolbar.querySelector(".ds-memory-pin-selected");
    const busy = deleting || checkingPins || pinningSelected || loadingMoreMemories || scanningPinnedOrder || applyingPinnedOrder || importingMemories;

    if (countEl) countEl.textContent = `${count} selected`;
    if (deleteButton) {
      deleteButton.textContent = count ? `Delete selected (${count})` : "Delete selected";
      deleteButton.disabled = busy || count === 0;
    }
    if (pinButton) {
      pinButton.textContent = count ? `Pin selected (${count})` : "Pin selected";
      pinButton.disabled = busy || count === 0;
    }

    const keepButton = toolbar.querySelector(".ds-memory-keep-selected");
    if (keepButton) {
      keepButton.textContent = count ? `Keep selected (${count})` : "Keep selected";
      keepButton.disabled = busy || count === 0 || !DS.state?.settings?.enableContextKeeper;
      keepButton.hidden = !DS.state?.settings?.enableContextKeeper;
    }

    const loadAllButton = toolbar.querySelector(".ds-memory-load-all");
    if (loadAllButton) {
      loadAllButton.textContent = loadingMoreMemories ? "Loading memories…" : "Load all memories";
      loadAllButton.disabled = busy || !findLoadMoreMemoriesButton(manager);
    }

    const exportSelectedButton = toolbar.querySelector(".ds-memory-export-selected");
    if (exportSelectedButton) exportSelectedButton.disabled = busy || count === 0;

    for (const button of toolbar.querySelectorAll("button")) {
      if (!button.classList.contains("ds-memory-delete-selected") &&
          !button.classList.contains("ds-memory-pin-selected") &&
          !button.classList.contains("ds-memory-keep-selected") &&
          !button.classList.contains("ds-memory-load-all") &&
          !button.classList.contains("ds-memory-export-selected")) {
        button.disabled = busy;
      }
    }
  }

  function decorateMemoryRow(item) {
    const { row, trigger, text } = item;
    if (!row || !trigger || !text) return;

    row.classList.add("ds-memory-row");
    row.dataset.dsMemoryText = text;

    let checkbox = row.querySelector("input.ds-memory-select-box");
    if (!checkbox) {
      const controlsRow = trigger.parentElement?.parentElement;
      if (!controlsRow) return;

      const label = document.createElement("label");
      label.className = "ds-memory-select-control";
      label.title = "Select this memory";

      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "ds-memory-select-box";
      checkbox.setAttribute("aria-label", "Select memory");

      checkbox.addEventListener("click", event => event.stopPropagation(), true);
      label.addEventListener("click", event => event.stopPropagation(), true);

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedMemories.add(text);
        else selectedMemories.delete(text);
        updateToolbar();
      });

      label.appendChild(checkbox);
      controlsRow.insertBefore(label, controlsRow.firstChild);
    }

    checkbox.checked = selectedMemories.has(text);
    row.classList.toggle("ds-memory-selected", selectedMemories.has(text));
  }

  function setStatus(message, tone = "") {
    const status = getManager()?.querySelector(".ds-memory-bulk-status");
    if (!status) return;
    status.textContent = message || "";
    status.dataset.tone = tone;
  }

  function waitFor(predicate, timeoutMs = 1600, intervalMs = 50) {
    return new Promise(resolve => {
      const started = Date.now();

      const check = () => {
        let value = null;
        try {
          value = predicate();
        } catch {}

        if (value) {
          resolve(value);
          return;
        }

        if (Date.now() - started >= timeoutMs) {
          resolve(null);
          return;
        }

        setTimeout(check, intervalMs);
      };

      check();
    });
  }

  function getVisibleMemoryActionMenus() {
    const selectors = [
      '[aria-label="memory options"]',
      '[role="menu"]'
    ];

    const menus = [];
    const seen = new Set();

    for (const selector of selectors) {
      for (const menu of document.querySelectorAll(selector)) {
        if (seen.has(menu) || !isVisible(menu)) continue;
        seen.add(menu);

        const text = DS.normalize?.(cleanText(menu.textContent)) || cleanText(menu.textContent).toLowerCase();
        if (text.includes("delete memory") || text.includes("edit memory") || text.includes("pin memory")) {
          menus.push(menu);
        }
      }
    }

    return menus;
  }

  function findVisibleDeleteMenuItem(menu = null) {
    const root = menu || document;
    const translated = [
      ...root.querySelectorAll?.('[data-translate-key="chat:modal.memories.dropdown.delete"]') || []
    ];

    for (const candidate of translated) {
      const item = candidate.closest?.("[role='menuitem']") || candidate;
      if (isVisible(item)) return item;
    }

    for (const candidate of root.querySelectorAll?.("[role='menuitem']") || []) {
      if (!isVisible(candidate)) continue;
      const text = DS.normalize?.(cleanText(candidate.textContent)) || cleanText(candidate.textContent).toLowerCase();
      if (text === "delete memory" || text.includes("delete memory")) return candidate;
    }

    return null;
  }

  async function openMemoryActionMenu(trigger) {
    if (!trigger) return null;

    try {
      trigger.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {}

    try { trigger.focus({ preventScroll: true }); } catch {}

    // These dropdowns use React Aria's press handling. A synthetic full
    // pointer/mouse sequence can toggle the trigger twice on some builds,
    // so start with one native DOM click instead of DS.realClick().
    try { trigger.click(); } catch {}

    let menu = await waitFor(() => {
      const menus = getVisibleMemoryActionMenus();
      return menus.length ? menus[menus.length - 1] : null;
    }, 1200, 40);

    if (menu) return menu;

    // If SpicyChat ignored the first click, retry only when the trigger
    // still reports itself as closed.
    if (trigger.getAttribute("aria-expanded") !== "true") {
      try {
        trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        trigger.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
        trigger.click();
      } catch {}

      menu = await waitFor(() => {
        const menus = getVisibleMemoryActionMenus();
        return menus.length ? menus[menus.length - 1] : null;
      }, 1200, 40);
    }

    return menu;
  }

  async function closeMemoryActionMenu(trigger, menu) {
    if (!menu) return;

    if (trigger?.getAttribute("aria-expanded") === "true") {
      try { trigger.click(); } catch {}
      const closed = await waitFor(() => !isVisible(menu) ? true : null, 260, 35);
      if (closed) return;
    }

    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    } catch {}

    await waitFor(() => !isVisible(menu) ? true : null, 500, 35);
  }

  function pinStateFromMenu(menu) {
    if (!menu) return null;

    const items = [...menu.querySelectorAll?.("[role='menuitem'], button") || []].filter(isVisible);
    for (const item of items) {
      const translateKey = item.querySelector?.("[data-translate-key]")?.getAttribute("data-translate-key") ||
        item.getAttribute?.("data-translate-key") || "";
      const text = DS.normalize?.(cleanText(item.textContent)) || cleanText(item.textContent).toLowerCase();

      if (/memories\.dropdown\.unpin$/i.test(translateKey) || text.includes("unpin memory")) return true;
      if (/memories\.dropdown\.pin$/i.test(translateKey) || text === "pin memory" || text.includes("pin memory")) return false;
    }

    return null;
  }


  function findVisiblePinMenuItem(menu, wantPinned = true) {
    if (!menu) return null;

    const items = [...menu.querySelectorAll?.("[role='menuitem'], button") || []].filter(isVisible);
    for (const item of items) {
      const translated = item.querySelector?.("[data-translate-key]") || item;
      const translateKey = translated?.getAttribute?.("data-translate-key") || "";
      const text = DS.normalize?.(cleanText(item.textContent)) || cleanText(item.textContent).toLowerCase();

      if (wantPinned) {
        if (/memories\.dropdown\.pin$/i.test(translateKey)) return item;
        if (text === "pin memory") return item;
      } else {
        if (/memories\.dropdown\.unpin$/i.test(translateKey)) return item;
        if (text === "unpin memory") return item;
      }
    }

    return null;
  }

  async function getMemoryPinnedState(item) {
    if (!item?.row || !item?.trigger) return null;

    // Prefer an explicit pinned indicator if SpicyChat exposes one on the row.
    const pinnedIndicator = item.row.querySelector(
      '[aria-label="Pinned" i], [title="Pinned" i], [data-testid*="pinned" i], svg.lucide-pin:not(.lucide-pin-off)'
    );
    if (pinnedIndicator && !item.trigger.contains(pinnedIndicator)) return true;

    const menu = await openMemoryActionMenu(item.trigger);
    if (!menu) return null;

    const state = pinStateFromMenu(menu);
    await closeMemoryActionMenu(item.trigger, menu);
    return state;
  }

  async function setMemoryPinned(text, wantPinned = true) {
    const item = findMemoryRowByText(text);
    if (!item) return { ok: false, reason: "Memory is no longer visible." };

    const menu = await openMemoryActionMenu(item.trigger);
    if (!menu) {
      return { ok: false, reason: "The memory three-dot menu did not open." };
    }

    const currentState = pinStateFromMenu(menu);
    if (currentState === wantPinned) {
      await closeMemoryActionMenu(item.trigger, menu);
      return { ok: true, changed: false };
    }

    if (currentState === null) {
      await closeMemoryActionMenu(item.trigger, menu);
      return { ok: false, reason: "SpicyChat's Pin Memory state could not be read." };
    }

    const action = findVisiblePinMenuItem(menu, wantPinned);
    if (!action) {
      await closeMemoryActionMenu(item.trigger, menu);
      return { ok: false, reason: wantPinned ? "Pin Memory was not found." : "Unpin Memory was not found." };
    }

    const scrollState = captureMemoryScrollState();
    try { action.click(); } catch { DS.realClick?.(action); }

    await waitFor(() => !isVisible(menu) ? true : null, 1200, 40);

    // SpicyChat can re-render the memory row a little after the menu closes.
    // Give that native update time to settle instead of treating the first
    // stale menu state as a hard failure.
    const started = Date.now();
    let verified = null;
    let sawRow = false;
    while (Date.now() - started < 3800) {
      await DS.sleep?.(180);
      const current = findMemoryRowByText(text);
      if (!current) continue;
      sawRow = true;
      verified = await getMemoryPinnedState(current);
      // Opening the native three-dot menu can make React scroll the manager to
      // the checked row. Put the user back where they were after every probe,
      // not only after the whole verification loop finishes.
      restoreMemoryScrollState(scrollState);
      if (verified === wantPinned) {
        return { ok: true, changed: true };
      }
      await DS.sleep?.(120);
    }

    restoreMemoryScrollState(scrollState);
    if (!sawRow) return { ok: false, reason: "Memory disappeared while changing its pin state." };
    return {
      ok: false,
      reason: verified === null
        ? "SpicyChat did not expose the new pin state after clicking Pin Memory."
        : "SpicyChat did not apply the requested pin state."
    };
  }

  async function pinSelectedMemories() {
    if (deleting || checkingPins || pinningSelected || !selectedMemories.size) return;

    const targets = [...selectedMemories];
    pinningSelected = true;
    updateToolbar();

    let pinned = 0;
    let alreadyPinned = 0;

    try {
      for (let index = 0; index < targets.length; index++) {
        const text = targets[index];
        setStatus(`Pinning ${index + 1} of ${targets.length}...`);

        const result = await setMemoryPinned(text, true);
        if (!result.ok) {
          setStatus(`Stopped after ${pinned} pinned: ${result.reason}`, "error");
          return;
        }

        if (result.changed) pinned++;
        else alreadyPinned++;

        await DS.sleep?.(90);
      }

      if (pinned && alreadyPinned) {
        setStatus(`Pinned ${pinned}. ${alreadyPinned} ${alreadyPinned === 1 ? "was" : "were"} already pinned.`, "ok");
      } else if (pinned) {
        setStatus(`Pinned ${pinned} selected ${pinned === 1 ? "memory" : "memories"}.`, "ok");
      } else {
        setStatus(`All ${alreadyPinned} selected ${alreadyPinned === 1 ? "memory was" : "memories were"} already pinned.`, "ok");
      }
    } finally {
      pinningSelected = false;
      updateToolbar();
    }
  }

  async function selectOnlyUnpinnedMemories() {
    if (deleting || checkingPins) return;

    const manager = getManager();
    const rows = getMemoryRows(manager);
    if (!manager || !rows.length) return;

    checkingPins = true;
    selectedMemories.clear();
    updateToolbar(manager);

    let unpinned = 0;
    let unknown = 0;

    try {
      for (let index = 0; index < rows.length; index++) {
        const text = rows[index].text;
        const current = findMemoryRowByText(text);
        if (!current) continue;

        setStatus(`Checking pins ${index + 1} of ${rows.length}...`);
        const pinned = await getMemoryPinnedState(current);

        if (pinned === false) {
          selectedMemories.add(text);
          unpinned++;
        } else if (pinned === null) {
          unknown++;
        }

        updateToolbar(manager);
        await DS.sleep?.(55);
      }

      setStatus(
        unknown
          ? `Selected ${unpinned} unpinned. ${unknown} could not be checked.`
          : `Selected ${unpinned} unpinned ${unpinned === 1 ? "memory" : "memories"}.`,
        unknown ? "" : "ok"
      );
    } finally {
      checkingPins = false;
      updateToolbar(manager);
    }
  }

  function findMemoryRowByText(text) {
    return getMemoryRows().find(item => item.text === text) || null;
  }

  function findDeleteConfirmation(manager) {
    const dialogs = [...document.querySelectorAll("[role='dialog'], [role='alertdialog'], [aria-modal='true'], div.fixed")]
      .filter(dialog => dialog !== manager && !dialog.contains(manager) && isVisible(dialog));

    for (const dialog of dialogs.reverse()) {
      const text = DS.normalize?.(cleanText(dialog.textContent)) || cleanText(dialog.textContent).toLowerCase();
      if (!text.includes("delete") || (!text.includes("memory") && !text.includes("sure"))) continue;

      const buttons = [...dialog.querySelectorAll("button")].filter(isVisible);
      for (const button of buttons) {
        const label = DS.normalize?.(cleanText(button.textContent || button.getAttribute("aria-label"))) ||
          cleanText(button.textContent || button.getAttribute("aria-label")).toLowerCase();

        if (["delete", "delete memory", "yes delete", "yes, delete", "confirm"].includes(label)) {
          return button;
        }
      }
    }

    return null;
  }

  async function deleteOneMemory(text) {
    const manager = getManager();
    const item = findMemoryRowByText(text);
    if (!manager || !item) return { ok: false, reason: "Memory is no longer visible." };

    const menu = await openMemoryActionMenu(item.trigger);
    if (!menu) {
      return {
        ok: false,
        reason: "The memory three-dot menu did not open."
      };
    }

    const deleteItem = findVisibleDeleteMenuItem(menu);
    if (!deleteItem) {
      return {
        ok: false,
        reason: "The three-dot menu opened, but Delete Memory was not found."
      };
    }

    // Use one normal click for the React Aria menu item as well.
    try { deleteItem.click(); } catch { DS.realClick?.(deleteItem); }

    const confirmation = await waitFor(() => findDeleteConfirmation(manager), 900);
    if (confirmation) {
      DS.realClick?.(confirmation);
    }

    const gone = await waitFor(() => !findMemoryRowByText(text), 2600, 80);
    if (!gone) {
      return {
        ok: false,
        reason: confirmation
          ? "SpicyChat did not remove the memory after confirmation."
          : "SpicyChat may be showing a delete confirmation I don't recognize yet."
      };
    }

    return { ok: true };
  }

  async function deleteSelectedMemories() {
    if (deleting || !selectedMemories.size) return;

    const targets = [...selectedMemories];
    const confirmed = window.confirm(
      `Delete ${targets.length} selected ${targets.length === 1 ? "memory" : "memories"}?\n\n` +
      "QoL will use SpicyChat's own Delete Memory action one at a time. This cannot be undone."
    );

    if (!confirmed) return;

    deleting = true;
    updateToolbar();

    let deleted = 0;

    for (const text of targets) {
      setStatus(`Deleting ${deleted + 1} of ${targets.length}...`);
      const result = await deleteOneMemory(text);

      if (!result.ok) {
        setStatus(`Stopped after ${deleted} deleted: ${result.reason}`, "error");
        deleting = false;
        updateToolbar();
        return;
      }

      deleted++;
      selectedMemories.delete(text);
      await DS.sleep?.(180);
    }

    deleting = false;
    setStatus(`Deleted ${deleted} ${deleted === 1 ? "memory" : "memories"}.`, "ok");
    updateToolbar();
  }


  function findLoadMoreMemoriesButton(manager = getManager()) {
    if (!manager) return null;
    return [...manager.querySelectorAll("button")].find(button => {
      if (button.disabled || button.closest("#ds-memory-bulk-toolbar")) return false;
      const translated = button.querySelector("[data-translate-key='chat:modal.memories.cta.loadMore']");
      const text = cleanText(button.textContent).toLowerCase();
      return !!translated || text === "load more memories" || text.includes("load more memories");
    }) || null;
  }

  async function waitForMemoryLoadProgress(manager, beforeCount, oldButton) {
    for (let i = 0; i < 35; i++) {
      await DS.sleep?.(100);
      const currentManager = getManager() || manager;
      const count = getMemoryRows(currentManager).length;
      if (count > beforeCount) return true;
      const next = findLoadMoreMemoriesButton(currentManager);
      if (!next) return true;
      if (next !== oldButton && !next.disabled) return true;
    }
    return false;
  }

  async function loadAllMemories(manager = getManager()) {
    if (!manager || loadingMoreMemories) return 0;
    loadingMoreMemories = true;
    updateToolbar(manager);
    let batches = 0;
    let activeManager = manager;
    try {
      for (let i = 0; i < 100; i++) {
        activeManager = getManager() || activeManager;
        const button = findLoadMoreMemoriesButton(activeManager);
        if (!button) break;
        const before = getMemoryRows(activeManager).length;
        setStatus(`Loading more memories… ${before} loaded`);
        try { button.click(); } catch { DS.realClick?.(button); }
        batches++;
        const progressed = await waitForMemoryLoadProgress(activeManager, before, button);
        activeManager = getManager() || activeManager;
        for (const item of getMemoryRows(activeManager)) decorateMemoryRow(item);
        updateToolbar(activeManager);
        if (!progressed) break;
      }
      activeManager = getManager() || activeManager;
      const total = getMemoryRows(activeManager).length;
      setStatus(batches ? `Loaded all available memories (${total} shown).` : `${total} memories shown.`, "ok");
      return batches;
    } finally {
      loadingMoreMemories = false;
      updateToolbar(getManager() || activeManager);
    }
  }

  function captureMemoryScrollState(manager = getManager()) {
    const positions = [];
    const seen = new Set();
    let node = manager;
    for (let depth = 0; node && node !== document.documentElement && depth < 8; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement) || seen.has(node)) continue;
      seen.add(node);
      if (node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2) {
        positions.push({ node, top: node.scrollTop, left: node.scrollLeft });
      }
    }
    return {
      positions,
      windowX: window.scrollX,
      windowY: window.scrollY
    };
  }

  function restoreMemoryScrollState(state) {
    if (!state) return;
    for (const item of state.positions || []) {
      if (!item.node?.isConnected) continue;
      item.node.scrollTop = item.top;
      item.node.scrollLeft = item.left;
    }
    try {
      if (window.scrollX !== state.windowX || window.scrollY !== state.windowY) {
        window.scrollTo(state.windowX, state.windowY);
      }
    } catch {}
  }

  async function waitForVisibleMemoryOrder(target, timeoutMs = 3600) {
    const wanted = [...target];
    const started = Date.now();
    let last = [];
    while (Date.now() - started < timeoutMs) {
      last = visibleMemoryOrder(wanted);
      if (last.length === wanted.length && last.every((text, index) => text === wanted[index])) return last;
      await DS.sleep?.(180);
    }
    return last;
  }

  function visibleMemoryOrder(texts) {
    const wanted = new Set(texts || []);
    return getMemoryRows().map(item => item.text).filter(text => wanted.has(text));
  }

  function renderPinnedOrderEditor(manager = getManager()) {
    const panel = manager?.querySelector(".ds-memory-pinned-order");
    if (!panel) return;

    const previousListScroll = panel.querySelector(".ds-memory-pinned-order-list")?.scrollTop || 0;
    const scrollState = captureMemoryScrollState(manager);
    panel.replaceChildren();
    panel.hidden = false;

    const heading = document.createElement("div");
    heading.className = "ds-memory-pinned-order-head";
    heading.textContent = "Pinned memory order";
    panel.appendChild(heading);

    const note = document.createElement("div");
    note.className = "ds-memory-pinned-order-note";
    note.textContent = "Drag memories into place or use the arrows, then Apply order. QoL uses SpicyChat's own Unpin/Pin actions so the change is saved by SpicyChat rather than being display-only.";
    panel.appendChild(note);

    if (!pinnedOrderDraft.length) {
      const empty = document.createElement("div");
      empty.className = "ds-memory-pinned-order-note";
      empty.textContent = "No pinned memories were found.";
      panel.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "ds-memory-pinned-order-list";

      let draggingIndex = -1;
      pinnedOrderDraft.forEach((text, index) => {
        const row = document.createElement("div");
        row.className = "ds-memory-pinned-order-row";
        row.draggable = !applyingPinnedOrder;
        row.dataset.dsPinnedOrderIndex = String(index);

        const drag = document.createElement("span");
        drag.className = "ds-memory-pinned-order-drag";
        drag.textContent = "⋮⋮";
        drag.title = "Drag to reorder";
        drag.setAttribute("aria-hidden", "true");

        const label = document.createElement("span");
        label.className = "ds-memory-pinned-order-label";
        label.textContent = text;
        label.title = text;

        row.addEventListener("dragstart", event => {
          if (applyingPinnedOrder) {
            event.preventDefault();
            return;
          }
          draggingIndex = index;
          row.classList.add("is-dragging");
          try {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(index));
          } catch {}
        });
        row.addEventListener("dragover", event => {
          if (draggingIndex < 0 || applyingPinnedOrder) return;
          event.preventDefault();
          row.classList.add("is-drag-over");
          try { event.dataTransfer.dropEffect = "move"; } catch {}
        });
        row.addEventListener("dragleave", () => row.classList.remove("is-drag-over"));
        row.addEventListener("drop", event => {
          event.preventDefault();
          row.classList.remove("is-drag-over");
          let from = draggingIndex;
          try {
            const transferred = Number(event.dataTransfer.getData("text/plain"));
            if (Number.isInteger(transferred)) from = transferred;
          } catch {}
          const to = index;
          draggingIndex = -1;
          if (!Number.isInteger(from) || from < 0 || from >= pinnedOrderDraft.length || from === to) return;
          const [moved] = pinnedOrderDraft.splice(from, 1);
          pinnedOrderDraft.splice(to, 0, moved);
          renderPinnedOrderEditor(manager);
        });
        row.addEventListener("dragend", () => {
          draggingIndex = -1;
          list.querySelectorAll(".is-dragging,.is-drag-over").forEach(node => node.classList.remove("is-dragging", "is-drag-over"));
        });

        const controls = document.createElement("span");
        controls.className = "ds-memory-pinned-order-buttons";

        const up = document.createElement("button");
        up.type = "button";
        up.textContent = "↑";
        up.title = "Move up";
        up.disabled = index === 0 || applyingPinnedOrder;
        up.addEventListener("click", () => {
          [pinnedOrderDraft[index - 1], pinnedOrderDraft[index]] = [pinnedOrderDraft[index], pinnedOrderDraft[index - 1]];
          renderPinnedOrderEditor(manager);
        });

        const down = document.createElement("button");
        down.type = "button";
        down.textContent = "↓";
        down.title = "Move down";
        down.disabled = index === pinnedOrderDraft.length - 1 || applyingPinnedOrder;
        down.addEventListener("click", () => {
          [pinnedOrderDraft[index], pinnedOrderDraft[index + 1]] = [pinnedOrderDraft[index + 1], pinnedOrderDraft[index]];
          renderPinnedOrderEditor(manager);
        });

        controls.append(up, down);
        row.append(drag, label, controls);
        list.appendChild(row);
      });
      panel.appendChild(list);
    }

    const actions = document.createElement("div");
    actions.className = "ds-memory-pinned-order-actions";

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.textContent = "Rescan pinned";
    refresh.disabled = scanningPinnedOrder || applyingPinnedOrder;
    refresh.addEventListener("click", () => scanPinnedOrder(manager).catch(error => {
      scanningPinnedOrder = false;
      setStatus(`Pinned-memory scan failed: ${error?.message || error}`, "error");
      updateToolbar(manager);
    }));

    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = applyingPinnedOrder ? "Applying…" : "Apply order";
    apply.disabled = pinnedOrderDraft.length < 2 || scanningPinnedOrder || applyingPinnedOrder;
    apply.addEventListener("click", () => applyPinnedOrder(manager).catch(error => {
      applyingPinnedOrder = false;
      setStatus(`Pinned-memory reorder failed: ${error?.message || error}`, "error");
      updateToolbar(manager);
      renderPinnedOrderEditor(manager);
    }));

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.disabled = applyingPinnedOrder;
    close.addEventListener("click", () => {
      panel.hidden = true;
      panel.replaceChildren();
      pinnedOrderDraft = [];
      setStatus("");
    });

    actions.append(refresh, apply, close);
    panel.appendChild(actions);

    const nextList = panel.querySelector(".ds-memory-pinned-order-list");
    if (nextList) nextList.scrollTop = previousListScroll;
    restoreMemoryScrollState(scrollState);
  }

  async function scanPinnedOrder(manager = getManager()) {
    if (!manager || scanningPinnedOrder || applyingPinnedOrder) return;
    scanningPinnedOrder = true;
    pinnedOrderDraft = [];
    updateToolbar(manager);
    setStatus("Finding pinned memories…");

    try {
      if (findLoadMoreMemoriesButton(manager)) await loadAllMemories(manager);
      const rows = getMemoryRows(manager);
      const seen = new Set();
      const duplicates = new Set();
      const pinned = [];

      for (let index = 0; index < rows.length; index++) {
        const text = rows[index].text;
        if (seen.has(text)) duplicates.add(text);
        seen.add(text);
        setStatus(`Checking pinned memories ${index + 1} of ${rows.length}…`);
        const current = findMemoryRowByText(text);
        if (!current) continue;
        const state = await getMemoryPinnedState(current);
        if (state === true) pinned.push(text);
        await DS.sleep?.(45);
      }

      if (duplicates.size && pinned.some(text => duplicates.has(text))) {
        pinnedOrderDraft = [];
        setStatus("Pinned order cannot be changed safely while two visible memories have the same text.", "error");
      } else {
        pinnedOrderDraft = pinned;
        setStatus(pinned.length ? `Found ${pinned.length} pinned ${pinned.length === 1 ? "memory" : "memories"}.` : "No pinned memories found.", pinned.length ? "ok" : "");
      }
    } finally {
      scanningPinnedOrder = false;
      updateToolbar(manager);
      renderPinnedOrderEditor(manager);
    }
  }

  async function applyPinnedOrder(manager = getManager()) {
    if (!manager || applyingPinnedOrder || scanningPinnedOrder || pinnedOrderDraft.length < 2) return;
    const target = [...pinnedOrderDraft];
    const confirmed = window.confirm(
      `Reorder ${target.length} pinned memories?\n\n` +
      "QoL will temporarily unpin and re-pin them using SpicyChat's own memory menu, then verify the visible order."
    );
    if (!confirmed) return;

    applyingPinnedOrder = true;
    updateToolbar(manager);
    renderPinnedOrderEditor(manager);

    const repinAll = async sequence => {
      for (let i = 0; i < sequence.length; i++) {
        setStatus(`Re-pinning ${i + 1} of ${sequence.length}…`);
        const result = await setMemoryPinned(sequence[i], true);
        if (!result.ok) throw new Error(result.reason || "SpicyChat did not pin the memory.");
        await DS.sleep?.(90);
      }
    };

    try {
      for (let i = 0; i < target.length; i++) {
        setStatus(`Preparing pinned order ${i + 1} of ${target.length}…`);
        const result = await setMemoryPinned(target[i], false);
        if (!result.ok) throw new Error(result.reason || "SpicyChat did not unpin the memory.");
        await DS.sleep?.(90);
      }

      // Detect whether SpicyChat places newly pinned memories at the top or bottom.
      await repinAll(target.slice(0, 2));
      const probe = await waitForVisibleMemoryOrder(target.slice(0, 2), 3200);

      if (probe[0] === target[0] && probe[1] === target[1]) {
        await repinAll(target.slice(2));
      } else if (probe[0] === target[1] && probe[1] === target[0]) {
        // New pins are inserted above older pins. Start again in reverse order.
        for (const text of target.slice(0, 2)) {
          const result = await setMemoryPinned(text, false);
          if (!result.ok) throw new Error(result.reason || "SpicyChat did not reset the pin-order probe.");
          await DS.sleep?.(80);
        }
        await repinAll([...target].reverse());
      } else {
        // Could not infer ordering, but leave every memory pinned before reporting it.
        await repinAll(target.slice(2));
        throw new Error("SpicyChat kept its own pinned display order, so QoL could not verify a different order.");
      }

      const finalOrder = await waitForVisibleMemoryOrder(target, 4200);
      const exact = finalOrder.length === target.length && finalOrder.every((text, index) => text === target[index]);
      pinnedOrderDraft = exact ? finalOrder : target;
      setStatus(
        exact
          ? `Pinned memory order updated (${target.length}).`
          : "All memories were re-pinned, but SpicyChat did not expose the requested order in the list.",
        exact ? "ok" : "error"
      );
    } catch (error) {
      // Never leave a reorder attempt with previously pinned memories accidentally unpinned.
      setStatus("Reorder hit a problem; restoring pinned memories…");
      for (const text of target) {
        try {
          const current = findMemoryRowByText(text);
          const state = current ? await getMemoryPinnedState(current) : null;
          if (state === false) await setMemoryPinned(text, true);
        } catch {}
      }
      throw error;
    } finally {
      applyingPinnedOrder = false;
      updateToolbar(manager);
      renderPinnedOrderEditor(manager);
    }
  }

  async function openPinnedOrderEditor(manager = getManager()) {
    const panel = manager?.querySelector(".ds-memory-pinned-order");
    if (!panel) return;
    if (!panel.hidden) {
      panel.hidden = true;
      panel.replaceChildren();
      pinnedOrderDraft = [];
      setStatus("");
      return;
    }
    await scanPinnedOrder(manager);
  }

  async function keepSelectedInContextKeeper() {
    if (!selectedMemories.size || !DS.state?.settings?.enableContextKeeper) return;
    if (typeof DS.addContextKeeperDetails !== "function") {
      setStatus("Context Keeper is not ready yet.", "error");
      return;
    }
    const result = await DS.addContextKeeperDetails([...selectedMemories], { source: "memory" });
    const added = Number(result?.added || 0);
    const skipped = Number(result?.skipped || 0);
    setStatus(`Kept ${added} ${added === 1 ? "memory" : "memories"}${skipped ? `; ${skipped} already saved/similar` : ""}.`, "ok");
  }

  function memoryRouteMeta() {
    const path = String(location.pathname || "");
    const match = path.match(/^\/chat\/([^/?#]+)(?:\/([^/?#]+))?/i);
    return {
      path,
      botId: match?.[1] || "",
      conversationId: match?.[2] || ""
    };
  }

  function looksLikeBrandNewChat() {
    const route = memoryRouteMeta();
    if (!route.botId) return false;
    const roots = [...document.querySelectorAll("div[id^='message-']")]
      .filter(root => !root.parentElement?.closest?.("div[id^='message-']"));
    // Fresh chats normally contain only the greeting. Keep this intentionally
    // conservative so an old/loaded chat never gets new-chat instructions.
    return !route.conversationId || roots.length <= 1;
  }

  function newChatMemoryImportHelp() {
    return "This looks like a brand-new chat. SpicyChat may not create the conversation record until the greeting has been saved once. Edit the greeting, press Save without changing it, then reopen Memories and retry the import.";
  }

  function rowPinnedHint(item) {
    if (!item?.row) return null;
    const explicit = item.row.querySelector(
      '[aria-label="Pinned" i], [title="Pinned" i], [data-testid*="pinned" i], svg.lucide-pin:not(.lucide-pin-off)'
    );
    return explicit && !item.trigger?.contains(explicit) ? true : null;
  }

  function saveJsonFile(payload, filename) {
    const text = JSON.stringify(payload, null, 2);
    if (typeof DS.downloadTextFile === "function") {
      return DS.downloadTextFile(text, filename, "application/json;charset=utf-8", { requestPermission: true });
    }
  }

  async function exportMemories({ selectedOnly = false } = {}) {
    let manager = getManager();
    if (!manager) return;
    if (!selectedOnly && findLoadMoreMemoriesButton(manager)) {
      setStatus("Loading all memories before export…");
      await loadAllMemories(manager);
      manager = getManager() || manager;
    }

    const rows = getMemoryRows(manager);
    const wanted = selectedOnly
      ? rows.filter(item => selectedMemories.has(item.text))
      : rows;
    if (!wanted.length) {
      setStatus(selectedOnly ? "Select at least one memory first." : "No memories are available to export.", "error");
      return;
    }

    const route = memoryRouteMeta();
    const memories = wanted.map((item, index) => ({
      text: item.rawText || item.text,
      order: index,
      pinned: rowPinnedHint(item)
    }));
    const payload = {
      format: "spicychat-qol-memories",
      version: 1,
      exportedAt: new Date().toISOString(),
      source: route,
      count: memories.length,
      memories
    };
    saveJsonFile(payload, `spicychat-memories-${route.conversationId || route.botId || "chat"}-${Date.now()}.json`);
    setStatus(`Exported ${memories.length} ${memories.length === 1 ? "memory" : "memories"}.`, "ok");
  }

  function normalizeImportPayload(raw) {
    let rows = [];
    if (Array.isArray(raw)) rows = raw;
    else if (Array.isArray(raw?.memories)) rows = raw.memories;
    else if (Array.isArray(raw?.entries)) rows = raw.entries;
    else throw new Error("This JSON file does not contain a memories list.");

    const seen = new Set();
    const memories = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const text = cleanText(typeof row === "string" ? row : (row?.text ?? row?.content ?? row?.memory));
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      memories.push({
        text,
        order: Number.isFinite(Number(row?.order)) ? Number(row.order) : index,
        pinned: row?.pinned === true
      });
      if (memories.length >= 1000) break;
    }
    if (!memories.length) throw new Error("No usable memories were found in this file.");
    return memories;
  }

  function nodeTranslationKey(node) {
    if (!node) return "";
    return String(
      node.getAttribute?.("data-translate-key") ||
      node.querySelector?.("[data-translate-key]")?.getAttribute?.("data-translate-key") ||
      ""
    );
  }

  function isMemoryImportOwnedNode(node) {
    return !!node?.closest?.("#ds-memory-bulk-toolbar, #ds-memory-import-preview");
  }

  function memoryCreateFields(root) {
    if (!root) return [];
    return [...root.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')]
      .filter(field => isVisible(field) && !isMemoryImportOwnedNode(field));
  }

  function isNativeMemoryCreateField(field) {
    if (!field) return false;
    const key = nodeTranslationKey(field).toLowerCase();
    const placeholder = cleanText(field.getAttribute?.("placeholder")).toLowerCase();
    const aria = cleanText(field.getAttribute?.("aria-label")).toLowerCase();
    return key.includes("chat:modal.memories.addmemoryinput") ||
      /add (?:a )?new memory/.test(placeholder) ||
      /add (?:a )?new memory/.test(aria);
  }

  function findNativeMemorySubmitButton(field, manager = getManager()) {
    if (!field) return null;
    const roots = [];
    let node = field.closest?.("form") || field.parentElement;
    while (node && node !== document.body) {
      roots.push(node);
      if (node === manager) break;
      node = node.parentElement;
      if (roots.length >= 6) break;
    }
    if (manager && !roots.includes(manager)) roots.push(manager);

    for (const root of roots) {
      const buttons = [...root.querySelectorAll?.("button") || []]
        .filter(button => isVisible(button) && !isMemoryImportOwnedNode(button));
      const translated = buttons.find(button => nodeTranslationKey(button).toLowerCase() === "chat:modal.memories.cta.add");
      if (translated) return translated;
      const exact = buttons.find(button => {
        const text = cleanText(button.textContent).toLowerCase();
        const aria = cleanText(button.getAttribute("aria-label")).toLowerCase();
        const testId = cleanText(button.getAttribute("data-testid")).toLowerCase();
        return text === "add" || text === "add memory" ||
          aria === "add" || aria === "add memory" ||
          (testId.includes("memory") && testId.includes("add"));
      });
      if (exact) return exact;
    }
    return null;
  }

  function inlineMemoryCreateEditor(manager = getManager()) {
    if (!manager) return null;
    const fields = memoryCreateFields(manager);
    const field = fields.find(isNativeMemoryCreateField);
    if (!field) return null;
    const save = findNativeMemorySubmitButton(field, manager);
    return save ? { root: manager, field, save, inline: true } : null;
  }

  function visibleMemoryCreateEditor() {
    const manager = getManager();
    const inline = inlineMemoryCreateEditor(manager);
    if (inline) return inline;

    const roots = [...document.querySelectorAll('[role="dialog"], [data-slot="dialog"], [aria-modal="true"], form')].filter(isVisible);
    for (const root of roots.reverse()) {
      if (root.closest?.("#ds-memory-import-preview")) continue;
      const field = memoryCreateFields(root).find(node => {
        if (isNativeMemoryCreateField(node)) return true;
        const placeholder = cleanText(node.getAttribute?.("placeholder")).toLowerCase();
        const text = cleanText(root.textContent).toLowerCase();
        return placeholder.includes("memory") || text.includes("memory");
      });
      if (!field) continue;
      const buttons = [...root.querySelectorAll("button")].filter(button => isVisible(button) && !isMemoryImportOwnedNode(button));
      const save = buttons.find(button => {
        const key = nodeTranslationKey(button).toLowerCase();
        const text = cleanText(button.textContent).toLowerCase();
        return key === "chat:modal.memories.cta.add" ||
          /^(save|add|create|update)( memory)?$/.test(text);
      });
      if (save) return { root, field, save, inline: false };
    }
    return null;
  }

  function findAddMemoryButton(manager = getManager()) {
    if (!manager) return null;
    const buttons = [...manager.querySelectorAll("button")].filter(button => isVisible(button) && !button.disabled && !isMemoryImportOwnedNode(button));
    const exact = buttons.find(button => {
      const translated = nodeTranslationKey(button);
      const text = cleanText(button.textContent).toLowerCase();
      const aria = cleanText(button.getAttribute("aria-label")).toLowerCase();
      const testId = cleanText(button.getAttribute("data-testid")).toLowerCase();
      return translated === "chat:modal.memories.dropdown.addNew" ||
        /memories?.*(?:add|create|new)|(?:add|create|new).*memories?/i.test(translated) ||
        /memories?\.(?:cta\.)?(?:add|create|new)/i.test(translated) ||
        /^(?:add|create|new)(?: new)? memory$/.test(text) ||
        text === "add new memory" ||
        /(?:add|create|new).*memory|memory.*(?:add|create|new)/.test(aria) ||
        (testId.includes("memory") && /add|create|new/.test(testId));
    });
    if (exact) return exact;

    // Last-resort UI fallback for builds that render the Add Memory control as
    // an icon-only + button inside the Memories manager. Restrict this to a
    // single visible plus button so QoL never guesses between several actions.
    const plusButtons = buttons.filter(button => !!button.querySelector("svg.lucide-plus, svg[class*='lucide-plus']"));
    return plusButtons.length === 1 ? plusButtons[0] : null;
  }

  function findVisibleAddNewMemoryMenuItem() {
    const translated = [...document.querySelectorAll('[data-translate-key="chat:modal.memories.dropdown.addNew"]')]
      .map(node => node.closest?.("[role='menuitem']") || node.closest?.("button") || node)
      .find(isVisible);
    if (translated) return translated;

    return [...document.querySelectorAll("[role='menuitem'], [role='option'], [data-slot='menu-item'], button")]
      .filter(node => isVisible(node) && !isMemoryImportOwnedNode(node))
      .find(node => {
        const text = cleanText(node.textContent).toLowerCase();
        const aria = cleanText(node.getAttribute?.("aria-label")).toLowerCase();
        return text === "add new memory" || aria === "add new memory";
      }) || null;
  }

  function findMemoryManagerMenuTrigger(manager = getManager()) {
    if (!manager) return null;
    const candidates = [...manager.querySelectorAll("button[data-slot='trigger'][aria-haspopup='true'], button[aria-haspopup='menu']")]
      .filter(trigger => isVisible(trigger) && !trigger.disabled && !isMemoryImportOwnedNode(trigger) && !memoryRowFromTrigger(trigger, manager));
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];

    const scored = candidates.map(trigger => {
      const aria = cleanText(trigger.getAttribute("aria-label")).toLowerCase();
      const testId = cleanText(trigger.getAttribute("data-testid")).toLowerCase();
      const parentText = cleanText(trigger.parentElement?.parentElement?.textContent).toLowerCase();
      let score = 0;
      if (/memory|option|more/.test(aria)) score += 5;
      if (/memory|option|more/.test(testId)) score += 4;
      if (parentText.includes("memories")) score += 3;
      if (trigger.querySelector("svg.lucide-ellipsis-vertical, svg[class*='ellipsis']")) score += 2;
      return { trigger, score };
    }).sort((a, b) => b.score - a.score);

    return scored[0]?.score > 0 ? scored[0].trigger : null;
  }

  async function openMemoryCreateEditor(manager = getManager()) {
    if (!manager) return null;

    let editor = visibleMemoryCreateEditor();
    if (editor) return editor;

    const directButton = findAddMemoryButton(manager);
    if (directButton) {
      try { directButton.click(); } catch { DS.realClick?.(directButton); }
      editor = await waitFor(visibleMemoryCreateEditor, 2600, 45);
      if (editor) return editor;
    }

    let menuItem = findVisibleAddNewMemoryMenuItem();
    if (!menuItem) {
      const trigger = findMemoryManagerMenuTrigger(manager);
      if (trigger) {
        try { trigger.click(); } catch { DS.realClick?.(trigger); }
        menuItem = await waitFor(findVisibleAddNewMemoryMenuItem, 1800, 45);
      }
    }

    if (menuItem) {
      try { menuItem.click(); } catch { DS.realClick?.(menuItem); }
      editor = await waitFor(visibleMemoryCreateEditor, 2800, 45);
      if (editor) return editor;
    }

    return null;
  }

  function setMemoryEditorValue(field, value) {
    if (!field) return;
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(field, value); else field.value = value;
      try { field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value })); }
      catch { field.dispatchEvent(new Event("input", { bubbles: true })); }
      field.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      field.textContent = value;
      try { field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value })); }
      catch { field.dispatchEvent(new Event("input", { bubbles: true })); }
    }
  }

  function countMemoryRowsByText(text, manager = getManager()) {
    const wanted = cleanText(text);
    if (!wanted || !manager) return 0;
    return getMemoryRows(manager).filter(item => item.text === wanted).length;
  }

  async function createNativeMemory(text) {
    const wanted = cleanText(text);
    const manager = getManager();
    if (!manager) return { ok: false, reason: "The SpicyChat Memories manager is not open." };
    if (!wanted) return { ok: false, reason: "The memory is empty." };

    const beforeCount = countMemoryRowsByText(wanted, manager);
    const editor = await openMemoryCreateEditor(manager);
    if (!editor) {
      return {
        ok: false,
        reason: looksLikeBrandNewChat()
          ? newChatMemoryImportHelp()
          : "QoL could not open SpicyChat's Add New Memory control. Close and reopen Memories, then try the import again."
      };
    }

    setMemoryEditorValue(editor.field, wanted);
    const save = await waitFor(() => {
      const candidate = editor.save?.isConnected ? editor.save : findNativeMemorySubmitButton(editor.field, getManager());
      return candidate && isVisible(candidate) && !candidate.disabled ? candidate : null;
    }, 1800, 45);
    if (!save) return {
      ok: false,
      reason: looksLikeBrandNewChat() ? newChatMemoryImportHelp() : "SpicyChat's Add button did not become available."
    };

    await DS.sleep?.(50);
    try { save.click(); } catch { DS.realClick?.(save); }

    const created = await waitFor(() => {
      const currentManager = getManager();
      if (!currentManager) return null;
      const count = countMemoryRowsByText(wanted, currentManager);
      if (count > beforeCount) return true;
      return null;
    }, 6500, 75);

    if (!created) {
      // One final scan handles a late React render without ever clicking Add a
      // second time, which could create a duplicate if the first request won.
      await DS.sleep?.(250);
      if (countMemoryRowsByText(wanted, getManager()) <= beforeCount) {
        return {
          ok: false,
          reason: looksLikeBrandNewChat() ? newChatMemoryImportHelp() : "SpicyChat did not confirm the new memory."
        };
      }
    }

    await DS.sleep?.(140);
    return { ok: true };
  }

  function closeMemoryImportPreview() {
    document.getElementById("ds-memory-import-preview")?.remove();
  }

  async function importMemoryRows(rows, { allowDuplicates = false } = {}) {
    if (importingMemories) return;
    let manager = getManager();
    if (!manager) return;
    importingMemories = true;
    updateToolbar(manager);
    let imported = 0;
    let skipped = 0;
    try {
      if (findLoadMoreMemoriesButton(manager)) {
        await loadAllMemories(manager);
        manager = getManager() || manager;
      }
      const existing = new Set(getMemoryRows(manager).map(item => item.text.toLowerCase()));
      // New memories normally appear at the top of SpicyChat's list. Import from
      // the end first so the visible relative order stays as close as possible
      // to the source file without reusing source chat IDs.
      const ordered = [...rows].sort((a, b) => Number(b.order || 0) - Number(a.order || 0));
      for (let index = 0; index < ordered.length; index += 1) {
        const row = ordered[index];
        const key = cleanText(row.text).toLowerCase();
        if (!key || (!allowDuplicates && existing.has(key))) { skipped += 1; continue; }
        setStatus(`Importing memory ${index + 1} of ${ordered.length}…`);
        const result = await createNativeMemory(row.text);
        if (!result.ok) throw new Error(result.reason || "Memory import failed.");
        existing.add(key);
        imported += 1;
        if (row.pinned) {
          const pin = await setMemoryPinned(cleanText(row.text), true);
          if (!pin.ok) setStatus(`Imported ${imported}; pin state could not be restored for one memory.`, "error");
        }
        await DS.sleep?.(100);
      }
      setStatus(`Imported ${imported} ${imported === 1 ? "memory" : "memories"}${skipped ? `; skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : ""}.`, "ok");
      closeMemoryImportPreview();
    } catch (error) {
      setStatus(`Import stopped after ${imported}: ${error?.message || error} You can retry; memories already added will be skipped by default.`, "error");
    } finally {
      importingMemories = false;
      updateToolbar(getManager() || manager);
    }
  }

  function showMemoryImportPreview(memories, filename = "") {
    closeMemoryImportPreview();
    const manager = getManager();
    if (!manager) return;
    const existing = new Set(getMemoryRows(manager).map(item => item.text.toLowerCase()));

    const overlay = document.createElement("div");
    overlay.id = "ds-memory-import-preview";
    overlay.className = "ds-memory-import-preview";
    const panel = document.createElement("div");
    panel.className = "ds-memory-import-panel";
    const head = document.createElement("div");
    head.className = "ds-memory-import-head";
    const title = document.createElement("strong");
    title.textContent = `Import memories${filename ? ` — ${filename}` : ""}`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", closeMemoryImportPreview);
    head.append(title, close);

    const note = document.createElement("p");
    note.textContent = looksLikeBrandNewChat()
      ? "Choose which memories to add. Exact duplicates are unchecked by default. If this brand-new chat has not been created by SpicyChat yet, QoL will tell you exactly what to do instead of failing with a generic Add Memory error."
      : "Choose which memories to add to this chat. Exact duplicates are unchecked by default. Source chat IDs are never reused.";
    const list = document.createElement("div");
    list.className = "ds-memory-import-list";
    memories.forEach((memory, index) => {
      const duplicate = existing.has(memory.text.toLowerCase());
      const label = document.createElement("label");
      label.className = "ds-memory-import-row";
      label.dataset.duplicate = duplicate ? "1" : "0";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !duplicate;
      box.dataset.index = String(index);
      const text = document.createElement("span");
      text.textContent = memory.text;
      const meta = document.createElement("small");
      meta.textContent = duplicate ? "Duplicate — skipped by default" : (memory.pinned ? "Pinned in source" : "Ready to import");
      label.append(box, text, meta);
      list.appendChild(label);
    });

    const actions = document.createElement("div");
    actions.className = "ds-memory-import-actions";
    const selectNew = document.createElement("button");
    selectNew.type = "button";
    selectNew.textContent = "Select non-duplicates";
    selectNew.addEventListener("click", () => list.querySelectorAll(".ds-memory-import-row").forEach(row => { row.querySelector("input").checked = row.dataset.duplicate !== "1"; }));
    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.textContent = "Select all";
    selectAll.addEventListener("click", () => list.querySelectorAll("input[type='checkbox']").forEach(box => { box.checked = true; }));
    const duplicateLabel = document.createElement("label");
    duplicateLabel.className = "ds-memory-import-duplicates";
    const duplicateToggle = document.createElement("input");
    duplicateToggle.type = "checkbox";
    const duplicateText = document.createElement("span");
    duplicateText.textContent = "Import exact duplicates too";
    duplicateLabel.append(duplicateToggle, duplicateText);
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Import selected";
    apply.addEventListener("click", () => {
      const chosen = [...list.querySelectorAll("input[type='checkbox']:checked")]
        .map(box => memories[Number(box.dataset.index)])
        .filter(Boolean);
      if (!chosen.length) return setStatus("Select at least one memory to import.", "error");
      importMemoryRows(chosen, { allowDuplicates: duplicateToggle.checked });
    });
    actions.append(selectNew, selectAll, duplicateLabel, apply);
    panel.append(head, note, list, actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function chooseMemoryImportFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const memories = normalizeImportPayload(parsed);
        showMemoryImportPreview(memories, file.name);
      } catch (error) {
        setStatus(`Could not read memory JSON: ${error?.message || error}`, "error");
      }
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }

  function makeToolbar(manager) {
    const toolbar = document.createElement("div");
    toolbar.id = "ds-memory-bulk-toolbar";
    toolbar.className = "ds-memory-bulk-toolbar";
    DS.setSafeMarkup(toolbar, `
      <div class="ds-memory-bulk-actions">
        <button type="button" class="ds-memory-select-all">Select all</button>
        <button type="button" class="ds-memory-select-unpinned">Select unpinned</button>
        <button type="button" class="ds-memory-invert">Invert</button>
        <button type="button" class="ds-memory-clear">Clear</button>
        <button type="button" class="ds-memory-pin-selected" disabled>Pin selected</button>
        <button type="button" class="ds-memory-keep-selected" disabled>Keep selected</button>
        <button type="button" class="ds-memory-load-all">Load all memories</button>
        <button type="button" class="ds-memory-export-all">Export all</button>
        <button type="button" class="ds-memory-export-selected" disabled>Export selected</button>
        <button type="button" class="ds-memory-import-json">Import JSON</button>
        <button type="button" class="ds-memory-reorder-pinned">Reorder pinned</button>
        <button type="button" class="ds-memory-delete-selected" disabled>Delete selected</button>
      </div>
      <div class="ds-memory-bulk-meta">
        <span class="ds-memory-selected-count">0 selected</span>
        <span class="ds-memory-bulk-status" aria-live="polite"></span>
      </div>
      <div class="ds-memory-pinned-order" hidden></div>
    `);

    toolbar.querySelector(".ds-memory-select-all")?.addEventListener("click", () => {
      selectedMemories = new Set(getMemoryRows(manager).map(item => item.text));
      updateToolbar(manager);
    });

    toolbar.querySelector(".ds-memory-select-unpinned")?.addEventListener("click", () => {
      selectOnlyUnpinnedMemories().catch(error => {
        checkingPins = false;
        setStatus(`Pin check failed: ${error?.message || error}`, "error");
        updateToolbar(manager);
      });
    });

    toolbar.querySelector(".ds-memory-invert")?.addEventListener("click", () => {
      const next = new Set();
      for (const item of getMemoryRows(manager)) {
        if (!selectedMemories.has(item.text)) next.add(item.text);
      }
      selectedMemories = next;
      updateToolbar(manager);
    });

    toolbar.querySelector(".ds-memory-clear")?.addEventListener("click", () => {
      selectedMemories.clear();
      setStatus("");
      updateToolbar(manager);
    });

    toolbar.querySelector(".ds-memory-pin-selected")?.addEventListener("click", () => {
      pinSelectedMemories().catch(error => {
        pinningSelected = false;
        setStatus(`Pinning failed: ${error?.message || error}`, "error");
        updateToolbar(manager);
      });
    });

    toolbar.querySelector(".ds-memory-keep-selected")?.addEventListener("click", () => {
      keepSelectedInContextKeeper().catch(error => {
        setStatus(`Context Keeper failed: ${error?.message || error}`, "error");
        updateToolbar(manager);
      });
    });

    toolbar.querySelector(".ds-memory-load-all")?.addEventListener("click", () => {
      loadAllMemories(manager).catch(error => {
        loadingMoreMemories = false;
        setStatus(`Memory loading failed: ${error?.message || error}`, "error");
        updateToolbar(manager);
      });
    });

    toolbar.querySelector(".ds-memory-export-all")?.addEventListener("click", () => {
      exportMemories({ selectedOnly: false }).catch(error => setStatus(`Export failed: ${error?.message || error}`, "error"));
    });

    toolbar.querySelector(".ds-memory-export-selected")?.addEventListener("click", () => {
      exportMemories({ selectedOnly: true }).catch(error => setStatus(`Export failed: ${error?.message || error}`, "error"));
    });

    toolbar.querySelector(".ds-memory-import-json")?.addEventListener("click", chooseMemoryImportFile);

    toolbar.querySelector(".ds-memory-reorder-pinned")?.addEventListener("click", () => {
      openPinnedOrderEditor(manager).catch(error => {
        scanningPinnedOrder = false;
        applyingPinnedOrder = false;
        setStatus(`Pinned-memory order failed: ${error?.message || error}`, "error");
        updateToolbar(manager);
      });
    });

    toolbar.querySelector(".ds-memory-delete-selected")?.addEventListener("click", () => {
      deleteSelectedMemories().catch(error => {
        deleting = false;
        setStatus(`Delete failed: ${error?.message || error}`, "error");
        updateToolbar(manager);
      });
    });

    const scrollArea = manager.querySelector(".overflow-y-auto") || manager.querySelector("div[class*='overflow-y-auto']");
    if (!scrollArea) return null;

    const nativeToolbar = scrollArea.firstElementChild;
    if (nativeToolbar) nativeToolbar.insertAdjacentElement("afterend", toolbar);
    else scrollArea.prepend(toolbar);

    return toolbar;
  }


  async function copyTextToClipboard(text) {
    const value = String(text || "").trim();
    if (!value) return false;

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}

    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      area.style.pointerEvents = "none";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  function expandedMemoryItem(manager = getManager()) {
    if (!manager) return null;

    const rows = getMemoryRows(manager);
    return rows.find(item => item.trigger?.getAttribute("aria-expanded") === "true") ||
      rows.find(item => item.trigger === lastMemoryMenuTrigger) ||
      null;
  }

  function stripClonedIds(root) {
    if (!root) return;
    root.removeAttribute?.("id");
    root.removeAttribute?.("aria-labelledby");
    root.removeAttribute?.("data-key");
    root.removeAttribute?.("data-collection");
    root.removeAttribute?.("data-react-aria-pressable");
    for (const el of root.querySelectorAll?.("[id], [aria-labelledby], [data-key], [data-collection]") || []) {
      el.removeAttribute("id");
      el.removeAttribute("aria-labelledby");
      el.removeAttribute("data-key");
      el.removeAttribute("data-collection");
      el.removeAttribute("data-react-aria-pressable");
    }
  }

  function decorateCopyMemoryAction() {
    const settings = DS.state?.settings || {};
    const manager = getManager();

    document.querySelectorAll(".ds-memory-copy-menuitem").forEach(item => {
      if (!settings.enabled || !settings.showCopyMemoryAction || !manager || !isVisible(item.closest("[role='menu'], [aria-label='memory options']"))) {
        item.remove();
      }
    });

    if (!settings.enabled || !settings.showCopyMemoryAction || !manager) return;

    const memory = expandedMemoryItem(manager);
    if (!memory?.rawText) return;

    const menus = getVisibleMemoryActionMenus();
    const menu = menus.length ? menus[menus.length - 1] : null;
    if (!menu) return;

    let copyItem = menu.querySelector(".ds-memory-copy-menuitem");
    if (copyItem) {
      copyItem.dataset.dsMemoryCopyText = memory.rawText;
      return;
    }

    const nativeItem = [...menu.querySelectorAll("[role='menuitem']")].find(isVisible);
    if (!nativeItem) return;

    copyItem = nativeItem.cloneNode(true);
    stripClonedIds(copyItem);
    copyItem.classList.add("ds-memory-copy-menuitem");
    copyItem.dataset.dsMemoryCopyText = memory.rawText;
    copyItem.setAttribute("role", "menuitem");
    copyItem.setAttribute("tabindex", "-1");

    const label = copyItem.querySelector("[data-translate-key]") ||
      copyItem.querySelector("span span") ||
      copyItem.querySelector("span");
    if (label) {
      label.removeAttribute?.("data-translate-key");
      label.textContent = "Copy Memory";
    } else {
      copyItem.textContent = "Copy Memory";
    }

    const svg = copyItem.querySelector("svg");
    if (svg) {
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "18");
      svg.setAttribute("height", "18");
      DS.setSafeSvgMarkup(svg, '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>');
    }

    copyItem.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      const ok = await copyTextToClipboard(copyItem.dataset.dsMemoryCopyText || "");
      if (ok) {
        setStatus("Memory copied.", "ok");
        DS.setQuickStatus?.("Memory copied.");
      } else {
        setStatus("Could not copy memory to the clipboard.", "error");
        DS.setQuickStatus?.("Could not copy memory.");
      }

      const trigger = lastMemoryMenuTrigger;
      if (trigger?.getAttribute("aria-expanded") === "true") {
        try { trigger.click(); } catch {}
      } else {
        try {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
        } catch {}
      }
    });

    nativeItem.parentElement?.appendChild(copyItem);
  }

  document.addEventListener("pointerdown", event => {
    const trigger = event.target?.closest?.("button[data-slot='trigger'][aria-haspopup='true']");
    const manager = getManager();
    if (!trigger || !manager || !manager.contains(trigger)) return;

    lastMemoryMenuTrigger = trigger;
    setTimeout(() => decorateCopyMemoryAction(), 40);
    setTimeout(() => decorateCopyMemoryAction(), 140);
  }, true);

  function cleanup() {
    document.querySelectorAll("#ds-memory-bulk-toolbar").forEach(el => el.remove());
    document.querySelectorAll(".ds-memory-select-control").forEach(el => el.remove());
    document.querySelectorAll(".ds-memory-row").forEach(row => {
      row.classList.remove("ds-memory-row", "ds-memory-selected");
      delete row.dataset.dsMemoryText;
    });
    selectedMemories.clear();
    deleting = false;
    checkingPins = false;
    pinningSelected = false;
    loadingMoreMemories = false;
    scanningPinnedOrder = false;
    applyingPinnedOrder = false;
    importingMemories = false;
    pinnedOrderDraft = [];
    closeMemoryImportPreview();
    lastManager = null;
    lastMemoryMenuTrigger = null;
    document.querySelectorAll(".ds-memory-copy-menuitem").forEach(el => el.remove());
  }

  DS.applyMemoryManagerTools = function applyMemoryManagerTools() {
    const settings = DS.state?.settings || {};
    const manager = getManager();
    const bulkEnabled = !!(settings.enabled && settings.enableBulkMemoryManager && manager);
    const copyEnabled = !!(settings.enabled && settings.showCopyMemoryAction && manager);
    const autoLoadEnabled = !!(settings.enabled && settings.memoryAutoLoadAll && manager);

    if (!bulkEnabled) {
      document.querySelectorAll("#ds-memory-bulk-toolbar").forEach(el => el.remove());
      document.querySelectorAll(".ds-memory-select-control").forEach(el => el.remove());
      document.querySelectorAll(".ds-memory-row").forEach(row => {
        row.classList.remove("ds-memory-row", "ds-memory-selected");
        delete row.dataset.dsMemoryText;
      });
      selectedMemories.clear();
      deleting = false;
      checkingPins = false;
      pinningSelected = false;
      if (!autoLoadEnabled) loadingMoreMemories = false;
    }

    if (!copyEnabled) {
      document.querySelectorAll(".ds-memory-copy-menuitem").forEach(el => el.remove());
      lastMemoryMenuTrigger = null;
    }

    if (!bulkEnabled && !copyEnabled && !autoLoadEnabled) {
      lastManager = null;
      return;
    }

    if (lastManager && lastManager !== manager) {
      selectedMemories.clear();
    }
    lastManager = manager;

    if (bulkEnabled) {
      if (!manager.querySelector("#ds-memory-bulk-toolbar")) {
        makeToolbar(manager);
      }

      for (const item of getMemoryRows(manager)) {
        decorateMemoryRow(item);
      }

      updateToolbar(manager);
    }

    if (autoLoadEnabled && !autoLoadedManagers.has(manager)) {
      autoLoadedManagers.add(manager);
      setTimeout(() => {
        loadAllMemories(manager).catch(error => {
          loadingMoreMemories = false;
          setStatus(`Memory auto-load failed: ${error?.message || error}`, "error");
          updateToolbar(manager);
        });
      }, 80);
    }

    if (copyEnabled) decorateCopyMemoryAction();
  };
})();
