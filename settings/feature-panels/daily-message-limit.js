// Optional Custom Lite Settings panel for passive daily-message-limit notices.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("daily-message-limit")) return;
  const host = document.getElementById("ds-feature-panel-daily-message-limit");
  if (!host) return;
  const card = document.createElement("section");
  card.className = "card";
  card.id = "dailyMessageLimitCard";
  const title = document.createElement("h2");
  title.textContent = "Daily message-limit notice";
  const label = document.createElement("label");
  label.className = "row";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = "dailyMessageLimitTrackerEnabled";
  const span = document.createElement("span");
  span.textContent = "Show a notice when SpicyChat reports the daily message limit";
  label.append(input, span);
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = "Only reacts to a native limit error. The reset countdown is an estimate from your local midnight, not a verified reset time. No messages are sent to test it.";
  card.append(title, label, note);
  (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null)).dailyMessageLimitTrackerEnabled = () => input.checked;
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null)).dailyMessageLimitTrackerEnabled = settings => { input.checked = settings.dailyMessageLimitTrackerEnabled === true; };
  host.replaceWith(card);
})();
