// Shared, stateless picture-editor controls; feature modules register themselves.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  const kit = DS?.customPictureKit;
  if (!kit) return;
  async function storePicture(kind, item) {
    const key = kit.chatKey();
    if (!key) throw new Error("Open a conversation first.");
    const field = kind === "character" ? "portraits" : "personaPictures";
    const state = await kit.loadStore();
    const records = { ...state[field] };
    if (item) records[key] = item;
    else delete records[key];
    await kit.saveStore({ ...state, [field]: records });
    await DS.applyChatBackgrounds?.();
  }
  async function buildEditor(section, kind, label) {
    const state = kit.getStore();
    const item = (kind === "character" ? state.portraits : state.personaPictures)?.[kit.chatKey()];
    const heading = document.createElement("h3"); heading.textContent = label;
    const hint = document.createElement("p"); hint.textContent = "Per-chat visual override only. It doesn't change the bot/persona profile or native image-generation reference.";
    section.append(heading, hint);
    if (item) {
      const img = document.createElement("img"); img.src = kit.pictureUrl(item);
      img.alt = item.name || label;
      img.style.cssText = "width:104px;max-height:140px;object-fit:contain;border-radius:8px;display:block;margin:10px 0";
      section.append(img);
    }
    const controls = document.createElement("div"); controls.className = "ds-chat-background-actions";
    kit.appendButton(controls, "Choose picture", async () => {
      const image = await kit.choosePictureFile();
      if (image) { await storePicture(kind, image); await kit.reopen(kind); }
    });
    kit.appendButton(controls, "Use image URL", async () => {
      const entered = window.prompt("Public HTTPS image URL");
      if (entered === null) return;
      const url = kit.safeBackgroundUrl(entered);
      if (!url) throw new Error("Enter a valid public HTTPS image URL.");
      await storePicture(kind, { url, sourceUrl:url, sourceMode:"link", name:"Linked picture", updatedAt:Date.now() });
      await kit.reopen(kind);
    });
    kit.appendButton(controls, "Clear override", async () => { await storePicture(kind, null); await kit.reopen(kind); });
    if (kit.availableTabs().some(tab => tab.id === "library") && typeof DS.saveToPictureLibrary === "function") {
      kit.appendButton(controls, "Save to library", async () => {
        if (!item) throw new Error("Choose a picture first.");
        await DS.saveToPictureLibrary(item); await kit.reopen("library");
      });
    }
    section.append(controls);
    const appearance = document.createElement("label"); appearance.textContent = "Appearance / scene notes (local only)";
    const area = document.createElement("textarea"); area.rows = 3; area.maxLength = 1200;
    area.placeholder = "Current outfit, location, look..."; area.value = item?.note || "";
    appearance.append(area); section.append(appearance);
    kit.appendButton(section, "Save appearance note", async () => {
      if (!item) throw new Error("Choose a picture before saving notes.");
      await storePicture(kind, { ...item, note:area.value.slice(0,1200) }); await kit.reopen(kind);
    });
    if (kind === "character") kit.appendButton(section, "Use latest chat image as current look", async () => {
      const imgs = [...document.querySelectorAll("div[id^='message-'] img")].filter(img => {
        return img.naturalWidth >= 200 && img.naturalHeight >= 150 && !img.closest("button");
      });
      const url = kit.safeBackgroundUrl(imgs.at(-1)?.currentSrc || imgs.at(-1)?.src || "");
      if (!url) throw new Error("No suitable generated image is loaded; save and upload it instead.");
      await storePicture(kind, { url, sourceUrl:url, sourceMode:"link", name:"Latest chat image", updatedAt:Date.now() });
      await kit.reopen(kind);
    });
  }
  DS.pictureEditorCore = Object.freeze({ storePicture, buildEditor });
})();
}
