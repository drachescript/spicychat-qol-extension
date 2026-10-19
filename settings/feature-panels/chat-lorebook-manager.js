// Feature-owned Settings for chat-lorebook-manager, never executes when omitted from Lite.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("chat-lorebook-manager")) return;
  const host = document.getElementById("ds-feature-panel-chat-lorebook-manager");
  if (!host) return;
  const section = document.createElement("section"); section.className = "card";
  const heading = document.createElement("h2"); heading.textContent = "Chat Lorebook Manager"; section.append(heading);
  const fields = [["enableChatLorebookManager", "Show Save to Lorebook draft actions in chat and Memories", "checkbox"]];
  for (const [key, description, kind] of fields) {
    const label = document.createElement("label"); label.className = kind === "checkbox" ? "row" : "";
    const input = document.createElement(kind === "checkbox" ? "input" : "textarea"); input.id = key;
    if (kind === "checkbox") { input.type = "checkbox"; label.append(input); }
    const span = document.createElement("span"); span.textContent = description; label.append(span);
    if (kind !== "checkbox") label.append(input);
    section.append(label);
  }
  const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = "Saves reviewed drafts locally and offers JSON/copy/export. Does not directly write or attach private lorebooks without a verified site operation."; section.append(hint);
  host.replaceWith(section);
})();
