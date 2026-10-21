// Evercraft Parcel Desk large-file engine v0.2.
// Chunked browser-local SHA-256; no network calls, no encryption or delivery claims.
export const MIB = 1024 * 1024;
export const MAX_BYTES = 512 * MIB;
export const MAX_PARTS = 64;
export const ALLOWED_PART_SIZES = Object.freeze([8 * MIB, 16 * MIB]);
export const FORMAT = 'evercraft-parcel-large-v0.2';
const HEX = /^[0-9a-f]{64}$/;
const K = new Uint32Array([
0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,
0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,
0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,
0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,
0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotr=(n,k)=>(n>>>k)|(n<<(32-k));
export function validFilename(s) {
 return typeof s === 'string' && s.length > 0 && s.length <= 180 && s !== '.' && s !== '..'
 && !/[\\/\x00-\x1f\x7f]/.test(s) && !/[<>:"|?*]/.test(s);
}
export class StreamingSHA256 {
 constructor(){
  this.h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  this.buffer=new Uint8Array(64);this.fill=0;this.bytes=0;this.finished=false;this.w=new Uint32Array(64);
 }
 block(block) {
  const w=this.w;
  for(let i=0;i<16;i++){const n=i*4;w[i]=((block[n]<<24)|(block[n+1]<<16)|(block[n+2]<<8)|block[n+3])>>>0;}
  for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10)))>>>0;}
  let [a,b,c,d,e,f,g,z]=this.h;
  for(let i=0;i<64;i++){
   const s1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^((~e)&g),t1=(z+s1+ch+K[i]+w[i])>>>0;
   const s0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;
   z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
  }
  const t=[a,b,c,d,e,f,g,z];for(let i=0;i<8;i++)this.h[i]=(this.h[i]+t[i])>>>0;
 }
 update(input) {
  if(this.finished)throw new Error('Hasher is finalized');
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  this.bytes+=bytes.length;
  if(!Number.isSafeInteger(this.bytes)||this.bytes>MAX_BYTES)throw new Error('Input exceeds bounded large-file prototype');
  let offset=0;
  if(this.fill){
   const take=Math.min(64-this.fill,bytes.length);
   this.buffer.set(bytes.subarray(0,take),this.fill);this.fill+=take;offset+=take;
   if(this.fill===64){this.block(this.buffer);this.fill=0;}
  }
  for(;offset+64<=bytes.length;offset+=64)this.block(bytes.subarray(offset,offset+64));
  if(offset<bytes.length){this.fill=bytes.length-offset;this.buffer.set(bytes.subarray(offset),0);}
  return this;
 }
 digest() {
  if(this.finished)throw new Error('Hasher is finalized');
  const bits=this.bytes*8;
  const pad=new Uint8Array(this.fill<56?64-this.fill:128-this.fill);
  pad[0]=0x80;
  const p=pad.length-8,high=Math.floor(bits/0x100000000),low=bits>>>0;
  pad[p]=high>>>24;pad[p+1]=high>>>16;pad[p+2]=high>>>8;pad[p+3]=high;
  pad[p+4]=low>>>24;pad[p+5]=low>>>16;pad[p+6]=low>>>8;pad[p+7]=low;
  // Do not use update: padding is not source content and may exceed size cap.
  for(let i=0;i<pad.length;i++){this.buffer[this.fill++]=pad[i];if(this.fill===64){this.block(this.buffer);this.fill=0;}}
  this.finished=true;
  return [...this.h].map(x=>x.toString(16).padStart(8,'0')).join('');
 }
}
function validateSize(file){
 if(!file||!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_BYTES)throw new Error('File exceeds 512 MiB desktop pilot or has invalid size');
}
export function partCount(bytes,partSize) {
 if(!ALLOWED_PART_SIZES.includes(partSize)||!Number.isSafeInteger(bytes)||bytes<0||bytes>MAX_BYTES)throw new Error('Unsupported file or part size');
 const count=Math.ceil(bytes/partSize);
 if(count>MAX_PARTS)throw new Error('Too many pieces: select 16 MiB or an approved secure transfer');
 return count;
}
async function ingestBlob(blob,hashers,onBytes,{stepBytes=1024*1024}={}) {
 for(let offset=0;offset<blob.size;offset+=stepBytes){
  const bytes=new Uint8Array(await blob.slice(offset,Math.min(blob.size,offset+stepBytes)).arrayBuffer());
  for(const h of hashers)h.update(bytes);
  onBytes?.(bytes.length);
 }
}
export async function createLargeParcel(file,partSize,{onProgress}={}){
 validateSize(file);
 if(!validFilename(file.name))throw new Error('Unsupported original filename');
 const count=partCount(file.size,partSize);
 const total=new StreamingSHA256(),partReceipts=[];
 let complete=0;
 for(let i=0;i<count;i++){
  const start=i*partSize,end=Math.min(file.size,start+partSize);
  const piece=file.slice(start,end),digest=new StreamingSHA256();
  await ingestBlob(piece,[total,digest],n=>{complete+=n;onProgress?.(complete,file.size);});
  partReceipts.push({size:piece.size,sha256:digest.digest()});
 }
 const sum=total.digest(),parcelId=sum.slice(0,16);
 const parts=partReceipts.map((p,i)=>({
  name:`ec-${parcelId}-part-${String(i+1).padStart(5,'0')}.bin`,size:p.size,sha256:p.sha256,
  blob:file.slice(i*partSize,Math.min(file.size,(i+1)*partSize))
 }));
 const manifest={
  format:FORMAT,parcel_id:parcelId,original_name:file.name,original_size:file.size,
  original_sha256:sum,max_part_bytes:partSize,
  parts:parts.map(({name,size,sha256})=>({name,size,sha256})),
  note:'Manual transport only. Original bytes unchanged; not encrypted or remotely delivered. Verify manifest origin independently.'
 };
 validateLargeManifest(manifest);
 return {manifest,parts,manifestName:`ec-${parcelId}-manifest.json`};
}
export function validateLargeManifest(m){
 if(!m||m.format!==FORMAT||!validFilename(m.original_name)||!Number.isSafeInteger(m.original_size)||m.original_size<0||m.original_size>MAX_BYTES
 ||typeof m.original_sha256!=='string'||!HEX.test(m.original_sha256)||typeof m.parcel_id!=='string'||m.parcel_id!==m.original_sha256.slice(0,16)
 ||!ALLOWED_PART_SIZES.includes(m.max_part_bytes)||!Array.isArray(m.parts))throw new Error('Malformed or unsupported parcel manifest');
 const count=partCount(m.original_size,m.max_part_bytes);
 if(m.parts.length!==count)throw new Error('Manifest has missing or excess pieces');
 for(let i=0;i<count;i++){
  const p=m.parts[i],expected=`ec-${m.parcel_id}-part-${String(i+1).padStart(5,'0')}.bin`;
  const actualSize=Math.min(m.max_part_bytes,m.original_size-i*m.max_part_bytes);
  if(!p||p.name!==expected||p.size!==actualSize||typeof p.sha256!=='string'||!HEX.test(p.sha256))throw new Error('Invalid part metadata');
 }
 return m;
}
export async function restoreLargeParcel(manifest,partFiles,{onProgress}={}){
 const m=validateLargeManifest(manifest);
 if(!Array.isArray(partFiles)||partFiles.length!==m.parts.length)throw new Error('Select exactly the numbered parts in the manifest');
 const found=new Map();
 for(const f of partFiles){
  if(!f||typeof f.name!=='string'||found.has(f.name))throw new Error('Missing or duplicate piece');
  found.set(f.name,f);
 }
 const master=new StreamingSHA256(),assembled=[];
 let complete=0;
 for(const p of m.parts){
  const f=found.get(p.name);
  if(!f||f.size!==p.size)throw new Error('Missing, mismatched or truncated piece: '+p.name);
  const partHash=new StreamingSHA256();
  await ingestBlob(f,[master,partHash],n=>{complete+=n;onProgress?.(complete,m.original_size);});
  if(partHash.digest()!==p.sha256)throw new Error('Corrupted or substituted piece: '+p.name);
  assembled.push(f);
 }
 if(master.digest()!==m.original_sha256)throw new Error('Complete original SHA-256 mismatch');
 const blob=new Blob(assembled,{type:'application/octet-stream'});
 if(blob.size!==m.original_size)throw new Error('Reconstructed byte length mismatch');
 return {blob,name:m.original_name,sha256:m.original_sha256};
}