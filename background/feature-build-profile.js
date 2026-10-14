"use strict";
// Full build: null means that every installed feature is available.
// A verified Custom build generates this file with the same feature IDs as
// content/build-profile.js. Never write the user's personal settings here.
const DSQ_BACKGROUND_BUILD_PROFILE = Object.freeze({
  id: "full", features: null
});
function dsqBackgroundHasFeature(featureId) {
  const selected = DSQ_BACKGROUND_BUILD_PROFILE.features;
  return !Array.isArray(selected) || selected.includes(String(featureId || ""));
}
