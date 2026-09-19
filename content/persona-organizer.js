(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const ORG_KEY = "personaOrganization";
  const DUPLICATE_DRAFT_KEY = "personaDuplicateDraft";
  const DUPLICATE_SESSION_KEY = "dsPersonaDuplicateDraft";
  const DUPLICATE_MAX_AGE = 10 * 60 * 1000;

  let org = { meta: {}, order: [], customOrder: false };
  let loaded = false;
  let activePersonaMenuId = "";
  let dragPersonaId = "";
  let menuListenerBound = false;
  let activeFolderSelect = null;
  let folderSelectGuardUntil = 0;
  let personaReconcileTimer = 0;

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function folderSelectInteractionActive() {
    if (activeFolderSelect?.isConnected && document.activeElement === activeFolderSelect) return true;
    return Date.now() < folderSelectGuardUntil;
  }

  function holdFolderSelect(select, ms = 900) {
    activeFolderSelect = select || activeFolderSelect;
    folderSelectGuardUntil = Math.max(folderSelectGuardUntil, Date.now() + ms);
  }

  function releaseFolderSelect(select, delay = 80, force = false) {
    setTimeout(() => {
      if (select && activeFolderSelect !== select) return;
      if (!force && document.activeElement === select) return;
      if (activeFolderSelect === select) activeFolderSelect = null;
      folderSelectGuardUntil = force ? Date.now() + 40 : Math.max(folderSelectGuardUntil, Date.now() + 40);
      DS.applyPersonaOrganizer?.();
    }, delay);
  }

  function openPersonaMenuTrigger() {
    return [...document.querySelectorAll("button[data-slot='trigger'][aria-haspopup='true'][aria-expanded='true']")]
      .find(trigger => !!trigger.closest("div[tabindex='-1'][class*='rounded-large'], div[tabindex='-1']")
        ?.querySelector("a[aria-label='edit-persona'][href*='/personas/edit/']")) || null;
  }

  function personaNativeMenuOpen() {
    if (openPersonaMenuTrigger()) return true;
    return [...document.querySelectorAll("ul[role='menu']")].some(menu => {
      const rect = menu.getBoundingClientRect?.();
      return !!rect && rect.width > 0 && rect.height > 0 && menuLooksLikePersonaMenu(menu);
    });
  }

  function schedulePersonaReconcile(delay = 140) {
    clearTimeout(personaReconcileTimer);
    personaReconcileTimer = window.setTimeout(() => {
      personaReconcileTimer = 0;
      if (personaNativeMenuOpen() || folderSelectInteractionActive()) {
        schedulePersonaReconcile(420);
        return;
      }
      DS.applyPersonaOrganizer?.();
    }, delay);
  }

  function parseFolders(settings) {
    return [...new Set(String(settings.personaFolders || "")
      .split(/\r?\n|,/)
      .map(cleanText)
      .filter(Boolean))];
  }

  function normalizeOrder(value) {
    const seen = new Set();
    const out = [];
    for (const item of Array.isArray(value) ? value : []) {
      const id = cleanText(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function normalizeOrg(raw) {
    const next = raw && typeof raw === "object" ? raw : {};
    return {
      meta: next.meta && typeof next.meta === "object" ? next.meta : {},
      order: normalizeOrder(next.order),
      customOrder: !!next.customOrder
    };
  }

  async function ensureLoaded() {
    if (loaded) return;
    const result = await DS.storageGet?.([ORG_KEY]);
    org = normalizeOrg(result?.[ORG_KEY]);
    loaded = true;
  }

  async function saveOrg() {
    org = normalizeOrg(org);
    await DS.storageSet?.({ [ORG_KEY]: org });
  }

  function storageRemove(keys) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.remove(keys, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function runtimeMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response || null);
        });
      } catch { resolve(null); }
    });
  }

  function personaId(link) {
    return String(link?.href || "").match(/\/personas\/edit\/([^/?#]+)/i)?.[1] || "";
  }

  function findCard(link) {
    return link?.closest?.("div[tabindex='-1'][class*='rounded-large']") ||
      link?.closest?.("div[tabindex='-1']") ||
      link?.closest?.("div[class*='rounded-large']") ||
      null;
  }

  function entryFor(link, index) {
    const id = personaId(link);
    const card = findCard(link);
    if (!id || !card) return null;
    const name = cleanText(card.querySelector("img[alt]")?.alt || card.querySelector("span.font-bold")?.textContent || id);
    if (!card.dataset.dsPersonaOriginalIndex) card.dataset.dsPersonaOriginalIndex = String(index);
    return { id, name, card, target: card, parent: card.parentElement };
  }

  function entriesOnPage() {
    return [...document.querySelectorAll("a[aria-label='edit-persona'][href*='/personas/edit/']")]
      .map((link, index) => entryFor(link, index))
      .filter(Boolean);
  }

  function fillSelect(select, options, selected) {
    select.replaceChildren();
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = options.some(([value]) => value === selected) ? selected : options[0]?.[0] || "";
  }

  async function ensureOrder(entries) {
    const known = new Set(org.order);
    let changed = false;
    for (const entry of entries) {
      if (known.has(entry.id)) continue;
      org.order.push(entry.id);
      known.add(entry.id);
      changed = true;
    }
    if (changed) await saveOrg();
  }

  function rankFor(id) {
    const index = org.order.indexOf(String(id || ""));
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  }

  function currentPageOrderedIds(entries = entriesOnPage()) {
    return [...entries]
      .sort((a, b) => rankFor(a.id) - rankFor(b.id) || Number(a.card.dataset.dsPersonaOriginalIndex || 0) - Number(b.card.dataset.dsPersonaOriginalIndex || 0))
      .map(entry => entry.id);
  }

  async function setCustomOrder(pageIds) {
    const pageSet = new Set(pageIds);
    const leftovers = org.order.filter(id => !pageSet.has(id));
    org.order = [...pageIds, ...leftovers];
    org.customOrder = true;
    DS.state.personaOrgSort = "custom";
    await saveOrg();
    DS.applyPersonaOrganizer?.();
  }

  async function movePersona(id, delta) {
    const entries = entriesOnPage();
    const ids = currentPageOrderedIds(entries);
    const index = ids.indexOf(id);
    if (index < 0) return;
    const target = Math.max(0, Math.min(ids.length - 1, index + delta));
    if (target === index) return;
    ids.splice(index, 1);
    ids.splice(target, 0, id);
    await setCustomOrder(ids);
  }

  async function placePersonaAround(sourceId, targetId, after) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const ids = currentPageOrderedIds();
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    ids.splice(sourceIndex, 1);
    let insertAt = ids.indexOf(targetId);
    if (insertAt < 0) return;
    if (after) insertAt += 1;
    ids.splice(insertAt, 0, sourceId);
    await setCustomOrder(ids);
  }

  function personaDescription(persona) {
    return String(
      persona?.description ||
      persona?.highlights ||
      persona?.highlight ||
      persona?.backstory ||
      persona?.background ||
      ""
    ).trim();
  }

  function sourcePersonaForEntry(entry) {
    const saved = (DS.state.savedPersonas || []).find(persona => String(persona?.id || "") === entry.id);
    const description = String(
      personaDescription(saved) ||
      DS.getPersonaDescriptionFromCard?.(entry.card) ||
      entry.card.querySelector("span.line-clamp-3, span[class*='line-clamp-3']")?.textContent ||
      ""
    ).trim();
    const avatar = String(
      saved?.avatar ||
      entry.card.querySelector("a[aria-label='edit-persona'] img[src]")?.src ||
      entry.card.querySelector("img[alt][src]")?.src ||
      ""
    );
    return {
      id: entry.id,
      name: cleanText(saved?.name || entry.name),
      description,
      avatar,
      avatarDataUrl: String(saved?.avatarDataUrl || ""),
      pinnedLocalCopy: !!saved?.pinnedLocalCopy
    };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(String(dataUrl || ""));
    return await response.blob();
  }

  async function optimizePersonaAvatarBlob(blob) {
    if (!blob?.size) return null;
    const maxBytes = 850 * 1024;
    if (blob.size <= maxBytes) return blob;
    try {
      const bitmap = await createImageBitmap(blob);
      const maxSide = 1024;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width || 1, bitmap.height || 1));
      const width = Math.max(1, Math.round((bitmap.width || 1) * scale));
      const height = Math.max(1, Math.round((bitmap.height || 1) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      for (const quality of [0.9, 0.82, 0.74, 0.66]) {
        const compressed = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (compressed?.size && compressed.size <= maxBytes) return compressed;
      }
    } catch {}
    return null;
  }

  async function captureAvatarDataUrl(src) {
    const url = String(src || "").trim();
    if (!url) return "";
    if (url.startsWith("data:image/")) {
      try {
        const blob = await dataUrlToBlob(url);
        const optimized = await optimizePersonaAvatarBlob(blob);
        return optimized ? await blobToDataUrl(optimized) : (blob.size <= 850 * 1024 ? url : "");
      } catch { return ""; }
    }

    try {
      const response = await fetch(url, { credentials: "omit", cache: "no-store", mode: "cors" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const optimized = blob.size <= 850 * 1024 ? blob : await optimizePersonaAvatarBlob(blob);
      if (optimized?.size) return await blobToDataUrl(optimized);
    } catch {}

    // Some CDN/browser combinations reject the page fetch even while the image
    // is visible. The service worker can fetch the approved SpicyChat CDN URL.
    try {
      const response = await runtimeMessage({ type: "DS_FETCH_PERSONA_IMAGE_DATA_URL", url });
      const dataUrl = response?.ok ? String(response.dataUrl || "") : "";
      if (!dataUrl) return "";
      const blob = await dataUrlToBlob(dataUrl);
      const optimized = blob.size <= 850 * 1024 ? blob : await optimizePersonaAvatarBlob(blob);
      return optimized?.size ? await blobToDataUrl(optimized) : "";
    } catch {
      return "";
    }
  }

  DS.capturePersonaAvatarDataUrl = captureAvatarDataUrl;

  function renderedPersonaSnapshot() {
    const match = String(location.pathname || "").match(/^\/personas\/edit\/([^/?#]+)/i);
    if (!match) return null;
    const form = document.querySelector("form");
    const nameField = form?.querySelector("input[name='name']");
    const highlightsField = form?.querySelector("textarea[name='highlights'], textarea[name='highlight'], textarea[name='description']");
    if (!form || !nameField) return null;
    const preview = form.querySelector("img[alt='persona avatar image'][src], [data-testid='personaImageUploadFormField'] img[src], img[src]");
    return {
      id: cleanText(match[1]),
      name: cleanText(nameField.value || ""),
      highlights: String(highlightsField?.value || "").trim(),
      avatar: String(preview?.currentSrc || preview?.src || "").trim()
    };
  }

  chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.type !== "DS_PERSONA_RENDERED_SNAPSHOT_READ") return false;
    let isWorker = false;
    try { isWorker = new URLSearchParams(location.search || "").get("dsPersonaRefresh") === "1"; } catch {}
    if (!isWorker) { sendResponse({ ok: false, status: "not-worker" }); return false; }
    const snapshot = renderedPersonaSnapshot();
    if (!snapshot || (message.personaId && snapshot.id !== String(message.personaId))) {
      sendResponse({ ok: false, status: "not-ready" });
      return false;
    }
    sendResponse({ ok: true, status: "ready", persona: snapshot });
    return false;
  });

  async function enrichPersonaFromEditPage(persona) {
    const source = { ...(persona || {}) };
    const id = String(source.id || "").trim();
    if (!id) return source;

    let snapshot = null;
    try {
      const response = await fetch(`/personas/edit/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store"
      });
      if (response.ok) {
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        const form = doc.querySelector("form");
        const nameField = form?.querySelector("input[name='name']");
        if (form && nameField) {
          const highlightsField = form.querySelector("textarea[name='highlights'], textarea[name='highlight'], textarea[name='description']");
          const preview = form.querySelector("img[alt='persona avatar image'][src], [data-testid='personaImageUploadFormField'] img[src], img[src]");
          snapshot = {
            id,
            name: cleanText(nameField.value || ""),
            highlights: String(highlightsField?.value || "").trim(),
            avatar: String(preview?.getAttribute("src") || "").trim()
          };
        }
      }
    } catch {}

    // SpicyChat's Persona editor is client-rendered on some builds, so raw
    // fetches can contain only the app shell. Fall back to one inactive
    // rendered helper tab and read the actual form values from there.
    if (!snapshot?.name || (!snapshot.highlights && !snapshot.avatar)) {
      const response = await runtimeMessage({ type: "DS_PERSONA_RENDERED_SNAPSHOT", personaId: id });
      if (response?.ok && response.persona) snapshot = response.persona;
    }

    if (!snapshot) return source;
    let avatar = String(snapshot.avatar || source.avatar || "").trim();
    if (avatar && !avatar.startsWith("data:")) {
      try { avatar = new URL(avatar, location.origin).href; } catch {}
    }
    const previousAvatar = String(source.avatar || "").trim();
    const avatarChanged = !!(avatar && previousAvatar && avatar !== previousAvatar);
    // Never pair a newly detected live avatar URL with stale local bytes from
    // the previous picture. Re-capture when the Persona image changed.
    let avatarDataUrl = avatarChanged ? "" : String(source.avatarDataUrl || "");
    if ((!avatarDataUrl || !avatarDataUrl.startsWith("data:image/")) && avatar) avatarDataUrl = await captureAvatarDataUrl(avatar);
    const text = String(snapshot.highlights || personaDescription(source) || "").trim();

    return {
      ...source,
      name: cleanText(snapshot.name || source.name),
      description: text,
      highlights: text,
      avatar: avatar || source.avatar || "",
      avatarDataUrl: avatarDataUrl || "",
      source: "/personas/edit",
      localCopyVersion: Math.max(5, Number(source.localCopyVersion) || 0),
      capturedFields: {
        ...(source.capturedFields || {}),
        name: !!cleanText(snapshot.name || source.name),
        text: !!text,
        avatarLocal: !!avatarDataUrl,
        avatarUrl: !!avatar
      }
    };
  }

  async function refreshIncompletePersonaCopies(button = null) {
    const current = DS.cleanPersonas?.(DS.state.savedPersonas || []) || [];
    const incomplete = current.filter(persona => {
      const text = personaDescription(persona);
      const avatarLocal = String(persona?.avatarDataUrl || "").startsWith("data:image/");
      return !!String(persona?.id || "").trim() && (!text || !avatarLocal);
    });
    if (!incomplete.length) {
      DS.setQuickStatus?.("All saved Persona copies already contain local text and avatar data where available.");
      return 0;
    }

    let updated = [...current];
    let improved = 0;
    for (let i = 0; i < incomplete.length; i += 1) {
      const persona = incomplete[i];
      if (button) button.textContent = `Refreshing ${i + 1}/${incomplete.length}...`;
      const enriched = await enrichPersonaFromEditPage(persona);
      const beforeText = personaDescription(persona);
      const beforeAvatar = String(persona?.avatarDataUrl || "");
      const afterText = personaDescription(enriched);
      const afterAvatar = String(enriched?.avatarDataUrl || "");
      if ((!beforeText && afterText) || (!beforeAvatar && afterAvatar)) improved += 1;
      updated = updated.map(item => String(item?.id || "") === String(persona.id || "")
        ? {
            ...item,
            ...enriched,
            description: afterText || beforeText,
            highlights: afterText || beforeText,
            avatarDataUrl: afterAvatar || beforeAvatar,
            pinnedLocalCopy: item.pinnedLocalCopy !== false,
            localSavedAt: Number(item.localSavedAt) || Date.now(),
            localCopyVersion: Math.max(5, Number(item.localCopyVersion) || 0),
            updatedAt: Date.now()
          }
        : item);
    }
    await DS.savePersonas?.(DS.cleanPersonas?.(updated) || updated);
    DS.setQuickStatus?.(`Persona refresh finished: ${improved} of ${incomplete.length} incomplete cop${incomplete.length === 1 ? "y" : "ies"} gained missing local data. Rendered helper pages are used when SpicyChat does not expose the edit form in raw HTML.`);
    return improved;
  }

  async function saveLocalCopy(entry) {
    let source = sourcePersonaForEntry(entry);
    source = await enrichPersonaFromEditPage(source);
    const existing = (DS.state.savedPersonas || []).find(persona => String(persona?.id || "") === entry.id) || {};
    let avatarDataUrl = String(existing.avatarDataUrl || source.avatarDataUrl || "");
    if (!avatarDataUrl && source.avatar) avatarDataUrl = await captureAvatarDataUrl(source.avatar);

    const next = DS.cleanPersonas?.([
      ...(DS.state.savedPersonas || []).filter(persona => String(persona?.id || "") !== entry.id),
      {
        ...existing,
        ...source,
        description: personaDescription(source),
        highlights: personaDescription(source),
        avatarDataUrl,
        pinnedLocalCopy: true,
        localSavedAt: Date.now(),
        localCopyVersion: 5,
        capturedFields: {
          name: !!source.name,
          text: !!personaDescription(source),
          avatarLocal: !!avatarDataUrl,
          avatarUrl: !!source.avatar
        },
        updatedAt: Date.now()
      }
    ]) || [];
    await DS.savePersonas?.(next);
    DS.setQuickStatus?.(avatarDataUrl
      ? `Saved local copy of ${source.name}, including its profile picture.`
      : (source.avatar
          ? `Saved local copy of ${source.name}. The avatar is stored as its current URL only.`
          : `Saved local copy of ${source.name}. No avatar image was available to store.`));
    DS.applyPersonaOrganizer?.();
  }

  function copyName(name) {
    const base = cleanText(name) || "Persona";
    const suffix = " Copy";
    const max = 20;
    if ((base + suffix).length <= max) return base + suffix;
    return `${base.slice(0, Math.max(1, max - suffix.length)).trim()}${suffix}`.slice(0, max);
  }

  async function startDuplicate(entry) {
    let source = sourcePersonaForEntry(entry);
    source = await enrichPersonaFromEditPage(source);
    // Cache the image before navigating when CORS/storage allows it. The older
    // duplicate flow fetched only after the create page opened, so an expiring
    // CDN URL or a page transition could make picture copying unnecessarily
    // flaky even though the source card still had the image loaded.
    let avatarDataUrl = source.avatarDataUrl || "";
    if (!avatarDataUrl && source.avatar) {
      avatarDataUrl = await captureAvatarDataUrl(source.avatar);
    }

    const draft = {
      sourceId: source.id,
      sourceName: source.name,
      name: copyName(source.name),
      highlights: source.description,
      avatar: source.avatar,
      avatarDataUrl,
      mode: "duplicate",
      createdAt: Date.now()
    };

    await DS.storageSet?.({ [DUPLICATE_DRAFT_KEY]: draft });
    location.assign(`/personas/create?dsDuplicate=${encodeURIComponent(source.id)}`);
  }

  async function startRestore(persona) {
    if (!persona) return;
    persona = await enrichPersonaFromEditPage(persona);
    const draft = {
      sourceId: String(persona.id || "local"),
      sourceName: cleanText(persona.name || "Persona"),
      name: cleanText(persona.name || "Persona").slice(0, 20),
      highlights: personaDescription(persona).slice(0, 1000),
      avatar: String(persona.avatar || ""),
      avatarDataUrl: String(persona.avatarDataUrl || ""),
      mode: "restore",
      createdAt: Date.now()
    };
    try { sessionStorage.setItem(DUPLICATE_SESSION_KEY, JSON.stringify(draft)); } catch {}
    await DS.storageSet?.({ [DUPLICATE_DRAFT_KEY]: draft });
    location.assign(`/personas/create?dsDuplicate=${encodeURIComponent(draft.sourceId)}&dsRestore=1`);
  }

  function setNativeValue(field, value) {
    if (!field) return;
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    try {
      setter?.call(field, String(value ?? ""));
    } catch {
      field.value = String(value ?? "");
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function duplicateNoticeHost(form) {
    return form?.querySelector("[data-testid='personaImageUploadFormField']") || form?.firstElementChild || form;
  }

  function setDuplicateNotice(form, text, state = "info") {
    if (!form) return null;
    let notice = document.getElementById("ds-persona-duplicate-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "ds-persona-duplicate-notice";
      notice.className = "ds-persona-duplicate-notice";
      duplicateNoticeHost(form)?.before(notice);
    }
    notice.dataset.state = state;
    notice.textContent = text;
    return notice;
  }

  async function tryCopyAvatar(form, draft) {
    const sources = [draft?.avatarDataUrl, draft?.avatar].map(value => String(value || "").trim()).filter(Boolean);
    if (!sources.length) return { ok: false, reason: "No saved avatar was available." };

    const input = form?.querySelector("input[type='file'][data-testid='AvatarCreateUploadInput'], input#image-picker[type='file'], input[type='file'][accept*='image']");
    if (!input) return { ok: false, reason: "Avatar upload control was not found." };

    const previewRoot = input.closest?.("[data-testid='personaImageUploadFormField']") || input.parentElement || form;
    const previewBefore = [...previewRoot.querySelectorAll("img[src]")].map(img => img.currentSrc || img.src).join("|");
    const hadPreviewImage = !!previewBefore;
    let lastError = "avatar fetch failed";

    for (const src of sources) {
      try {
        // Older local copies may contain only SpicyChat's CDN URL. Reuse the
        // background-assisted capture path so restore is not dependent on the
        // page's CORS access to that old image URL.
        const restorableSrc = src.startsWith("data:") ? src : (await captureAvatarDataUrl(src) || src);
        const response = await fetch(restorableSrc, { credentials: "omit", cache: "no-store", mode: restorableSrc.startsWith("data:") ? "same-origin" : "cors" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.size) throw new Error("empty image");

        const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
        const file = new File([blob], `persona-restore.${ext}`, { type: blob.type || "image/jpeg" });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        const verified = await new Promise(resolve => {
          const started = Date.now();
          const expectedSize = file.size;
          const check = () => {
            const selectedFile = input.files?.[0] || null;
            const hasExpectedFile = !!selectedFile && (!expectedSize || selectedFile.size === expectedSize);
            const previewNow = [...previewRoot.querySelectorAll("img[src]")].map(img => img.currentSrc || img.src).join("|");
            const previewChanged = !!previewNow && previewNow !== previewBefore;
            // React can take a moment to swap the preview. Keeping the exact File in
            // the live upload input is also a valid handoff even if the old preview
            // remains visible briefly. Require it to survive for a short grace period
            // rather than immediately claiming success after assigning input.files.
            if (previewChanged) return resolve(true);
            if (hasExpectedFile && Date.now() - started >= 350) return resolve(true);
            if (!hadPreviewImage && hasExpectedFile) return resolve(true);
            if (Date.now() - started >= 2200) return resolve(false);
            setTimeout(check, 80);
          };
          check();
        });
        if (verified) return { ok: true, source: restorableSrc.startsWith("data:") ? "local" : "url" };
        lastError = "SpicyChat did not keep the selected avatar file.";
      } catch (error) {
        lastError = error?.message || "avatar fetch failed";
      }
    }

    return { ok: false, reason: lastError };
  }

  async function applyDuplicateDraft() {
    if (location.pathname !== "/personas/create") return;
    if (DS.state.personaDuplicateApplying) return;

    const params = new URLSearchParams(location.search);
    if (!params.has("dsDuplicate")) return;

    DS.state.personaDuplicateApplying = true;
    try {
      const result = await DS.storageGet?.([DUPLICATE_DRAFT_KEY]);
      let sessionDraft = null;
      try { sessionDraft = JSON.parse(sessionStorage.getItem(DUPLICATE_SESSION_KEY) || "null"); } catch {}
      const draft = result?.[DUPLICATE_DRAFT_KEY] || sessionDraft;
      if (!draft || Date.now() - Number(draft.createdAt || 0) > DUPLICATE_MAX_AGE) {
        setDuplicateNotice(document.querySelector("form"), "QoL duplicate data expired. Open the source persona and choose Duplicate again.", "warning");
        await storageRemove([DUPLICATE_DRAFT_KEY]);
        try { sessionStorage.removeItem(DUPLICATE_SESSION_KEY); } catch {}
        return;
      }

      const form = document.querySelector("form");
      const name = form?.querySelector("input[name='name']");
      const highlights = form?.querySelector("textarea[name='highlights']");
      if (!form || !name || !highlights) return;
      if (form.dataset.dsPersonaDuplicateApplied === "1") return;

      form.dataset.dsPersonaDuplicateApplied = "1";
      setNativeValue(name, String(draft.name || "").slice(0, 20));
      setNativeValue(highlights, String(draft.highlights || "").slice(0, 1000));
      const actionWord = draft.mode === "restore" ? "Restoring" : "Duplicating";
      setDuplicateNotice(form, `${actionWord} ${draft.sourceName || "persona"} — review the copy before pressing Create Persona.`, "info");

      const avatarResult = await tryCopyAvatar(form, draft);
      if (avatarResult.ok) {
        setDuplicateNotice(form, `${actionWord} ${draft.sourceName || "persona"}. Saved text was filled and the avatar file was attached; review everything before creating it.`, "success");
      } else {
        const avatarDetail = draft.avatarDataUrl ? "A local avatar copy exists, but SpicyChat did not accept it automatically." : (draft.avatar ? "Only the old avatar URL was available and it could not be restored." : "No saved avatar was available.");
        setDuplicateNotice(form, `${actionWord} ${draft.sourceName || "persona"}. Saved text was filled. ${avatarDetail} Upload the picture manually if needed.`, "warning");
      }

      await storageRemove([DUPLICATE_DRAFT_KEY]);
      try { sessionStorage.removeItem(DUPLICATE_SESSION_KEY); } catch {}
      try {
        const cleanUrl = new URL(location.href);
        cleanUrl.searchParams.delete("dsDuplicate");
        history.replaceState(history.state, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      } catch {}
    } finally {
      DS.state.personaDuplicateApplying = false;
    }
  }

  function updateLocalNote(entry) {
    const footer = entry.card.lastElementChild || entry.card;
    // Keep notes inside the card's text/details column instead of appending
    // beside native action/menu containers. The latter can stretch the card
    // and make SpicyChat's three-dot trigger difficult to hit on narrow layouts.
    const host = footer?.querySelector?.(":scope > div") || footer || entry.card;
    const note = cleanText(org.meta[entry.id]?.note || "");
    let el = entry.card.querySelector(".ds-persona-local-note");
    if (!note) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "ds-persona-local-note";
    }
    if (el.parentElement !== host) host.appendChild(el);
    el.textContent = `QoL note: ${note}`;
    el.title = note;
  }

  function bindDragTarget(entry) {
    if (entry.card.dataset.dsPersonaDropBound === "1") return;
    entry.card.dataset.dsPersonaDropBound = "1";

    entry.card.addEventListener("dragover", event => {
      if (!dragPersonaId || dragPersonaId === entry.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      entry.card.classList.add("ds-persona-drop-target");
    });

    entry.card.addEventListener("dragleave", () => entry.card.classList.remove("ds-persona-drop-target"));

    entry.card.addEventListener("drop", async event => {
      if (!dragPersonaId || dragPersonaId === entry.id) return;
      event.preventDefault();
      entry.card.classList.remove("ds-persona-drop-target");
      const rect = entry.card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2 || event.clientX > rect.left + rect.width / 2;
      const sourceId = dragPersonaId;
      dragPersonaId = "";
      await placePersonaAround(sourceId, entry.id, after);
    });
  }

  function ensureCardControls(entry, folders) {
    let bar = entry.card.querySelector(":scope > .ds-persona-org-actions");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "ds-persona-org-actions";

      const star = document.createElement("button");
      star.type = "button";
      star.className = "ds-persona-favorite";
      star.setAttribute("aria-label", "Favorite persona");
      star.dataset.personaId = entry.id;
      star.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        const id = event.currentTarget.dataset.personaId;
        const current = org.meta[id] || {};
        org.meta[id] = { ...current, favorite: !current.favorite };
        await saveOrg();
        DS.applyPersonaOrganizer?.();
      });

      const select = document.createElement("select");
      select.className = "ds-persona-folder";
      select.setAttribute("aria-label", "Persona folder");
      select.dataset.personaId = entry.id;
      select.dataset.dsOwned = "1";
      const holdSelect = event => {
        event?.stopPropagation?.();
        holdFolderSelect(select);
      };
      select.addEventListener("pointerdown", holdSelect);
      select.addEventListener("mousedown", holdSelect);
      select.addEventListener("focus", () => holdFolderSelect(select, 1200));
      select.addEventListener("click", holdSelect);
      select.addEventListener("blur", () => releaseFolderSelect(select, 90));
      select.addEventListener("change", async event => {
        event.stopPropagation();
        holdFolderSelect(select, 220);
        const id = event.currentTarget.dataset.personaId;
        const current = org.meta[id] || {};
        org.meta[id] = { ...current, folder: cleanText(event.currentTarget.value) };
        await saveOrg();
        // Native select popups can collapse if their card is moved/reconciled
        // during the same interaction. Let the browser finish closing it first.
        releaseFolderSelect(select, 140, true);
      });

      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "ds-persona-drag-handle";
      handle.textContent = "↕";
      handle.title = "Drag to set custom persona order";
      handle.setAttribute("aria-label", "Drag persona to reorder");
      handle.draggable = true;
      handle.dataset.personaId = entry.id;
      handle.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
      });
      handle.addEventListener("dragstart", event => {
        dragPersonaId = event.currentTarget.dataset.personaId || "";
        DS.state.personaOrgSort = "custom";
        org.customOrder = true;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", dragPersonaId);
        entry.card.classList.add("ds-persona-dragging");
      });
      handle.addEventListener("dragend", () => {
        dragPersonaId = "";
        entry.card.classList.remove("ds-persona-dragging");
        document.querySelectorAll(".ds-persona-drop-target").forEach(el => el.classList.remove("ds-persona-drop-target"));
      });

      bar.append(star, select, handle);
      entry.card.appendChild(bar);
    }

    const favorite = !!org.meta[entry.id]?.favorite;
    const star = bar.querySelector(".ds-persona-favorite");
    if (star) {
      star.dataset.personaId = entry.id;
      star.textContent = favorite ? "★" : "☆";
      star.classList.toggle("is-favorite", favorite);
      star.title = favorite ? "Remove persona favorite" : "Favorite persona";
    }

    const select = bar.querySelector(".ds-persona-folder");
    if (select) {
      select.dataset.personaId = entry.id;
      const wanted = cleanText(org.meta[entry.id]?.folder || "");
      const options = [["", "Unsorted"], ...folders.map(folder => [folder, folder])];
      const signature = JSON.stringify(options);
      const interacting = select === activeFolderSelect || document.activeElement === select;
      if (!interacting && select.dataset.dsFolderSignature !== signature) {
        select.dataset.dsFolderSignature = signature;
        fillSelect(select, options, wanted);
      } else if (!interacting) {
        const nextValue = options.some(([value]) => value === wanted) ? wanted : "";
        if (select.value !== nextValue) select.value = nextValue;
      }
    }

    const handle = bar.querySelector(".ds-persona-drag-handle");
    if (handle) {
      handle.dataset.personaId = entry.id;
      handle.classList.toggle("is-active", (DS.state.personaOrgSort || "") === "custom");
    }

    bindDragTarget(entry);
    updateLocalNote(entry);
  }

  async function forgetLocalCopy(persona, liveIds) {
    const id = String(persona?.id || "");
    const isLive = liveIds.has(id);
    const next = (DS.state.savedPersonas || []).flatMap(item => {
      if (String(item?.id || "") !== id) return [item];
      if (!isLive) return [];
      return [{ ...item, pinnedLocalCopy: false, avatarDataUrl: "" }];
    });
    await DS.savePersonas?.(next);
  }

  function personaCopyText(persona) {
    const name = cleanText(persona?.name || "Persona");
    const description = personaDescription(persona);
    const parts = [`Name: ${name}`];
    if (description) parts.push(`Highlight / persona text:
${description}`);
    return parts.join("\n\n");
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      return true;
    } catch {}
    try {
      const area = document.createElement("textarea");
      area.value = String(text || "");
      area.readOnly = true;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  function personaSavedState(persona) {
    const text = personaDescription(persona);
    const avatarLocal = !!String(persona?.avatarDataUrl || "").trim();
    const avatarUrl = !!String(persona?.avatar || "").trim();
    const quality = text && avatarLocal
      ? "Complete"
      : text && avatarUrl
        ? "Older copy · avatar URL only"
        : text
          ? "Text only · avatar missing"
          : avatarLocal
            ? "Avatar only · text missing"
            : "Incomplete older copy";
    return {
      text,
      avatarLocal,
      avatarUrl,
      quality,
      labels: [
        quality,
        text ? "Text saved" : "Text missing",
        avatarLocal ? "Avatar saved locally" : (avatarUrl ? "Avatar URL only" : "Avatar missing")
      ]
    };
  }

  function showSavedPersonaCopy(persona) {
    const state = personaSavedState(persona);
    const dialog = document.createElement("dialog");
    dialog.className = "ds-persona-saved-copy-dialog";
    const title = document.createElement("h3");
    title.textContent = `Saved copy: ${cleanText(persona?.name || "Persona")}`;
    const status = document.createElement("p");
    status.className = "ds-persona-library-status";
    status.textContent = state.labels.join(" · ");
    const area = document.createElement("textarea");
    area.readOnly = true;
    area.rows = 10;
    area.value = personaCopyText(persona);
    const actions = document.createElement("div");
    actions.className = "ds-persona-library-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy persona text";
    copy.addEventListener("click", async () => {
      copy.textContent = await copyToClipboard(personaCopyText(persona)) ? "Copied" : "Copy failed";
      setTimeout(() => { if (copy.isConnected) copy.textContent = "Copy persona text"; }, 1200);
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());
    actions.append(copy, close);
    dialog.append(title, status, area, actions);
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
  }

  async function refreshOnePersonaCopy(persona) {
    const id = String(persona?.id || "").trim();
    if (!id) return { ok: false, improved: false };
    const enriched = await enrichPersonaFromEditPage(persona);
    const beforeText = personaDescription(persona);
    const beforeAvatar = String(persona?.avatarDataUrl || "");
    const afterText = personaDescription(enriched) || beforeText;
    const afterAvatar = String(enriched?.avatarDataUrl || beforeAvatar || "");
    const changed = JSON.stringify([persona?.name || "", beforeText, persona?.avatar || "", beforeAvatar]) !==
      JSON.stringify([enriched?.name || persona?.name || "", afterText, enriched?.avatar || persona?.avatar || "", afterAvatar]);
    const next = (DS.state.savedPersonas || []).map(item => String(item?.id || "") === id ? {
      ...item,
      ...enriched,
      description: afterText,
      highlights: afterText,
      avatarDataUrl: afterAvatar,
      pinnedLocalCopy: item.pinnedLocalCopy !== false,
      localSavedAt: Number(item.localSavedAt) || Date.now(),
      localCopyVersion: Math.max(5, Number(item.localCopyVersion) || 0),
      updatedAt: changed ? Date.now() : Number(item.updatedAt || Date.now())
    } : item);
    await DS.savePersonas?.(DS.cleanPersonas?.(next) || next);
    return { ok: true, improved: (!beforeText && !!afterText) || (!beforeAvatar && !!afterAvatar), changed };
  }

  function showLocalPersonaLibrary() {
    document.getElementById("ds-persona-local-library-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "ds-persona-local-library-modal";
    modal.className = "ds-persona-local-library-modal";

    const backdrop = document.createElement("div");
    backdrop.className = "ds-persona-library-backdrop";
    const dialog = document.createElement("div");
    dialog.className = "ds-persona-library-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Local Persona Library");

    const head = document.createElement("div");
    head.className = "ds-persona-library-head";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "Local Persona Library";
    const hint = document.createElement("p");
    hint.textContent = "Local copies can be restored into SpicyChat when you have a free persona slot. This does not increase or bypass SpicyChat's persona limit.";
    titleWrap.append(title, hint);
    const headActions = document.createElement("div");
    headActions.className = "ds-persona-library-head-actions";
    const refreshIncomplete = document.createElement("button");
    refreshIncomplete.type = "button";
    refreshIncomplete.textContent = "Refresh incomplete copies";
    refreshIncomplete.title = "Try to fill missing Persona text/avatar data from the current SpicyChat Persona edit pages";
    refreshIncomplete.addEventListener("click", async () => {
      refreshIncomplete.disabled = true;
      try {
        await refreshIncompletePersonaCopies(refreshIncomplete);
        modal.remove();
        showLocalPersonaLibrary();
      } catch {
        refreshIncomplete.textContent = "Refresh failed";
        refreshIncomplete.disabled = false;
      }
    });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "ds-persona-library-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    headActions.append(refreshIncomplete, close);
    head.append(titleWrap, headActions);

    const list = document.createElement("div");
    list.className = "ds-persona-library-list";
    dialog.append(head, list);
    modal.append(backdrop, dialog);
    document.documentElement.appendChild(modal);

    const liveIds = new Set(entriesOnPage().map(entry => entry.id));
    const personas = DS.cleanPersonas?.(DS.state.savedPersonas || []) || [];
    const incompleteCount = personas.filter(persona => !!String(persona?.id || "").trim() && (!personaDescription(persona) || !String(persona?.avatarDataUrl || "").startsWith("data:image/"))).length;
    refreshIncomplete.disabled = incompleteCount === 0;
    refreshIncomplete.textContent = incompleteCount ? `Refresh incomplete copies (${incompleteCount})` : "All copies complete";

    if (!personas.length) {
      const empty = document.createElement("div");
      empty.className = "ds-persona-library-empty";
      empty.textContent = "No personas have been saved locally yet. Open My Personas with persona saving enabled, or use Save Local Copy from a persona's menu.";
      list.appendChild(empty);
    }

    for (const persona of personas) {
      const row = document.createElement("div");
      row.className = "ds-persona-library-card";
      const imageSrc = String(persona.avatarDataUrl || persona.avatar || "");
      if (imageSrc) {
        const img = document.createElement("img");
        img.src = imageSrc;
        img.alt = "";
        img.loading = "lazy";
        row.appendChild(img);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "ds-persona-library-avatar-placeholder";
        placeholder.textContent = "?";
        row.appendChild(placeholder);
      }

      const main = document.createElement("div");
      main.className = "ds-persona-library-main";
      const name = document.createElement("strong");
      name.textContent = cleanText(persona.name || "Persona");
      const status = document.createElement("span");
      status.className = "ds-persona-library-status";
      const live = liveIds.has(String(persona.id || ""));
      status.textContent = live
        ? (persona.pinnedLocalCopy ? "On SpicyChat · local copy pinned" : "On SpicyChat")
        : "Local only / not currently visible on My Personas";
      main.append(name, status);

      const savedState = personaSavedState(persona);
      const savedMeta = document.createElement("div");
      savedMeta.className = "ds-persona-library-saved-meta";
      for (const labelText of savedState.labels) {
        const chip = document.createElement("span");
        chip.textContent = labelText;
        chip.dataset.state = /missing|url only/i.test(labelText) ? "warning" : "saved";
        savedMeta.appendChild(chip);
      }
      main.appendChild(savedMeta);

      if (savedState.text) {
        const desc = document.createElement("p");
        desc.textContent = savedState.text;
        main.appendChild(desc);
      }

      const actions = document.createElement("div");
      actions.className = "ds-persona-library-actions";

      const restore = document.createElement("button");
      restore.type = "button";
      restore.textContent = "Restore as new";
      restore.title = savedState.text
        ? "Fill a new SpicyChat persona with the saved local text and avatar when available"
        : "This older local copy does not contain saved persona text; only available fields can be restored";
      restore.addEventListener("click", () => startRestore(persona));
      actions.appendChild(restore);

      const view = document.createElement("button");
      view.type = "button";
      view.textContent = "View saved copy";
      view.addEventListener("click", () => showSavedPersonaCopy(persona));
      actions.appendChild(view);

      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy persona text";
      copy.addEventListener("click", async () => {
        copy.disabled = true;
        copy.textContent = "Loading full text...";
        const source = savedState.text ? persona : await enrichPersonaFromEditPage(persona);
        const ok = await copyToClipboard(personaCopyText(source));
        copy.textContent = ok ? "Copied" : "Copy failed";
        setTimeout(() => {
          if (!copy.isConnected) return;
          copy.disabled = false;
          copy.textContent = "Copy persona text";
        }, 1200);
      });
      actions.appendChild(copy);

      if (String(persona.id || "").trim()) {
        const refresh = document.createElement("button");
        refresh.type = "button";
        refresh.textContent = "Refresh from SpicyChat";
        refresh.title = "Refresh saved text/avatar from the live Persona editor. QoL can use a temporary inactive helper tab when needed.";
        refresh.addEventListener("click", async () => {
          refresh.disabled = true;
          refresh.textContent = "Refreshing...";
          const result = await refreshOnePersonaCopy(persona);
          if (!result.ok) {
            refresh.textContent = "Refresh unavailable";
            refresh.disabled = false;
            return;
          }
          modal.remove();
          showLocalPersonaLibrary();
        });
        actions.appendChild(refresh);
      }

      if (!persona.avatarDataUrl && persona.avatar) {
        const saveImage = document.createElement("button");
        saveImage.type = "button";
        saveImage.textContent = "Save picture locally";
        saveImage.addEventListener("click", async () => {
          saveImage.disabled = true;
          saveImage.textContent = "Saving...";
          const data = await captureAvatarDataUrl(persona.avatar);
          if (data) {
            const next = (DS.state.savedPersonas || []).map(item => String(item?.id || "") === String(persona.id || "")
              ? { ...item, avatarDataUrl: data, pinnedLocalCopy: true, localSavedAt: Date.now() }
              : item);
            await DS.savePersonas?.(next);
            modal.remove();
            showLocalPersonaLibrary();
          } else {
            saveImage.textContent = "Could not save picture";
            saveImage.disabled = false;
          }
        });
        actions.appendChild(saveImage);
      }

      const forget = document.createElement("button");
      forget.type = "button";
      forget.textContent = live ? "Remove local pin" : "Forget local copy";
      forget.addEventListener("click", async () => {
        const message = live
          ? `Remove the pinned local copy of ${persona.name || "this persona"}? The live SpicyChat persona will not be deleted.`
          : `Forget the local copy of ${persona.name || "this persona"}? This cannot delete or restore anything on SpicyChat.`;
        if (!window.confirm(message)) return;
        await forgetLocalCopy(persona, liveIds);
        modal.remove();
        showLocalPersonaLibrary();
      });
      actions.appendChild(forget);

      main.appendChild(actions);
      row.appendChild(main);
      list.appendChild(row);
    }

    const dismiss = () => modal.remove();
    backdrop.addEventListener("click", dismiss);
    close.addEventListener("click", dismiss);
  }

  function findToolbarHost() {
    const search = document.querySelector("input[aria-label='Search...'], input[placeholder='Search...']");
    if (!search) return null;
    let node = search.parentElement;
    for (let i = 0; node && i < 8; i++, node = node.parentElement) {
      const cls = String(node.className || "");
      if (cls.includes("justify-between") && cls.includes("flex")) return node;
    }
    return search.closest("div.flex")?.parentElement || search.parentElement?.parentElement || null;
  }

  function ensureToolbar(folders) {
    const host = findToolbarHost();
    if (!host) return null;

    let toolbar = document.getElementById("ds-persona-organizer-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "ds-persona-organizer-toolbar";
      toolbar.className = "ds-persona-organizer-toolbar";

      const showLabel = document.createElement("label");
      showLabel.append("Show ");
      const filter = document.createElement("select");
      filter.id = "ds-persona-org-filter";
      filter.addEventListener("change", event => {
        DS.state.personaOrgFilter = event.target.value || "all";
        DS.applyPersonaOrganizer?.();
      });
      showLabel.appendChild(filter);

      const sortLabel = document.createElement("label");
      sortLabel.append("Sort ");
      const sort = document.createElement("select");
      sort.id = "ds-persona-org-sort";
      fillSelect(sort, [["native", "SpicyChat order"], ["custom", "Custom order"], ["name", "Name A-Z"], ["favorites", "Favorites first"]], org.customOrder ? "custom" : "native");
      sort.addEventListener("change", event => {
        DS.state.personaOrgSort = event.target.value || "native";
        DS.applyPersonaOrganizer?.();
      });
      sortLabel.appendChild(sort);

      const localSearch = document.createElement("input");
      localSearch.id = "ds-persona-org-local-search";
      localSearch.type = "search";
      localSearch.placeholder = "Search QoL notes/folders...";
      localSearch.setAttribute("aria-label", "Search persona names, QoL notes and folders");
      localSearch.addEventListener("input", event => {
        DS.state.personaOrgLocalSearch = event.target.value || "";
        DS.applyPersonaOrganizer?.();
      });

      const library = document.createElement("button");
      library.id = "ds-persona-local-library-open";
      library.type = "button";
      library.addEventListener("click", showLocalPersonaLibrary);

      toolbar.append(showLabel, sortLabel, localSearch, library);
      host.appendChild(toolbar);
    }

    const filter = toolbar.querySelector("#ds-persona-org-filter");
    const filterOptions = [
      ["all", "All personas"],
      ["favorites", "Favorites"],
      ["unsorted", "Unsorted"],
      ...folders.map(folder => [`folder:${folder}`, folder])
    ];
    const signature = JSON.stringify(filterOptions);
    if (filter && filter.dataset.dsSignature !== signature) {
      filter.dataset.dsSignature = signature;
      fillSelect(filter, filterOptions, DS.state.personaOrgFilter || "all");
    } else if (filter) {
      filter.value = filterOptions.some(([value]) => value === DS.state.personaOrgFilter) ? DS.state.personaOrgFilter : "all";
    }

    const sort = toolbar.querySelector("#ds-persona-org-sort");
    const validSorts = ["native", "custom", "name", "favorites"];
    if (sort) sort.value = validSorts.includes(DS.state.personaOrgSort) ? DS.state.personaOrgSort : (org.customOrder ? "custom" : "native");

    const localSearch = toolbar.querySelector("#ds-persona-org-local-search");
    if (localSearch && localSearch.value !== (DS.state.personaOrgLocalSearch || "")) localSearch.value = DS.state.personaOrgLocalSearch || "";
    const library = toolbar.querySelector("#ds-persona-local-library-open");
    if (library) {
      const savedCount = (DS.state.savedPersonas || []).length;
      library.textContent = `Local copies (${savedCount})`;
      library.title = "Open the local Persona Library";
    }
    return toolbar;
  }

  function applyFilter(entries, folders) {
    const mode = DS.state.personaOrgFilter || "all";
    const query = cleanText(DS.state.personaOrgLocalSearch || "").toLowerCase();
    const configuredFolders = new Set(folders.map(cleanText));
    for (const entry of entries) {
      const data = org.meta[entry.id] || {};
      const folder = cleanText(data.folder);
      const note = cleanText(data.note);
      let show = true;
      if (mode === "favorites") show = !!data.favorite;
      else if (mode === "unsorted") show = !folder || !configuredFolders.has(folder);
      else if (mode.startsWith("folder:")) show = folder === mode.slice(7);

      if (show && query) {
        const haystack = `${entry.name} ${folder} ${note}`.toLowerCase();
        show = haystack.includes(query);
      }
      entry.target.classList.toggle("ds-persona-org-hidden", !show);
    }
  }

  function applySort(entries) {
    if (folderSelectInteractionActive()) return;
    const mode = DS.state.personaOrgSort || (org.customOrder ? "custom" : "native");
    const byParent = new Map();
    for (const entry of entries) {
      if (!entry.parent) continue;
      if (!byParent.has(entry.parent)) byParent.set(entry.parent, []);
      byParent.get(entry.parent).push(entry);
    }

    for (const [parent, group] of byParent) {
      group.sort((a, b) => {
        if (mode === "custom") return rankFor(a.id) - rankFor(b.id) || Number(a.target.dataset.dsPersonaOriginalIndex || 0) - Number(b.target.dataset.dsPersonaOriginalIndex || 0);
        if (mode === "name") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        if (mode === "favorites") {
          const af = !!org.meta[a.id]?.favorite;
          const bf = !!org.meta[b.id]?.favorite;
          if (af !== bf) return af ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        }
        return Number(a.target.dataset.dsPersonaOriginalIndex || 0) - Number(b.target.dataset.dsPersonaOriginalIndex || 0);
      });
      group.forEach(entry => parent.appendChild(entry.target));
    }
  }

  async function editNote(id) {
    const entry = entriesOnPage().find(item => item.id === id);
    const current = cleanText(org.meta[id]?.note || "");
    const next = window.prompt(`Private QoL note for ${entry?.name || "this persona"}:`, current);
    if (next === null) return;
    org.meta[id] = { ...(org.meta[id] || {}), note: cleanText(next).slice(0, 500) };
    await saveOrg();
    // The native persona menu closes through React. Do not reconcile the card
    // in the same turn or QoL can attach into the transient menu/layout shell.
    schedulePersonaReconcile(160);
  }

  async function moveToFolder(id, folders) {
    const current = cleanText(org.meta[id]?.folder || "");
    const available = folders.length ? folders.join(", ") : "none configured";
    const next = window.prompt(`Move persona to folder. Configured folders: ${available}. Leave blank for Unsorted.`, current);
    if (next === null) return;
    const cleaned = cleanText(next);
    if (cleaned && !folders.includes(cleaned)) {
      window.alert("That folder is not configured yet. Add it under Settings → Chat UI → Persona helpers first.");
      return;
    }
    org.meta[id] = { ...(org.meta[id] || {}), folder: cleaned };
    await saveOrg();
    DS.applyPersonaOrganizer?.();
  }

  function closePersonaMenu(menu) {
    try {
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    } catch {}
  }

  function makeMenuItem(label, icon, onClick, disabled = false) {
    const item = document.createElement("li");
    item.role = "menuitem";
    item.tabIndex = disabled ? -1 : 0;
    item.className = "ds-persona-menu-item";
    item.dataset.disabled = disabled ? "1" : "0";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const iconEl = document.createElement("span");
    iconEl.className = "ds-persona-menu-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.textContent = icon;
    item.append(labelEl, iconEl);
    if (!disabled) {
      item.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      item.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onClick();
      });
    }
    return item;
  }

  function menuLooksLikePersonaMenu(menu) {
    return !!menu.querySelector("[data-translate-key='personas:personaCard.dropdown.makeDefault']");
  }

  function ensurePersonaMenuItems(folders) {
    if (!activePersonaMenuId) return;
    const entry = entriesOnPage().find(item => item.id === activePersonaMenuId);
    if (!entry) return;

    const menus = [...document.querySelectorAll("ul[role='menu']")].filter(menu => {
      const rect = menu.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && menuLooksLikePersonaMenu(menu);
    });

    const menu = menus.at(-1);
    if (!menu) return;
    const existing = menu.querySelector(".ds-persona-menu-group");
    if (existing?.dataset.personaId === entry.id) return;
    existing?.remove();

    const pageIds = currentPageOrderedIds();
    const index = pageIds.indexOf(entry.id);
    const data = org.meta[entry.id] || {};

    const wrapper = document.createElement("li");
    wrapper.role = "presentation";
    wrapper.className = "ds-persona-menu-group";
    wrapper.dataset.personaId = entry.id;
    const group = document.createElement("ul");
    group.role = "group";

    group.append(
      makeMenuItem(data.favorite ? "Remove Favorite" : "Favorite", data.favorite ? "★" : "☆", async () => {
        org.meta[entry.id] = { ...data, favorite: !data.favorite };
        await saveOrg();
        closePersonaMenu(menu);
        DS.applyPersonaOrganizer?.();
      }),
      makeMenuItem("Persona Note", "✎", async () => {
        closePersonaMenu(menu);
        await editNote(entry.id);
      }),
      makeMenuItem("Move to Folder…", "▣", async () => {
        closePersonaMenu(menu);
        await moveToFolder(entry.id, folders);
      }),
      makeMenuItem("Save Local Copy", "⬇", async () => {
        closePersonaMenu(menu);
        await saveLocalCopy(entry);
      }),
      makeMenuItem("Duplicate Persona", "⧉", async () => {
        closePersonaMenu(menu);
        await startDuplicate(entry);
      }),
      makeMenuItem("Move Up", "↑", async () => {
        closePersonaMenu(menu);
        await movePersona(entry.id, -1);
      }, index <= 0),
      makeMenuItem("Move Down", "↓", async () => {
        closePersonaMenu(menu);
        await movePersona(entry.id, 1);
      }, index < 0 || index >= pageIds.length - 1)
    );

    wrapper.appendChild(group);
    const deleteGroup = [...menu.children].find(child => cleanText(child.textContent).toLowerCase() === "delete");
    if (deleteGroup) menu.insertBefore(wrapper, deleteGroup);
    else menu.appendChild(wrapper);
  }

  function bindPersonaMenuTracking() {
    if (menuListenerBound) return;
    menuListenerBound = true;
    document.addEventListener("click", event => {
      const trigger = event.target?.closest?.("button[data-slot='trigger'][aria-haspopup='true']");
      if (!trigger) return;
      const card = trigger.closest("div[tabindex='-1'][class*='rounded-large'], div[tabindex='-1']");
      const link = card?.querySelector("a[aria-label='edit-persona'][href*='/personas/edit/']");
      const id = personaId(link);
      if (!id) return;
      activePersonaMenuId = id;
      // Let SpicyChat finish mounting its native menu before QoL decorates it.
      schedulePersonaReconcile(60);
    }, true);
  }

  function pickerLabels() {
    return [...document.querySelectorAll("label")]
      .map(label => ({ label, input: label.querySelector("input[type='radio'][value]") }))
      .filter(item => item.input && cleanText(item.input.value))
      .filter(item => typeof DS.extractPersonaFromModalLabel !== "function" || !!DS.extractPersonaFromModalLabel(item.label));
  }

  function cleanupPickerOrganization() {
    document.querySelectorAll(".ds-persona-picker-meta").forEach(el => el.remove());
    const byParent = new Map();
    document.querySelectorAll("[data-ds-persona-picker-original-index]").forEach(label => {
      const parent = label.parentElement;
      if (parent) {
        if (!byParent.has(parent)) byParent.set(parent, []);
        byParent.get(parent).push(label);
      }
    });
    for (const [parent, labels] of byParent) {
      labels
        .sort((a, b) => Number(a.dataset.dsPersonaPickerOriginalIndex || 0) - Number(b.dataset.dsPersonaPickerOriginalIndex || 0))
        .forEach(label => parent.appendChild(label));
    }
    document.querySelectorAll("[data-ds-persona-picker-original-index]").forEach(label => {
      delete label.dataset.dsPersonaPickerOriginalIndex;
    });
  }

  function addPickerMeta(label, id, settings) {
    label.querySelectorAll(".ds-persona-picker-meta").forEach(el => el.remove());
    if (!settings.personaShowLocalMetaInPicker) return;

    const data = org.meta[id] || {};
    const folder = cleanText(data.folder || "");
    const note = cleanText(data.note || "");
    if (!folder && !note) return;

    const description = label.querySelector("span.line-clamp-3, span[class*='line-clamp-3']");
    const content = description?.parentElement || label.querySelector("div.flex.flex-col") || label;
    const meta = document.createElement("div");
    meta.className = "ds-persona-picker-meta";
    if (folder) {
      const folderChip = document.createElement("span");
      folderChip.className = "ds-persona-picker-folder";
      folderChip.textContent = folder;
      meta.appendChild(folderChip);
    }
    if (note) {
      const noteEl = document.createElement("span");
      noteEl.className = "ds-persona-picker-note";
      noteEl.textContent = note;
      noteEl.title = note;
      meta.appendChild(noteEl);
    }
    if (description && description.parentElement === content) content.insertBefore(meta, description);
    else content.appendChild(meta);
  }

  DS.applyPersonaPickerOrganization = async function applyPersonaPickerOrganization() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enablePersonaOrganizer) {
      cleanupPickerOrganization();
      return;
    }

    await ensureLoaded();
    const items = pickerLabels();
    if (!items.length) return;

    const byParent = new Map();
    for (const item of items) {
      const id = cleanText(item.input.value);
      if (!item.label.dataset.dsPersonaPickerOriginalIndex) {
        item.label.dataset.dsPersonaPickerOriginalIndex = String(byParent.get(item.label.parentElement)?.length || 0);
      }
      if (!byParent.has(item.label.parentElement)) byParent.set(item.label.parentElement, []);
      byParent.get(item.label.parentElement).push({ ...item, id });
      addPickerMeta(item.label, id, settings);
    }

    if (!org.customOrder) return;
    for (const [parent, group] of byParent) {
      if (!parent) continue;
      group.sort((a, b) => rankFor(a.id) - rankFor(b.id) || Number(a.label.dataset.dsPersonaPickerOriginalIndex || 0) - Number(b.label.dataset.dsPersonaPickerOriginalIndex || 0));
      group.forEach(item => parent.appendChild(item.label));
    }
  };

  DS.sortPersonasByOrganization = function sortPersonasByOrganization(personas) {
    if (!org.customOrder || !Array.isArray(personas)) return personas;
    return [...personas].sort((a, b) => rankFor(a?.id) - rankFor(b?.id));
  };

  function cleanup() {
    clearTimeout(personaReconcileTimer);
    personaReconcileTimer = 0;
    document.getElementById("ds-persona-organizer-toolbar")?.remove();
    document.getElementById("ds-persona-local-library-modal")?.remove();
    document.querySelectorAll(".ds-persona-org-actions, .ds-persona-local-note, .ds-persona-menu-group, #ds-persona-duplicate-notice").forEach(el => el.remove());
    document.querySelectorAll(".ds-persona-org-hidden, .ds-persona-drop-target, .ds-persona-dragging").forEach(el => {
      el.classList.remove("ds-persona-org-hidden", "ds-persona-drop-target", "ds-persona-dragging");
    });

    const byParent = new Map();
    document.querySelectorAll("[data-ds-persona-original-index]").forEach(card => {
      const parent = card.parentElement;
      if (!parent) return;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(card);
    });
    for (const [parent, cards] of byParent) {
      cards
        .sort((a, b) => Number(a.dataset.dsPersonaOriginalIndex || 0) - Number(b.dataset.dsPersonaOriginalIndex || 0))
        .forEach(card => parent.appendChild(card));
    }

    cleanupPickerOrganization();
    DS.state.personaOrganizerWasActive = false;
  }

  DS.applyPersonaOrganizer = async function applyPersonaOrganizer() {
    const settings = DS.state?.settings || {};
    const onListPage = location.pathname === "/personas" || location.pathname === "/personas/";
    const onCreatePage = location.pathname === "/personas/create";

    if (!settings.enabled || !settings.enablePersonaOrganizer) {
      if (DS.state.personaOrganizerWasActive) cleanup();
      return;
    }

    if (onListPage) bindPersonaMenuTracking();

    // SpicyChat can be interacted with before QoL has finished initializing.
    // If its native Persona menu is already open, leave the card DOM completely
    // alone until that menu closes. Mounting controls/reordering at this point
    // can attach QoL into a transient React layout and shift the whole card UI.
    if (onListPage && personaNativeMenuOpen()) {
      const trigger = openPersonaMenuTrigger();
      const link = trigger?.closest("div[tabindex='-1'][class*='rounded-large'], div[tabindex='-1']")
        ?.querySelector("a[aria-label='edit-persona'][href*='/personas/edit/']");
      const id = personaId(link);
      if (id) activePersonaMenuId = id;
      DS.state.personaOrganizerWasActive = true;
      schedulePersonaReconcile(160);
      return;
    }

    // Re-appending a Persona card or rewriting its native <select> while the
    // folder picker is open closes the browser popup in Chromium and Firefox.
    // Hold organizer reconciliation until that interaction has finished.
    if (onListPage && folderSelectInteractionActive()) {
      DS.state.personaOrganizerWasActive = true;
      return;
    }

    await ensureLoaded();

    if (onCreatePage) {
      DS.state.personaOrganizerWasActive = true;
      await applyDuplicateDraft();
      return;
    }

    if (!onListPage) {
      await DS.applyPersonaPickerOrganization?.();
      return;
    }

    DS.state.personaOrganizerWasActive = true;
    DS.state.personaOrgFilter ||= "all";
    DS.state.personaOrgSort ||= org.customOrder ? "custom" : "native";

    const folders = parseFolders(settings);
    const entries = entriesOnPage();
    await ensureOrder(entries);

    entries.forEach(entry => ensureCardControls(entry, folders));
    ensureToolbar(folders);
    applySort(entries);
    applyFilter(entries, folders);
    ensurePersonaMenuItems(folders);
  };

  DS.removePersonaOrganizer = cleanup;

  try {
    chrome.storage.onChanged.addListener(changes => {
      if (!changes[ORG_KEY]) return;
      org = normalizeOrg(changes[ORG_KEY].newValue);
      loaded = true;
      DS.applyPersonaOrganizer?.();
      DS.applyPersonaPickerOrganization?.();
    });
  } catch {}
})();
