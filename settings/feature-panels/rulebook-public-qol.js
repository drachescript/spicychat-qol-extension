// Local Rulebook blocking Settings. Does not modify SpicyChat Rulebooks.
(() => {
  "use strict";
  const profile=window.__DSQ_BUILD_PROFILE__;
  if(profile?.generated && Array.isArray(profile.features) && !profile.features.includes("rulebook-public-qol"))return;
  const host=document.getElementById("ds-feature-panel-rulebook-public-qol");if(!host)return;
  const card=document.createElement("div");card.className="sub-card";card.id="rulebookBlockingCard";
  const heading=document.createElement("h3");heading.textContent="Public Rulebook blocking";card.appendChild(heading);
  const entries=[
    ["rulebookBlockingEnabled","Block Rulebook cards with QoL rules"],
    ["applyBotBlockingToRulebooks","Use my normal blocked words, tags, and creators for Rulebooks too"],
    ["showRulebookBlockButtons","Show a quick Block × on Rulebook cards"]
  ];
  const readers=window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders=window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  for(const [id,text] of entries){
    const label=document.createElement("label");label.className="row";
    const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.id=id;
    const span=document.createElement("span");span.textContent=text;label.append(checkbox,span);card.appendChild(label);
    readers[id]=()=>checkbox.checked;
    loaders[id]=settings=>{checkbox.checked=settings[id]===true;};
  }
  const label=document.createElement("label");label.textContent="Blocked Rulebook UUIDs, one per line";
  const textarea=document.createElement("textarea");textarea.id="rulebookBlockedIds";textarea.spellcheck=false;
  textarea.placeholder="12f13d54-5738-5c46-b7a7-9ac6dd00b52f";label.appendChild(textarea);card.appendChild(label);
  readers.rulebookBlockedIds=()=>[...new Set(textarea.value.split(/\\r?\\n/).map(v=>v.trim()).filter(Boolean))];
  loaders.rulebookBlockedIds=settings=>{textarea.value=Array.isArray(settings.rulebookBlockedIds)?settings.rulebookBlockedIds.join("\\n"):"";};
  const hint=document.createElement("p");hint.className="hint";
  hint.textContent="Local blocking by ID, blocked words, or creator. Rulebook meters aren't tags.";
  card.appendChild(hint);host.replaceWith(card);
})();
