// Independent optional local-lorebook-recall Settings panel.
(() => {
  'use strict';
  const profile=window.__DSQ_BUILD_PROFILE__;
  if(profile?.generated&&Array.isArray(profile.features)&&!profile.features.includes('chat-lorebook-recall'))return;
  const host=document.getElementById('ds-feature-panel-chat-lorebook-recall');if(!host)return;
  const section=document.createElement('section');section.className='card';
  const h=document.createElement('h2');h.textContent='Local Lorebook Recall';section.append(h);
  const label=document.createElement('label');label.className='row';
  const enable=document.createElement('input');enable.type='checkbox';enable.id='enableLocalLorebookRecall';
  const caption=document.createElement('span');caption.textContent='Add matching local Lorebook entries when I send a message (OFF by default)';
  label.append(enable,caption);section.append(label);
  const limitLabel=document.createElement('label');limitLabel.textContent='Maximum Lorebook text added per message';
  const select=document.createElement('select');select.id='localLorebookRecallMaxChars';
  for(const [value,title] of [[450,'450 characters'],[900,'900 characters'],[1400,'1,400 characters']]){
    const option=document.createElement('option');option.value=String(value);option.textContent=title;select.append(option);
  }
  limitLabel.append(select);section.append(limitLabel);
  const recent=document.createElement('label');recent.textContent='Check keywords in these messages (only when sending) ';
  const recentSelect=document.createElement('select');recentSelect.id='localLorebookRecentMessages';
  for(const [value,text] of [[0,'Outgoing message only (default)'],[1,'Outgoing + 1 recent message'],[2,'Outgoing + 2 recent messages']]){
    const option=document.createElement('option');option.value=String(value);option.textContent=text;recentSelect.append(option);
  }
  recent.append(recentSelect);section.append(recent);
  const budgetLabel=document.createElement('label');budgetLabel.className='row';
  const budgetToggle=document.createElement('input');budgetToggle.type='checkbox';budgetToggle.id='enableSharedOocBudget';
  budgetLabel.append(budgetToggle,document.createTextNode('Limit the total QoL OOC text added to each message (OFF by default)'));
  section.append(budgetLabel);
  const budgetLimit=document.createElement('label');budgetLimit.textContent='Maximum total QoL OOC text per message ';
  const budgetSelect=document.createElement('select');budgetSelect.id='sharedOocBudgetChars';
  for(const value of [1000,1800,2800,4000,5000]){
    const option=document.createElement('option');option.value=String(value);option.textContent=value.toLocaleString()+' characters';budgetSelect.append(option);
  }
  budgetLimit.append(budgetSelect);section.append(budgetLimit);
  const experiment=document.createElement('p');experiment.className='hint';
  experiment.textContent='Experimental — test it in a spare chat first. It adds visible OOC text, not native Lorebook entries. Check the matches before relying on them.';
  section.append(experiment);
  const desc=document.createElement('p');desc.className='hint';
  desc.textContent='Matches specific keywords in the outgoing text or at most two recent visible messages. No history download, observers or native Lorebook API. Nothing is sent automatically. Works without Context Keeper or native Memories. Recall itself always enforces a conservative shared context limit; the extra budget switch also covers other QoL guidance when recall is disabled.';
  section.append(desc);host.replaceWith(section);
  const readers=window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  readers.enableLocalLorebookRecall=()=>!!document.getElementById('enableLocalLorebookRecall')?.checked;
  readers.localLorebookRecentMessages=()=>[0,1,2].includes(Number(document.getElementById('localLorebookRecentMessages')?.value))?Number(document.getElementById('localLorebookRecentMessages').value):0;
  readers.enableSharedOocBudget=()=>!!document.getElementById('enableSharedOocBudget')?.checked;
  readers.sharedOocBudgetChars=()=>Math.max(600,Math.min(5000,Number(document.getElementById('sharedOocBudgetChars')?.value)||2800));
  readers.localLorebookRecallMaxChars=()=>Math.max(200,Math.min(1400,Number(document.getElementById('localLorebookRecallMaxChars')?.value)||900));
  const loaders=window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  loaders.enableLocalLorebookRecall=s=>{document.getElementById('enableLocalLorebookRecall').checked=!!s.enableLocalLorebookRecall;};
  loaders.localLorebookRecentMessages=s=>{document.getElementById('localLorebookRecentMessages').value=String([0,1,2].includes(Number(s.localLorebookRecentMessages))?s.localLorebookRecentMessages:0);};
  loaders.enableSharedOocBudget=s=>{document.getElementById('enableSharedOocBudget').checked=s.enableSharedOocBudget===true;};
  loaders.sharedOocBudgetChars=s=>{document.getElementById('sharedOocBudgetChars').value=String([1000,1800,2800,4000,5000].includes(Number(s.sharedOocBudgetChars))?s.sharedOocBudgetChars:2800);};
  loaders.localLorebookRecallMaxChars=s=>{document.getElementById('localLorebookRecallMaxChars').value=String([450,900,1400].includes(Number(s.localLorebookRecallMaxChars))?s.localLorebookRecallMaxChars:900);};
})();
