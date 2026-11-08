// bot-editor-snippets: Settings markup, load and save handlers for this feature.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("bot-editor-snippets")) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
    for (const child of children) el.appendChild(make(child));
    return el;
  };
  if (!document.getElementById("ds-feature-panel-bot-editor-snippets")) return;
  { const host = document.getElementById("ds-feature-panel-bot-editor-snippets"); host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Bot editor snippets"],"\n",["p",{"class":"hint"},"Adds small insert buttons above longer fields while creating or editing a chatbot. Text is inserted at the current cursor position."],"\n",["label",{"class":"row"},["input",{"id":"botEditorShowCharButton","type":"checkbox"}],["span",{},"Show {{char}} button"]],"\n",["label",{"class":"row"},["input",{"id":"botEditorShowUserButton","type":"checkbox"}],["span",{},"Show {{user}} button"]],"\n",["label",{"class":"row"},["input",{"id":"botEditorShowContinueButton","type":"checkbox"}],["span",{},"Show CONTINUE button"]],"\n",["label",{"class":"row"},["input",{"id":"botEditorShowNoControlButton","type":"checkbox"}],["span",{},"Show a no-control personality-rule button"]],"\n",["label",{"class":"row"},["input",{"id":"botEditorShowCustomSnippets","type":"checkbox"}],["span",{},"Show custom snippet buttons"]],"\n",["div",{"class":"ooc-manager"},"\n",["div",{"class":"ooc-manager-head"},"\n",["div",{},"\n",["h3",{},"Custom snippets"],"\n",["p",{"class":"hint"},"Useful for reusable personality, scenario, greeting, or formatting text."],"\n"],"\n",["button",{"id":"addBotEditorSnippet","type":"button"},"+ Add snippet"],"\n"],"\n",["div",{"class":"ooc-template-list","id":"botEditorSnippetList"}],"\n"],"\n",["p",{"class":"hint"},"Persistent OOC-style rules belong in Personality or Scenario. The normal OOC tool only inserts into the user side of a chat."],"\n"])); }
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["botEditorShowCharButton"] = () => checked("botEditorShowCharButton");
  loaders["botEditorShowCharButton"] = settings => { setChecked("botEditorShowCharButton", !!settings.botEditorShowCharButton); };
  readers["botEditorShowUserButton"] = () => checked("botEditorShowUserButton");
  loaders["botEditorShowUserButton"] = settings => { setChecked("botEditorShowUserButton", !!settings.botEditorShowUserButton); };
  readers["botEditorShowContinueButton"] = () => checked("botEditorShowContinueButton");
  loaders["botEditorShowContinueButton"] = settings => { setChecked("botEditorShowContinueButton", !!settings.botEditorShowContinueButton); };
  readers["botEditorShowNoControlButton"] = () => checked("botEditorShowNoControlButton");
  loaders["botEditorShowNoControlButton"] = settings => { setChecked("botEditorShowNoControlButton", !!settings.botEditorShowNoControlButton); };
  readers["botEditorShowCustomSnippets"] = () => checked("botEditorShowCustomSnippets");
  loaders["botEditorShowCustomSnippets"] = settings => { setChecked("botEditorShowCustomSnippets", !!settings.botEditorShowCustomSnippets); };
})();
