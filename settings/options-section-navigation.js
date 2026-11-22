// Settings page module. Loaded before options.js.
const SETTINGS_SECTION_COLLAPSE_EXCLUDED_TABS = new Set(["features", "changelog", "help"]);
const SETTINGS_PINNED_SECTIONS_KEY = "dsSettingsPinnedSectionsV1";
const SETTINGS_RECENT_SECTIONS_KEY = "dsSettingsRecentSectionsV1";
const SETTINGS_ENABLED_ONLY_KEY = "dsSettingsEnabledOnlyV1";
const SETTINGS_SECTION_STATE_KEY = "dsSettingsSectionStateV1";
let settingsSectionDefaultsApplied = false;
let settingsShowEnabledOnly = false;

function readLocalJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function cleanSettingsSectionLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function settingsCardInfo(card) {
  if (!card) return null;
  const page = card.closest?.(".tab-page");
  const tabName = String(page?.dataset?.page || "");
  if (!tabName) return null;
  const heading = cleanSettingsSectionLabel(
    card.querySelector(":scope > h2 .settings-card-toggle")?.textContent ||
    card.querySelector(":scope > h2")?.textContent ||
    "Settings"
  );
  const key = card.id ? `id:${card.id}` : `tab:${tabName}:${heading.toLowerCase()}`;
  const tabButton = document.querySelector(`.tab-button[data-tab="${CSS.escape(tabName)}"]`);
  const tabLabel = cleanSettingsSectionLabel(tabButton?.textContent || tabName);
  return { key, tabName, tabLabel, heading };
}

function settingsCardByKey(key) {
  const wanted = String(key || "");
  if (!wanted) return null;
  // Most saved Settings shortcuts have stable element IDs. Resolve directly
  // instead of walking every section on every navigation.
  if (wanted.startsWith("id:")) {
    const card = document.getElementById(wanted.slice(3));
    return card?.matches?.(".tab-page > section.card.ds-settings-card-collapsible") ? card : null;
  }
  for (const card of document.querySelectorAll(".tab-page > section.card.ds-settings-card-collapsible")) {
    if (settingsCardInfo(card)?.key === wanted) return card;
  }
  return null;
}

function pinnedSettingsSections() {
  const list = readLocalJson(SETTINGS_PINNED_SECTIONS_KEY, []);
  return Array.isArray(list) ? [...new Set(list.map(String).filter(Boolean))].slice(0, 30) : [];
}

function recentSettingsSections() {
  const list = readLocalJson(SETTINGS_RECENT_SECTIONS_KEY, []);
  return Array.isArray(list) ? [...new Set(list.map(String).filter(Boolean))].slice(0, 8) : [];
}

function refreshSettingsSectionShortcuts() {
  const pinnedSelect = $("settingsPinnedSections");
  const recentSelect = $("settingsRecentSections");
  const pinned = pinnedSettingsSections();
  const recent = recentSettingsSections();

  // Build one lookup for the shortcuts, instead of walking every Settings
  // card once per pinned/recent key (up to 38 full DOM walks per refresh).
  const cardsByKey = new Map();
  if (pinnedSelect || recentSelect) {
    document.querySelectorAll(".tab-page > section.card.ds-settings-card-collapsible").forEach(card => {
      const info = settingsCardInfo(card);
      if (info) cardsByKey.set(info.key, info);
    });
  }
  const fill = (select, keys, placeholder) => {
    if (!select) return;
    const previous = select.value;
    const options = [new Option(placeholder, "")];
    for (const key of keys) {
      const info = cardsByKey.get(key);
      if (info) options.push(new Option(`${info.tabLabel} · ${info.heading}`, key));
    }
    // Changing an unchanged select needlessly triggers layout/accessibility
    // work on every Settings refresh. Preserve its current node if identical.
    const unchanged = select.options.length === options.length &&
      options.every((option, index) => select.options[index]?.value === option.value &&
        select.options[index]?.text === option.text);
    if (!unchanged) select.replaceChildren(...options);
    select.value = [...select.options].some(option => option.value === previous) ? previous : "";
  };

  fill(pinnedSelect, pinned, pinned.length ? "Pinned sections…" : "No pinned sections");
  fill(recentSelect, recent, recent.length ? "Recent sections…" : "No recent sections");

  document.querySelectorAll(".settings-card-pin").forEach(button => {
    const card = button.closest("section.card");
    const key = settingsCardInfo(card)?.key || "";
    const active = pinned.includes(key);
    button.classList.toggle("is-pinned", active);
    const label = active ? "Unpin this Settings section" : "Pin this Settings section";
    const mark = active ? "★" : "☆";
    if (button.textContent !== mark) button.textContent = mark;
    if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    if (button.title !== label) button.title = label;
  });
}

function applyPinnedSettingsSectionOrder() {
  const pins = pinnedSettingsSections();
  const pinRank = new Map(pins.map((key, index) => [key, index]));
  document.querySelectorAll(".tab-page").forEach(page => {
    const cards = [...page.querySelectorAll(":scope > section.card.ds-settings-card-collapsible")];
    if (cards.length < 2) return;
    cards.forEach((card, index) => {
      if (!card.dataset.dsSettingsOriginalOrder) card.dataset.dsSettingsOriginalOrder = String(index + 1);
    });
    // Compare cached section keys, not repeated heading/tab DOM lookups
    // inside Array.sort's O(n log n) comparator.
    const cardKeys = new Map(cards.map(card => [card, settingsCardInfo(card)?.key || ""]));
    cards.sort((a, b) => {
      const aKey = cardKeys.get(a) || "";
      const bKey = cardKeys.get(b) || "";
      const aPinned = pinRank.has(aKey);
      const bPinned = pinRank.has(bKey);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned && bPinned) return (pinRank.get(aKey) || 0) - (pinRank.get(bKey) || 0);
      return Number(a.dataset.dsSettingsOriginalOrder || 0) - Number(b.dataset.dsSettingsOriginalOrder || 0);
    });
    // No DOM writes for already-correct sections. Previously each refresh
    // detached and re-appended every card, even with no pinned sections.
    const currentOrder = page.querySelectorAll(":scope > section.card.ds-settings-card-collapsible");
    if (cards.some((card, index) => card !== currentOrder[index])) {
      // Move only cards that need ordering; preserve the native elements and
      // their listeners, controls, form state, and observed scroll positions.
      let anchor = null;
      for (let i = cards.length - 1; i >= 0; i -= 1) {
        const card = cards[i];
        if (anchor && card.nextElementSibling !== anchor) page.insertBefore(card, anchor);
        else if (!anchor && card !== page.lastElementChild) page.appendChild(card);
        anchor = card;
      }
    }
  });
}

