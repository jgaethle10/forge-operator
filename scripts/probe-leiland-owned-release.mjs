// Independent read-only external HTTPS readback for Leiland's OWNED public edge.
// It is not an installer, runtime control, DNS ownership proof, or private model probe.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assessPublicPulse} from '../public/kaidance/pulse-source.mjs';

const ASSETS=['leiland/index.html','leiland/style.css','leiland/brain.js','leiland/pulse-bridge.mjs','kaidance/pulse-source.mjs'];
const PULSE_KEYS=['schema','state','cycle_number','last_completed_cycle','heartbeat_target_seconds','admitted_count','held_count','coverage_receipt_valid','field_attestation_verified','observed_at','published_at'];
const error=why=>{throw Error(why)};
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');

export function validateOwnedOrigin(url){
 let u;
 try{u=new URL(url)}catch{error('invalid_public_origin')}
 if(u.protocol!=='https:'||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||
 u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.port&&u.port!=='443')
  error('public_origin_must_be_clean_https_root');
 if(/(?:^|\.)(?:github\.io|base44\.app|vercel\.app|netlify\.app|pages\.dev)$/i.test(u.hostname))error('third_party_public_runtime_disallowed');
 if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(u.hostname)||u.hostname.includes(':'))error('named_public_origin_required');
 return u.origin;
}
async function getBytes(fetchImpl,url,maxBytes=300000){
 const r=await fetchImpl(url,{redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});
 if(!r.ok)error('owned_public_https_read_failed_'+r.status);
 const bytes=Buffer.from(await r.arrayBuffer());
 if(!bytes.length||bytes.length>maxBytes)error('public_payload_size_invalid');
 return bytes;
}
export async function probeLeilandPublicOrigin({origin,publicRoot,fetchImpl=globalThis.fetch,now=Date.now()}={}){
 const url=validateOwnedOrigin(origin);
 if(typeof publicRoot!=='string'||!path.isAbsolute(publicRoot))error('canonical_public_root_required');
 const matched=[];
 for(const asset of ASSETS){
  const expected=fs.readFileSync(path.join(publicRoot,asset));
  const readback=await getBytes(fetchImpl,url+'/'+asset);
  if(digest(expected)!==digest(readback))error('public_asset_mismatch_'+asset.replaceAll('/','_'));
  matched.push(asset);
 }
 const html=fs.readFileSync(path.join(publicRoot,'leiland/index.html'),'utf8');
 if(!html.includes('Content-Security-Policy')||!html.includes('CONCEPTUAL ANIMATION'))error('public_disclosure_or_csp_missing');
 let pulseState='not_connected',cycleNumber=null;
 try{
  const bytes=await getBytes(fetchImpl,url+'/kaidance/pulse.json',16000);
  const parsed=JSON.parse(bytes.toString('utf8'));
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
    Object.keys(parsed).length!==PULSE_KEYS.length||
    Object.keys(parsed).some(key=>!PULSE_KEYS.includes(key)))error('public_pulse_extra_fields_forbidden');
  const assessment=assessPublicPulse(parsed,now);
  if(!assessment.ok)error('public_pulse_schema_invalid');
  cycleNumber=assessment.cycle_number;
  pulseState=assessment.verified?'source_attested':!assessment.sourceFresh||!assessment.cycleFresh?'stale':'unverified';
 }catch(e){
  // Missing feed or network error is not healthy. Invalid public data is a hard failure, not silent approval.
  if(e.message?.startsWith('public_pulse_'))throw e;
 }
 let feedState='unavailable';
 try{
  const raw=await getBytes(fetchImpl,url+'/leiland/feed.json',20000);
  const feed=JSON.parse(raw.toString('utf8'));
  if(feed?.schema!=='evercraft.leiland.public-feed.v1'||
     !['not_connected','publisher_reported'].includes(feed.status))error('leiland_public_feed_schema_invalid');
  feedState=feed.status;
 }catch(e){if(e.message==='leiland_public_feed_schema_invalid')throw e}
 return Object.freeze({
  schema:'evercraft.leiland.external-readback.v1',
  public_https_asset_parity:'matched',
  assets_checked:matched.length,
  heartbeat_source_state:pulseState,
  cycle_number:cycleNumber,
  inference_publisher_state:feedState,
  release_authentication:'not_established_by_this_probe',
  owned_runtime_identity:'not_established_by_this_probe',
  final_public_launch_authorized:false
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==2){
  console.error('usage: node scripts/probe-leiland-owned-release.mjs https://approved-owned-host.example /verified/forge-checkout/public');
  process.exitCode=2;
 }else{
  try{console.log(JSON.stringify(await probeLeilandPublicOrigin({origin:args[0],publicRoot:args[1]})))}
  catch(e){console.error('LEILAND_EXTERNAL_READBACK_HOLD:',e.message);process.exitCode=1}
 }
}
