// Feature-owned options helpers: translation. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

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