function recordRecentSettingsCard(card) {
  const info = settingsCardInfo(card);
  if (!info) return;
  const next = [info.key, ...recentSettingsSections().filter(key => key !== info.key)].slice(0, 8);
  writeLocalJson(SETTINGS_RECENT_SECTIONS_KEY, next);
  refreshSettingsSectionShortcuts();
}

function navigateToSettingsCard(card) {
  const info = settingsCardInfo(card);
  if (!card || !info) return;
  setActiveTab(info.tabName);
  setSettingsCardCollapsed(card, false);
  recordRecentSettingsCard(card);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.classList.add("ds-search-target");
    setTimeout(() => card.classList.remove("ds-search-target"), 1800);
  }));
}

function settingValueFromControl(key, card) {
  const direct = card.querySelector(`#${CSS.escape(key)}`);
  if (direct) {
    if (direct.type === "checkbox") return !!direct.checked;
    if (direct.type === "radio") return direct.checked ? direct.value : undefined;
    return direct.value;
  }
  const selectedRadio = card.querySelector(`input[type="radio"][name="${CSS.escape(key)}"]:checked`);
  if (selectedRadio) return selectedRadio.value;
  return undefined;
}

function settingValueDiffers(current, expected) {
  if (Array.isArray(expected)) {
    const currentList = Array.isArray(current)
      ? current
      : String(current || "").split(/[\n,]+/g).map(item => item.trim()).filter(Boolean);
    return JSON.stringify(currentList) !== JSON.stringify(expected);
  }
  if (typeof expected === "boolean") return !!current !== expected;
  if (typeof expected === "number") return Number(current) !== expected;
  return String(current ?? "") !== String(expected ?? "");
}

function settingsCardHasEnabledFeature(card, pinned = null) {
  const info = settingsCardInfo(card);
  if (!info) return true;
  if (info.key === "id:settingsLayoutCard") return true;
  if ((pinned || pinnedSettingsSections()).includes(info.key)) return true;

  const keys = [...new Set([...card.querySelectorAll("input, select, textarea")]
    .flatMap(control => [control.id, control.matches('input[type="radio"]') ? control.name : ""])
    .filter(key => key && Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)))];
  if (!keys.length) return true;

  const optInBooleans = keys.filter(key => DEFAULT_SETTINGS[key] === false);
  if (optInBooleans.some(key => settingValueFromControl(key, card) === true)) return true;

  // A few core features ship enabled. If the first checkbox in a section is an
  // enabled-by-default master switch, treat the section as enabled instead of
  // hiding it just because one of its optional child checkboxes defaults off.
  const firstCheckbox = card.querySelector("input[type='checkbox'][id]");
  if (firstCheckbox?.id in DEFAULT_SETTINGS && DEFAULT_SETTINGS[firstCheckbox.id] === true && firstCheckbox.checked) return true;

  // Cards with no opt-in switch (for example layout/default selectors) count as
  // active when one of their values differs from the shipped default.
  if (!optInBooleans.length) {
    return keys.some(key => settingValueDiffers(settingValueFromControl(key, card), DEFAULT_SETTINGS[key]));
  }

  // A changed non-boolean preference can still be meaningful even if its
  // parent toggle lives elsewhere in the same section.
  return keys.some(key => typeof DEFAULT_SETTINGS[key] !== "boolean" && settingValueDiffers(settingValueFromControl(key, card), DEFAULT_SETTINGS[key]));
}

function applySettingsEnabledOnlyFilter() {
  const pinned = settingsShowEnabledOnly ? pinnedSettingsSections() : null;
  document.querySelectorAll(".tab-page > section.card.ds-settings-card-collapsible").forEach(card => {
    const hide = settingsShowEnabledOnly && !settingsCardHasEnabledFeature(card, pinned);
    card.classList.toggle("ds-settings-filtered-out", hide);
  });
  const button = $("settingsShowEnabledOnly");
  if (button) {
    button.classList.toggle("active", settingsShowEnabledOnly);
    button.textContent = settingsShowEnabledOnly ? "Show all sections" : "Show enabled only";
    button.setAttribute("aria-pressed", settingsShowEnabledOnly ? "true" : "false");
  }
}

function resetSettingsSection(card) {
  const info = settingsCardInfo(card);
  if (!card || !info) return;
  if (!confirm(`Reset “${info.heading}” to its default settings? Changes save automatically; Save now is only a force-and-verify fallback.`)) return;

  let changed = 0;
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    let handled = false;
    let control = null;
    try { control = card.querySelector(`#${CSS.escape(key)}`); } catch {}
    if (control) {
      if (control.type === "checkbox") control.checked = !!defaultValue;
      else if (control.type === "radio") control.checked = String(control.value) === String(defaultValue);
      else if (Array.isArray(defaultValue)) control.value = defaultValue.join("\n");
      else control.value = String(defaultValue ?? "");
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      handled = true;
    }
    const radios = [...card.querySelectorAll(`input[type="radio"][name="${CSS.escape(key)}"]`)];
    if (radios.length) {
      radios.forEach(radio => { radio.checked = String(radio.value) === String(defaultValue); });
      radios.find(radio => radio.checked)?.dispatchEvent(new Event("change", { bubbles: true }));
      handled = true;
    }
    if (handled) changed += 1;
  }

  updateSettingDependencies?.();
  applySettingsEnabledOnlyFilter();
  showSettingsToast(changed
    ? `Reset ${info.heading}. Changes save automatically.`
    : `There are no normal Settings values to reset in ${info.heading}.`);
}

