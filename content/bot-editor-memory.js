(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const AUDIT_KEY = "creationAuditOwnerCache";
  const IMAGE_KEY = "botEditorImagePromptMemory";
  const MAX_AUDIT = 400;
  const MAX_IMAGE = 250;

  let observer = null;
  let scanTimer = null;
  let imageSaveTimer = null;
  let listenersInstalled = false;
  let lastRoute = "";
  let imageRestoreIds = new Set();

  function clean(value, max = 18000) {
    return String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, max);
  }

  function editorId() {
    const path = String(location.pathname || "").replace(/^\/[a-z]{2}(?=\/)/i, "");
    const match = path.match(/^\/chatbot\/edit\/([^/?#]+)/i) || path.match(/^\/chatbot\/([^/?#]+)\/edit(?:\/|$)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  }

  function onEditor() {
    return !!editorId();
  }

  function fieldText(control) {
    if (!control) return "";
    const parts = [
      control.name,
      control.id,
      control.getAttribute?.("aria-label"),
      control.getAttribute?.("placeholder"),
      control.getAttribute?.("data-testid"),
      control.closest?.("[data-field-name]")?.getAttribute?.("data-field-name")
    ];
    if (control.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
        if (label) parts.push(label.textContent);
      } catch {}
    }
    const holder = control.closest?.("label,[data-field-name]");
    if (holder) {
      const text = clean(holder.textContent, 900);
      if (text) parts.push(text);
    }
    return clean(parts.filter(Boolean).join(" "), 2400).toLowerCase();
  }

  function semanticKey(control) {
    if (!control || control.disabled || control.closest?.("#ds-qol-panel,[data-ds-qol]") ) return "";
    const tag = control.tagName?.toLowerCase();
    const type = String(control.type || "").toLowerCase();
    if (!(tag === "textarea" || (tag === "input" && ["", "text"].includes(type)))) return "";
    const text = fieldText(control);
    if (!text || /\b(search|add tags?|avatar|image upload|website|report|feedback)\b/i.test(text)) return "";
    if (/\b(example dialogue|example conversation|examples?)\b/i.test(text)) return "examples";
    if (/\b(first message|greeting|initial message)\b/i.test(text)) return "greeting";
    if (/\b(personality|definition|character details|persona)\b/i.test(text)) return "personality";
    if (/\bscenario\b/i.test(text)) return "scenario";
    if (/\b(description|character description|tagline|title)\b/i.test(text)) return "description";
    return "";
  }

  function directField(key) {
    const selectors = {
      greeting: ["[name='greeting']", "[name='first_message']", "[name='firstMessage']"],
      description: ["[name='description']", "[name='title']", "[name='tagline']"],
      personality: ["[name='persona']", "[name='personality']", "[name='definition']"],
      scenario: ["[name='scenario']"],
      examples: ["[name='dialogue']", "[name='example_dialogue']", "[name='exampleDialogues']"]
    }[key] || [];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && !node.closest?.("#ds-qol-panel,[data-ds-qol]")) return node;
    }
    return null;
  }

  function captureAuditFields() {
    const fields = {};
    const present = new Set();
    for (const key of ["greeting", "description", "personality", "scenario", "examples"]) {
      const control = directField(key);
      if (!control) continue;
      present.add(key);
      const value = clean(control.value, key === "personality" || key === "examples" ? 18000 : 12000);
      if (value) fields[key] = value;
    }
    if (present.size < 5) {
      for (const control of document.querySelectorAll("textarea,input[type='text'],input:not([type])")) {
        const key = semanticKey(control);
        if (!key || present.has(key)) continue;
        present.add(key);
        const value = clean(control.value, key === "personality" || key === "examples" ? 18000 : 12000);
        if (value) fields[key] = value;
      }
    }
    return { fields, present: [...present] };
  }

  async function saveAuditCache(id, fields, presentKeys = []) {
    const present = new Set(Array.isArray(presentKeys) ? presentKeys : []);
    if (!id || (!Object.keys(fields || {}).length && !present.size)) return;
    const result = await DS.storageGet?.([AUDIT_KEY]) || {};
    const cache = result[AUDIT_KEY] && typeof result[AUDIT_KEY] === "object" ? result[AUDIT_KEY] : { meta: {} };
    cache.meta ||= {};
    const previous = cache.meta[id] && typeof cache.meta[id] === "object" ? cache.meta[id] : {};
    const merged = { ...(previous.fields || {}) };
    const empty = new Set(Array.isArray(previous.emptyKeys) ? previous.emptyKeys : []);
    let changed = false;

    for (const key of present) {
      const next = clean(fields?.[key], key === "personality" || key === "examples" ? 18000 : 12000);
      if (next) {
        if (merged[key] !== next) { merged[key] = next; changed = true; }
        if (empty.delete(key)) changed = true;
      } else {
        if (Object.prototype.hasOwnProperty.call(merged, key)) { delete merged[key]; changed = true; }
        if (!empty.has(key)) { empty.add(key); changed = true; }
      }
    }

    if (!changed && previous.updatedAt) return;
    cache.meta[id] = { id, fields: merged, emptyKeys: [...empty], updatedAt: Date.now() };
    const ids = Object.keys(cache.meta).sort((a, b) => Number(cache.meta[b]?.updatedAt || 0) - Number(cache.meta[a]?.updatedAt || 0));
    for (const oldId of ids.slice(MAX_AUDIT)) delete cache.meta[oldId];
    await DS.storageSet?.({ [AUDIT_KEY]: cache });
  }

  function imagePromptScore(control) {
    if (!control || control.disabled) return -1;
    const text = fieldText(control);
    if (!text) return -1;
    if (/\b(greeting|personality|definition|scenario|example dialogue|description|tagline|search|tag|keyword)\b/i.test(text)) return -1;
    let score = 0;
    if (/image\s*prompt|prompt\s*for\s*(?:the\s*)?image/i.test(text)) score += 9;
    if (/\bimage\b/i.test(text) && /\bprompt\b/i.test(text)) score += 6;
    if (/\b(generate|generation|generator)\b/i.test(text) && /\bimage\b/i.test(text)) score += 4;
    if (/\bdescribe\b/i.test(text) && /\bimage|picture|avatar\b/i.test(text)) score += 4;
    if (/\bprompt\b/i.test(String(control.placeholder || ""))) score += 2;
    return score;
  }

  function findImagePromptControl() {
    let best = null;
    let bestScore = 0;
    for (const control of document.querySelectorAll("textarea,input[type='text'],input:not([type])")) {
      if (control.closest?.("#ds-qol-panel,[data-ds-qol]")) continue;
      const score = imagePromptScore(control);
      if (score > bestScore) {
        best = control;
        bestScore = score;
      }
    }
    return bestScore >= 6 ? best : null;
  }

  async function imageStore() {
    const result = await DS.storageGet?.([IMAGE_KEY]) || {};
    const store = result[IMAGE_KEY] && typeof result[IMAGE_KEY] === "object" ? result[IMAGE_KEY] : { meta: {} };
    store.meta ||= {};
    return store;
  }

  async function saveImagePrompt(id, prompt) {
    const value = clean(prompt, 12000);
    if (!id || !value) return;
    const store = await imageStore();
    const previous = store.meta[id];
    if (previous?.prompt === value) return;
    store.meta[id] = { id, prompt: value, updatedAt: Date.now() };
    const ids = Object.keys(store.meta).sort((a, b) => Number(store.meta[b]?.updatedAt || 0) - Number(store.meta[a]?.updatedAt || 0));
    for (const oldId of ids.slice(MAX_IMAGE)) delete store.meta[oldId];
    await DS.storageSet?.({ [IMAGE_KEY]: store });
  }

  async function clearImagePrompt(id) {
    if (!id) return;
    const store = await imageStore();
    if (!store.meta?.[id]) return;
    delete store.meta[id];
    await DS.storageSet?.({ [IMAGE_KEY]: store });
  }

  async function restoreImagePrompt(id, control) {
    if (!id || !control || clean(control.value)) return;
    const marker = `${id}:${control.name || control.id || control.getAttribute?.("data-testid") || "prompt"}`;
    if (imageRestoreIds.has(marker)) return;
    imageRestoreIds.add(marker);
    const store = await imageStore();
    const prompt = clean(store.meta?.[id]?.prompt, 12000);
    if (!prompt || clean(control.value)) return;
    control.value = prompt;
    try { control.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
    try { control.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
    control.dataset.dsRememberedImagePrompt = "1";
    control.title = control.title || "Restored by SpicyChat QoL from your local remembered image prompt";
  }

  function scheduleScan(delay = 120) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan().catch(() => {});
    }, delay);
  }

  async function scan() {
    const id = editorId();
    if (!id) return;
    const settings = DS.state?.settings || {};
    if (settings.enableCreationAudit) {
      const captured = captureAuditFields();
      if (captured.present.length) await saveAuditCache(id, captured.fields, captured.present);
    }
    if (settings.rememberBotImagePrompt) {
      const control = findImagePromptControl();
      if (control) {
        const current = clean(control.value, 12000);
        if (current) await saveImagePrompt(id, current);
        else await restoreImagePrompt(id, control);
      }
    }
  }

  function onInput(event) {
    if (!onEditor()) return;
    const settings = DS.state?.settings || {};
    if (settings.rememberBotImagePrompt && imagePromptScore(event.target) >= 6) {
      const id = editorId();
      const value = clean(event.target?.value, 12000);
      clearTimeout(imageSaveTimer);
      if (id && value) {
        imageSaveTimer = setTimeout(() => {
          imageSaveTimer = null;
          saveImagePrompt(id, value).catch(() => {});
        }, 500);
      } else if (id && event.isTrusted) {
        imageSaveTimer = setTimeout(() => {
          imageSaveTimer = null;
          clearImagePrompt(id).catch(() => {});
        }, 500);
      }
    }
    if (settings.enableCreationAudit && semanticKey(event.target)) scheduleScan(450);
  }

  function install() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    observer = new MutationObserver(() => scheduleScan(180));
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function cleanup() {
    DS.state.botEditorLocalMemoryWasActive = false;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
    if (imageSaveTimer) clearTimeout(imageSaveTimer);
    imageSaveTimer = null;
    observer?.disconnect();
    observer = null;
    if (listenersInstalled) {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      listenersInstalled = false;
    }
    imageRestoreIds.clear();
  }

  DS.getCachedOwnerAuditFields = async function getCachedOwnerAuditFields(idValue) {
    const id = String(idValue || "").trim();
    if (!id) return null;
    const result = await DS.storageGet?.([AUDIT_KEY, DS.BOT_ARCHIVE_KEY || "botArchive"]) || {};
    const cacheEntry = result[AUDIT_KEY]?.meta?.[id] || {};
    const cacheFields = cacheEntry.fields || {};
    const knownEmpty = new Set(Array.isArray(cacheEntry.emptyKeys) ? cacheEntry.emptyKeys : []);
    const archive = result[DS.BOT_ARCHIVE_KEY || "botArchive"]?.meta?.[id];
    const archiveFields = archive?.fields || {};
    const out = {};
    const verified = {};
    for (const key of ["greeting", "description", "personality", "scenario", "examples"]) {
      const archiveKey = key === "examples" ? "exampleDialogues" : key;
      const cached = clean(cacheFields[key] || "", key === "personality" || key === "examples" ? 18000 : 12000);
      const value = cached || (!knownEmpty.has(key) ? clean(archiveFields[archiveKey] || "", key === "personality" || key === "examples" ? 18000 : 12000) : "");
      if (value) out[key] = value;
      if (cached || knownEmpty.has(key)) verified[key] = true;
    }
    if (Object.keys(verified).length) out.verified = verified;
    const tags = clean(archiveFields.tags || "", 4000);
    if (tags) out.tags = tags.split(/\s*,\s*/g).map(item => clean(item, 100)).filter(Boolean);
    return Object.keys(out).length ? out : null;
  };

  DS.applyBotEditorLocalMemory = function applyBotEditorLocalMemory() {
    const id = editorId();
    const settings = DS.state?.settings || {};
    const wanted = !!(settings.enableCreationAudit || settings.rememberBotImagePrompt);
    if (!id || !wanted) {
      if (lastRoute || DS.state.botEditorLocalMemoryWasActive) cleanup();
      lastRoute = "";
      return;
    }
    DS.state.botEditorLocalMemoryWasActive = true;
    lastRoute = `${location.pathname}:${id}`;
    install();
    scheduleScan(80);
  };

  DS.removeBotEditorLocalMemory = cleanup;
})();
