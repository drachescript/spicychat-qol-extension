if (!window.__DSQ_TAB_GATE__?.paused) {
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

}

// Optional, privacy-safe hover hints for SpicyChat’s tag filters and chatbot editor.
// Explanations are community-style guidance, NOT official tag definitions or moderation rules.
// No network requests, no new observers, no tag editing and no polling.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const TAG_HINTS = Object.freeze({
  "NSFW": "Adult or sexually explicit themes; visibility depends on site settings.",
  "Male": "Male character or character identity.",
  "Female": "Female character or character identity.",
  "Trans": "Transgender character or identity.",
  "Non-Binary": "Non-binary character or identity.",
  "LGBTQ+": "LGBTQ+ identities, characters, or themes.",
  "MalePOV": "Story framed primarily for a male player perspective.",
  "FemalePOV": "Story framed primarily for a female player perspective.",
  "AI Assistant": "Assistant-oriented interaction rather than a conventional roleplay character.",
  "Action": "Physical action, danger, or high-energy events.",
  "Adventure": "Exploration, quests, or unfolding journeys.",
  "Age Play": "Adult-only age-themed roleplay dynamics; must comply with platform rules.",
  "Anal": "Sexual content involving anal activity.",
  "Anime": "Anime-inspired character, visual style, or setting.",
  "Anthro": "Humanlike characters with animal features.",
  "Bondage": "Restraint-oriented adult themes.",
  "CNC": "Adult consensual non-consent fantasy; boundaries and consent matter.",
  "Cheating": "Infidelity or betrayal themes. Whether simulated or implied cheating belongs here is disputed.",
  "Chubby": "Character with a fuller or rounder body type.",
  "Comedy": "Humorous situations, dialogue, or tone.",
  "Corruption": "A character changing in values, conduct, or desires over the story.",
  "Crossdressing": "Wearing clothing traditionally associated with another gender.",
  "Dominant": "Assertive or leading interpersonal or roleplay dynamic.",
  "Drama": "Emotional conflict and serious character situations.",
  "English": "Content primarily written in English.",
  "Fantasy": "Imaginary settings, magic, or fantastical elements.",
  "Fat": "Larger-bodied character or body-type theme.",
  "Feet": "Foot-focused themes or attraction.",
  "Femboy": "Feminine-presenting male character or identity.",
  "Fictional Media": "Character or setting based on an existing fictional work.",
  "Flatulence": "Flatulence-focused humor or fetish themes.",
  "Friend": "Friendship or a platonic companion relationship.",
  "Furry": "Anthropomorphic animal characters or furry themes.",
  "Futanari": "Fantasy sexual anatomy or related adult themes.",
  "Game": "Game-based character, scenario, or interactive theme.",
  "Gentle Dom": "Supportive, caring expression of dominance.",
  "Giant": "Unusually large character or size-focused scenario.",
  "Gothic": "Dark, moody, or gothic aesthetics.",
  "Hero": "Heroic role, values, or adventure.",
  "Historical": "Real-world historical era or history-inspired setting.",
  "Horror": "Fear, suspense, or unsettling themes.",
  "Impregnation": "Pregnancy-causing sexual fantasy themes.",
  "Inanimate": "Nonliving objects represented as characters or central subjects.",
  "Inflation": "Fantasy body expansion themes.",
  "Lactation": "Milk production or lactation-focused themes.",
  "Low Quality": "Subjective community label for perceived low-effort content; not an objective rating.",
  "MILF": "Adult mature-woman attraction theme.",
  "MLM": "Romantic or sexual relationships between men.",
  "Magic": "Magical powers, spells, or magical worlds.",
  "Married Partner": "Spouse or marriage-focused character relationship.",
  "Masochistic": "Enjoyment of pain or humiliation in an adult roleplay context.",
  "Mature": "Older adult character or mature themes; exact meaning may vary.",
  "Mind Control": "Fictional manipulation or control of thoughts or behavior.",
  "Monster": "Monstrous or nonhuman creature characters.",
  "Multiple Characters": "Bot portrays more than one character.",
  "Muscle": "Muscular appearance or physique-focused themes.",
  "Mystery": "Unanswered questions, investigation, or secrets.",
  "Mythological": "Myths, deities, or legendary creatures.",
  "NTR": "Netorare-related relationship jealousy or partner-loss themes.",
  "Nature": "Wilderness, landscapes, animals, or nature-focused storytelling.",
  "Non-English": "Content primarily written in a language other than English.",
  "Omegaverse": "Alpha/beta/omega fictional social or biological dynamics.",
  "Oral": "Oral sexual activity themes.",
  "Original Character": "Character created independently rather than from an established franchise.",
  "Partner": "A romantic, sexual, or established companion relationship.",
  "Pregnant": "Pregnant character or pregnancy-centered story.",
  "RPG": "Roleplaying-game structures such as quests, stats, or classes.",
  "Real": "Meaning disputed: can imply realism, real people, or realistic images; no tag-specific official definition published.",
  "Romantic": "Love, dating, or developing romantic relationships.",
  "Roommate": "Characters sharing a home or living situation.",
  "Sadistic": "Taking pleasure in inflicting pain or humiliation in fictional dynamics.",
  "Scenario": "Interaction built around a defined situation or premise.",
  "Sci-Fi": "Science-fiction technology, worlds, or speculative futures.",
  "Servant": "Serving or working for another character.",
  "Simulator": "Simulation of a role, system, activity, or experience.",
  "Size Difference": "Significant difference in characters’ sizes.",
  "Slave": "Fictional servitude or enslavement themes.",
  "Smell": "Scents, smell, or scent-focused storytelling.",
  "Submissive": "Following or yielding in an interpersonal or roleplay dynamic.",
  "Supernatural": "Paranormal powers, ghosts, or otherworldly phenomena.",
  "Switch": "Character who can take dominant or submissive roles.",
  "Tomboy": "Masculine-presenting girl or woman.",
  "Transformation": "Physical or other significant change in form or identity.",
  "Tsundere": "Initially guarded or prickly character who may reveal affection.",
  "Villain": "Antagonist, criminal, or morally opposing character role.",
  "Vore": "Fantasy themes involving consuming or being consumed.",
  "WLW": "Romantic or sexual relationships between women.",
  "Watersport": "Urination-related adult fetish theme.",
  "Wholesome": "Comforting, kind, or uplifting tone.",
  "Yandere": "Intense romantic fixation that may become possessive or dangerous."
});
  const normalize = value => String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  const lookup = new Map(Object.entries(TAG_HINTS).map(([tag, hint]) => [normalize(tag), hint]));
  const priorTitles = new WeakMap();
  const OWNED = "data-ds-qol-tag-hint";
  const HOVER_SELECTOR = "[data-testid^='TagSuggestionItem-'], label[for^='include_'], label[for^='exclude_'], input[id^='include_'], input[id^='exclude_'], button[value], button[aria-label], button[class*='rounded-full'][class*='cursor-default']";
  const FILTER_SELECTOR = "input[id^='include_'],input[id^='exclude_']";
  let listening = false;
  let lastRoute = "";

  function tagFromInputId(id) {
    return String(id || "").replace(/^(?:include|exclude)_/, "").replace(/_/g, " ");
  }
  function editorIsPresent() {
    return !!document.querySelector('input[placeholder="Add Tags" i]');
  }
  function isTagPickerButton(el) {
    return !!(el?.matches?.("button[value],button[aria-label]") && editorIsPresent());
  }
  function identify(target) {
    if (!(target instanceof Element)) return null;
    let el = target.closest(HOVER_SELECTOR);
    if (!el || el.closest("#ds-qol-panel, #ds-tag-help-preview")) return null;
    let candidate = "";
    if (el.matches("label[for^='include_'],label[for^='exclude_']")) {
      candidate = tagFromInputId(el.getAttribute("for"));
    } else if (el.matches("input[id^='include_'],input[id^='exclude_']")) {
      candidate = tagFromInputId(el.id);
      el = el.closest("label") || document.querySelector(`label[for="${CSS.escape(el.id)}"]`) || el;
    } else if (el.matches("[data-testid^='TagSuggestionItem-']")) {
      const suffix = (el.getAttribute("data-testid") || "").slice("TagSuggestionItem-".length);
      candidate = lookup.has(normalize(suffix)) ? suffix : el.getAttribute("data-ds-tag-alias-original") || el.textContent;
    } else if (isTagPickerButton(el)) {
      candidate = el.getAttribute("value") || el.getAttribute("aria-label") || el.textContent;
    } else if (el.matches("button[class*='rounded-full'][class*='cursor-default']")) {
      // Only tag chips on pages with a native tag filter or creator input.
      if (!editorIsPresent() && !document.querySelector(FILTER_SELECTOR)) return null;
      candidate = el.textContent;
    } else return null;
    const hint = lookup.get(normalize(candidate));
    return hint ? { el, hint } : null;
  }
  function showHint(node) {
    if (!DS.state?.settings?.enabled || !DS.state?.settings?.showTagExplanations) return;
    const found = identify(node);
    if (!found) return;
    const { el, hint } = found;
    const old = priorTitles.get(el);
    const existing = el.getAttribute("title") || "";
    const original = old && existing === old.applied ? old.original : existing;
    const advisory = `Unofficial tag hint: ${hint} (Not a SpicyChat rule.)`;
    const applied = original ? `${original}\n${advisory}` : advisory;
    if (existing === applied) return;
    priorTitles.set(el, { original, applied });
    el.setAttribute("title", applied);
    el.setAttribute(OWNED, "1");
  }
  function onHover(event) { showHint(event.target); }
  function cleanup() {
    if (listening) {
      document.removeEventListener("pointerover", onHover, true);
      document.removeEventListener("focusin", onHover, true);
      listening = false;
    }
    for (const el of document.querySelectorAll(`[${OWNED}]`)) {
      const previous = priorTitles.get(el);
      if (previous && el.getAttribute("title") === previous.applied) {
        if (previous.original) el.setAttribute("title", previous.original);
        else el.removeAttribute("title");
      }
      el.removeAttribute(OWNED);
      priorTitles.delete(el);
    }
    lastRoute = "";
  }
  DS.applyTagExplanations = function () {
    const enabled = !!(DS.state?.settings?.enabled && DS.state?.settings?.showTagExplanations);
    if (!enabled) return cleanup();
    if (!listening) {
      document.addEventListener("pointerover", onHover, true);
      document.addEventListener("focusin", onHover, true);
      listening = true;
    }
    const route = String(location.pathname || "") + String(location.search || "");
    if (route === lastRoute) return;
    lastRoute = route;
    // One bounded initial pass per route; later-mounted tag pickers use event delegation.
    const nodes = document.querySelectorAll("label[for^='include_'],label[for^='exclude_'],input[id^='include_'],input[id^='exclude_'],[data-testid^='TagSuggestionItem-']");
    for (const node of nodes) showHint(node);
    if (editorIsPresent()) {
      for (const node of document.querySelectorAll("button[value],button[aria-label]")) showHint(node);
    }
  };
  DS.isTagExplanationsActive = () => listening;
  DS.removeTagExplanations = cleanup;
})();
}
