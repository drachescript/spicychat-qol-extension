// Settings markup for persona-pictures; safe to omit from a Custom Lite package.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("persona-pictures")) return;
  const target = document.getElementById("ds-custom-pictures-feature-settings");
  if (!target) return;
  const label = document.createElement('label');
  label.className = 'row';
  const checkbox = document.createElement('input');
  checkbox.id = "enableCustomPersonaPictures";
  checkbox.type = 'checkbox';
  const description = document.createElement('span');
  description.textContent = "Enable per-chat Persona Pictures";
  label.append(checkbox, description);
  target.appendChild(label);
})();
