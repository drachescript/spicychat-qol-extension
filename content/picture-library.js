// Independently opt-in Picture Library; shares only the storage helper.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  const kit = DS?.customPictureKit;
  if (!kit) return;
  const MAX_GALLERY_DATA_CHARS = 24 * 1024 * 1024;
  async function saveToLibrary(item) {
    const data = await kit.loadStore();
    const existing = data.pictureLibrary || [];
    if (existing.length >= 30) throw new Error("Picture Library is full (30 images). Remove one first.");
    const chars = existing.reduce((total, entry) => total + (entry.dataUrl?.length || 0), 0);
    if (chars + (item.dataUrl?.length || 0) > MAX_GALLERY_DATA_CHARS)
      throw new Error("Picture Library reached its 24 MB local budget.");
    const entry = { ...item, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` };
    await kit.saveStore({ ...data, pictureLibrary:[...existing,entry] });
  }
  DS.saveToPictureLibrary = saveToLibrary;
  function buildLibrary(section) {
    const heading = document.createElement("h3"); heading.textContent = "Picture Library";
    const hint = document.createElement("p"); hint.textContent = "Reusable local pictures (up to 30). Existing background scene galleries remain separate.";
    section.append(heading,hint);
    kit.appendButton(section,"Add picture to library",async () => {
      const item = await kit.choosePictureFile(); if (item) { await saveToLibrary(item); await kit.reopen("library"); }
    });
    const grid = document.createElement("div"); grid.className = "ds-chat-scene-grid";
    for (const entry of kit.getStore().pictureLibrary || []) {
      const row = document.createElement("div"); row.className = "ds-chat-scene-item";
      const image = document.createElement("img"); image.src = kit.pictureUrl(entry); image.alt = entry.name; image.loading = "lazy";
      row.append(image);
      for (const [role, label] of [["character","Use for character"],["persona","Use for persona"],["backgrounds","Use as background"]]) {
        if (!kit.availableTabs().some(tab => tab.id === role)) continue;
        kit.appendButton(row,label,async () => {
          if (role === "backgrounds") {
            const data = await kit.loadStore(); const key = kit.chatKey();
            if (!key) throw new Error("Open a conversation first.");
            const suppressedChats = { ...data.suppressedChats }; delete suppressedChats[key];
            await kit.saveStore({ ...data, chats:{ ...data.chats, [key]:entry }, suppressedChats });
            await DS.applyChatBackgrounds?.();
          } else {
            if (typeof DS.pictureEditorCore?.storePicture !== "function") throw new Error("Picture editing not installed.");
            await DS.pictureEditorCore.storePicture(role,entry);
          }
          await kit.reopen(role);
        });
      }
      kit.appendButton(row,"Rename", async () => {
        const name=window.prompt("Picture name",entry.name);
        if (name===null || !name.trim()) return;
        const data = await kit.loadStore();
        const items = data.pictureLibrary.map(item => item.id===entry.id ? {...item,name:name.trim().slice(0,180)} : item);
        await kit.saveStore({...data,pictureLibrary:items}); await kit.reopen("library");
      });
      kit.appendButton(row,"Remove", async () => {
        const data = await kit.loadStore();
        await kit.saveStore({...data,pictureLibrary:data.pictureLibrary.filter(item=>item.id!==entry.id)});
        await kit.reopen("library");
      });
      grid.append(row);
    }
    section.append(grid);
  }
  kit.registerTab("library","Picture library","picture-library","enableCustomPictureLibrary",buildLibrary);
})();
}
