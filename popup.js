const RELEASE_NOTICE_KEY = "dsReleaseNotice";
const LAST_SEEN_VERSION_KEY = "dsLastSeenReleaseVersion";
const FAVORITE_CREATORS_KEY = "favoriteCreators";
const FOLLOWED_CREATORS_KEY = "followedCreators";
const FAVORITE_BOTS_KEY = "favoriteBots";
const LATER_BOTS_KEY = "laterBots";
const BOT_ORGANIZER_KEY = "botOrganization";
const NOT_INTERESTED_KEY = "notInterestedBots";
const PERSONAS_KEY = "personas";
const LEGACY_PERSONAS_KEY = "savedPersonas";
const OOC_TEMPLATES_KEY = "oocTemplates";
const GENERATION_PROFILES_KEY = "generationProfiles";

const DEFAULT_SETTINGS = {
  enabled: true,
  globalNsfwMode: "ignore",
  hidePremium: false,
  hideFloatingPremiumPopups: false,
  hideNotifications: false,
  hideOpenedChats: false,
  showQuickPanel: false,
  quickPanelEnabledByDefaultInTab: false,
  popupShowOpenedCount: false,
  popupShowBlockedCount: false,
  popupShowStorageDetails: false
};

function storageGet(keys) {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(obj) {
  return new Promise(resolve => {
    chrome.storage.local.set(obj, resolve);
  });
}


function storageRemove(keys) {
  return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
}

function storageBytesInUse() {
  return new Promise(resolve => {
    try {
      if (typeof chrome.storage.local.getBytesInUse !== "function") {
        resolve(null);
        return;
      }
      chrome.storage.local.getBytesInUse(null, bytes => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(Number(bytes) || 0);
      });
    } catch {
      resolve(null);
    }
  });
}

function uniqueCount(values) {
  return new Set((Array.isArray(values) ? values : []).map(value => String(value || "").trim()).filter(Boolean)).size;
}

function botStoreCount(store) {
  return uniqueCount([...(store?.ids || []), ...(store?.names || [])]);
}

async function markCurrentReleaseSeen() {
  const version = chrome.runtime.getManifest?.().version || "";
  if (version) await storageSet({ [LAST_SEEN_VERSION_KEY]: version });
  await storageRemove(RELEASE_NOTICE_KEY);
}

function getActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true
      },
      tabs => resolve(tabs[0] || null)
    );
  });
}

function sendToActiveTab(message) {
  return new Promise(async resolve => {
    const tab = await getActiveTab();

    if (!tab?.id) {
      resolve(null);
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      message,
      response => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(response || null);
      }
    );
  });
}


async function openOptionsTarget(target, query = "") {
  const tab = await getActiveTab();
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { type: "DS_OPEN_OPTIONS_TARGET", target, query, tabId: tab?.id || null },
      response => {
        if (chrome.runtime.lastError || !response?.ok) {
          chrome.runtime.openOptionsPage(() => resolve(false));
          return;
        }
        resolve(true);
      }
    );
  });
}

