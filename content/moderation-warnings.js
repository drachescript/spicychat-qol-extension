(() => {
  "use strict";

  // Community-reported moderation triggers from the SpicyChat Discord thread.
  // Advisory only: the thread itself contains inconsistent reports and false positives.
  // Follow-up posts specifically contradicted plain number words and "class" as standalone
  // triggers, while "minor" was demonstrated as the actual cause in that Lorebook example.
  // Bypass/loophole instructions from the thread are intentionally not represented here.
  const GROUPS = {
    "Underage": [
      "child", "children", "childhood", "young", "baby", "boy", "girl", "short", "small", "petite", "tiny",
      "loli", "minor", "kid", "kids", "kitten", "underage", "teen", "innocent", "infant", "little",
      "school", "teacher", "student", "adolescent", "juvenile", "brat", "youth",
      "backpack", "runaway", "insecure", "fragile", "uniform", "prodigy",
      "pupil", "born", "birth", "hatchling"
    ],
    "Incest": [
      "mom", "dad", "sister", "brother", "cousin", "uncle", "aunt", "mother", "father",
      "grandpa", "grandparent", "grandparents", "daughter", "son", "relationship", "adopt", "family", "paternal", "twin",
      "sibling", "relative", "king", "queen", "prince", "princess", "lineage", "bloodline"
    ],
    "Bestiality": [
      "dog", "horse", "bull", "minotaur", "beast", "monster", "creature", "animal", "farm",
      "bred", "breed", "breeding", "tail", "fur", "paw"
    ],
    "Abuse": [
      "rape", "force", "kill", "murder", "torture", "abuse", "abused", "violent", "violence", "violently", "trauma", "tremble",
      "intimidate", "intimidated", "intimidating", "intimidation", "push"
    ],
    "Other": ["god", "purity"]
  };

  // A follow-up in the source thread explicitly clarified that plain number words are not
  // standalone triggers. Keep age phrasing available as context for broad terms, but do not
  // warn on one/two/three/etc by themselves.
  const AGE_WORDS = new Set();

  const BALANCED_CONTEXT_ONLY = new Set([
    "young", "short", "small", "petite", "tiny", "innocent", "little",
    "school", "teacher", "student", "backpack", "insecure", "fragile", "uniform", "prodigy", "pupil",
    "born", "birth", "relationship", "family", "lineage", "bloodline",
    "dog", "horse", "bull", "beast", "monster", "creature", "animal", "farm", "tail", "fur", "paw",
    "god", "purity", "push", "tremble", "trauma"
  ]);

  const STRONG_CONTEXT_RE = /\b(?:minor|underage|child(?:ren)?|kid(?:s)?|teen(?:ager)?s?|infant|adolescent|juvenile|loli|incest|mom|dad|mother|father|sister|brother|daughter|son|sibling|rape|sexual|sex|nsfw|breed(?:ing)?|bred|abuse|torture|murder|violent|violence)\b/iu;
  const AGE_CONTEXT_RE = /\b(?:age(?:d)?\s+|at\s+age\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[1-9]|1[0-7])(?:\s*[-–—]?\s*(?:year|years|yr|yrs)\s*[-–—]?\s*old|\s*y\/?o\b)/iu;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseCustomTerms(value) {
    const rows = String(value || "").split(/\n+/);
    const seen = new Set();
    const output = [];
    for (const rawRow of rows) {
      const row = clean(rawRow);
      if (!row) continue;
      const parts = row.split("|");
      const term = clean(parts.shift()).slice(0, 80);
      const group = clean(parts.join("|") || "Custom").slice(0, 40) || "Custom";
      const key = term.toLowerCase();
      if (!term || seen.has(key)) continue;
      seen.add(key);
      output.push({ word: term, group, custom: true });
      if (output.length >= 200) break;
    }
    return output;
  }

  function makeCompiledTerm(group, word, custom = false) {
    const escaped = String(word || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return {
      group,
      word,
      custom,
      regex: new RegExp(`\\b${escaped}\\b`, "giu")
    };
  }

  const COMMUNITY_COMPILED = Object.entries(GROUPS).flatMap(([group, words]) => words.map(word => makeCompiledTerm(group, word, false)));
  let customCompileCacheSource = null;
  let customCompileCache = [];

  window.DragonScriptModerationWarningData = {
    groups: JSON.parse(JSON.stringify(GROUPS)),
    ageWords: [...AGE_WORDS],
    balancedContextOnly: [...BALANCED_CONTEXT_ONLY],
    parseCustomTerms
  };

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  function compiledTerms() {
    const source = String(DS.state?.settings?.creatorModerationWarningCustomTerms || "");
    if (source !== customCompileCacheSource) {
      customCompileCacheSource = source;
      customCompileCache = parseCustomTerms(source).map(item => makeCompiledTerm(item.group, item.word, true));
    }
    return COMMUNITY_COMPILED.concat(customCompileCache);
  }

  function normalizeIgnoredTerms(value) {
    return new Set(String(value || "")
      .split(/[\n,;]+/)
      .map(item => clean(item).toLowerCase())
      .filter(Boolean));
  }

  function settingsMode() {
    return DS.state?.settings?.creatorModerationWarningMode === "all" ? "all" : "balanced";
  }

  function ignoredTerms() {
    return normalizeIgnoredTerms(DS.state?.settings?.creatorModerationWarningIgnoredTerms || "");
  }

  function pathMode() {
    const path = location.pathname;
    if (/^\/lorebook\/(?:create|edit|[^/]+)/i.test(path)) return "lorebook";
    if (/^\/chatbot\/(?:create|edit|[^/]+)/i.test(path)) return "chatbot";
    return "";
  }

  function featureEnabledForPage() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.creatorModerationWarnings) return false;
    const mode = pathMode();
    if (mode === "lorebook") return true;
    if (mode === "chatbot") return !!settings.creatorModerationWarningsChatbots;
    return false;
  }

  function shouldIgnoreField(field) {
    if (!field || field.closest("#ds-qol-panel, .ds-moderation-warning")) return true;
    if (field.disabled || field.readOnly) return true;
    if (field.matches("input[type='search'], input[type='password'], input[type='email'], input[type='url']")) return true;
    if (String(field.id || "").startsWith("ds-")) return true;

    const placeholder = String(field.getAttribute("placeholder") || "").toLowerCase();
    if (placeholder.includes("search")) return true;
    return false;
  }

  function editableFields() {
    return [...document.querySelectorAll("textarea, input[type='text'], [contenteditable='true']")]
      .filter(field => !shouldIgnoreField(field));
  }

  function fieldText(field) {
    if (!field) return "";
    if (field.matches("input, textarea")) return String(field.value || "");
    return String(field.innerText || field.textContent || "");
  }

  function hasNearbyStrongContext(text, index, length) {
    const start = Math.max(0, index - 80);
    const end = Math.min(text.length, index + length + 80);
    return STRONG_CONTEXT_RE.test(text.slice(start, end));
  }

  function ageWordUsedAsAge(text, index, length) {
    const start = Math.max(0, index - 24);
    const end = Math.min(text.length, index + length + 28);
    return AGE_CONTEXT_RE.test(text.slice(start, end));
  }

  function scanText(text) {
    const input = String(text || "");
    if (!input.trim()) return [];

    const mode = settingsMode();
    const ignored = ignoredTerms();
    const seen = new Set();
    const matches = [];

    for (const item of compiledTerms()) {
      if (ignored.has(item.word.toLowerCase())) continue;
      item.regex.lastIndex = 0;
      let hit;
      while ((hit = item.regex.exec(input))) {
        const actual = clean(hit[0] || item.word);
        const normalized = actual.toLowerCase();
        if (!normalized || ignored.has(normalized)) continue;

        let contextual = false;
        if (mode === "balanced" && !item.custom) {
          if (AGE_WORDS.has(item.word)) {
            if (!ageWordUsedAsAge(input, hit.index, actual.length)) continue;
            contextual = true;
          } else if (BALANCED_CONTEXT_ONLY.has(item.word)) {
            if (!hasNearbyStrongContext(input, hit.index, actual.length) && !ageWordUsedAsAge(input, hit.index, actual.length)) continue;
            contextual = true;
          }
        }

        const key = `${item.group}:${normalized}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ group: item.group, word: actual, source: item.word, contextual, custom: !!item.custom });
      }
    }

    return matches;
  }

  function warningHostFor(field) {
    const direct = field.parentElement;
    if (!direct) return null;
    if (direct.classList.contains("ds-moderation-warning-wrap")) return direct;

    const wrap = document.createElement("div");
    wrap.className = "ds-moderation-warning-wrap";
    field.insertAdjacentElement("afterend", wrap);
    return wrap;
  }

  function appendTermSummary(warning, matches) {
    const words = [...new Set(matches.map(match => match.word))];
    const visible = words.slice(0, 8);
    const terms = document.createElement("span");
    terms.className = "ds-moderation-warning-terms";
    terms.textContent = visible.join(", ");
    warning.appendChild(terms);

    if (words.length > visible.length) {
      const details = document.createElement("details");
      details.className = "ds-moderation-warning-details";
      const summary = document.createElement("summary");
      summary.textContent = `Show ${words.length - visible.length} more`;
      const all = document.createElement("span");
      all.textContent = words.join(", ");
      details.append(summary, all);
      warning.appendChild(details);
    }

    const groups = [...new Set(matches.map(match => match.group))];
    const groupLine = document.createElement("span");
    groupLine.className = "ds-moderation-warning-groups";
    groupLine.textContent = `Reported categories: ${groups.join(" · ")}`;
    warning.appendChild(groupLine);
  }

  function renderWarning(field) {
    if (!field?.isConnected) return;
    const existing = field.parentElement?.querySelector?.(":scope > .ds-moderation-warning-wrap");
    const matches = scanText(fieldText(field));

    if (!matches.length) {
      existing?.remove();
      field.removeAttribute("data-ds-moderation-warned");
      return;
    }

    const host = existing || warningHostFor(field);
    if (!host) return;

    const uniqueCount = new Set(matches.map(match => match.word.toLowerCase())).size;
    const warning = document.createElement("div");
    warning.className = "ds-moderation-warning";
    warning.setAttribute("role", "status");

    const title = document.createElement("strong");
    title.textContent = `This wording might trigger moderation (${uniqueCount})`;
    warning.appendChild(title);
    appendTermSummary(warning, matches);

    const note = document.createElement("small");
    note.textContent = settingsMode() === "balanced"
      ? "Community-reported warning only. Balanced mode ignores very broad standalone words unless they appear in a stronger context; SpicyChat moderation can still depend on surrounding text."
      : "Community-reported warning only. All reported terms mode is intentionally broad and can produce false positives; SpicyChat moderation can depend on context.";
    warning.appendChild(note);

    host.replaceChildren(warning);
    field.dataset.dsModerationWarned = "1";
  }

  function renderLorebookListWarnings() {
    if (!/^\/lorebook\/edit\/[^/]+\/entries\/?$/i.test(location.pathname)) {
      document.querySelectorAll(".ds-moderation-list-warning").forEach(el => el.remove());
      return;
    }

    const header = document.querySelector("[data-testid='EntriesListServer-Header']");
    const root = header?.parentElement;
    if (!root) return;

    const active = new Set();
    for (const row of [...root.querySelectorAll("button[type='button']")]) {
      const text = [...row.querySelectorAll("p")]
        .filter(p => clean(p.textContent).length > 30)
        .sort((a, b) => clean(b.textContent).length - clean(a.textContent).length)[0];
      if (!text) continue;
      const matches = scanText(text.textContent);
      const words = [...new Set(matches.map(match => match.word))];
      let warning = row.querySelector(":scope .ds-moderation-list-warning");
      if (!words.length) {
        warning?.remove();
        continue;
      }
      if (!warning) {
        warning = document.createElement("div");
        warning.className = "ds-moderation-list-warning";
        text.insertAdjacentElement("afterend", warning);
      }
      const visible = words.slice(0, 5);
      warning.textContent = `⚠ Might trigger moderation: ${visible.join(", ")}${words.length > visible.length ? ` +${words.length - visible.length}` : ""}`;
      warning.title = `${words.join(", ")}\nCommunity-reported warning only. ${settingsMode() === "balanced" ? "Balanced mode suppresses broad standalone terms." : "All reported terms mode is intentionally broad."}`;
      active.add(warning);
    }

    document.querySelectorAll(".ds-moderation-list-warning").forEach(el => {
      if (!active.has(el)) el.remove();
    });
  }

  function cleanup() {
    DS.state.creatorModerationWarningsWasActive = false;
    document.querySelectorAll(".ds-moderation-warning-wrap").forEach(el => el.remove());
    document.querySelectorAll("[data-ds-moderation-warned]").forEach(el => el.removeAttribute("data-ds-moderation-warned"));
    document.querySelectorAll(".ds-moderation-list-warning").forEach(el => el.remove());
  }

  let scanTimer = null;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => DS.applyCreatorModerationWarnings?.(), 140);
  }

  DS.applyCreatorModerationWarnings = function applyCreatorModerationWarnings() {
    if (!featureEnabledForPage()) {
      cleanup();
      return;
    }

    DS.state.creatorModerationWarningsWasActive = true;
    for (const field of editableFields()) renderWarning(field);
    renderLorebookListWarnings();
  };

  DS.removeCreatorModerationWarnings = cleanup;
  DS.getCreatorModerationTriggerGroups = () => {
    const groups = JSON.parse(JSON.stringify(GROUPS));
    for (const item of parseCustomTerms(DS.state?.settings?.creatorModerationWarningCustomTerms || "")) {
      (groups[item.group] ||= []).push(item.word);
    }
    return groups;
  };
  DS.scanCreatorModerationText = scanText;

  document.addEventListener("input", event => {
    const field = event.target?.closest?.("textarea, input[type='text'], [contenteditable='true']");
    if (!field || shouldIgnoreField(field) || !featureEnabledForPage()) return;
    scheduleScan();
  }, true);

  const observer = new MutationObserver(mutations => {
    if (!featureEnabledForPage()) return;
    const relevant = mutations.some(mutation => [...mutation.addedNodes].some(node => {
      if (!(node instanceof Element)) return false;
      return node.matches?.("textarea, input[type='text'], [contenteditable='true']") ||
        !!node.querySelector?.("textarea, input[type='text'], [contenteditable='true']");
    }));
    if (relevant) scheduleScan();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
