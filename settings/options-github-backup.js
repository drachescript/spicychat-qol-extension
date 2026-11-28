"use strict";
// Experimental GitHub App backup UI. Runs only on the Options account tab.
function setupGithubBackupFoundation() {
  const $g = id => document.getElementById(id);
  const call = (name,extra={}) => new Promise(resolve => {
    try {chrome.runtime.sendMessage({type:'DS_GITHUB_BACKUP_'+name,...extra},result=>
      resolve(chrome.runtime.lastError?{ok:false,error:chrome.runtime.lastError.message}:result||{ok:false,error:'No response'}));}
    catch(e){resolve({ok:false,error:e.message});}
  });
  let authPolling=false,manualProgress=false;
  const output=(text,error=false)=>{const el=$g('ghBackupStatus');if(!el)return;el.textContent=String(text||'');el.style.color=error?'#fb9f9f':'';};
  // This renderer updates status only, never editable preferences. The
  // periodic check must not discard a user's unsaved category changes.
  const renderProgress=s=>{
    const active=s.progress?.phase && s.progress.phase!=='idle' && Number(s.progress.at)>Date.now()-180000;
    const pr=s.researchLive||s.researchBackupProgress;
    const bar=$g('ghBackupResearchBar'), label=$g('ghBackupResearchProgress');
    $g('ghBackupProgress').textContent=active?`${s.progress.phase}: ${s.progress.message||''}${s.progress.total?` · ${s.progress.done}/${s.progress.total}`:''}`:'';
    $g('ghBackupResearchLast').textContent=s.researchLastSyncedAt?`Last verified Research snapshot: ${new Date(s.researchLastSyncedAt).toLocaleString()}${s.researchLastSnapshot?` · ${s.researchLastSnapshot.slice(0,8)}`:''}`:'No verified Research snapshot recorded on this device yet';
    $g('ghBackupResearchError').textContent=s.researchError||'';
    const paused=s.paused||!s.categories?.includes('research')||s.provider==='cloud'||!s.unlocked||!s.connected;
    $g('ghBackupResearchResume').disabled=paused||!!s.researchPending;
    if(pr&&Number.isFinite(pr.total)&&pr.total>=0){
      const total=Math.max(0,pr.total), committed=Math.min(total,Math.max(0,Number(pr.completed)||0)), remaining=total-committed;
      const batch=s.researchLive?Math.max(0,Number(pr.batchVerified)||0):0;
      bar.hidden=!total;bar.max=Math.max(1,total);bar.value=committed;
      let phase=paused?'paused / unlock or enable Research':s.researchLive?(pr.phase==='indexing'?'verifying snapshot index':'uploading'):
        s.researchRetryAt>Date.now()&&s.researchPending?`retry at ${new Date(s.researchRetryAt).toLocaleTimeString()}`:
        s.researchPending?'queued / continuing in batches':remaining?'stopped — resume saved Research':'all staged records committed';
      const rate=Number(pr.ratePerMinute)||0;
      let eta='';if(remaining&&rate>0&&s.researchPending&&!paused&&s.researchRetryAt<=Date.now()){
        const mins=Math.ceil(remaining/rate);eta=` · ~${rate} records/min · rough ETA ${mins>=60?`${Math.floor(mins/60)}h ${mins%60}m`:`${mins}m`} (may increase)`;
      }
      label.textContent=`${total.toLocaleString()} staged · ${committed.toLocaleString()} indexed and verified · ${remaining.toLocaleString()} remaining${batch?` · ${batch} verified this batch, not indexed yet`:''} · ${phase}${eta}`;
    }else{bar.hidden=true;label.textContent=s.researchPending?'Saved Research upload queued; checking staged records…':'No Research upload progress recorded yet.';}
  };
  const status=async()=>{
    const s=await call('STATUS');if(!s.ok){output(s.error,true);return s;}
    $g('ghBackupProvider').value=s.provider;
    $g('ghBackupClientId').value=s.publicClientId||'';
    $g('ghBackupRepoInput').value=$g('ghBackupRepoInput').value||s.repository||'';
    $g('ghBackupAuto').checked=s.automatic;
    $g('ghBackupPause').checked=s.paused;
    for(const category of ['settings','lists','other','media','research']){
      $g('ghBackupCategory_'+category).checked=s.categories.includes(category);
      $g('ghBackupPlain_'+category).checked=s.plaintext.includes(category);
    }
    $g('ghBackupRemember').checked=s.remembered;
    $g('ghBackupAccount').textContent=s.connected?`GitHub: ${s.githubUser||'authorized'} · ${s.repository||'select a repository'}`:'GitHub not authorized';
    $g('ghBackupUnlockState').textContent=s.unlocked?'Encryption key unlocked':'Backup password required';
    $g('ghBackupLast').textContent=s.lastSyncedAt?`Last successful general backup: ${new Date(s.lastSyncedAt).toLocaleString()}`:'No general GitHub backup yet';
    if(s.conflicts?.length)$g('ghBackupConflicts').textContent=`Conflicts: ${s.conflicts.join(', ')}. Use Restore / Merge to resolve; no data was overwritten.`;
    else $g('ghBackupConflicts').textContent='';
    renderProgress(s);
    if(s.lastError)output(s.lastError,true);
    else if ($g('ghBackupStatus')?.textContent?.trim()==='GitHub backup starts off by default.') {
      if(s.provider==='cloud')output('GitHub backup is not selected. Choose GitHub or Both and save provider preferences.');
      else if(!s.connected)output('Authorize this browser with GitHub Device Flow first.');
      else if(!s.repository)output('Choose your private GitHub backup repository.');
      else if(!s.unlocked)output('Unlock the GitHub backup password before uploading.');
      else if(s.paused)output('GitHub backups are paused on this device.');
      else if(!s.lastSyncedAt)output('Connected, but no successful GitHub snapshot yet. Use Backup Now or Sync Now to create one.');
    }
    return s;
  };
  async function run(name,args={},success){
    output(`${name.replace(/_/g,' ').toLowerCase()}…`);
    const longOperation=['BACKUP','SYNC','RESTORE'].includes(name);
    if(longOperation)manualProgress=true;
    const ticker=longOperation?setInterval(()=>{void call('STATUS').then(s=>{if(s.ok)renderProgress(s);});},2500):null;
    let r;try{r=await call(name,args);}finally{if(ticker)clearInterval(ticker);if(longOperation)manualProgress=false;}
    if(r.ok&&name!=='STATUS')await status();
    // Show the outcome after refreshing status, not an older saved error.
    if(!r.ok)output(r.message||r.error||'Operation failed',true);
    else if(success)output(typeof success==='function'?success(r):success);
    else if(name!=='REPOSITORIES')output(r.message||'Done.');
    return r;
  }
  const permission=()=>new Promise(resolve=>{
    const origins=['https://api.github.com/*','https://github.com/*'];
    try{chrome.permissions.request({origins},granted=>resolve(!!granted&&!chrome.runtime.lastError));}catch{resolve(false);}
  });
  const options=()=>({
    provider:$g('ghBackupProvider').value,
    automatic:$g('ghBackupAuto').checked,paused:$g('ghBackupPause').checked,
    categories:['settings','lists','other','media','research'].filter(c=>$g('ghBackupCategory_'+c).checked),
    plaintext:['settings','lists','other','media','research'].filter(c=>$g('ghBackupPlain_'+c).checked)
  });
  $g('ghBackupSave').addEventListener('click',async()=>{
    const p=options();
    if(p.plaintext.length && !confirm('The selected plaintext categories will be readable to anyone with repository access, despite the repository being private. Continue?'))return;
    await run('CONFIGURE',{prefs:{...p,plaintextConfirmed:!!p.plaintext.length}},'Backup provider preferences saved.');
  });
  $g('ghBackupAddDevice')?.addEventListener('click',()=>{
    const button=$g('ghBackupAddDevice'), guide=$g('ghBackupAddDeviceHelp');
    if(!guide)return;
    guide.hidden=!guide.hidden;
    button?.setAttribute('aria-expanded',String(!guide.hidden));
  });
  $g('ghBackupConnect').addEventListener('click',async()=>{
    if(!await permission()){output('Grant GitHub network access to connect. Nothing was uploaded.',true);return;}
    const result=await run('AUTHORIZE',{},'Open GitHub and enter your code.');if(!result.ok)return;
    $g('ghBackupDeviceCode').textContent=result.userCode;
    $g('ghBackupDeviceLink').href=result.verificationUrl;
    $g('ghBackupAuthInstructions').hidden=false;
    chrome.tabs.create({url:result.verificationUrl});
    authPolling=true;
    // Device Flow explicitly requires polling. Only while this Settings panel is open.
    while(authPolling && Date.now()<result.expiresAt){
      await new Promise(resolve=>setTimeout(resolve,Math.max(6000,result.interval*1000)));
      if(!authPolling||!document.contains($g('ghBackupConnect')))break;
      const check=await call('POLL');
      if(check.connected){authPolling=false;output('GitHub authorized. Choose a private repository.');await status();break;}
      if(!check.ok){authPolling=false;output(check.error,true);break;}
    }
  });
  $g('ghBackupStopAuth').addEventListener('click',()=>{authPolling=false;output('Stopped checking. The GitHub device code expires automatically.');});
  $g('ghBackupRepositories').addEventListener('click',async()=>{
    const r=await run('REPOSITORIES');if(!r.ok)return;
    const target=$g('ghBackupRepoSelect');target.replaceChildren();
    for(const repo of r.repositories||[]){const opt=document.createElement('option');opt.value=repo.fullName;opt.textContent=repo.fullName;target.append(opt);}
    if(!target.children.length){output('No private repositories accessible to this GitHub App. Check the installation repository access.',true);return;}
    const chosen=$g('ghBackupRepoInput').value.trim();
    if(chosen&&Array.from(target.options).some(option=>option.value.toLowerCase()===chosen.toLowerCase()))target.value=chosen;
    target.hidden=false;
    if(!chosen)$g('ghBackupRepoInput').value=target.value;
    output(`${target.options.length} private repositories available. Select one, then click Verify & select repository.`);
  });
  $g('ghBackupRepoSelect').addEventListener('change',()=>{$g('ghBackupRepoInput').value=$g('ghBackupRepoSelect').value;});
  $g('ghBackupChoose').addEventListener('click',async()=>{
    const repository=$g('ghBackupRepoInput').value.trim()||$g('ghBackupRepoSelect').value.trim();
    if(!repository){output('Choose a repository or enter owner/repository first.',true);return;}
    await run('CHOOSE_REPO',{repository},result=>result.alreadySelected
      ?`${result.repository} verified. Existing backup state and encryption unlock kept.`
      :`${result.repository} selected. Unlock the backup password, then use Backup Now.`);
  });
  $g('ghBackupUnlock').addEventListener('click',async()=>{
    const password=$g('ghBackupPassword').value;
    if(!password){output('Enter your backup password.',true);return;}
    const r=await run('UNLOCK',{password,remember:$g('ghBackupRemember').checked},'Backup encryption unlocked.');
    $g('ghBackupPassword').value='';
  });
  $g('ghBackupLock').addEventListener('click',()=>run('LOCK',{},'Encryption key locked and remembered unlock cleared.'));
  $g('ghBackupNow').addEventListener('click',()=>run('BACKUP',{},r=>r.pendingResearch?'General backup checked; Research upload continues in verified batches.':'GitHub backup finished, verified and indexed.'));
  $g('ghBackupSync').addEventListener('click',()=>run('SYNC',{},'Provider synchronization finished.'));
  $g('ghBackupRefresh').addEventListener('click',async()=>{const result=await status();if(result.ok&&!result.lastError&&!result.researchError)output('Status refreshed.');});
  $g('ghBackupResearchResume').addEventListener('click',()=>run('RESEARCH_RESUME'));
  let checkingProgress=false;
  const refreshProgress=async()=>{
    if(manualProgress||checkingProgress||document.hidden||!$g('githubBackupCard')?.getClientRects().length||!$g('ghBackupProgress')?.getClientRects().length)return;
    checkingProgress=true;
    try{const result=await call('STATUS');if(result.ok)renderProgress(result);}finally{checkingProgress=false;}
  };
  // Only while the visible GitHub card is open. No GitHub network requests.
  const progressTimer=setInterval(()=>{if(!document.contains($g('githubBackupCard'))){clearInterval(progressTimer);return;}void refreshProgress();},5000);
  window.addEventListener('pagehide',()=>clearInterval(progressTimer),{once:true});
  $g('ghBackupSnapshots').addEventListener('click',async()=>{
    const r=await run('SNAPSHOTS');if(!r.ok)return;
    const select=$g('ghBackupSnapshotSelect');select.replaceChildren();
    for(const x of r.snapshots){const opt=document.createElement('option');opt.value=x.id;opt.textContent=`${new Date(x.createdAt).toLocaleString()} · ${x.id.slice(0,8)}`;select.append(opt);}
    output(r.snapshots.length?`${r.snapshots.length} indexed snapshots. Select one to restore.`:'No snapshots yet.');
  });
  $g('ghBackupRestore').addEventListener('click',async()=>{
    const snapshotId=$g('ghBackupSnapshotSelect').value;
    const categories=['settings','lists','other','media','research'].filter(x=>$g('ghBackupRestore_'+x).checked);
    if(!snapshotId||!categories.length){output('Choose a snapshot and at least one category.',true);return;}
    const merge=$g('ghBackupRestoreMode').value==='merge';
    if(!confirm(`${merge?'Merge from':'REPLACE selected local values with'} GitHub snapshot ${snapshotId.slice(0,8)} for ${categories.join(', ')}? This changes only your selected categories. Back up first if uncertain.`))return;
    await run('RESTORE',{snapshotId,categories,merge},'Selected categories recovered. Research records, if selected, are staged in the local GitHub research cache.');
  });
  let researchCursor=0, researchSelection='';
  $g('ghBackupResearchRecover').addEventListener('click',async()=>{
    const snapshotId=$g('ghBackupSnapshotSelect').value;
    if(!snapshotId){output('Load and choose a snapshot before research recovery.',true);return;}
    const exact=$g('ghBackupResearchKey').value.trim();
    const selection=snapshotId+'|'+exact;
    if(selection!==researchSelection){researchSelection=selection;researchCursor=0;}
    const replace=$g('ghBackupResearchReplace').checked;
    if(replace && !confirm('Replace changed local research records with verified remote versions? Existing chat checkpoints are untouched.'))return;
    const r=await run('RESTORE_RESEARCH',{snapshotId,recordKey:exact,offset:researchCursor,replace});
    if(!r.ok && !('nextOffset' in r))return;
    researchCursor=Number(r.nextOffset)||0;
    $g('ghBackupResearchState').textContent=`Recovered ${r.restored||0}; unchanged ${r.unchanged||0}; conflicts ${(r.conflicts||[]).length}; invalid ${r.invalid||0}. ${r.remaining||0} records remain in this snapshot.`;
  });
  $g('ghBackupCancel').addEventListener('click',()=>run('CANCEL',{},'Current GitHub backup operation cancelled safely.'));
  $g('ghBackupDisconnect').addEventListener('click',async()=>{
    if(confirm('Disconnect GitHub on this device? Local QoL data and remote backups will remain intact.'))await run('DISCONNECT',{},'GitHub authorization disconnected locally.');
  });
  $g('ghBackupNewRepo').addEventListener('click',()=>chrome.tabs.create({url:'https://github.com/new'}));
  $g('ghBackupInstall').addEventListener('click',()=>chrome.tabs.create({url:'https://github.com/apps/dragongraf-qol-backup/installations/new'}));
  void status();
}
