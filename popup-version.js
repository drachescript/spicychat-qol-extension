(() => {
  "use strict";

  function getDisplayVersion(manifest) {
    const named = String(manifest?.version_name || "").trim();
    if (named) return named;

    const technical = String(manifest?.version || "").trim();
    const match = technical.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return technical;

    const [, major, minor, patch, rawBuild] = match;
    const build = Number(rawBuild);

    // Chrome compares each dotted component as an integer. QoL uses
    // 700+ technical builds to stay above the previously published 641,
    // while users continue to see the normal 70+ release sequence.
    if (major === "0" && minor === "1" && patch === "9" && Number.isInteger(build) && build >= 700) {
      return `${major}.${minor}.${patch}.${build - 630}`;
    }

    return technical;
  }

  const manifest = chrome.runtime.getManifest();
  const displayVersion = getDisplayVersion(manifest);
  const versionEl = document.getElementById("version");
  if (!versionEl || !displayVersion) return;

  const wanted = `v${displayVersion}`;
  const apply = () => {
    if (versionEl.textContent !== wanted) versionEl.textContent = wanted;
  };

  apply();

  // popup.js historically wrote manifest.version directly. Keep this guard
  // only during popup startup so a later initialization write cannot leak
  // the technical store number back into the visible UI.
  const observer = new MutationObserver(apply);
  observer.observe(versionEl, { childList: true, characterData: true, subtree: true });
  setTimeout(() => {
    apply();
    observer.disconnect();
  }, 1200);
})();
