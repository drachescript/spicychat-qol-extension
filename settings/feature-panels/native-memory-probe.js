// Native Memory monitoring is a separate opt-in feature and must never depend on Context Keeper.
(() => {
  'use strict';
  const profile=window.__DSQ_BUILD_PROFILE__;
  if(profile?.generated && Array.isArray(profile.features) && !profile.features.includes('native-memory-probe')) return;
  const host=document.getElementById('ds-feature-panel-native-memory-probe');
  if(!host) return;
  // Optional native Memory-quality experiment. No dependency on the paid Memory Manager UI.
  const memoryCard=document.createElement('section');memoryCard.id='nativeMemoryProbeCard';memoryCard.className='card';
  const heading=document.createElement('h2');heading.textContent='Native Memory checks (experimental)';memoryCard.append(heading);
  const intro=document.createElement('p');intro.className='hint';intro.textContent='Works without Context Keeper. This is a read-only experiment: QoL checks for changes and possible problems, but doesn\'t edit native Memories or save their text.';memoryCard.append(intro);
  const memoryRow=document.createElement('label');memoryRow.className='row';
  const memoryInput=document.createElement('input');memoryInput.id='nativeMemoryQualityProbe';memoryInput.type='checkbox';
  const memoryLabel=document.createElement('span');memoryLabel.textContent='Check native Memories after every two normal replies (OFF by default)';
  memoryRow.append(memoryInput,memoryLabel);
  memoryCard.append(memoryRow);
  const memoryHelp=document.createElement('p');memoryHelp.className='hint';
  memoryHelp.textContent='Checks after two normal back-and-forth messages, at least a minute apart. Regenerating or continuing a reply doesn\'t count. Failed checks back off automatically. The Memory text stays out of QoL storage and reports.';
  memoryCard.append(memoryHelp);
  const memoryStatus=document.createElement('p');memoryStatus.className='hint';memoryStatus.setAttribute('role','status');
  memoryStatus.textContent='Memory check: no results yet.';
  memoryCard.append(memoryStatus);
  const note=document.createElement('p');note.className='hint';note.textContent='This shows whether QoL checked the Memory list, not whether SpicyChat created a Memory. Background checks may not appear in Inspector. Still experimental.';memoryCard.append(note);
  function renderMemoryStatus(raw){
    if(!raw?.checkedAt){memoryStatus.textContent='Memory check: no results yet.';return;}
    const when=new Date(raw.checkedAt).toLocaleString();
    const lastGood=Number(raw.lastSuccessfulCheck||0)?` · last success ${new Date(raw.lastSuccessfulCheck).toLocaleString()}`:'';
    const via=raw.authSource==='captured-session'?' · live session':raw.authSource==='browser-storage'?' · storage fallback':'';
    if(!raw.ok){const next=Number(raw.nextCheckAt||0)>Date.now()?` · retry after ${new Date(raw.nextCheckAt).toLocaleTimeString()}`:'';const http=Number(raw.httpStatus||0)?` · HTTP ${Number(raw.httpStatus)}`:'';memoryStatus.textContent=`Memory check: ${raw.status||'unavailable'}${http}${via}${next}${lastGood} · attempted ${when}.`;return;}
    const q=raw.changed&&raw.quality ? ` · quality flags: ${Number(raw.quality.empty||0)} empty, ${Number(raw.quality.veryShort||0)} short, ${Number(raw.quality.long||0)} wordy, ${Number(raw.quality.overNativeLimit||0)} over the documented 250-character limit, ${Number(raw.quality.exactDuplicateTexts||0)} exact duplicates, ${Number(raw.quality.uncertain||0)} uncertain, ${Number(raw.quality.ambiguousReference||0)} unclear references, ${Number(raw.quality.unstructured||0)} unstructured, ${Number(raw.quality.possibleConflicts||0)} possible conflicts (heuristic only)` : '';
    memoryStatus.textContent=`Memory check: ${raw.baseline?'initial baseline':raw.changed?'changes detected':'unchanged'} · ${Number(raw.count||0)} memories · +${Number(raw.added||0)} / -${Number(raw.removed||0)} / ~${Number(raw.updated||0)}${q}${via} · checked ${when}.`;
  }
  chrome.storage.local.get('dsNativeMemoryProbeLastResultV1',v=>renderMemoryStatus(v?.dsNativeMemoryProbeLastResultV1));
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes.dsNativeMemoryProbeLastResultV1)
      renderMemoryStatus(changes.dsNativeMemoryProbeLastResultV1.newValue);
  });

  host.replaceWith(memoryCard);
  const readers=window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders=window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers.nativeMemoryQualityProbe=()=>!!document.getElementById('nativeMemoryQualityProbe')?.checked;
  loaders.nativeMemoryQualityProbe=settings=>{const el=document.getElementById('nativeMemoryQualityProbe');if(el)el.checked=settings.nativeMemoryQualityProbe===true;};
})();
