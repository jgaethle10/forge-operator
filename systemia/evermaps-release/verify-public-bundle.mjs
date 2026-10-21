// EverMaps public-bundle parity probe.
// This is not a deployment tool, screenshot certification, or public-safety release authority.
// An exact reviewed source revision must be supplied by the operator; never accept only a
// self-attested manifest revision. The hosted site must serve the manifest and matching JS.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const SCHEMA='evercraft.evermaps.public-bundle-parity.v1';
const MANIFEST='evercraft.evermaps.release-manifest.v1';
const HOST='evermaps.base44.app';
const MAX_HTML=1024*1024, MAX_MANIFEST=64*1024, MAX_JS=20*1024*1024;
const revPattern=/^[0-9a-f]{40}$/i;
const assetPattern=/^\/assets\/[a-zA-Z0-9._/-]+\.js$/;
const digestPattern=/^[0-9a-f]{64}$/i;

function blocked(code,additional={}){
 return {schema:SCHEMA,state:'BLOCKED',reason:code,
  release_authorized:false,scope:'published-bundle-byte-parity-only',...additional};
}
function originUrl(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!==HOST||url.username||url.password||url.port
   ||url.pathname!=='/'||url.search||url.hash){
  throw new Error('origin must be https://'+HOST+'/');
 }
 return url.origin;
}
async function limitedResponse(url,maxBytes,fetchImpl,timeoutMs){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(url,{signal:controller.signal,redirect:'manual',headers:{Accept:'*/*'}});
  if(response.status!==200)throw new Error('HTTP_'+response.status);
  if(response.url && new URL(response.url).origin!==new URL(url).origin)throw new Error('REDIRECTED_ORIGIN');
  if(!response.body)throw new Error('EMPTY_RESPONSE_BODY');
  const reader=response.body.getReader(),chunks=[];
  let total=0;
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>maxBytes){await reader.cancel().catch(()=>{});throw new Error('RESPONSE_TOO_LARGE');}
   chunks.push(Buffer.from(value));
  }
  return {bytes:Buffer.concat(chunks),type:response.headers.get('content-type')||''};
 }finally{clearTimeout(timeout);}
}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}

export async function verifyPublicEvermaps({
 origin='https://evermaps.base44.app',
 expectedRevision,
 fetchImpl=fetch,
 timeoutMs=10000
}={}){
 if(!revPattern.test(String(expectedRevision||'')))return blocked('EXACT_REVIEWED_SOURCE_REVISION_REQUIRED');
 let root;
 try{root=originUrl(origin);}
 catch{return blocked('UNTRUSTED_ORIGIN');}
 try{
  const html=await limitedResponse(root+'/world',MAX_HTML,fetchImpl,timeoutMs);
  if(!/text\/html/i.test(html.type))return blocked('HTML_CONTENT_TYPE_MISMATCH');
  const htmlText=html.bytes.toString('utf8');
  const scripts=[...htmlText.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
   .map(match=>match[1]).filter(x=>assetPattern.test(x));
  if(!scripts.length)return blocked('NO_SAME_ORIGIN_BUNDLE_SCRIPT');
  const manifestResponse=await limitedResponse(root+'/evermaps-release.json',MAX_MANIFEST,fetchImpl,timeoutMs);
  if(!/application\/json/i.test(manifestResponse.type))return blocked('RELEASE_MANIFEST_NOT_JSON');
  let manifest;
  try{manifest=JSON.parse(manifestResponse.bytes.toString('utf8'));}
  catch{return blocked('RELEASE_MANIFEST_INVALID_JSON');}
  if(!manifest||manifest.schema!==MANIFEST||manifest.product!=='EverMaps')
   return blocked('RELEASE_MANIFEST_MISSING_OR_WRONG_SCHEMA');
  if(!revPattern.test(String(manifest.source_revision||''))||
      manifest.source_revision.toLowerCase()!==expectedRevision.toLowerCase())
   return blocked('REVIEWED_SOURCE_REVISION_MISMATCH');
  if(!assetPattern.test(manifest.bundle_path)||!scripts.includes(manifest.bundle_path))
   return blocked('BUNDLE_PATH_NOT_IN_HTML');
  if(!digestPattern.test(String(manifest.bundle_sha256||'')))
   return blocked('BUNDLE_DIGEST_MISSING');
  const bundle=await limitedResponse(root+manifest.bundle_path,MAX_JS,fetchImpl,timeoutMs);
  if(!/javascript|ecmascript|text\/plain/i.test(bundle.type))
   return blocked('BUNDLE_CONTENT_TYPE_MISMATCH');
  const computed=sha256(bundle.bytes);
  if(computed!==manifest.bundle_sha256.toLowerCase())return blocked('PUBLISHED_BUNDLE_BYTES_DIFFER');
  return {schema:SCHEMA,state:'BUNDLE_PARITY_PROVEN',reason:'MANIFEST_AND_BUNDLE_MATCH_REVIEWED_REVISION',
   scope:'published-bundle-byte-parity-only',release_authorized:false,
   source_revision:expectedRevision.toLowerCase(),
   bundle_path:manifest.bundle_path,bundle_sha256:computed,
   origin:root,manifest_path:'/evermaps-release.json',
   limitations:[
    'Does not establish live browser UI or headset behavior.',
    'Does not establish validity of source incident statuses or air-quality data.',
    'Does not authorize Systemia Shipping, customer release, or Evercraft Rewards credits.'
   ]};
 }catch(error){
  return blocked('PUBLIC_PROBE_FAILED',{detail:String(error?.message||error).slice(0,120)});
 }
}

function argsFromCli(argv){
 const args={};
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--expected-revision'&&argv[i+1])args.expectedRevision=argv[++i];
  else if(argv[i]==='--origin'&&argv[i+1])args.origin=argv[++i];
  else throw new Error('Use --expected-revision <40-hex-review-sha> [--origin https://evermaps.base44.app]');
 }
 return args;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const result=await verifyPublicEvermaps(argsFromCli(process.argv.slice(2)));
  console.log(JSON.stringify(result,null,2));
  if(result.state!=='BUNDLE_PARITY_PROVEN')process.exitCode=2;
 }catch(error){console.error(String(error.message));process.exitCode=2;}
}
