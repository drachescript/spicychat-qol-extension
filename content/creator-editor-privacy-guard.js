(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || window.__DS_QOL_CREATOR_EDITOR_PRIVACY_GUARD__) return;
  window.__DS_QOL_CREATOR_EDITOR_PRIVACY_GUARD__ = true;

  const WRAPPED = "dsCreatorEditorPrivacyGuardWrapped";

  function normalizedPath() {
    return String(location.pathname || "/")
      .replace(/^\/[a-z]{2}(?=\/)/i, "")
      .replace(/\/+$/, "") || "/";
  }

  function editorKind() {
    const path = normalizedPath();
    if (/^\/chatbot\/(?:edit(?:\/[^/]+)?|[^/]+\/edit)(?:\/|$)/i.test(path)) return "chatbot";
    if (/^\/lorebook\/(?:edit(?:\/[^/]+)?|[^/]+\/edit)(?:\/entries)?(?:\/|$)/i.test(path)) return "lorebook";
    return "";
  }

  function explicitLorebookWorker() {
    try {
      if (new URLSearchParams(location.search || "").get("dsQolLorebookBackupWorker") === "1") return true;
    } catch {}
    const root = document.documentElement;
    return root?.dataset?.dsQolLorebookBackupWorker === "1" ||
      root?.dataset?.dsLorebookExportHelper === "1";
  }

  function selectedByPressed(button) {
    if (!button) return false;
    return String(button.getAttribute("aria-pressed") || "").toLowerCase() === "true";
  }

  function selectedByNativeStyle(button) {
    if (!button) return false;
    const cls = String(button.getAttribute("class") || "");
    return /(?:^|\s)bg-black(?:\s|$)/.test(cls) || /(?:^|\s)dark:bg-white(?:\s|$)/.test(cls);
  }

  function chatbotVisibility() {
    const choices = [
      ["public", document.querySelector('button[aria-labelledby="public"]')],
      ["private", document.querySelector('button[aria-labelledby="private"]')],
      ["unlisted", document.querySelector('button[aria-labelledby="hidden"]')]
    ];

    for (const [value, button] of choices) {
      if (selectedByPressed(button)) return value;
    }
    for (const [value, button] of choices) {
      if (selectedByNativeStyle(button)) return value;
    }

    const text = String(document.body?.textContent || "");
    if (/Anyone can find and chat with this bot\./i.test(text)) return "public";
    if (/Only you can (?:find|view|chat with|access) this bot/i.test(text)) return "private";
    if (/(?:only|anyone) with (?:the )?link.+(?:chat|bot)|unlisted/i.test(text)) return "unlisted";
    return "unknown";
  }

  function lorebookVisibility() {
    const choices = [
      ["public", document.querySelector('[data-testid="LorebookVisibilityField-PublicButton"]')],
      ["private", document.querySelector('[data-testid="LorebookVisibilityField-PrivateButton"]')],
      ["unlisted", document.querySelector('[data-testid="LorebookVisibilityField-UnlistedButton"]')]
    ];

    for (const [value, button] of choices) {
      if (selectedByPressed(button)) return value;
    }
    for (const [value, button] of choices) {
      if (selectedByNativeStyle(button)) return value;
    }

    const host = document.querySelector('[data-testid="LorebookVisibilityField"], [data-field-name="visibility"]');
    const text = String(host?.textContent || "");
    if (/Anyone can (?:find|view|attach|use)/i.test(text)) return "public";
    if (/Only you can view and attach this Lorebook\./i.test(text)) return "private";
    if (/(?:only|anyone) with (?:the )?link|unlisted/i.test(text)) return "unlisted";
    return "unknown";
  }

  DS.getCreatorEditorVisibility = function getCreatorEditorVisibility() {
    const kind = editorKind();
    if (!kind) return "not-editor";
    if (kind === "lorebook" && explicitLorebookWorker()) return "explicit-worker";
    return kind === "chatbot" ? chatbotVisibility() : lorebookVisibility();
  };

  DS.creatorEditorAutoReadAllowed = function creatorEditorAutoReadAllowed() {
    const visibility = DS.getCreatorEditorVisibility?.() || "unknown";
    return visibility === "not-editor" ||
      visibility === "explicit-worker" ||
      visibility === "public" ||
      visibility === "unlisted";
  };

  function restoreExpandedLorebookRows() {
    document.querySelectorAll(".ds-lorebook-tags-expanded").forEach(row => {
      const textNode = row.querySelector("[data-ds-lorebook-tags-expansion-text='1']");
      const counter = row.querySelector("[data-ds-lorebook-tags-expansion-counter='1']");
      if (textNode) {
        textNode.textContent = textNode.dataset.dsLorebookTagsOriginalText || "";
        const cls = textNode.dataset.dsLorebookTagsOriginalClass || "";
        const style = textNode.dataset.dsLorebookTagsOriginalStyle || "";
        if (cls) textNode.setAttribute("class", cls); else textNode.removeAttribute("class");
        if (style) textNode.setAttribute("style", style); else textNode.removeAttribute("style");
        delete textNode.dataset.dsLorebookTagsOriginalText;
        delete textNode.dataset.dsLorebookTagsOriginalClass;
        delete textNode.dataset.dsLorebookTagsOriginalStyle;
        delete textNode.dataset.dsLorebookTagsExpansionText;
      }
      if (counter) {
        const style = counter.dataset.dsLorebookTagsOriginalStyle || "";
        if (style) counter.setAttribute("style", style); else counter.removeAttribute("style");
        delete counter.dataset.dsLorebookTagsOriginalStyle;
        delete counter.dataset.dsLorebookTagsExpansionCounter;
      }
      row.classList.remove("ds-lorebook-tags-expanded");
    });
  }

  function withTemporarySettings(overrides, callback) {
    const settings = DS.state?.settings;
    if (!settings || !overrides || !Object.keys(overrides).length) return callback();

    const previous = new Map();
    for (const [key, value] of Object.entries(overrides)) {
      previous.set(key, {
        had: Object.prototype.hasOwnProperty.call(settings, key),
        value: settings[key]
      });
      settings[key] = value;
    }

    const restore = () => {
      for (const [key, item] of previous) {
        if (item.had) settings[key] = item.value;
        else delete settings[key];
      }
    };

    try {
      const result = callback();
      if (result && typeof result.finally === "function") return result.finally(restore);
      restore();
      return result;
    } catch (error) {
      restore();
      throw error;
    }
  }

  function wrapBlocked(name, cleanupName, customCleanup = null) {
    const current = DS[name];
    if (typeof current !== "function" || current[WRAPPED]) return false;

    const wrapped = function creatorEditorPrivacyGuarded(...args) {
      if (DS.creatorEditorAutoReadAllowed?.() !== false) return current.apply(this, args);
      try {
        if (customCleanup) customCleanup();
        else DS[cleanupName]?.();
      } catch {}
      return undefined;
    };
    wrapped[WRAPPED] = true;
    wrapped.__dsCreatorEditorPrivacyOriginal = current;
    DS[name] = wrapped;
    return true;
  }

  function wrapWithPrivateOverrides(name, overrides) {
    const current = DS[name];
    if (typeof current !== "function" || current[WRAPPED]) return false;

    const wrapped = function creatorEditorPrivacyGuarded(...args) {
      if (DS.creatorEditorAutoReadAllowed?.() !== false) return current.apply(this, args);
      return withTemporarySettings(overrides, () => current.apply(this, args));
    };
    wrapped[WRAPPED] = true;
    wrapped.__dsCreatorEditorPrivacyOriginal = current;
    DS[name] = wrapped;
    return true;
  }

  function installGuards() {
    // Keep the manual backup/export buttons available. Only automatic editor
    // capture is suppressed while the item is Private or its visibility has
    // not mounted yet.
    wrapWithPrivateOverrides("applyBotBackupTools", {
      botArchiveOwnEditorBackups: false
    });
    wrapWithPrivateOverrides("applyLorebookBackup", {
      lorebookBackupsEnabled: false
    });

    // These features inspect editor content automatically, so they stay quiet
    // on Private/unknown edit pages.
    wrapBlocked("applyBotEditorLocalMemory", "removeBotEditorLocalMemory");
    wrapBlocked("applyCreatorModerationWarnings", "removeCreatorModerationWarnings");
    wrapBlocked("applyLorebookTagExpansion", "", restoreExpandedLorebookRows);

    // Keep navigation/edit shortcuts, but disable the parts of Lorebook workflow
    // that read entry text or retain entry drafts automatically.
    wrapWithPrivateOverrides("applyLorebookWorkflowTools", {
      lorebookProtectEntryDrafts: false,
      lorebookEntryManager: false
    });
    wrapWithPrivateOverrides("applyLorebookEntryExpanders", {
      showLorebookEntryExpandButtons: false
    });
  }

  function refreshGuardState(source = "creator-editor-privacy") {
    installGuards();
    const visibility = DS.getCreatorEditorVisibility?.() || "unknown";
    const root = document.documentElement;
    if (editorKind()) root.dataset.dsQolEditorVisibility = visibility;
    else delete root.dataset.dsQolEditorVisibility;
    DS.scheduleRun?.({ priority: "both", source });
  }

  installGuards();
  [0, 50, 250, 1000, 3000].forEach(delay => {
    setTimeout(installGuards, delay);
  });

  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;
    const visibilityButton =
      button.matches('[aria-labelledby="public"],[aria-labelledby="private"],[aria-labelledby="hidden"]') ||
      button.matches('[data-testid^="LorebookVisibilityField-"][data-testid$="Button"]');
    if (!visibilityButton) return;
    setTimeout(() => refreshGuardState("creator-editor-visibility-changed"), 80);
    setTimeout(() => refreshGuardState("creator-editor-visibility-settled"), 260);
  }, true);

  window.addEventListener("popstate", () => setTimeout(() => refreshGuardState("creator-editor-route"), 80), true);
})();
