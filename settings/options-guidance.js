// V0.2.85: small, static, contextual Settings guidance. Does not poll/observe.
(() => {
  "use strict";
  if (document.documentElement.dataset.dsqGuidanceInstalled === "1") return;
  document.documentElement.dataset.dsqGuidanceInstalled = "1";
  const GUIDES = Object.freeze({
    creation: { url: "https://spicychat-guides.drache.uk/bots/", label: "Bot creation guide" },
    lorebook: { url: "https://spicychat-guides.drache.uk/lorebook/", label: "Lorebook guide" },
    rulebook: { url: "https://spicychat-guides.drache.uk/rulebook/", label: "Rulebook guide" },
    memory: { url: "https://docs.spicychat.ai/product-guides/premium-features/memory-manager", label: "Official native Memory guide" },
    qol: { url: "https://spicychat-guides.drache.uk/qol/", label: "QoL guide" }
  });
  function addAfterHeading(panel, key) {
    if (!panel || panel.querySelector(`.dsq-guide-link[data-guide="${key}"]`)) return;
    const heading = panel.querySelector("h2,h3");
    if (!heading) return;
    const config = GUIDES[key];
    const a = document.createElement("a");
    a.className = "dsq-guide-link";
    a.dataset.guide = key;
    a.href = config.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = `Read guide: ${config.label}`;
    a.setAttribute("aria-label", `Read guide: ${config.label} (opens in a new tab)`);
    heading.insertAdjacentElement("afterend", a);
  }
  function paragraph(text, className = "hint") {
    const el = document.createElement("p");el.className = className;el.textContent = text;return el;
  }
  addAfterHeading(document.querySelector("#ds-feature-panel-creation-audit, #creationAuditCard")?.closest("section") ||
    [...document.querySelectorAll("section.card")].find(s=>s.querySelector("#enableCreationAudit")), "creation");
  addAfterHeading(document.querySelector("#contextKeeperCard"), "qol");
  addAfterHeading(document.querySelector("#nativeMemoryProbeCard"), "memory");
  addAfterHeading(document.querySelector("#rulebookDiagnosticsCard"), "rulebook");
  addAfterHeading(document.querySelector("#creatorBackupCard"), "lorebook");
  addAfterHeading(document.querySelector("#chatExportCompatibilityCard"), "qol");
  const memoryPage=document.querySelector('[data-page="personas-memory"]');
  if(memoryPage && !document.querySelector("#dsq-memory-differences")) {
    const section=document.createElement("section");section.className="card";section.id="dsq-memory-differences";
    const title=document.createElement("h2");title.textContent="Where your story information actually goes";section.append(title);
    const list=document.createElement("dl");list.className="dsq-guidance-definitions";
    for (const [name,detail] of [
      ["Native SpicyChat Memories", "Stored and selected by SpicyChat. Native automatic memory updates follow the site's own lifecycle. QoL's read-only monitor does not create or update them."],
      ["Context Keeper", "Local QoL story facts. They do NOT become native Memories. Only an explicitly inserted recap or enabled automatic recall puts them in outgoing chat text."],
      ["Local Lorebooks", "Local keyword-matched entries, separate from a native attached Lorebook. Saved entries do not automatically appear in chat context unless the relevant local recall or send feature is enabled."],
      ["Native attached Lorebooks / Rulebooks", "SpicyChat-managed features with their own activation rules. Local QoL copies or backups do not mean a native item was successfully saved or attached."]
    ]) {const dt=document.createElement("dt");dt.textContent=name;const dd=document.createElement("dd");dd.textContent=detail;list.append(dt,dd);}
    section.append(list);
    const link=document.createElement("a");link.className="dsq-guide-link";link.href=GUIDES.qol.url;link.rel="noopener noreferrer";link.target="_blank";link.textContent="Read guide: QoL Memory and privacy";section.append(link);
    const before=memoryPage.querySelector("section.card");if(before)memoryPage.insertBefore(section,before);else memoryPage.append(section);
  }
  const audit=[...document.querySelectorAll("section.card")].find(el=>el.querySelector("#enableCreationAudit"));
  if(audit && !audit.querySelector(".dsq-creation-audit-guidance")){
    const note=paragraph("Audit results distinguish confirmed missing fields from information SpicyChat did not expose. 'Could not verify' is NOT proof that a field is missing. Other warnings are advisory and should be checked against the current creator guide.");
    note.classList.add("dsq-creation-audit-guidance");audit.append(note);
  }
  const data=document.querySelector("#backupRestoreCard");
  if(data && !data.querySelector(".dsq-backup-safety")){
    const note=document.createElement("div");note.className="dsq-backup-safety";
    const title=document.createElement("strong");title.textContent="Before importing or restoring";
    note.append(title,
      paragraph("Local QoL export: saves selected extension data in this browser, not necessarily SpicyChat's native server content."),
      paragraph("Reviewed import / Merge: inspect the preview and compare records first. Native writes, such as saving an actual Lorebook, are separate actions with their own success checks."),
      paragraph("Replace: overwrites the selected local categories and may remove existing records. Export a current backup first and review selected categories carefully."),
      paragraph("Cloud sync: transfers only supported datasets between linked devices. A local download is not a cloud snapshot, and a cloud transfer is not confirmation of a native save."));
    const h=data.querySelector("h2");h?.insertAdjacentElement("afterend",note);
  }
  const creator=document.querySelector("#creatorBackupCard");
  if(creator && !creator.querySelector(".dsq-creator-backup-safety")){
    const note=paragraph("Editor drafts, local Lorebook JSON backups, and native SpicyChat saves are different. Imported data should be reviewed in the native editor; confirm any native Save result before relying on it. Deletions and Replace can be irreversible without an independent backup.");
    note.classList.add("dsq-creator-backup-safety");creator.append(note);
  }
  const account=document.querySelector('[data-page="account"]');
  if(account && !account.querySelector(".dsq-account-sync-safety")){
    const note=paragraph("Sync is not a full backup and does not edit native SpicyChat Memories or Lorebooks. Before replacing or merging device datasets, export a local snapshot from each device.");
    note.classList.add("dsq-account-sync-safety");account.querySelector(".page-intro")?.insertAdjacentElement("afterend",note);
  }
  const general=document.querySelector('[data-page="general"]');
  if(general && !document.querySelector("#dsq-platform-support")){
    const box=document.createElement("section");box.className="card";box.id="dsq-platform-support";
    const title=document.createElement("h2");title.textContent="Build and platform support";box.append(title);
    let manifest=null;try{manifest=chrome.runtime?.getManifest?.()||null;}catch{}
    const profile=window.__DSQ_BUILD_PROFILE__;
    const ua=navigator.userAgent||"";
    const type=profile?.generated ? "Custom / Lite (experimental)" : "Full";
    const platform=/Firefox\/|FxiOS\//i.test(ua)?"Firefox":/Android/i.test(ua)?"Android / WebView":/Chrome\/|Chromium\//i.test(ua)?"Chrome / Chromium":"Other / undetected";
    box.append(paragraph(`Current Settings context: ${type} · ${platform} · source version ${manifest?.version || profile?.version || "unknown"}.`));
    box.append(paragraph("Chrome and Firefox use different browser packaging and permission rules. Custom Lite packages have individually selected assets and remain experimental until their dependency closure and browser combinations are tested. Android uses a separate wrapper; desktop browser tabs, helper workers, and downloads may behave differently."));
    box.append(paragraph("Feature availability shown in Settings reflects this runtime where known; it is not a guarantee that every experimental combination has passed live testing."));
    addAfterHeading(box,"qol");
    general.append(box);
  }
})();
