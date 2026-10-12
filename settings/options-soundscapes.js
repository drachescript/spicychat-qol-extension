// Soundscapes Settings. Loaded after the shared defaults, before options.js.
const SOUNDSCAPES_KEY = "soundscapes";
const SOUNDSCAPE_AUDIO_KEY = "soundscapeAudioLibrary";
let soundscapeSceneState = { version: 1, activeId: "", scenes: [] };
let soundscapeAudioState = { version: 1, items: [] };
let soundscapeScenePersistTimer = 0;

function soundscapeId(prefix = "item") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeSoundscapeLayer(value, index = 0) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    id: String(raw.id || soundscapeId("layer")),
    name: String(raw.name || `Layer ${index + 1}`).trim() || `Layer ${index + 1}`,
    sourceType: raw.sourceType === "file" ? "file" : "url",
    source: String(raw.source || "").trim(),
    volume: Number.isFinite(Number(raw.volume)) ? Math.min(100, Math.max(0, Number(raw.volume))) : 70,
    enabled: raw.enabled !== false,
    loop: raw.loop !== false,
    intervalSeconds: Math.min(3600, Math.max(0, Number(raw.intervalSeconds) || 0))
  };
}

function normalizeSoundscapeScene(value, index = 0) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    id: String(raw.id || soundscapeId("scene")),
    name: String(raw.name || `Soundscape ${index + 1}`).trim() || `Soundscape ${index + 1}`,
    layers: (Array.isArray(raw.layers) ? raw.layers : []).slice(0, 5).map(normalizeSoundscapeLayer)
  };
}

function normalizeSoundscapeScenes(value) {
  const raw = value && typeof value === "object" ? value : {};
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, 50).map(normalizeSoundscapeScene);
  const activeId = scenes.some(scene => scene.id === raw.activeId) ? raw.activeId : (scenes[0]?.id || "");
  return { version: 1, activeId, scenes };
}

function normalizeSoundscapeAudio(value) {
  const raw = value && typeof value === "object" ? value : {};
  const items = (Array.isArray(raw.items) ? raw.items : []).filter(item => item && typeof item === "object").map(item => ({
    id: String(item.id || "").trim(),
    name: String(item.name || "Saved audio").trim() || "Saved audio",
    mime: String(item.mime || "").trim(),
    size: Number(item.size) || 0,
    dataUrl: String(item.dataUrl || ""),
    savedAt: Number(item.savedAt) || 0
  })).filter(item => item.id && item.dataUrl);
  return { version: 1, items };
}

