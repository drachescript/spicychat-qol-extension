if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const frozen = new Map();
  const onceTimers = new WeakMap();
  const onceTimerImages = new Set();
  const pendingImages = new WeakSet();
  const videoState = new Map();
  let animationVisibilityGuardInstalled = false;
  let animationVisibilityGuardRaf = 0;
  let mediaScanTimer = 0, mediaScanRoute = "", mediaScanRevision = -1, mediaScanSettings = "", mediaScanQueue = [];

  function elementOnscreen(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const vw = document.documentElement.clientWidth || window.innerWidth || 0;
    const vh = document.documentElement.clientHeight || window.innerHeight || 0;
    return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
  }

  function foregroundAnimationAllowed(el) {
    return document.visibilityState === "visible" && document.hasFocus?.() !== false && elementOnscreen(el);
  }

  function freezeHoveredMediaIfNeeded() {
    if (document.visibilityState === "visible" && document.hasFocus?.() !== false) {
      for (const [img, state] of frozen) {
        if (!state?.hovering || elementOnscreen(img)) continue;
        state.hovering = false;
        state.leave?.();
      }
      for (const [video, state] of videoState) {
        if (!state?.hovering || elementOnscreen(video)) continue;
        state.hovering = false;
        try { video.pause?.(); } catch {}
      }
      return;
    }
    for (const [img, state] of frozen) {
      if (!state?.hovering) continue;
      state.hovering = false;
      state.leave?.();
    }
    for (const [video, state] of videoState) {
      state.hovering = false;
      try { video.pause?.(); } catch {}
    }
  }

  function scheduleAnimationVisibilityGuard() {
    cancelAnimationFrame(animationVisibilityGuardRaf);
    animationVisibilityGuardRaf = requestAnimationFrame(() => {
      animationVisibilityGuardRaf = 0;
      freezeHoveredMediaIfNeeded();
    });
  }

  function installAnimationVisibilityGuard() {
    if (animationVisibilityGuardInstalled) return;
    animationVisibilityGuardInstalled = true;
    document.addEventListener("visibilitychange", scheduleAnimationVisibilityGuard, true);
    window.addEventListener("blur", scheduleAnimationVisibilityGuard, true);
    window.addEventListener("scroll", scheduleAnimationVisibilityGuard, { passive: true, capture: true });
  }

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

  function isChatMessageAvatar(el) {
    return !!el?.closest?.("div[id^='message-']") &&
      !!el?.closest?.("button[data-testid='Avatar-Button']");
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

  function isExplicitImageViewer(el) {
    if (!el) return false;
    if (el.closest?.("[role='dialog'], [aria-modal='true']")) return true;

    const cls = String(el.className || "");
    const looksViewerImage = cls.includes("object-contain") && cls.includes("max-w-full") && cls.includes("max-h-full");
    if (!looksViewerImage) return false;

    let node = el.parentElement;
    for (let i = 0; node && node !== document.body && i < 8; i++, node = node.parentElement) {
      if (!String(node.className || "").includes("fixed")) continue;
      const rect = node.getBoundingClientRect?.();
      if (!rect) continue;
      if (rect.width >= window.innerWidth * 0.6 && rect.height >= window.innerHeight * 0.6) return true;
    }
    return false;
  }

  function eligible(el, settings) {
    if (!el || el.closest?.("#ds-qol-panel, #ds-chat-export-modal")) return false;
    // Opening an image is an explicit request to view it. Never replace that
    // full-screen/modal image with a frozen canvas, even when avatar animation
    // reduction is enabled elsewhere on the page.
    if (el.tagName === "IMG" && !sourceLooksAnimated(el)) return false;
    if (el.tagName === "IMG" && isExplicitImageViewer(el)) return false;

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
    // Saved-for-Later thumbnails are small: do not allocate multi-megapixel
    // frozen WebP canvases just to display a ~175px card image.
    const laterThumb = !!img.closest?.('#ds-favorites-later-panel');
    const mobile = DS.isNativeAndroidStorage?.() || window.innerWidth <= 760;
    const listing = mobile && isListingImage(img);
    const cap = laterThumb || listing ? 384 : mobile ? 768 : Infinity;
    const scale = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    try {
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      return true;
    } catch {
      return false;
    }
  }

  function freezeImage(img, mode) {
    if (frozen.has(img) || !img.isConnected) return;
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.reduceAnimatedBotImages || !eligible(img, settings)) return;

    if (!img.complete || !img.naturalWidth) {
      if (!pendingImages.has(img)) {
        pendingImages.add(img);
        const route = location.href;
        img.addEventListener("load", () => {
          pendingImages.delete(img);
          if (img.isConnected && location.href === route) freezeImage(img, mode);
        }, { once: true });
      }
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

    const state = {
      canvas, originalDisplay, mode, enter: null, leave: null,
      host: canvas.parentElement || canvas, source: imageSource(img), hovering: false
    };
    frozen.set(img, state);

    if (mode === "hover") {
      const host = state.host;
      state.enter = () => {
        state.hovering = true;
        if (!foregroundAnimationAllowed(canvas)) {
          state.hovering = false;
          return;
        }
        canvas.style.display = "none";
        img.style.display = originalDisplay || "";
      };
      state.leave = () => {
        state.hovering = false;
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
      const host = state.host;
      if (host && state.enter) host.removeEventListener("mouseenter", state.enter);
      if (host && state.leave) host.removeEventListener("mouseleave", state.leave);
      state.canvas?.remove();
      if (state.canvas) { state.canvas.width = 0; state.canvas.height = 0; }
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

    const state = { mode, loop: video.loop, muted: video.muted, enter: null, leave: null, hovering: false };
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
      state.enter = () => {
        state.hovering = true;
        if (!foregroundAnimationAllowed(video)) {
          state.hovering = false;
          return;
        }
        video.play?.().catch?.(() => {});
      };
      state.leave = () => {
        state.hovering = false;
        video.pause?.();
      };
      video.addEventListener("mouseenter", state.enter);
      video.addEventListener("mouseleave", state.leave);
    }
  }

  function cancelMediaScan() {
    clearTimeout(mediaScanTimer); mediaScanTimer = 0; mediaScanQueue = [];
    mediaScanRoute = ""; mediaScanRevision = -1; mediaScanSettings = "";
  }
  DS.cancelObsoleteAnimationWork = () => {
    cancelMediaScan();
    for (const img of frozen.keys()) if (!img.isConnected) unfreezeImage(img);
    for (const video of videoState.keys()) if (!video.isConnected) restoreVideo(video);
  };
  function cleanup() {
    cancelMediaScan();
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
    installAnimationVisibilityGuard();
    // v0.2.29: animated media is allowed to move only while it is hovered,
    // onscreen, and the page is foreground/focused. Leaving the viewport or
    // tab immediately returns it to the static frame.
    // v0.2.28: animated-image reduction is intentionally hover-only. Older
    // backups may still contain freeze/once, but those modes no longer keep
    // images permanently frozen or auto-play them in the background.
    const mode = "hover";

    for (const [img, state] of frozen) {
      if (!document.contains(img) || !eligible(img, settings)) {
        unfreezeImage(img);
        continue;
      }
      // Message avatars can be reused or re-rendered without replacing the img.
      // Reconcile them here instead of adding another observer or timer.
      if (!isChatMessageAvatar(img)) continue;
      if (state.host !== img.parentElement || state.source !== imageSource(img)) {
        unfreezeImage(img);
        continue;
      }
      if (state.canvas.parentElement !== state.host || state.canvas.previousSibling !== img) {
        img.after(state.canvas);
      }
      if (state.hovering &&
          (!foregroundAnimationAllowed(img) || !state.host.matches?.(":hover"))) {
        state.leave?.();
      }
      if (!state.hovering) {
        if (img.style.display !== "none") img.style.display = "none";
        if (state.canvas.style.display === "none") state.canvas.style.display = "";
      }
    }
    for (const video of [...videoState.keys()]) {
      if (!document.contains(video) || !eligible(video, settings)) restoreVideo(video);
    }

    const process = el => {
      if (!el.isConnected || !eligible(el, DS.state.settings || {})) return;
      if (el.tagName === "VIDEO") handleVideo(el, mode);
      else handleImage(el, mode);
    };
    if (!DS.isNativeAndroidStorage?.()) {
      document.querySelectorAll("img[src], video").forEach(process);
      return;
    }
    const route = location.href, revision = Number(DS.state.domRevision || 0);
    const signature = [settings.animatedImagesListings, settings.animatedImagesChats, settings.animatedImagesProfiles, settings.animatedImagesChatMedia].join("|");
    if (mediaScanRoute === route && mediaScanSettings === signature && (mediaScanTimer || mediaScanRevision === revision)) return;
    cancelMediaScan(); mediaScanRoute = route; mediaScanRevision = revision; mediaScanSettings = signature;
    mediaScanQueue = [...document.querySelectorAll("img[src], video")];
    let index = 0;
    const slice = () => {
      mediaScanTimer = 0;
      if (location.href !== route || !DS.state.settings?.enabled || !DS.state.settings?.reduceAnimatedBotImages) { cancelMediaScan(); return; }
      const start = performance.now(); let count = 0;
      while (index < mediaScanQueue.length && count++ < 12 && performance.now() - start < 7) process(mediaScanQueue[index++]);
      if (index < mediaScanQueue.length) mediaScanTimer = setTimeout(slice, 24);
      else { mediaScanQueue = []; if (Number(DS.state.domRevision || 0) !== revision) DS.scheduleRun?.({ priority: "slow", source: "media-scan-changed" }); }
    };
    mediaScanTimer = setTimeout(slice, 0);
  };

  DS.removeAnimationControls = cleanup;
})();

}
