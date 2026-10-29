// Optional Custom Lite settings owner; no startup network work.
(() => {
  'use strict';
  const profile=window.__DSQ_BUILD_PROFILE__;
  if(profile?.generated && Array.isArray(profile.features) && !profile.features.includes('chat-continuation'))return;
  const host=document.getElementById('ds-feature-panel-chat-continuation');if(!host)return;
  const card=document.createElement('section');card.className='card';card.id='chatContinuationCard';
  const head=document.createElement('h2');head.textContent='Chat Continuation / Transfer';card.append(head);
  const label=document.createElement('label');label.className='row';
  const input=document.createElement('input');input.type='checkbox';input.id='enableChatContinuationAssistant';
  const caption=document.createElement('span');caption.textContent='Enable the transfer assistant in individual chats';label.append(input,caption);card.append(label);
  const note=document.createElement('p');note.className='hint';note.textContent='Choose Transfer in a chat header to manually scan chat history, review suggested excerpts, add your own story summary or approved saved facts, and copy or export continuity for a different bot or group chat. Export a reviewed continuity brief as TXT/JSON, native Memory Manager import JSON, or inactive Lorebook drafts bound to a target chat. Nothing is posted or imported automatically. No external AI is used.';card.append(note);
  (window.__DSQ_FEATURE_SETTINGS_READERS__||={}).enableChatContinuationAssistant=()=>input.checked;
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__||={}).enableChatContinuationAssistant=data=>{input.checked=data.enableChatContinuationAssistant===true;};
  host.replaceWith(card);
})();
