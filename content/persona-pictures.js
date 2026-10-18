// Current persona look: independent per-chat visual override and editor registration.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  const kit = DS?.customPictureKit;
  const editor = DS?.pictureEditorCore;
  const overrides = DS?.pictureOverrideCore;
  if (!kit || !editor || !overrides) return;
  const painter = overrides.create("persona", false, false);
  kit.registerTab("persona", "Persona pictures", "persona-pictures", "enableCustomPersonaPictures", section => editor.buildEditor(section,"persona","Current persona look"));
  kit.registerApply("persona", () => {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableCustomPersonaPictures || !kit.isInstalled("persona-pictures")) { painter.clear(); return; }
    const item = kit.getStore().personaPictures?.[kit.chatKey()];
    painter.apply(kit.pictureUrl(item));
  });
  DS.removePersonaPictureOverride = painter.clear;
})();
}
