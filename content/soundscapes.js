(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const SOUNDSCAPES_KEY = "soundscapes";
  const AUDIO_KEY = "soundscapeAudioLibrary";
  const MAX_LAYERS = 5;
  const CHAT_CONTROL_CLASS = "ds-chat-soundscape-wrapper";
  const CHAT_BUTTON_CLASS = "ds-chat-soundscape-button";
  const CHAT_POPOVER_CLASS = "ds-chat-soundscape-popover";

  let sceneStore = { version: 1, activeId: "", scenes: [] };
  let audioStore = { version: 1, items: [] };
  let loaded = false;
  let playing = false;
  let activeSceneId = "";
  let playGeneration = 0;
  const players = new Map();

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  function normalizeLayer(layer, index = 0) {
    const raw = layer && typeof layer === "object" ? layer : {};
    return {
      id: clean(raw.id) || `layer-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      name: clean(raw.name) || `Layer ${index + 1}`,
      sourceType: raw.sourceType === "file" ? "file" : "url",
      source: clean(raw.source),
      volume: clamp(raw.volume, 0, 100, 70),
      enabled: raw.enabled !== false,
      loop: raw.loop !== false,
      intervalSeconds: clamp(raw.intervalSeconds, 0, 3600, 0)
    };
  }

  function normalizeScene(scene, index = 0) {
    const raw = scene && typeof scene === "object" ? scene : {};
    return {
      id: clean(raw.id) || `scene-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      name: clean(raw.name) || `Soundscape ${index + 1}`,
      layers: (Array.isArray(raw.layers) ? raw.layers : []).slice(0, MAX_LAYERS).map(normalizeLayer)
    };
  }

  function normalizeSceneStore(value) {
    const raw = value && typeof value === "object" ? value : {};
    const scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, 50).map(normalizeScene);
    const activeId = scenes.some(scene => scene.id === raw.activeId) ? raw.activeId : (scenes[0]?.id || "");
    return { version: 1, activeId, scenes };
  }

  function normalizeAudioStore(value) {
    const raw = value && typeof value === "object" ? value : {};
    const items = (Array.isArray(raw.items) ? raw.items : []).filter(item => item && typeof item === "object").map(item => ({
      id: clean(item.id),
      name: clean(item.name) || "Saved audio",
      mime: clean(item.mime),
      size: Number(item.size) || 0,
      dataUrl: String(item.dataUrl || ""),
      savedAt: Number(item.savedAt) || 0
    })).filter(item => item.id && item.dataUrl);
    return { version: 1, items };
  }

  function scopeAllowed(settings = DS.state?.settings || {}) {
    if (DS.isSingleChatPage?.()) return settings.soundscapeOnChat !== false;
    if (DS.isHomePage?.()) return !!settings.soundscapeOnHome;
    if (DS.isChatListPage?.()) return !!settings.soundscapeOnChats;
    if (DS.isBotProfilePage?.() || DS.isLorebookPage?.()) return !!settings.soundscapeOnProfiles;
    return !!settings.soundscapeOnOther;
  }

  function masterVolume() {
    return clamp(DS.state?.settings?.soundscapeMasterVolume, 0, 100, 65) / 100;
  }

  function activeScene() {
    const id = activeSceneId || sceneStore.activeId;
    return sceneStore.scenes.find(scene => scene.id === id) || sceneStore.scenes[0] || null;
  }

  function sourceFor(layer) {
    if (layer.sourceType === "file") {
      return audioStore.items.find(item => item.id === layer.source)?.dataUrl || "";
    }
    return layer.source || "";
  }

  function setPlayerVolume(player, layerVolume, factor = 1) {
    if (!player?.audio) return;
    player.audio.volume = Math.min(1, Math.max(0, masterVolume() * clamp(layerVolume, 0, 100, 70) / 100 * factor));
  }

  function clearPlayer(player) {
    if (!player) return;
    if (player.timer) clearInterval(player.timer);
    try { player.audio?.pause?.(); } catch {}
    try { if (player.audio) player.audio.src = ""; } catch {}
  }

  async function fadeOutAll(duration = 260) {
    const existing = [...players.values()];
    if (!existing.length) return;
    const steps = 6;
    for (let step = steps - 1; step >= 0; step -= 1) {
      const factor = step / steps;
      for (const player of existing) setPlayerVolume(player, player.layerVolume, factor);
      await new Promise(resolve => setTimeout(resolve, Math.max(16, Math.round(duration / steps))));
    }
    for (const player of existing) clearPlayer(player);
    players.clear();
  }

  function startLayer(layer, generation) {
    const src = sourceFor(layer);
    if (!src) {
      const kind = layer.sourceType === "file" ? "saved local audio is missing" : "audio URL is empty";
      DS.setQuickStatus?.(`Soundscape skipped ${layer.name}: ${kind}.`);
      return null;
    }
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.loop = !!layer.loop && !(Number(layer.intervalSeconds) > 0);
    const player = { audio, timer: 0, layerVolume: layer.volume, generation };
    audio.addEventListener("error", () => {
      const detail = layer.sourceType === "file" ? "saved local audio could not be read" : "audio URL could not be loaded";
      DS.setQuickStatus?.(`Soundscape could not load ${layer.name}: ${detail}.`);
    }, { once: true });
    setPlayerVolume(player, layer.volume, 0);

    const playOnce = async () => {
      if (!playing || generation !== playGeneration) return;
      try {
        audio.currentTime = 0;
        await audio.play();
      } catch (error) {
        DS.setQuickStatus?.(`Soundscape could not play ${layer.name}: ${error?.message || "browser blocked audio"}.`);
      }
    };

    if (Number(layer.intervalSeconds) > 0) {
      audio.loop = false;
      playOnce();
      player.timer = setInterval(playOnce, Math.max(5, Number(layer.intervalSeconds)) * 1000);
    } else {
      playOnce();
    }
    return player;
  }

  async function startScene(sceneId = "") {
    await ensureLoaded();
    const scene = sceneStore.scenes.find(item => item.id === sceneId) || activeScene();
    if (!scene) {
      playing = false;
      DS.updateQuickPanel?.();
      DS.setQuickStatus?.("Create a Soundscape in Settings first.");
      return false;
    }
    if (!DS.state?.settings?.enableSoundscapes || !scopeAllowed()) {
      playing = false;
      await fadeOutAll(100);
      DS.updateQuickPanel?.();
      return false;
    }

    playGeneration += 1;
    const generation = playGeneration;
    if (players.size) await fadeOutAll(220);
    activeSceneId = scene.id;
    playing = true;

    const nextPlayers = [];
    for (const layer of scene.layers.slice(0, MAX_LAYERS)) {
      if (layer.enabled === false) continue;
      const player = startLayer(layer, generation);
      if (player) {
        players.set(layer.id, player);
        nextPlayers.push(player);
      }
    }

    // Fade in all layers. This also makes scene switches less abrupt.
    const steps = 7;
    for (let step = 1; step <= steps && playing && generation === playGeneration; step += 1) {
      const factor = step / steps;
      for (const player of nextPlayers) setPlayerVolume(player, player.layerVolume, factor);
      await new Promise(resolve => setTimeout(resolve, 42));
    }
    DS.updateQuickPanel?.();
    ensureChatControl();
    return true;
  }

  async function stopAll({ quiet = false } = {}) {
    playGeneration += 1;
    playing = false;
    await fadeOutAll(180);
    if (!quiet) DS.setQuickStatus?.("Soundscape paused.");
    DS.updateQuickPanel?.();
    ensureChatControl();
  }

  async function ensureLoaded(force = false) {
    if (loaded && !force) return;
    const result = await DS.storageGet?.([SOUNDSCAPES_KEY, AUDIO_KEY]);
    sceneStore = normalizeSceneStore(result?.[SOUNDSCAPES_KEY]);
    audioStore = normalizeAudioStore(result?.[AUDIO_KEY]);
    activeSceneId = sceneStore.activeId || activeSceneId;
    loaded = true;
  }

  function findComposer() {
    return document.querySelector("textarea[placeholder='Message...']") || [...document.querySelectorAll("textarea")].find(el => !el.closest?.("[id^='message-']") && /message/i.test(String(el.placeholder || ""))) || null;
  }

  function closeChatPopover() {
    document.querySelectorAll(`.${CHAT_POPOVER_CLASS}`).forEach(node => node.remove());
  }

  function removeChatControl() {
    document.querySelectorAll(`.${CHAT_CONTROL_CLASS}`).forEach(node => node.remove());
    closeChatPopover();
  }

  function makeChatPopover(button) {
    const existing = document.querySelector(`.${CHAT_POPOVER_CLASS}`);
    if (existing) {
      closeChatPopover();
      return;
    }
    const pop = document.createElement("div");
    pop.className = CHAT_POPOVER_CLASS;
    Object.assign(pop.style, {
      position: "fixed", zIndex: "2147483000", width: "min(340px, calc(100vw - 24px))",
      padding: "10px", borderRadius: "10px", background: "#18191d", color: "#fff",
      border: "1px solid rgba(255,255,255,.16)", boxShadow: "0 10px 30px rgba(0,0,0,.45)", fontSize: "13px"
    });
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px";
    const title = document.createElement("strong");
    title.textContent = "Soundscape";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Close Soundscape";
    close.setAttribute("aria-label", "Close Soundscape");
    close.style.cssText = "width:28px;height:28px;padding:0;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;cursor:pointer;font-size:18px;line-height:1";
    close.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); closeChatPopover(); });
    head.append(title, close);
    const note = document.createElement("div");
    note.style.cssText = "margin:5px 0 9px;opacity:.72;line-height:1.35";
    note.textContent = sceneStore.scenes.length ? "Choose a saved scene, then play or pause it here." : "No scenes yet. Create a Soundscape in QoL Settings first.";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:7px;align-items:center;flex-wrap:wrap";
    const select = document.createElement("select");
    select.style.cssText = "flex:1;min-width:160px;padding:6px;background:#101114;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:7px";
    for (const scene of sceneStore.scenes) {
      const option = document.createElement("option"); option.value = scene.id; option.textContent = scene.name; select.appendChild(option);
    }
    select.value = activeSceneId || sceneStore.activeId || sceneStore.scenes[0]?.id || "";
    select.disabled = !sceneStore.scenes.length;
    select.addEventListener("change", async () => {
      await DS.setActiveSoundscape?.(select.value, { playIfActive: true });
      closeChatPopover();
    });
    const play = document.createElement("button");
    play.type = "button"; play.textContent = playing ? "Pause" : "Play"; play.disabled = !sceneStore.scenes.length;
    play.style.cssText = "padding:6px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:inherit;cursor:pointer";
    play.addEventListener("click", async () => { await DS.toggleSoundscapePlayback?.(); closeChatPopover(); });
    row.append(select, play); pop.append(head, note, row); document.body.appendChild(pop);
    const rect = button.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    pop.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.left))}px`;
    let top = rect.top - pop.offsetHeight - 8;
    if (top < 12) top = Math.min(window.innerHeight - pop.offsetHeight - 12, rect.bottom + 8);
    pop.style.top = `${Math.max(12, top)}px`;
  }

  function ensureChatControl(settings = DS.state?.settings || {}) {
    if (!settings.enabled || !settings.enableSoundscapes || settings.soundscapeShowChatControl === false || !DS.isSingleChatPage?.() || !scopeAllowed(settings)) {
      removeChatControl(); return;
    }
    const existing = document.querySelector(`.${CHAT_BUTTON_CLASS}`);
    if (existing?.isConnected) { existing.textContent = playing ? "♫❚❚" : "♫"; existing.title = playing ? "Pause Soundscape" : "Soundscape"; return; }
    const textarea = findComposer(); if (!textarea) return;
    const inputWrap = textarea.closest("div.w-full.flex") || textarea.parentElement?.parentElement?.parentElement;
    const row = inputWrap?.parentElement; if (!row) return;
    const wrapper = document.createElement("div"); wrapper.className = `inline-flex max-w-full ${CHAT_CONTROL_CLASS}`;
    const button = document.createElement("button"); button.type = "button";
    button.className = `inline-flex items-center justify-center transition-all duration-200 rounded-full bg-transparent text-black dark:text-white w-9 h-9 cursor-pointer ${CHAT_BUTTON_CLASS}`;
    button.setAttribute("aria-label", "Soundscape"); button.title = playing ? "Pause Soundscape" : "Soundscape"; button.textContent = playing ? "♫❚❚" : "♫";
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); makeChatPopover(button); });
    wrapper.appendChild(button); row.insertBefore(wrapper, inputWrap);

    if (!DS.state.soundscapeDismissListenerInstalled) {
      DS.state.soundscapeDismissListenerInstalled = true;
      document.addEventListener("pointerdown", event => {
        const popover = document.querySelector(`.${CHAT_POPOVER_CLASS}`);
        if (!popover) return;
        if (popover.contains(event.target) || event.target?.closest?.(`.${CHAT_BUTTON_CLASS}`)) return;
        closeChatPopover();
      }, true);
      document.addEventListener("keydown", event => {
        if (event.key === "Escape" && document.querySelector(`.${CHAT_POPOVER_CLASS}`)) closeChatPopover();
      }, true);
    }
  }

  DS.getSoundscapePanelState = function getSoundscapePanelState() {
    return {
      loaded,
      enabled: !!DS.state?.settings?.enableSoundscapes,
      allowedHere: scopeAllowed(),
      playing,
      activeId: activeSceneId || sceneStore.activeId,
      scenes: sceneStore.scenes.map(scene => ({ id: scene.id, name: scene.name, layerCount: scene.layers.length }))
    };
  };

  DS.setActiveSoundscape = async function setActiveSoundscape(id, { playIfActive = true } = {}) {
    await ensureLoaded();
    const next = sceneStore.scenes.find(scene => scene.id === id);
    if (!next) return false;
    sceneStore.activeId = next.id;
    activeSceneId = next.id;
    await DS.storageSet?.({ [SOUNDSCAPES_KEY]: sceneStore });
    if (playing && playIfActive) await startScene(next.id);
    DS.updateQuickPanel?.();
    return true;
  };

  DS.toggleSoundscapePlayback = async function toggleSoundscapePlayback() {
    await ensureLoaded();
    if (playing) return stopAll();
    return startScene(activeSceneId || sceneStore.activeId);
  };

  DS.applySoundscapes = async function applySoundscapes() {
    await ensureLoaded();
    const settings = DS.state?.settings || {};
    ensureChatControl(settings);
    if (!settings.enabled || !settings.enableSoundscapes || !scopeAllowed(settings)) {
      if (playing || players.size) await stopAll({ quiet: true });
      return;
    }
    // Keep volume live when Settings changes without restarting the scene.
    for (const player of players.values()) setPlayerVolume(player, player.layerVolume, 1);
  };

  DS.removeSoundscapes = async function removeSoundscapes() {
    removeChatControl();
    if (playing || players.size) await stopAll({ quiet: true });
  };

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[SOUNDSCAPES_KEY] || changes[AUDIO_KEY]) {
      sceneStore = normalizeSceneStore(changes[SOUNDSCAPES_KEY]?.newValue ?? sceneStore);
      audioStore = normalizeAudioStore(changes[AUDIO_KEY]?.newValue ?? audioStore);
      activeSceneId = sceneStore.activeId || activeSceneId;
      loaded = true;
      if (playing) startScene(activeSceneId).catch(() => {});
      DS.updateQuickPanel?.();
      ensureChatControl();
    }
    if (changes.settings) ensureChatControl(changes.settings.newValue || {});
    if (changes.settings && playing) {
      const nextSettings = changes.settings.newValue || {};
      if (!nextSettings.enableSoundscapes || !scopeAllowed(nextSettings)) stopAll({ quiet: true });
      else for (const player of players.values()) setPlayerVolume(player, player.layerVolume, 1);
    }
  });
})();
