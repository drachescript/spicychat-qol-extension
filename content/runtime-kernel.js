(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const BUNDLE_ORDER = Object.freeze([
    "core",
    "interface",
    "chat",
    "chatList",
    "listings",
    "creator",
    "lorebook",
    "profiles",
    "personas"
  ]);

  const BUNDLE_BITS = Object.freeze(Object.fromEntries(
    BUNDLE_ORDER.map((name, index) => [name, 1 << index])
  ));
  const FULL_MASK = BUNDLE_ORDER.reduce((mask, name) => mask | BUNDLE_BITS[name], 0);

  const rawProfile = window.__DSQ_BUILD_PROFILE__ || {};
  const requestedBundles = Array.isArray(rawProfile.bundles) && rawProfile.bundles.length
    ? rawProfile.bundles
    : BUNDLE_ORDER;
  const availableBundles = new Set(["core", ...requestedBundles.filter(name => BUNDLE_BITS[name])]);
  const buildMask = [...availableBundles].reduce((mask, name) => mask | (BUNDLE_BITS[name] || 0), 0) || FULL_MASK;

  const TASK_GROUP_HINTS = Object.freeze({
    "accessibility": "interface",
    "accessibility cleanup": "interface",
    "create panel": "interface",
    "update panel": "interface",
    "remove disabled panel": "interface",
    "top bar": "interface",
    "top bar native restore": "interface",
    "sidebar": "interface",
    "sidebar native restore": "interface",
    "main footer": "interface",
    "main footer native restore": "interface",
    "soundscapes": "interface",
    "tag aliases": "core",
    "profile export": "profiles",
    "creator writing assistant": "creator",
    "native rating helpers": "chat",
    "saved lists overlay": "listings",
    "soundscape cleanup": "interface",
    "premium cleanup": "interface",
    "advert banners": "interface",
    "notifications": "interface",
    "animation controls": "interface",
    "animation cleanup": "interface",
    "scroll to top": "interface",
    "scroll to top cleanup": "interface",
    "S.AI Toolkit detection": "interface",

    "performance mode": "chat",
    "performance cleanup": "chat",
    "message removal draft guard": "chat",
    "failed message helper": "chat",
    "chat top bar": "chat",
    "chat top bar cleanup": "chat",
    "chat backgrounds": "chat",
    "chat background cleanup": "chat",
    "chat background button placement": "chat",
    "chat UI": "chat",
    "chat UI cleanup": "chat",
    "chat bookmarks": "chat",
    "chat bookmarks cleanup": "chat",
    "chat search": "chat",
    "chat search cleanup": "chat",
    "focus mode": "chat",
    "character QoL profile": "chat",
    "Android app controls": "chat",
    "Android app cleanup": "chat",
    "composer": "chat",
    "composer cleanup": "chat",
    "reply instructions": "chat",
    "lorebook consistency": "chat",
    "lorebook consistency cleanup": "chat",
    "reply instructions cleanup": "chat",
    "formatting toolbar": "chat",
    "formatting toolbar cleanup": "chat",
    "RP format repair": "chat",
    "RP format cleanup": "chat",
    "alternate dialogue": "chat",
    "alternate dialogue cleanup": "chat",
    "chat bubbles": "chat",
    "chat bubble cleanup": "chat",
    "message options": "chat",
    "message options cleanup": "chat",
    "context keeper": "chat",
    "chat nudges": "chat",
    "chat nudges cleanup": "chat",
    "selection remember": "chat",
    "selection remember cleanup": "chat",
    "auto voice": "chat",
    "auto voice cleanup": "chat",
    "memory manager": "chat",
    "memory manager cleanup": "chat",
    "chat text replacements": "chat",
    "chat text replacements cleanup": "chat",
    "translation": "chat",
    "translation cleanup": "chat",
    "generation profiles": "chat",
    "generation metadata": "chat",
    "OOC": "chat",

    "chat list": "chatList",
    "saved chat actions": "chatList",
    "saved chat actions cleanup": "chatList",
    "import visible opened chats": "chatList",

    "favorite bots import": "listings",
    "favorite history": "listings",
    "NSFW toggle": "listings",
    "tag template": "listings",
    "tag template button": "listings",
    "recommendation helpers": "listings",
    "recommendation helper cleanup": "listings",
    "card hiding": "listings",
    "card hiding settled": "listings",
    "card block buttons": "listings",
    "card descriptions": "listings",
    "card greeting token info": "listings",
    "card greeting token cleanup": "listings",
    "listing auto-fill": "listings",
    "listing paint guard": "listings",
    "listing paint cleanup": "listings",
    "listing name sort": "listings",
    "listing name sort cleanup": "listings",
    "smart filter presets": "listings",
    "smart filter cleanup": "listings",
    "creator favorite buttons": "listings",
    "creator follow buttons": "profiles",
    "later buttons": "listings",
    "bot organizer": "listings",
    "bot organizer settled": "listings",
    "bot organizer context": "profiles",
    "bot organizer cleanup": "listings",
    "card workflow": "listings",
    "card workflow cleanup": "listings",

    "bot editor save actions": "creator",
    "bot editor draft history": "creator",
    "bot editor snippets": "creator",
    "creation bulk input tools": "creator",
    "bot editor backup": "creator",
    "creator backup field restore": "creator",
    "creator moderation warnings": "creator",
    "moderation warning cleanup": "creator",
    "creation audit": "creator",
    "creation audit cleanup": "creator",
    "my creations view memory": "creator",
    "my creations view memory cleanup": "creator",
    "my creations auto-load": "creator",
    "my creations filters": "creator",
    "my creations filter cleanup": "creator",

    "lorebook entry expanders": "lorebook",
    "lorebook entry cleanup": "lorebook",
    "wiki lorebook importer": "lorebook",
    "lorebook workflow tools": "lorebook",
    "lorebook backup": "lorebook",
    "lorebook listing tools": "lorebook",
    "lorebook listing cleanup": "lorebook",
    "lorebook search filter": "lorebook",
    "lorebook search filter cleanup": "lorebook",
    "lorebook tag expansion": "lorebook",

    "persona page": "personas",
    "persona page cleanup": "personas",
    "persona organizer": "personas",
    "persona organizer cleanup": "personas",
    "personas": "personas",

    "bot archive profile capture": "profiles",
    "bot archive chat refresh": "profiles"
  });

  function counters() {
    return DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
  }

  function normalizeBundle(name) {
    return BUNDLE_BITS[name] ? name : "core";
  }

  function taskGroupForName(name) {
    return TASK_GROUP_HINTS[String(name || "")] || "core";
  }

  function isBundleAvailable(name) {
    const bundle = normalizeBundle(name);
    return bundle === "core" || availableBundles.has(bundle);
  }

  function profileMask() {
    return buildMask;
  }

  function canRunRouteGroup(plan, group) {
    if (!group || group === "core" || group === "global") return true;
    if (BUNDLE_BITS[group]) {
      if (!isBundleAvailable(group)) return false;
      if (Number.isFinite(plan?.bundleMask)) return !!(plan.bundleMask & BUNDLE_BITS[group]);
      return !!plan?.[group];
    }
    return !!plan?.[group];
  }

  async function runFeature({ name, group, plan = null, wanted = true, run, execute, deepSleep = false }) {
    if (typeof run !== "function") return null;
    const resolvedGroup = group || taskGroupForName(name);
    const perf = counters();

    if (BUNDLE_BITS[resolvedGroup] && !isBundleAvailable(resolvedGroup)) {
      perf.buildBundleStepSkips = Number(perf.buildBundleStepSkips || 0) + 1;
      return null;
    }

    if (plan && !canRunRouteGroup(plan, resolvedGroup)) {
      perf.routeFeatureStepSkips = Number(perf.routeFeatureStepSkips || 0) + 1;
      return null;
    }

    const resolvedWanted = typeof wanted === "function" ? !!wanted() : !!wanted;
    if (deepSleep && !resolvedWanted) {
      perf.disabledFeatureStepSkips = Number(perf.disabledFeatureStepSkips || 0) + 1;
      return null;
    }

    perf.runtimeKernelRuns = Number(perf.runtimeKernelRuns || 0) + 1;
    const runner = typeof execute === "function" ? execute : (fn => fn());
    return runner(run, name);
  }

  DS.RUNTIME_BUNDLE_ORDER = BUNDLE_ORDER;
  DS.RUNTIME_BUNDLE_BITS = BUNDLE_BITS;
  DS.RUNTIME_FULL_BUNDLE_MASK = FULL_MASK;
  DS.RUNTIME_BUILD_MASK = buildMask;
  DS.RUNTIME_TASK_GROUP_HINTS = TASK_GROUP_HINTS;
  DS.getBuildProfile = () => ({
    id: String(rawProfile.id || "full"),
    label: String(rawProfile.label || rawProfile.id || "Full"),
    generated: !!rawProfile.generated,
    bundles: BUNDLE_ORDER.filter(name => isBundleAvailable(name))
  });
  DS.isRuntimeBundleAvailable = isBundleAvailable;
  DS.runtimeTaskGroupForName = taskGroupForName;
  DS.runtimeKernel = Object.freeze({
    runFeature,
    canRunRouteGroup,
    taskGroupForName,
    isBundleAvailable,
    profileMask
  });
})();
