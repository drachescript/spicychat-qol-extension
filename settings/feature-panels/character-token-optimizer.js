// Feature-owned Settings panel; remains independent of the Creation Audit checkbox.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("character-token-optimizer")) return;
  const host = document.getElementById("ds-feature-panel-character-token-optimizer");
  if (!host) return;
  const card = document.createElement("section"); card.className = "card"; card.id = "characterTokenOptimizerCard";
  const heading = document.createElement("h2"); heading.textContent = "Character Token Optimizer";
  const row = document.createElement("label"); row.className = "row";
  const check = document.createElement("input"); check.type = "checkbox"; check.id = "enableCharacterTokenOptimizer";
  const text = document.createElement("span"); text.textContent = "Show Optimize Tokens in my chatbot editor";
  const hint = document.createElement("p"); hint.className = "hint";
  hint.textContent = "Optional, local and manual. Estimates tokens by field, highlights exact duplicate text and safe formatting cleanup, and previews each change before applying it to the editor. It never uses an AI API, changes your bot on its own or publishes anything. Actual SpicyChat token counts may differ.";
  row.append(check, text); card.append(heading, row, hint); host.replaceWith(card);
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers.enableCharacterTokenOptimizer = () => !!document.getElementById("enableCharacterTokenOptimizer")?.checked;
  loaders.enableCharacterTokenOptimizer = settings => { check.checked = !!settings.enableCharacterTokenOptimizer; };
})();
