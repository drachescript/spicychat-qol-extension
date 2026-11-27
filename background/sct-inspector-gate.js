"use strict";
const DSQ_SCT_CONFIG = 'dsSctInspectorLocalConfigV1';
const DSQ_SCT_ALARM = 'ds-sct-inspector-delivery-v1';
let dsqSctConfigPromise, dsqSctConfigValue;
function dsqSctSupported(){try{return typeof importScripts==='function' && /^chrome-extension:\/\/[a-p]{32}\/$/.test(chrome.runtime.getURL('')) && !!chrome.runtime.getManifest().background?.service_worker;}catch{return false;}}
function dsqSctConfig(){return dsqSctConfigPromise ||= chrome.storage.local.get(DSQ_SCT_CONFIG).then(r=>dsqSctConfigValue=r[DSQ_SCT_CONFIG]||{}).catch(()=>dsqSctConfigValue={});}
function dsqSctLoad(){return globalThis.DSQSctInspector ||= globalThis.DSQSctInspectorFactory();}
function dsqSctSettingsSender(s){return s?.id===chrome.runtime.id && typeof s.url==='string' && s.url.split(/[?#]/,1)[0]===chrome.runtime.getURL('options.html');}
function dsqSctTabSender(s){try{const u=new URL(s.url), match=u.pathname.match(/^\/(?:[a-z]{2}\/)?(?:(lorebook|chatbot|rulebook|group)\/(?:edit\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?:\/entries)?|create|new)|my-creations\/(chatbots|lorebooks|rulebooks|groups))\/?$/i);return s.id===chrome.runtime.id&&s.frameId===0&&Number.isInteger(s.tab?.id)&&s.tab.id>=0&&s.tab.id<=2147483647&&u.origin==='https://spicychat.ai'&&!s.tab.incognito&&!!match;}catch{return false;}}
function dsqSctMessage(m,s,reply){
 const settings=['DS_SCT_INSPECTOR_CONFIG','DS_SCT_INSPECTOR_STATUS'].includes(m.type);
 if(!dsqSctSupported()||!dsqBackgroundHasFeature('creator-tools-integration')||!(settings?dsqSctSettingsSender(s):dsqSctTabSender(s))){reply({ok:false,status:'unsupported-or-ineligible'});return false;}
 (async()=>{const c=await dsqSctConfig();if(settings){if(m.type==='DS_SCT_INSPECTOR_STATUS'&&!c.enabled)return {ok:true,enabled:false,inspectorId:c.inspectorId||'',status:'disabled',qolId:chrome.runtime.id};return dsqSctLoad().settings(m,c);}if(!c.enabled)return {ok:false,status:'disabled'};return dsqSctLoad().accept(m,s,c);})().then(reply,()=>reply({ok:false,status:'unavailable'}));return true;
}
function dsqSctJournal(m,s,j,at){if(dsqSctConfigValue?.enabled===false||dsqSctConfigValue&&!dsqSctConfigValue.enabled||!dsqSctSupported()||!dsqBackgroundHasFeature('creator-tools-integration')||!['start','resume','begin','receipt','commit','rejected','not-sent','finish','stop','cancel-saved','get'].includes(m.action))return;
 // Project only primitive metadata synchronously; never retain the native job, payload or account ID.
 const action=m.action, snapshot={action,jobId:j.jobId,bookId:j.bookId,phase:j.phase,total:j.total,processed:j.nextIndex,retries:j.retries,resumes:j.resumes,pendingWrite:!!j.pending,previousConfirmed:!!j.lastSuccess&&!j.pending,attemptId:m.attemptId,kind:m.kind,result:m.result,status:m.status,entryId:m.entryId,reconciled:m.reconciled===true,verifiedCount:j.verifiedCount,reason:action==='stop'&&/watchdog|no import progress/i.test(m.reason||'')?'watchdog':action==='stop'&&/editor|navigation/i.test(m.reason||'')?'navigation':action==='stop'&&/user requested/i.test(m.reason||'')?'cancelled':'unknown'};
 // Only the actual validated editor sender's tab is used.
 const sender={id:s.id,url:new URL(s.url).origin+new URL(s.url).pathname,frameId:s.frameId,tab:{id:s.tab?.id,incognito:s.tab?.incognito}};
 void dsqSctConfig().then(c=>{if(c.enabled&&dsqSctTabSender(sender))dsqSctLoad().journal(snapshot,sender,c,at);}).catch(()=>{});
}
function dsqSctWake(){if(!dsqSctSupported()||!dsqBackgroundHasFeature('creator-tools-integration'))return;void dsqSctConfig().then(c=>{if(c.enabled)dsqSctLoad().wake(c);}).catch(()=>{});}
function dsqSctConfigChanged(changes){if(changes[DSQ_SCT_CONFIG])dsqSctConfigPromise=Promise.resolve(dsqSctConfigValue=changes[DSQ_SCT_CONFIG].newValue||{});}
