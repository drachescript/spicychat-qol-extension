"use strict";
// Lorebook covers are fetched from already permitted first-party image hosts.
// No credentials, arbitrary URLs, redirects, or private API reads.
(() => {
  const TYPE = "DS_LOREBOOK_COVER_FETCH";
  const MAX_BYTES = 2 * 1024 * 1024;
  const HOSTS = new Set(["spicychat.ai", "www.spicychat.ai", "cdn.nd-api.com"]);
  const AVATAR_KEY = /^\/?avatars\/[A-Za-z0-9._/-]{1,250}\.(?:png|jpe?g|webp)$/i;
  const allowedPath = path => /^\/avatars\/[A-Za-z0-9._/-]{1,250}\.(?:png|jpe?g|webp)$/i.test(path) && !path.includes("..");

  function coverUrl(raw) {
    const value = String(raw || "").trim();
    if (!value || value.length > 2048) return null;
    let url;
    if (AVATAR_KEY.test(value) && !value.includes("..")) {
      url = new URL(value.replace(/^\//, ""), "https://cdn.nd-api.com/");
    } else {
      try { url = new URL(value); } catch { return null; }
    }
    if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username ||
        url.password || (url.search && url.search !== "?class=avatar256x256") || url.hash || !allowedPath(url.pathname)) return null;
    return url;
  }

  function validSignature(bytes, type) {
    if (type === "image/png") return bytes.length >= 8 &&
      [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
    if (type === "image/jpeg") return bytes.length >= 4 &&
      bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    if (type === "image/webp") return bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0,4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8,12)) === "WEBP";
    return false;
  }

  async function fetchCover(raw) {
    const url = coverUrl(raw);
    if (!url) return {ok:false, error:"The cover is not on a permitted SpicyChat image URL."};
    // The site itself commonly loads avatars with ?class=avatar256x256.
    // Keep the original first, then try only that known first-party variant.
    const candidates = [url];
    if (!url.search) {
      const thumbnail = new URL(url.href);
      thumbnail.search = '?class=avatar256x256';
      candidates.push(thumbnail);
    }
    const reasons = [];
    for (const candidate of candidates) {
      const ctrl = new AbortController();
      const timeout = setTimeout(()=>ctrl.abort(), 9000);
      try {
        const res = await fetch(candidate.href, {
          method:"GET", credentials:"omit", redirect:"error", referrerPolicy:"no-referrer",
          cache:"no-store", signal:ctrl.signal, headers:{Accept:"image/png,image/jpeg,image/webp"}
        });
        if (!res.ok) { reasons.push(`HTTP ${res.status}`); continue; }
        // Redirects are forbidden even when the new URL is first-party.
        if (!coverUrl(res.url) || res.url !== candidate.href) { reasons.push('redirected URL'); continue; }
        const type=String(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
        if (!["image/png","image/jpeg","image/webp"].includes(type)) { reasons.push('unsupported image type'); continue; }
        if (Number(res.headers.get('content-length')||0)>MAX_BYTES) { reasons.push('image exceeds 2 MB'); continue; }
        if (!res.body?.getReader) { reasons.push('response could not be streamed'); continue; }
        const reader=res.body.getReader(),chunks=[];let length=0,invalid=false;
        while(true) {
          const {done,value}=await reader.read();
          if(done)break;
          if (!(value instanceof Uint8Array)) { reasons.push('invalid response'); invalid=true; break; }
          length+=value.byteLength;
          if(length>MAX_BYTES){await reader.cancel().catch(()=>{});reasons.push('image exceeds 2 MB');invalid=true;break;}
          chunks.push(value);
        }
        if (!length || invalid) continue;
        const bytes=new Uint8Array(length);let offset=0;
        for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        if(!validSignature(bytes,type)) { reasons.push('image signature mismatch'); continue; }
        let binary='';
        for(let i=0;i<bytes.length;i+=0x6000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x6000));
        return {ok:true,dataUrl:`data:${type};base64,${btoa(binary)}`,variant:candidate.search?'avatar256x256':'original'};
      } catch(error) {
        reasons.push(error?.name==='AbortError'?'timed out':'network or CDN error');
      } finally {clearTimeout(timeout);}
    }
    return {ok:false,error:`Could not read the cover (${reasons.join('; ') || 'not available'}). Choose the original image file if needed.`};
  }

  dsqRegisterBackgroundMessageHandler(TYPE,"lorebook-backup",(message,sender,sendResponse)=>{
    let page;
    try {page=new URL(String(sender?.url||sender?.tab?.url||""));}catch{}
    if (!page || page.protocol!=="https:" || !["spicychat.ai","www.spicychat.ai"].includes(page.hostname) ||
        !/^\/lorebook\/(?:create|edit(?:\/|$))/i.test(page.pathname)) {
      sendResponse({ok:false,error:"Open SpicyChat's Lorebook editor first."});
      return false;
    }
    fetchCover(message?.url).then(sendResponse,()=>sendResponse({ok:false,error:"Cover download failed."}));
    return true;
  });
})();
