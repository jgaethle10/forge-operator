// One explicitly invoked owner-host capture. No scheduling, no extraction or admission.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const registry=JSON.parse(fs.readFileSync(new URL('./wa-source-acquisition.v1.json',import.meta.url),'utf8'));
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const sha=b=>createHash('sha256').update(b).digest('hex');
function privateDir(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir)||fs.realpathSync(dir)!==path.resolve(dir))throw Error('private_directory_required');
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)||s.uid!==process.getuid())throw Error('private_directory_required');
 return dir;
}
function preserve(file,bytes){
 const tmp=path.join(path.dirname(file),'.capture-'+randomUUID());
 try{
  fs.writeFileSync(tmp,bytes,{flag:'wx',mode:0o600});
  try{fs.linkSync(tmp,file)}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size!==bytes.length||
    !fs.readFileSync(fd).equals(bytes))throw Error('capture_existing_bytes_conflict');}
   finally{fs.closeSync(fd)}
  }
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
export async function captureEcologyWorkbook({sourceKey,outDir,fetcher=fetch}={}){
 const source=registry.sources.find(s=>s.key===sourceKey);
 if(!source)throw Error('source_not_allowlisted');
 const dir=privateDir(outDir);
 const response=await fetcher(source.url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{accept:mime}});
 if(!response.ok||response.status!==200||!response.body||response.url!==source.url||
    response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!==mime)
  throw Error('workbook_http_or_mime_invalid');
 const reader=response.body.getReader(),chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;
  if(total>registry.maxBytes)throw Error('workbook_capture_limit');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 const raw=Buffer.concat(chunks);
 if(raw.length<4||raw.readUInt32LE(0)!==0x04034b50)throw Error('workbook_zip_signature_invalid');
 const digest=sha(raw),filename=source.key+'-'+digest+'.xlsx';
 preserve(path.join(dir,filename),raw);
 const receipt={schema:'evercraft.circular-recovery.workbook-capture.v1',sourceKey,url:source.url,
  capturedAt:new Date().toISOString(),httpStatus:200,contentType:mime,bytes:total,sha256:digest,filename,
  zipSignatureMatched:true,workbookSchemaVerified:false,rowsVerified:0,availableSupplyVerified:false,
  environmentalClaimVerified:false,publicationAuthority:false};
 const receiptBytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
 preserve(path.join(dir,source.key+'-'+sha(receiptBytes)+'.receipt.json'),receiptBytes);
 return receipt;
}
