(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(el) {
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function hideTopBarElement(el, reason) {
    if (!el) return;

    DS.hideElement?.(el, `topbar:${reason}`);
  }

  function unhideTopBarReason(reason) {
    DS.qsa(`[data-ds-reason='topbar:${reason}']`).forEach(el => {
      DS.unhideElement?.(el);
    });
  }

  function findAvatarPill() {
    return (
      document.querySelector("a[aria-label='avatar'][href='/profile']") ||
      document.querySelector("a[aria-label='avatar'][href*='/profile']") ||
      DS.qsa("a[aria-label='avatar']").find(a => {
        try {
          const url = new URL(a.getAttribute("href") || "", location.origin);
          return url.pathname === "/profile";
        } catch {
          return false;
        }
      }) ||
      null
    );
  }

  function findTopBarControls() {
    const avatar = findAvatarPill();

    if (avatar) {
      let node = avatar.parentElement;

      for (let i = 0; node && i < 8; i++, node = node.parentElement) {
        if (node === document.body || node.id === "root") break;

        const hasTopBarStuff =
          node.querySelector("[data-testid='LocaleSelector']") ||
          node.querySelector("button[aria-label='notifications']") ||
          node.querySelector("button[aria-label='theme']") ||
          node.querySelector("button[aria-label='Globe-button']");

        if (hasTopBarStuff && node.children.length <= 8) return node;
      }
    }

    const locale = document.querySelector("[data-testid='LocaleSelector']");

    if (locale) {
      let node = locale.parentElement;

      for (let i = 0; node && i < 8; i++, node = node.parentElement) {
        if (node === document.body || node.id === "root") break;

        const hasAvatar = !!node.querySelector("a[aria-label='avatar']");
        const hasTheme = !!node.querySelector("button[aria-label='theme']");

        if ((hasAvatar || hasTheme) && node.children.length <= 8) return node;
      }
    }

    return null;
  }

  function directTopBarChild(el) {
    if (!el) return null;

    const controls = findTopBarControls();
    if (!controls) return el;

    let node = el;
    let child = el;

    while (node && node.parentElement && node.parentElement !== controls) {
      node = node.parentElement;
      child = node;

      if (node === document.body || node.id === "root") break;
    }

    if (node?.parentElement === controls) return node;
    if (child?.parentElement === controls) return child;

    return el;
  }

  function findLanguageItem() {
    const locale = document.querySelector("[data-testid='LocaleSelector']");
    if (locale) return directTopBarChild(locale);

    const globe = document.querySelector("button[aria-label='Globe-button']");
    return globe ? directTopBarChild(globe) : null;
  }

  function findNotificationItem() {
    const button = document.querySelector("button[aria-label='notifications']");
    if (button) return directTopBarChild(button);

    const badge = document.querySelector("[data-announcekit-mode], .announcekit-widget-badge");
    return badge ? directTopBarChild(badge) : null;
  }

  function findThemeItem() {
    const button = document.querySelector("button[aria-label='theme']");
    return button ? directTopBarChild(button) : null;
  }

  function rememberOriginalPill(pill) {
    if (!pill) return;

    const label = findPillTextElement(pill);
    if (!label) return;

    if (!pill.dataset.dsTopbarOriginalText) {
      pill.dataset.dsTopbarOriginalText = cleanText(label.textContent);
    }
  }

  function findPillTextElement(pill) {
    if (!pill) return null;

    const candidates = DS.qsa("p, span", pill)
      .filter(isVisible)
      .filter(el => cleanText(el.textContent))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();

        return br.left - ar.left || cleanText(b.textContent).length - cleanText(a.textContent).length;
      });

    return candidates[0] || null;
  }

  function restoreProfilePill(pill) {
    if (!pill) return;

    if (pill.dataset.dsReason === "topbar:profile-pill") {
      DS.unhideElement?.(pill);
    }

    const label = findPillTextElement(pill);
    const original = pill.dataset.dsTopbarOriginalText;

    if (label && original && pill.dataset.dsTopbarMutated === "1") {
      label.textContent = original;
    }

    delete pill.dataset.dsTopbarMutated;
  }

  function getActiveSavedPersonaName() {
    const personas = DS.cleanPersonas?.(DS.state?.savedPersonas || []) || [];

    const active =
      personas.find(persona => persona.active || persona.selected || persona.isDefault) ||
      personas[0];

    return cleanText(active?.name || active?.label || active?.id || "");
  }

  function getPersonaNameFromOpenPicker() {
    const checked = DS.qsa("input[type='radio']:checked")
      .map(input => {
        const label =
          input.closest("label") ||
          (input.id ? document.querySelector(`label[for='${CSS.escape(input.id)}']`) : null);

        if (!label) return "";

        const texts = DS.qsa("p, span, h1, h2, h3", label)
          .map(el => cleanText(el.textContent))
          .filter(Boolean)
          .filter(text => text.length <= 80)
          .filter(text => !/^(default|yes|no|back|manage personas)$/i.test(text))
          .filter(text => !/don't show|dont show|chat with/i.test(text));

        return texts[0] || cleanText(label.textContent);
      })
      .find(Boolean);

    return cleanText(checked || "");
  }

  function getTopBarPersonaName() {
    return (
      getPersonaNameFromOpenPicker() ||
      getActiveSavedPersonaName() ||
      "Default"
    );
  }

  function setProfilePillText(pill, text) {
    if (!pill) return;

    const label = findPillTextElement(pill);
    if (!label) return;

    rememberOriginalPill(pill);

    label.textContent = cleanText(text) || "Default";
    pill.dataset.dsTopbarMutated = "1";
    pill.title = cleanText(text) || "Default";
  }

  function applyProfilePillMode() {
    const settings = DS.state?.settings || {};
    const mode = settings.topBarProfilePillMode || "normal";
    const pill = findAvatarPill();

    if (!pill) return;

    rememberOriginalPill(pill);

    if (mode === "hide") {
      hideTopBarElement(pill, "profile-pill");
      return;
    }

    restoreProfilePill(pill);

    if (mode === "custom") {
      const custom = cleanText(settings.topBarProfilePillCustomText || "");
      if (custom) setProfilePillText(pill, custom);
      return;
    }

    if (mode === "persona") {
      const persona = getTopBarPersonaName();
      const text = settings.topBarProfilePillPersonaPrefix === false
        ? persona
        : `Persona: ${persona}`;

      setProfilePillText(pill, text);
    }
  }

  DS.applyTopBarCleanup = function applyTopBarCleanup() {
    const settings = DS.state?.settings || {};

    if (!settings.enabled) {
      unhideTopBarReason("language");
      unhideTopBarReason("notifications");
      unhideTopBarReason("theme");
      unhideTopBarReason("profile-pill");
      restoreProfilePill(findAvatarPill());
      return;
    }

    const language = findLanguageItem();
    if (settings.hideTopBarLanguage) {
      hideTopBarElement(language, "language");
    } else {
      unhideTopBarReason("language");
    }

    const notifications = findNotificationItem();
    if (settings.hideTopBarNotifications) {
      hideTopBarElement(notifications, "notifications");
    } else {
      unhideTopBarReason("notifications");
    }

    const theme = findThemeItem();
    if (settings.hideTopBarTheme) {
      hideTopBarElement(theme, "theme");
    } else {
      unhideTopBarReason("theme");
    }

    applyProfilePillMode();
  };
})();
