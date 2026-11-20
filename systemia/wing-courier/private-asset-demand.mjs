// Systemia -> Harbor asset-demand candidate. Owner-private disk only.
// No broker call, network handoff, media enumeration, render, preview or payment.
// A locally staged request is NOT an authenticated Systemia mission or Harbor ACK.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PRIVATE_ASSET_DEMAND_SCHEMA='evercraft.systemia.wing-courier.asset-demand.v1';
export const PRIVATE_ASSET_DEMAND_RECEIPT='evercraft.systemia.wing-courier.asset-demand-staging.v1';
const HEX32=/^[a-f0-9]{32}$/;
const OPAQUE_REF=/^[a-z][a-z0-9-]{7,79}$/;
const KEYS=['assetKind','caseRef','createdAt','customerContactAuthorized','expectedAssetCount',
 'fromWing','intent','paymentAuthorized','productionAuthorized','requestId','requestedBy',
 'schema','state','toWing'];
const fail=x=>{throw Error('wing_asset_demand_'+x)};

export function validatePrivateAssetDemand(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).length!==KEYS.length||
    Object.keys(input).some(k=>!KEYS.includes(k)))fail('invalid_shape');
 if(input.schema!==PRIVATE_ASSET_DEMAND_SCHEMA||
   !HEX32.test(input.requestId||'')||!OPAQUE_REF.test(input.caseRef||'')||
   input.requestedBy!=='systemia-private-candidate'||
   input.fromWing!=='harbor'||input.toWing!=='fallen'||
   input.assetKind!=='media'||input.intent!=='ORIGINAL_ASSET_CUSTODY_ONLY'||
   !Number.isInteger(input.expectedAssetCount)||input.expectedAssetCount<1||
   input.expectedAssetCount>100||
   input.state!=='PENDING_AUTHENTICATED_HARBOR_PICKUP'||
   input.customerContactAuthorized!==false||
   input.paymentAuthorized!==false||input.productionAuthorized!==false||
   typeof input.createdAt!=='string'||
   !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.createdAt)||
   Number.isNaN(Date.parse(input.createdAt))||
   new Date(input.createdAt).toISOString()!==input.createdAt)
   fail('scope_or_authority_invalid');
 return Object.freeze({...input});
}

export function draftPrivateAssetDemand({caseRef,expectedAssetCount=12,
 randomBytes=crypto.randomBytes,now=()=>new Date()}={}){
 if(!OPAQUE_REF.test(caseRef||''))fail('opaque_case_ref_required');
 const token=randomBytes(16);
 if(!Buffer.isBuffer(token)||token.length!==16)fail('invalid_random_source');
 return validatePrivateAssetDemand({
  schema:PRIVATE_ASSET_DEMAND_SCHEMA,
  requestId:token.toString('hex'),
  caseRef,requestedBy:'systemia-private-candidate',
  fromWing:'harbor',toWing:'fallen',assetKind:'media',
  expectedAssetCount,intent:'ORIGINAL_ASSET_CUSTODY_ONLY',
  state:'PENDING_AUTHENTICATED_HARBOR_PICKUP',
  createdAt:now().toISOString(),
  customerContactAuthorized:false,paymentAuthorized:false,
  productionAuthorized:false,
 });
}

// Check each path component for symlinks. Queue content is restricted to the
// already-approved owner-local private directory; never create that directory
// or choose a system-wide location on behalf of an untrusted caller.
function privateDirectory(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir))fail('absolute_private_queue_required');
 let walk=path.parse(dir).root;
 for(const part of dir.slice(walk.length).split(path.sep).filter(Boolean)){
  walk=path.join(walk,part);
  const st=fs.lstatSync(walk);
  if(!st.isDirectory()||st.isSymbolicLink())fail('unsafe_parent_directory');
 }
 const st=fs.lstatSync(dir);
 if((st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
    fail('private_queue_permissions_required');
 return dir;
}

export function stagePrivateAssetDemand({request,privateQueueDir}={}){
 const candidate=validatePrivateAssetDemand(request);
 const root=privateDirectory(privateQueueDir);
 const file=path.join(root,candidate.requestId+'.json');
 const raw=JSON.stringify(candidate)+'\n';
 // Exclusive create prevents an attacker or parallel worker replacing a
 // different private request with the same id.
 let fd;
 try{
  fd=fs.openSync(file,'wx',0o600);
  fs.writeFileSync(fd,raw,'utf8');
  fs.fsyncSync(fd);
 }catch(e){
  if(e?.code!=='EEXIST')throw e;
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||
     (typeof process.getuid==='function'&&stat.uid!==process.getuid()))
    fail('existing_request_not_private');
  if(fs.readFileSync(file,'utf8')!==raw)fail('request_id_conflict');
  return Object.freeze({schema:PRIVATE_ASSET_DEMAND_RECEIPT,
   requestId:candidate.requestId,stage:'OWNER_PRIVATE_CANDIDATE_STAGED',
   idempotent:true,harborReceived:false,systemiaAdmitted:false,
   transportStarted:false,customerReleaseAuthorized:false});
 }finally{if(fd!==undefined)fs.closeSync(fd)}
 return Object.freeze({schema:PRIVATE_ASSET_DEMAND_RECEIPT,
  requestId:candidate.requestId,stage:'OWNER_PRIVATE_CANDIDATE_STAGED',
  idempotent:false,harborReceived:false,systemiaAdmitted:false,
  transportStarted:false,customerReleaseAuthorized:false});
}

export function readPrivateAssetDemand({requestId,privateQueueDir}={}){
 if(!HEX32.test(requestId||''))fail('request_id_invalid');
 const file=path.join(privateDirectory(privateQueueDir),requestId+'.json');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||
    (typeof process.getuid==='function'&&stat.uid!==process.getuid())||
    stat.size>4096)fail('private_request_invalid');
 const input=validatePrivateAssetDemand(JSON.parse(fs.readFileSync(file,'utf8')));
 if(input.requestId!==requestId)fail('id_filename_mismatch');
 return input;
}
