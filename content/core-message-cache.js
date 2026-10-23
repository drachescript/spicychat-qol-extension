// Chat message root/cached-text helpers, separated from the shared Core initialization.
// Load after core.js, before content/main.js and other chat feature modules.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;

  DS.isMessageEditPending = function isMessageEditPending(root) {
    if (!root?.isConnected) return false;
    if (root?.dataset?.dsEditSavePending) return true;
    return !!root.querySelector?.("textarea, [contenteditable='true']");
  };

  DS.getCurrentMessageLaneRoots = function getCurrentMessageLaneRoots() {
    const roots = Array.isArray(DS.state?.messageLaneRoots) ? DS.state.messageLaneRoots : [];
    return roots.filter(root => root?.isConnected && !DS.isMessageEditPending?.(root));
  };

  DS.getLoadedMessageRoots = function getLoadedMessageRoots(options = {}) {
    if (!DS.isSingleChatPage?.()) return [];
    const route = String(location.pathname || "");
    const revision = Number(DS.state.domRevision || 0);
    const cache = DS.state.loadedMessageRootsCache || (DS.state.loadedMessageRootsCache = { route: "", revision: -1, roots: [] });
    const cachedRoots = Array.isArray(cache.roots) ? cache.roots : [];
    // Structural chat mutations bump domRevision. Rechecking every cached
    // root's isConnected state on each lookup costs O(messages) even when the
    // same reply is streaming and nothing was mounted or removed. The first
    // and last nodes are cheap sentinels; a revision change forces a rescan.
    const reusable = !options.fresh && cache.route === route && cache.revision === revision &&
      (!cachedRoots.length || (cachedRoots[0]?.isConnected && cachedRoots[cachedRoots.length - 1]?.isConnected));
    if (reusable) {
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.loadedMessageRootCacheHits = Number(counters.loadedMessageRootCacheHits || 0) + 1;
      counters.loadedMessageRootConnectivityChecksAvoided = Number(counters.loadedMessageRootConnectivityChecksAvoided || 0) + Math.max(0, cachedRoots.length - 2);
      return cachedRoots;
    }
    const roots = Array.from(document.querySelectorAll("div[id^='message-']"))
      .filter(root => !root.parentElement?.closest?.("div[id^='message-']"));
    cache.route = route;
    cache.revision = revision;
    cache.roots = roots;
    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.loadedMessageRootCacheMisses = Number(counters.loadedMessageRootCacheMisses || 0) + 1;
    return roots;
  };

  DS.refreshMessageEnhancerConfig = function refreshMessageEnhancerConfig(settings = DS.state?.settings || {}) {
    const relevant = {};
    for (const key of Object.keys(settings || {}).sort()) {
      if (!/(message|chatBubble|generation|timestamp|rpFormat|alternateDialogue|translation|contextKeeper|bookmark|textReplacement|storyDay|rpState|nudge|selectionRemember)/i.test(key)) continue;
      const value = settings[key];
      if (value == null || ["string", "number", "boolean"].includes(typeof value)) relevant[key] = value;
    }
    let signature = "";
    try { signature = JSON.stringify(relevant); } catch {}
    if (signature === DS.state.messageEnhancerConfigSignature) return false;
    DS.state.messageEnhancerConfigSignature = signature;
    DS.state.messageEnhancerSeen = new WeakSet();
    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.messageEnhancerConfigResets = Number(counters.messageEnhancerConfigResets || 0) + 1;
    return true;
  };

  DS.messageEnhancerHasVisited = function messageEnhancerHasVisited(root) {
    return !!root && !!DS.state?.messageEnhancerSeen?.has?.(root);
  };

  DS.markMessageEnhancerVisited = function markMessageEnhancerVisited(roots = []) {
    const seen = DS.state.messageEnhancerSeen || (DS.state.messageEnhancerSeen = new WeakSet());
    let added = 0;
    for (const root of roots || []) {
      if (!(root instanceof Element) || !root.isConnected || seen.has(root)) continue;
      seen.add(root);
      added++;
    }
    if (added) {
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.messageEnhancerFirstVisits = Number(counters.messageEnhancerFirstVisits || 0) + added;
    }
    return added;
  };

  DS.isMessageRootNearViewport = function isMessageRootNearViewport(root, margin = 1200) {
    if (!(root instanceof Element) || !root.isConnected) return false;
    try {
      const rect = root.getBoundingClientRect();
      const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 800);
      const pad = Math.max(0, Number(margin) || 0);
      return rect.bottom >= -pad && rect.top <= height + pad;
    } catch {
      return false;
    }
  };

  DS.getMessageEnhancerRoots = function getMessageEnhancerRoots(options = {}) {
    if (!DS.isSingleChatPage?.()) return [];
    const loaded = DS.getLoadedMessageRoots?.() || [];
    const lane = DS.getCurrentMessageLaneRoots?.() || [];
    const threshold = Math.max(60, Number(options.threshold || 120));
    const forceAll = options.forceAll === true;
    const forceLazy = options.forceLazy === true;
    const lazy = !forceAll && (forceLazy || loaded.length >= threshold || Date.now() < Number(DS.state?.messageResumeLazyUntil || 0));
    const newest = Math.max(0, Number(options.newest ?? 24));
    const margin = Math.max(0, Number(options.margin ?? 1400));
    const readyAttribute = String(options.readyAttribute || "").trim();
    const readyValue = options.readyValue == null ? null : String(options.readyValue);

    const needsWork = root => {
      if (!(root instanceof Element) || !root.isConnected || DS.isMessageEditPending?.(root)) return false;
      if (DS.state?.settings?.chatPerformanceMode && root.classList.contains("ds-chat-message-far")) return false;
      if (!readyAttribute) return true;
      if (readyValue == null) return !root.hasAttribute(readyAttribute);
      return root.getAttribute(readyAttribute) !== readyValue;
    };

    const chosen = new Set();
    for (const root of lane) if (needsWork(root)) chosen.add(root);

    // When the scheduler supplied explicit dirty message roots, stay inside
    // that incremental lane. The old behavior immediately added every loaded
    // message again whenever a chat had fewer than the lazy threshold, which
    // turned a one-message reply/update into a full-history decoration pass.
    // Full scans are still available when there is no lane (initial/manual
    // maintenance) or a caller explicitly requests forceAll.
    const laneOnly = lane.length > 0 && options.respectLane !== false && !forceAll;
    if (!laneOnly) {
      if (!lazy) {
        for (const root of loaded) if (needsWork(root)) chosen.add(root);
      } else {
        for (const root of loaded) {
          if (needsWork(root) && DS.isMessageRootNearViewport?.(root, margin)) chosen.add(root);
        }
        if (newest) {
          for (const root of loaded.slice(-newest)) if (needsWork(root)) chosen.add(root);
        }
      }
    }

    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    if (laneOnly) {
      counters.messageEnhancerIncrementalLanePasses = Number(counters.messageEnhancerIncrementalLanePasses || 0) + 1;
      counters.messageEnhancerIncrementalLaneRoots = Number(counters.messageEnhancerIncrementalLaneRoots || 0) + chosen.size;
    }
    counters.messageEnhancerRootRequests = Number(counters.messageEnhancerRootRequests || 0) + 1;
    if (lazy) {
      counters.messageEnhancerLazyPasses = Number(counters.messageEnhancerLazyPasses || 0) + 1;
      counters.messageEnhancerLazyRoots = Number(counters.messageEnhancerLazyRoots || 0) + chosen.size;
      counters.messageEnhancerLazySkipped = Number(counters.messageEnhancerLazySkipped || 0) + Math.max(0, loaded.length - chosen.size);
    }
    return [...chosen];
  };

  DS.getMessageRootRevision = function getMessageRootRevision(root) {
    if (!(root instanceof Element)) return 0;
    const revisions = DS.state.messageRootRevisions || (DS.state.messageRootRevisions = new WeakMap());
    return Number(revisions.get(root) || 0);
  };

  DS.markMessageRootDirty = function markMessageRootDirty(root) {
    if (!(root instanceof Element) || !root.matches?.("div[id^='message-']")) return false;
    const dirty = DS.state.messageDirtyRoots || (DS.state.messageDirtyRoots = new Set());
    const wasDirty = dirty.has(root);
    dirty.add(root);
    if (!wasDirty) {
      const revisions = DS.state.messageRootRevisions || (DS.state.messageRootRevisions = new WeakMap());
      revisions.set(root, Number(revisions.get(root) || 0) + 1);
    }
    return !wasDirty;
  };

  function messageTextFingerprint(root) {
    const host = root?.querySelector?.("div[class*='overflow-wrap']");
    if (!host) return "";
    const text = String(host.textContent || "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${hash >>> 0}`;
  }

  DS.invalidateMessageCacheForNode = function invalidateMessageCacheForNode(node) {
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el) return false;

    const roots = new Set();
    if (el.matches?.("div[id^='message-']")) roots.add(el);
    const closest = el.closest?.("div[id^='message-']");
    if (closest) roots.add(closest);
    if (!roots.size) {
      el.querySelectorAll?.("div[id^='message-']").forEach(root => {
        if (!root.parentElement?.closest?.("div[id^='message-']")) roots.add(root);
      });
    }
    if (!roots.size) return false;

    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.messageCacheInvalidationRequests = Number(counters.messageCacheInvalidationRequests || 0) + roots.size;
    let actual = 0;
    let deduped = 0;
    for (const root of roots) {
      const fingerprints = DS.state.messageTextFingerprints || (DS.state.messageTextFingerprints = new WeakMap());
      const previousFingerprint = fingerprints.get(root);
      if (previousFingerprint) {
        const currentFingerprint = messageTextFingerprint(root);
        if (currentFingerprint && currentFingerprint === previousFingerprint) {
          counters.messageCacheFingerprintSkips = Number(counters.messageCacheFingerprintSkips || 0) + 1;
          deduped += 1;
          continue;
        }
      }
      DS.state.messageEnhancerSeen?.delete?.(root);
      const newlyDirty = DS.markMessageRootDirty(root);
      const hadCachedText = !!DS.state.messageTextCache?.delete?.(root);
      if (newlyDirty || hadCachedText) actual += 1;
      else deduped += 1;
    }
    if (actual) DS.state.messageTextRevision = Number(DS.state.messageTextRevision || 0) + actual;
    counters.messageCacheInvalidations = Number(counters.messageCacheInvalidations || 0) + actual;
    counters.messageCacheInvalidationDeduped = Number(counters.messageCacheInvalidationDeduped || 0) + deduped;
    return actual > 0;
  };

  DS.getCachedMessageText = function getCachedMessageText(root) {
    if (!(root instanceof Element)) return "";
    const cache = DS.state.messageTextCache || (DS.state.messageTextCache = new WeakMap());
    const cached = cache.get(root);
    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    if (typeof cached === "string") {
      counters.messageCacheHits = Number(counters.messageCacheHits || 0) + 1;
      return cached;
    }
    counters.messageCacheMisses = Number(counters.messageCacheMisses || 0) + 1;
    const visible = el => {
      try { const style = getComputedStyle(el); return style.display !== "none" && style.visibility !== "hidden"; } catch { return true; }
    };
    const host = root.querySelector("div[class*='overflow-wrap']");
    let text = "";
    if (host) {
      const spans = [...host.querySelectorAll("span.leading-6")].filter(visible).map(el => String(el.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
      if (spans.length) text = spans.join("\n");
    }
    if (!text) {
      const clone = root.cloneNode(true);
      clone.querySelectorAll("button,svg,.ds-message-quick-actions,.ds-message-bookmark-button,.ds-generation-metadata,.ds-rp-repair-toggle,.ds-translation-output").forEach(el => el.remove());
      text = String(clone.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    }
    cache.set(root, text);
    const fingerprint = messageTextFingerprint(root);
    if (fingerprint) (DS.state.messageTextFingerprints || (DS.state.messageTextFingerprints = new WeakMap())).set(root, fingerprint);
    return text;
  };

})();
}
