(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const MODAL_ID = "ds-qol-character-profile-modal";
  const VALID_RP_STATE = new Set(["inherit", "on", "off"]);
  const VALID_RP_STYLE = new Set(["inherit", "clean", "quoted"]);
  const VALID_RP_DETECTION = new Set(["inherit", "conservative", "balanced", "aggressive"]);
  const VALID_AUTO_VOICE = new Set(["inherit", "on", "off"]);

  let lastAppliedAutoVoiceKey = "";
  let modalEscapeHandler = null;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function currentCharacterId() {
    return DS.chatIdFromHref?.(location.href || "") || "";
  }

  function currentCharacterName() {
    return clean(
      document.querySelector("a[aria-label='chatbot-profile'] h1")?.textContent ||
      document.querySelector("a[aria-label='chatbot-profile']")?.textContent ||
      DS.getCurrentBotName?.() ||
      currentCharacterId()
    );
  }

  function normalizeChoice(value, allowed, fallback = "inherit") {
    const normalized = clean(value).toLowerCase();
    return allowed.has(normalized) ? normalized : fallback;
  }

  function normalizeProfile(raw, id = "") {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      id: clean(source.id || id),
      name: clean(source.name),
      rpFormatRepair: normalizeChoice(source.rpFormatRepair, VALID_RP_STATE),
      rpFormatStyle: normalizeChoice(source.rpFormatStyle, VALID_RP_STYLE),
      rpFormatDetection: normalizeChoice(source.rpFormatDetection, VALID_RP_DETECTION),
      autoVoiceOnOpen: normalizeChoice(source.autoVoiceOnOpen, VALID_AUTO_VOICE),
      updatedAt: Number(source.updatedAt) || 0
    };
  }

  function normalizeStore(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const output = {};

    Object.entries(source).forEach(([id, profile]) => {
      const cleanId = clean(id || profile?.id);
      if (!cleanId) return;
      output[cleanId] = normalizeProfile(profile, cleanId);
    });

    return output;
  }

  function store() {
    DS.state.characterQolProfiles = normalizeStore(DS.state.characterQolProfiles);
    return DS.state.characterQolProfiles;
  }

  function hasCustomValues(profile) {
    if (!profile) return false;
    return (
      profile.rpFormatRepair !== "inherit" ||
      profile.rpFormatStyle !== "inherit" ||
      profile.rpFormatDetection !== "inherit" ||
      profile.autoVoiceOnOpen !== "inherit"
    );
  }

  function getCurrentProfile() {
    const id = currentCharacterId();
    if (!id) return null;
    return normalizeProfile(store()[id], id);
  }

  async function saveStore(nextStore) {
    const normalized = normalizeStore(nextStore);
    DS.state.characterQolProfiles = normalized;
    await DS.storageSet?.({ [DS.CHARACTER_QOL_PROFILES_KEY]: normalized });
    DS.updateQuickPanel?.();
    DS.scheduleRun?.({ priority: "critical", source: "character-profile-save" });
    return normalized;
  }

  async function saveCurrentProfile(values) {
    const id = currentCharacterId();
    if (!id) return false;

    const next = { ...store() };
    const profile = normalizeProfile({
      ...values,
      id,
      name: currentCharacterName(),
      updatedAt: Date.now()
    }, id);

    if (hasCustomValues(profile)) next[id] = profile;
    else delete next[id];

    await saveStore(next);
    lastAppliedAutoVoiceKey = "";
    return true;
  }

  async function clearCurrentProfile() {
    const id = currentCharacterId();
    if (!id) return false;
    const next = { ...store() };
    delete next[id];
    await saveStore(next);
    lastAppliedAutoVoiceKey = "";
    return true;
  }

  function effectiveRpSettings() {
    const base = { ...(DS.state?.settings || {}) };
    if (!base.enableCharacterQolProfiles || !DS.isSingleChatPage?.()) return base;

    const profile = getCurrentProfile();
    if (!profile || !hasCustomValues(profile)) return base;

    if (profile.rpFormatRepair === "on") base.enableRpFormatRepair = true;
    else if (profile.rpFormatRepair === "off") base.enableRpFormatRepair = false;

    if (profile.rpFormatStyle !== "inherit") base.rpFormatStyle = profile.rpFormatStyle;
    if (profile.rpFormatDetection !== "inherit") base.rpFormatDetection = profile.rpFormatDetection;

    return base;
  }

  function makeOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function makeSelect(id, options, value) {
    const select = document.createElement("select");
    select.id = id;
    options.forEach(([optionValue, label]) => select.appendChild(makeOption(optionValue, label)));
    select.value = value;
    return select;
  }

  function makeField(labelText, control) {
    const label = document.createElement("label");
    label.className = "ds-character-profile-field";
    const span = document.createElement("span");
    span.textContent = labelText;
    label.append(span, control);
    return label;
  }

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
    if (modalEscapeHandler) {
      document.removeEventListener("keydown", modalEscapeHandler, true);
      modalEscapeHandler = null;
    }
  }

  function openModal() {
    if (!DS.isSingleChatPage?.()) return;
    closeModal();

    const profile = getCurrentProfile() || normalizeProfile({}, currentCharacterId());
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "ds-character-profile-overlay";

    const dialog = document.createElement("div");
    dialog.className = "ds-character-profile-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Character QoL profile");

    const head = document.createElement("div");
    head.className = "ds-character-profile-head";

    const titleWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Character QoL profile";
    const subtitle = document.createElement("span");
    subtitle.textContent = currentCharacterName() || "Current character";
    titleWrap.append(title, subtitle);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "ds-character-profile-close";
    close.textContent = "×";
    close.title = "Close";
    close.addEventListener("click", closeModal);
    head.append(titleWrap, close);

    const hint = document.createElement("p");
    hint.className = "ds-character-profile-hint";
    hint.textContent = "Only settings changed here override your normal global settings for this character.";

    const fields = document.createElement("div");
    fields.className = "ds-character-profile-fields";

    const rpEnabled = makeSelect("ds-char-profile-rp-enabled", [
      ["inherit", "Use global setting"],
      ["on", "Always on for this character"],
      ["off", "Always off for this character"]
    ], profile.rpFormatRepair);

    const rpStyle = makeSelect("ds-char-profile-rp-style", [
      ["inherit", "Use global style"],
      ["clean", "Clean RP"],
      ["quoted", "Quoted dialogue"]
    ], profile.rpFormatStyle);

    const rpDetection = makeSelect("ds-char-profile-rp-detection", [
      ["inherit", "Use global detection"],
      ["conservative", "Conservative"],
      ["balanced", "Balanced"],
      ["aggressive", "Aggressive"]
    ], profile.rpFormatDetection);

    const autoVoice = makeSelect("ds-char-profile-auto-voice", [
      ["inherit", "Leave Auto voice as-is"],
      ["on", "Turn on when this chat opens"],
      ["off", "Turn off when this chat opens"]
    ], profile.autoVoiceOnOpen);

    fields.append(
      makeField("RP Format Repair", rpEnabled),
      makeField("RP formatting style", rpStyle),
      makeField("RP detection strength", rpDetection),
      makeField("Auto voice on chat open", autoVoice)
    );

    const actions = document.createElement("div");
    actions.className = "ds-character-profile-actions";

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Use global defaults";
    reset.addEventListener("click", async () => {
      await clearCurrentProfile();
      closeModal();
      DS.setQuickStatus?.("Character profile reset to global settings.");
    });

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", closeModal);

    const save = document.createElement("button");
    save.type = "button";
    save.className = "ds-character-profile-save";
    save.textContent = "Save profile";
    save.addEventListener("click", async () => {
      await saveCurrentProfile({
        rpFormatRepair: rpEnabled.value,
        rpFormatStyle: rpStyle.value,
        rpFormatDetection: rpDetection.value,
        autoVoiceOnOpen: autoVoice.value
      });
      closeModal();
      DS.setQuickStatus?.("Character QoL profile saved.");
      DS.applyCharacterQolProfile?.({ force: true });
      DS.applyRpFormatRepair?.();
      DS.applyAutoVoice?.();
    });

    actions.append(reset, cancel, save);
    dialog.append(head, hint, fields, actions);
    overlay.appendChild(dialog);

    overlay.addEventListener("pointerdown", event => {
      if (event.target === overlay) closeModal();
    });

    modalEscapeHandler = event => {
      if (event.key !== "Escape") return;
      closeModal();
    };
    document.addEventListener("keydown", modalEscapeHandler, true);

    document.documentElement.appendChild(overlay);
    setTimeout(() => rpEnabled.focus(), 0);
  }

  DS.normalizeCharacterQolProfiles = normalizeStore;
  DS.getCurrentCharacterQolProfile = getCurrentProfile;
  DS.hasCurrentCharacterQolProfile = function hasCurrentCharacterQolProfile() {
    return hasCustomValues(getCurrentProfile());
  };
  DS.getEffectiveRpFormatSettings = effectiveRpSettings;
  DS.isRpFormatRepairEnabledForCurrentCharacter = function isRpFormatRepairEnabledForCurrentCharacter() {
    return !!effectiveRpSettings().enableRpFormatRepair;
  };
  DS.openCharacterQolProfile = openModal;
  DS.clearCurrentCharacterQolProfile = clearCurrentProfile;

  DS.applyCharacterQolProfile = function applyCharacterQolProfile(options = {}) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableCharacterQolProfiles || !DS.isSingleChatPage?.()) {
      lastAppliedAutoVoiceKey = "";
      closeModal();
      return;
    }

    const profile = getCurrentProfile();
    const id = currentCharacterId();
    const autoMode = profile?.autoVoiceOnOpen || "inherit";
    const applyKey = `${location.pathname}|${id}|${autoMode}|${profile?.updatedAt || 0}`;

    if (!options.force && lastAppliedAutoVoiceKey === applyKey) return;
    lastAppliedAutoVoiceKey = applyKey;

    if (autoMode === "on" && !DS.isAutoVoiceEnabled?.()) {
      DS.setAutoVoiceEnabled?.(true);
    } else if (autoMode === "off" && DS.isAutoVoiceEnabled?.()) {
      DS.setAutoVoiceEnabled?.(false);
    }
  };
})();