function contextButton(label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function renderContextActions(pageInfo) {
  const host = document.getElementById("contextActions");
  const title = document.getElementById("contextActionsTitle");
  const buttons = document.getElementById("contextActionButtons");
  if (!host || !title || !buttons || !pageInfo?.ok) {
    if (host) host.hidden = true;
    return;
  }

  const actions = [];
  const add = (label, target, query = "") => actions.push(contextButton(label, async () => {
    await openOptionsTarget(target, query);
    window.close();
  }));

  if (pageInfo.isSingleChatPage) {
    title.textContent = "Current chat";
    actions.push(contextButton("Command palette", async () => {
      await sendToActiveTab({ type: "DS_OPEN_COMMAND_PALETTE" });
      window.close();
    }));
    add("Chat tools", "chat-ui");
    add("Control Center", "control");
  } else if (pageInfo.isChatbotEditor) {
    title.textContent = "Chatbot editor";
    add("Creator tools", "bot-tools");
    add("Backup manager", "bot-tools", "backup manager");
    add("Creation Audit", "bot-tools", "creation audit");
  } else if (pageInfo.isLorebookEditor || pageInfo.isLorebookEntriesPage) {
    title.textContent = "Lorebook";
    add("Creator tools", "bot-tools");
    add("Wiki importer", "bot-tools", "wiki web lorebook import");
    add("Control Center", "control");
  } else if (pageInfo.isChatListPage) {
    title.textContent = "Chats";
    add("Chat List tools", "chat-list");
    add("Control Center", "control");
  } else {
    title.textContent = "This SpicyChat page";
    actions.push(contextButton("Command palette", async () => {
      await sendToActiveTab({ type: "DS_OPEN_COMMAND_PALETTE" });
      window.close();
    }));
    add("Discovery & Filters", "blocking");
    add("Control Center", "control");
  }

  buttons.replaceChildren(...actions);
  host.hidden = !actions.length;
}

function setVersionLabel() {
  const versionEl =
    document.getElementById("version");

  if (!versionEl) return;

  const version =
    chrome.runtime.getManifest?.().version || "";

  versionEl.textContent =
    version ? `v${version}` : "";
}

async function load() {
  setVersionLabel();

  const result =
    await storageGet([
      "settings",
      "openedChats",
      "blockedBots",
      NOT_INTERESTED_KEY,
      FAVORITE_CREATORS_KEY,
      FOLLOWED_CREATORS_KEY,
      FAVORITE_BOTS_KEY,
      LATER_BOTS_KEY,
      BOT_ORGANIZER_KEY,
      PERSONAS_KEY,
      LEGACY_PERSONAS_KEY,
      OOC_TEMPLATES_KEY,
      GENERATION_PROFILES_KEY,
      RELEASE_NOTICE_KEY
    ]);

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(result.settings || {})
  };

  const opened =
    Array.isArray(result.openedChats)
      ? result.openedChats
      : [];

  const blocked =
    result.blockedBots || {
      ids: [],
      names: []
    };

  const blockedCount = botStoreCount(blocked);

  document.getElementById("enabled").checked =
    !!settings.enabled;

  const summaryParts = [];

  if (settings.popupShowOpenedCount) {
    summaryParts.push(`${opened.length} opened chats stored`);
  }

  if (settings.popupShowBlockedCount) {
    summaryParts.push(`${blockedCount} blocked bots`);
  }

  summaryParts.push(`NSFW toggle: ${settings.globalNsfwMode}`);
  document.getElementById("summary").textContent = `${summaryParts.join(". ")}.`;


  const notice = result[RELEASE_NOTICE_KEY];
  const noticeHost = document.getElementById("releaseNotice");
  if (noticeHost && notice?.version) {
    noticeHost.hidden = false;
    const isInstall = notice.reason === "install";
    document.getElementById("releaseNoticeTitle").textContent = isInstall
      ? `SpicyChat QoL v${notice.version} installed`
      : `Updated to v${notice.version}`;
    document.getElementById("releaseNoticeText").textContent = isInstall
      ? "Optional features start off until you enable them. Open Settings when you are ready to pick what you want."
      : `There are new or changed features since v${notice.previousVersion || "your last build"}. New settings stay marked until you dismiss this notice.`;
  } else if (noticeHost) {
    noticeHost.hidden = true;
  }

  const storageDetails = document.getElementById("storageDetails");
  if (storageDetails) {
    if (settings.popupShowStorageDetails) {
      const bytes = await storageBytesInUse();
      const personas = Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY] : result[LEGACY_PERSONAS_KEY];
      const rows = [
        ["Later", botStoreCount(result[LATER_BOTS_KEY])],
        ["Favorite bots", botStoreCount(result[FAVORITE_BOTS_KEY])],
        ["Bot organization", Object.keys(result[BOT_ORGANIZER_KEY]?.meta || {}).length],
        ["Not interested", botStoreCount(result[NOT_INTERESTED_KEY])],
        ["Favorite creators", uniqueCount(result[FAVORITE_CREATORS_KEY]?.handles || [])],
        ["Followed creators", uniqueCount(result[FOLLOWED_CREATORS_KEY]?.handles || [])],
        ["Personas", Array.isArray(personas) ? personas.length : 0],
        ["OOC presets", Array.isArray(result[OOC_TEMPLATES_KEY]) ? result[OOC_TEMPLATES_KEY].length : 0],
        ["Gen profiles", result[GENERATION_PROFILES_KEY] && typeof result[GENERATION_PROFILES_KEY] === "object" ? Object.keys(result[GENERATION_PROFILES_KEY]).length : 0],
        ["Storage", Number.isFinite(bytes) ? `${(bytes / 1024).toFixed(bytes >= 10240 ? 0 : 1)} KB` : "n/a"]
      ];
      storageDetails.replaceChildren(...rows.map(([name, count]) => {
        const span = document.createElement("span");
        span.textContent = `${name}: ${count}`;
        return span;
      }));
      storageDetails.hidden = false;
    } else {
      storageDetails.hidden = true;
      storageDetails.replaceChildren();
    }
  }

  const tabQolState = await sendToActiveTab({
    type: "DS_GET_QOL_TAB_STATE"
  });
  const tabQolCheckbox = document.getElementById("tabQolEnabled");
  const tabQolHint = document.getElementById("tabQolHint");
  const tabQolRow = document.getElementById("tabQolRow");
  if (tabQolState?.ok) {
    tabQolCheckbox.disabled = !tabQolState.globalEnabled;
    tabQolCheckbox.checked = !!tabQolState.enabled;
    tabQolRow?.classList.toggle("paused", !!tabQolState.paused);
    tabQolHint.textContent = !tabQolState.globalEnabled
      ? "QoL is disabled globally."
      : (tabQolState.paused
          ? "Paused only in this SpicyChat tab. Reloads/navigation in this tab stay paused until you turn it back on or close the tab."
          : "Only changes this SpicyChat tab. Other tabs keep their own state.");
  } else {
    tabQolCheckbox.disabled = true;
    tabQolCheckbox.checked = false;
    tabQolRow?.classList.remove("paused");
    tabQolHint.textContent = "Open a SpicyChat tab to use the per-tab QoL switch.";
  }

  const panelState = await sendToActiveTab({
    type: "DS_GET_QUICK_PANEL_TAB_STATE"
  });

  const panelCheckbox = document.getElementById("miniPanelThisTab");
  const panelHint = document.getElementById("miniPanelHint");

  if (panelState?.ok) {
    const tabQolAvailable = tabQolState?.ok && tabQolState.enabled;
    panelCheckbox.disabled = !panelState.globallyEnabled || !tabQolAvailable;
    panelCheckbox.checked = !!panelState.enabled && !!tabQolAvailable;
    panelHint.textContent = !tabQolAvailable
      ? "Turn QoL back on in this tab to use the mini panel."
      : (panelState.globallyEnabled
          ? (panelState.defaultEnabled
              ? "Enabled by default; this only changes the current SpicyChat tab."
              : "Disabled by default; this only changes the current SpicyChat tab.")
          : "Enable the mini panel in Settings first.");
  } else {
    panelCheckbox.disabled = true;
    panelCheckbox.checked = false;
    panelHint.textContent = "Open a SpicyChat tab to control its mini panel.";
  }

  const pageInfo =
    await sendToActiveTab({
      type: "DS_GET_PAGE_INFO"
    });

  const blockButton =
    document.getElementById("blockCurrentBot");

  if (pageInfo?.isSingleChatPage) {
    blockButton.style.display = "block";
    blockButton.textContent = pageInfo.botName
      ? `Block ${pageInfo.botName}`
      : "Block this bot";
  } else {
    blockButton.style.display = "none";
  }

  renderContextActions(pageInfo);
}

