(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  // Generation profile behavior is adapted from S.AI Toolkit by OnyxMizuna.
  // S.AI Toolkit is licensed under GPL-3.0.
  // https://github.com/OnyxMizuna/SAI-Toolkit

  const PROFILES_KEY = "generationProfiles";
  const LAST_PROFILE_KEY = "lastGenerationProfile";
  const TOOL_ID = "ds-generation-profile-tools";
  const STATUS_TIMEOUT = 2600;

  let observer = null;
  let applyTimer = null;
  let busy = false;

  function text(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function lower(value) {
    return text(value).toLowerCase();
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function modalCandidates() {
    return Array.from(document.querySelectorAll(
      "[role='dialog'], div.fixed, div[class*='fixed'][class*='left-1/2'], div[class*='fixed'][class*='top-1/2']"
    )).filter(isVisible);
  }

  function findGenerationSettingsModal() {
    return modalCandidates().find(modal => {
      const modalText = lower(modal.textContent);
      const ranges = modal.querySelectorAll("input[type='range']");
      if (!ranges.length) return false;

      return modalText.includes("generation settings") ||
        (modalText.includes("temperature") && (modalText.includes("top p") || modalText.includes("top-p")));
    }) || null;
  }

  function findModelSelectionModal(exclude) {
    return modalCandidates().find(modal => {
      if (modal === exclude) return false;
      const modalText = lower(modal.textContent);
      return modalText.includes("select a model") ||
        modalText.includes("choose model") ||
        modalText.includes("available models");
    }) || null;
  }

  function findSettingsContainer(modal) {
    const firstSlider = modal?.querySelector("input[type='range']");
    if (!firstSlider) return null;

    const preferred = firstSlider.closest(".px-lg, .overflow-y-auto, [class*='overflow-y-auto']");
    if (preferred && modal.contains(preferred)) return preferred;

    let node = firstSlider.parentElement;
    let best = null;
    while (node && node !== modal) {
      if (node.querySelectorAll("input[type='range']").length >= 2) best = node;
      node = node.parentElement;
    }
    return best || modal;
  }

  function findFieldContainer(slider, modal) {
    let node = slider.parentElement;
    let fallback = node;

    while (node && node !== modal) {
      const rangeCount = node.querySelectorAll("input[type='range']").length;
      const nodeText = text(node.textContent);
      if (rangeCount === 1 && nodeText.length > 0 && nodeText.length < 220) return node;
      fallback = node;
      node = node.parentElement;
    }

    return fallback || slider.parentElement;
  }

  function sliderKeyFromText(label, index) {
    const value = lower(label);
    if (value.includes("max token") || value.includes("response length") || value.includes("maximum token")) return "maxTokens";
    if (value.includes("temperature")) return "temperature";
    if (value.includes("top p") || value.includes("top-p") || value.includes("nucleus")) return "topP";
    if (value.includes("top k") || value.includes("top-k")) return "topK";
    if (value.includes("repetition penalty")) return "repetitionPenalty";
    if (value.includes("presence penalty")) return "presencePenalty";
    if (value.includes("frequency penalty")) return "frequencyPenalty";
    return `slider-${index}`;
  }

  function sliderLabel(slider, index, modal) {
    const field = findFieldContainer(slider, modal);
    const candidateTexts = [];

    const aria = slider.getAttribute("aria-label") || slider.getAttribute("name") || slider.id;
    if (aria) candidateTexts.push(aria);

    if (slider.id) {
      const label = modal.querySelector(`label[for='${CSS.escape(slider.id)}']`);
      if (label?.textContent) candidateTexts.push(label.textContent);
    }

    if (field) {
      for (const node of field.querySelectorAll("label, p, span, h3, h4")) {
        if (node.contains(slider)) continue;
        const nodeText = text(node.textContent);
        if (!nodeText || /^[-+]?\d+(?:\.\d+)?%?$/.test(nodeText)) continue;
        if (nodeText.length <= 80) candidateTexts.push(nodeText);
      }
      candidateTexts.push(field.textContent);
    }

    const known = candidateTexts.find(value => {
      const normalized = lower(value);
      return normalized.includes("temperature") ||
        normalized.includes("top p") ||
        normalized.includes("top-p") ||
        normalized.includes("top k") ||
        normalized.includes("top-k") ||
        normalized.includes("max token") ||
        normalized.includes("penalty") ||
        normalized.includes("response length");
    });

    return text(known || candidateTexts[0] || `Setting ${index + 1}`);
  }

  function findCurrentModel(modal) {
    const changeButton = Array.from(modal.querySelectorAll("button")).find(button =>
      lower(button.textContent).includes("change model")
    );

    const scope = changeButton?.parentElement?.parentElement || changeButton?.parentElement || modal;
    if (scope) {
      const pieces = Array.from(scope.querySelectorAll("p, span, strong, h3, h4"))
        .map(node => text(node.textContent))
        .filter(value => value && !/^inference model$/i.test(value) && !/^change model$/i.test(value));
      const likely = pieces.find(value => value.length <= 80 && !/^[\d.]+$/.test(value));
      if (likely) return likely;
    }

    const label = Array.from(modal.querySelectorAll("p, span, div")).find(node =>
      lower(node.textContent) === "inference model"
    );
    if (label?.parentElement) {
      const siblings = Array.from(label.parentElement.querySelectorAll("p, span, strong"))
        .map(node => text(node.textContent))
        .filter(value => value && lower(value) !== "inference model");
      if (siblings[0]) return siblings[0];
    }

    return "";
  }

  function captureCurrentProfile(modal) {
    const sliders = Array.from(modal.querySelectorAll("input[type='range']"));
    if (!sliders.length) return null;

    return {
      model: findCurrentModel(modal),
      controls: sliders.map((slider, index) => {
        const label = sliderLabel(slider, index, modal);
        return {
          key: sliderKeyFromText(label, index),
          label,
          index,
          value: Number(slider.value),
          min: slider.min === "" ? null : Number(slider.min),
          max: slider.max === "" ? null : Number(slider.max),
          step: slider.step === "" ? null : Number(slider.step)
        };
      }),
      updatedAt: Date.now()
    };
  }

  function setNativeInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applySliderValues(modal, profile) {
    const sliders = Array.from(modal.querySelectorAll("input[type='range']"));
    if (!sliders.length || !Array.isArray(profile?.controls)) return 0;

    const current = sliders.map((slider, index) => {
      const label = sliderLabel(slider, index, modal);
      return {
        slider,
        key: sliderKeyFromText(label, index),
        index
      };
    });

    let changed = 0;
    for (const saved of profile.controls) {
      const match = current.find(item => item.key === saved.key) || current.find(item => item.index === saved.index);
      if (!match || !Number.isFinite(Number(saved.value))) continue;
      setNativeInputValue(match.slider, saved.value);
      changed += 1;
    }
    return changed;
  }

  async function readProfiles() {
    const result = await DS.storageGet(PROFILES_KEY);
    const raw = result?.[PROFILES_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw;
  }

  async function writeProfiles(profiles) {
    await DS.storageSet({ [PROFILES_KEY]: profiles });
  }

  async function waitFor(check, timeout = 4200, interval = 100) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = check();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    return null;
  }

  function findModelOption(modal, modelName) {
    const wanted = lower(modelName);
    const candidates = Array.from(modal.querySelectorAll(
      "[role='option'], li, button, [data-testid], div.cursor-pointer, div[tabindex='0']"
    )).filter(isVisible);

    const exact = candidates.filter(node => lower(node.textContent) === wanted);
    if (exact.length) return exact.sort((a, b) => a.textContent.length - b.textContent.length)[0];

    const partial = candidates.filter(node => {
      const nodeText = lower(node.textContent);
      return nodeText.includes(wanted) && nodeText.length < 240;
    });
    return partial.sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
  }

  async function changeModel(modal, modelName) {
    if (!modelName) return { ok: true, changed: false };
    const currentModel = findCurrentModel(modal);
    if (currentModel && lower(currentModel) === lower(modelName)) return { ok: true, changed: false };

    const button = Array.from(modal.querySelectorAll("button")).find(node =>
      lower(node.textContent).includes("change model") || lower(node.getAttribute("aria-label")).includes("model")
    );
    if (!button) return { ok: false, reason: "Change Model button was not found." };

    button.click();
    const modelModal = await waitFor(() => findModelSelectionModal(modal));
    if (!modelModal) return { ok: false, reason: "The model list did not open." };

    const option = findModelOption(modelModal, modelName);
    if (!option) return { ok: false, reason: `Model “${modelName}” is not available.` };

    option.click();
    await new Promise(resolve => setTimeout(resolve, 180));

    const confirmButton = Array.from(modelModal.querySelectorAll("button")).find(node => {
      const nodeText = lower(node.textContent);
      return nodeText === "set model" || nodeText === "select model" || nodeText === "confirm";
    });
    confirmButton?.click();

    await new Promise(resolve => setTimeout(resolve, 450));
    return { ok: true, changed: true };
  }

  function showStatus(host, message, kind = "normal") {
    const status = host.querySelector(".ds-generation-profile-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
    clearTimeout(status._dsTimer);
    status._dsTimer = setTimeout(() => {
      if (status.isConnected) status.textContent = "";
    }, STATUS_TIMEOUT);
  }

  async function populateSelect(select, selectedName = "") {
    const profiles = await readProfiles();
    const names = Object.keys(profiles).sort((a, b) => a.localeCompare(b));
    select.replaceChildren();

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = names.length ? "Select profile" : "No profiles saved";
    select.appendChild(empty);

    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      const model = text(profiles[name]?.model);
      option.textContent = model ? `${name} (${model})` : name;
      select.appendChild(option);
    }

    if (selectedName && profiles[selectedName]) select.value = selectedName;
    return profiles;
  }

  async function applyProfile(modal, host, name) {
    if (busy || !name) return;
    busy = true;
    try {
      const profiles = await readProfiles();
      const profile = profiles[name];
      if (!profile) {
        showStatus(host, "That profile no longer exists.", "error");
        return;
      }

      let activeModal = modal;
      const modelResult = await changeModel(activeModal, profile.model);
      if (modelResult.changed) {
        activeModal = await waitFor(findGenerationSettingsModal, 3200, 100) || activeModal;
      }

      const changed = applySliderValues(activeModal, profile);
      await DS.storageSet({ [LAST_PROFILE_KEY]: name });

      if (!modelResult.ok) {
        showStatus(host, `${changed} settings applied. ${modelResult.reason}`, "warning");
      } else {
        showStatus(host, `Applied “${name}”.`, "success");
      }
    } finally {
      busy = false;
    }
  }

  async function buildTools(modal) {
    if (!modal || modal.querySelector(`#${TOOL_ID}`)) return;

    const container = findSettingsContainer(modal);
    if (!container) return;

    const host = document.createElement("section");
    host.id = TOOL_ID;
    host.className = "ds-generation-profile-tools";
    DS.setSafeMarkup(host, `
      <div class="ds-generation-profile-heading">
        <strong>QoL generation profiles</strong>
        <span>Save and restore the current model and generation sliders.</span>
      </div>
      <div class="ds-generation-profile-row">
        <select class="ds-generation-profile-select" aria-label="Saved generation profile"></select>
        <button type="button" class="ds-generation-profile-apply">Apply</button>
      </div>
      <div class="ds-generation-profile-row">
        <input class="ds-generation-profile-name" type="text" maxlength="60" placeholder="Profile name">
        <button type="button" class="ds-generation-profile-save">Save current</button>
        <button type="button" class="ds-generation-profile-delete">Delete</button>
      </div>
      <div class="ds-generation-profile-status" aria-live="polite"></div>
    `);

    const select = host.querySelector(".ds-generation-profile-select");
    const nameInput = host.querySelector(".ds-generation-profile-name");
    const applyButton = host.querySelector(".ds-generation-profile-apply");
    const saveButton = host.querySelector(".ds-generation-profile-save");
    const deleteButton = host.querySelector(".ds-generation-profile-delete");

    const lastResult = await DS.storageGet(LAST_PROFILE_KEY);
    const lastName = text(lastResult?.[LAST_PROFILE_KEY]);
    await populateSelect(select, lastName);
    if (select.value) nameInput.value = select.value;

    select.addEventListener("change", () => {
      nameInput.value = select.value;
    });

    applyButton.addEventListener("click", () => applyProfile(modal, host, select.value));

    saveButton.addEventListener("click", async () => {
      const name = text(nameInput.value);
      if (!name) {
        showStatus(host, "Enter a profile name first.", "error");
        nameInput.focus();
        return;
      }

      const profile = captureCurrentProfile(findGenerationSettingsModal() || modal);
      if (!profile) {
        showStatus(host, "Generation settings could not be read.", "error");
        return;
      }

      const profiles = await readProfiles();
      const existed = !!profiles[name];
      profiles[name] = {
        ...profile,
        createdAt: profiles[name]?.createdAt || Date.now()
      };
      await writeProfiles(profiles);
      await DS.storageSet({ [LAST_PROFILE_KEY]: name });
      await populateSelect(select, name);
      showStatus(host, existed ? `Updated “${name}”.` : `Saved “${name}”.`, "success");
    });

    deleteButton.addEventListener("click", async () => {
      const name = select.value || text(nameInput.value);
      if (!name) {
        showStatus(host, "Select a profile to delete.", "error");
        return;
      }

      const profiles = await readProfiles();
      if (!profiles[name]) {
        showStatus(host, "That profile no longer exists.", "error");
        return;
      }

      delete profiles[name];
      await writeProfiles(profiles);
      const lastResultNow = await DS.storageGet(LAST_PROFILE_KEY);
      if (lastResultNow?.[LAST_PROFILE_KEY] === name) await DS.storageSet({ [LAST_PROFILE_KEY]: "" });
      nameInput.value = "";
      await populateSelect(select);
      showStatus(host, `Deleted “${name}”.`, "success");
    });

    container.appendChild(host);
  }

  function removeTools() {
    document.querySelectorAll(`#${TOOL_ID}`).forEach(node => node.remove());
  }

  function scheduleApply(delay = 80) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => DS.applyGenerationProfileTools?.(), delay);
  }

  function installObserver() {
    if (observer || !document.documentElement) return;

    observer = new MutationObserver(mutations => {
      const settings = DS.state?.settings || {};
      if (!settings.enabled || !settings.enableGenerationProfiles || DS.shouldDeferToSaiToolkit?.("generation-profiles")) return;

      const relevant = mutations.some(mutation =>
        Array.from(mutation.addedNodes || []).some(node => {
          if (!(node instanceof Element)) return false;
          const nodeText = lower(node.textContent);
          return node.matches?.("[role='dialog'], .fixed") ||
            node.querySelector?.("input[type='range']") ||
            nodeText.includes("generation settings");
        })
      );
      if (relevant) scheduleApply();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function removeObserver() {
    observer?.disconnect();
    observer = null;
    clearTimeout(applyTimer);
  }

  DS.applyGenerationProfileTools = async function applyGenerationProfileTools() {
    const settings = DS.state?.settings || {};
    if (
      !settings.enabled ||
      !settings.enableGenerationProfiles ||
      !DS.isSingleChatPage?.() ||
      DS.shouldDeferToSaiToolkit?.("generation-profiles")
    ) {
      removeTools();
      removeObserver();
      return;
    }

    installObserver();
    const modal = findGenerationSettingsModal();
    if (modal) await buildTools(modal);
  };

  DS.removeGenerationProfileTools = function removeGenerationProfileTools() {
    removeTools();
    removeObserver();
  };
  DS.GENERATION_PROFILES_KEY = PROFILES_KEY;
})();