function soundscapeBytesLabel(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function persistSoundscapeScenes({ rerender = false } = {}) {
  if (soundscapeScenePersistTimer) { clearTimeout(soundscapeScenePersistTimer); soundscapeScenePersistTimer = 0; }
  soundscapeSceneState = normalizeSoundscapeScenes(soundscapeSceneState);
  const ok = await storageSetVerified({ [SOUNDSCAPES_KEY]: soundscapeSceneState });
  if (!ok) showSettingsToast("Soundscape scene changes could not be verified in browser storage. Please press Save now to retry.");
  if (rerender) renderSoundscapeScenes();
  return ok;
}

function scheduleSoundscapeScenePersist(delay = 220) {
  if (soundscapeScenePersistTimer) clearTimeout(soundscapeScenePersistTimer);
  soundscapeScenePersistTimer = window.setTimeout(() => {
    soundscapeScenePersistTimer = 0;
    persistSoundscapeScenes().catch(() => {});
  }, Math.max(80, Number(delay) || 220));
}

async function flushSoundscapeSceneState() {
  if (!soundscapeManagerLoaded) return true;
  return persistSoundscapeScenes();
}

async function persistSoundscapeAudio({ rerender = false } = {}) {
  soundscapeAudioState = normalizeSoundscapeAudio(soundscapeAudioState);
  const ok = await storageSetVerified({ [SOUNDSCAPE_AUDIO_KEY]: soundscapeAudioState });
  if (!ok) showSettingsToast("Imported Soundscape audio could not be verified in browser storage. The previous saved copy was left alone where possible.");
  if (rerender) {
    renderSoundscapeAudioLibrary();
    renderSoundscapeScenes();
  }
  return ok;
}

function soundscapeAudioOptions(select, current = "") {
  select.replaceChildren();
  select.append(makeElement("option", { text: soundscapeAudioState.items.length ? "Choose saved audio…" : "No saved audio imported", attrs: { value: "" } }));
  for (const item of soundscapeAudioState.items) {
    select.append(makeElement("option", { text: `${item.name} (${soundscapeBytesLabel(item.size)})`, attrs: { value: item.id } }));
  }
  select.value = soundscapeAudioState.items.some(item => item.id === current) ? current : "";
}

function renderSoundscapeAudioLibrary() {
  const host = $("soundscapeAudioList");
  const status = $("soundscapeAudioStatus");
  if (!host) return;
  host.replaceChildren();
  const total = soundscapeAudioState.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  if (status) status.textContent = soundscapeAudioState.items.length
    ? `${soundscapeAudioState.items.length} local audio file${soundscapeAudioState.items.length === 1 ? "" : "s"} · ${soundscapeBytesLabel(total)} stored. Files stay local and are not included in normal text/settings backups.`
    : "Import short ambience/audio files here. QoL stores them locally in extension storage and excludes the audio bytes from normal text/settings backups.";
  if (!soundscapeAudioState.items.length) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "No local ambience audio saved yet. URL layers can still be used." }));
    return;
  }
  for (const item of soundscapeAudioState.items) {
    const row = makeElement("div", { className: "soundscape-audio-row" });
    const meta = makeElement("div", { className: "soundscape-audio-meta" });
    meta.append(makeElement("strong", { text: item.name }), makeElement("small", { text: `${soundscapeBytesLabel(item.size)}${item.mime ? ` · ${item.mime}` : ""}` }));
    const remove = makeElement("button", { text: "Remove", attrs: { type: "button" } });
    remove.addEventListener("click", async () => {
      const refs = soundscapeSceneState.scenes.reduce((sum, scene) => sum + scene.layers.filter(layer => layer.sourceType === "file" && layer.source === item.id).length, 0);
      if (refs && !confirm(`This audio file is used by ${refs} soundscape layer${refs === 1 ? "" : "s"}. Remove it and clear those layer sources?`)) return;
      soundscapeAudioState.items = soundscapeAudioState.items.filter(entry => entry.id !== item.id);
      for (const scene of soundscapeSceneState.scenes) {
        for (const layer of scene.layers) if (layer.sourceType === "file" && layer.source === item.id) layer.source = "";
      }
      await Promise.all([persistSoundscapeAudio(), persistSoundscapeScenes()]);
      renderSoundscapeAudioLibrary();
      renderSoundscapeScenes();
    });
    row.append(meta, remove);
    host.append(row);
  }
}

