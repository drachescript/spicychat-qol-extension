(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function inputEvent(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  DS.clickCheckboxById = function clickCheckboxById(id, wantedState) {
    const input = document.getElementById(id);
    if (!input || input.type !== "checkbox") return false;

    if (input.checked !== wantedState) {
      DS.realClick(input);
      inputEvent(input);
      return true;
    }

    return false;
  };

  DS.setNarrowTag = async function setNarrowTag(tag, mode) {
    const clean = String(tag || "").trim();
    if (!clean) return false;

    const includeId = `include_${clean}`;
    const excludeId = `exclude_${clean}`;

    if (mode === "include") {
      const changedExclude = DS.clickCheckboxById(excludeId, false);
      if (changedExclude) await DS.sleep?.(80);
      const changedInclude = DS.clickCheckboxById(includeId, true);
      return changedExclude || changedInclude;
    }

    if (mode === "exclude") {
      const changedInclude = DS.clickCheckboxById(includeId, false);
      if (changedInclude) await DS.sleep?.(80);
      const changedExclude = DS.clickCheckboxById(excludeId, true);
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

    for (const input of DS.qsa("input[type='checkbox'][id^='include_'], input[type='checkbox'][id^='exclude_']")) {
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

    for (const tag of settings.includeTags || []) {
      if (await DS.setNarrowTag(tag, "include")) changed++;
    }

    for (const tag of settings.excludeTags || []) {
      if (await DS.setNarrowTag(tag, "exclude")) changed++;
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
    if (DS.isSingleChatPage?.() || DS.isChatListPage?.() || DS.isBotProfilePage?.()) return null;

    const direct = document.querySelector("[data-translate-key='chatbotFilters:filterByTag.title']");
    if (direct && !direct.closest("#ds-qol-panel")) {
      return direct.closest("div[class*='justify-between']") || direct.parentElement;
    }

    const title = DS.qsa("span, p, h2, h3")
      .find(el => !el.closest("#ds-qol-panel") && DS.normalize(el.textContent) === "narrow by tag");

    if (!title) return null;

    return title.closest("div[class*='justify-between']") || title.parentElement;
  }

  DS.addTagTemplateButton = function addTagTemplateButton() {
    const { settings } = DS.state;

    if (!settings.enabled || settings.showTagTemplateButton === false) {
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
