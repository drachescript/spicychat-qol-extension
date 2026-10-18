// Picture Library Settings are only loaded in builds containing its module.
(() => {
  'use strict';
  const profile=window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("picture-library")) return;
  const host=document.getElementById("ds-custom-pictures-feature-settings");
  if (!host) return;
  const label = document.createElement('label');
  label.className = 'row';
  const checkbox = document.createElement('input');
  checkbox.id = "enableCustomPictureLibrary";
  checkbox.type = 'checkbox';
  const description = document.createElement('span');
  description.textContent = "Enable Picture Library (local, optional)";
  label.append(checkbox, description);
  host.appendChild(label);
})();
