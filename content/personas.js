(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function waitFor(check, timeout = 4500, step = 150) {
    return new Promise(resolve => {
      const started = Date.now();

      const tick = () => {
        const value = check();
        if (value) {
          resolve(value);
          return;
        }

        if (Date.now() - started >= timeout) {
          resolve(null);
          return;
        }

        setTimeout(tick, step);
      };

      tick();
    });
  }

  function labelLooksBad(text) {
    const normalized = DS.normalize(text);

    return (
      !text ||
      text.length > 120 ||
      ["default", "back", "yes", "no", "manage personas", "search"].includes(normalized) ||
      normalized.includes("change persona") ||
      normalized.includes("manage personas")
    );
  }



  function cleanPersonaName(value) {
    const localClean = cleanText(value)
      .replace(/\s*\bDefault\b\s*$/i, "")
      .replace(/Default$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (typeof DS.cleanPersonaName === "function") {
      return DS.cleanPersonaName(localClean);
    }

    return localClean;
  }

  function looksLikeNonPersonaChoice(text) {
    const value = DS.normalize(cleanPersonaName(text));
    const compact = value.replace(/[^a-z0-9]+/g, "");

    // Payment labels sometimes arrive as one glued-together text node, e.g.
    // "CryptocurrenciesOne time payment". Check both normal and compact text
    // so those cannot survive just because there is no word boundary.
    const blockedFragments = [
      "creditcard",
      "debitcard",
      "venmo",
      "alipay",
      "paypal",
      "applepay",
      "googlepay",
      "klarna",
      "cashapp",
      "onetimepayment",
      "paymentmethod",
      "cryptocurrency",
      "cryptocurrencies",
      "paywith"
    ];

    return blockedFragments.some(fragment => compact.includes(fragment));
  }

  function personaNameLooksGood(text) {
    const value = cleanPersonaName(text);
    const normalized = DS.normalize(value);

    return !!(
      value &&
      value.length <= 80 &&
      !labelLooksBad(value) &&
      !looksLikeNonPersonaChoice(value) &&
      normalized !== "default" &&
      !normalized.includes("chat with") &&
      !normalized.includes("don't show") &&
      !normalized.includes("dont show")
    );
  }

  function labelLooksLikePersonaChoice(label) {
    if (!label) return false;

    const input = label.querySelector("input[type='radio'][value]");
    if (!input) return false;

    // A persona row should have an avatar. Payment choices can have logos too,
    // so an image by itself is not enough to prove this is the persona picker.
    const avatar = label.querySelector("img[src], img[alt]");
    if (!avatar) return false;

    // Reject obvious non-persona radio choices before looking at ancestors.
    if (looksLikeNonPersonaChoice(label.textContent || "")) return false;

    let node = label;

    for (let i = 0; node && i < 9; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;

      const text = DS.normalize(node.textContent || "");
      const hasStrongPersonaContext =
        text.includes("change persona") ||
        text.includes("choose persona") ||
        text.includes("choose a persona") ||
        text.includes("select persona") ||
        text.includes("select a persona") ||
        text.includes("manage personas");

      const hasChatWithButton = !!node.querySelector(
        "button [data-translate-key='chat:modal.choosePersona.cta.chatWith'], " +
        "button[data-translate-key='chat:modal.choosePersona.cta.chatWith']"
      );

      if (hasStrongPersonaContext || hasChatWithButton) return true;

      // Once we hit the actual dialog/overlay containing this radio choice,
      // stop. Otherwise climbing farther can reach the QoL panel's own
      // "Persona switch" text and accidentally bless an unrelated modal.
      const isDialogBoundary =
        node.getAttribute?.("role") === "dialog" ||
        node.getAttribute?.("aria-modal") === "true" ||
        (node.classList?.contains("fixed") &&
          node.querySelector("input[type='radio'][value]"));

      if (isDialogBoundary) break;
    }

    return false;
  }

  function sanitizeSavedPersonas(personas) {
    return (personas || []).filter(persona => {
      const name = cleanPersonaName(persona?.name || persona?.label || "");
      return personaNameLooksGood(name);
    });
  }

  function isPersonasListPage() {
    return location.pathname === "/personas" || location.pathname === "/personas/";
  }

  function cleanupPersonaDescriptionExpansion() {
    DS.qsa(".ds-persona-description-expanded, [data-ds-persona-toggle-expanded]").forEach(el => {
      el.classList.remove("ds-persona-description-expanded");
      delete el.dataset.dsPersonaDescriptionExpanded;
      delete el.dataset.dsPersonaToggleExpanded;
    });

    DS.qsa(".ds-persona-description-toggle").forEach(button => button.remove());
  }

  function findPersonaCard(link) {
    return (
      link?.closest?.("div[tabindex='-1']") ||
      link?.closest?.("div[class*='rounded-large']") ||
      link?.parentElement?.parentElement ||
      null
    );
  }

  function findPersonaDescription(card) {
    if (!card) return null;

    const direct = card.querySelector("span.line-clamp-3, span[class*='line-clamp-3']");
    if (direct && cleanText(direct.textContent).length > 20) return direct;

    return DS.qsa("span", card)
      .filter(el => !el.classList.contains("font-bold"))
      .filter(el => cleanText(el.textContent).length > 40)
      .sort((a, b) => cleanText(b.textContent).length - cleanText(a.textContent).length)[0] || null;
  }

  function setPersonaDescriptionExpanded(description, toggle, expanded) {
    description.classList.toggle("ds-persona-description-expanded", expanded);

    if (expanded) {
      description.dataset.dsPersonaDescriptionExpanded = "1";
    } else {
      delete description.dataset.dsPersonaDescriptionExpanded;
    }

    toggle.dataset.dsExpanded = expanded ? "1" : "0";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.textContent = expanded ? "Show less" : "Show more";
  }

  function ensurePersonaDescriptionToggle(card, description) {
    if (!card || !description) return null;

    // 0.1.8.56-0.1.8.63 expanded every description immediately. Strip that
    // old state unless this page's new toggle explicitly expanded the card.
    if (description.dataset.dsPersonaToggleExpanded !== "1") {
      description.classList.remove("ds-persona-description-expanded");
      delete description.dataset.dsPersonaDescriptionExpanded;
    }

    const textLength = cleanText(description.textContent).length;
    const visiblyClamped = !!(description.clientHeight && description.scrollHeight > description.clientHeight + 1);
    const needsToggle = visiblyClamped || textLength > 100;

    let toggle = card.querySelector(".ds-persona-description-toggle");
    if (!needsToggle) {
      toggle?.remove();
      description.classList.remove("ds-persona-description-expanded");
      delete description.dataset.dsPersonaDescriptionExpanded;
      delete description.dataset.dsPersonaToggleExpanded;
      return null;
    }

    if (toggle && toggle._dsPersonaDescription !== description) {
      toggle.remove();
      toggle = null;
    }

    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ds-inline-expand-toggle ds-persona-description-toggle";
      toggle.textContent = "Show more";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Expand persona description");

      const footer = description.parentElement || card;
      footer.appendChild(toggle);
      toggle._dsPersonaDescription = description;

      toggle.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        const expanded = toggle.dataset.dsExpanded !== "1";
        description.dataset.dsPersonaToggleExpanded = expanded ? "1" : "0";
        setPersonaDescriptionExpanded(description, toggle, expanded);
      });
    }

    const expanded = description.dataset.dsPersonaToggleExpanded === "1";
    setPersonaDescriptionExpanded(description, toggle, expanded);
    return toggle;
  }

  DS.applyPersonaDescriptionExpansion = function applyPersonaDescriptionExpansion() {
    const settings = DS.state.settings || {};
    const enabled = !!(
      settings.enabled &&
      settings.expandPersonaDescriptions &&
      isPersonasListPage()
    );

    if (!enabled) {
      cleanupPersonaDescriptionExpansion();
      return;
    }

    const activeToggles = new Set();
    const activeDescriptions = new Set();

    DS.qsa("a[aria-label='edit-persona'][href*='/personas/edit/']").forEach(link => {
      const card = findPersonaCard(link);
      const description = findPersonaDescription(card);
      if (!description) return;

      const toggle = ensurePersonaDescriptionToggle(card, description);
      if (toggle) activeToggles.add(toggle);
      activeDescriptions.add(description);
    });

    DS.qsa(".ds-persona-description-toggle").forEach(toggle => {
      if (!activeToggles.has(toggle)) toggle.remove();
    });

    DS.qsa(".ds-persona-description-expanded").forEach(description => {
      if (!activeDescriptions.has(description)) {
        description.classList.remove("ds-persona-description-expanded");
        delete description.dataset.dsPersonaDescriptionExpanded;
        delete description.dataset.dsPersonaToggleExpanded;
      }
    });
  };

  DS.applyPersonaPageTools = async function applyPersonaPageTools() {
    DS.applyPersonaDescriptionExpansion?.();

    if (isPersonasListPage()) {
      await DS.scanPersonasFromPage?.();
    } else if (/^\/personas\/edit\//i.test(location.pathname)) {
      await DS.capturePersonaFromEditPage?.();
    }
  };

  DS.getPersonaDescriptionFromCard = function getPersonaDescriptionFromCard(card) {
    const direct = card?.querySelector?.("span.line-clamp-3, span[class*='line-clamp-3']");
    const directText = cleanText(direct?.textContent || "");
    if (directText.length > 20) return directText;

    const descriptions = DS.qsa("span, p, div", card)
      .filter(el => !el.closest?.(".ds-persona-local-note, .ds-persona-picker-meta"))
      .map(el => cleanText(el.textContent))
      .filter(text => text.length > 70)
      .sort((a, b) => b.length - a.length);

    return descriptions[0] || "";
  };

  DS.extractPersonaFromModalLabel = function extractPersonaFromModalLabel(label) {
    if (!labelLooksLikePersonaChoice(label)) return null;

    const input = label.querySelector("input[type='radio'][value]");
    const id = cleanText(input?.value || "");
    if (!id) return null;

    const avatar =
      label.querySelector("img[src*='avatars']")?.src ||
      label.querySelector("img[alt]")?.src ||
      "";

    const imgName = cleanPersonaName(
      label.querySelector("img[alt]")?.getAttribute("alt") || ""
    );

    const nameCandidates = DS.qsa("span, p, h2, h3", label)
      .map(el => cleanPersonaName(el.textContent))
      .filter(personaNameLooksGood)
      .filter(text => !text.includes("\n"));

    const name =
      (personaNameLooksGood(imgName) ? imgName : "") ||
      nameCandidates.find(Boolean) ||
      "";

    const description = DS.getPersonaDescriptionFromCard(label);

    if (!name) return null;

    return {
      id,
      name,
      description,
      avatar,
      active: !!input.checked || label.getAttribute("data-selected") === "true",
      selected: !!input.checked || label.getAttribute("data-selected") === "true",
      source: "persona-picker",
      updatedAt: Date.now()
    };
  };

  DS.extractPersonaFromPersonasCard = function extractPersonaFromPersonasCard(link) {
    const id = String(link.href || "").match(/\/personas\/edit\/([^/?#]+)/i)?.[1] || "";
    if (!id) return null;

    let card = link;

    for (let i = 0; card && i < 8; i++, card = card.parentElement) {
      if (card === document.body || card.id === "root") break;

      const img = card.querySelector("img[alt]");
      const nameFromImg = cleanPersonaName(img?.getAttribute("alt") || "");
      const nameFromText = DS.qsa("span, p, h2, h3", card)
        .map(el => cleanPersonaName(el.textContent))
        .find(personaNameLooksGood);

      const name =
        (personaNameLooksGood(nameFromImg) ? nameFromImg : "") ||
        nameFromText ||
        "";
      const description = DS.getPersonaDescriptionFromCard(card);

      if (name) {
        return {
          id,
          name,
          description,
          avatar: img?.src || "",
          source: "/personas",
          updatedAt: Date.now()
        };
      }
    }

    return null;
  };

  DS.capturePersonaFromEditPage = async function capturePersonaFromEditPage() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.savePersonasFromPages) return null;

    const match = String(location.pathname || "").match(/^\/personas\/edit\/([^/?#]+)/i);
    if (!match) return null;

    const id = cleanText(match[1]);
    const form = document.querySelector("form");
    const nameField = form?.querySelector("input[name='name']");
    const highlightField = form?.querySelector("textarea[name='highlights'], textarea[name='highlight'], textarea[name='description']");
    if (!id || !form || !nameField) return null;

    const name = cleanPersonaName(nameField.value || "");
    const description = String(highlightField?.value || "").trim();
    if (!name) return null;

    const preview = form.querySelector("img[src]");
    const avatar = String(preview?.currentSrc || preview?.src || "");
    const previous = (DS.state.savedPersonas || []).find(persona => String(persona?.id || "") === id) || {};
    const nextDescription = description || previous.description || previous.highlights || "";
    const nextAvatar = avatar || previous.avatar || "";
    let avatarDataUrl = String(previous.avatarDataUrl || "");
    if (!avatarDataUrl && nextAvatar && typeof DS.capturePersonaAvatarDataUrl === "function") {
      avatarDataUrl = await DS.capturePersonaAvatarDataUrl(nextAvatar);
    }
    const changed =
      cleanPersonaName(previous.name || "") !== name ||
      String(previous.description || previous.highlights || "") !== nextDescription ||
      String(previous.avatar || "") !== nextAvatar ||
      String(previous.avatarDataUrl || "") !== avatarDataUrl ||
      String(previous.source || "") !== "/personas/edit";

    const nextPersona = {
      ...previous,
      id,
      name,
      description: nextDescription,
      highlights: nextDescription,
      avatar: nextAvatar,
      avatarDataUrl,
      source: "/personas/edit",
      localCopyVersion: Math.max(4, Number(previous.localCopyVersion) || 0),
      capturedFields: {
        ...(previous.capturedFields || {}),
        name: !!name,
        text: !!nextDescription,
        avatarLocal: !!avatarDataUrl,
        avatarUrl: !!nextAvatar
      },
      updatedAt: changed ? Date.now() : Number(previous.updatedAt || Date.now())
    };

    if (changed) {
      const next = DS.cleanPersonas?.([
        ...(DS.state.savedPersonas || []).filter(persona => String(persona?.id || "") !== id),
        nextPersona
      ]) || [];
      await DS.savePersonas?.(next);
    }
    return nextPersona;
  };

  DS.scanPersonasFromPage = async function scanPersonasFromPage() {
    const { settings } = DS.state;
    if (!settings.enabled || !settings.savePersonasFromPages) return;

    let found = [];
    const onPersonasPage =
      location.pathname === "/personas" ||
      location.pathname.startsWith("/personas/");

    if (onPersonasPage) {
      found = DS.qsa("a[href*='/personas/edit/']")
        .map(link => DS.extractPersonaFromPersonasCard(link))
        .filter(Boolean);
    } else {
      found = DS.qsa("label")
        .map(label => DS.extractPersonaFromModalLabel(label))
        .filter(Boolean);
    }

    const cleanedExisting = sanitizeSavedPersonas(DS.state.savedPersonas || []);
    const removedBadSavedPersonas =
      cleanedExisting.length !== (DS.state.savedPersonas || []).length;

    if (!found.length) {
      if (removedBadSavedPersonas) {
        await DS.savePersonas(DS.cleanPersonas(cleanedExisting));
      }
      return;
    }

    const byKey = new Map();

    // Normal My Personas scans historically replaced the saved list with only
    // what SpicyChat currently showed. Preserve explicitly pinned local copies,
    // and optionally preserve every previously seen persona so users can keep a
    // local template after deleting a server-side persona to free a slot.
    for (const persona of cleanedExisting) {
      if (!onPersonasPage || settings.keepLocalPersonaCopies || persona.pinnedLocalCopy) {
        const key = persona.id || persona.name;
        if (key) byKey.set(key, persona);
      }
    }

    for (const persona of found) {
      const key = persona.id || persona.name;
      const previous = byKey.get(key) || cleanedExisting.find(item => (item.id || item.name) === key) || {};
      const previousText = String(previous.description || previous.highlights || "").trim();
      const foundText = String(persona.description || persona.highlights || "").trim();
      const preserveFullText = !!previousText && (previous.source === "/personas/edit" || previousText.length > foundText.length);
      const mergedText = preserveFullText ? previousText : foundText;
      const previousAvatar = String(previous.avatar || "");
      const foundAvatar = String(persona.avatar || "");
      const avatarChanged = !!(previousAvatar && foundAvatar && previousAvatar !== foundAvatar);
      byKey.set(key, {
        ...previous,
        ...persona,
        description: mergedText,
        highlights: mergedText,
        source: preserveFullText ? previous.source : persona.source,
        // Never lose a locally cached avatar image just because the live card
        // only exposes its CDN URL on a later scan.
        avatarDataUrl: avatarChanged ? (persona.avatarDataUrl || "") : (previous.avatarDataUrl || persona.avatarDataUrl || ""),
        pinnedLocalCopy: !!previous.pinnedLocalCopy
      });
    }

    const next = DS.cleanPersonas([...byKey.values()]);
    const hash = JSON.stringify(
      next.map(p => [
        p.id,
        p.name,
        p.avatar || "",
        p.description?.slice(0, 80) || "",
        !!p.active
      ])
    );

    if (hash === DS.state.lastPersonaSaveHash) return;

    DS.state.lastPersonaSaveHash = hash;
    await DS.savePersonas(next);
  };

  DS.acceptPersonaChangeModal = function acceptPersonaChangeModal() {
    const { settings } = DS.state;
    if (!settings.enabled || !settings.autoAcceptPersonaChange) return false;

    const modals = DS.qsa('[aria-labelledby="confirmation modal"], div.fixed, [role="dialog"]');

    for (const modal of modals) {
      const text = DS.normalize(modal.textContent);

      if (!text.includes("change persona")) continue;
      if (!text.includes("sure") && !text.includes("yes")) continue;

      const yesButton = DS.qsa("button", modal).find(button => {
        return DS.normalize(button.textContent) === "yes";
      });

      if (yesButton) {
        DS.realClick(yesButton);
        return true;
      }
    }

    return false;
  };

  function findChatDropdownButton() {
    return (
      document.querySelector('button[aria-label="chat-dropdown"]') ||
      DS.qsa("button").find(button =>
        button.querySelector("svg.lucide-ellipsis, svg[class*='lucide-ellipsis']")
      ) ||
      null
    );
  }

  function findMenuButtonByLabel(labelText) {
    const wanted = DS.normalize(labelText);

    return DS.qsa("button")
      .filter(button => !button.closest("#ds-qol-panel"))
      .find(button => {
        const aria = DS.normalize(button.getAttribute("aria-label") || "");
        const text = DS.normalize(button.textContent || "");

        return aria === wanted || text === wanted;
      }) || null;
  }

  function findPersonaPicker() {
    const labels = DS.qsa("label")
      .filter(label => !!label.querySelector("input[type='radio'][value]"))
      .filter(label => !!DS.extractPersonaFromModalLabel(label));

    if (!labels.length) return null;

    let root = labels[0];

    for (let i = 0; root && i < 8; i++, root = root.parentElement) {
      if (root === document.body || root.id === "root") break;

      const count = root.querySelectorAll("label input[type='radio'][value]").length;
      const text = DS.normalize(root.textContent);

      if (count >= labels.length && (text.includes("persona") || count >= 2)) {
        return root;
      }
    }

    return labels[0].closest("[role='dialog']") ||
      labels[0].closest("div.fixed") ||
      labels[0].parentElement;
  }

  function getVisiblePersonaLabels() {
    return DS.qsa("label")
      .filter(label => {
        const rect = label.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .filter(label => !!label.querySelector("input[type='radio'][value]"))
      .map(label => ({ label, persona: DS.extractPersonaFromModalLabel(label) }))
      .filter(item => item.persona);
  }

  function isVisible(el) {
  if (!el) return false;
  if (el.disabled) return false;

  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;

  const style = getComputedStyle(el);

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

function buttonLooksLikePersonaConfirm(button) {
  if (!button || !isVisible(button)) return false;

  const text = DS.normalize(button.textContent || "");
  const aria = DS.normalize(button.getAttribute("aria-label") || "");

  const hasChatWithKey = !!button.querySelector(
    "[data-translate-key='chat:modal.choosePersona.cta.chatWith']"
  );

  return (
    hasChatWithKey ||
    /^chat with\b/.test(text) ||
    /^chat with\b/.test(aria)
  );
}

function findPersonaConfirmButton() {
  const buttons = DS.qsa("button")
    .filter(button => !button.closest("#ds-qol-panel"))
    .filter(isVisible);

  const exact = buttons.find(buttonLooksLikePersonaConfirm);
  if (exact) return exact;

  const picker = findPersonaPicker();

  if (picker) {
    const pickerButtons = buttons.filter(button => picker.contains(button));

    const likely = pickerButtons
      .filter(button => {
        const text = DS.normalize(button.textContent || "");

        return (
          text &&
          !["back", "cancel", "close", "no", "yes", "manage personas"].includes(text) &&
          !text.includes("don't show") &&
          !text.includes("dont show")
        );
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();

        return br.top - ar.top || br.width - ar.width;
      });

    return likely[0] || null;
  }

  return null;
}

function forceReactClick(el) {
  if (!el) return false;

  el.scrollIntoView({
    block: "center",
    inline: "center"
  });

  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const eventBase = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: window.screenX + x,
    screenY: window.screenY + y,
    button: 0,
    buttons: 1
  };

  const targets = [
    el,
    el.querySelector("[data-translate-key='chat:modal.choosePersona.cta.chatWith']"),
    el.querySelector("span span"),
    el.querySelector("span")
  ].filter(Boolean);

  for (const target of targets) {
    try {
      target.focus?.();
    } catch {}

    for (const type of [
      "pointerover",
      "pointerenter",
      "mouseover",
      "mouseenter",
      "pointermove",
      "mousemove",
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click"
    ]) {
      try {
        const event = type.startsWith("pointer")
          ? new PointerEvent(type, {
              ...eventBase,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true
            })
          : new MouseEvent(type, eventBase);

        target.dispatchEvent(event);
      } catch {
        target.dispatchEvent(new MouseEvent(type, eventBase));
      }
    }

    try {
      target.click?.();
    } catch {}
  }

  return true;
}

async function clickPersonaConfirmButton() {
  const button = await waitFor(
    () => findPersonaConfirmButton(),
    7000,
    150
  );

  if (!button) {
    DS.setQuickStatus?.("Persona selected, but Chat with button was not found.");
    return false;
  }

  DS.setQuickStatus?.("Confirming persona switch...", true);

  forceReactClick(button);

  await DS.sleep(900);

  const stillThere = findPersonaConfirmButton();

  if (stillThere) {
    forceReactClick(stillThere);
    await DS.sleep(900);
  }

  return true;
}

async function clickPersonaConfirmButton() {
  const button = await waitFor(() => findPersonaConfirmButton(), 7000, 150);

  if (!button) {
    DS.setQuickStatus?.("Persona selected, but Chat with button was not found.");
    return false;
  }

  DS.setQuickStatus?.(`Clicking: ${button.textContent.trim()}`, true);

  forceReactClick(button);

  await DS.sleep(800);

  const stillThere = findPersonaConfirmButton();

  if (stillThere) {
    forceReactClick(stillThere);
    await DS.sleep(800);
  }

  return true;
}

  async function openPersonaPicker() {
    let picker = findPersonaPicker();
    if (picker) return picker;

    const dropdown = findChatDropdownButton();
    if (!dropdown) {
      DS.setQuickStatus?.("Could not find chat menu.");
      return null;
    }

    DS.realClick(dropdown);

    const changePersonaButton = await waitFor(
      () => findMenuButtonByLabel("Change Persona"),
      3000
    );

    if (!changePersonaButton) {
      DS.setQuickStatus?.("Could not find Change Persona.");
      return null;
    }

    DS.realClick(changePersonaButton);

    picker = await waitFor(() => findPersonaPicker(), 5000);

    if (!picker) {
      DS.setQuickStatus?.("Could not find persona picker.");
      return null;
    }

    await DS.scanPersonasFromPage?.();
    return picker;
  }

  function findPersonaChoice(persona) {
    const targetId = cleanText(persona?.id || "");
    const targetName = DS.normalize(persona?.name || "");

    const choices = getVisiblePersonaLabels();

    return choices.find(item => targetId && item.persona.id === targetId) ||
      choices.find(item => targetName && DS.normalize(item.persona.name) === targetName) ||
      choices.find(item => targetName && DS.normalize(item.persona.name).includes(targetName)) ||
      null;
  }

  DS.openPersonaPicker = openPersonaPicker;

  DS.switchToPersona = async function switchToPersona(personaIdOrName) {
    if (!DS.isSingleChatPage()) {
      DS.setQuickStatus?.("Open a chat first.");
      return false;
    }

    const wanted = DS.normalize(personaIdOrName);
    const persona = (DS.state.savedPersonas || []).find(item => {
      return (
        DS.normalize(item.id) === wanted ||
        DS.normalize(item.name) === wanted
      );
    });

    if (!persona) {
      DS.setQuickStatus?.("Persona not found. Open /personas first.");
      return false;
    }

    DS.setQuickStatus?.(`Switching to ${persona.name}...`, true);

    const picker = await openPersonaPicker();
    if (!picker) return false;

    await DS.scanPersonasFromPage?.();

    const choice = findPersonaChoice(persona);

    if (!choice) {
      DS.setQuickStatus?.(persona.pinnedLocalCopy
        ? `${persona.name} is saved locally but is not currently available in SpicyChat's persona picker. Restore it as new from the Local Persona Library if you have a free slot.`
        : `Could not find ${persona.name} in SpicyChat's persona picker.`);
      return false;
    }

    const input = choice.label.querySelector("input[type='radio']");
    const alreadySelected =
      !!input?.checked || choice.label.getAttribute("data-selected") === "true";

    if (!alreadySelected) {
      DS.realClick(choice.label);
      await DS.sleep(500);
    }

    const confirmed = await clickPersonaConfirmButton();

    await DS.sleep(700);
    DS.acceptPersonaChangeModal?.();
    await DS.sleep(700);
    DS.acceptPersonaChangeModal?.();

    if (!confirmed) {
      return false;
    }

    DS.setQuickStatus?.(`Persona switched to ${persona.name}.`);
    return true;
  };

  function personaOptionLabel(persona, index) {
    const name = cleanPersonaName(persona.name || persona.label || "");
    return name ? `${index + 1}. ${name}` : `Persona ${index + 1}`;
  }

  function ensurePersonaQuickSwitchPanel() {
    const panel = document.getElementById("ds-qol-panel");
    if (!panel) return;

    const body = panel.querySelector(".ds-qol-body");
    if (!body) return;

    let row = document.getElementById("ds-qol-persona-row");

    if (
      !DS.isSingleChatPage() ||
      DS.state.settings.showPersonaQuickSwitch === false ||
      DS.state.settings.quickPanelShowPersona === false
    ) {
      row?.remove();
      return;
    }

    let personas = DS.cleanPersonas(
      sanitizeSavedPersonas(DS.state.savedPersonas || [])
    );
    if (DS.state.settings.enablePersonaOrganizer && typeof DS.sortPersonasByOrganization === "function") {
      personas = DS.sortPersonasByOrganization(personas);
    }
    const limit = Math.max(1, Number(DS.state.settings.personaQuickSwitchLimit || 6));
    const shown = personas.slice(0, limit);
    const signature = JSON.stringify(
      shown.map(persona => [persona.id, persona.name, persona.avatar || ""])
    );

    if (!row) {
      row = document.createElement("div");
      row.id = "ds-qol-persona-row";
      row.className = "ds-qol-persona-card";

      const label = document.createElement("div");
      label.className = "ds-qol-mini-label";
      label.textContent = "Persona switch";
      const buttonsHost = document.createElement("div");
      buttonsHost.id = "ds-qol-persona-buttons";
      buttonsHost.className = "ds-qol-persona-buttons";
      const controls = document.createElement("div");
      controls.className = "ds-qol-persona-controls";
      const select = document.createElement("select");
      select.id = "ds-qol-persona-select";
      select.title = "Saved personas";
      const switchButton = document.createElement("button");
      switchButton.id = "ds-qol-persona-switch";
      switchButton.type = "button";
      switchButton.textContent = "Switch";
      controls.append(select, switchButton);
      const note = document.createElement("div");
      note.id = "ds-qol-persona-note";
      note.className = "ds-qol-small-note";
      row.append(label, buttonsHost, controls, note);

      body.appendChild(row);

      switchButton.addEventListener("click", () => {
        const select = document.getElementById("ds-qol-persona-select");
        DS.switchToPersona(select?.value || "");
      });
    }

    const existingNote = row.querySelector("#ds-qol-persona-note");
    if (shown.length && existingNote) {
      existingNote.textContent = "";
      existingNote.style.display = "none";
    }

    if (row.dataset.dsPersonaSignature === signature) return;
    row.dataset.dsPersonaSignature = signature;

    const buttons = row.querySelector("#ds-qol-persona-buttons");
    const select = row.querySelector("#ds-qol-persona-select");
    const note = row.querySelector("#ds-qol-persona-note");

    if (!shown.length) {
      buttons.replaceChildren();
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "No personas saved yet";
      select.replaceChildren(emptyOption);
      select.disabled = true;
      row.querySelector("#ds-qol-persona-switch").disabled = true;
      note.style.display = "block";
      note.textContent = "Open /personas or the Change Persona picker once so QoL can save them.";
      return;
    }

    note.textContent = "";
    note.style.display = "none";
    select.disabled = false;
    row.querySelector("#ds-qol-persona-switch").disabled = false;

    select.title = shown.length < personas.length
      ? `Showing first ${shown.length} of ${personas.length} saved personas.`
      : `${personas.length} saved persona${personas.length === 1 ? "" : "s"}.`;

    const optionNodes = shown.map((persona, index) => {
      const option = document.createElement("option");
      option.value = persona.id || persona.name;
      option.textContent = personaOptionLabel(persona, index);
      return option;
    });
    select.replaceChildren(...optionNodes);

    const buttonNodes = shown.map((persona, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ds-qol-persona-pill";
      button.title = persona.name || "";
      button.dataset.personaKey = persona.id || persona.name;
      button.textContent = String(index + 1);
      return button;
    });
    buttons.replaceChildren(...buttonNodes);

    buttons.querySelectorAll("button[data-persona-key]").forEach(button => {
      button.addEventListener("click", () => {
        DS.switchToPersona(button.dataset.personaKey || "");
      });
    });
  }

  DS.ensurePersonaQuickSwitchPanel = ensurePersonaQuickSwitchPanel;

  DS.applyPersonaQuickSwitch = function applyPersonaQuickSwitch() {
    ensurePersonaQuickSwitchPanel();
  };

  DS.applyPersonas = async function applyPersonas() {
    if (!DS.state.settings.enabled) return;

    await DS.scanPersonasFromPage?.();
    await DS.applyPersonaPickerOrganization?.();
    DS.acceptPersonaChangeModal?.();
    DS.applyPersonaQuickSwitch?.();
  };
})();