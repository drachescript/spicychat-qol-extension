(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const normalize = value => String(value || "").replace(/\s+/g, " ").trim();
  const lower = value => normalize(value).toLowerCase();

  function setNativeValue(input, value) {
    const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }

  function parseCopiedList(raw) {
    return [...new Set(String(raw || "")
      .replace(/\r/g, "\n")
      .split(/[\n,;|]+/g)
      .map(value => value.replace(/^\s*[-*•]+\s*/, "").replace(/^['\"`]+|['\"`]+$/g, "").trim())
      .filter(Boolean))];
  }

  async function readCopiedList(label) {
    let raw = "";
    try { raw = await navigator.clipboard.readText(); } catch {}
    if (!raw) raw = window.prompt(`Paste ${label} here:`) || "";
    return parseCopiedList(raw);
  }

  function ensureToolbar(target, key, label, handler) {
    if (!target?.parentElement) return null;

    // React can rebuild the tag input wrapper while leaving the toolbar we
    // injected into the old wrapper around for one mutation pass. Older code
    // only checked direct children of the *current* parent, so a second toolbar
    // could be inserted inside the field while the first one remained above it.
    // Keep exactly one toolbar for this field and always place it immediately
    // before the field container.
    const parent = target.parentElement;
    const selector = `.ds-creation-bulk-tools[data-ds-tool='${key}']`;
    const candidates = [...document.querySelectorAll(selector)];
    let existing = candidates.find(node => node.parentElement === parent && node.nextElementSibling === target) || null;

    for (const node of candidates) {
      if (node !== existing) node.remove();
    }

    if (existing) return existing;
    const bar = document.createElement("div");
    bar.className = "ds-creation-bulk-tools";
    bar.dataset.dsTool = key;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    const status = document.createElement("span");
    status.className = "ds-creation-bulk-status";
    button.addEventListener("click", async event => {
      event.preventDefault(); event.stopPropagation();
      button.disabled = true;
      try { status.textContent = await handler(); }
      catch (error) { status.textContent = error?.message || "Could not insert copied values."; }
      finally { button.disabled = false; }
    });
    bar.append(button, status);
    target.insertAdjacentElement("beforebegin", bar);
    return bar;
  }

  function lorebookKeywordInput() {
    const fields = [...document.querySelectorAll('[data-field-name="keywords"]')];
    for (const field of fields) {
      // SpicyChat changes the placeholder depending on whether the entry already
      // has keywords (for example, "arcane magic, raw magic" when empty and
      // "Type to add more..." once chips exist). Find the keyword text input by
      // its field container instead of relying on that changing placeholder.
      const input = [...field.querySelectorAll('input')].find(candidate => {
        if (candidate.closest('#ds-qol-panel')) return false;
        const type = String(candidate.getAttribute('type') || 'text').toLowerCase();
        return type === 'text' || !candidate.hasAttribute('type');
      });
      if (input) return input;
    }
    return null;
  }

  function existingLorebookKeywords(field) {
    const holder = field.closest('[data-field-name="keywords"]');
    return new Set([...holder?.querySelectorAll("button span") || []].map(el => lower(el.textContent)).filter(Boolean));
  }

  async function insertLorebookKeywords() {
    const input = lorebookKeywordInput();
    if (!input) return "Keyword field not found.";
    const requested = await readCopiedList("Lorebook keywords");
    if (!requested.length) return "Nothing copied.";
    const existing = existingLorebookKeywords(input);
    let added = 0, skippedShort = 0, skippedDuplicate = 0;
    const room = Math.max(0, 12 - existing.size);
    for (const item of requested) {
      const clean = normalize(item).slice(0, 100);
      if (clean.length < 3) { skippedShort++; continue; }
      if (existing.has(lower(clean))) { skippedDuplicate++; continue; }
      if (added >= room) break;
      input.focus({ preventScroll: true });
      setNativeValue(input, clean);
      await DS.sleep?.(35);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      await DS.sleep?.(85);
      existing.add(lower(clean));
      added++;
    }
    setNativeValue(input, "");
    const extra = [skippedShort ? `${skippedShort} under 3 chars skipped` : "", skippedDuplicate ? `${skippedDuplicate} duplicates skipped` : ""].filter(Boolean).join(", ");
    return `${added} keyword${added === 1 ? "" : "s"} inserted${extra ? ` (${extra})` : ""}.`;
  }

  function chatbotTagInput() {
    return [...document.querySelectorAll('input[placeholder="Add Tags" i]')].find(input => !input.closest("#ds-qol-panel")) || null;
  }

  function findTagButton(name) {
    const wanted = lower(name);
    return [...document.querySelectorAll('button[value], button[aria-label]')].find(button => {
      if (button.disabled || button.closest("#ds-qol-panel")) return false;
      const value = lower(button.getAttribute("value") || button.getAttribute("aria-label") || "");
      return value === wanted && wanted !== "all tags";
    }) || null;
  }

  async function insertChatbotTags(requestedOverride = null) {
    const input = chatbotTagInput();
    if (!input) return "Tags field not found.";
    const requested = Array.isArray(requestedOverride)
      ? [...new Set(requestedOverride.map(normalize).filter(Boolean))]
      : await readCopiedList("chatbot tags");
    if (!requested.length) return "Nothing to insert.";
    let added = 0, missing = [];
    for (const tag of requested) {
      input.focus({ preventScroll: true });
      input.click();
      setNativeValue(input, normalize(tag));
      await DS.sleep?.(90);
      let button = findTagButton(tag);
      if (!button) {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await DS.sleep?.(80);
        button = findTagButton(tag);
      }
      if (!button) { missing.push(tag); continue; }
      if (typeof DS.realClick === "function") DS.realClick(button); else button.click();
      added++;
      await DS.sleep?.(90);
    }
    setNativeValue(input, "");
    return `${added} tag${added === 1 ? "" : "s"} inserted${missing.length ? `; ${missing.length} not found in SpicyChat's tag list` : ""}.`;
  }

  // Shared by the QoL bot JSON importer so exported SpicyChat tags can be
  // restored through the same native tag picker instead of being dropped by
  // SpicyChat's Character Card importer. This never invents tags: every value
  // still has to exist in SpicyChat's own selector.
  DS.insertChatbotTagsFromList = async function insertChatbotTagsFromList(tags) {
    return insertChatbotTags(Array.isArray(tags) ? tags : []);
  };

  function applyLorebookEditorSize() {
    const fields = [...document.querySelectorAll('[data-field-name="content"]')];
    fields.forEach(field => {
      const textarea = field.querySelector('textarea[name="content"]');
      if (!textarea) return;
      field.classList.add("ds-lorebook-content-expanded");
      const dialog = field.closest("div.fixed.z-\\[900000\\], div[class*='z-[900000]']") || field.closest("div.fixed");
      dialog?.classList.add("ds-lorebook-entry-dialog-expanded");
    });
  }

  function removeTools() {
    document.querySelectorAll(".ds-creation-bulk-tools").forEach(el => el.remove());
    document.querySelectorAll(".ds-lorebook-content-expanded").forEach(el => el.classList.remove("ds-lorebook-content-expanded"));
    document.querySelectorAll(".ds-lorebook-entry-dialog-expanded").forEach(el => el.classList.remove("ds-lorebook-entry-dialog-expanded"));
  }

  DS.removeCreationBulkInputTools = removeTools;
  DS.applyCreationBulkInputTools = function applyCreationBulkInputTools() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled) { removeTools(); return; }

    const keyword = lorebookKeywordInput();
    if (settings.lorebookBulkKeywordPaste && keyword) ensureToolbar(keyword.closest("div.relative") || keyword, "lorebook-keywords", "Insert copied", insertLorebookKeywords);
    else document.querySelectorAll('.ds-creation-bulk-tools[data-ds-tool="lorebook-keywords"]').forEach(el => el.remove());

    const tags = chatbotTagInput();
    if (settings.botTagBulkPaste && tags) ensureToolbar(tags.closest("div[class*='ring-1']") || tags, "chatbot-tags", "Insert copied", insertChatbotTags);
    else document.querySelectorAll('.ds-creation-bulk-tools[data-ds-tool="chatbot-tags"]').forEach(el => el.remove());

    if (settings.lorebookExpandEntryEditor) applyLorebookEditorSize();
    else {
      document.querySelectorAll(".ds-lorebook-content-expanded").forEach(el => el.classList.remove("ds-lorebook-content-expanded"));
      document.querySelectorAll(".ds-lorebook-entry-dialog-expanded").forEach(el => el.classList.remove("ds-lorebook-entry-dialog-expanded"));
    }
  };
})();