function setupSettingsSectionNavigation() {
  settingsShowEnabledOnly = sessionStorage.getItem(SETTINGS_ENABLED_ONLY_KEY) === "1";

  const goFromSelect = event => {
    const key = event.target.value;
    if (!key) return;
    const card = settingsCardByKey(key);
    event.target.value = "";
    if (card) navigateToSettingsCard(card);
    else window.dsqHydrateAllFeaturePanels?.().then(() => {
      const restored = settingsCardByKey(key);
      if (restored) navigateToSettingsCard(restored);
    }).catch(() => {});
  };
  $("settingsPinnedSections")?.addEventListener("change", goFromSelect);
  $("settingsRecentSections")?.addEventListener("change", goFromSelect);
  $("settingsShowEnabledOnly")?.addEventListener("click", () => {
    settingsShowEnabledOnly = !settingsShowEnabledOnly;
    sessionStorage.setItem(SETTINGS_ENABLED_ONLY_KEY, settingsShowEnabledOnly ? "1" : "0");
    applySettingsEnabledOnlyFilter();
  });

  document.addEventListener("change", event => {
    const card = event.target?.closest?.("section.card.ds-settings-card-collapsible");
    if (card) {
      recordRecentSettingsCard(card);
      if (settingsShowEnabledOnly) applySettingsEnabledOnlyFilter();
    }
  }, true);

  applyPinnedSettingsSectionOrder();
  refreshSettingsSectionShortcuts();
  applySettingsEnabledOnlyFilter();
}

function readSettingsSectionState() {
  const raw = readLocalJson(SETTINGS_SECTION_STATE_KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const state = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key || typeof value !== "boolean") continue;
    state[key] = value;
  }
  return state;
}

function writeSettingsSectionState(state) {
  const next = {};
  for (const [key, value] of Object.entries(state || {})) {
    if (!key || typeof value !== "boolean") continue;
    next[key] = value;
  }
  writeLocalJson(SETTINGS_SECTION_STATE_KEY, next);
}

function persistSettingsCardCollapsed(card, collapsed) {
  const info = settingsCardInfo(card);
  if (!info?.key || SETTINGS_SECTION_COLLAPSE_EXCLUDED_TABS.has(info.tabName)) return;
  const state = readSettingsSectionState();
  state[info.key] = !!collapsed;
  writeSettingsSectionState(state);
}

function persistAllSettingsSectionStates() {
  const state = readSettingsSectionState();
  const liveKeys = new Set();
  document.querySelectorAll(".tab-page > section.card.ds-settings-card-collapsible").forEach(card => {
    const info = settingsCardInfo(card);
    if (!info?.key || SETTINGS_SECTION_COLLAPSE_EXCLUDED_TABS.has(info.tabName)) return;
    liveKeys.add(info.key);
    state[info.key] = card.classList.contains("ds-settings-card-collapsed");
  });
  // Drop entries for Settings sections that no longer exist, while keeping the
  // state object small and resilient across renamed/removed cards.
  for (const key of Object.keys(state)) {
    if (!liveKeys.has(key)) delete state[key];
  }
  writeSettingsSectionState(state);
}

function setSettingsCardCollapsed(card, collapsed, { persist = false } = {}) {
  if (!card?.classList?.contains("ds-settings-card-collapsible")) return;
  const body = card.querySelector(":scope > .settings-card-body");
  const toggle = card.querySelector(":scope > h2 .settings-card-toggle");
  if (!body || !toggle) return;
  const next = !!collapsed;
  card.classList.toggle("ds-settings-card-collapsed", next);
  body.hidden = next;
  toggle.setAttribute("aria-expanded", next ? "false" : "true");
  if (!next) {
    try { card.dispatchEvent(new CustomEvent("ds-settings-card-opened")); } catch {}
  }
  if (persist) persistSettingsCardCollapsed(card, next);
}

function setSettingsTabCollapsed(tabName, collapsed) {
  if (SETTINGS_SECTION_COLLAPSE_EXCLUDED_TABS.has(String(tabName || ""))) return;
  const page = document.querySelector(`.tab-page[data-page="${CSS.escape(String(tabName || ""))}"]`);
  page?.querySelectorAll(":scope > section.card.ds-settings-card-collapsible").forEach(card => {
    setSettingsCardCollapsed(card, collapsed);
  });
}

function setAllSettingsSectionsCollapsed(collapsed) {
  document.querySelectorAll(".tab-page").forEach(page => {
    setSettingsTabCollapsed(page.dataset.page || "", collapsed);
  });
}

function expandSettingsCardForTarget(target) {
  const card = target?.closest?.("section.card.ds-settings-card-collapsible");
  if (card) setSettingsCardCollapsed(card, false);
}