async function saveEnabled() {
  const result =
    await storageGet(["settings"]);

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(result.settings || {})
  };

  settings.enabled =
    document.getElementById("enabled").checked;

  await storageSet({ settings });
  await load();
}

async function saveQolForTab() {
  const checkbox = document.getElementById("tabQolEnabled");
  const status = document.getElementById("status");
  const response = await sendToActiveTab({
    type: "DS_SET_QOL_TAB_STATE",
    enabled: checkbox.checked
  });

  if (!response?.ok) {
    checkbox.checked = !checkbox.checked;
    status.textContent = "Could not change QoL for this tab.";
  } else {
    status.textContent = checkbox.checked ? "QoL enabled in this tab." : "QoL paused in this tab.";
  }

  await load();
}

async function saveMiniPanelForTab() {
  const checkbox = document.getElementById("miniPanelThisTab");
  const response = await sendToActiveTab({
    type: "DS_SET_QUICK_PANEL_TAB_STATE",
    enabled: checkbox.checked
  });

  if (!response?.ok) {
    checkbox.checked = !checkbox.checked;
  }

  await load();
}

async function blockCurrentBot() {
  const status =
    document.getElementById("status");

  status.textContent =
    "Blocking...";

  const response =
    await sendToActiveTab({
      type: "DS_BLOCK_CURRENT_BOT"
    });

  if (response?.ok) {
    status.textContent =
      response.name
        ? `Blocked ${response.name}.`
        : "Blocked this bot.";

    await load();
    return;
  }

  status.textContent =
    "Could not block this bot.";
}

document
  .getElementById("enabled")
  .addEventListener("change", saveEnabled);

document
  .getElementById("tabQolEnabled")
  .addEventListener("change", saveQolForTab);

document
  .getElementById("miniPanelThisTab")
  .addEventListener("change", saveMiniPanelForTab);

document
  .getElementById("options")
  .addEventListener("click", async () => {
    const tab = await getActiveTab();
    chrome.runtime.sendMessage(
      { type: "DS_OPEN_OPTIONS_FROM_POPUP", tabId: tab?.id || null },
      response => {
        if (chrome.runtime.lastError || !response?.ok) {
          chrome.runtime.openOptionsPage();
        }
      }
    );
  });

document
  .getElementById("blockCurrentBot")
  .addEventListener("click", blockCurrentBot);

document.getElementById("viewChanges")?.addEventListener("click", async () => {
  await storageRemove(RELEASE_NOTICE_KEY);
  chrome.runtime.sendMessage({ type: "DS_OPEN_OPTIONS_CHANGELOG" }, () => window.close());
});

document.getElementById("dismissReleaseNotice")?.addEventListener("click", async () => {
  await markCurrentReleaseSeen();
  await load();
});


load();
