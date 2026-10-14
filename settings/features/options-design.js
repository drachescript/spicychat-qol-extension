// Feature-owned options helpers: design. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function hexRgb(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || "").trim());
  if (!match) return null;
  const hex = match[1];
  return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
}

function relativeLuminance(rgb) {
  if (!rgb) return 0;
  const values = rgb.map(channel => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrastRatio(bg, fg) {
  const a = relativeLuminance(hexRgb(bg));
  const b = relativeLuminance(hexRgb(fg));
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  return (high + 0.05) / (low + 0.05);
}

function updateBubbleContrastWarnings() {
  ["Ai", "User"].forEach(kind => {
    const warning = $(`chatBubble${kind}Contrast`);
    if (!warning) return;
    if (value(`chatBubble${kind}TextMode`, "custom") === "native") {
      warning.textContent = "Using SpicyChat's default normal text color.";
      warning.dataset.state = "ok";
      return;
    }
    const ratio = contrastRatio(value(`chatBubble${kind}Background`), value(`chatBubble${kind}Text`));
    if (!Number.isFinite(ratio)) {
      warning.textContent = "";
      return;
    }
    warning.textContent = ratio < 4.5
      ? `Low contrast (${ratio.toFixed(1)}:1) — text may be hard to read.`
      : `Contrast ${ratio.toFixed(1)}:1`;
    warning.dataset.state = ratio < 4.5 ? "warning" : "ok";
  });
}

function applyBubblePreset(name) {
  const basePreset = CHAT_BUBBLE_PRESETS[name];
  if (!basePreset) return;
  const preset = { ...CHAT_BUBBLE_TEXT_DEFAULTS, ...basePreset };
  preset.chatBubbleAiDialogueText = basePreset.chatBubbleAiText || preset.chatBubbleAiDialogueText;
  preset.chatBubbleUserDialogueText = basePreset.chatBubbleUserText || preset.chatBubbleUserDialogueText;
  preset.chatBubbleAiDecorationColor = basePreset.chatBubbleAiBackground || preset.chatBubbleAiDecorationColor;
  preset.chatBubbleUserDecorationColor = basePreset.chatBubbleUserBackground || preset.chatBubbleUserDecorationColor;
  Object.entries(preset).forEach(([key, val]) => {
    const element = $(key);
    if (!element) return;
    if (element.type === "checkbox") element.checked = !!val;
    else element.value = String(val);
  });
  if (name === "default") {
    const enabled = $("enableChatBubbleCustomization");
    if (enabled) enabled.checked = false;
  }
  updateAppearanceColorControlStates();
  if (settingsAutosaveReady) {
    const card = $("enableChatBubbleCustomization")?.closest?.(".card");
    if (card) queueSettingsDiffForContainer(card, { delay: 60 });
  }
  showSettingsToast(name === "default"
    ? "SpicyChat bubble styling restored. Changes save automatically."
    : `Chat bubble preset: ${name}. Changes save automatically.`);
}

async function save() {
  await flushSoundscapeSceneState();
  // Save now is the safety/fallback path. Normal interaction never scans the
  // entire page; this explicit button intentionally performs one full diff,
  // then verifies only the settings that actually changed.
  queueFullSettingsDiffFromPage({ delay: 0 });
  const settingsOk = await flushSettingsAutosave({ force: true });
  await flushAuxiliaryOptionsSave();

  const payload = {};
  // Large saved lists can contain thousands of entries. Only write managers
  // that were actually edited instead of rebuilding unrelated stores.
  if (dirtySavedStores.has("blocked")) payload[BLOCKED_BOTS_KEY] = blockedState;
  if (dirtySavedStores.has("notInterested")) payload[NOT_INTERESTED_KEY] = notInterestedState;
  if (dirtySavedStores.has("favoriteCreators")) payload[FAVORITE_CREATORS_KEY] = normalizeCreatorStore(favoriteCreatorState);
  if (dirtySavedStores.has("followedCreators")) payload[FOLLOWED_CREATORS_KEY] = normalizeCreatorStore(followedCreatorState);
  if (dirtySavedStores.has("favorite")) payload[FAVORITE_BOTS_KEY] = normalizeBotStore(favoriteBotState);
  if (dirtySavedStores.has("later")) payload[LATER_BOTS_KEY] = normalizeBotStore(laterBotState);
  if (dirtySavedStores.has("organizer")) payload[BOT_ORGANIZER_KEY] = normalizeBotOrganization(botOrganizationState);
  if (dirtySavedStores.has("opened")) {
    payload[OPENED_KEY] = uniqueClean(currentOpened);
    payload[OPENED_META_KEY] = normalizeMetaStore(openedChatMetaState);
  }

  let storesOk = true;
  if (Object.keys(payload).length) storesOk = await rawStorageSet(payload);
  if (storesOk) dirtySavedStores.clear();
  const ok = settingsOk && storesOk;
  setAutosaveStatus(ok ? "Saved and verified." : "Couldn’t save — try again", ok ? "saved" : "error");
  if (ok) setTimeout(() => { if ($("status")?.textContent === "Saved and verified.") setAutosaveStatus("Saved automatically", "saved"); }, 1400);
  return ok;
}

async function clearOpened() {
  const current = await storageGet([OPENED_KEY, OPENED_META_KEY]);
  const opened = Array.isArray(current[OPENED_KEY]) ? current[OPENED_KEY] : [];
  if (!opened.length) {
    showSettingsToast("There is no opened-history data to clear.");
    return;
  }
  if (!confirm(`Clear ${opened.length} opened chat${opened.length === 1 ? "" : "s"}? You can undo it for a few seconds.`)) return;

  const backup = {
    [OPENED_KEY]: [...opened],
    [OPENED_META_KEY]: normalizeMetaStore(current[OPENED_META_KEY])
  };
  await storageSet({ [OPENED_KEY]: [], [OPENED_META_KEY]: {} });
  await load();
  showSettingsToast(`Cleared ${opened.length} opened chat${opened.length === 1 ? "" : "s"}.`, async () => {
    await storageSet(backup);
    await load();
  });
}