function setupCollapsibleSettingsCards() {
  // Scan each card's controls once rather than running one selector for every
  // setting key. Large Custom Lite builds can have hundreds of both.
  const resettableSettings = new Set(Object.keys(DEFAULT_SETTINGS));
  document.querySelectorAll(".tab-page").forEach(page => {
    const tabName = String(page.dataset.page || "");
    if (SETTINGS_SECTION_COLLAPSE_EXCLUDED_TABS.has(tabName)) return;

    page.querySelectorAll(":scope > section.card").forEach((card, index) => {
      if (card.classList.contains("ds-settings-card-collapsible")) return;
      const heading = card.querySelector(":scope > h2");
      if (!heading) return;

      const body = document.createElement("div");
      body.className = "settings-card-body";
      while (heading.nextSibling) body.appendChild(heading.nextSibling);
      card.appendChild(body);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "settings-card-toggle";
      while (heading.firstChild) toggle.appendChild(heading.firstChild);

      const bodyId = card.id ? `${card.id}-body` : `settings-card-${tabName}-${index}-body`;
      body.id = bodyId;
      toggle.setAttribute("aria-controls", bodyId);
      toggle.setAttribute("aria-expanded", "true");
      toggle.title = "Open or close this Settings section";
      toggle.addEventListener("click", () => {
        setSettingsCardCollapsed(card, !card.classList.contains("ds-settings-card-collapsed"), { persist: true });
        recordRecentSettingsCard(card);
      });

      const tools = document.createElement("span");
      tools.className = "settings-card-heading-tools";
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "settings-card-pin";
      pin.textContent = "☆";
      pin.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const key = settingsCardInfo(card)?.key || "";
        if (!key) return;
        const pins = pinnedSettingsSections();
        const next = pins.includes(key) ? pins.filter(item => item !== key) : [...pins, key];
        writeLocalJson(SETTINGS_PINNED_SECTIONS_KEY, next);
        applyPinnedSettingsSectionOrder();
        refreshSettingsSectionShortcuts();
        applySettingsEnabledOnlyFilter();
      });
      tools.appendChild(pin);

      const canReset = Array.from(card.querySelectorAll("[id], input[type='radio'][name]")).some(control =>
        resettableSettings.has(control.id) ||
        (control.matches("input[type='radio'][name]") && resettableSettings.has(control.name))
      );
      if (canReset) {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "settings-card-reset";
        reset.textContent = "Reset";
        reset.title = "Reset this section to its default settings";
        reset.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          resetSettingsSection(card);
        });
        tools.appendChild(reset);
      }

      heading.append(toggle, tools);
      card.classList.add("ds-settings-card-collapsible");
    });
  });
}

function applySettingsSectionDefault(settings = {}) {
  settingsSectionDefaultsApplied = true;
  const savedState = readSettingsSectionState();
  const defaultCollapsed = !!settings.collapseSettingsSectionsByDefault;
  let changed = false;
  document.querySelectorAll(".tab-page > section.card.ds-settings-card-collapsible").forEach(card => {
    if (card.dataset.dsqSectionDefaultApplied === "1") return;
    const info = settingsCardInfo(card);
    if (!info?.key || SETTINGS_SECTION_COLLAPSE_EXCLUDED_TABS.has(info.tabName)) return;
    card.dataset.dsqSectionDefaultApplied = "1";
    const collapsed = Object.prototype.hasOwnProperty.call(savedState, info.key)
      ? !!savedState[info.key] : defaultCollapsed;
    setSettingsCardCollapsed(card, collapsed);
    if (!Object.prototype.hasOwnProperty.call(savedState, info.key)) {
      savedState[info.key] = collapsed;
      changed = true;
    }
  });
  if (changed) writeSettingsSectionState(savedState);
}


