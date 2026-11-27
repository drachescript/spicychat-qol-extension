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
  let quotaEnabled = false, quotaEpoch = 0;
  const QUOTA_SOURCE = 'spicychat-qol-generation-quota';
  const API_HOSTS = new Set(['prod.nd-api.com','ts-lb.nd-api.com']);

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== CONTROL_SOURCE) return;
    if (event.data?.type === "DSQ_GENERATION_METADATA_ENABLED") {
      enabled = !!event.data.enabled;
      const nextQuota = event.data.quotaEnabled === true;
      if (quotaEnabled !== nextQuota) quotaEpoch++;
      quotaEnabled = nextQuota;
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
      // `inference_model` is SpicyChat's configured model field. A plain
      // `model` may be server-selected or an alias, so keep it unverified.
      inferenceModel: message.inference_model || null,
      serverModel: modelIdentifier(message.model),
      actualModel: explicitActualModel(message, message.metadata, message.generation_metadata, message.generationMetadata),
      responseEngine: modelIdentifier(message.engine),
      inferenceSettings: message.inference_settings || message.settings || null,
      previousId: message.prev_id || null,
      isAlternative: !!message.is_alternative,
      estimatedTokens: estimateTokens(messageText(message)),
      contextLimit: contextLimitFrom(message)
    };
  }

  // Only explicit server-side resolution fields can identify an actual model.
  // A generic `model` or `inference_model` may simply repeat the requested
  // alias/preset, so never promote those fields to "actual model".
  function modelIdentifier(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      value = value.id ?? value.model_id ?? value.name ?? null;
    }
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 160) || null : null;
  }

  function explicitActualModel(...sources) {
    for (const source of sources) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const value = modelIdentifier(
        source.actual_model ?? source.actualModel ?? source.model_used ?? source.modelUsed ??
        source.used_model ?? source.usedModel ?? source.effective_model ?? source.effectiveModel ??
        source.served_model ?? source.servedModel ?? source.resolved_model ?? source.resolvedModel ??
        source.completion_model ?? source.completionModel ?? source.backend_model ?? source.backendModel
      );
      if (value) return value;
    }
    return null;
  }

  function responseModelHint(data) {
    // Top-level server model identifiers are worth showing but cannot alone
    // prove the model used. Exclude the request and the message's inference_model.
    for (const source of [data, data?.data, data?.result, data?.response]) {
      const value = modelIdentifier(source?.model ?? source?.model_id ?? source?.modelId);
      if (value) return value;
    }
    return null;
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
    const responseMessage = data?.message || data?.data?.message || data?.result?.message || data?.response?.message;
    const message = normalizeMessage(responseMessage, "bot");
    if (!message) return;

    // Report an actual engine only when the server supplies an engine field.
    // The requested inference_model is tracked separately below.
    const responseEngine = data?.engine || data?.data?.engine || data?.result?.engine
      || data?.response?.engine || responseMessage?.engine || null;
    const requestedModel = request?.requestedModel || message.inferenceModel || null;
    const actualModel = explicitActualModel(
      responseMessage, responseMessage?.metadata, responseMessage?.generation_metadata,
      responseMessage?.generationMetadata, data, data?.data, data?.result, data?.response,
      data?.metadata, data?.generation, data?.generation?.metadata,
      data?.data?.metadata, data?.data?.generation
    );
    const serverModel = responseModelHint(data) || message.serverModel || null;

    emit("DSQ_NEW_GENERATION", {
      ...message,
      conversationId: message.conversationId || request?.conversationId || data?.conversation_id || data?.chat_id || null,
      requestedModel,
      responseEngine,
      actualModel,
      serverModel,
      modelResponseObserved: true,
      settings: request?.settings || message.inferenceSettings || null,
      promptTokens: promptUsageFrom(data),
      contextLimit: contextLimitFrom(data, data?.data, request, request?.settings, message) || request?.contextLimit || message.contextLimit || null,
      elapsedMs: request ? Math.max(0, Math.round(performance.now() - request.startedPerf)) : null,
      continued: !!request?.continued,
      alternativeMessageId: request?.alternativeMessageId || null
    });
  }

  // Quota research observes the existing network operation only. Never read
  // request headers, persist message IDs/text, or tee an open-ended stream.
  function approvedQuotaUrl(url) {
    try { const u=new URL(url,location.href);return u.protocol==='https:'&&API_HOSTS.has(u.hostname); } catch {return false;}
  }
  function quotaAccountRequest(method,url) {
    if (!quotaEnabled || method!=='GET' || !approvedQuotaUrl(url)) return false;
    try {return new URL(url,location.href).pathname==='/v2/users';}catch{return false;}
  }
  async function quotaAccountObserved(data) {
    if(!quotaEnabled)return;
    const user=data?.user||data?.data?.user||data?.data;
    if(!user||typeof user.id!=='string'||!user.id||user.id.length>160)return;
    try {
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('dsq-quota-account-v1:'+user.id));
      if(quotaEnabled)window.postMessage({source:QUOTA_SOURCE,type:'account',accountKey:Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('')},'*');
    }catch{}
  }
  function quotaRequest(method,url,body,generation) {
    if(!quotaEnabled||!generation||!approvedQuotaUrl(url))return null;
    const parsed=parseJson(body)||{};
    const kind=parsed.continue_chat===true?'continuation':(parsed.alt_message_id||parsed.regenerate===true||parsed.regenerate_chat===true)?'regeneration':typeof parsed.message==='string'?'normal':'unknown';
    return {id:crypto.randomUUID(),startedAt:Date.now(),kind,epoch:quotaEpoch};
  }
  function quotaErrorCode(data) {
    for(const candidate of [data?.code,data?.error_code,data?.errorCode,data?.error?.code,data?.error?.error_code,data?.data?.code,data?.data?.error_code,data?.detail?.code,data?.errors?.[0]?.code]){
      if(typeof candidate==='string'&&/^SC-\d{3}-\d{4}$/i.test(candidate))return candidate.toUpperCase();
    }
    // Some native error objects use a string field containing the code.
    // Extract only the bounded code, never send the surrounding text.
    for(const candidate of [data?.error,data?.message,data?.detail,data?.error?.message]){
      if(typeof candidate==='string'){const code=candidate.slice(0,500).match(/\bSC-\d{3}-\d{4}\b/i)?.[0];if(code)return code.toUpperCase();}
    }
    return null;
  }
  // Read only headers actually exposed by the browser. In Chromium even a
  // caught getResponseHeader() call for an unexposed header logs a warning.
  function accessibleXhrHeaders(xhr) {
    const headers = new Map();
    try {
      for (const line of String(xhr.getAllResponseHeaders() || '').split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon < 1) continue;
        const name = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        headers.set(name, headers.has(name) ? headers.get(name) + ', ' + value : value);
      }
    } catch {}
    return headers;
  }
  function accessibleFetchHeaders(response) {
    const headers = new Map();
    try { response?.headers?.forEach((value, name) => headers.set(name.toLowerCase(), value)); } catch {}
    return headers;
  }
  function quotaHeaders(get) {
    const values={};
    for(const name of ['retry-after','ratelimit-limit','ratelimit-remaining','ratelimit-reset','x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset']){
      try { const v=String(get?.(name)||'').trim();if(/^\d{1,12}$/.test(v))values[name]=v;
        else if(name==='retry-after'&&/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(v)&&Number.isFinite(Date.parse(v)))values[name]=v;
      }catch{}
    }
    return values;
  }
  function quotaResponse(req,status,data,getHeader,unconfirmedReason='') {
    if(!req||!quotaEnabled||req.epoch!==quotaEpoch)return;
    const code=(status<200||status>=300||data?.error||data?.success===false)?quotaErrorCode(data):null, message=data?.message||data?.data?.message||data?.result?.message||data?.response?.message;
    const role=String(message?.role||'').toLowerCase();
    const validMessage=!!(message&&typeof message==='object'&&typeof message.id==='string'&&message.id&&(!role||['bot','assistant','character','ai'].includes(role)));
    const ok=status>=200&&status<300;
    const outcome=!ok||code||data?.error||data?.success===false?'failed':validMessage?'success':'unconfirmed';
    window.postMessage({source:QUOTA_SOURCE,type:'generation',payload:{id:req.id,startedAt:req.startedAt,kind:req.kind,at:Date.now(),status:Number(status)||0,outcome,code,headers:quotaHeaders(getHeader),reason:outcome==='unconfirmed'?(unconfirmedReason||'unrecognized-response'):null}},'*');
  }
  // Passive history evidence: a saved assistant reply is not necessarily
  // a newly charged generation (regenerations can replace earlier replies).
  // Emit only its timestamp, never IDs, conversation IDs or message text.
  function quotaHistoryObserved(data,startedAt,requestEpoch) {
    if(!quotaEnabled||requestEpoch!==quotaEpoch)return;
    const at=Date.now();let latest=0;
    for(const row of messagesArray(data)){
      if(!['bot','assistant','character','ai'].includes(String(row?.role||'').toLowerCase()))continue;
      const raw=row.createdAt??row.created_at;
      const t=typeof raw==='string'?Date.parse(raw):typeof raw==='number'?(raw<1e12?raw*1000:raw):NaN;
      if(Number.isSafeInteger(t)&&t>at-14*86400000&&t<=at)latest=Math.max(latest,t);
    }
    if(latest)window.postMessage({source:QUOTA_SOURCE,type:'history-time',startedAt,at,replyAt:latest},'*');
  }
  function quotaResponseBodyAllowed(type,length) {
    return !/text\/event-stream|application\/(?:x-)?ndjson|application\/json-seq/i.test(type)&&(!length||Number(length)<=524288)&&(!type||/json/i.test(type));
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function (...args) {
      if ((!enabled && !quotaEnabled) || args[1]?.[Symbol.for("dsq.ownedHistoryRead")] === true) return originalFetch.apply(this, args);
      const input=args[0],init=args[1]||{},url=urlText(input),method=String(init.method||input?.method||'GET').toUpperCase(),body=init.body;
      const gen=isGenerationRequest(method,url,body),generationRequest=enabled&&gen?requestDetails(body):null;
      let quota=null;try{quota=quotaRequest(method,url,body,gen);}catch{}
      const accountRead=quotaAccountRequest(method,url), history=enabled&&isMessagesRequest(method,url), quotaHistory=quotaEnabled&&approvedQuotaUrl(url)&&isMessagesRequest(method,url)&&/^\/(?:[a-z]{2}\/)?chat\//i.test(location.pathname),historyStartedAt=Date.now(),historyEpoch=quotaEpoch;
      const result=originalFetch.apply(this,args);
      if(!generationRequest&&!quota&&!accountRead&&!history&&!quotaHistory)return result;
      Promise.resolve(result).then(response=>{
        const exposed=accessibleFetchHeaders(response), get=n=>exposed.get(n), type=String(get('content-type')||'');
        const stream=/text\/event-stream|application\/(?:x-)?ndjson|application\/json-seq/i.test(type);
        if(!response?.clone||stream){quotaResponse(quota,response?.status,null,get,stream?'stream-not-observed':'response-unavailable');return;}
        const readMetadata=enabled&&(history||generationRequest);
        const readQuota=quotaEnabled&&(quota||accountRead||quotaHistory)&&quotaResponseBodyAllowed(type,get('content-length'));
        if(!readMetadata&&!readQuota){quotaResponse(quota,response.status,null,get,'body-not-observed');return;}
        response.clone().json().then(data=>{
          if(enabled&&history)try{emitLoadedMessages(data);}catch{}
          if(quotaHistory&&response.status>=200&&response.status<300)try{quotaHistoryObserved(data,historyStartedAt,historyEpoch);}catch{}
          if(enabled&&generationRequest)try{emitGenerationResponse(data,generationRequest);}catch{}
          if(readQuota){if(accountRead&&response.status>=200&&response.status<300)void quotaAccountObserved(data);quotaResponse(quota,response.status,data,get);}
          else quotaResponse(quota,response.status,null,get,'body-not-observed');
        },()=>quotaResponse(quota,response.status,null,get,'unrecognized-response'));
      },()=>quotaResponse(quota,0,null,null,'network-failure')).catch(()=>{});
      return result;
    };
  }
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method,url,...rest) {
    this.__dsqMetadataMethod=enabled||quotaEnabled?String(method||'GET').toUpperCase():'';
    this.__dsqMetadataUrl=enabled||quotaEnabled?urlText(url):'';
    return originalOpen.call(this,method,url,...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if(!enabled&&!quotaEnabled)return originalSend.call(this,body);
    const method=this.__dsqMetadataMethod||'GET',url=this.__dsqMetadataUrl||'',gen=isGenerationRequest(method,url,body);
    const generationRequest=enabled&&gen?requestDetails(body):null,history=enabled&&isMessagesRequest(method,url),accountRead=quotaAccountRequest(method,url),quotaHistory=quotaEnabled&&approvedQuotaUrl(url)&&isMessagesRequest(method,url)&&/^\/(?:[a-z]{2}\/)?chat\//i.test(location.pathname),historyStartedAt=Date.now(),historyEpoch=quotaEpoch;
    let quota=null;try{quota=quotaRequest(method,url,body,gen);}catch{}
    if(history||generationRequest||quota||accountRead||quotaHistory){
      this.addEventListener('loadend',()=>{
        const status=this.status,exposed=accessibleXhrHeaders(this),get=n=>exposed.get(n);
        const readMetadata=enabled&&status>=200&&status<300&&(history||generationRequest);
        const readQuota=quotaEnabled&&(quota||accountRead||quotaHistory)&&quotaResponseBodyAllowed(String(get('content-type')||''),get('content-length'));
        let data=null;
        if(readMetadata||readQuota)try{data=this.responseType==='json'?this.response:JSON.parse(this.responseText);}catch{}
        if(data&&readMetadata){if(history)emitLoadedMessages(data);if(generationRequest)emitGenerationResponse(data,generationRequest);}
        if(data&&quotaHistory&&status>=200&&status<300)quotaHistoryObserved(data,historyStartedAt,historyEpoch);
        if(data&&readQuota&&accountRead&&status>=200&&status<300)void quotaAccountObserved(data);
        quotaResponse(quota,status,readQuota?data:null,get,data?'':'body-not-observed');
      },{once:true});
    }
    return originalSend.call(this,body);
  };
})();
