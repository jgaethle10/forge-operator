/** File Ferry, new clean-room Week 2 project. No source code imported from Evercraft products. */
export const MiB = 1024 * 1024;
export const MAX_IN_MEMORY_HASH = 32 * MiB;
export const DEFAULT_BUDGETS = Object.freeze([
  { id: 'review', label: 'Quick review', mib: 0.5, note: 'A user-selected planning target, not a service limit' },
  { id: 'message', label: 'Message', mib: 2, note: 'A user-selected planning target, not a service limit' },
  { id: 'email', label: 'Email', mib: 10, note: 'A user-selected planning target, not a service limit' },
  { id: 'share', label: 'Shared handoff', mib: 25, note: 'A user-selected planning target, not a service limit' }
]);
export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return 'unknown';
  if (n < 1024) return `${Math.round(n)} B`;
  const units=['KB','MB','GB','TB'];
  let x=n, u=-1;
  do { x/=1024; u++; } while(x>=1024 && u<units.length-1);
  return `${x>=10 ? x.toFixed(1) : x.toFixed(2)} ${units[u]}`;
}
export function safeFilename(name) {
  const raw=String(name||'unnamed-file');
  const leaf=raw.split(/[\\/]/).pop() || 'unnamed-file';
  const filtered=leaf.replace(/[\u0000-\u001f\u007f<>:"|?*]/g,'_').replace(/^\.+/,'').trim();
  return (filtered||'unnamed-file').slice(0,120);
}
export function classifyFile(file) {
  const ext=(String(file?.name||'').split('.').pop()||'').toLowerCase();
  if ((file?.type||'').startsWith('image/') && ['png','jpeg','jpg','webp','bmp'].includes(ext)) return 'image';
  if ((file?.type||'').startsWith('text/') || ['txt','md','csv','json','log','xml'].includes(ext)) return 'text';
  return 'binary';
}
export function checkBudget(mib) {
  const n=Number(mib);
  if (!Number.isFinite(n) || n<0.05 || n>250) throw new Error('Budget must be between 0.05 and 250 MiB');
  return Math.floor(n*MiB);
}
export function createPlan(file, budgetBytes, mode='exact', aiActive=false) {
  if (!file || !Number.isFinite(file.size) || file.size<0) throw new Error('Choose a valid file first');
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes<=0) throw new Error('A positive delivery budget is required');
  if (!['exact','compact','brief'].includes(mode)) throw new Error('Unrecognized shipment mode');
  const kind=classifyFile(file), fit=file.size<=budgetBytes;
  const lossy=mode==='brief'||(mode==='compact' && kind==='image');
  let method;
  if(mode==='brief') {
    method=kind==='text'?(aiActive?'ai-extractive-brief':'ai-not-ready'):'brief-unavailable';
  } else if(mode==='compact' && kind==='image') method='image-reencode';
  else if(fit) method='original';
  else if(mode==='compact' && kind==='text') method='gzip-or-parts';
  else method='lossless-parts';
  return {kind,fit,method,lossy,budgetBytes,mode,originalBytes:file.size,
    partsEstimate:method==='lossless-parts'?Math.ceil(file.size/budgetBytes):null,
    warnings:[
      ...(lossy?['This option produces a derivative. It does not preserve the original document or image exactly.']:[]),
      ...(!fit?['Recipient may need multiple attachments, and their provider can enforce other limits.']:[]),
      ...(method==='ai-not-ready'?['Load and verify the local open-weight model before creating an AI brief.']:[]),
      ...(method==='brief-unavailable'?['Briefing currently supports readable text only.']:[])
    ]};
}
export function dot(a,b) {
  if(!a||!b||a.length!==b.length||a.length===0) throw new Error('Embeddings must have matching dimensions');
  let x=0; for(let i=0;i<a.length;i++)x+=Number(a[i])*Number(b[i]);
  return x;
}
export function cosine(a,b) {
  if(!a||!b||a.length!==b.length||a.length===0) throw new Error('Embeddings must have matching dimensions');
  let x=0,an=0,bn=0;
  for(let i=0;i<a.length;i++){const u=Number(a[i]),v=Number(b[i]);x+=u*v;an+=u*u;bn+=v*v;}
  return an&&bn?x/(Math.sqrt(an)*Math.sqrt(bn)):0;
}
export function pickEvidence(sentences, vectors, queryVector, maxSentences=5) {
  if(sentences.length!==vectors.length)throw new Error('Each sentence needs an embedding');
  const ranked=sentences.map((sentence,index)=>({sentence,index,score:cosine(vectors[index],queryVector)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,maxSentences).sort((a,b)=>a.index-b.index);
  return ranked;
}
export function splitSentences(text,max=80) {
  return String(text||'').replace(/\r/g,'').split(/(?<=[.!?])\s+|\n+/g)
    .map(s=>s.trim()).filter(s=>s.length>=18 && s.length<=600).slice(0,max);
}
export async function sha256(blobOrData) {
  let bytes;
  if(blobOrData instanceof Blob) bytes=await blobOrData.arrayBuffer();
  else if(blobOrData instanceof ArrayBuffer)bytes=blobOrData;
  else if(ArrayBuffer.isView(blobOrData))bytes=blobOrData.buffer.slice(blobOrData.byteOffset,blobOrData.byteOffset+blobOrData.byteLength);
  else throw new Error('Hash input must be Blob or bytes');
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function partName(name,index,total){
  const width=Math.max(3,String(total).length);
  return `${safeFilename(name)}.ferry-${String(index+1).padStart(width,'0')}-of-${String(total).padStart(width,'0')}.part`;
}
export async function makeLosslessParts(file,budgetBytes,{onProgress=()=>{}}={}){
  if(budgetBytes<1024)throw new Error('Use at least 1 KB for lossless parts');
  const total=Math.max(1,Math.ceil(file.size/budgetBytes));
  if(total>256)throw new Error('Too many parts. Increase your delivery budget.');
  const pieces=[];
  for(let index=0; index<total; index++) {
    const start=index*budgetBytes;
    const blob=file.slice(start,Math.min(start+budgetBytes,file.size));
    const hash=await sha256(blob);
    const name=partName(file.name,index,total);
    pieces.push({name,blob,hash,index,size:blob.size});
    onProgress((index+1)/total);
  }
  const originalHash=file.size<=MAX_IN_MEMORY_HASH?await sha256(file):null;
  const manifest={format:'file-ferry-split-v1',created_utc:new Date().toISOString(),original_name:safeFilename(file.name),
    original_bytes:file.size,original_sha256:originalHash,original_sha256_state:originalHash?'verified':'not_computed_file_over_32_mib',
    total_parts:total,parts:pieces.map(({name,hash,size,index})=>({index:index+1,name,bytes:size,sha256:hash})),
    safety_note:'All files stay on the sender device during packaging. Each part has a SHA-256 digest. Send every part plus this manifest. A hash receipt proves byte equality, not malware safety or recipient deliverability.'};
  return {pieces,manifest};
}
export function verifyManifestShape(manifest, names) {
  if(!manifest||manifest.format!=='file-ferry-split-v1'||!Number.isSafeInteger(manifest.total_parts)||manifest.total_parts<1||manifest.total_parts>256)throw new Error('Invalid File Ferry manifest');
  if(!Array.isArray(manifest.parts)||manifest.parts.length!==manifest.total_parts)throw new Error('Manifest parts do not match count');
  for(let i=0;i<manifest.parts.length;i++){
    const p=manifest.parts[i];
    if(p.index!==i+1||!p.name||!Number.isSafeInteger(p.bytes)||p.bytes<0||!/^[0-9a-f]{64}$/i.test(p.sha256))throw new Error('Malformed part metadata');
  }
  if(names) {
    const seen=new Set(names);
    if(seen.size!==names.length||seen.size!==manifest.parts.length||manifest.parts.some(p=>!seen.has(p.name)))throw new Error('One or more part files are missing or duplicated');
  }
  return true;
}
export async function reassemblePieces(manifest,files,{onProgress=()=>{}}={}){
  verifyManifestShape(manifest,files.map(f=>f.name));
  const map=new Map(files.map(f=>[f.name,f]));
  const chunks=[]; let total=0;
  for(const [i,part] of manifest.parts.entries()){
    const file=map.get(part.name);
    if(!file||file.size!==part.bytes)throw new Error(`Wrong size or missing file: ${part.name}`);
    const actual=await sha256(file);
    if(actual.toLowerCase()!==part.sha256.toLowerCase())throw new Error(`Checksum mismatch: ${part.name}`);
    chunks.push(file);total+=file.size;onProgress((i+1)/manifest.total_parts);
  }
  if(total!==manifest.original_bytes)throw new Error('Reassembled byte count mismatch');
  const result=new Blob(chunks,{type:'application/octet-stream'});
  if(manifest.original_sha256 && result.size<=MAX_IN_MEMORY_HASH) {
    const actual=await sha256(result);
    if(actual!==manifest.original_sha256.toLowerCase())throw new Error('Original SHA-256 mismatch');
  }
  return {name:safeFilename(manifest.original_name),blob:result};
}
export function textReport({file,goal,excerpt,sentences,modelName='Xenova/all-MiniLM-L6-v2',scores=[]}){
  const selected=sentences.map(s=>s.sentence||s).filter(Boolean);
  return [
    'FILE FERRY / AI EVIDENCE BRIEF',
    '================================',
    `Source: ${safeFilename(file.name)} (${formatBytes(file.size)})`,
    `Question: ${String(goal||'What does the recipient need to know?').slice(0,300)}`,
    `Open model: ${modelName}`,
    'Method: embedding-ranked extractive quotation from local source text. Not generative summarization.',
    'This is a derivative, NOT the original file; scores rank relevance, not factual accuracy.',
    '',
    ...selected.map((s,i)=>`${i+1}. ${s}`),
    '',
    `Considered ${excerpt} candidate source sentences. Verify against source before forwarding.`,
    'This tool does not send or upload the source file.',
    ''
  ].join('\n');
}