// v0.2.92 — Static feature-panel hydration. The inert script tags remain in
// options.html for ownership/Custom metadata, but cannot execute until asked.
// No page-wide observer, polling, or storage reads. Concurrent callers share
// one in-flight script; a failed script may be retried on the next visit.
(function installDeferredFeaturePanelHydration() {
  const lazyType = "application/x-dsq-lazy-feature-panel";
  const inflight = new Map();
  const deferredControlTabs = Object.freeze({"languageFilterMode":"blocking","languageShowDetectedBadge":"blocking","enableLanguageFilter":"blocking","languageAutoDetectUntagged":"blocking","languageFilterRulebooks":"blocking","languageSelectionMode":"blocking","languageFilterLorebooks":"blocking","ds-feature-panel-language-filter":"blocking","ds-feature-panel-native-memory-probe":"personas-memory","chatBubbleMaxWidth":"appearance","chatComposerWidth":"appearance","chatWidthControlsCard":"appearance","chatStreamWidth":"appearance","enableChatWidthControls":"appearance","ds-feature-panel-chat-width-controls":"appearance","enableReplyInstructions":"writing","replyInstructionsCard":"writing","replyInstructionText":"writing","replyInstructionOocWrapper":"writing","replyInstructionSendMode":"writing","replyInstructionShowChatButton":"writing","ds-feature-panel-reply-instructions":"writing","ds-feature-panel-model-quick-access":"writing","enableTagAliases":"blocking","tagAliasesCard":"blocking","showTagExplanations":"blocking","tagAliasShowDisplay":"blocking","tagAliasRules":"blocking","ds-feature-panel-tag-aliases":"blocking","topBarProfilePillMode":"appearance","hideTopBarNotifications":"appearance","hideTopBarTheme":"appearance","topBarProfilePillPersonaPrefix":"appearance","topBarProfilePillCustomText":"appearance","hideTopBarLanguage":"appearance","ds-feature-panel-top-bar-1":"appearance","ds-feature-panel-top-bar-2":"appearance","ds-feature-panel-selection-memory":"personas-memory","scrollNavOnProfiles":"chat-ui","scrollNavOnChat":"chat-ui","showScrollToBottomButton":"chat-ui","showSwipeJumpButtons":"chat-ui","scrollNavOnChats":"chat-ui","restoreFirstSwipeOnLoad":"chat-ui","scrollTopLoadPreviousTiming":"chat-ui","scrollNavOnCreation":"chat-ui","scrollTopLoadPreviousMode":"chat-ui","showScrollToTopButton":"chat-ui","scrollNavOnOther":"chat-ui","showSwipeJumpToNumber":"chat-ui","scrollNavOnHome":"chat-ui","scrollTopLoadPreviousMessages":"chat-ui","ds-feature-panel-scroll-to-top":"chat-ui","rpFormatPreserveSemanticQuotes":"writing","rpFormatStyle":"writing","rpFormatRepairCard":"writing","rpFormatDetection":"writing","rpFormatPreserveBackticks":"writing","rpFormatPreserveInlineEmphasis":"writing","rpFormatConvertBoldActions":"writing","rpFormatRepairAuto":"writing","rpFormatRemoveActionParens":"writing","enableRpFormatRepair":"writing","rpFormatShowMessageButtons":"writing","ds-feature-panel-rp-format-repair":"writing","focusHideSidebar":"chat-ui","focusHideChatHeader":"chat-ui","focusHideQolPanel":"chat-ui","focusModeCard":"chat-ui","focusHideTopBar":"chat-ui","enableFocusMode":"chat-ui","ds-feature-panel-focus-mode":"chat-ui","ds-feature-panel-chat-continuation":"chat-ui","storyDayTrackerShowQuickPanel":"personas-memory","storyDayTrackerMode":"personas-memory","storyDayTrackerIncludeInContext":"personas-memory","storyDayTrackerCard":"personas-memory","enableStoryDayTracker":"personas-memory","ds-feature-panel-story-day-tracker":"personas-memory","localTagMatchRules":"blocking","localTagMatchFetchPublic":"blocking","localTagMatchEnabled":"blocking","ds-feature-panel-local-tag-matching":"blocking","hideSidebarSocialDiscord":"appearance","hideSidebarCreateVoice":"appearance","hideSidebarBlockedCreators":"appearance","hideSidebarFooterAffiliates":"appearance","hideSidebarCreateLorebook":"appearance","hideSidebarSubscribe":"appearance","hideSidebarMyLorebooks":"appearance","hideSidebarCreateMenu":"appearance","hideSidebarSocialReddit":"appearance","hideSidebarCreateChatbot":"appearance","hideSidebarPersonas":"appearance","hideSidebarHome":"appearance","hideSidebarLeaderboard":"appearance","hideSidebarMyCreationsMenu":"appearance","hideSidebarFooterPrivacy":"appearance","hideSidebarMyVoices":"appearance","hideSidebarRecommendations":"appearance","hideSidebarAppDownloadGeneric":"appearance","hideSidebarFavorites":"appearance","hideSidebarNewBadges":"appearance","hideSidebarFooterSupport":"appearance","showQolSidebarButton":"appearance","hideSidebarWebVersion":"appearance","hideSidebarLogo":"appearance","qolSidebarButtonPlacement":"appearance","hideSidebarFooterRefunds":"appearance","hideSidebarMyChatbots":"appearance","hideSidebarCreateGroup":"appearance","hideSidebarSocialX":"appearance","hideSidebarAppDownloadGooglePlay":"appearance","hideSidebarHelp":"appearance","hideSidebarFooterGuidelines":"appearance","hideSidebarAppDownloadAppStore":"appearance","hideSidebarChats":"appearance","restorePersonasSidebarPosition":"appearance","hideSidebarMyGroups":"appearance","hideSidebarSignOut":"appearance","hideSidebarFooterTerms":"appearance","hideSidebarFooterReporting":"appearance","ds-feature-panel-sidebar":"appearance","autoFillTargetCards":"blocking","autoFillListings":"blocking","autoFillMaxClicks":"blocking","ds-feature-panel-list-fill":"blocking","enableCreationAudit":"bot-tools","creationAuditQuickStatus":"bot-tools","ds-feature-panel-creation-audit":"bot-tools","alternateDialogueBackgroundColor":"appearance","alternateDialogueBorderColor":"appearance","styleAlternateDialogue":"appearance","alternateDialogueCard":"appearance","alternateDialogueScope":"appearance","alternateDialogueTextColor":"appearance","alternateDialogueCustomColors":"appearance","alternateDialogueStyle":"appearance","ds-feature-panel-alternate-dialogue":"appearance","paginationQuickJumpMenu":"blocking","paginationTopJumpBox":"blocking","ds-feature-panel-pagination-tools":"blocking","rpStateInjectMode":"personas-memory","rpStateTrackerMode":"personas-memory","rpStateTrackerCard":"personas-memory","rpStateShowQuickPanel":"personas-memory","rpStateMaxContextChars":"personas-memory","enableRpStateTracker":"personas-memory","ds-feature-panel-rp-state-tracker":"personas-memory","excludeTags":"blocking","autoTags":"blocking","includeTags":"blocking","showTagTemplateButton":"blocking","ds-feature-panel-tags-nsfw":"blocking","storyReadingLayout":"chat-ui","ds-feature-panel-story-reading-layout":"chat-ui","enableGenerationProfiles":"writing","generationProfileCount":"writing","ds-feature-panel-generation-profiles":"writing","animatedImagesChatMedia":"appearance","animatedImagesProfiles":"appearance","animatedImagesCard":"appearance","animatedImageMode":"appearance","animatedImagesChats":"appearance","animatedImagesListings":"appearance","reduceAnimatedBotImages":"appearance","ds-feature-panel-animation-control":"appearance","enableSmartFilterPresets":"blocking","ds-feature-panel-smart-filter-presets":"blocking","chatExportNumberMessages":"chat-ui","chatExportIncludeOocDirectives":"chat-ui","chatExportIncludeAvatars":"chat-ui","chatExportIncludeRulebookState":"chat-ui","chatExportIncludeBotInfo":"chat-ui","chatExportHtmlLayout":"chat-ui","showChatExportButton":"chat-ui","chatExportIncludeImageLinks":"chat-ui","chatExportDefaultFormat":"chat-ui","chatExportIncludeGenerationDetails":"chat-ui","chatExportIncludeRulebook":"chat-ui","ds-feature-panel-chat-export":"chat-ui","chatTextReplacementPreview":"chat-ui","chatTextReplacementPresets":"chat-ui","chatTextReplacementScope":"chat-ui","chatWordCensorCustom":"chat-ui","chatWordCensorList":"chat-ui","chatTextReplacementRules":"chat-ui","enableChatMutedWords":"chat-ui","chatMutedWords":"chat-ui","enableChatWordCensor":"chat-ui","chatWordCensorShowChatToggle":"chat-ui","chatWordCensorReveal":"chat-ui","chatTextReplacementMode":"chat-ui","chatWordCensorScope":"chat-ui","enableChatTextReplacements":"chat-ui","chatTextReplacementShowChatPresetControl":"chat-ui","chatWordCensorMask":"chat-ui","ds-feature-panel-text-replacements":"chat-ui","nativeRatingHelpersCard":"chat-ui","enableNativeRatingHelpers":"chat-ui","ds-feature-panel-native-rating-helpers":"chat-ui","keepChatHeaderVisibleWhileTyping":"chat-ui","hideChatTopBarRatingButton":"chat-ui","hideChatDropdownMemoryItem":"chat-ui","chatTopBarInlineCreator":"chat-ui","showChatTopBarTools":"chat-ui","hideChatDropdownVoiceUpsell":"chat-ui","chatTopBarCard":"chat-ui","hideChatTopBarModelButton":"chat-ui","hideChatTopBarContextDot":"chat-ui","ds-feature-panel-chat-topbar":"chat-ui","ds-feature-panel-bulk-chat-research":"chat-ui","ds-feature-panel-chat-lorebook-manager":"writing","showBlockButtonOnMyCreations":"bot-tools","autoLoadMyCreations":"bot-tools","enableMyCreationsFilters":"bot-tools","myCreationsAutoLoadPages":"bot-tools","rememberMyCreationsView":"bot-tools","ds-feature-panel-my-creations-filters":"bot-tools","profileExportCard":"bot-tools","enableProfileExport":"bot-tools","ds-feature-panel-profile-export":"bot-tools","enableCharacterQolProfiles":"advanced","characterQolProfilesCard":"advanced","ds-feature-panel-character-qol-profiles":"advanced","ds-feature-panel-archive-community-themes":"blocking","ds-feature-panel-character-token-optimizer":"bot-tools","chatSearchLoadUntilMatch":"chat-ui","chatSearchCaseSensitive":"chat-ui","chatSearchRegex":"chat-ui","chatSearchShowFindButton":"chat-ui","chatSearchShowPanel":"chat-ui","chatSearchWholeWord":"chat-ui","chatSearchCard":"chat-ui","showChatSearch":"chat-ui","chatSearchExactPhrase":"chat-ui","ds-feature-panel-chat-search":"chat-ui","enableCreatorWritingAssistant":"bot-tools","creatorWritingAssistantCard":"bot-tools","creatorWritingDictionary":"bot-tools","creatorWritingUseBrowserAi":"bot-tools","creatorWritingTargetLanguage":"bot-tools","ds-feature-panel-creator-writing-assistant":"bot-tools","soundscapeAddScene":"appearance","soundscapeMasterVolumeValue":"appearance","soundscapeOnProfiles":"appearance","soundscapeShowChatControl":"appearance","soundscapeOnChats":"appearance","soundscapesCard":"appearance","soundscapeAudioStatus":"appearance","soundscapeMasterVolume":"appearance","soundscapeAudioUpload":"appearance","enableSoundscapes":"appearance","soundscapeOnChat":"appearance","soundscapeOnHome":"appearance","soundscapeAudioList":"appearance","soundscapeSceneList":"appearance","soundscapeOnOther":"appearance","soundscapeNewSceneName":"appearance","ds-feature-panel-soundscapes":"appearance","ds-feature-panel-previously-chatted-indicator":"saved","randomChatIncludeOpened":"blocking","randomChatUseLastHomeFilters":"blocking","randomChatIncludeFavorites":"blocking","randomChatIncludeLater":"blocking","randomChatSettingsCard":"blocking","showRandomChatButton":"blocking","ds-feature-panel-chat-list":"blocking","enableBotComparison":"blocking","showCopyBotInfoButtons":"blocking","cardClickBehavior":"blocking","cardWorkflowCard":"blocking","trackRecentlySeenBots":"blocking","showQuickDislikeButtons":"blocking","showQuickMoreLikeButtons":"blocking","showRecentlySeenButton":"blocking","recentlySeenLimit":"blocking","cardDensityMode":"blocking","showQuickLessLikeButtons":"blocking","showQuickNotInterestedButtons":"blocking","ds-feature-panel-card-workflow":"blocking","expandModelSelectorDescriptions":"writing","customizeModelQuickMenu":"writing","modelFavoriteNames":"writing","hideModelUpgradeButtons":"writing","modelQuickFavoritesOnly":"writing","modelHiddenNames":"writing","ds-feature-panel-model-selector":"writing","ds-feature-panel-chat-smart-folders":"chat-list","ds-feature-panel-private-lorebook-bridge":"writing","contextKeeperAutoCapture":"personas-memory","contextKeeperMessageButtons":"personas-memory","contextKeeperCard":"personas-memory","contextKeeperAutoMaxDetails":"personas-memory","contextKeeperRelevantRecall":"personas-memory","contextKeeperAutoEveryMessages":"personas-memory","contextKeeperAutoSensitivity":"personas-memory","contextKeeperAutoRecall":"personas-memory","contextKeeperRecallEverySends":"personas-memory","contextKeeperRecallMaxChars":"personas-memory","enableContextKeeper":"personas-memory","contextKeeperRecapSize":"personas-memory","ds-feature-panel-context-keeper":"personas-memory","hideFeatureReleasePopups":"browser","hideNotifications":"browser","hideTabNotificationBadge":"browser","notificationCleanupCard":"browser","autoReadNotifications":"browser","ds-feature-panel-premium-notifications":"browser","chatSceneNotesEnableBotApply":"writing","chatSceneNotesSettingsCard":"writing","chatSceneNotesAutoMode":"writing","enableChatSceneNotes":"writing","chatSceneNotesAutoInclude":"writing","ds-feature-panel-chat-scene-notes":"writing","showChatTagLinks":"bot-tools","showChatTagAddButtons":"bot-tools","ds-feature-panel-chat-tags":"bot-tools","messageBookmarksCard":"chat-ui","enableChatHistoryNavigator":"chat-ui","enableMessageBookmarks":"chat-ui","messageBookmarkButtons":"chat-ui","ds-feature-panel-chat-bookmarks":"chat-ui","ds-feature-panel-archive-website-link":"blocking","rulebookDiagnosticsCard":"chat-ui","enableRulebookDiagnostics":"chat-ui","ds-feature-panel-rulebook-diagnostics":"chat-ui","ds-feature-panel-archive-blocking-presets":"blocking","ds-feature-panel-chat-lorebook-recall":"writing","savedSnippetsCard":"writing","enableSavedTextSnippets":"writing","ds-feature-panel-saved-snippets":"writing","recommendationHideLaterBots":"blocking","recommendationShowReasonBadges":"blocking","recommendationSessionHideButtons":"blocking","recommendationPreferFavoriteCreators":"blocking","enableRecommendationHelpers":"blocking","recommendationOnlyLorebook":"blocking","recommendationAvoidWords":"blocking","recommendationHideNotInterested":"blocking","recommendationOnlyUnopened":"blocking","recommendationHideFavoriteBots":"blocking","recommendationRandomButton":"blocking","recommendationPreferredTags":"blocking","recommendationAvoidTags":"blocking","recommendationHideOwnBots":"blocking","ds-feature-panel-recommendation-helpers":"blocking"});
  const tabFor = panel => {
    const id = String(panel.getAttribute("src") || "").split("/").pop().replace(/\.js$/, "");
    return document.querySelector(`[data-dsq-feature-panel="${CSS.escape(id)}"]`)?.closest(".tab-page")?.dataset.page || "";
  };
  function scriptsForTab(tab) {
    return [...document.querySelectorAll(`script[type="${lazyType}"][src]`)]
      .filter(script => tabFor(script) === tab);
  }
  function loadPanel(declaration) {
    if (declaration.dataset.dsqLazyLoaded === "1") return Promise.resolve(true);
    if (inflight.has(declaration)) return inflight.get(declaration);
    const src = declaration.getAttribute("src");
    const existingReaders = new Set(Object.keys(window.__DSQ_FEATURE_SETTINGS_LOADERS__ || {}));
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.dsqPanelRuntime = "1";
      let settled = false;
      const timer = setTimeout(() => done(new Error(`Timed out loading ${src}`)), 12000);
      function done(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          script.remove();
          // A panel import failure must not make all Settings inaccessible.
          // Leave the saved values untouched and expose a manual retry on its
          // original placeholder, without adding any background retry loop.
          const feature = String(src).split("/").pop().replace(/\.js$/, "");
          const host = document.querySelector(`[data-dsq-feature-panel="${CSS.escape(feature)}"]`);
          if (host && !host.querySelector("[data-dsq-panel-retry]")) {
            const retry = document.createElement("button");
            retry.type = "button";
            retry.dataset.dsqPanelRetry = "1";
            retry.textContent = `Retry loading ${feature.replace(/-/g, " ")} settings`;
            retry.addEventListener("click", () => {
              retry.disabled = true;
              loadPanel(declaration).catch(() => { retry.disabled = false; });
            });
            host.appendChild(retry);
          }
          reject(error);
          return;
        }
        declaration.dataset.dsqLazyLoaded = "1";
        if (typeof optionsDataLoaded !== "undefined" && optionsDataLoaded &&
            typeof loadedSettingsSnapshot !== "undefined") {
          const current = window.__DSQ_FEATURE_SETTINGS_LOADERS__ || {};
          for (const [key, loader] of Object.entries(current)) {
            if (!existingReaders.has(key)) loader(loadedSettingsSnapshot);
          }
        }
        resolve(true);
      }
      script.onload = () => done(null);
      script.onerror = () => done(new Error(`Could not load ${src}`));
      (document.head || document.documentElement).appendChild(script);
    }).finally(() => inflight.delete(declaration));
    inflight.set(declaration, promise);
    return promise;
  }
  async function hydrate(tabName) {
    if (!tabName) return false;
    const panels = scriptsForTab(tabName);
    for (const panel of panels) await loadPanel(panel);
    if (panels.length && typeof optionsDataLoaded !== "undefined" && optionsDataLoaded) {
      setupCollapsibleSettingsCards?.();
      applySettingsSectionDefault?.(loadedSettingsSnapshot);
      updateSettingDependencies?.();
      applyPinnedSettingsSectionOrder?.();
      applySettingsEnabledOnlyFilter?.();
      refreshSettingsSectionShortcuts?.();
      DS_FEATURE_INDEX_REFRESH?.();
    }
    return true;
  }
  window.dsqHydrateFeaturePanelsForTab = hydrate;
  window.dsqHydrateAllFeaturePanels = async () => {
    const tabs = [...new Set([...document.querySelectorAll(`script[type="${lazyType}"]`)].map(tabFor).filter(Boolean))];
    // Yield between groups, keeping the search/Features UI responsive and
    // avoiding one large DOM construction task.
    for (const tab of tabs) {
      await hydrate(tab);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return true;
  };
  window.dsqDeferredFeaturePanelTabForControl = id => deferredControlTabs[String(id || "")] || "";
})();

