// Feature-owned options helpers: mini-panel. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function previewClamp(number, min, max) {
  return Math.max(min, Math.min(max, Number(number) || 0));
}

function setPreviewShown(id, shown) {
  const el = $(id);
  if (!el) return;
  el.hidden = !shown;
  el.style.display = shown ? "" : "none";
}

function previewComposerTop(preview) {
  const composer = preview?.querySelector(".mini-panel-preview-composer");
  if (!preview || !composer || composer.hidden || getComputedStyle(composer).display === "none") {
    return preview?.clientHeight || 430;
  }

  const previewRect = preview.getBoundingClientRect();
  const composerRect = composer.getBoundingClientRect();
  if (!composerRect.width || !composerRect.height) return preview.clientHeight || 430;
  return composerRect.top - previewRect.top;
}

function previewPanelBounds(preview, panel) {
  const margin = 12;
  const maxX = Math.max(margin, preview.clientWidth - panel.offsetWidth - margin);
  const composerTop = previewComposerTop(preview);
  const maxY = Math.max(
    margin,
    Math.min(
      preview.clientHeight - panel.offsetHeight - margin,
      composerTop - panel.offsetHeight - margin
    )
  );

  return { margin, maxX, maxY };
}

function positionMiniPanelPreview() {
  const preview = $("miniPanelPreview");
  const panel = $("miniPanelPreviewPanel");
  if (!preview || !panel) return;

  const placement = value("quickPanelPlacement", "bottom-right");
  const mode = value("miniPanelPreviewMode", "chat");
  const composer = preview.querySelector(".mini-panel-preview-composer");
  const composerHeight = mode === "chat" ? (composer?.offsetHeight || 42) : 0;
  const margin = 12;

  panel.style.left = "auto";
  panel.style.right = "auto";
  panel.style.top = "auto";
  panel.style.bottom = "auto";

  if (placement === "custom") {
    const { maxX, maxY } = previewPanelBounds(preview, panel);
    const xPercent = previewClamp(value("quickPanelCustomXPercent", "70"), 0, 100);
    const yPercent = previewClamp(value("quickPanelCustomYPercent", "12"), 0, 100);
    panel.style.left = `${(maxX * xPercent) / 100}px`;
    panel.style.top = `${(maxY * yPercent) / 100}px`;
    return;
  }

  if (placement === "sidebar-below-blocked-creators") {
    panel.style.left = `${margin}px`;
    panel.style.top = "64px";
    return;
  }

  if (placement.includes("right")) panel.style.right = `${margin}px`;
  if (placement.includes("left")) panel.style.left = `${margin}px`;
  if (placement.includes("top")) panel.style.top = "58px";
  if (placement.includes("bottom")) panel.style.bottom = `${composerHeight + 26}px`;
}

function renderMiniPanelPreview() {
  const preview = $("miniPanelPreview");
  const panel = $("miniPanelPreviewPanel");
  const body = $("miniPanelPreviewBody");
  if (!preview || !panel || !body) return;

  const mode = value("miniPanelPreviewMode", "chat");
  const width = previewClamp(value("quickPanelWidth", "280"), 200, 440);
  const scale = previewClamp(value("quickPanelUiScale", "100"), 80, 125) / 100;
  const maxHeight = previewClamp(value("quickPanelMaxHeightPercent", "80"), 25, 95);

  const maxVisualHeight = Math.max(150, (preview.clientHeight * maxHeight) / 100);
  panel.style.width = `${Math.min(width, Math.max(200, preview.clientWidth - 24))}px`;
  panel.style.setProperty("--preview-scale", String(scale));
  panel.style.maxHeight = `${maxVisualHeight}px`;
  body.style.maxHeight = `${Math.max(90, maxVisualHeight - 42)}px`;

  setPreviewShown("miniPanelPreviewChatScene", mode === "chat");
  setPreviewShown("miniPanelPreviewChatsScene", mode === "chats");
  setPreviewShown("miniPanelPreviewListingScene", mode === "listing");

  const previewStatus = $("miniPanelPreviewStatus");
  const previewStatusParts = [];

  if (checked("quickPanelStatusShowOpened", true)) {
    previewStatusParts.push("350 opened stored");
  }

  if (checked("quickPanelStatusShowBlocked", true)) {
    previewStatusParts.push("25 blocked");
  }

  if (mode === "chat") previewStatusParts.push("3 personas saved");
  if (mode === "chats") previewStatusParts.push("20 chats visible");
  if (mode === "listing") previewStatusParts.push("50 visible", "12 hidden");

  if (previewStatus) {
    previewStatus.textContent = `${previewStatusParts.join(". ")}.`;
  }

  setPreviewShown("miniPanelPreviewStatus", checked("quickPanelShowStatus", true));
  setPreviewShown("miniPanelPreviewMessageCount", mode === "chat" && checked("quickPanelShowLoadedMessageCount"));
  setPreviewShown("miniPanelPreviewOptions", checked("quickPanelShowOptions", true));
  setPreviewShown("miniPanelPreviewFill", mode === "listing" && checked("quickPanelShowFillNow"));
  setPreviewShown("miniPanelPreviewSmartFilters", mode === "listing" && checked("quickPanelShowSmartFilterPins"));
  setPreviewShown("miniPanelPreviewSearch", mode === "chats" && checked("quickPanelShowChatSearch"));
  setPreviewShown("miniPanelPreviewSort", mode === "chats" && checked("quickPanelShowChatSort"));
  setPreviewShown("miniPanelPreviewScan", mode === "chats" && checked("quickPanelShowScanVisible"));
  setPreviewShown("miniPanelPreviewLoad", mode === "chats" && checked("quickPanelShowLoadAll"));
  setPreviewShown(
    "miniPanelPreviewChatButtons",
    mode === "chats" && (checked("quickPanelShowScanVisible") || checked("quickPanelShowLoadAll"))
  );
  setPreviewShown("miniPanelPreviewOoc", mode === "chat" && checked("quickPanelShowOoc"));
  setPreviewShown("miniPanelPreviewAutoVoice", mode === "chat" && checked("quickPanelShowAutoVoice"));
  setPreviewShown("miniPanelPreviewAutoAsterisk", mode === "chat" && checked("quickPanelShowAutoAsterisk"));
  const autoAsteriskPreview = $("miniPanelPreviewAutoAsterisk");
  if (autoAsteriskPreview) autoAsteriskPreview.textContent = checked("autoPairAsterisks") ? "Auto *: On" : "Auto *: Off";
  setPreviewShown("miniPanelPreviewTranslation", mode === "chat" && checked("enableTranslation") && checked("quickPanelShowTranslation"));
  setPreviewShown("miniPanelPreviewPersona", mode === "chat" && checked("quickPanelShowPersona"));
  setPreviewShown("miniPanelPreviewSoundscapes", checked("enableSoundscapes") && checked("quickPanelShowSoundscapes"));
  setPreviewShown("miniPanelPreviewExport", mode === "chat" && checked("quickPanelShowExport"));
  for (const [id, key] of [
    ["miniPanelPreviewCustomPictures", "quickPanelShowCustomPictures"],
    ["miniPanelPreviewCreatorPreview", "quickPanelShowCreatorPreview"],
    ["miniPanelPreviewImageGenerator", "quickPanelShowImageGenerator"],
    ["miniPanelPreviewRulebookDiagnostics", "quickPanelShowRulebookDiagnostics"],
    ["miniPanelPreviewContextKeeper", "quickPanelShowContextKeeper"]
  ]) setPreviewShown(id, mode === "chat" && checked(key));

  if (!panel.dataset.previewManuallyToggled) {
    panel.classList.toggle("closed", checked("quickPanelDefaultClosed"));
  }

  const toggle = $("miniPanelPreviewToggle");
  if (toggle) toggle.textContent = panel.classList.contains("closed") ? "+" : "-";

  requestAnimationFrame(positionMiniPanelPreview);
}

