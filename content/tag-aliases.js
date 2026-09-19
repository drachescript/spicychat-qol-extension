(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const STYLE_ID="ds-tag-alias-style";
  const clean=v=>String(v||"").replace(/\s+/g," ").trim();
  const norm=v=>clean(v).toLowerCase();
  function parsedRules(){
    const byAlias=new Map(), byCanonical=new Map();
    for(const line of String(DS.state.settings?.tagAliasRules||"").split(/\n+/)){
      const raw=line.trim(); if(!raw||raw.startsWith("#"))continue;
      const parts=raw.split(/\s*(?:=>|=|\|)\s*/); if(parts.length<2)continue;
      const alias=clean(parts.shift()), canonical=clean(parts.shift()), emoji=clean(parts.join(" "));
      if(!alias||!canonical)continue;
      const rule={alias,canonical,emoji};
      byAlias.set(norm(alias),rule);
      if(!byCanonical.has(norm(canonical)))byCanonical.set(norm(canonical),rule);
    }
    return {byAlias,byCanonical};
  }
  DS.resolveTagAlias=function(value){const r=parsedRules().byAlias.get(norm(value));return r?.canonical||clean(value);};
  DS.expandTagAliases=function(values){return [...new Set((values||[]).map(v=>DS.resolveTagAlias(v)).filter(Boolean))];};
  function ensureStyle(){if(document.getElementById(STYLE_ID))return;const s=document.createElement("style");s.id=STYLE_ID;s.textContent=`.ds-tag-alias-note{font-size:10px;opacity:.72;margin-left:4px}.ds-tag-alias-emoji{margin-right:3px}`;document.head.appendChild(s);}
  function visibleTagNodes(){return [...document.querySelectorAll("[data-testid^='TagSuggestionItem-'], a[aria-label^='tag-'], button[class*='rounded-full'][class*='cursor-default'] > span, button[aria-label][class*='rounded-[3px]'] > span")].filter(el=>!el.closest("#ds-qol-panel"));}
  function applyNode(el,maps){
    if(el.dataset.dsTagAliasOriginal===undefined){el.dataset.dsTagAliasOriginal=clean(el.textContent);el.dataset.dsTagAliasTitle=el.getAttribute("title")||"";}
    const original=el.dataset.dsTagAliasOriginal; const hit=maps.byAlias.get(norm(original))||maps.byCanonical.get(norm(original));
    el.querySelector?.(".ds-tag-alias-note")?.remove?.();
    if(!hit){el.textContent=original;if(el.dataset.dsTagAliasTitle)el.setAttribute("title",el.dataset.dsTagAliasTitle);else el.removeAttribute("title");return;}
    el.title=`Local alias: ${hit.alias} → ${hit.canonical}`;
    if(DS.state.settings?.tagAliasShowDisplay){
      el.textContent="";
      if(hit.emoji){const em=document.createElement("span");em.className="ds-tag-alias-emoji";em.textContent=hit.emoji;el.appendChild(em);}
      el.append(document.createTextNode(original));
      const note=document.createElement("span");note.className="ds-tag-alias-note";note.textContent=norm(original)===norm(hit.canonical)?`(${hit.alias})`:`→ ${hit.canonical}`;el.appendChild(note);
    } else el.textContent=original;
  }
  function cleanup(){document.querySelectorAll("[data-ds-tag-alias-original]").forEach(el=>{el.textContent=el.dataset.dsTagAliasOriginal||el.textContent;if(el.dataset.dsTagAliasTitle)el.setAttribute("title",el.dataset.dsTagAliasTitle);else el.removeAttribute("title");el.removeAttribute("data-ds-tag-alias-original");el.removeAttribute("data-ds-tag-alias-title");});}
  DS.applyTagAliases=function(){const s=DS.state.settings||{};if(!s.enabled||!s.enableTagAliases)return cleanup();ensureStyle();const maps=parsedRules();visibleTagNodes().forEach(el=>applyNode(el,maps));};
  DS.removeTagAliases=cleanup;
})();
