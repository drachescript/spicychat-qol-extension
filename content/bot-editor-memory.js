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
  let scanDueAt = 0;
  let observedEditorForm = null;
  let lastAuditSignature = "";
  let lastImagePromptSignature = "";
  let formReadyRetryCount = 0;

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

  function directField(key, root = document) {
    const selectors = {
      greeting: ["[name='greeting']", "[name='first_message']", "[name='firstMessage']"],
      description: ["[name='description']", "[name='title']", "[name='tagline']"],
      personality: ["[name='persona']", "[name='personality']", "[name='definition']"],
      scenario: ["[name='scenario']"],
      examples: ["[name='dialogue']", "[name='example_dialogue']", "[name='exampleDialogues']"]
    }[key] || [];
    for (const selector of selectors) {
      const node = root.querySelector?.(selector);
      if (node && !node.closest?.("#ds-qol-panel,[data-ds-qol]")) return node;
    }
    return null;
  }

  function captureAuditFields(root = document) {
    const fields = {};
    const present = new Set();
    for (const key of ["greeting", "description", "personality", "scenario", "examples"]) {
      const control = directField(key, root);
      if (!control) continue;
      present.add(key);
      const value = clean(control.value, key === "personality" || key === "examples" ? 18000 : 12000);
      if (value) fields[key] = value;
    }
    if (present.size < 5) {
      for (const control of root.querySelectorAll?.("textarea,input[type='text'],input:not([type])") || []) {
        const key = semanticKey(control);
        if (!key || present.has(key)) continue;
        present.add(key);
        const value = clean(control.value, key === "personality" || key === "examples" ? 18000 : 12000);
        if (value) fields[key] = value;
      }
    }
    return { fields, present: [...present] };
  }

  async function saveAuditCache(id, fields, presentKeys = [], trustedEmptyKeys = []) {
    const present = new Set(Array.isArray(presentKeys) ? presentKeys : []);
    const trustedEmpty = new Set(Array.isArray(trustedEmptyKeys) ? trustedEmptyKeys : []);
    if (!id || (!Object.keys(fields || {}).length && !present.size && !trustedEmpty.size)) return;

    const result = await DS.storageGet?.([AUDIT_KEY]) || {};
    const cache = result[AUDIT_KEY] && typeof result[AUDIT_KEY] === "object" ? result[AUDIT_KEY] : { meta: {} };
    cache.meta ||= {};

    const previous = cache.meta[id] && typeof cache.meta[id] === "object" ? cache.meta[id] : {};
    const merged = { ...(previous.fields || {}) };

    // Older builds stored temporarily blank mounted controls in emptyKeys.
    // On slower React/WebView hydration that can falsely turn a filled field
    // into "Missing". Only a trusted user edit may prove an intentional blank.
    const knownEmpty = new Set(
      Array.isArray(previous.trustedEmptyKeys) ? previous.trustedEmptyKeys : []
    );
    let changed = false;

    for (const key of present) {
      const next = clean(fields?.[key], key === "personality" || key === "examples" ? 18000 : 12000);

      if (next) {
        if (merged[key] !== next) { merged[key] = next; changed = true; }
        if (knownEmpty.delete(key)) changed = true;
        continue;
      }

      // Passive scans are not evidence of a genuinely empty field.
      if (!trustedEmpty.has(key)) continue;

      if (Object.prototype.hasOwnProperty.call(merged, key)) {
        delete merged[key];
        changed = true;
      }
      if (!knownEmpty.has(key)) {
        knownEmpty.add(key);
        changed = true;
      }
    }

    const hadLegacyEmpty = Array.isArray(previous.emptyKeys) && previous.emptyKeys.length > 0;
    if (!changed && previous.updatedAt && !hadLegacyEmpty) return;

    const nextEntry = {
      ...previous,
      id,
      fields: merged,
      trustedEmptyKeys: [...knownEmpty],
      updatedAt: Date.now()
    };
    delete nextEntry.emptyKeys;

    cache.meta[id] = nextEntry;
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

  function findImagePromptControl(root = document) {
    let best = null;
    let bestScore = 0;
    for (const control of root.querySelectorAll?.("textarea,input[type='text'],input:not([type])") || []) {
      if (control.closest?.("#ds-qol-panel,[data-ds-qol]")) continue;
      const score = imagePromptScore(control);
      if (score > bestScore) {
        best = control;
        bestScore = score;
      }
    }
    return bestScore >= 6 ? best : null;
  }

  function findEditorForm() {
    const forms = [...document.querySelectorAll("form")].filter(form => !form.closest?.("#ds-qol-panel,[data-ds-owned='1'],[data-ds-owner='qol']"));
    let best = null;
    let bestScore = 0;
    for (const form of forms) {
      let score = 0;
      const controls = form.querySelectorAll("textarea,input[type='text'],input:not([type])");
      score += Math.min(12, controls.length);
      for (const control of controls) if (semanticKey(control)) score += 4;
      if (form.querySelector("button[type='submit']")) score += 3;
      if (score > bestScore) { best = form; bestScore = score; }
    }
    return bestScore >= 4 ? best : null;
  }

  function editorFormReady(form) {
    if (!(form instanceof Element) || !form.isConnected) return false;
    if (["greeting", "description", "personality", "scenario", "examples"].some(key => directField(key, form))) return true;
    return [...form.querySelectorAll("textarea,input[type='text'],input:not([type])")].some(control => !!semanticKey(control));
  }

  function auditSignature(id, captured) {
    const fields = captured?.fields || {};
    const present = [...(captured?.present || [])].sort();
    return JSON.stringify([id, present, present.map(key => [key, clean(fields[key], key === "personality" || key === "examples" ? 18000 : 12000)])]);
  }

  async function imageStore() {
    const result = await DS.storageGet?.([IMAGE_KEY]) || {};
    const store = result[IMAGE_KEY] && typeof result[IMAGE_KEY] === "object" ? result[IMAGE_KEY] : { meta: {} };
    store.meta ||= {};
    return store;
  }

  async function saveImagePrompt(id, prompt) {
    const value = clean(prompt, 12000);
    if (!id || !value) return false;
    const store = await imageStore();
    const previous = store.meta[id];
    if (previous?.prompt === value) return false;
    store.meta[id] = { id, prompt: value, updatedAt: Date.now() };
    const ids = Object.keys(store.meta).sort((a, b) => Number(store.meta[b]?.updatedAt || 0) - Number(store.meta[a]?.updatedAt || 0));
    for (const oldId of ids.slice(MAX_IMAGE)) delete store.meta[oldId];
    await DS.storageSet?.({ [IMAGE_KEY]: store });
    return true;
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
    lastImagePromptSignature = `${id}:${prompt}`;
    control.dataset.dsRememberedImagePrompt = "1";
    control.title = control.title || "Restored by SpicyChat QoL from your local remembered image prompt";
  }

  function scheduleScan(delay = 120) {
    const wait = Math.max(0, Number(delay) || 0);
    const dueAt = Date.now() + wait;
    // Keep an already-scheduled earlier scan instead of repeatedly pushing it
    // back while React is mounting/rerendering the editor.
    if (scanTimer && scanDueAt && scanDueAt <= dueAt) return;
    clearTimeout(scanTimer);
    scanDueAt = dueAt;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanDueAt = 0;
      scan().catch(() => {});
    }, wait);
  }

  async function scan() {
    const id = editorId();
    if (!id) return;
    const settings = DS.state?.settings || {};
    const form = findEditorForm();
    if (!editorFormReady(form)) {
      observedEditorForm = null;
      formReadyRetryCount += 1;
      if (formReadyRetryCount <= 6) scheduleScan(Math.min(2400, 320 * (2 ** Math.min(3, formReadyRetryCount - 1))));
      return;
    }
    formReadyRetryCount = 0;
    observedEditorForm = form;

    if (settings.enableCreationAudit) {
      const captured = captureAuditFields(form);
      if (captured.present.length) {
        const signature = auditSignature(id, captured);
        if (signature !== lastAuditSignature) {
          await saveAuditCache(id, captured.fields, captured.present);
          lastAuditSignature = signature;
          const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
          perf.botEditorAuditMeaningfulScans = Number(perf.botEditorAuditMeaningfulScans || 0) + 1;
        }
      }
    }
    if (settings.rememberBotImagePrompt) {
      const control = findImagePromptControl(form);
      if (control) {
        const current = clean(control.value, 12000);
        const signature = current ? `${id}:${current}` : "";
        if (current && signature !== lastImagePromptSignature) {
          await saveImagePrompt(id, current);
          lastImagePromptSignature = signature;
        } else if (!current) {
          await restoreImagePrompt(id, control);
        }
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
          saveImagePrompt(id, value).then(() => { lastImagePromptSignature = `${id}:${value}`; }).catch(() => {});
        }, 500);
      } else if (id && event.isTrusted) {
        imageSaveTimer = setTimeout(() => {
          imageSaveTimer = null;
          clearImagePrompt(id).catch(() => {});
        }, 500);
      }
    }
    if (settings.enableCreationAudit) {
      const auditKey = semanticKey(event.target);
      if (auditKey) {
        // Only a real user edit may prove an intentionally empty creator field.
        // Synthetic hydration/change events never create a Missing result.
        if (event.isTrusted) {
          const limit = auditKey === "personality" || auditKey === "examples" ? 18000 : 12000;
          const value = clean(event.target?.value, limit);
          if (!value) {
            const id = editorId();
            if (id) saveAuditCache(id, {}, [auditKey], [auditKey]).catch(() => {});
          }
        }
        scheduleScan(450);
      }
    }
  }

  function install() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    observer = new MutationObserver(mutations => {
      let relevant = false;
      for (const mutation of mutations) {
        if (DS.mutationIsQolOnly?.(mutation)) continue;
        const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
        if (observedEditorForm?.isConnected && (observedEditorForm.contains(target) || target?.contains?.(observedEditorForm))) {
          relevant = true;
          break;
        }
        for (const node of mutation.addedNodes || []) {
          if (!(node instanceof Element) || DS.isQolOwnedNode?.(node)) continue;
          if (node.matches?.("form,textarea,input[type='text'],input:not([type])") || node.querySelector?.("form,textarea,input[type='text'],input:not([type])")) {
            relevant = true;
            break;
          }
        }
        if (relevant) break;
      }
      if (relevant) scheduleScan(180);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function cleanup() {
    DS.state.botEditorLocalMemoryWasActive = false;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
    scanDueAt = 0;
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
    observedEditorForm = null;
    lastAuditSignature = "";
    lastImagePromptSignature = "";
    formReadyRetryCount = 0;
  }

  DS.getCachedOwnerAuditFields = async function getCachedOwnerAuditFields(idValue) {
    const id = String(idValue || "").trim();
    if (!id) return null;
    const result = await DS.storageGet?.([AUDIT_KEY, DS.BOT_ARCHIVE_KEY || "botArchive"]) || {};
    const cacheEntry = result[AUDIT_KEY]?.meta?.[id] || {};
    const cacheFields = cacheEntry.fields || {};
    // Ignore legacy emptyKeys: passive scans could write them before React
    // hydrated the real field values. Only trustedEmptyKeys can suppress a
    // stale archive value and count as verified-empty.
    const knownEmpty = new Set(
      Array.isArray(cacheEntry.trustedEmptyKeys) ? cacheEntry.trustedEmptyKeys : []
    );
    const archive = result[DS.BOT_ARCHIVE_KEY || "botArchive"]?.meta?.[id];
    const archiveFields = archive?.fields || {};
    const out = {};
    const verified = {};
    for (const key of ["greeting", "description", "personality", "scenario", "examples"]) {
      const archiveKey = key === "examples" ? "exampleDialogues" : key;
      const limit = key === "personality" || key === "examples" ? 18000 : 12000;
      const cached = clean(cacheFields[key] || "", limit);
      const archived = clean(archiveFields[archiveKey] || "", limit);
      const value = cached || (!knownEmpty.has(key) ? archived : "");
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
    const route = `${location.pathname}:${id}`;
    const routeChanged = lastRoute !== route;
    if (routeChanged) formReadyRetryCount = 0;
    DS.state.botEditorLocalMemoryWasActive = true;
    lastRoute = route;
    install();
    if (routeChanged || !observedEditorForm?.isConnected) scheduleScan(80);
  };

  DS.removeBotEditorLocalMemory = cleanup;
})();
