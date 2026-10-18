// Current character look: independent per-chat visual override and editor registration.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  const kit = DS?.customPictureKit;
  const editor = DS?.pictureEditorCore;
  const overrides = DS?.pictureOverrideCore;
  if (!kit || !editor || !overrides) return;
  const painter = overrides.create("character", true, true);
  kit.registerTab("character", "Character pictures", "character-pictures", "enableCustomCharacterPictures", section => editor.buildEditor(section,"character","Current character look"));
  kit.registerApply("character", () => {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableCustomCharacterPictures || !kit.isInstalled("character-pictures")) { painter.clear(); return; }
    const item = kit.getStore().portraits?.[kit.chatKey()];
    painter.apply(kit.pictureUrl(item));
  });
  DS.removeCharacterPictureOverride = painter.clear;
})();
}
