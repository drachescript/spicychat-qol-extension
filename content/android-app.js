(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const BUTTON_ID = "ds-android-qol-menu-button";
  const MENU_ID = "ds-android-qol-menu";

  function displayMode() {
    try {
      if (window.matchMedia?.("(display-mode: window-controls-overlay)")?.matches) return "window-controls-overlay";
      if (window.matchMedia?.("(display-mode: standalone)")?.matches) return "standalone";
      if (window.matchMedia?.("(display-mode: minimal-ui)")?.matches) return "minimal-ui";
      if (window.matchMedia?.("(display-mode: fullscreen)")?.matches) return "fullscreen";
    } catch {}
    return "browser";
  }

  function environment() {
    const ua = String(navigator.userAgent || "");
    const android = /Android/i.test(ua);
    const webview = android && (
      /;\s*wv\)/i.test(ua) ||
      /Version\/4\.0.*Chrome\/\d+.*Mobile Safari/i.test(ua) ||
      /\bwv\b/i.test(ua)
    );
    const mode = displayMode();
    const installedApp = mode !== "browser" || navigator.standalone === true;
    const firefox = /Firefox\/|FxiOS\//i.test(ua);
    const waterfox = /Waterfox/i.test(ua);
    const opera = /\bOPR\//i.test(ua);
    const chromium = /Chrome\//i.test(ua) && !firefox && !waterfox;
    return { android, webview, installedApp, displayMode: mode, firefox, waterfox, opera, chromium, ua };
  }

  function modeActive(settings) {
    const env = environment();
    switch (String(settings.androidAppControlsMode || "auto")) {
      case "always": return true;
      case "android": return env.android;
      case "off": return false;
      default: return env.webview;
    }
  }

  function controlsActive(settings) {
    // The compact menu checkbox is an explicit user choice. Older builds still
    // let Auto/WebView detection veto that choice on desktop Firefox/Chrome or
    // normal Firefox Android, which made the button appear to be broken. Keep
    // Never as the one hard-off mode; otherwise an explicitly enabled compact
    // menu is allowed in any supported SpicyChat browser environment.
    if (String(settings.androidAppControlsMode || "auto") === "off") return false;
    if (settings.androidTopBarMenu) return true;
    return modeActive(settings);
  }

  function closeMenu() {
    document.getElementById(MENU_ID)?.remove();
    document.getElementById(BUTTON_ID)?.setAttribute("aria-expanded", "false");
  }

  function actionButton(label, title, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-android-qol-menu-item";
    button.textContent = label;
    button.title = title || label;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      try { handler(); } catch (error) { DS.setQuickStatus?.(`Could not run ${label}.`); }
    });
    return button;
  }

  function shortOocLabel(template, index) {
    const name = String(template?.name || "").replace(/\s+/g, " ").trim();
    if (name) return name.length > 34 ? `${name.slice(0, 31)}…` : name;
    return `OOC ${index + 1}`;
  }

  function appendOocActions(menu) {
    const templates = DS.getOocTemplates?.() || [];

    // One preset should be one tap on mobile/compact controls. A chooser only
    // adds friction when there is nothing to choose from.
    if (templates.length <= 1) {
      menu.appendChild(actionButton(
        "OOC",
        templates[0]?.name ? `Insert ${templates[0].name}` : "Insert OOC template",
        () => DS.insertOocTemplate?.(0)
      ));
      return;
    }

    const group = document.createElement("div");
    group.className = "ds-android-qol-ooc-group";

    const title = document.createElement("div");
    title.className = "ds-android-qol-menu-label";
    title.textContent = "OOC";
    group.appendChild(title);

    templates.forEach((template, index) => {
      group.appendChild(actionButton(
        shortOocLabel(template, index),
        `Insert ${template?.name || `OOC ${index + 1}`}`,
        () => DS.insertOocTemplate?.(index)
      ));
    });

    menu.appendChild(group);
  }

  function formattingGroup(menu) {
    const group = document.createElement("div");
    group.className = "ds-android-qol-format-group";
    const title = document.createElement("div");
    title.className = "ds-android-qol-menu-label";
    title.textContent = "Formatting";
    group.appendChild(title);

    const row = document.createElement("div");
    row.className = "ds-android-qol-format-row";
    const formats = [
      ["*", "*", "*"],
      ["**", "**", "**"],
      ['"', '"', '"'],
      ["( )", "(", ")"],
      ["`", "`", "`"]
    ];
    formats.forEach(([label, before, after]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ds-android-qol-format-button";
      button.textContent = label;
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        DS.wrapComposerText?.(before, after);
      });
      row.appendChild(button);
    });
    group.appendChild(row);
    menu.appendChild(group);
  }

  async function openPersona() {
    if (typeof DS.openPersonaPicker === "function") {
      await DS.openPersonaPicker();
      return;
    }
    const dropdown = document.querySelector('button[aria-label="chat-dropdown"]');
    DS.realClick?.(dropdown);
  }

  function openModelPicker() {
    const header = document.querySelector('button[aria-label="chat-dropdown"]')?.closest("div.flex")?.parentElement || document;
    const model = header.querySelector?.('button[aria-label="Sparkles-button"]') || document.querySelector('button[aria-label="Sparkles-button"]');
    if (model) DS.realClick?.(model) || model.click();
    else DS.setQuickStatus?.("Could not find the model picker.");
  }

  function buildMenu(button) {
    closeMenu();
    const s = DS.state?.settings || {};
    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.className = "ds-android-qol-menu";

    if (s.androidTopBarOoc !== false) {
      appendOocActions(menu);
    }
    if (s.androidTopBarAsterisk !== false) {
      menu.appendChild(actionButton("* Action", "Wrap the composer selection in asterisks", () => DS.wrapComposerText?.("*", "*")));
    }
    if (s.androidTopBarFormatting !== false) formattingGroup(menu);
    if (s.androidTopBarTranslation && s.enableTranslation) {
      menu.appendChild(actionButton("Translate", "Translate visible messages", () => DS.translateVisibleMessages?.()));
    }
    if (s.androidTopBarScroll !== false) {
      menu.appendChild(actionButton("↑ Top", "Scroll chat to top", () => DS.scrollChatToTop?.()));
      menu.appendChild(actionButton("↓ Bottom", "Scroll chat to bottom", () => DS.scrollChatToBottom?.()));
    }
    if (s.androidTopBarPersona !== false) {
      menu.appendChild(actionButton("Persona", "Open Change Persona", () => { openPersona(); }));
    }
    if (s.androidTopBarModel !== false) {
      menu.appendChild(actionButton("Model", "Open model picker", openModelPicker));
    }

    document.body.appendChild(menu);
    const rect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, rect.right - menuRect.width));
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.min(window.innerHeight - menuRect.height - 8, rect.bottom + 6)}px`;
    button.setAttribute("aria-expanded", "true");
  }

  function ensureButton() {
    const nativeDropdown = document.querySelector('button[aria-label="chat-dropdown"]');
    const wrapper = nativeDropdown?.closest?.("div.relative") || nativeDropdown?.parentElement || null;
    const host = wrapper?.parentElement || null;
    if (!host) return;

    let button = document.getElementById(BUTTON_ID);
    if (button && button.parentElement !== host) button.remove();
    button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.className = "ds-android-qol-menu-button";
      button.textContent = "QoL";
      button.title = "SpicyChat QoL compact controls";
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (document.getElementById(MENU_ID)) closeMenu();
        else buildMenu(button);
      });
      host.insertBefore(button, wrapper);
    }
  }

  function cleanup() {
    closeMenu();
    document.getElementById(BUTTON_ID)?.remove();
    document.documentElement.classList.remove("ds-android-app-controls-active", "ds-android-hide-composer-shortcuts");
    DS.state.androidAppControlsWasActive = false;
  }

  DS.getRuntimeEnvironment = environment;
  DS.getAndroidEnvironment = environment;
  DS.isAndroidAppControlsActive = function isAndroidAppControlsActive() {
    const s = DS.state?.settings || {};
    return !!s.enabled && controlsActive(s);
  };

  DS.applyAndroidAppControls = function applyAndroidAppControls() {
    const s = DS.state?.settings || {};
    const active = !!s.enabled && !!DS.isSingleChatPage?.() && controlsActive(s);
    if (!active) {
      if (DS.state.androidAppControlsWasActive) cleanup();
      return;
    }

    DS.state.androidAppControlsWasActive = true;
    document.documentElement.classList.add("ds-android-app-controls-active");
    document.documentElement.classList.toggle("ds-android-hide-composer-shortcuts", !!s.androidTopBarMenu && s.androidHideComposerShortcuts !== false);

    if (s.androidTopBarMenu) ensureButton();
    else {
      closeMenu();
      document.getElementById(BUTTON_ID)?.remove();
    }
  };

  DS.removeAndroidAppControls = cleanup;

  document.addEventListener("pointerdown", event => {
    if (!document.getElementById(MENU_ID)) return;
    if (event.target?.closest?.(`#${MENU_ID}, #${BUTTON_ID}`)) return;
    closeMenu();
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  }, true);
})();
