(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  // These groups are both runtime boundaries and build boundaries. Full builds
  // include every group; future Lite builds can physically omit groups while
  // keeping the same scheduler/route logic.
  DS.RUNTIME_BUNDLE_GROUPS = Object.freeze({
    core: { description: "Always-needed state, compatibility and navigation helpers" },
    interface: { description: "Shared top bar/sidebar/panel/interface cleanup" },
    chat: { description: "Single-chat message/composer tools" },
    chatList: { description: "Saved conversation list tools" },
    listings: { description: "Discovery/card/list filtering tools" },
    creator: { description: "Chatbot creator/editor tools" },
    lorebook: { description: "Lorebook editor/import/backup tools" },
    profiles: { description: "Public bot/profile helpers" },
    personas: { description: "Persona page and organizer tools" }
  });

  const bits = DS.RUNTIME_BUNDLE_BITS || Object.freeze({
    core: 1 << 0,
    interface: 1 << 1,
    chat: 1 << 2,
    chatList: 1 << 3,
    listings: 1 << 4,
    creator: 1 << 5,
    lorebook: 1 << 6,
    profiles: 1 << 7,
    personas: 1 << 8
  });

  function add(mask, name, enabled) {
    return enabled && bits[name] ? mask | bits[name] : mask;
  }

  let cachedPage = null;
  let cachedListing = null;
  let cachedBuildMask = null;
  let cachedPlan = null;

  DS.getRuntimePlan = function getRuntimePlan(pageState = null, hints = {}) {
    const page = pageState || DS.getPageState?.() || {};
    const explicitListing = hints.listing;
    const listing = explicitListing === true || (
      explicitListing !== false &&
      ["listing", "creator-listing", "lorebook-listing"].includes(page.routeType)
    );
    const currentBuildMask = Number.isFinite(DS.RUNTIME_BUILD_MASK) ? DS.RUNTIME_BUILD_MASK : null;
    if (cachedPlan && cachedPage === page && cachedListing === listing && cachedBuildMask === currentBuildMask) {
      const perf = DS.state?.runtimePerformance;
      if (perf) perf.runtimePlanCacheHits = Number(perf.runtimePlanCacheHits || 0) + 1;
      return cachedPlan;
    }

    const routeFlags = {
      core: true,
      interface: true,
      chat: !!page.isSingleChatPage,
      chatList: !!page.isChatListPage,
      listings: !!listing,
      creator: !!(page.isBotEditor || page.isMyCreationsChatbotsPage),
      lorebook: !!(page.isLorebookEditor || page.isMyCreationsLorebooksPage || page.routeType === "lorebook-listing"),
      profiles: !!page.isBotProfilePage,
      personas: !!page.isPersonaPage
    };

    let routeMask = 0;
    for (const [name, enabled] of Object.entries(routeFlags)) routeMask = add(routeMask, name, enabled);
    const buildMask = Number.isFinite(DS.RUNTIME_BUILD_MASK) ? DS.RUNTIME_BUILD_MASK : routeMask;
    const bundleMask = routeMask & buildMask;

    const plan = {
      key: `${DS.getBuildProfile?.().id || "full"}:${page.routeType || "other"}:${listing ? "listing" : "plain"}`,
      page,
      routeMask,
      bundleMask,
      buildMask,
      ...routeFlags,
      botEditor: !!page.isBotEditor,
      lorebookEditor: !!page.isLorebookEditor,
      nonChat: !page.isSingleChatPage
    };

    plan.discovery = !!(plan.listings || plan.profiles);
    plan.creatorAny = !!(plan.creator || plan.lorebook);
    plan.personaTools = !!(plan.personas || plan.chat);
    plan.creatorModeration = !!(plan.creatorAny || plan.profiles);
    cachedPage = page;
    cachedListing = listing;
    cachedBuildMask = currentBuildMask;
    cachedPlan = plan;
    return plan;
  };

  DS.runtimePlanAllows = function runtimePlanAllows(plan, group) {
    if (!group || group === "core" || group === "global") return true;
    if (bits[group] && Number.isFinite(plan?.bundleMask)) return !!(plan.bundleMask & bits[group]);
    return !!plan?.[group];
  };
})();
