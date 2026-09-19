(() => {
  "use strict";

  // Network metadata capture is adapted from S.AI Toolkit by OnyxMizuna.
  // S.AI Toolkit is licensed under GPL-3.0.
  // https://github.com/OnyxMizuna/SAI-Toolkit

  if (window.__DSQ_GENERATION_METADATA_BRIDGE__) return;
  window.__DSQ_GENERATION_METADATA_BRIDGE__ = true;

  const SOURCE = "spicychat-qol-generation-metadata";
  const CONTROL_SOURCE = "spicychat-qol-generation-metadata-control";

  let enabled = false;

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== CONTROL_SOURCE) return;
    if (event.data?.type === "DSQ_GENERATION_METADATA_ENABLED") {
      enabled = !!event.data.enabled;
    }
  });

  function emit(type, payload) {
    if (!enabled) return;
    window.postMessage({ source: SOURCE, type, payload }, "*");
  }

  function urlText(value) {
    if (typeof value === "string") return value;
    if (value && typeof value.url === "string") return value.url;
    try { return String(value || ""); } catch { return ""; }
  }

  function parseJson(value) {
    if (!value) return null;
    if (typeof value === "object" && !(value instanceof FormData) && !(value instanceof URLSearchParams)) {
      return value;
    }
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function isMessagesRequest(method, url) {
    return String(method || "GET").toUpperCase() === "GET" && /\/messages(?:[/?#]|$)/i.test(url);
  }

  function isGenerationRequest(method, url, body) {
    if (String(method || "GET").toUpperCase() !== "POST") return false;
    if (!/(?:\/chat|\/story)/i.test(url)) return false;
    if (/conversation-image|image-generation|\/image(?:[/?#]|$)/i.test(url)) return false;

    const parsed = parseJson(body);
    if (!parsed) return false;

    return (
      typeof parsed.message === "string" ||
      parsed.continue_chat === true ||
      !!parsed.inference_model ||
      !!parsed.inference_settings
    );
  }

  function numeric(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function firstNumeric(...values) {
    for (const value of values) {
      const number = numeric(value);
      if (number != null) return number;
    }
    return null;
  }

  function messageText(message) {
    if (!message || typeof message !== "object") return "";
    const candidates = [
      message.text, message.content, message.message, message.body, message.response,
      message?.content?.text, message?.content?.parts, message?.message?.text, message?.message?.content,
      message?.data?.text, message?.data?.content, message?.data?.message
    ];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = value.text || value.content || value.message;
        if (typeof nested === "string" && nested.trim()) return nested;
      }
      if (Array.isArray(value)) {
        const text = value.map(item => typeof item === "string" ? item : (item?.text || item?.content || "")).filter(Boolean).join(" ");
        if (text.trim()) return text;
      }
    }
    return "";
  }

  function estimateTokens(text) {
    const value = String(text || "");
    if (!value.trim()) return null;
    let latinLike = 0;
    let punctuation = 0;
    let weighted = 0;
    for (const char of value) {
      if (/\s/u.test(char)) continue;
      if (/\p{Script=Cyrillic}/u.test(char)) { weighted += 3; continue; }
      if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)) { weighted += 1.5; continue; }
      if (/\p{Extended_Pictographic}/u.test(char)) { weighted += 2.5; continue; }
      if (/[^\p{L}\p{N}]/u.test(char)) { punctuation += 1; continue; }
      if (/^[\x00-\x7F]$/u.test(char) || /\p{Script=Latin}/u.test(char)) latinLike += 1;
      else weighted += 1.75;
    }
    return Math.max(1, Math.round(latinLike / 4 + punctuation * 0.35 + weighted));
  }

  function contextLimitFrom(...sources) {
    for (const source of sources) {
      if (!source || typeof source !== "object") continue;
      const settings = source.inference_settings || source.settings || source;
      const value = firstNumeric(
        settings.context_window, settings.contextWindow, settings.context_length, settings.contextLength,
        settings.max_context_length, settings.maxContextLength, settings.max_context_tokens, settings.maxContextTokens,
        settings.context_size, settings.contextSize, source.context_window, source.context_length, source.max_context_length
      );
      if (value != null && value >= 512) return value;
    }
    return null;
  }

  function promptUsageFrom(data) {
    const usage = data?.usage || data?.data?.usage || data?.meta?.usage || data?.data?.meta?.usage || {};
    return firstNumeric(
      usage.prompt_tokens, usage.promptTokens, usage.input_tokens, usage.inputTokens,
      data?.prompt_tokens, data?.promptTokens, data?.input_tokens, data?.inputTokens,
      data?.data?.prompt_tokens, data?.data?.promptTokens
    );
  }

  function normalizeMessage(message, fallbackRole = "") {
    if (!message || typeof message !== "object" || !message.id) return null;
    return {
      id: String(message.id),
      role: String(message.role || fallbackRole || ""),
      createdAt: message.createdAt || message.created_at || null,
      inferenceModel: message.inference_model || message.model || null,
      inferenceSettings: message.inference_settings || message.settings || null,
      previousId: message.prev_id || null,
      isAlternative: !!message.is_alternative,
      estimatedTokens: estimateTokens(messageText(message)),
      contextLimit: contextLimitFrom(message)
    };
  }

  function messagesArray(data) {
    if (Array.isArray(data?.messages)) return data.messages;
    if (Array.isArray(data?.data?.messages)) return data.data.messages;
    if (Array.isArray(data?.conversation?.messages)) return data.conversation.messages;
    return [];
  }

  function emitLoadedMessages(data) {
    const messages = messagesArray(data).map(message => normalizeMessage(message)).filter(Boolean);
    if (!messages.length) return;

    emit("DSQ_MESSAGES_LOADED", {
      conversationId: data?.conversation_id || data?.chat_id || data?.id || data?.data?.conversation_id || null,
      label: data?.label || data?.data?.label || null,
      messages
    });
  }

  function requestDetails(body) {
    const parsed = parseJson(body) || {};
    return {
      conversationId: parsed.conversation_id || parsed.chat_id || null,
      requestedModel: parsed.inference_model || null,
      settings: parsed.inference_settings || null,
      contextLimit: contextLimitFrom(parsed, parsed.inference_settings),
      continued: parsed.continue_chat === true,
      alternativeMessageId: parsed.alt_message_id || null,
      startedAt: Date.now(),
      startedPerf: performance.now()
    };
  }

  function emitGenerationResponse(data, request) {
    const message = normalizeMessage(data?.message || data?.data?.message, "bot");
    if (!message) return;

    const responseEngine = data?.engine || data?.data?.engine || null;
    const requestedModel = request?.requestedModel || message.inferenceModel || null;

    emit("DSQ_NEW_GENERATION", {
      ...message,
      conversationId: message.conversationId || request?.conversationId || data?.conversation_id || data?.chat_id || null,
      requestedModel,
      responseEngine,
      settings: request?.settings || message.inferenceSettings || null,
      promptTokens: promptUsageFrom(data),
      contextLimit: contextLimitFrom(data, data?.data, request, request?.settings, message) || request?.contextLimit || message.contextLimit || null,
      elapsedMs: request ? Math.max(0, Math.round(performance.now() - request.startedPerf)) : null,
      continued: !!request?.continued,
      alternativeMessageId: request?.alternativeMessageId || null
    });
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function (...args) {
      if (!enabled) return originalFetch.apply(this, args);

      const input = args[0];
      const init = args[1] || {};
      const url = urlText(input);
      const method = String(init.method || input?.method || "GET").toUpperCase();
      const body = init.body;
      const generationRequest = isGenerationRequest(method, url, body) ? requestDetails(body) : null;

      const result = originalFetch.apply(this, args);
      Promise.resolve(result).then(response => {
        if (!enabled || !response?.clone) return;

        if (isMessagesRequest(method, url)) {
          response.clone().json().then(emitLoadedMessages).catch(() => {});
        }

        if (generationRequest) {
          response.clone().json().then(data => emitGenerationResponse(data, generationRequest)).catch(() => {});
        }
      }).catch(() => {});

      return result;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (enabled) {
      this.__dsqMetadataMethod = String(method || "GET").toUpperCase();
      this.__dsqMetadataUrl = urlText(url);
    } else {
      this.__dsqMetadataMethod = "";
      this.__dsqMetadataUrl = "";
    }
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (!enabled) return originalSend.call(this, body);

    const method = this.__dsqMetadataMethod || "GET";
    const url = this.__dsqMetadataUrl || "";
    const generationRequest = isGenerationRequest(method, url, body) ? requestDetails(body) : null;

    if (isMessagesRequest(method, url) || generationRequest) {
      this.addEventListener("load", () => {
        if (!enabled) return;
        let data = null;
        try { data = JSON.parse(this.responseText); } catch { return; }

        if (isMessagesRequest(method, url)) emitLoadedMessages(data);
        if (generationRequest) emitGenerationResponse(data, generationRequest);
      }, { once: true });
    }

    return originalSend.call(this, body);
  };
})();