function makeSoundscapeLayerRow(scene, layer, index) {
  const row = makeElement("div", { className: "soundscape-layer-row" });
  const name = makeElement("input", { attrs: { type: "text", value: layer.name, placeholder: `Layer ${index + 1}`, "aria-label": "Sound layer name" } });
  const type = makeElement("select", { attrs: { "aria-label": "Sound source type" } });
  type.append(makeElement("option", { text: "Saved local audio", attrs: { value: "file" } }), makeElement("option", { text: "Audio URL", attrs: { value: "url" } }));
  type.value = layer.sourceType;
  const sourceHost = makeElement("div", { className: "soundscape-layer-source" });
  const volumeWrap = makeElement("label", { className: "soundscape-volume" });
  const volume = makeElement("input", { attrs: { type: "range", min: "0", max: "100", step: "1", value: String(layer.volume), "aria-label": "Layer volume" } });
  const volumeValue = makeElement("span", { text: `${layer.volume}%` });
  volumeWrap.append(volume, volumeValue);
  const enabledLabel = makeElement("label", { className: "row soundscape-inline-check" });
  const enabled = makeElement("input", { attrs: { type: "checkbox" } });
  enabled.checked = layer.enabled !== false;
  enabledLabel.append(enabled, document.createTextNode("On"));
  const loopLabel = makeElement("label", { className: "row soundscape-inline-check" });
  const loop = makeElement("input", { attrs: { type: "checkbox" } });
  loop.checked = layer.loop;
  loopLabel.append(loop, document.createTextNode("Loop"));
  const interval = makeElement("input", { attrs: { type: "number", min: "0", max: "3600", step: "5", value: String(layer.intervalSeconds || 0), title: "0 = no timed replay", "aria-label": "Replay interval in seconds" } });
  const remove = makeElement("button", { text: "Remove", attrs: { type: "button" } });

  const renderSource = () => {
    sourceHost.replaceChildren();
    if (layer.sourceType === "file") {
      const select = makeElement("select", { attrs: { "aria-label": "Saved audio file" } });
      soundscapeAudioOptions(select, layer.source);
      select.addEventListener("change", async () => { layer.source = select.value; await persistSoundscapeScenes(); });
      sourceHost.append(select);
    } else {
      const input = makeElement("input", { attrs: { type: "url", value: layer.source, placeholder: "https://…/rain.mp3", "aria-label": "Audio URL" } });
      input.addEventListener("input", () => { layer.source = input.value.trim(); scheduleSoundscapeScenePersist(); });
      input.addEventListener("change", async () => { layer.source = input.value.trim(); await persistSoundscapeScenes(); });
      sourceHost.append(input);
    }
  };
  renderSource();

  name.addEventListener("input", () => { layer.name = name.value.trim() || `Layer ${index + 1}`; scheduleSoundscapeScenePersist(); });
  name.addEventListener("change", async () => { layer.name = name.value.trim() || `Layer ${index + 1}`; await persistSoundscapeScenes(); });
  type.addEventListener("change", async () => { layer.sourceType = type.value === "file" ? "file" : "url"; layer.source = ""; renderSource(); await persistSoundscapeScenes(); });
  volume.addEventListener("input", () => { layer.volume = Math.min(100, Math.max(0, Number(volume.value) || 0)); volumeValue.textContent = `${layer.volume}%`; scheduleSoundscapeScenePersist(); });
  volume.addEventListener("change", () => persistSoundscapeScenes());
  enabled.addEventListener("change", async () => { layer.enabled = enabled.checked; await persistSoundscapeScenes(); });
  loop.addEventListener("change", async () => { layer.loop = loop.checked; await persistSoundscapeScenes(); });
  interval.addEventListener("change", async () => { layer.intervalSeconds = Math.min(3600, Math.max(0, Number(interval.value) || 0)); interval.value = String(layer.intervalSeconds); await persistSoundscapeScenes(); });
  remove.addEventListener("click", async () => { scene.layers = scene.layers.filter(item => item.id !== layer.id); await persistSoundscapeScenes({ rerender: true }); });

  const sourceLabel = makeElement("div", { className: "soundscape-source-block" });
  sourceLabel.append(type, sourceHost);
  const intervalWrap = makeElement("label", { className: "soundscape-interval" });
  intervalWrap.append(document.createTextNode("Repeat every (sec, 0 = off)"), interval);
  row.append(name, sourceLabel, volumeWrap, enabledLabel, loopLabel, intervalWrap, remove);
  return row;
}

