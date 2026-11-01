// Persona counter Settings. No runtime work if personas are excluded from Custom Lite.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes('personas')) return;
  const host = document.getElementById('ds-feature-panel-personas');
  if (!host) return;
  const label = document.createElement('label');
  label.className = 'row';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'showPersonaLimitIndicator';
  const text = document.createElement('span');
  text.textContent = 'Show Persona count and plan limit on My Personas';
  label.append(checkbox, text);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Detects your account limit when SpicyChat provides it. Otherwise, a plan dropdown appears on My Personas while this feature is enabled.';
  host.replaceWith(label, hint);
  (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null)).showPersonaLimitIndicator =
    () => checkbox.checked;
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null)).showPersonaLimitIndicator =
    settings => { checkbox.checked = settings.showPersonaLimitIndicator === true; };
})();
