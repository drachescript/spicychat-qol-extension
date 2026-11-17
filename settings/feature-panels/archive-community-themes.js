// Feature-owned Archive Community Themes Settings panel. No network access.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes('archive-community-themes')) return;
  const host = document.getElementById('ds-feature-panel-archive-community-themes');
  if (!host) return;
  host.outerHTML = "<div class=\"sub-card\" id=\"archiveCommunityThemeSettings\">\n<h3>Archive Community Themes (optional)</h3>\n<label class=\"row\"><input id=\"archiveCommunityThemesEnabled\" type=\"checkbox\"/><span>Use public Archive community evidence when filtering bot cards</span></label>\n<label>How much evidence to hide\n<select id=\"archiveCommunityThemesMode\"><option value=\"reviewed\">Human-reviewed only (verified)</option><option value=\"candidates\">Reviewed + deterministic title-rule candidates (unverified)</option></select>\n</label>\n<label class=\"row\"><input id=\"archiveCommunityThemesRiskWarnings\" type=\"checkbox\"/><span>Show warnings for matching candidate / historical-only tags without hiding them</span></label>\n<label>Additional themes to filter (IDs or names, one per line)\n<textarea id=\"archiveCommunityThemesExtraTags\" rows=\"3\" spellcheck=\"false\" placeholder=\"emotional-affair&#10;relationship-boundary-risk&#10;bullying\"></textarea></label>\n<label>Bot UUIDs never to hide using Archive evidence (one per line)\n<textarea id=\"archiveCommunityThemesAllowIds\" rows=\"2\" spellcheck=\"false\" placeholder=\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\"></textarea></label>\n<p class=\"hint\">Starts OFF. Uses your existing blocked tags and native negative tag filters, plus optional themes above. Only sends visible bot UUIDs (up to 80 per request); never sends chats, definitions, settings, browsing history, or private data. Reviewed matches are verified; title-rule matches are only candidates; historical tags are <strong>not proof of a current theme</strong> and only appear as optional warnings. All matching is reversible and hide-only, with no automatic Block, Dislike or Less Like. Unknown Archive results never mean safe. Local Implied Themes keep working if Archive is offline. A hovered dim card gives an evidence reason, and detailed listing filter reasons are preserved.</p>\n<div class=\"sub-card\">\n<strong>Suggest a missing or incorrect public theme</strong>\n<label>Public bot UUID<input id=\"archiveCommunitySuggestionId\" placeholder=\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\" autocomplete=\"off\"/></label>\n<label>Tag/theme and correction<textarea id=\"archiveCommunitySuggestionText\" rows=\"2\" placeholder=\"e.g. emotional-affair \u2014 public description explicitly states...\" spellcheck=\"false\"></textarea></label>\n<button type=\"button\" id=\"archiveCommunitySuggestButton\">Draft GitHub review suggestion</button>\n<p class=\"hint\" id=\"archiveCommunitySuggestStatus\">Opens a GitHub issue draft for you to review and submit. Nothing is sent automatically, and no personal chats or private definitions are included.</p>\n</div>\n</div>";
  const button = document.getElementById('archiveCommunitySuggestButton');
  if (!button) return;
  button.addEventListener('click', () => {
    const id = String(document.getElementById('archiveCommunitySuggestionId')?.value || '').trim().toLowerCase();
    const idea = String(document.getElementById('archiveCommunitySuggestionText')?.value || '').trim().slice(0,1000);
    const status = document.getElementById('archiveCommunitySuggestStatus');
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id) || idea.length < 5) {
      if(status)status.textContent='Enter a valid public bot UUID and explain the proposed tag or correction.';
      return;
    }
    const url = new URL('https://github.com/drachescript/spicychat-archive/issues/new');
    url.searchParams.set('title',`Community theme review: ${id}`);
    url.searchParams.set('body',`Public bot UUID: ${id}\n\nProposed public tag/correction:\n${idea}\n\nEvidence: [Please cite public title or description only; no private chats or definitions.]\n\nFor human review; this is not a verified classification.`);
    window.open(url.href,'_blank','noopener,noreferrer');
    if(status)status.textContent='Review your GitHub issue draft before submitting. No data was uploaded by QoL.';
  });
})();
