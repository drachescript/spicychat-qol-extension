// premium-notifications: optional feature-owned Settings, including its saved-setting handlers.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("premium-notifications")) return;
  const host = document.getElementById('ds-feature-panel-premium-notifications');
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card","id":"notificationCleanupCard"},["h2",{},"Notifications"],["p",{"class":"hint"},"Optional cleanup for SpicyChat notification controls and browser-tab notification badges."],["label",{"class":"row"},["input",{"id":"hideNotifications","type":"checkbox"}],["span",{},"Hide notifications button/badge on SpicyChat"]],["label",{"class":"row"},["input",{"id":"hideFeatureReleasePopups","type":"checkbox"}],["span",{},"Hide feature release popups"]],["label",{"class":"row"},["input",{"id":"hideTabNotificationBadge","type":"checkbox"}],["span",{},"Hide unread notification badge from the browser tab"]],["label",{"class":"row"},["input",{"id":"autoReadNotifications","type":"checkbox"}],["span",{},"Clear new product-update notifications in background tabs"]],["p",{"class":"hint"},"Auto-read is experimental. If it opens something weird, turn it back off."]]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["hideNotifications"] = () => checked("hideNotifications");
  loaders["hideNotifications"] = settings => { setChecked("hideNotifications", settings.hideNotifications); };
  readers["hideFeatureReleasePopups"] = () => checked("hideFeatureReleasePopups");
  loaders["hideFeatureReleasePopups"] = settings => { setChecked("hideFeatureReleasePopups", !!settings.hideFeatureReleasePopups); };
  readers["hideTabNotificationBadge"] = () => checked("hideTabNotificationBadge");
  loaders["hideTabNotificationBadge"] = settings => { setChecked("hideTabNotificationBadge", !!settings.hideTabNotificationBadge); };
  readers["autoReadNotifications"] = () => checked("autoReadNotifications");
  loaders["autoReadNotifications"] = settings => { setChecked("autoReadNotifications", settings.autoReadNotifications); };
})();
