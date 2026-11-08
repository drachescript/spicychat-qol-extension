// Main runtime support: chat startup guard.
// Factories register functions but do not start observers until the main runtime is active.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainChatStartupGuard = function createMainChatStartupGuard({
    loadedChatMessageCount, scheduleSavedOpenedLane, primeLargeChatMessageLane
  }) {
    const CHAT_STARTUP_QUIET_MS = 20000;
    const CHAT_STARTUP_SETTLE_MIN_MS = 2500;
    const CHAT_STARTUP_LARGE_SETTLE_MIN_MS = 8000;
    const CHAT_STARTUP_LARGE_MESSAGE_COUNT = 35;
    const CHAT_STARTUP_SETTLED_IDLE_MS = 1800;
    const CHAT_STARTUP_LONG_TASK_IDLE_MS = 1500;
    const CHAT_STARTUP_WARMUP_MS = 25000;
    const DISCARDED_WAKE_VISIBLE_QUIET_MS = 8000;

    function discardedWakeSessionActive() {
      return !!(DS.state?.discardedWakeActive && DS.isSingleChatPage?.());
    }

    function noteDiscardedWakeVisible(source = "visible") {
      if (!discardedWakeSessionActive() || document.hidden) return false;
      const now = Date.now();
      if (!Number(DS.state.discardedWakeVisibleAt || 0)) {
        DS.state.discardedWakeVisibleAt = now;
        DS.state.discardedWakeMinUntil = now + DISCARDED_WAKE_VISIBLE_QUIET_MS;
        DS.state.chatStartupQuietUntil = Math.max(Number(DS.state.chatStartupQuietUntil || 0), now + CHAT_STARTUP_QUIET_MS);
        DS.state.chatStartupWarmupUntil = Math.max(Number(DS.state.chatStartupWarmupUntil || 0), now + CHAT_STARTUP_WARMUP_MS);
        DS.state.chatStartupLastMessageMutationAt = now;
        DS.runtimeLog?.("info", "performance", `Discarded chat tab became visible (${source})`, { quietMs: DISCARDED_WAKE_VISIBLE_QUIET_MS });
        DS.diagPerformance?.("discarded-wake-visible", { source: String(source || "visible"), quietMs: DISCARDED_WAKE_VISIBLE_QUIET_MS });
      }
      return true;
    }

    function finishDiscardedWake(reason = "settled") {
      if (!DS.state?.discardedWakeActive) return;
      DS.state.discardedWakeActive = false;
      DS.state.discardedWakeFinishedAt = Date.now();
      DS.runtimeLog?.("info", "performance", `Discarded chat wake protection ended (${reason})`);
      DS.diagPerformance?.("discarded-wake-end", { reason: String(reason || "settled") });
      if (!document.hidden) {
        setTimeout(() => {
          DS.maybeAutoReadNotifications?.("discarded-wake-settled");
          scheduleSavedOpenedLane("discarded-wake-settled", 40);
          primeLargeChatMessageLane("discarded-wake-settled");
        }, 0);
      }
    }

    function chatStartupMinimumQuietMs() {
      return loadedChatMessageCount() >= CHAT_STARTUP_LARGE_MESSAGE_COUNT
        ? CHAT_STARTUP_LARGE_SETTLE_MIN_MS
        : CHAT_STARTUP_SETTLE_MIN_MS;
    }

    function startChatStartupQuietWindow(source = "route") {
      if (!DS.isSingleChatPage?.()) return false;
      DS.state = DS.state || {};
      const now = Date.now();
      const discardedWake = source === "startup" && document.wasDiscarded === true;
      DS.state.chatStartupQuietRoute = `${location.pathname || ""}${location.search || ""}`;
      DS.state.chatStartupQuietStartedAt = now;
      DS.state.chatStartupQuietUntil = now + CHAT_STARTUP_QUIET_MS;
      DS.state.chatStartupWarmupUntil = now + CHAT_STARTUP_WARMUP_MS;
      DS.state.chatStartupLastMessageMutationAt = now;
      DS.state.chatStartupLastLongTaskAt = 0;
      if (discardedWake) {
        DS.state.discardedWakeActive = true;
        DS.state.discardedWakeVisibleAt = document.hidden ? 0 : now;
        DS.state.discardedWakeMinUntil = document.hidden ? 0 : now + DISCARDED_WAKE_VISIBLE_QUIET_MS;
        DS.state.discardedWakeStartedAt = now;
      } else if (source === "route-change") {
        DS.state.discardedWakeActive = false;
        DS.state.discardedWakeVisibleAt = 0;
        DS.state.discardedWakeMinUntil = 0;
      }
      DS.runtimeLog?.("info", "performance", `Chat startup quiet window started (${source})`, {
        quietMs: CHAT_STARTUP_QUIET_MS,
        discardedWake
      });
      DS.diagPerformance?.("startup-quiet-start", { source: String(source || "route"), durationTargetMs: CHAT_STARTUP_QUIET_MS, discardedWake });
      return true;
    }

    function chatStartupQuietActive() {
      if (!DS.isSingleChatPage?.()) return false;
      const now = Date.now();
      if (discardedWakeSessionActive()) {
        if (document.hidden) return true;
        noteDiscardedWakeVisible("quiet-check");
        const discardedMinUntil = Number(DS.state?.discardedWakeMinUntil || 0);
        if (discardedMinUntil && now < discardedMinUntil) return true;
      }
      const until = Number(DS.state?.chatStartupQuietUntil || 0);
      if (!until) {
        finishDiscardedWake("quiet-cleared");
        return false;
      }
      if (now >= until) {
        DS.state.chatStartupQuietUntil = 0;
        finishDiscardedWake("timeout");
        DS.diagPerformance?.("startup-quiet-end", { reason: "timeout", elapsedMs: Math.max(0, now - Number(DS.state?.chatStartupQuietStartedAt || now)) });
        return false;
      }
      const started = Number(DS.state?.chatStartupQuietStartedAt || now);
      const lastMutation = Number(DS.state?.chatStartupLastMessageMutationAt || started);
      const lastLongTask = Number(DS.state?.chatStartupLastLongTaskAt || 0);
      const minimumQuietMs = chatStartupMinimumQuietMs();
      const mutationIdleMs = now - lastMutation;
      const longTaskIdleMs = lastLongTask > 0 ? now - lastLongTask : Number.POSITIVE_INFINITY;
      if (
        now - started >= minimumQuietMs &&
        mutationIdleMs >= CHAT_STARTUP_SETTLED_IDLE_MS &&
        longTaskIdleMs >= CHAT_STARTUP_LONG_TASK_IDLE_MS
      ) {
        DS.state.chatStartupQuietUntil = 0;
        DS.runtimeLog?.("info", "performance", "Chat startup quiet window ended after history and Long Tasks settled", {
          elapsedMs: now - started,
          settledMs: mutationIdleMs,
          longTaskIdleMs: Number.isFinite(longTaskIdleMs) ? longTaskIdleMs : -1,
          minimumQuietMs,
          mountedMessages: loadedChatMessageCount()
        });
        DS.diagPerformance?.("startup-quiet-end", {
          reason: "settled",
          elapsedMs: now - started,
          settledMs: mutationIdleMs,
          longTaskIdleMs: Number.isFinite(longTaskIdleMs) ? longTaskIdleMs : -1,
          minimumQuietMs,
          mountedMessages: loadedChatMessageCount()
        });
        finishDiscardedWake("settled");
        return false;
      }
      return true;
    }

    function scheduleChatStartupQuietResume(source = "startup") {
      if (!chatStartupQuietActive()) return false;
      if (discardedWakeSessionActive() && document.hidden) {
        clearTimeout(DS.state.chatStartupQuietTimer);
        DS.state.chatStartupQuietTimer = 0;
        return true;
      }
      if (discardedWakeSessionActive()) noteDiscardedWakeVisible(`resume-${source}`);
      const now = Date.now();
      const until = Number(DS.state.chatStartupQuietUntil || now);
      const started = Number(DS.state.chatStartupQuietStartedAt || now);
      const lastMutation = Number(DS.state.chatStartupLastMessageMutationAt || started);
      const lastLongTask = Number(DS.state.chatStartupLastLongTaskAt || 0);
      const earliestSettleCheck = Math.max(
        started + chatStartupMinimumQuietMs(),
        lastMutation + CHAT_STARTUP_SETTLED_IDLE_MS,
        lastLongTask > 0 ? lastLongTask + CHAT_STARTUP_LONG_TASK_IDLE_MS : 0,
        Number(DS.state?.discardedWakeMinUntil || 0)
      );
      const wakeAt = Math.min(until, earliestSettleCheck);
      clearTimeout(DS.state.chatStartupQuietTimer);
      DS.state.chatStartupQuietTimer = setTimeout(() => {
        DS.state.chatStartupQuietTimer = 0;
        DS.scheduleRun?.({ priority: "critical", immediate: true, source: `chat-startup-settle-${source}` });
        DS.scheduleRun?.({ priority: "slow", source: `chat-startup-settle-${source}` });
        DS.scheduleMessageLane?.(`chat-startup-settle-${source}`);
      }, Math.max(80, wakeAt - now + 25));
      return true;
    }

    function chatStartupWarmupActive() {
      if (!DS.isSingleChatPage?.()) return false;
      return Date.now() < Number(DS.state?.chatStartupWarmupUntil || 0);
    }

    function chatStartupWarmupRemainingMs() {
      return Math.max(0, Number(DS.state?.chatStartupWarmupUntil || 0) - Date.now());
    }

    DS.startChatStartupQuietWindow = startChatStartupQuietWindow;
    DS.isChatStartupQuiet = chatStartupQuietActive;
    DS.isChatStartupWarmup = chatStartupWarmupActive;
    DS.chatStartupWarmupRemainingMs = chatStartupWarmupRemainingMs;
    DS.isDiscardedWakeProtected = discardedWakeSessionActive;


    return Object.freeze({
      discardedWakeSessionActive, noteDiscardedWakeVisible, finishDiscardedWake,
      startChatStartupQuietWindow, chatStartupQuietActive,
      scheduleChatStartupQuietResume, chatStartupWarmupActive,
      chatStartupWarmupRemainingMs
    });
  };

})();
}
