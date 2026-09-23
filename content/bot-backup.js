(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const PANEL_ID = "ds-bot-backup-tools";
  const STYLE_ID = "ds-bot-backup-style";
  const CHATBOT_LOREBOOK_LINKS_KEY = "chatbotLorebookLinks";
  let activeForm = null;
  let saveTimer = null;
  let lastSavedSignature = "";
  let listenersInstalled = false;
  let lastPanelAutoState = null;

  function clean(value, max = 18000) {
    return String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, max);
  }

  function normalizedPath() {
    return String(location.pathname || "")
      .replace(/^\/[a-z]{2}(?=\/)/i, "")
      .replace(/\/+$/, "") || "/";
  }

  function editorIdFromPage(path) {
    let match = path.match(/^\/chatbot\/edit\/([^/]+)/i);
    if (match) return clean(decodeURIComponent(match[1]), 200);

    match = path.match(/^\/chatbot\/([^/]+)\/edit(?:\/|$)/i);
    if (match) return clean(decodeURIComponent(match[1]), 200);

    const params = new URLSearchParams(location.search || "");
    const queryId = clean(params.get("id") || params.get("chatbotId") || params.get("characterId"), 200);
    if (queryId) return queryId;

    const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
    try {
      const canonicalPath = new URL(canonical, location.href).pathname.replace(/^\/[a-z]{2}(?=\/)/i, "");
      match = canonicalPath.match(/^\/chatbot\/edit\/([^/]+)/i) || canonicalPath.match(/^\/chatbot\/([^/]+)\/edit(?:\/|$)/i);
      if (match) return clean(decodeURIComponent(match[1]), 200);
    } catch {}

    return "";
  }

  function editorInfo() {
    const path = normalizedPath();
    if (path === "/chatbot/create" || path.startsWith("/chatbot/create/") || path === "/create/chatbot" || path === "/create") {
      return { mode: "create", id: "", path };
    }

    const isEditPage = path === "/chatbot/edit" ||
      path.startsWith("/chatbot/edit/") ||
      /^\/chatbot\/[^/]+\/edit(?:\/|$)/i.test(path);
    if (!isEditPage) return null;

    return { mode: "edit", id: editorIdFromPage(path), path };
  }

  function settings() {
    return DS.state?.settings || {};
  }

  function editorForm() {
    if (!editorInfo()) return null;
    const field = document.querySelector(
      '[data-field-name="name"] input, input[name="name"], [data-field-name="greeting"] textarea, textarea[name="greeting"], textarea[name="persona"], textarea[name="personality"]'
    );
    const direct = field?.closest?.("form");
    if (direct) return direct;

    const explicit = document.querySelector("form[data-testid*='Chatbot'], form[data-testid*='Character']");
    if (explicit) return explicit;

    let best = null;
    let bestScore = 0;
    for (const form of document.querySelectorAll("form")) {
      if (form.closest?.(`#${PANEL_ID},#ds-qol-panel,[data-ds-owned='1']`)) continue;
      let score = 0;
      const controls = form.querySelectorAll("textarea,input[type='text'],input:not([type]),select");
      score += Math.min(8, controls.length);
      for (const control of controls) if (semanticKey(control)) score += 4;
      if (form.querySelector("button[type='submit']")) score += 2;
      if (score > bestScore) { best = form; bestScore = score; }
    }
    return bestScore >= 6 ? best : null;
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
    if (holder) parts.push(holder.textContent);
    return clean(parts.filter(Boolean).join(" "), 1200).toLowerCase();
  }

  function semanticKey(control) {
    if (!control || control.disabled || control.closest?.(`#${PANEL_ID},#ds-qol-panel`)) return "";
    const tag = control.tagName?.toLowerCase();
    const type = String(control.type || "").toLowerCase();
    if (!(tag === "textarea" || tag === "select" || (tag === "input" && ["", "text"].includes(type)))) return "";
    const text = fieldText(control);
    if (!text || /\b(search|add tags?|avatar|image upload|website|report|feedback)\b/i.test(text)) return "";
    if (/\b(example dialogue|example conversation|examples?)\b/i.test(text)) return "exampleDialogues";
    if (/\b(first message|greeting|initial message)\b/i.test(text)) return "greeting";
    if (/\b(personality|definition|character details|persona)\b/i.test(text)) return "personality";
    if (/\bscenario\b/i.test(text)) return "scenario";
    if (/\b(title|tagline)\b/i.test(text)) return "title";
    if (/\b(description|character description)\b/i.test(text)) return "description";
    if (/\b(chatbot name|character name|name field)\b/i.test(text) || /^name(?:\s|$)/i.test(text)) return "name";
    return "";
  }

  function directField(key, root = activeForm || editorForm() || document) {
    const selectors = {
      name: ["[name='name']"],
      title: ["[name='title']", "[name='tagline']"],
      description: ["[name='description']"],
      greeting: ["[name='greeting']", "[name='first_message']", "[name='firstMessage']"],
      personality: ["[name='persona']", "[name='personality']", "[name='definition']"],
      scenario: ["[name='scenario']"],
      exampleDialogues: ["[name='dialogue']", "[name='example_dialogue']", "[name='exampleDialogues']"]
    }[key] || [];
    for (const selector of selectors) {
      const field = root.querySelector?.(selector);
      if (field && !field.closest?.(`#${PANEL_ID},#ds-qol-panel`)) return field;
    }
    return null;
  }

  function captureTextFields() {
    const result = {};
    const root = activeForm || editorForm() || document;
    const keys = ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues"];
    for (const key of keys) {
      const direct = directField(key, root);
      if (direct) result[key] = clean(direct.value, key === "personality" || key === "exampleDialogues" ? 18000 : 12000);
    }
    if (keys.every(key => result[key])) return result;
    for (const control of root.querySelectorAll?.("textarea,input,select") || []) {
      const key = semanticKey(control);
      if (!key || result[key]) continue;
      result[key] = clean(control.value, key === "personality" || key === "exampleDialogues" ? 18000 : 12000);
    }
    return result;
  }

  function selectedVisibility() {
    const candidates = [...document.querySelectorAll("button[aria-labelledby],button[aria-pressed],button[data-selected]")];
    for (const button of candidates) {
      if (button.closest(`#${PANEL_ID},#ds-qol-panel`)) continue;
      const label = clean(button.getAttribute("aria-labelledby") || button.textContent, 100).toLowerCase();
      const mode = label.includes("unlisted") || label === "hidden" ? "Unlisted" : label.includes("private") ? "Private" : label.includes("public") ? "Public" : "";
      if (!mode) continue;
      const selected = button.getAttribute("aria-pressed") === "true" || button.dataset.selected === "true" || button.dataset.state === "active" || /(?:^|\s)(?:bg-black|bg-blue-10|dark:bg-white)(?:\s|$)/.test(String(button.className || ""));
      if (selected) return mode;
    }
    return "";
  }

  function selectedTags() {
    const inputs = [...document.querySelectorAll('input[placeholder*="tag" i]')]
      .filter(node => !node.closest(`#${PANEL_ID},#ds-qol-panel`));
    const label = [...document.querySelectorAll("label,p,span,strong")]
      .find(node => clean(node.textContent, 80).toLowerCase() === "tags" && !node.closest(`#${PANEL_ID},#ds-qol-panel`));
    const roots = [];
    for (const input of inputs) {
      let root = input.parentElement;
      for (let i = 0; root && i < 5; i += 1, root = root.parentElement) roots.push(root);
    }
    if (label) {
      let root = label.parentElement;
      for (let i = 0; root && i < 5; i += 1, root = root.parentElement) roots.push(root);
    }
    for (const root of roots) {
      const tags = [];
      root.querySelectorAll("button,[data-selected='true'],[aria-pressed='true']").forEach(node => {
        if (node.closest?.(`#${PANEL_ID},#ds-qol-panel`)) return;
        const text = clean(node.textContent, 120);
        if (!text || text.length > 60 || /^(add tags?|all tags|search|clear|remove|suggest tag|x)$/i.test(text)) return;
        const selected = node.getAttribute?.("aria-pressed") === "true" || node.dataset?.selected === "true" || node.dataset?.state === "active" || !!node.querySelector?.("svg.lucide-x,svg[class*='lucide-x']");
        if (selected) tags.push(text);
      });
      if (tags.length) return [...new Set(tags)].slice(0, 30).join(", ");
    }
    return "";
  }

  function currentAvatarUrl() {
    const upload = document.querySelector("input[type='file'][accept*='image'],input[data-testid='AvatarCreateUploadInput']");
    let root = upload?.parentElement || activeForm || editorForm();
    for (let depth = 0; root && depth < 5; depth += 1, root = root.parentElement) {
      const image = [...root.querySelectorAll?.("img") || []].find(img => {
        const src = String(img.getAttribute("src") || "");
        return src && !/logo|icon|emoji/i.test(String(img.alt || ""));
      });
      if (image) return String(image.getAttribute("src") || "").trim();
    }
    return "";
  }

  const BACKUP_FIELD_KEYS = [
    "name", "title", "description", "greeting", "personality",
    "scenario", "exampleDialogues", "tags", "visibility", "image"
  ];

  function transientModerationState() {
    return !!(
      document.querySelector('[data-translate-key="chatbot:moderation.underReview"]') ||
      [...document.querySelectorAll("span,p,strong")].some(node => clean(node.textContent, 80).toLowerCase() === "under review")
    );
  }

  function sanitizeBackupFields(rawFields = {}) {
    const source = rawFields && typeof rawFields === "object" ? rawFields : {};
    const fields = {};
    for (const key of BACKUP_FIELD_KEYS) {
      const limit = key === "personality" || key === "exampleDialogues" ? 18000 : 12000;
      fields[key] = clean(source[key], limit);
    }
    return fields;
  }

  function editorReadOnlyState() {
    const controls = ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues"]
      .map(directField)
      .filter(Boolean);
    if (!controls.length) return false;
    const locked = controls.filter(control => control.disabled || control.readOnly || control.getAttribute?.("aria-disabled") === "true").length;
    return locked >= Math.max(1, Math.ceil(controls.length * 0.6));
  }

  function captureProfile() {
    const info = editorInfo();
    if (!info) return null;
    const captured = captureTextFields();
    captured.tags = selectedTags();
    captured.visibility = selectedVisibility();
    captured.image = currentAvatarUrl();
    // Only actual creator fields enter the backup payload/signature. SpicyChat's
    // moderation banner (for example Under Review) is transient site state and
    // must never create a revision, appear in an export, or survive review.
    const fields = sanitizeBackupFields(captured);
    const coverage = BACKUP_FIELD_KEYS.filter(key => clean(fields[key]));
    if (!coverage.length) return null;
    return { info, fields, coverage, readOnlyReview: transientModerationState(), readOnlyEditor: editorReadOnlyState() };
  }

  function signature(profile) {
    if (!profile) return "";
    return JSON.stringify(sanitizeBackupFields(profile.fields));
  }

  function normalizedVersionTags(value) {
    const values = String(value || "")
      .split(/\s*,\s*/g)
      .map(tag => clean(tag, 120))
      .filter(Boolean);
    const deduped = [...new Map(values.map(tag => [tag.toLocaleLowerCase(), tag])).values()];
    deduped.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return deduped.join(", ");
  }

  async function versionSnapshot(profile, reason = "Own bot editor") {
    if (!profile?.info?.id) return null;
    const fields = sanitizeBackupFields(profile.fields);
    const result = await DS.storageGet?.([CHATBOT_LOREBOOK_LINKS_KEY]) || {};
    const relations = result[CHATBOT_LOREBOOK_LINKS_KEY] && typeof result[CHATBOT_LOREBOOK_LINKS_KEY] === "object"
      ? result[CHATBOT_LOREBOOK_LINKS_KEY]
      : {};
    const relation = relations[profile.info.id] && typeof relations[profile.info.id] === "object"
      ? relations[profile.info.id]
      : {};

    return {
      capturedAt: Date.now(),
      source: reason,
      content: {
        name: fields.name || "",
        title: fields.title || "",
        greeting: fields.greeting || "",
        personality: fields.personality || "",
        scenario: fields.scenario || "",
        exampleDialogues: fields.exampleDialogues || "",
        tags: normalizedVersionTags(fields.tags),
        image: fields.image || "",
        lorebook: {
          id: clean(relation.lorebookId || "", 240),
          name: clean(relation.lorebookName || "", 500)
        }
      },
      state: {
        visibility: fields.visibility || "",
        moderation: profile.readOnlyReview ? "under-review" : "",
        capturedAt: Date.now()
      }
    };
  }

  function versionSnapshotSignature(snapshot) {
    if (!snapshot?.content) return "";
    return JSON.stringify(snapshot.content);
  }

  function portableJson(profile) {
    const fields = sanitizeBackupFields(profile?.fields || {});
    const info = profile?.info || { id: "", mode: "create" };
    const tags = [...new Set(String(fields.tags || "").split(/\s*,\s*/g).map(tag => clean(tag)).filter(Boolean))];
    const personality = fields.personality || "";
    return {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: fields.name || "Untitled chatbot",
        title: fields.title || "",
        // Character Card v2 tools commonly treat description as definition-like
        // text. Duplicate suppression in QoL Import keeps this from being added
        // twice when personality contains the same text.
        description: personality,
        personality,
        scenario: fields.scenario || "",
        first_mes: fields.greeting || "",
        mes_example: fields.exampleDialogues || "",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: [],
        tags,
        creator: "",
        character_version: "",
        extensions: {
          spicychat_qol: {
            export_format: "spicychat-qol-own-bot-backup",
            export_version: 2,
            exported_at: new Date().toISOString(),
            spicychat_id: info.id || "",
            avatar_url: fields.image || "",
            visibility: fields.visibility || "",
            source: info.mode === "edit" ? "SpicyChat bot editor" : "SpicyChat bot creator",
            spicychat_fields: {
              title: fields.title || "",
              description: fields.description || "",
              greeting: fields.greeting || "",
              personality: fields.personality || "",
              scenario: fields.scenario || "",
              example_dialogues: fields.exampleDialogues || "",
              tags,
              visibility: fields.visibility || ""
            }
          }
        }
      }
    };
  }

  function safeFilename(name) {
    return (clean(name, 100) || "spicychat-bot")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90) || "spicychat-bot";
  }

  function downloadJson(payload, filename) {
    const text = JSON.stringify(payload, null, 2);
    if (typeof DS.downloadTextFile === "function") {
      return DS.downloadTextFile(text, filename, "application/json;charset=utf-8", { requestPermission: true });
    }
  }

  async function saveOwnBackup(reason = "Own bot editor", options = {}) {
    const profile = captureProfile();
    if (!profile?.info?.id || profile.info.mode !== "edit") return false;

    const version = await versionSnapshot(profile, reason);
    const nextSignature = `${signature(profile)}|${versionSnapshotSignature(version)}`;

    if (!options.manual && profile.readOnlyEditor) {
      if (nextSignature) lastSavedSignature = nextSignature;
      return false;
    }
    if (!options.manual && nextSignature && nextSignature === lastSavedSignature) return false;

    const fields = sanitizeBackupFields(profile.fields);
    const snapshot = {
      id: profile.info.id,
      name: fields.name || profile.info.id,
      creator: "",
      image: fields.image || "",
      profileUrl: `https://spicychat.ai/chatbot/${profile.info.id}`,
      firstSavedAt: Date.now(),
      lastSavedAt: Date.now(),
      lastAvailableAt: Date.now(),
      source: reason,
      ownBot: true,
      fields,
      coverage: profile.coverage
    };

    const ok = await DS.saveBotArchiveSnapshot?.(snapshot, {
      trackRevision: true,
      manual: !!options.manual,
      label: clean(options.label || (options.manual ? "Manual backup" : ""), 160),
      versionSnapshot: version
    });

    if (ok) {
      lastSavedSignature = nextSignature;
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.ownBotBackupSaves = Number(counters.ownBotBackupSaves || 0) + 1;
    }
    return !!ok;
  }

  DS.saveCurrentOwnBotBackup = (reason = "Manual own-bot backup", options = {}) =>
    saveOwnBackup(reason, { ...options, manual: options.manual !== false });

  function scheduleOwnBackup() {
    const cfg = settings();
    const info = editorInfo();
    if (!cfg.enabled || !cfg.botArchiveOwnEditorBackups || info?.mode !== "edit" || !info.id || editorReadOnlyState()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveOwnBackup("Own bot editor idle backup").catch(() => {});
    }, 5000);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0;padding:5px 7px;border:1px solid rgba(148,163,184,.24);border-radius:8px;background:rgba(31,41,55,.09);font:12px/1.25 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #${PANEL_ID} .ds-bot-backup-copy{display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 280px}
      #${PANEL_ID} .ds-bot-backup-copy strong{display:inline;white-space:nowrap;font-size:12px}
      #${PANEL_ID} .ds-bot-backup-copy small{opacity:.72;min-width:0}
      #${PANEL_ID} .ds-bot-backup-actions{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
      #${PANEL_ID} button{appearance:none;border:1px solid rgba(148,163,184,.32);border-radius:6px;background:rgba(55,65,81,.58);color:inherit;padding:4px 7px;cursor:pointer;font:600 11px/1.15 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #${PANEL_ID} button:hover{background:rgba(75,85,99,.82)}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setStatus(text) {
    const node = document.querySelector(`#${PANEL_ID} [data-role='status']`);
    const next = String(text || "");
    if (node && node.textContent !== next) node.textContent = next;
  }

  function relativeAge(timestamp) {
    const time = Number(timestamp) || 0;
    if (!time) return "not saved yet";
    const delta = Math.max(0, Date.now() - time);
    if (delta < 60_000) return "just now";
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  async function refreshPanelStatus(message = "") {
    const info = editorInfo();
    if (!info) return;
    const automatic = !!settings().botArchiveOwnEditorBackups;
    lastPanelAutoState = automatic;
    if (message) {
      setStatus(message);
      return;
    }
    if (info.mode !== "edit" || !info.id) {
      setStatus(`Automatic backup: ${automatic ? "On" : "Off"} · Draft export is available.`);
      return;
    }
    const result = await DS.storageGet?.([DS.BOT_ARCHIVE_KEY || "botArchive"]) || {};
    const entry = result[DS.BOT_ARCHIVE_KEY || "botArchive"]?.meta?.[info.id] || null;
    const revisions = Array.isArray(entry?.revisions) ? entry.revisions.length : 0;
    const manuals = Array.isArray(entry?.manualBackups) ? entry.manualBackups.length : 0;
    const versions = Array.isArray(entry?.versions) ? entry.versions.length : 0;
    const readOnly = editorReadOnlyState();
    const parts = [
      `Automatic backup: ${automatic ? "On" : "Off"}`,
      `Last backup: ${relativeAge(entry?.lastSavedAt)}`,
      `${versions} bot version${versions === 1 ? "" : "s"}`,
      `${revisions} safety revision${revisions === 1 ? "" : "s"}`,
      `${manuals} manual backup${manuals === 1 ? "" : "s"}`
    ];
    if (readOnly) parts.push("editor is read-only; automatic revisions are paused; manual backup still works");
    if (transientModerationState()) parts.push("review status is not saved");
    setStatus(parts.join(" · "));
  }

  function openBackupHistory(info) {
    if (!info?.id) return;
    DS.openOptionsTarget?.("bot-tools", { backup: info.id });
  }

  function setNativeFormValue(control, value) {
    if (!control) return false;
    const text = String(value ?? "");
    const proto = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    try {
      if (setter) setter.call(control, text);
      else control.value = text;
    } catch { control.value = text; }
    control.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    control.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  function importedBotFields(payload) {
    const root = payload && typeof payload === "object" ? payload : {};
    const data = root.data && typeof root.data === "object" ? root.data : root;
    const qol = data.extensions?.spicychat_qol && typeof data.extensions.spicychat_qol === "object"
      ? data.extensions.spicychat_qol
      : {};
    const sc = qol.spicychat_fields && typeof qol.spicychat_fields === "object" ? qol.spicychat_fields : {};
    const tags = Array.isArray(sc.tags) && sc.tags.length
      ? sc.tags
      : (Array.isArray(data.tags) ? data.tags : []);
    return {
      name: clean(data.name, 200),
      title: clean(sc.title || data.title, 500),
      greeting: clean(sc.greeting || data.first_mes || data.first_message, 12000),
      personality: clean(sc.personality || data.personality || data.description, 18000),
      scenario: clean(sc.scenario || data.scenario, 12000),
      exampleDialogues: clean(sc.example_dialogues || data.mes_example, 18000),
      visibility: clean(sc.visibility || qol.visibility, 80),
      tags: [...new Set(tags.map(tag => clean(tag, 100)).filter(Boolean))].slice(0, 12)
    };
  }

  async function applyImportedVisibility(value) {
    const wanted = clean(value, 80).toLowerCase();
    if (!wanted) return false;
    const normalized = wanted === "hidden" ? "unlisted" : wanted;
    if (!["public", "private", "unlisted"].includes(normalized)) return false;
    const candidates = [...document.querySelectorAll("button[aria-labelledby]")];
    const button = candidates.find(node => clean(node.getAttribute("aria-labelledby"), 80).toLowerCase() === normalized);
    if (!button) return false;
    if (typeof DS.realClick === "function") DS.realClick(button); else button.click();
    await DS.sleep?.(80);
    return true;
  }

  async function importPortableBotJson(file) {
    if (!file) throw new Error("No JSON file selected.");
    const raw = await file.text();
    const payload = JSON.parse(raw);
    const fields = importedBotFields(payload);
    if (!fields.name && !fields.greeting && !fields.personality) throw new Error("No supported chatbot fields were found in that JSON file.");

    const form = editorForm();
    if (!form) throw new Error("SpicyChat's chatbot form is not ready yet.");
    const mapping = [
      ["name", fields.name],
      ["title", fields.title],
      ["greeting", fields.greeting],
      ["persona", fields.personality],
      ["scenario", fields.scenario],
      ["dialogue", fields.exampleDialogues]
    ];
    let filled = 0;
    for (const [name, value] of mapping) {
      if (!value) continue;
      const control = form.querySelector(`[name="${name}"]`);
      if (setNativeFormValue(control, value)) filled += 1;
    }

    if (fields.visibility) await applyImportedVisibility(fields.visibility);

    let tagMessage = "";
    if (fields.tags.length) {
      // creation-bulk-input.js is loaded after this module. By click time it is
      // normally ready, but wait briefly instead of silently dropping tags if a
      // slow WebView is still mounting the rest of QoL.
      for (let attempt = 0; attempt < 12 && typeof DS.insertChatbotTagsFromList !== "function"; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (typeof DS.insertChatbotTagsFromList === "function") tagMessage = await DS.insertChatbotTagsFromList(fields.tags);
      else tagMessage = `${fields.tags.length} saved tag${fields.tags.length === 1 ? "" : "s"} could not be restored because the native tag picker was not ready.`;
    }

    // Lorebooks are intentionally NOT imported here. They are a separate QoL
    // backup system and this avoids SpicyChat's Character Card lorebook parser
    // rejecting an otherwise valid bot restore.
    return { filled, tags: fields.tags.length, tagMessage };
  }

  function buildPanel(form) {
    ensureStyle();
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.dataset.dsBotBackup = "1";

    const copy = document.createElement("div");
    copy.className = "ds-bot-backup-copy";
    const title = document.createElement("strong");
    title.textContent = "QoL Bot Backup";
    const status = document.createElement("small");
    status.dataset.role = "status";
    const info = editorInfo();
    status.textContent = "Checking local backup…";
    copy.append(title, status);

    const actions = document.createElement("div");
    actions.className = "ds-bot-backup-actions";

    if (info?.mode === "create") {
      const importInput = document.createElement("input");
      importInput.type = "file";
      importInput.accept = ".json,application/json";
      importInput.hidden = true;
      importInput.dataset.dsBotJsonImport = "1";

      const importButton = document.createElement("button");
      importButton.type = "button";
      importButton.textContent = "Import bot JSON";
      importButton.title = "Restore a QoL/Character Card JSON into the SpicyChat form. Lorebooks are intentionally ignored.";
      importButton.addEventListener("click", () => importInput.click());
      importInput.addEventListener("change", async () => {
        const file = importInput.files?.[0] || null;
        importInput.value = "";
        if (!file) return;
        importButton.disabled = true;
        setStatus("Importing bot fields and tags…");
        try {
          const result = await importPortableBotJson(file);
          const suffix = result.tagMessage ? ` · ${result.tagMessage}` : "";
          setStatus(`Imported ${result.filled} bot field${result.filled === 1 ? "" : "s"}. Lorebook data was ignored.${suffix}`);
        } catch (error) {
          setStatus(`Import failed: ${error?.message || "invalid bot JSON"}`);
        } finally {
          importButton.disabled = false;
        }
      });
      actions.append(importButton, importInput);
    }

    if (editorInfo()?.mode === "edit") {
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Save backup now";
      save.addEventListener("click", async () => {
        save.disabled = true;
        setStatus("Saving local bot backup…");
        const ok = await saveOwnBackup("Manual own-bot backup", { manual: true, label: "Manual backup" });
        await refreshPanelStatus(ok ? "Manual backup saved locally. Refreshing backup status…" : "Could not save a manual backup yet.");
        if (ok) await refreshPanelStatus();
        save.disabled = false;
      });
      actions.appendChild(save);
    }

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = "Export bot JSON";
    exportButton.addEventListener("click", () => {
      const profile = captureProfile();
      if (!profile) return setStatus("No chatbot fields were found yet.");
      const payload = portableJson(profile);
      downloadJson(payload, `${safeFilename(profile.fields.name)}-spicychat-backup.json`);
      setStatus("Importable Character Card v2 JSON downloaded.");
    });
    actions.appendChild(exportButton);

    if (info?.mode === "edit" && info.id) {
      const history = document.createElement("button");
      history.type = "button";
      history.textContent = "Version history";
      history.addEventListener("click", () => openBackupHistory(info));
      actions.appendChild(history);
    }

    panel.append(copy, actions);
    // Keep the controls inside the actual chatbot editor card. Never fall back
    // to body/root placement, which can turn this tiny helper into a full-width
    // page banner while React is still mounting.
    if (!form?.parentElement) return null;
    form.parentElement.insertBefore(panel, form);
    refreshPanelStatus().catch(() => {});
    return panel;
  }

  function onEditorInput(event) {
    if (!activeForm || !activeForm.contains(event.target)) return;
    scheduleOwnBackup();
  }

  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("input", onEditorInput, true);
    document.addEventListener("change", onEditorInput, true);
  }

  function removeListeners() {
    if (!listenersInstalled) return;
    listenersInstalled = false;
    document.removeEventListener("input", onEditorInput, true);
    document.removeEventListener("change", onEditorInput, true);
  }

  function cleanup() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    removeListeners();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    activeForm = null;
    lastSavedSignature = "";
    lastPanelAutoState = null;
    DS.state.botBackupWasActive = false;
  }

  DS.applyBotBackupTools = function applyBotBackupTools() {
    const cfg = settings();
    const info = editorInfo();
    const shouldShow = !!(cfg.enabled && cfg.botBackupToolsEnabled && info);
    if (!shouldShow) {
      if (DS.state.botBackupWasActive || document.getElementById(PANEL_ID)) cleanup();
      return;
    }

    const form = editorForm();
    if (!form) return;
    DS.state.botBackupWasActive = true;
    activeForm = form;

    const readOnly = editorReadOnlyState();
    if (cfg.botArchiveOwnEditorBackups && !readOnly) installListeners();
    else {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      removeListeners();
    }

    if (!document.getElementById(PANEL_ID)) buildPanel(form);
    if (lastPanelAutoState !== !!cfg.botArchiveOwnEditorBackups) refreshPanelStatus().catch(() => {});

    // Automatic backups are opt-in. Manual Save/Export/Version history stay
    // available on every supported edit page. Meaningful bot versions are
    // stored separately from rotating safety revisions/manual checkpoints. A
    // read-only editor only establishes a baseline so native rerenders cannot
    // create fake automatic revisions.
    if (cfg.botArchiveOwnEditorBackups && info.mode === "edit" && info.id && !lastSavedSignature) {
      if (readOnly) {
        lastSavedSignature = signature(captureProfile());
      } else {
        setTimeout(async () => {
          const saved = await saveOwnBackup("Own bot editor opened").catch(() => false);
          if (saved) refreshPanelStatus().catch(() => {});
        }, 900);
      }
    }
  };

  DS.removeBotBackupTools = cleanup;
})();