function setupMiniPanelPreview() {
  const preview = $("miniPanelPreview");
  const panel = $("miniPanelPreviewPanel");
  const head = panel?.querySelector(".mini-panel-preview-head");
  const toggle = $("miniPanelPreviewToggle");
  if (!preview || !panel || !head) return;

  const watched = [
    "quickPanelPlacement",
    "quickPanelDefaultClosed",
    "quickPanelWidth",
    "quickPanelUiScale",
    "quickPanelMaxHeightPercent",
    "quickPanelShowStatus",
    "quickPanelShowLoadedMessageCount",
    "quickPanelStatusShowOpened",
    "quickPanelStatusShowBlocked",
    "quickPanelShowOptions",
    "quickPanelShowCustomPictures", "quickPanelShowCreatorPreview", "quickPanelShowImageGenerator", "quickPanelShowRulebookDiagnostics", "quickPanelShowContextKeeper",
    "quickPanelShowFillNow",
    "quickPanelShowSmartFilterPins",
    "quickPanelShowChatSearch",
    "quickPanelShowChatSort",
    "quickPanelShowScanVisible",
    "quickPanelShowLoadAll",
    "quickPanelShowOoc",
    "quickPanelShowAutoVoice",
    "quickPanelShowAutoAsterisk",
    "quickPanelShowTranslation",
    "enableTranslation",
    "autoPairAsterisks",
    "quickPanelShowPersona",
    "quickPanelShowExport",
    "quickPanelShowSoundscapes",
    "enableSoundscapes",
    "miniPanelPreviewMode"
  ];

  watched.forEach(id => {
    $(id)?.addEventListener("input", renderMiniPanelPreview);
    $(id)?.addEventListener("change", renderMiniPanelPreview);
  });

  toggle?.addEventListener("click", event => {
    event.stopPropagation();
    panel.dataset.previewManuallyToggled = "1";
    panel.classList.toggle("closed");
    renderMiniPanelPreview();
  });

  let dragging = null;

  head.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button")) return;

    const panelRect = panel.getBoundingClientRect();
    dragging = {
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top
    };
    head.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  head.addEventListener("pointermove", event => {
    if (!dragging) return;

    const previewRect = preview.getBoundingClientRect();
    const { margin, maxX, maxY } = previewPanelBounds(preview, panel);
    const x = previewClamp(event.clientX - previewRect.left - dragging.offsetX, margin, maxX);
    const y = previewClamp(event.clientY - previewRect.top - dragging.offsetY, margin, maxY);

    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";

    setValue("quickPanelPlacement", "custom");
    setValue("quickPanelCustomXPercent", maxX > 0 ? String((x / maxX) * 100) : "0");
    setValue("quickPanelCustomYPercent", maxY > 0 ? String((y / maxY) * 100) : "0");
    event.preventDefault();
  });

  const stop = event => {
    if (!dragging) return;
    dragging = null;
    try { head.releasePointerCapture?.(event.pointerId); } catch {}
    renderMiniPanelPreview();
  };

  head.addEventListener("pointerup", stop);
  head.addEventListener("pointercancel", stop);
  window.addEventListener("resize", renderMiniPanelPreview);
  renderMiniPanelPreview();
}
