// A separate, opt-in public Archive link feature (not local Bot Archive storage).
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes('archive-website-link')) return;
  const host = document.getElementById('ds-feature-panel-archive-website-link');
  if (!host) return;
  const section = document.createElement('section');
  section.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = 'SpicyChat Archive link';
  const label = document.createElement('label');
  label.className = 'row';
  const checkbox = document.createElement('input');
  checkbox.id = 'showArchiveWebsiteLinks';
  checkbox.type = 'checkbox';
  const caption = document.createElement('span');
  caption.textContent = 'Show an Archive button on bot cards and bot profiles (OFF by default)';
  label.append(checkbox, caption);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Opens the bot ID on spicychatarchive.drache.uk in a new tab. The Archive is independent and may not have a saved copy of every bot. The button makes no background requests.';
  section.append(heading,label,hint);
  host.replaceWith(section);
  (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null)).showArchiveWebsiteLinks =
    () => checkbox.checked;
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null)).showArchiveWebsiteLinks =
    settings => { checkbox.checked = settings.showArchiveWebsiteLinks === true; };
})();
