"use strict";
// Translation requests are activated only by explicit background messages.
const DEEPL_API_KEY_STORAGE_KEY = "deeplApiKey";

function deeplBaseUrlForKey(key) {
  return String(key || "").trim().toLowerCase().endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";
}

async function getDeepLKey() {
  const result = await storageLocalGet([DEEPL_API_KEY_STORAGE_KEY]);
  return String(result[DEEPL_API_KEY_STORAGE_KEY] || "").trim();
}

async function deeplRequest(path, { method = "GET", body = null } = {}) {
  const key = await getDeepLKey();
  if (!key) throw new Error("No DeepL API key is saved. Open QoL Settings → Chat UI → Translation.");

  const response = await fetch(`${deeplBaseUrlForKey(key)}${path}`, {
    method,
    headers: {
      "Authorization": `DeepL-Auth-Key ${key}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  let data = null;
  try { data = await response.json(); } catch {}

  if (!response.ok) {
    const detail = data?.message || data?.detail || `DeepL returned HTTP ${response.status}.`;
    throw new Error(detail);
  }

  return data || {};
}

async function deeplTranslate(message) {
  const text = String(message?.text || "").trim();
  const targetLang = String(message?.targetLang || "EN-US").trim().toUpperCase();
  const context = String(message?.context || "").trim();

  if (!text) throw new Error("Nothing to translate.");
  if (text.length > 30000) throw new Error("That message is too long to translate in one request.");

  const body = {
    text: [text],
    target_lang: targetLang
  };
  if (context) body.context = context.slice(0, 4000);

  const data = await deeplRequest("/v2/translate", { method: "POST", body });
  const first = Array.isArray(data.translations) ? data.translations[0] : null;
  if (!first?.text) throw new Error("DeepL did not return a translation.");

  return {
    text: first.text,
    detectedSourceLanguage: first.detected_source_language || ""
  };
}

async function deeplTranslateBatch(message) {
  const texts = Array.isArray(message?.texts)
    ? message.texts.map(value => String(value || "").trim()).filter(Boolean).slice(0, 50)
    : [];
  const targetLang = String(message?.targetLang || "EN-US").trim().toUpperCase();
  const context = String(message?.context || "").trim();
  if (!texts.length) throw new Error("Nothing to translate.");
  if (texts.some(text => text.length > 30000)) throw new Error("One of those messages is too long to translate in one request.");

  const body = { text: texts, target_lang: targetLang };
  if (context) body.context = context.slice(0, 4000);
  const data = await deeplRequest("/v2/translate", { method: "POST", body });
  const translations = Array.isArray(data.translations) ? data.translations : [];
  if (translations.length !== texts.length) throw new Error("DeepL returned an incomplete translation batch.");
  return translations.map(item => ({
    text: item?.text || "",
    detectedSourceLanguage: item?.detected_source_language || ""
  }));
}


async function libreTranslate(message) {
  const urlText = String(message?.settings?.libreTranslateUrl || "").trim();
  const url = new URL(urlText);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("LibreTranslate must use a trusted HTTPS server (localhost HTTP is allowed).");
  const settingsResult = await storageLocalGet([LIBRE_TRANSLATE_KEY_BACKGROUND]);
  const key = String(settingsResult[LIBRE_TRANSLATE_KEY_BACKGROUND] || "");
  const items = Array.isArray(message?.texts) ? message.texts.slice(0, 25) : [message?.text];
  const translations = [];
  for (const item of items) {
    const text = String(item || "").trim();
    if (!text || text.length > 12000) throw new Error("LibreTranslate message is empty or over 12,000 characters.");
    const target = String(message?.targetLang || "EN-US").split("-")[0].toLowerCase();
    const response = await fetch(new URL("translate", url.href.replace(/\/?$/, "/")).href, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: "auto", target, format: "text", ...(key ? { api_key: key } : {}) })
    });
    if (!response.ok) throw new Error(`LibreTranslate HTTP ${response.status}`);
    const data = await response.json();
    if (typeof data?.translatedText !== "string") throw new Error("LibreTranslate returned no translatedText.");
    translations.push({ text: data.translatedText, detectedSourceLanguage: data.detectedLanguage?.language || "", provider: "LibreTranslate" });
  }
  return Array.isArray(message?.texts) ? { translations } : translations[0];
}
const LIBRE_TRANSLATE_KEY_BACKGROUND = "dsLibreTranslateKeyV1";

