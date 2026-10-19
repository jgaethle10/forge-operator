import {MiB,checkBudget,formatBytes,safeFilename,classifyFile,createPlan,sha256,makeLosslessParts,textReport} from './core.mjs';
import {LocalAIBriefer} from './ai.mjs';
const $=id=>document.getElementById(id);
const ai=new LocalAIBriefer();
let currentFile=null, outputs=[],currentMode='exact',currentBudget=0.5;
let busy=false,lastManifest=null;
const icons={
  check:'✓',warning:'!',download:'↓',file:'▤'
};
function setStatus(text,tone='muted'){$('statusText').textContent=text;$('statusPill').dataset.tone=tone;}
function showNotice(text,tone='info'){$('notice').textContent=text;$('notice').dataset.tone=tone;$('notice').hidden=false;}
function progress(n,detail=''){$('progressBar').style.width=`${Math.min(100,Math.max(0,n*100))}%`;$('progressDetail').textContent=detail;}
function setBusy(v){busy=v;$('shipButton').disabled=v||!currentFile;$('shipButton').textContent=v?'Preparing shipment…':'Prepare shipment →';$('loadAI').disabled=v||ai.status==='ready';}
function setFile(file){
 currentFile=file;outputs=[];lastManifest=null;$('dropzone').classList.add('has-file');
 $('fileName').textContent=safeFilename(file.name);$('fileMeta').textContent=`${formatBytes(file.size)} · ${classifyFile(file)} · on your device`;
 $('dropTitle').textContent='File secured locally';$('dropSub').textContent='Tap to replace, or drag another file in';
 $('receipt').hidden=true;$('resultEmpty').hidden=false;$('resultList').innerHTML='';$('outputCount').textContent='00';
 $('downloadAll').hidden=true;setBusy(false);planPreview();
}
function getBudget(){return checkBudget($('budget').value);}
function planPreview(){
 if(!currentFile){$('routeType').textContent='Awaiting cargo';$('routeDescription').textContent='Choose a local file to calculate a truthful shipping route.';return;}
 try{
  const plan=createPlan(currentFile,getBudget(),currentMode,ai.status==='ready');
  const labels={original:'Exact original', 'lossless-parts':'Lossless multipart', 'gzip-or-parts':'Compressed text / multipart', 'image-reencode':'Photo optimizations', 'ai-extractive-brief':'Local AI evidence brief', 'ai-not-ready':'Open model not loaded', 'brief-unavailable':'Readable text required'};
  $('routeType').textContent=labels[plan.method]||plan.method;
  $('routeDescription').textContent=plan.method==='original'?'Original fits within your selected planning budget. We will preserve every byte.':
   plan.method==='ai-not-ready'?'Load and verify the open-weight model to create an AI-powered briefing, or select exact original.':
   plan.method==='brief-unavailable'?'AI briefing currently supports readable .txt, .md, .csv or .json documents only.':
   plan.method==='lossless-parts'?`Split into approximately ${plan.partsEstimate} SHA-256 checked parts. Recipient can reassemble the original.`:
   plan.method==='image-reencode'?'Create a visibly labeled, compressed image derivative. Original remains untouched.':
   plan.method==='ai-extractive-brief'?'Rank source sentences against the recipient question with verified local MiniLM embeddings.':
   'Compress readable text. If still too large, ship exact parts.';
  $('sourceSize').textContent=formatBytes(currentFile.size);
  $('budgetSize').textContent=formatBytes(getBudget());
  $('sizeRatio').style.width=`${Math.min(100,Math.max(3,currentFile.size/getBudget()*100))}%`;
  $('budgetExplainer').textContent=`${formatBytes(getBudget())} per attachment is your chosen planning target, not a guaranteed provider limit.`;
  $('truthNote').textContent=plan.lossy?'Derivative output. The full original is NOT reproduced by this route.': 'Exact file preservation is available with checksummed multipart shipping.';
  $('truthNote').dataset.mode=plan.lossy?'lossy':'lossless';
  setBusy(false);
 }catch(e){$('routeType').textContent='Set a valid budget';$('routeDescription').textContent=e.message;setBusy(true);}
}
function downloadEntry(entry){
 const href=URL.createObjectURL(entry.blob);const a=document.createElement('a');a.href=href;a.download=entry.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),25000);
}
function safeText(str){return String(str).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function renderOutputs(){
 $('resultEmpty').hidden=true;$('receipt').hidden=false;$('outputCount').textContent=String(outputs.length).padStart(2,'0');$('resultList').innerHTML='';
 for(const entry of outputs){
  const row=document.createElement('div');row.className='output-entry';
  const meta=document.createElement('div');meta.className='output-meta';
  const n=document.createElement('strong');n.textContent=entry.name;
  const desc=document.createElement('small');desc.textContent=`${formatBytes(entry.blob.size)} · ${entry.kind||'file'}`;
  meta.append(n,desc);
  const btn=document.createElement('button');btn.className='output-action';btn.type='button';btn.textContent='Save ↓';btn.addEventListener('click',()=>downloadEntry(entry));
  row.append(meta,btn);$('resultList').append(row);
 }
 $('downloadAll').hidden=outputs.length>12;
 const receiptItems=outputs.map(({name,blob,sha256:hash})=>({name,bytes:blob.size,sha256:hash||'not_computed'}));
 $('receiptBody').textContent=JSON.stringify({tool:'File Ferry / local-source preview',source:safeFilename(currentFile.name),outputs:receiptItems,model_state:ai.status,mode:currentMode,receiver_provider_delivery:'not_tested',sent:false,production_release:false},null,2);
}
async function createEntry(name,blob,kind='original'){
 return {name,blob,kind,sha256:blob.size<=32*MiB?await sha256(blob):null};
}
async function gzip(blob){
 if(typeof CompressionStream==='undefined')return null;
 const s=blob.stream().pipeThrough(new CompressionStream('gzip'));
 return await new Response(s).blob();
}
async function compressImage(file,target){
 const image=await createImageBitmap(file);const originalW=image.width,originalH=image.height;
 if(originalW*originalH>70e6){image.close();throw new Error('Image exceeds local pixel safety limit (70 MP)');}
 let best=null,bestW=0,bestH=0;
 for(const scale of [1,.8,.64,.5,.4,.3,.23,.17,.12,.08]){
  const width=Math.max(1,Math.round(originalW*scale)),height=Math.max(1,Math.round(originalH*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
  ctx.drawImage(image,0,0,width,height);
  for(const quality of [.9,.78,.62,.45,.3]){
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
   if(blob&&(best===null||blob.size<best.size)){best=blob;bestW=width;bestH=height;}
   if(blob&&blob.size<=target){image.close();return {blob,width,height,quality,lossy:true};}
  }
 }
 image.close();throw new Error(`Cannot reliably fit photo under this target. Smallest candidate: ${formatBytes(best?.size||0)} at ${bestW}×${bestH}. Increase the budget.`);
}
async function prepare(){
 if(!currentFile||busy)return;
 const file=currentFile;let limit,plan;
 try{limit=getBudget();plan=createPlan(file,limit,currentMode,ai.status==='ready');}catch(e){showNotice(e.message,'error');return;}
 setBusy(true);$('notice').hidden=true;progress(.08,'Reading local file metadata');$('stepOne').dataset.done='true';$('stepTwo').dataset.done='true';
 try{
  let shipped=[];let method=plan.method;
  if(method==='ai-not-ready')throw new Error('AI is not loaded. Tap “Load open AI” and wait for real inference verification.');
  if(method==='brief-unavailable')throw new Error('AI brief accepts readable text only. Switch to lossless original.');
  if(method==='ai-extractive-brief'){
    const r=await ai.brief(file,$('goal').value,t=>progress(.2,t));
    if(r.blob.size>limit)throw new Error('Even the summary exceeds your small budget. Increase it or ship lossless parts.');
    shipped.push(await createEntry(safeFilename(file.name).replace(/\.[^.]+$/,'')+'-ai-evidence-brief.txt',r.blob,'AI-selected derivative'));
  }else if(method==='image-reencode'){
    const r=await compressImage(file,limit);progress(.7,'Local image re-encoding complete');
    shipped.push(await createEntry(safeFilename(file.name).replace(/\.[^.]+$/,'')+'-compressed.webp',r.blob,`lossy derivative ${r.width}×${r.height}`));
  }else if(method==='original'){
    shipped.push(await createEntry(safeFilename(file.name),file,'exact original'));
  }else if(method==='gzip-or-parts'){
    const zipped=await gzip(file);
    if(zipped&&zipped.size<=limit){
      shipped.push(await createEntry(safeFilename(file.name)+'.gz',zipped,'lossless gzip, recipient must decompress'));
    }else method='lossless-parts';
  }
  if(method==='lossless-parts'){
    const packed=await makeLosslessParts(file,limit,{onProgress:p=>progress(.16+p*.72,`SHA-256 checking part ${Math.ceil(p*packedCount(file.size,limit))}`)});
    lastManifest=packed.manifest;
    for(const p of packed.pieces)shipped.push({...p,kind:'lossless original part',sha256:p.hash});
    shipped.push(await createEntry(`${safeFilename(file.name)}.ferry-manifest.json`,new Blob([JSON.stringify(packed.manifest,null,2)],{type:'application/json'}),'receipt · mandatory for reassembly'));
  }
  outputs=shipped;progress(.99,'Preparing manifest and output receipts');
  renderOutputs();progress(1,`Prepared ${outputs.length} local deliverables; nothing was sent`);$('stepThree').dataset.done='true';$('stepFour').dataset.done='true';
  setStatus('Package prepared, not sent','ready');
  showNotice(`Prepared ${outputs.length} file${outputs.length===1?'':'s'} locally. Choose “Save” for each item. Recipient delivery is not guaranteed.`,'success');
 }catch(e){setStatus('Needs attention','error');showNotice(e instanceof Error?e.message:String(e),'error');progress(0,'No shipment prepared');}
 finally{setBusy(false);}
}
function packedCount(n,limit){return Math.max(1,Math.ceil(n/limit));}
$('fileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)setFile(f);});
const zone=$('dropzone');
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragover');});
zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragover');const f=e.dataTransfer?.files?.[0];if(f)setFile(f);});
document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>{
 currentMode=el.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b===el));planPreview();
}));
document.querySelectorAll('[data-budget]').forEach(el=>el.addEventListener('click',()=>{
 currentBudget=Number(el.dataset.budget);$('budget').value=String(currentBudget);document.querySelectorAll('[data-budget]').forEach(b=>b.classList.toggle('active',b===el));planPreview();
}));
$('budget').addEventListener('input',()=>{document.querySelectorAll('[data-budget]').forEach(b=>b.classList.remove('active'));planPreview();});
$('shipButton').addEventListener('click',prepare);
$('downloadAll').addEventListener('click',()=>{if(outputs.length>12)return;outputs.forEach((e,i)=>setTimeout(()=>downloadEntry(e),i*350));});
$('copyReceipt').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('receiptBody').textContent);showNotice('Internal receipt copied. No message was sent.','success');}catch{showNotice('Copy unavailable in this browser; select the receipt text manually.','error');}});
$('loadAI').addEventListener('click',async()=>{
 $('loadAI').disabled=true;setStatus('Open weights loading','working');
 try{await ai.load(msg=>{$('modelDetails').textContent=msg;});$('aiBadge').textContent='LOCAL MODEL VERIFIED';$('aiBadge').dataset.state='ready';$('loadAI').textContent='✓ Verified local AI';$('modelDetails').textContent='MiniLM q8 inference verified in this browser. Local content stays on this device.';setStatus('Model ready','ready');}
 catch(e){$('aiBadge').textContent='MODEL UNAVAILABLE';$('aiBadge').dataset.state='error';$('modelDetails').textContent=`Could not load or run model: ${e.message}`;$('loadAI').disabled=false;setStatus('Model unavailable','error');}
 planPreview();
});
$('sampleText').addEventListener('click',()=>{
 const sample=`PROJECT: Community repair center October service pack\nDATE: October 12, 2026\nCLIENT REQUEST: Please send a small readable note rather than the entire project binder.\n\nThe repair center needs a clear action list before Thursday. The main constraint is that its volunteer shift starts at 8 AM. The client asked for a one page budget and important decision points. The workshop expects 14 helpers and has two accessible entrances. The kitchen supplier can arrive Tuesday but not Friday. We should verify the updated inventory before confirming quantities. The draft list includes hand tools, replacement cables, protective gloves, and storage bins. The risk is that sending the full 38 page document by email may fail at a small attachment limit. The recipient does not need confidential staff phone numbers for this decision. The lead coordinator should approve the budget by Wednesday at noon. The next meeting is Thursday at 9 AM.\n\n`+('Field note: The team is exploring smaller attachments with exact integrity receipts. Repeat attachments should not be presented as delivered until the provider confirms delivery.\n').repeat(36);
 setFile(new File([sample],'community-repair-brief.txt',{type:'text/plain'}));
});
$('sampleBinary').addEventListener('click',()=>{
 const bytes=new Uint8Array(4*1024*1024);for(let i=0;i<bytes.length;i++)bytes[i]=(i*17+31)%251;
 setFile(new File([bytes],'sample-photo-archive.bin',{type:'application/octet-stream'}));
});
setStatus('Local-only preparation','muted');
progress(0,'Select a file to begin');