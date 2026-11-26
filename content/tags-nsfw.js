if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function isTagListing() {
    const page = DS.getPageState?.();
    return page?.routeType === "listing";
  }
  function nativeFilterScope() {
    if (!isTagListing()) return null;
    const header = findTagFilterHeader();
    if (!header) return null;
    for (let root = header, depth = 0; root && depth < 6; root = root.parentElement, depth++) {
      if (root === document.body || root.id === "root" || root.matches?.("main,[role='main'],form") || root.closest?.("form,[role='listbox'],[role='option'],[data-testid*='LorebookPicker' i],[data-testid*='AttachLorebook' i]")) break;
      if (root.querySelector(tagInclude) && root.querySelector(tagExclude)) return root;
    }
    return null;
  }

  function inputEvent(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  DS.clickCheckboxById = function clickCheckboxById(id, wantedState, scope = nativeFilterScope()) {
    const input = document.getElementById(id);
    if (!isTagListing() || !scope?.isConnected || !input || !scope.contains(input) || input.type !== "checkbox" || input.closest?.("form,[role='listbox'],[role='option'],[data-testid*='LorebookPicker' i],[data-testid*='AttachLorebook' i]")) return false;

    if (input.checked !== wantedState) {
      DS.realClick(input);
      inputEvent(input);
      return true;
    }

    return false;
  };

  DS.setNarrowTag = async function setNarrowTag(tag, mode, scope = nativeFilterScope()) {
    const clean = String(tag || "").trim();
    if (!clean || !isTagListing() || !scope?.isConnected) return false;
    const route = location.href;

    const includeId = `include_${clean}`;
    const excludeId = `exclude_${clean}`;

    if (mode === "include") {
      const changedExclude = DS.clickCheckboxById(excludeId, false, scope);
      if (changedExclude) await DS.sleep?.(80);
      if (location.href !== route) return changedExclude;
      const changedInclude = DS.clickCheckboxById(includeId, true, scope);
      return changedExclude || changedInclude;
    }

    if (mode === "exclude") {
      const changedInclude = DS.clickCheckboxById(includeId, false, scope);
      if (changedInclude) await DS.sleep?.(80);
      if (location.href !== route) return changedInclude;
      const changedExclude = DS.clickCheckboxById(excludeId, true, scope);
      return changedInclude || changedExclude;
    }

    return false;
  };


  function cleanTagId(id, prefix) {
    return String(id || "")
      .replace(new RegExp(`^${prefix}_`), "")
      .trim();
  }

  DS.readCurrentTagTemplate = function readCurrentTagTemplate() {
    const includeTags = [];
    const excludeTags = [];

    const scope = nativeFilterScope();
    if (!scope) return { includeTags, excludeTags };
    for (const input of DS.qsa("input[type='checkbox'][id^='include_'], input[type='checkbox'][id^='exclude_']", scope)) {
      if (!input.checked) continue;

      if (input.id.startsWith("include_")) {
        includeTags.push(cleanTagId(input.id, "include"));
      } else if (input.id.startsWith("exclude_")) {
        excludeTags.push(cleanTagId(input.id, "exclude"));
      }
    }

    return {
      includeTags: DS.uniqueClean(includeTags),
      excludeTags: DS.uniqueClean(excludeTags)
    };
  };

  DS.saveCurrentTagTemplate = async function saveCurrentTagTemplate() {
    if (!nativeFilterScope()) return 0;
    const current = DS.readCurrentTagTemplate();
    const settings = {
      ...DS.state.settings,
      includeTags: current.includeTags,
      excludeTags: current.excludeTags
    };

    DS.state.settings = settings;
    await DS.storageSet({ settings });

    return current.includeTags.length + current.excludeTags.length;
  };

  DS.applySavedTagTemplate = async function applySavedTagTemplate() {
    const { settings } = DS.state;
    let changed = 0;
    const route = location.href;
    const scope = nativeFilterScope();
    if (!scope) return changed;

    for (const tag of settings.includeTags || []) {
      if (location.href !== route) return changed;
      if (await DS.setNarrowTag(tag, "include", scope)) changed++;
    }

    for (const tag of settings.excludeTags || []) {
      if (location.href !== route) return changed;
      if (await DS.setNarrowTag(tag, "exclude", scope)) changed++;
    }

    return changed;
  };

  DS.applyAutoTags = async function applyAutoTags() {
    const { settings } = DS.state;
    if (!settings.enabled || !settings.autoTags) return;

    await DS.applySavedTagTemplate();
  };

  function findTagFilterHeader() {
    // This control only exists on listing/filter pages. Avoid a wide text scan
    // on chats, chat lists, and bot profiles where the header cannot exist.
    if (!isTagListing()) return null;

    const direct = document.querySelector("[data-translate-key='chatbotFilters:filterByTag.title']");
    if (direct && !direct.closest("#ds-qol-panel")) {
      return direct.closest("div[class*='justify-between']") || direct.parentElement;
    }

    const title = DS.qsa("span, p, h2, h3")
      .find(el => !el.closest("#ds-qol-panel") && DS.normalize(el.textContent) === "narrow by tag");

    if (!title) return null;

    return title.closest("div[class*='justify-between']") || title.parentElement;
  }

  // Presentation-only enhancement. Never move React-owned rows or change
  // their checked state. Unknown native layouts fail open.
  const tagInclude = "input[type='checkbox'][id^='include_']";
  const tagExclude = "input[type='checkbox'][id^='exclude_']";
  let group = null;
  let lastProbeRevision = -1;
  let lastProbeUrl = "";
  let expanded = false;
  const rowPair = row => {
    const includes = row.querySelectorAll(tagInclude);
    const excludes = row.querySelectorAll(tagExclude);
    if (includes.length !== 1 || excludes.length !== 1) return false;
    return includes[0].id.slice(8) === excludes[0].id.slice(8);
  };
  function findTagRows() {
    // Start from the native identifiers (also used by the tag-template code).
    // A row container must contain only verified one-tag rows.
    const scope = nativeFilterScope();
    if (!scope) return null;
    const first = scope.querySelector(tagInclude);
    if (!first || first.closest("#ds-qol-panel")) return null;
    for (let parent = first.parentElement, depth = 0; parent && scope.contains(parent) && depth < 7; parent = parent.parentElement, depth++) {
      // At least two peer rows distinguish the list from a nested wrapper
      // around a single tag. A lone result is already easy to reach.
      if (parent.children.length >= 2 && Array.from(parent.children).every(rowPair)) {
        if (parent.closest("#ds-qol-panel") || parent === document.body) return null;
        const style = getComputedStyle(parent);
        if (!["block", "flex"].includes(style.display) || (style.display === "flex" && style.flexDirection !== "column")) return null;
        if (Array.from(parent.children).some(row => row.style.position === "absolute" || row.style.transform)) return null;
        return parent;
      }
    }
    return null;
  }
  function findNativeTagSearch(list) {
    const selector = 'input[type="search"], input[placeholder*="search tags" i]';
    for (let parent = list.parentElement, depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
      // Never use the unrelated main chatbot search field.
      const native = parent.querySelector('input[placeholder*="search tags" i]');
      if (native) return native;
      if (parent.querySelector("[data-translate-key='chatbotFilters:filterByTag.title']")) return parent.querySelector(selector);
    }
    return null;
  }
  function refreshExcludedGroup(filterChanged = false) {
    if (!group) return;
    const { list, button, search, localSearch } = group;
    const query = String(search?.value || "").trim().toLowerCase();
    if (localSearch && filterChanged) {
      for (const row of list.children) {
        const name = row.querySelector(tagInclude)?.id.slice(8) || "";
        const match = !query || `${name} ${row.textContent}`.toLowerCase().includes(query);
        row.classList.toggle("ds-tag-search-hidden", !match);
      }
    }
    // Searching is an explicit request to see matching tags, including
    // excluded ones. Restore the user's collapse choice when search clears.
    const showExcluded = expanded || !!query;
    const count = list.querySelectorAll(`${tagExclude}:checked`).length;
    const label = `${showExcluded ? "▾" : "▸"} Excluded tags (${count})`;
    if (button.textContent !== label) button.textContent = label;
    if (button.hidden !== (count === 0)) button.hidden = count === 0;
    if (button.disabled !== !!query) button.disabled = !!query;
    const title = query ? "Excluded tags are shown while searching" : "Show or hide excluded tags";
    if (button.title !== title) button.title = title;
    if (button.getAttribute("aria-expanded") !== String(showExcluded)) button.setAttribute("aria-expanded", String(showExcluded));
    list.classList.toggle("ds-excluded-tags-collapsed", !showExcluded);
  }
  DS.hasGroupedExcludedTags = () => !!group;
  DS.removeExcludedTagGrouping = function removeExcludedTagGrouping() {
    if (group) {
      group.list.removeEventListener("change", group.change);
      group.list.classList.remove("ds-grouped-tag-rows", "ds-excluded-tags-collapsed");
      for (const row of group.list.children) row.classList.remove("ds-tag-search-hidden");
      group.search?.removeEventListener("input", group.searchChange);
      group.search?.removeEventListener("change", group.searchChange);
      group.tools.remove();
      group = null;
    }
    lastProbeRevision = -1;
    lastProbeUrl = "";
    expanded = false;
  };
  DS.applyExcludedTagGrouping = function applyExcludedTagGrouping() {
    if (!isTagListing() || !DS.state.settings.enabled || !DS.state.settings.groupExcludedTags || !CSS.supports("selector(:has(input:checked))")) {
      DS.removeExcludedTagGrouping();
      return;
    }
    const revision = Number(DS.state.domRevision || 0);
    const url = location.href;
    if (lastProbeRevision === revision && lastProbeUrl === url && (!group || (group.list.isConnected && group.tools.isConnected && group.search.isConnected))) {
      if (group) refreshExcludedGroup();
      return;
    }
    const list = findTagRows();
    if (!list || group?.list !== list || !group?.tools.isConnected || !group?.search.isConnected) {
      const wasExpanded = lastProbeUrl === url && expanded;
      DS.removeExcludedTagGrouping();
      expanded = wasExpanded;
      if (list?.parentElement) {
        const tools = document.createElement("div");
        tools.className = "ds-tag-filter-tools";
        tools.dataset.dsOwned = "1";
        const nativeSearch = findNativeTagSearch(list);
        const search = nativeSearch || document.createElement("input");
        if (!nativeSearch) {
          search.type = "search";
          search.className = "ds-loaded-tag-search";
          search.placeholder = "Search loaded tags";
          search.setAttribute("aria-label", "Search loaded tags");
          search.autocomplete = "off";
          tools.append(search);
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ds-excluded-tags-toggle";
        button.dataset.dsOwned = "1";
        button.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation();
          expanded = !expanded;
          refreshExcludedGroup();
        });
        const change = () => refreshExcludedGroup();
        const searchChange = () => refreshExcludedGroup(true);
        group = { list, button, tools, change, search, searchChange, localSearch: !nativeSearch };
        list.classList.add("ds-grouped-tag-rows");
        list.addEventListener("change", change);
        search.addEventListener("input", searchChange);
        search.addEventListener("change", searchChange);
        tools.append(button);
        list.before(tools);
      }
    }
    lastProbeRevision = revision;
    lastProbeUrl = url;
    refreshExcludedGroup(true);
  };

  DS.addTagTemplateButton = function addTagTemplateButton() {
    const { settings } = DS.state;

    if (!isTagListing() || !settings.enabled || settings.showTagTemplateButton === false) {
      DS.qsa(".ds-tag-template-button").forEach(button => button.remove());
      return;
    }

    // The button is persistent. Avoid rescanning the entire listing/filter DOM
    // on every cosmetic pass once it is already mounted.
    if (document.querySelector(".ds-tag-template-button")) return;

    const header = findTagFilterHeader();
    if (!header || header.querySelector(".ds-tag-template-button")) return;

    const reset = header.querySelector("button[data-role='reset']") ||
      DS.qsa("button", header).find(button => DS.normalize(button.textContent) === "reset");

    if (!reset) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-tag-template-button";
    button.textContent = "Copy";
    button.title = "Apply the SpicyChat QoL saved tag template";
    button.setAttribute("aria-label", "Apply saved tag template");

    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      const hasSavedTemplate =
        (DS.state.settings.includeTags || []).length > 0 ||
        (DS.state.settings.excludeTags || []).length > 0;

      if (!hasSavedTemplate) {
        const saved = await DS.saveCurrentTagTemplate();
        button.textContent = saved ? "Saved" : "No tags";
      } else {
        const changed = await DS.applySavedTagTemplate();
        button.textContent = changed ? "Copied" : "No change";
      }
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = "Copy";
      }, 1200);
    });

    reset.insertAdjacentElement("afterend", button);
  };

  DS.findGlobalNsfwLabel = function findGlobalNsfwLabel() {
    for (const label of DS.qsa("label")) {
      const input = label.querySelector("input[type='checkbox'].sr-only.peer");
      const text = DS.normalize(label.textContent);
      const hasSwitchTrack = !!label.querySelector("div[class*='rounded-full']");
      const isNarrowTag = !!label.getAttribute("for")?.includes("NSFW");

      if (input && hasSwitchTrack && text === "nsfw" && !isNarrowTag) return label;
    }

    return null;
  };

  DS.getSwitchVisualState = function getSwitchVisualState(label) {
    const track = label?.querySelector("div[class*='rounded-full']");
    const knob = label?.querySelector("span[class*='rounded-full']");
    const input = label?.querySelector("input[type='checkbox']");

    const trackClass = String(track?.className || "");
    const knobClass = String(knob?.className || "");

    if (trackClass.includes("bg-blue") || knobClass.includes("translate-x-[21px]")) return true;
    if (trackClass.includes("bg-gray") || knobClass.includes("translate-x-[1px]")) return false;

    return !!input?.checked;
  };

  DS.setGlobalNsfwSwitch = function setGlobalNsfwSwitch() {
    const { settings } = DS.state;
    if (!settings.enabled) return;
    if (!["on", "off"].includes(settings.globalNsfwMode)) return;

    const label = DS.findGlobalNsfwLabel();
    if (!label) return;

    const wanted = settings.globalNsfwMode === "on";
    const current = DS.getSwitchVisualState(label);

    if (current !== wanted) DS.realClick(label);
  };
})();

}
