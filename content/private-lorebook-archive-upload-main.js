// v0.2.57 – explicitly initiated, native React uploader handoff.
// No file picker: the bundled QoL icon is installed as a File into the actual
// native input. Never claims success without a confirmed site upload and cover.
(() => {
  'use strict';
  if (location.pathname !== '/lorebook/create') return;
  const token = new URLSearchParams(location.search).get('dsQolArchiveSetup') || '';
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if (!uuid.test(token)) return;
  let running = false;
  let uploadStarted = false, uploadDone = false, uploadStatus = 0;
  const responseType = 'ds-qol-archive-native-cover-response';
  const isSaveImage = url => { try {const u=new URL(String(url),location.origin);return u.hostname==='prod.nd-api.com'&&u.pathname==='/save-image';}catch{return false;} };
  // Observe only SpicyChat's *own* image-upload request. Never read the payload,
  // auth headers, picture response, or other traffic.
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') window.fetch = function(...args) {
    const matched=isSaveImage(args[0]?.url||args[0]);
    if (matched) uploadStarted=true;
    const result=nativeFetch.apply(this,args);
    if (matched) Promise.resolve(result).then(r=>{uploadStatus=r.status;uploadDone=r.ok;},()=>{uploadStatus=0;});
    return result;
  };
  const nativeOpen=XMLHttpRequest.prototype.open;
  const nativeSend=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url,...rest){this.__dsQolArchiveSaveImage=String(method).toUpperCase()==='POST'&&isSaveImage(url);return nativeOpen.call(this,method,url,...rest);};
  XMLHttpRequest.prototype.send=function(...args){
    if(this.__dsQolArchiveSaveImage){uploadStarted=true;this.addEventListener('loadend',()=>{uploadStatus=this.status;uploadDone=this.status>=200&&this.status<300;},{once:true});}
    return nativeSend.apply(this,args);
  };
  function reply(id,accepted,reason){
    window.postMessage({type:responseType,setupToken:token,requestId:id,accepted,reason:String(reason||'').slice(0,200)},location.origin);
  }
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  // /save-image may not run until *after* the native crop/preview step.
  // Only watch the native image UI and its actual request; never interpret a
  // synthetic file event alone as proof that SpicyChat accepted a cover.
  function uploadUIStage(){
    const field=document.querySelector('[data-field-name="avatar_url"]');
    if(field?.querySelector('img[src], [style*="background-image"]'))return 'cover-preview';
    const crop=document.querySelector('[data-testid*="crop" i], [class*="ReactCrop"], [class*="reactEasyCrop"]');
    if(crop)return 'image-crop';
    for(const dialog of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')){
      const text=(dialog.textContent||'').slice(0,1200);
      if(/crop|adjust image|edit image|position image|select area|zoom|rotate/i.test(text))return 'image-crop';
    }
    return '';
  }
  async function waitForResponse(ms){
    for(let elapsed=0;elapsed<ms;elapsed+=200){
      if(uploadStarted)return 'image-request-started';
      const stage=uploadUIStage();if(stage)return stage;
      await sleep(200);
    }
    return uploadStarted?'image-request-started':uploadUIStage();
  }
  async function tryUpload(input,file){
    const files=new DataTransfer();files.items.add(file);input.files=files.files;
    if(input.files?.[0]?.size!==file.size)throw Error('Native file input rejected the QoL cover.');
    // The real uploader normally receives a browser File input change. React
    // may first render a crop editor; /save-image is a *later* upload step.
    // A single change event is the native file-input signal; emitting both
    // input and change can accidentally start two parallel uploads.
    input.dispatchEvent(new Event('change',{bubbles:true}));
    let stage=await waitForResponse(5000);
    if(stage)return stage;
    // Some builds do not dispatch a React synthetic change from externally
    // assigned FileLists. Try the actual mounted onChange handler once.
    const propsKey=Object.keys(input).find(k=>k.startsWith('__reactProps$'));
    const handler=propsKey && input[propsKey]?.onChange;
    if(typeof handler==='function'){
      const event={type:'change',target:input,currentTarget:input,nativeEvent:{type:'change',target:input},
        bubbles:true,cancelable:false,defaultPrevented:false,
        isDefaultPrevented:()=>false,isPropagationStopped:()=>false,
        stopPropagation(){},preventDefault(){},persist(){}};
      await handler(event);
      stage=await waitForResponse(7500);
      if(stage)return stage;
    }
    throw Error('SpicyChat did not open its image editor or start an upload for the QoL cover. No Lorebook was created.');
  }
  window.addEventListener('message',async event=>{
    const data=event.data;
    if(running||event.source!==window||event.origin!==location.origin||data?.type!=='ds-qol-archive-native-cover-request'||
      data.setupToken!==token||!uuid.test(String(data.requestId||''))||
      Object.prototype.toString.call(data.imageBytes)!=='[object ArrayBuffer]')return;
    running=true;
    try{
      const input=document.querySelector('input[type="file"][data-testid="AvatarCreate-UploadInput"]');
      if(!input||!input.isConnected||!/^image\//.test(data.imageType||''))throw Error('SpicyChat image uploader not available.');
      const file=new File([data.imageBytes],'SpicyChat-QoL.png',{type:data.imageType,lastModified:Date.now()});
      if(!file.size||file.size>2*1024*1024)throw Error('The bundled QoL cover is invalid.');
      const method=await tryUpload(input,file);
      reply(data.requestId,true,method+'; upload started');
    }catch(error){reply(data.requestId,false,error?.message||'SpicyChat did not start the upload.');}
    finally{running=false;}
  });
  window.addEventListener('message',event=>{
    const d=event.data;
    if(event.source!==window||event.origin!==location.origin||d?.type!=='ds-qol-archive-cover-upload-status'||d.setupToken!==token)return;
    window.postMessage({type:'ds-qol-archive-cover-upload-state',setupToken:token,requestId:d.requestId,
      started:uploadStarted,done:uploadDone,httpStatus:uploadStatus},location.origin);
  });
})();
