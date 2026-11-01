// Settings panel owned by translation. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("translation")) return;
  const host = document.getElementById("ds-feature-panel-translation");
  if (!host) return;
  const make = (entry) => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attributes, ...children] = entry;
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined) continue;
      node.setAttribute(key, value);
    }
    for (const child of children) node.appendChild(make(child));
    return node;
  };
  host.replaceWith(make(["section",{"class":"card","id":"translationSettingsCard"},"\n",["h2",{},"Chat translation"],"\n",["p",{"class":"hint"},"All translation is optional. Original messages remain unchanged. On-device translation keeps text on your device; choosing DeepL, LibreTranslate or an external translator sends selected text to that service. Automatic mode never silently falls back to a remote service."],"\n",["label",{},"Translation provider\n",["select",{"id":"translationProvider"},"\n",["option",{"value":"auto"},"Automatic — try on-device first"],"\n",["option",{"value":"local"},"Browser on-device (no account)"],"\n",["option",{"value":"deepl"},"DeepL API"],"\n",["option",{"value":"libre"},"LibreTranslate instance"],"\n",["option",{"value":"external"},"Open Google Translate in a new tab (manual only)"],"\n"]],"\n",["label",{"class":"row"},["input",{"id":"translationAllowRemoteFallback","type":"checkbox"}],["span",{},"Allow Automatic provider to fall back to my configured DeepL API when on-device translation is unavailable"]],"\n",["p",{"class":"hint"},"On-device support varies by browser, language pair, and installed models. First use may download a language model. The external translator opens a browser tab only when clicked; it never auto-translates."],"\n",["div",{"class":"button-row"},["button",{"id":"testLocalTranslator","type":"button"},"Check on-device support"],["span",{"class":"hint","id":"localTranslatorStatus"}]],"\n",["div",{"class":"button-row"},["button",{"id":"copyEnglishFirstOoc","type":"button"},"Copy English-first OOC instruction"]],"\n",["p",{"class":"hint"},"Optional: paste this through the existing OOC composer to ask the AI to generate in English first, then translate the displayed message with QoL. This is an instruction, not guaranteed model enforcement."],"\n",["label",{"class":"row"},["input",{"id":"translationPerChatControls","type":"checkbox"}],["span",{},"Show a per-chat target-language selector beside the chat translation controls"]],"\n",["label",{"class":"row"},["input",{"id":"enableTranslation","type":"checkbox"}],["span",{},"Enable translation tools"]],"\n",["div",{"class":"sub-card"},["h3",{},"Initial greeting translation"],["label",{"class":"row"},["input",{"id":"translationGreetingButton","type":"checkbox"}],["span",{},"Show a free Translate greeting button under the first bot message"]],["label",{"class":"row"},["input",{"id":"translationAutoGreeting","type":"checkbox"}],["span",{},"Try on-device greeting translation automatically (off by default)"]],["p",{"class":"hint"},"Greeting translation tries the browser's on-device translator first, without sending a chat message. If unsupported, use the manual Google Translate link or explicitly choose your configured provider. The original greeting stays unchanged. Requires Enable translation tools."]],"\n",["label",{"class":"row"},["input",{"id":"translationShowMessageButtons","type":"checkbox"}],["span",{},"Show Translate on individual chat messages"]],"\n",["label",{"class":"row"},["input",{"id":"translationAutoAi","type":"checkbox"}],["span",{},"Automatically translate AI replies when needed"]],"\n",["label",{"class":"row"},["input",{"id":"translationAutoUser","type":"checkbox"}],["span",{},"Automatically translate user messages when needed"]],"\n",["label",{},"Translate to\n          ",["select",{"id":"translationTargetLanguage"},"\n",["option",{"value":"EN-US"},"English (US)"],"\n",["option",{"value":"EN-GB"},"English (UK)"],"\n",["option",{"value":"DE"},"German"],"\n",["option",{"value":"FR"},"French"],"\n",["option",{"value":"ES"},"Spanish"],"\n",["option",{"value":"IT"},"Italian"],"\n",["option",{"value":"ID"},"Indonesian"],"\n",["option",{"value":"PT-BR"},"Portuguese (Brazil)"],"\n",["option",{"value":"PT-PT"},"Portuguese (Portugal)"],"\n",["option",{"value":"NL"},"Dutch"],"\n",["option",{"value":"PL"},"Polish"],"\n",["option",{"value":"RU"},"Russian"],"\n",["option",{"value":"UK"},"Ukrainian"],"\n",["option",{"value":"JA"},"Japanese"],"\n",["option",{"value":"KO"},"Korean"],"\n",["option",{"value":"ZH-HANS"},"Chinese (Simplified)"],"\n"],"\n"],"\n",["label",{},"Languages you already understand\n          ",["input",{"id":"translationUnderstoodLanguages","placeholder":"EN, DE","type":"text"}],"\n"],"\n",["p",{"class":"hint"},"Use language codes separated by commas. Auto translate tries to leave messages alone when they already look like one of these languages."],"\n",["label",{},"Never translate these terms\n          ",["textarea",{"id":"translationProtectedTerms","placeholder":"{{user}}\n{{char}}\nCharacterName","spellcheck":"false"}],"\n"],"\n",["p",{"class":"hint"},"One term per line. QoL also protects common placeholders, links, and inline/code-block text automatically."],"\n",["div",{"class":"sub-card"},["h3",{},"LibreTranslate (optional)"],"\n",["label",{},"Instance URL",["input",{"id":"libreTranslateUrl","type":"url","placeholder":"https://your-translator.example","autocomplete":"off"}]],"\n",["label",{},"API key (only if your instance requires one)",["input",{"id":"libreTranslateApiKey","type":"password","autocomplete":"off"}]],"\n",["div",{"class":"button-row"},["button",{"id":"saveLibreTranslate","type":"button"},"Save instance / request access"],["button",{"id":"testLibreTranslate","type":"button"},"Test instance"]],"\n",["p",{"id":"libreTranslateStatus","class":"hint"},"No LibreTranslate instance configured. Use a server you trust: messages are sent to its operator."]],"\n",["label",{},"DeepL API key\n          ",["input",{"autocomplete":"off","id":"deeplApiKey","placeholder":"Paste your DeepL API key","type":"password"}],"\n"],"\n",["div",{"class":"button-row"},"\n",["button",{"id":"saveDeeplKey","type":"button"},"Save API key"],"\n",["button",{"id":"testDeepl","type":"button"},"Test DeepL"],"\n",["button",{"id":"checkDeeplUsage","type":"button"},"Check usage"],"\n"],"\n",["p",{"class":"hint","id":"deeplStatus"},"DeepL is not configured yet."],"\n",["details",{"class":"settings-details"},"\n",["summary",{},"How to set up DeepL"],"\n",["ol",{"class":"settings-steps"},"\n",["li",{},"Create or sign in to a DeepL account."],"\n",["li",{},"Enable a DeepL API plan."],"\n",["li",{},"Open the API Keys area in your DeepL account and copy your key."],"\n",["li",{},"Paste it above, save it, then press Test DeepL."],"\n"],"\n",["p",{"class":"hint"},"The key is stored only in this browser's extension storage and is left out of QoL backups and diagnostics. When you translate, the selected message text is sent directly to DeepL, not to DragonScript."],"\n",["p",{"class":"hint"},"Android/WebView: some app builds cannot show Chrome's optional host-permission prompt. QoL will still save the key and let Test DeepL check whether the app can reach DeepL. If that test still fails with a network/permission error, the Android wrapper needs DeepL host access."],"\n"],"\n"]));

  // Only installed panels register their Settings readers and loaders.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableTranslation"] = () => (checked("enableTranslation"));
  loaders["enableTranslation"] = (settings) => { setChecked("enableTranslation", !!settings.enableTranslation); };
  readers["translationShowMessageButtons"] = () => (checked("translationShowMessageButtons"));
  loaders["translationShowMessageButtons"] = (settings) => { setChecked("translationShowMessageButtons", !!settings.translationShowMessageButtons); };
  readers["translationGreetingButton"] = () => checked("translationGreetingButton");
  loaders["translationGreetingButton"] = (settings) => { setChecked("translationGreetingButton", !!settings.translationGreetingButton); };
  readers["translationAutoGreeting"] = () => checked("translationAutoGreeting");
  loaders["translationAutoGreeting"] = (settings) => { setChecked("translationAutoGreeting", !!settings.translationAutoGreeting); };
  readers["translationAutoAi"] = () => (checked("translationAutoAi"));
  loaders["translationAutoAi"] = (settings) => { setChecked("translationAutoAi", !!settings.translationAutoAi); };
  readers["translationAutoUser"] = () => (checked("translationAutoUser"));
  loaders["translationAutoUser"] = (settings) => { setChecked("translationAutoUser", !!settings.translationAutoUser); };
  readers["translationProvider"] = () => (value("translationProvider", "deepl"));
  loaders["translationProvider"] = (settings) => { setValue("translationProvider", settings.translationProvider || "deepl"); };
  readers["libreTranslateUrl"] = () => (value("libreTranslateUrl", "").trim());
  loaders["libreTranslateUrl"] = (settings) => { setValue("libreTranslateUrl", settings.libreTranslateUrl || ""); };
  readers["translationAllowRemoteFallback"] = () => (checked("translationAllowRemoteFallback"));
  loaders["translationAllowRemoteFallback"] = (settings) => { setChecked("translationAllowRemoteFallback", !!settings.translationAllowRemoteFallback); };
  readers["translationPerChatControls"] = () => (checked("translationPerChatControls"));
  loaders["translationPerChatControls"] = (settings) => { setChecked("translationPerChatControls", !!settings.translationPerChatControls); };
  readers["translationTargetLanguage"] = () => (value("translationTargetLanguage", "EN-US"));
  loaders["translationTargetLanguage"] = (settings) => { setValue("translationTargetLanguage", settings.translationTargetLanguage || "EN-US"); };
  readers["translationUnderstoodLanguages"] = () => (value("translationUnderstoodLanguages", "EN"));
  loaders["translationUnderstoodLanguages"] = (settings) => { setValue("translationUnderstoodLanguages", settings.translationUnderstoodLanguages || "EN"); };
  readers["translationProtectedTerms"] = () => (value("translationProtectedTerms", ""));
  loaders["translationProtectedTerms"] = (settings) => { setValue("translationProtectedTerms", settings.translationProtectedTerms || ""); };
  // This feature alone owns the DeepL and translation Settings buttons.
  async function saveDeepLKey({ quiet = false } = {}) {
    const status = $("deeplStatus");
    const key = String(value("deeplApiKey", "") || "").trim();
    if (!key) {
      await storageSet({ [DEEPL_API_KEY]: "" });
      if (status && !quiet) status.textContent = "DeepL API key cleared.";
      return true;
    }

    const env = detectSettingsEnvironment();
    const granted = await ensureDeepLPermission();
    if (!granted && !env.webview) {
      if (status) status.textContent = "DeepL permission was not granted, so translation stays unavailable.";
      return false;
    }

    // Some Android/WebView wrappers expose extension storage/runtime APIs but do
    // not implement Chrome's optional host-permission prompt. Do not throw away a
    // valid key in that case: save it locally and let Test DeepL determine whether
    // the wrapper/background can actually reach the DeepL endpoint.
    await storageSet({ [DEEPL_API_KEY]: key });
    if (status && !quiet) {
      status.textContent = granted
        ? "DeepL API key saved locally."
        : "DeepL API key saved locally. This Android/WebView build could not request Chrome host permission; press Test DeepL to check app access.";
    }
    return true;
  }

  async function testDeepL() {
    const status = $("deeplStatus");
    if (status) status.textContent = "Testing DeepL...";
    if (!(await saveDeepLKey({ quiet: true }))) return;
    const response = await runtimeMessage({ type: "DS_DEEPL_TEST" });
    if (!response?.ok) {
      const env = detectSettingsEnvironment();
      const error = String(response?.error || "unknown error");
      if (status) {
        status.textContent = env.webview && (!response || /failed to fetch|network|permission|host/i.test(error))
          ? `DeepL test failed in Android/WebView: ${error}. The key is saved; this app build may need DeepL host/network access added by the Android wrapper.`
          : `DeepL test failed: ${error}`;
      }
      return;
    }
    const limit = Number(response.characterLimit || 0);
    const used = Number(response.characterCount || 0);
    if (status) status.textContent = limit > 0
      ? `DeepL connected. ${used.toLocaleString()} / ${limit.toLocaleString()} characters used.`
      : "DeepL connected.";
  }

  async function checkDeepLUsage() {
    const status = $("deeplStatus");
    if (status) status.textContent = "Checking DeepL usage...";
    if (!(await saveDeepLKey({ quiet: true }))) return;
    const response = await runtimeMessage({ type: "DS_DEEPL_USAGE" });
    if (!response?.ok) {
      if (status) status.textContent = `Could not read DeepL usage: ${response?.error || "unknown error"}`;
      return;
    }
    const limit = Number(response.characterLimit || 0);
    const used = Number(response.characterCount || 0);
    if (status) status.textContent = limit > 0
      ? `DeepL usage: ${used.toLocaleString()} / ${limit.toLocaleString()} characters.`
      : `DeepL usage: ${used.toLocaleString()} characters.`;
  }

  // Installed Translation owns its buttons and their one-time event binding.
  // In generated Lite builds the panel and this helper are both omitted.
  function bindTranslationSettingsEvents() {
  $("saveLibreTranslate")?.addEventListener("click", () => saveLibreInstance());
  $("testLibreTranslate")?.addEventListener("click", () => saveLibreInstance({ testing: true }));
  $("copyEnglishFirstOoc")?.addEventListener("click", async () => {
    const instruction = "(OOC: Please write your next replies in natural English, preserving character names, dialogue formatting and actions. My chat interface may translate your responses for display. Do not translate or control my character's own dialogue.)";
    try {
      await navigator.clipboard.writeText(instruction);
      showSettingsToast("English-first OOC copied. Paste it into chat using your usual OOC workflow.");
    } catch { showSettingsToast("Could not copy. Enable clipboard access or copy the instruction manually."); }
  });
  $("testLocalTranslator")?.addEventListener("click", async () => {
    const host = $("localTranslatorStatus");
    if (!host) return;
    // Options pages and content scripts can expose the same Chrome Translator API.
    const API = globalThis.Translator;
    if (!API?.availability || !API?.create) { host.textContent = "This browser doesn't expose the on-device Translator API to QoL."; return; }
    host.textContent = "Checking language model...";
    try {
      const targetLanguage = value("translationTargetLanguage", "DE").split("-")[0].toLowerCase();
      const sourceLanguage = targetLanguage === "en" ? "de" : "en";
      const state = await API.availability({ sourceLanguage, targetLanguage });
      host.textContent = `On-device support (${sourceLanguage} → ${targetLanguage}): ${state}. A model download may be needed.`;
    } catch (error) { host.textContent = error?.message || String(error); }
  });
  $("saveDeeplKey")?.addEventListener("click", () => saveDeepLKey());
  $("testDeepl")?.addEventListener("click", testDeepL);
  $("checkDeeplUsage")?.addEventListener("click", checkDeepLUsage);
  }
  if (document.readyState === 'complete') bindTranslationSettingsEvents();
  else window.addEventListener('load', bindTranslationSettingsEvents, { once: true });
})();