// The mobile section picker must work independently from options.js. That large
// controller runs substantial setup before setupTabs(); if any part of it stops
// early, the HTML still shows General but the Sections button would be inert.
// Attach only lightweight navigation here, before options.js is evaluated.
(function bootstrapMobileSettingsNavigation() {
  const init = () => {
    const toggle = document.getElementById("mobileSectionsToggle");
    const nav = document.getElementById("optionsTabsNav");
    if (!toggle || !nav || toggle.dataset.dsMobileSectionsReady === "1") return;
    toggle.dataset.dsMobileSectionsReady = "1";

    const close = () => {
      nav.classList.remove("is-mobile-open");
      toggle.setAttribute("aria-expanded", "false");
    };

    // Use capture so the legacy late setupTabs() handler cannot toggle the
    // picker a second time and close it immediately after this one opens it.
    toggle.addEventListener("click", event => {
      event.stopImmediatePropagation();
      const open = nav.classList.toggle("is-mobile-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }, { capture: true });

    // Normal navigation remains handled by options.js. If that controller
    // failed to finish initialization, keep the user out of a General-only UI
    // by switching the visible section without touching saved QoL settings.
    nav.addEventListener("click", event => {
      const button = event.target?.closest?.(".tab-button[data-tab]");
      if (!button || !nav.contains(button) || button.disabled || button.hidden) return;
      const tabName = button.dataset.tab;
      const target = [...document.querySelectorAll(".tab-page")]
        .find(page => page.dataset.page === tabName);
      if (target && !target.classList.contains("active")) {
        document.querySelectorAll(".tab-button").forEach(item => {
          item.classList.toggle("active", item === button);
        });
        document.querySelectorAll(".tab-page").forEach(page => {
          page.classList.toggle("active", page === target);
        });
        const footer = document.getElementById("settingsFooter");
        if (footer) footer.classList.toggle("hidden", tabName === "help" || tabName === "changelog");
        const label = document.getElementById("mobileSectionsCurrent");
        if (label) label.textContent = String(button.textContent || tabName).trim().replace(/\s+/g, " ");
        try { sessionStorage.setItem("spicychatQolOptionsTab", tabName); } catch {}
        try { localStorage.setItem("spicychatQolLastOptionsTabV1", tabName); } catch {}
        try { history.replaceState(history.state, "", `${location.pathname}${location.search}#${tabName}`); } catch {}
      }
      close();
    });

    document.addEventListener("click", event => {
      if (!nav.classList.contains("is-mobile-open")) return;
      if (toggle.contains(event.target) || nav.contains(event.target)) return;
      close();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !nav.classList.contains("is-mobile-open")) return;
      close();
      toggle.focus();
    });
    try { window.matchMedia("(min-width: 721px)").addEventListener?.("change", close); } catch {}
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();


// Active options uses the same named feature catalogue and real Settings
// controls as Full QoL. It does not expose internal storage keys or wipe data.
function setupActiveOptionsPanel() {
  const panel = $("dsActiveOptionsPanel");
  const host = $("dsActiveOptionsList");
  const count = $("dsActiveOptionsCount");
  const bulk = $("dsActiveOptionsDisableAll");
  const status = $("dsActiveOptionsStatus");
  if (!panel || !host) return;
  const registry = Array.isArray(window.SpicyChatQoLFeatureRegistry) ? window.SpicyChatQoLFeatureRegistry : [];
  let busy = false;
  let renderQueued = false;

  function featureControls(entry) {
    const keys = Array.isArray(entry.settings) ? entry.settings : (entry.setting ? [entry.setting] : []);
    return keys.map(key => $(key)).filter(control => control?.type === "checkbox" &&
      control.id in DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS[control.id] === "boolean" && control.id !== "enabled");
  }

  function activeEntries() {
    return registry.filter(entry => !entry.planned && !entry.builtIn &&
      featureRegistryState(entry).key === "on" && featureControls(entry).some(control => control.checked));
  }

  async function disableEntries(entries) {
    if (busy) return;
    if (!settingsAutosaveReady) { status.textContent = "Wait for Settings to finish loading before changing features."; return; }
    busy = true;
    bulk.disabled = true;
    const unique = new Map();
    for (const entry of entries) for (const control of featureControls(entry)) {
      if (control.checked) unique.set(control.id, control);
    }
    try {
      for (const control of unique.values()) {
        control.checked = false;
        control.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const saved = await flushSettingsAutosave({ force: true });
      status.textContent = saved
        ? `Turned off ${unique.size} feature switch${unique.size === 1 ? "" : "es"}. Saved data and other settings were kept.`
        : "Some changes couldn't be saved. Use Save now before closing Settings.";
      updateSettingDependencies?.();
      DS_FEATURE_INDEX_REFRESH?.();
      applySettingsEnabledOnlyFilter();
    } catch (error) {
      status.textContent = error?.message || "Couldn't turn off those features. Use Save now to retry.";
    } finally { busy = false; bulk.disabled = false; render(); }
  }

  function render() {
    if (busy) return;
    if (!settingsAutosaveReady) {
      count.textContent = "Open to review enabled features";
      bulk.disabled = true;
      return;
    }
    const entries = activeEntries();
    count.textContent = `${entries.length} active named feature${entries.length === 1 ? "" : "s"}`;
    if (!panel.open) return;
    bulk.disabled = entries.length === 0;
    const groups = new Map();
    for (const entry of entries) {
      const controls = featureControls(entry);
      const target = $(entry.target || entry.setting || controls[0]?.id) || controls[0];
      const info = settingsCardInfo(target?.closest?.("section.card"));
      const context = info ? `${info.tabLabel} · ${info.heading}` : (entry.category || "Settings");
      if (!groups.has(context)) groups.set(context, []);
      groups.get(context).push({ entry, controls, target });
    }
    const fragment = document.createDocumentFragment();
    for (const [context, items] of groups) {
      const section = document.createElement("section"); section.className = "ds-active-options-group";
      const heading = document.createElement("h4"); heading.textContent = context; section.appendChild(heading);
      for (const { entry, controls, target } of items) {
        const row = document.createElement("div"); row.className = "ds-active-options-row";
        const description = document.createElement("div"); description.className = "ds-active-options-description";
        const label = document.createElement("strong"); label.textContent = entry.name;
        const detail = document.createElement("small");
        detail.textContent = entry.description || "Enabled QoL feature";
        description.append(label, detail);
        const open = document.createElement("button"); open.type = "button"; open.textContent = "Open in Settings";
        open.addEventListener("click", () => {
          if (!revealSettingsTarget(entry.target || entry.setting || controls[0]?.id, { fromFeatures: true })) {
            target?.scrollIntoView?.({ block: "center" });
          }
        });
        const off = document.createElement("button"); off.type = "button"; off.textContent = "Turn off";
        off.addEventListener("click", () => disableEntries([entry]));
        row.append(description, open, off); section.appendChild(row);
      }
      fragment.appendChild(section);
    }
    if (!entries.length) {
      const none = document.createElement("p"); none.className = "hint";
      none.textContent = "No optional named features are enabled. Core and built-in Settings tools remain available.";
      fragment.appendChild(none);
    }
    host.replaceChildren(fragment);
  }

  panel.addEventListener("toggle", render);
  $("dsActiveOptionsRefresh")?.addEventListener("click", render);
  bulk.addEventListener("click", () => {
    const entries = activeEntries();
    const count = entries.length;
    if (!count) return;
    if (!confirm(`Turn off ${count} active named QoL features? This only changes feature switches. Saved lists, backups, passwords, and the main QoL switch stay untouched.`)) return;
    disableEntries(entries);
  });
  document.addEventListener("change", event => {
    if (!panel.open || event.target?.closest?.("#dsActiveOptionsPanel")) return;
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => { renderQueued = false; render(); }, 80);
  }, true);
  render();
}
