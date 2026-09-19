(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const frozen = new Map();
  const onceTimers = new WeakMap();
  const onceTimerImages = new Set();
  const videoState = new Map();

  function imageSource(el) {
    return String(el?.currentSrc || el?.src || el?.getAttribute?.("src") || "");
  }

  function sourceLooksAnimated(el) {
    const src = imageSource(el).toLowerCase();
    if (/\.(?:gif|apng)(?:$|[?#])/.test(src)) return true;
    if (/(?:format|fm)=gif(?:$|[&#])/.test(src)) return true;
    if (/(?:animated|animation)=true(?:$|[&#])/.test(src)) return true;

    // SpicyChat's avatar CDN can serve animated avatars as WebP. The file
    // extension alone cannot tell an animated WebP from a static WebP, so when
    // the user explicitly enables animation control we conservatively treat
    // avatar WebPs as candidates. Freezing a static WebP is visually identical,
    // while this makes animated WebP cards obey the same setting as GIF cards.
    return /cdn\.nd-api\.com\/avatars\/.*\.webp(?:$|[?#])/i.test(src);
  }

  function isMessageMedia(el) {
    const root = el.closest?.("div[id^='message-']");
    if (!root || el.closest?.("button")) return false;
    const rect = el.getBoundingClientRect?.();
    return !!rect && (rect.width > 110 || rect.height > 110);
  }

  function isListingImage(el) {
    if (el.closest?.("a[href*='/chat/']")) return true;
    let node = el.parentElement;
    for (let i = 0; node && i < 6; i++, node = node.parentElement) {
      if (node === document.body) break;
      if (node.querySelector?.(":scope > a[href*='/chat/'], :scope a[aria-label^='chat-with-'][href*='/chat/']")) return true;
    }
    return false;
  }

  function eligible(el, settings) {
    if (!el || el.closest?.("#ds-qol-panel, #ds-chat-export-modal")) return false;
    if (el.tagName === "IMG" && !sourceLooksAnimated(el)) return false;

    if (DS.isSingleChatPage?.()) {
      if (isMessageMedia(el)) return !!settings.animatedImagesChatMedia;
      return !!settings.animatedImagesChats;
    }

    if (DS.isBotProfilePage?.()) return !!settings.animatedImagesProfiles;
    if (isListingImage(el)) return !!settings.animatedImagesListings;
    return false;
  }

  function drawFrame(img, canvas) {
    if (!img?.naturalWidth || !img?.naturalHeight || !canvas) return false;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    try {
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      return true;
    } catch {
      return false;
    }
  }

  function freezeImage(img, mode) {
    if (frozen.has(img)) return;
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.reduceAnimatedBotImages || !eligible(img, settings)) return;

    if (!img.complete || !img.naturalWidth) {
      img.addEventListener("load", () => freezeImage(img, mode), { once: true });
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.className = "ds-animation-freeze-frame";
    canvas.setAttribute("aria-hidden", "true");
    if (!drawFrame(img, canvas)) return;

    const rect = img.getBoundingClientRect?.();
    if (rect?.width) canvas.style.width = `${rect.width}px`;
    if (rect?.height) canvas.style.height = `${rect.height}px`;
    canvas.style.borderRadius = getComputedStyle(img).borderRadius;
    canvas.style.objectFit = getComputedStyle(img).objectFit || "cover";

    const originalDisplay = img.style.display;
    img.after(canvas);
    img.style.display = "none";
    img.dataset.dsAnimationFrozen = "1";

    const state = { canvas, originalDisplay, mode, enter: null, leave: null, source: imageSource(img) };
    frozen.set(img, state);

    if (mode === "hover") {
      const host = canvas.parentElement || canvas;
      state.enter = () => {
        canvas.style.display = "none";
        img.style.display = originalDisplay || "";
      };
      state.leave = () => {
        drawFrame(img, canvas);
        img.style.display = "none";
        canvas.style.display = "";
      };
      host.addEventListener("mouseenter", state.enter);
      host.addEventListener("mouseleave", state.leave);
    }
  }


  function unfreezeImage(img) {
    const state = frozen.get(img);
    if (!state) return;
    try {
      const host = state.canvas?.parentElement;
      if (host && state.enter) host.removeEventListener("mouseenter", state.enter);
      if (host && state.leave) host.removeEventListener("mouseleave", state.leave);
      state.canvas?.remove();
      img.style.display = state.originalDisplay || "";
      delete img.dataset.dsAnimationFrozen;
    } catch {}
    frozen.delete(img);
  }

  function restoreVideo(video) {
    const state = videoState.get(video);
    if (!state) return;
    try {
      if (state.enter) video.removeEventListener("mouseenter", state.enter);
      if (state.leave) video.removeEventListener("mouseleave", state.leave);
      video.loop = state.loop;
      video.muted = state.muted;
      delete video.dataset.dsAnimationHandled;
    } catch {}
    videoState.delete(video);
  }

  function handleImage(img, mode) {
    const existing = frozen.get(img);
    if (existing && (existing.mode !== mode || existing.source !== imageSource(img))) unfreezeImage(img);

    if (mode === "once") {
      if (onceTimers.has(img) || frozen.has(img)) return;
      const timer = setTimeout(() => {
        onceTimers.delete(img);
        onceTimerImages.delete(img);
        freezeImage(img, "freeze");
      }, 9000);
      onceTimers.set(img, timer);
      onceTimerImages.add(img);
      return;
    }
    freezeImage(img, mode);
  }

  function handleVideo(video, mode) {
    const old = videoState.get(video);
    if (old?.mode === mode) return;

    if (old) restoreVideo(video);

    const state = { mode, loop: video.loop, muted: video.muted, enter: null, leave: null };
    videoState.set(video, state);
    video.dataset.dsAnimationHandled = mode;

    if (mode === "once") {
      try {
        video.loop = false;
        video.play?.().catch?.(() => {});
      } catch {}
      return;
    }

    try { video.pause?.(); } catch {}
    if (mode === "hover") {
      state.enter = () => video.play?.().catch?.(() => {});
      state.leave = () => video.pause?.();
      video.addEventListener("mouseenter", state.enter);
      video.addEventListener("mouseleave", state.leave);
    }
  }

  function cleanup() {
    for (const img of [...frozen.keys()]) unfreezeImage(img);
    for (const img of [...onceTimerImages]) {
      const timer = onceTimers.get(img);
      if (timer) clearTimeout(timer);
      onceTimers.delete(img);
      onceTimerImages.delete(img);
    }
    for (const video of [...videoState.keys()]) restoreVideo(video);
    DS.state.animationControlWasActive = false;
  }

  DS.applyAnimationControls = function applyAnimationControls() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.reduceAnimatedBotImages) {
      if (DS.state.animationControlWasActive) cleanup();
      return;
    }

    DS.state.animationControlWasActive = true;
    const mode = ["freeze", "once", "hover"].includes(settings.animatedImageMode) ? settings.animatedImageMode : "freeze";

    for (const img of [...frozen.keys()]) {
      if (!document.contains(img) || !eligible(img, settings)) unfreezeImage(img);
    }
    for (const video of [...videoState.keys()]) {
      if (!document.contains(video) || !eligible(video, settings)) restoreVideo(video);
    }

    document.querySelectorAll("img[src], video").forEach(el => {
      if (!eligible(el, settings)) return;
      if (el.tagName === "VIDEO") handleVideo(el, mode);
      else handleImage(el, mode);
    });
  };

  DS.removeAnimationControls = cleanup;
})();
