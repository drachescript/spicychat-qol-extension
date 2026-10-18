// Settings markup for automatic-images; safe to omit from a Custom Lite package.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("auto-images")) return;
  const target = document.getElementById("ds-custom-pictures-feature-settings");
  if (!target) return;
  const label = document.createElement('label');
  label.className = 'row';
  const checkbox = document.createElement('input');
  checkbox.id = "showAutoImageInlineButton";
  checkbox.type = 'checkbox';
  const description = document.createElement('span');
  description.textContent = "Show extra IMG settings button beside SpicyChat's image button (off by default)";
  label.append(checkbox, description);
  target.appendChild(label);
})();