function renderSoundscapeScenes() {
  const host = $("soundscapeSceneList");
  if (!host) return;
  soundscapeSceneState = normalizeSoundscapeScenes(soundscapeSceneState);
  host.replaceChildren();
  if (!soundscapeSceneState.scenes.length) {
    host.append(makeElement("div", { className: "bot-manager-empty", text: "No soundscapes yet. Add a scene, then add up to five layers." }));
    return;
  }
  for (const scene of soundscapeSceneState.scenes) {
    const card = makeElement("div", { className: `soundscape-scene-card${scene.id === soundscapeSceneState.activeId ? " is-active" : ""}` });
    const head = makeElement("div", { className: "soundscape-scene-head" });
    const name = makeElement("input", { attrs: { type: "text", value: scene.name, "aria-label": "Soundscape name" } });
    const active = makeElement("button", { text: scene.id === soundscapeSceneState.activeId ? "Active" : "Set active", attrs: { type: "button" } });
    const remove = makeElement("button", { text: "Delete", attrs: { type: "button" } });
    name.addEventListener("input", () => { scene.name = name.value.trim() || "Soundscape"; scheduleSoundscapeScenePersist(); });
    name.addEventListener("change", async () => { scene.name = name.value.trim() || "Soundscape"; await persistSoundscapeScenes({ rerender: true }); });
    active.addEventListener("click", async () => { soundscapeSceneState.activeId = scene.id; await persistSoundscapeScenes({ rerender: true }); });
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete soundscape "${scene.name}"? This does not delete imported audio files.`)) return;
      soundscapeSceneState.scenes = soundscapeSceneState.scenes.filter(item => item.id !== scene.id);
      if (soundscapeSceneState.activeId === scene.id) soundscapeSceneState.activeId = soundscapeSceneState.scenes[0]?.id || "";
      await persistSoundscapeScenes({ rerender: true });
    });
    head.append(name, active, remove);
    card.append(head);

    const layers = makeElement("div", { className: "soundscape-layer-list" });
    scene.layers.forEach((layer, index) => layers.append(makeSoundscapeLayerRow(scene, layer, index)));
    if (!scene.layers.length) layers.append(makeElement("div", { className: "hint", text: "No layers in this scene yet." }));
    card.append(layers);

    const add = makeElement("button", { text: scene.layers.length >= 5 ? "5 layer limit reached" : "+ Add layer", attrs: { type: "button" } });
    add.disabled = scene.layers.length >= 5;
    add.addEventListener("click", async () => {
      if (scene.layers.length >= 5) return;
      scene.layers.push(normalizeSoundscapeLayer({ id: soundscapeId("layer"), name: `Layer ${scene.layers.length + 1}`, sourceType: soundscapeAudioState.items.length ? "file" : "url", volume: 70, enabled: true, loop: true, intervalSeconds: 0 }, scene.layers.length));
      await persistSoundscapeScenes({ rerender: true });
    });
    card.append(add);
    host.append(card);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read audio file"));
    reader.readAsDataURL(file);
  });
}

async function importSoundscapeAudio(files) {
  await loadSoundscapeManager();
  const status = $("soundscapeAudioStatus");
  const list = [...(files || [])].filter(file => file && /^audio\//i.test(file.type || "audio/unknown"));
  if (!list.length) {
    if (status) status.textContent = "Choose one or more audio files first.";
    return;
  }
  const perFileLimit = 20 * 1024 * 1024;
  const totalLimit = 60 * 1024 * 1024;
  let total = soundscapeAudioState.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  let added = 0;
  let skipped = 0;
  for (const file of list) {
    if (file.size > perFileLimit || total + file.size > totalLimit) { skipped += 1; continue; }
    const dataUrl = await fileToDataUrl(file);
    soundscapeAudioState.items.push({ id: soundscapeId("audio"), name: file.name || `Audio ${soundscapeAudioState.items.length + 1}`, mime: file.type || "audio/*", size: file.size, dataUrl, savedAt: Date.now() });
    total += file.size;
    added += 1;
  }
  const saved = await persistSoundscapeAudio({ rerender: true });
  if (status) status.textContent = saved
    ? `${added} audio file${added === 1 ? "" : "s"} imported${skipped ? `; ${skipped} skipped because the local audio limit is 20 MB per file / 60 MB total` : ""}.`
    : "Audio import could not be verified in browser storage. Nothing should be trusted as saved until this succeeds.";
}

let soundscapeManagerLoaded = false;
let soundscapeManagerLoadPromise = null;

async function loadSoundscapeManager() {
  if (soundscapeManagerLoaded) return;
  if (soundscapeManagerLoadPromise) return soundscapeManagerLoadPromise;
  soundscapeManagerLoadPromise = (async () => {
    const result = await storageGet([SOUNDSCAPES_KEY, SOUNDSCAPE_AUDIO_KEY]);
    soundscapeSceneState = normalizeSoundscapeScenes(result[SOUNDSCAPES_KEY]);
    soundscapeAudioState = normalizeSoundscapeAudio(result[SOUNDSCAPE_AUDIO_KEY]);
    renderSoundscapeAudioLibrary();
    renderSoundscapeScenes();
    soundscapeManagerLoaded = true;
  })();
  try { await soundscapeManagerLoadPromise; } finally { soundscapeManagerLoadPromise = null; }
}

function armLazySoundscapeManager() {
  const card = $("soundscapesCard");
  if (!card || soundscapeManagerLoaded) return;
  const load = () => loadSoundscapeManager().catch(() => {});
  if (!("IntersectionObserver" in window)) {
    if (checked("enableSoundscapes")) load();
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    load();
  }, { rootMargin: "500px 0px" });
  observer.observe(card);
}


function bindSoundscapesSettingsEvents() {
$("enableSoundscapes")?.addEventListener("change", event => { if (event.target.checked) loadSoundscapeManager().catch(() => {}); });
$("soundscapeMasterVolume")?.addEventListener("input", event => { if ($("soundscapeMasterVolumeValue")) $("soundscapeMasterVolumeValue").textContent = `${event.target.value}%`; });
$("soundscapeAudioUpload")?.addEventListener("change", async event => { await importSoundscapeAudio(event.target.files); event.target.value = ""; });
$("soundscapeAddScene")?.addEventListener("click", async () => {
  const input = $("soundscapeNewSceneName");
  const name = String(input?.value || "").trim() || `Soundscape ${soundscapeSceneState.scenes.length + 1}`;
  const scene = normalizeSoundscapeScene({ id: soundscapeId("scene"), name, layers: [] }, soundscapeSceneState.scenes.length);
  soundscapeSceneState.scenes.push(scene);
  if (!soundscapeSceneState.activeId) soundscapeSceneState.activeId = scene.id;
  if (input) input.value = "";
  await persistSoundscapeScenes({ rerender: true });
});
}
