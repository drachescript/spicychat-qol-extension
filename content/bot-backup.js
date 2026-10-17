// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const PANEL_ID = "ds-bot-backup-tools";
  const STYLE_ID = "ds-bot-backup-style";
  const IMPORT_DIALOG_ID = "ds-bot-import-preview";
  const MAX_BOT_IMPORT_SIZE = 16 * 1024 * 1024;
  const MAX_IMPORT_ENTRY_SIZE = 512 * 1024;
  const MAX_IMPORT_ARCHIVE_FILES = 60;
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
    const op = DS.diagOperationStart?.("creator-backup", "save-own-bot", {
      botId: profile.info.id,
      reason,
      manual: !!options.manual,
      readOnly: !!profile.readOnlyEditor
    });
    if (options.manual) DS.diagUserAction?.("creator-backup", "manual-save", { botId: profile.info.id });

    const version = await versionSnapshot(profile, reason);
    const nextSignature = `${signature(profile)}|${versionSnapshotSignature(version)}`;

    if (!options.manual && profile.readOnlyEditor) {
      if (nextSignature) lastSavedSignature = nextSignature;
      DS.diagOperationEnd?.(op, { outcome: "skipped-read-only" });
      return false;
    }
    if (!options.manual && nextSignature && nextSignature === lastSavedSignature) {
      DS.diagOperationEnd?.(op, { outcome: "unchanged" });
      return false;
    }

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
    DS.diagOperationEnd?.(op, { outcome: ok ? "ok" : "failed", coverageFields: Object.keys(profile.coverage || {}).length });
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
      #${IMPORT_DIALOG_ID}{position:fixed;inset:0;z-index:2147483646;display:flex;justify-content:center;align-items:center;padding:12px;background:rgba(0,0,0,.73);box-sizing:border-box}
      #${IMPORT_DIALOG_ID} section{background:#171b26;color:#f5f5f6;box-sizing:border-box;max-width:680px;width:100%;max-height:90vh;overflow:auto;border:1px solid #586072;border-radius:12px;padding:18px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 15px 50px #0009}
      #${IMPORT_DIALOG_ID} h2{font-size:18px;font-weight:700;margin:0 0 8px}
      #${IMPORT_DIALOG_ID} p{margin:6px 0 10px}
      #${IMPORT_DIALOG_ID} select{width:100%;margin:8px 0;padding:6px;background:#252b38;color:inherit;border:1px solid #677187;border-radius:6px}
      #${IMPORT_DIALOG_ID} .ds-bot-import-warning{color:#ffd17b}
      #${IMPORT_DIALOG_ID} .ds-bot-import-fields{display:grid;gap:7px;margin:12px 0}
      #${IMPORT_DIALOG_ID} .ds-bot-import-field{background:#262c3a;border:1px solid #40495b;border-radius:8px;padding:8px 10px;overflow-wrap:anywhere}
      #${IMPORT_DIALOG_ID} .ds-bot-import-field label{display:block;cursor:pointer;font-weight:600}
      #${IMPORT_DIALOG_ID} .ds-bot-import-field input{margin-right:5px}
      #${IMPORT_DIALOG_ID} details{margin-top:4px;font-size:12px}
      #${IMPORT_DIALOG_ID} summary{cursor:pointer;opacity:.85}
      #${IMPORT_DIALOG_ID} pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#111520;border-radius:6px;max-height:190px;overflow:auto;padding:8px;font:12px/1.4 ui-monospace,monospace}
      #${IMPORT_DIALOG_ID} .ds-bot-import-footer{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      #${IMPORT_DIALOG_ID} button{appearance:none;border:1px solid #616c80;border-radius:6px;background:#293043;color:white;padding:8px 13px;cursor:pointer}
      #${IMPORT_DIALOG_ID} .ds-bot-import-apply{background:#354b86}
      #${IMPORT_DIALOG_ID} button:disabled{opacity:.55;cursor:not-allowed}
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
    const archiveKey = DS.BOT_ARCHIVE_KEY || "botArchive";
    const entry = typeof DS.largeStorageGetRecord === "function"
      ? await DS.largeStorageGetRecord(archiveKey, info.id)
      : ((await DS.storageGet?.([archiveKey]) || {})[archiveKey]?.meta?.[info.id] || null);
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
      description: clean(sc.description || (data.description && data.description !== (sc.personality || data.personality) ? data.description : ""), 12000),
      greeting: clean(sc.greeting || data.first_mes || data.first_message, 12000),
      personality: clean(sc.personality || data.personality || data.description, 18000),
      scenario: clean(sc.scenario || data.scenario, 12000),
      exampleDialogues: clean(sc.example_dialogues || data.mes_example, 18000),
      visibility: clean(sc.visibility || qol.visibility, 80),
      tags: [...new Set(tags.map(tag => clean(tag, 100)).filter(Boolean))].slice(0, 12)
    };
  }

  // JSON backups and field-oriented text replacements both enter the same
  // review workflow. No imported file is uploaded or sent to SpicyChat.
  function parseBotReplacementText(raw) {
    const fields = {};
    const map = {
      "NAME": "name", "TITLE": "title", "BOT TITLE": "title",
      "DESCRIPTION": "description", "GREETING": "greeting", "FIRST MESSAGE": "greeting",
      "PERSONALITY": "personality", "PERSONALITY — PLIST": "personality",
      "PERSONALITY - PLIST": "personality", "PERSONALITY – PLIST": "personality",
      "SCENARIO": "scenario", "EXAMPLE DIALOGUE": "exampleDialogues",
      "EXAMPLE DIALOGUES": "exampleDialogues", "EXAMPLE CONVERSATION": "exampleDialogues",
      "BOT TAGS": "tags", "TAGS": "tags"
    };
    let current = "";
    const chunks = {};
    for (const line of String(raw || "").replace(/\r\n?/g, "\n").split("\n")) {
      const heading = line.trim().replace(/\s+/g, " ").toUpperCase();
      if (Object.prototype.hasOwnProperty.call(map, heading)) {
        current = map[heading];
        chunks[current] = [];
      } else if (current) {
        chunks[current].push(line);
      }
    }
    for (const [key, lines] of Object.entries(chunks)) {
      const value = clean(lines.join("\n"), MAX_IMPORT_ENTRY_SIZE);
      if (key === "tags") {
        fields.tags = [...new Set(value.split(/[,;\n]/).map(tag => clean(tag, 100)).filter(Boolean))].slice(0, 12);
      } else if (value) {
        fields[key] = clean(value, key === "name" ? 200 : key === "title" ? 500 : 18000);
      }
    }
    if (!fields.greeting && !fields.personality && !fields.scenario && !fields.exampleDialogues) {
      throw new Error("This text file has no recognized bot replacement fields.");
    }
    return fields;
  }

  function readBotJson(raw) {
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw new Error("That file is not valid bot JSON."); }
    const fields = importedBotFields(payload);
    if (!fields.greeting && !fields.personality && !fields.scenario && !fields.exampleDialogues) {
      throw new Error("The JSON does not contain supported bot content.");
    }
    return fields;
  }

  function botCandidate(filename, content) {
    const name = String(filename || "");
    if (/\.json$/i.test(name)) return { source: name, fields: readBotJson(content) };
    if (/\.txt$/i.test(name)) return { source: name, fields: parseBotReplacementText(content) };
    throw new Error("Choose a bot JSON or a labeled bot replacement TXT file.");
  }

  // Read ZIP central-directory entries only. We never write archive paths,
  // execute archive content, or fetch external resources. Bound all lengths.
  async function zipBotCandidates(file) {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    if (view.byteLength < 22) throw new Error("The ZIP file is incomplete.");
    let end = -1;
    for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) <= view.byteLength) {
        end = i; break;
      }
    }
    if (end < 0) throw new Error("Could not read the ZIP directory.");
    const count = view.getUint16(end + 10, true);
    let cursor = view.getUint32(end + 16, true);
    if (count > MAX_IMPORT_ARCHIVE_FILES || cursor === 0xffffffff) throw new Error("ZIP contains too many files or requires unsupported ZIP64.");
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const matches = [];
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("The ZIP directory is damaged.");
      const flags = view.getUint16(cursor + 8, true);
      const method = view.getUint16(cursor + 10, true);
      const size = view.getUint32(cursor + 20, true);
      const plainSize = view.getUint32(cursor + 24, true);
      const filenameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const offset = view.getUint32(cursor + 42, true);
      if (cursor + 46 + filenameLength + extraLength + commentLength > bytes.length) throw new Error("The ZIP directory is incomplete.");
      const filename = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + filenameLength));
      cursor += 46 + filenameLength + extraLength + commentLength;
      if (!/\.(json|txt)$/i.test(filename) || /(?:^|\/)(?:readme|__macosx)/i.test(filename) || /lorebook/i.test(filename)) continue;
      if (/\.txt$/i.test(filename) && !/(?:bot|chatbot|character|replacement)/i.test(filename)) continue;
      if (flags & 1) continue; // encrypted entries cannot be read here
      if (![0, 8].includes(method) || size > MAX_IMPORT_ENTRY_SIZE || plainSize > MAX_IMPORT_ENTRY_SIZE) continue;
      if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) throw new Error("The ZIP has a damaged file entry.");
      const dataStart = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
      if (dataStart + size > bytes.length) throw new Error("The ZIP file content is incomplete.");
      const compressed = bytes.subarray(dataStart, dataStart + size);
      let decoded;
      if (method === 0) decoded = compressed;
      else {
        if (typeof DecompressionStream !== "function") throw new Error("ZIP decompression isn't supported in this browser. Extract the ZIP and select the bot TXT or JSON file.");
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const reader = stream.getReader();
        const pieces = [];
        let total = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            total += part.value.byteLength;
            if (total > MAX_IMPORT_ENTRY_SIZE) throw new Error("A ZIP entry is too large to import.");
            pieces.push(part.value);
          }
        } finally { reader.releaseLock(); }
        decoded = new Uint8Array(total);
        let at = 0;
        for (const piece of pieces) { decoded.set(piece, at); at += piece.length; }
      }
      if (decoded.length !== plainSize) throw new Error("ZIP entry size does not match its directory.");
      try { matches.push(botCandidate(filename, decoder.decode(decoded))); }
      catch { /* Ignore unrelated JSON/text files in a mixed archive. */ }
    }
    if (!matches.length) throw new Error("No supported bot JSON or bot replacement TXT files were found in this ZIP.");
    return matches;
  }

  async function readBotImportFile(file) {
    if (!file) throw new Error("Choose an import file.");
    if (file.size > MAX_BOT_IMPORT_SIZE) throw new Error("The import file is larger than 16 MB.");
    if (/\.zip$/i.test(file.name)) return zipBotCandidates(file);
    if (!/\.(json|txt)$/i.test(file.name)) throw new Error("Supported formats are JSON, TXT and ZIP.");
    if (file.size > MAX_IMPORT_ENTRY_SIZE) throw new Error("The bot text/JSON file is too large.");
    return [botCandidate(file.name, await file.text())];
  }

  function importFieldValue(fields, key) {
    if (key === "tags") return Array.isArray(fields.tags) ? fields.tags.join(", ") : "";
    return String(fields[key] || "");
  }

  async function ensureImportAdvancedFields(selected) {
    if (!selected.some(key => ["scenario", "exampleDialogues"].includes(key))) return;
    if (directField("scenario") && directField("exampleDialogues")) return;
    const advanced = [...document.querySelectorAll("button")].find(node =>
      !node.closest(`#${PANEL_ID},#${IMPORT_DIALOG_ID}`) && clean(node.textContent, 100).toLowerCase() === "advanced");
    if (advanced) {
      advanced.click();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  async function applySelectedBotFields(fields, selected) {
    const form = editorForm();
    if (!form) throw new Error("SpicyChat's bot form is not ready. Try again after it loads.");
    if (editorReadOnlyState()) throw new Error("This bot editor is read-only. Import was not applied.");
    await ensureImportAdvancedFields(selected);
    const result = { filled: [], missing: [], tags: "", visibility: false, unchanged: [] };
    const keys = ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues"];
    for (const key of keys) {
      if (!selected.includes(key)) continue;
      const control = directField(key, form);
      if (!control || control.disabled || control.readOnly) { result.missing.push(key); continue; }
      const value = importFieldValue(fields, key);
      if (String(control.value || "") === value) { result.unchanged.push(key); continue; }
      if (setNativeFormValue(control, value)) result.filled.push(key);
      else result.missing.push(key);
    }
    if (selected.includes("visibility")) result.visibility = await applyImportedVisibility(fields.visibility);
    if (selected.includes("tags") && fields.tags?.length) {
      for (let i = 0; i < 12 && typeof DS.insertChatbotTagsFromList !== "function"; i++)
        await new Promise(resolve => setTimeout(resolve, 100));
      const existingTags = new Set(selectedTags().split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean));
      const missingTags = fields.tags.filter(tag => !existingTags.has(tag.toLowerCase()));
      result.tags = !missingTags.length ? "All imported tags were already selected"
        : typeof DS.insertChatbotTagsFromList === "function"
          ? await DS.insertChatbotTagsFromList(missingTags)
          : "Tag picker isn't ready; tags were not imported.";
    }
    return result;
  }

  function openBotImportPreview(candidates) {
    document.getElementById(IMPORT_DIALOG_ID)?.remove();
    const overlay = document.createElement("div");
    overlay.id = IMPORT_DIALOG_ID;
    overlay.setAttribute("role", "presentation");
    const dialog = document.createElement("section");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Review imported bot fields");
    const heading = document.createElement("h2");
    heading.textContent = "Review bot import";
    const explanation = document.createElement("p");
    explanation.textContent = "Select fields to fill in the current bot editor. Nothing is saved or published automatically. Images and Lorebooks are never replaced.";
    const chooser = document.createElement("select");
    chooser.setAttribute("aria-label", "Bot file in archive");
    candidates.forEach((candidate, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = candidate.source;
      chooser.appendChild(option);
    });
    if (candidates.length < 2) chooser.hidden = true;
    const warning = document.createElement("p");
    warning.className = "ds-bot-import-warning";
    const fieldsHost = document.createElement("div");
    fieldsHost.className = "ds-bot-import-fields";
    const resultText = document.createElement("p");
    resultText.setAttribute("role", "status");
    const footer = document.createElement("div");
    footer.className = "ds-bot-import-footer";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Fill selected fields";
    apply.className = "ds-bot-import-apply";
    footer.append(cancel, apply);
    dialog.append(heading, explanation, chooser, warning, fieldsHost, resultText, footer);
    overlay.append(dialog);
    document.body.append(overlay);
    const close = () => overlay.remove();
    cancel.addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    function renderCandidate() {
      fieldsHost.replaceChildren();
      resultText.textContent = "";
      const candidate = candidates[Number(chooser.value) || 0];
      const current = captureTextFields();
      const editorName = clean(current.name, 200);
      const fileName = clean(candidate.fields.name, 200);
      warning.textContent = editorInfo()?.mode === "edit" && editorName && fileName && editorName.toLowerCase() !== fileName.toLowerCase()
        ? `This file names “${fileName}”, but you're editing “${editorName}”. Verify the bot before applying.`
        : "";
      const labels = {
        name: "Name", title: "Title", description: "Description", greeting: "Greeting",
        personality: "Personality", scenario: "Scenario", exampleDialogues: "Example dialogue",
        tags: "Add tags (keeps existing tags)", visibility: "Visibility (optional)"
      };
      for (const key of Object.keys(labels)) {
        const value = importFieldValue(candidate.fields, key);
        if (!value) continue;
        const item = document.createElement("div");
        item.className = "ds-bot-import-field";
        const label = document.createElement("label");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.value = key;
        check.checked = key !== "visibility" && !(key === "name" && editorInfo()?.mode === "edit" && current.name && current.name.toLowerCase() !== value.toLowerCase());
        const before = key === "tags" ? selectedTags() : String(current[key] || "");
        const compareText = key === "tags" ? "add without removing current tags" : value === before ? "unchanged" : before ? "will replace existing text" : "will fill empty field";
        label.append(check, document.createTextNode(` ${labels[key]} · ${value.length.toLocaleString()} chars · ${compareText}`));
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Preview imported text";
        if (key !== "tags" && before && before !== value) {
          const currentText = document.createElement("pre");
          currentText.textContent = `Current: ${before.length > 500 ? `${before.slice(0, 500)}…` : before}`;
          details.append(summary, currentText);
        }
        const preview = document.createElement("pre");
        preview.textContent = value.length > 1500 ? `${value.slice(0, 1500)}\n… (${value.length} characters total)` : value;
        if (!summary.parentElement) details.append(summary);
        details.append(preview);
        item.append(label, details);
        fieldsHost.append(item);
      }
      apply.disabled = !fieldsHost.querySelector('input[type="checkbox"]');
    }
    chooser.addEventListener("change", renderCandidate);
    apply.addEventListener("click", async () => {
      const selected = [...fieldsHost.querySelectorAll('input[type="checkbox"]:checked')].map(node => node.value);
      if (!selected.length) { resultText.textContent = "Select at least one field."; return; }
      if (editorReadOnlyState()) { resultText.textContent = "This editor is read-only; nothing was changed."; return; }
      apply.disabled = true;
      cancel.disabled = true;
      try {
        const info = editorInfo();
        if (info?.mode === "edit" && info.id) {
          const backedUp = await saveOwnBackup("Before bot import", { manual: true, label: "Before bot import" });
          if (!backedUp) throw new Error("Could not create a safety backup of this bot. Import cancelled.");
        }
        const result = await applySelectedBotFields(candidates[Number(chooser.value) || 0].fields, selected);
        const parts = [];
        if (result.filled.length) parts.push(`${result.filled.length} field(s) filled`);
        if (result.unchanged.length) parts.push(`${result.unchanged.length} unchanged`);
        if (result.missing.length) parts.push(`Couldn't find ${result.missing.join(", ")}`);
        if (result.tags) parts.push(result.tags);
        if (selected.includes("visibility")) parts.push(result.visibility ? "Visibility selected" : "Visibility not changed");
        const message = `${parts.join(" · ") || "No fields changed"}. Review everything and use SpicyChat's own Save button.`;
        setStatus(message);
        resultText.textContent = message;
        await refreshPanelStatus(message);
        apply.textContent = "Applied to editor";
      } catch (error) {
        resultText.textContent = `Import stopped: ${error?.message || String(error)}`;
        apply.disabled = false;
      } finally { cancel.disabled = false; }
    });
    renderCandidate();
    cancel.focus({ preventScroll: true });
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

    // Import is available on Create and Edit; existing bots are only modified
    // in the native editor after a field-by-field review and safety checkpoint.
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json,.txt,.zip,application/json,text/plain,application/zip";
    importInput.hidden = true;
    importInput.dataset.dsBotJsonImport = "1";
    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.textContent = "Import bot";
    importButton.title = "Review and fill bot fields from Character Card/QoL JSON, labeled replacement TXT, or a ZIP containing those files. No automatic Save.";
    importButton.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0] || null;
      importInput.value = "";
      if (!file) return;
      importButton.disabled = true;
      setStatus("Reading bot import file…");
      try {
        const candidates = await readBotImportFile(file);
        openBotImportPreview(candidates);
        setStatus(`Ready to preview ${candidates.length} bot file${candidates.length === 1 ? "" : "s"}.`);
      } catch (error) {
        setStatus(`Import failed: ${error?.message || String(error)}`);
      } finally { importButton.disabled = false; }
    });
    actions.append(importButton, importInput);

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
    document.getElementById(IMPORT_DIALOG_ID)?.remove();
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

}
