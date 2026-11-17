// v0.2.85 Stage 15: declarative, on-demand runtime assets.
// Previously every feature was parsed on every route. These heavy, independently
// registered modules are now imported only when the matching route+setting is
// active. No new observer, event listener, repeating task or background request.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const jobs = new Map();
  const failed = new Map();
  const has = key => DS.featureBuildProfile?.isInstalled?.(key) !== false;
  const any = (s, names) => names.some(k => s?.[k] === true);
  const CHAT = /^\/(?:[a-z]{2}\/)?chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}(?:\/|$)/i;
  const CHATS = /^\/(?:[a-z]{2}\/)?chats\/?$/i;
  const FAV = /^\/(?:[a-z]{2}\/)?favorite-bots\/?$/i;
  const MY_CREATIONS = /^\/(?:[a-z]{2}\/)?my-creations(?:\/|$)/i;
  const LOREBOOK_EDITOR = /^\/(?:[a-z]{2}\/)?lorebook\/edit(?:\/|$)/i;
  const BOT_EDITOR = /^\/(?:[a-z]{2}\/)?(?:chatbot\/(?:create|edit)|create-chatbot|edit-chatbot)(?:\/|$)/i;
  const MODULES = Object.freeze({
    "bulk-chat-research": "content/bulk-chat-research.js",
    "soundscapes": "content/soundscapes.js",
    "sidebar": "content/sidebar.js",
    "quick-panel": "content/quick-panel.js",
    "native-memory-probe": "content/native-memory-probe.js",
    "memory-manager": "content/memory-manager.js",
    "memory-packs": "content/memory-packs.js",
    "context-keeper": "content/context-keeper.js",
    "creation-audit": "content/creation-audit.js",
    "favorites-recovery": "content/favorites-recovery.js",
    "lorebook-backup": "content/lorebook-backup.js",
    "my-creations-backup": "content/my-creations-backup.js",
    "chat-export": "content/chat-export.js"
  });
  let lastWantedKey = "";
  // Module scripts run in the content script's isolated world (not a <script>
  // tag in SpicyChat's MAIN world). Every resource is declared in the manifest.
  function ensure(name) {
    if (!has(name)) return Promise.resolve(false);
    if (jobs.has(name)) return jobs.get(name);
    if (failed.has(name)) return Promise.resolve(false);
    const path = MODULES[name];
    if (!path || !chrome?.runtime?.getURL) return Promise.resolve(false);
    const started = performance.now();
    const promise = import(chrome.runtime.getURL(path)).then(() => {
      DS.diagEvent?.("feature-loader", "module-loaded", { feature: name,
        durationMs: Math.round((performance.now()-started)*10)/10 });
      return true;
    }).catch(error => {
      const info=String(error?.message||error).slice(0,180);
      failed.set(name,info);
      console.warn(`[DragonScript QoL] Optional module unavailable: ${name}: ${info}`);
      DS.diagEvent?.("feature-loader", "module-failed", { feature: name });
      return false;
    });
    jobs.set(name,promise);
    return promise;
  }
  function wanted(settings, path = location.pathname) {
    const chat = CHAT.test(path);
    const myCreations = MY_CREATIONS.test(path);
    const lorebookEditor = LOREBOOK_EDITOR.test(path);
    const botEditor = BOT_EDITOR.test(path) || !!DS.getPageState?.().isBotEditor;
    const list = [];
    const add = (name,condition) => { if(condition && has(name))list.push(name); };
    add("bulk-chat-research", CHATS.test(path) &&
      new URLSearchParams(location.search).get("ds-research-export") === "1");
    add("quick-panel",settings.showQuickPanel === true);
    add("sidebar",!!settings.showLaterFavoritesTab || !!settings.showQolSidebarButton ||
      !!settings.restorePersonasSidebarPosition || Object.keys(settings).some(k => k.startsWith("hideSidebar") && !!settings[k]));
    add("soundscapes",!!settings.enableSoundscapes);
    add("native-memory-probe", chat && settings.nativeMemoryQualityProbe === true);
    const memory = chat && any(settings,["enableBulkMemoryManager", "showCopyMemoryAction", "memoryAutoLoadAll"]);
    add("memory-manager",memory);
    add("memory-packs",memory);
    add("context-keeper",chat && settings.enableContextKeeper === true);
    add("creation-audit",(myCreations||botEditor) && settings.enableCreationAudit === true);
    add("favorites-recovery",FAV.test(path) && settings.enableFavoritesRecovery === true);
    // Include manual export helper tabs even when the regular editor tools are
    // disabled; they are a separate explicit user-initiated operation.
    const params = new URLSearchParams(location.search);
    add("lorebook-backup",(lorebookEditor && any(settings,["lorebookBackupToolsEnabled","lorebookBackupsEnabled"])) ||
      params.has("dsQolLorebookExport") || params.has("dsQolLorebookBackupWorker"));
    add("my-creations-backup",myCreations && any(settings,["enableMyCreationsBulkBackup","enableAccountMigrationAssistant"]));
    add("chat-export",chat && any(settings,["showChatExportButton","showQuickPanel","enableCommandPalette","showChatTopBarTools"]));
    return list;
  }
  DS.prepareOptionalModules = async function prepareOptionalModules(settings = DS.state?.settings||{}) {
    if(DS.isQolPausedForTab?.() || settings.enabled === false) return;
    const names = wanted(settings);
    const key=location.href+"|"+names.join(",");
    if(key === lastWantedKey) return;
    lastWantedKey = key;
    for (const name of names) {
      if(DS.isQolPausedForTab?.())return;
      // Each isolated script establishes its own DS API exactly once.
      await ensure(name);
    }
  };
  DS.optionalModuleLoader = Object.freeze({
    names: Object.freeze(Object.keys(MODULES)),
    getStatus: () => ({ loaded: [...jobs.keys()].filter(k=>!failed.has(k)),
      failed: [...failed.keys()] }),
    ensure,
    wanted
  });
})();
