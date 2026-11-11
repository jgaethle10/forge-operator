/**
 * Private, file-selected spectator sheet for the existing Worlds WebGL scene.
 * Accepts ONLY a bounded, read-only projection from the offline Window observer.
 * Never fetches GitHub/state branches, writes canonical world state or phones home.
 * Does NOT pretend the three local 3D actors are the twelve Window residents.
 */
export const OBSERVATION_SCHEMA='evercraft.window.private-observation.v1';
export const RECEIPT_SCHEMA='evercraft.window.policy-decision-receipts.v1';
const allowedSources=new Set(['rule_policy_v1','social_policy_v1']);
const allowedTypes=new Set(['proposal','pledge','refusal','funded','failure','construction','project_completed','promise_made','promise_kept','promise_broken','invitation_declined']);
const hex=/^[0-9a-f]{64}$/;
const eventId=/^e[1-9][0-9]{0,12}$/;
const residentId=/^r(?:[1-9]|1[0-2])$/;
const bounded=(s,n)=>typeof s==='string'&&s.length<=n;
export function validateSocietyObservation(data){
  if(!data||data.schema!==OBSERVATION_SCHEMA||
    data.origin!=='operator_supplied_local_snapshot_not_authenticated'||
    data.verified!=='internal_world_hash_only'||
    data.release_status!=='held'||
    data.model_mode!=='civic_and_social_policy_no_llm'||
    !data.observation_created_from||!hex.test(data.observation_created_from.world_hash||'')||
    !Number.isSafeInteger(data.observation_created_from.tick)||
    !Number.isSafeInteger(data.observation_created_from.sequence)||
    !bounded(data.observation_created_from.heartbeat_at,60)||
    !Number.isFinite(Date.parse(data.observation_created_from.heartbeat_at))||
    data.historical_limit!=='only_retained_bounded_chronicle_not_full_history'||
    !Array.isArray(data.residents)||data.residents.length!==12||
    !data.decision_projection||data.decision_projection.schema!==RECEIPT_SCHEMA||
    data.decision_projection.execution_mode!=='deterministic_rules_no_llm'||
    data.decision_projection.attestation!=='content_digest_not_signature'||
    !['complete','partial_bounded_ledger'].includes(data.decision_projection.coverage)||
    !Array.isArray(data.decision_projection.receipts)||
    data.decision_projection.receipts.length>48)
    throw Error('Unsupported or unverified spectator observation');
  const ids=new Set();
  const residents=data.residents.map(x=>{
    if(!x||!residentId.test(x.id)||!bounded(x.name,80)||!bounded(x.job,80)||
      !bounded(x.zone,80)||!bounded(x.emoji,8)||ids.has(x.id))
      throw Error('Invalid fictional resident metadata');
    ids.add(x.id);
    return {id:x.id,name:x.name,job:x.job,zone:x.zone,emoji:x.emoji};
  });
  let fetchInfo=null;
  if(data.source_fetch!==undefined){
    const p=data.source_fetch;
    if(!p||p.kind!=='github_https_commit_pinned_read_only'||
       p.repo!=='jgaethle10/forge-operator'||p.branch!=='window-society-state'||
       p.path!=='state/window.json'||
       !/^[a-f0-9]{40}$/.test(p.commit_sha||'')||
       !/^[a-f0-9]{40}$/.test(p.blob_sha||'')||
       !bounded(p.observed_at,60)||!Number.isFinite(Date.parse(p.observed_at))||
       p.assertion!=='git_blob_and_world_content_consistency_not_signed_attestation')
       throw Error('Invalid file-supplied source provenance');
    fetchInfo={commitSha:p.commit_sha,blobSha:p.blob_sha,observedAt:p.observed_at};
  }
  const seen=new Set();
  const receipts=data.decision_projection.receipts.map(r=>{
    if(!r||!eventId.test(r.event_id)||seen.has(r.event_id)||
       !ids.has(r.actor_id)||r.related_actor_id!==null&&!ids.has(r.related_actor_id)||
       !allowedSources.has(r.source)||!allowedTypes.has(r.event_type)||
       !Number.isSafeInteger(r.day)||r.day<1||
       !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(r.time||'')||
       !bounded(r.description,240)||!hex.test(r.content_sha256||'')||
       r.inference!=='none'||r.external_actions!==false||r.fictional!==true||
       r.authority!=='window_civic_social_rule_policy')
      throw Error('Malformed fictional policy receipt');
    seen.add(r.event_id);
    return {...r};
  });
  return {
    sequence:data.observation_created_from.sequence,
    tick:data.observation_created_from.tick,
    heartbeatAt:data.observation_created_from.heartbeat_at,
    hash:data.observation_created_from.world_hash,
    coverage:data.decision_projection.coverage,
    total:data.decision_projection.total_events_generated,
    policyCount:data.decision_projection.policy_events_available,
    omitted:data.decision_projection.omitted_policy_events,
    sourceFetch:fetchInfo,
    residents,receipts
  };
}

/**
 * Recompute every content digest in the browser before presenting any policy
 * event as an inspectable receipt. This detects tampering in the selected file.
 * It does NOT authenticate the source file or attest to independent inference.
 */
export async function verifySocietyObservationReceipts(data,{subtle=globalThis.crypto?.subtle}={}){
  const parsed=validateSocietyObservation(data);
  if(!subtle || typeof subtle.digest!=='function')throw Error('Cryptographic receipt verification unavailable');
  const encoder=new TextEncoder();
  for(const r of parsed.receipts){
    // Key order matches the existing read-only canonical projection.
    const evidence={
      event_id:r.event_id,source:r.source,event_type:r.event_type,
      actor_id:r.actor_id,related_actor_id:r.related_actor_id,
      day:r.day,time:r.time,description:r.description
    };
    const bytes=encoder.encode(JSON.stringify(evidence));
    const digest=await subtle.digest('SHA-256',bytes);
    const actual=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(actual!==r.content_sha256)throw Error('Decision receipt content digest mismatch');
  }
  return parsed;
}

