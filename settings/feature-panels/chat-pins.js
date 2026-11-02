// Settings for optional local conversation pins. Does not alter saved pins when excluded.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if(profile?.generated && Array.isArray(profile.features) && !profile.features.includes("chat-pins"))return;
  const host=document.getElementById("ds-feature-panel-chat-pins"); if(!host)return;
  const label=document.createElement("label"); label.className="row";
  const checkbox=document.createElement("input");checkbox.id="enableChatPins";checkbox.type="checkbox";
  const title=document.createElement("span");title.textContent="Show pinned conversations at the top of Chats";
  label.append(checkbox,title);
  const hint=document.createElement("p");hint.className="hint";
  hint.textContent="Pin a chat from its card. Older chats stay accessible even when no longer loaded.";
  host.replaceWith(label,hint);
  (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null)).enableChatPins=()=>checkbox.checked;
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null)).enableChatPins=settings=>{checkbox.checked=settings.enableChatPins===true;};
})();
