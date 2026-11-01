// The Selection Memory feature owns its Settings toggle independently of Context Keeper.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes('selection-memory')) return;
  const host = document.getElementById('ds-feature-panel-selection-memory');
  if (!host) return;
  const section = document.createElement('section');
  section.className = 'card';
  section.id = 'selectionMemorySettingsCard';
  const header = document.createElement('h2');
  header.textContent = 'Remember selected text';
  const label = document.createElement('label');
  label.className = 'row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'enableSelectionRemember';
  const caption = document.createElement('span');
  caption.textContent = 'Show Remember when selecting text in a chat message';
  label.append(input, caption);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Save text you select to your local memory tools. This does not change the original chat.';
  section.append(header, label, hint);
  host.replaceWith(section);
  (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null)).enableSelectionRemember =
    () => input.checked;
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null)).enableSelectionRemember =
    settings => { input.checked = settings.enableSelectionRemember === true; };
})();