export function mountSocietyLedger({onOpen=()=>{}}={}){
  const actions=document.querySelector('.actions');
  if(!actions)throw Error('Worlds HUD controls missing');
  const trigger=document.createElement('button');
  trigger.type='button';trigger.id='societyLedgerOpen';
  trigger.textContent='📜 Society ledger';
  actions.append(trigger);

  const panel=document.createElement('aside');
  panel.id='societyLedgerPanel';panel.className='society-ledger hidden';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','false');
  panel.setAttribute('aria-label','Mossmere policy decision evidence');
  panel.innerHTML=`<div class="sl-head"><div><span class="smallcap">EVERCRAFT WORLDS · OBSERVATION</span><h2>The town remembers.</h2></div><button type="button" id="sl-close" aria-label="Close society ledger">×</button></div>
    <p class="sl-lead">Inspect decisions from Mossmere's saved Window heartbeat. The three visible 3D inhabitants are <strong>not</strong> synchronized with the twelve Window residents.</p>
    <label class="sl-import" for="sl-file">Choose a private observation JSON</label>
    <input id="sl-file" type="file" accept="application/json,.json"/>
    <p class="sl-status" id="sl-status" role="status" aria-live="polite">Select a file generated by the read-only Window observer. No file is uploaded or retained after reload.</p>
    <div id="sl-loaded" class="hidden">
      <div class="sl-meta" id="sl-meta"></div>
      <label for="sl-resident">Resident</label><select id="sl-resident"><option value="all">All residents</option></select>
      <h3>Saved policy decisions <span id="sl-count"></span></h3>
      <ol id="sl-events"></ol>
    </div>
    <p class="sl-truth">FICTIONAL SIMULATION · DETERMINISTIC CIVIC & SOCIAL RULES · NO LLM DECISIONS · NO LIVE SYNC. A local content digest is not an authenticated signature. The source file is operator-supplied and historical events may be missing from the bounded ledger. This panel does not edit the 3D world or the canonical society.</p>`;
  document.body.append(panel);
  const $=id=>panel.querySelector('#'+id);
  let open=false,observation=null,filter='all';
  const node=(tag,value)=>{const el=document.createElement(tag);el.textContent=String(value);return el;};
  function render(){
    if(!observation)return;
    const meta=$('sl-meta');
    meta.replaceChildren(
      node('span','Heartbeat #'+observation.sequence),
      node('span','Tick '+observation.tick),
      node('span',observation.coverage==='complete'?'Retained slice complete':'History is partial'),
      node('span','Snapshot '+observation.heartbeatAt),
      ...(observation.sourceFetch?[node('span','GitHub commit '+observation.sourceFetch.commitSha.slice(0,12)+' (file-reported)')]:[]));
    const select=$('sl-resident');select.replaceChildren();
    const all=node('option','All residents');all.value='all';select.append(all);
    for(const r of observation.residents){const opt=node('option',r.emoji+' '+r.name+' · '+r.job);opt.value=r.id;select.append(opt);}
    select.value=filter;
    const rows=observation.receipts.filter(r=>filter==='all'||r.actor_id===filter||r.related_actor_id===filter);
    $('sl-count').textContent=rows.length+' of '+observation.receipts.length;
    const events=rows.map(r=>{
      const li=node('li',r.description);
      li.prepend(node('small',r.event_id+' · '+r.source.replace('_policy_v1',' policy')+' · day '+r.day+' '+r.time));
      const more=document.createElement('details');more.className='sl-evidence';
      const summary=node('summary','Inspect source receipt');more.append(summary);
      const authors=node('p','Actor '+r.actor_id+(r.related_actor_id?' · Related '+r.related_actor_id:''));
      const method=node('p','Event type '+r.event_type+' · Rules: '+r.source+' · LLM inference: none');
      const digest=node('code',r.content_sha256);
      more.append(authors,method,node('p','Content digest (not a signature):'),digest);
      li.append(more);
      return li;
    });
    $('sl-events').replaceChildren(...(events.length?events:[node('li','No retained policy decisions for this selection.')]));
  }
  function close(){open=false;panel.classList.add('hidden');trigger.focus({preventScroll:true});}
  function show(){open=true;onOpen();panel.classList.remove('hidden');$('sl-close').focus({preventScroll:true});}
  trigger.addEventListener('click',()=>open?close():show());
  $('sl-close').addEventListener('click',close);
  $('sl-resident').addEventListener('change',e=>{filter=e.target.value;render();});
  $('sl-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    observation=null;filter='all';$('sl-loaded').classList.add('hidden');
    if(!file)return;
    if(file.size<2||file.size>1_000_000){$('sl-status').textContent='File rejected: maximum 1 MB.';return;}
    try{
      const raw=await file.text();
      observation=await verifySocietyObservationReceipts(JSON.parse(raw));
      $('sl-loaded').classList.remove('hidden');
      $('sl-status').textContent=observation.sourceFetch
        ?'Loaded a file reporting a pinned GitHub state commit. Receipt hashes checked; the browser does not independently authenticate the file.'
        :'Loaded a local, operator-supplied, read-only projection. Receipt hashes checked; source authenticity is not independently verified.';
      render();
    }catch(err){$('sl-status').textContent='Observation refused: '+err.message;}
    // No browser storage, telemetry, upload or network requests.
  });
  panel.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  return {isOpen:()=>open};
}
