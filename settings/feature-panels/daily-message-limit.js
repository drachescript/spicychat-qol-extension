// Daily Message Limit owns its Settings panel and setting handlers.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes('daily-message-limit')) return;
  const host = document.getElementById('ds-feature-panel-daily-message-limit');
  if (!host) return;
  const section = document.createElement('section');
  section.className = 'card';
  section.id = 'dailyMessageLimitSettingsCard';
  const heading = document.createElement('h2');
  heading.textContent = 'Daily message limit';
  const label = document.createElement('label');
  label.className = 'row';
  const checkbox = document.createElement('input');
  checkbox.id = 'dailyMessageLimitTrackerEnabled';
  checkbox.type = 'checkbox';
  const caption = document.createElement('span');
  caption.textContent = 'Show the daily message counter and estimated reset time in chat';
  label.append(checkbox, caption);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'The counter uses observed activity and may differ from SpicyChat’s account limit.';
  section.append(heading, label, hint);
  host.replaceWith(section);
  (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null)).dailyMessageLimitTrackerEnabled =
    () => checkbox.checked;
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null)).dailyMessageLimitTrackerEnabled =
    settings => { checkbox.checked = settings.dailyMessageLimitTrackerEnabled === true; };
})();
