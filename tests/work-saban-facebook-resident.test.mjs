import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runWorkSabanFacebookCycle} from '../systemia/clip/work-saban-facebook-resident.mjs';
import {validateWorkSabanClipAuthority,validateWorkSabanText,WORK_SABAN_CAMPAIGN} from '../systemia/clip/work-saban-publish-authorize.mjs';

const repoRoot=process.cwd();
const queue=JSON.parse(fs.readFileSync('distribution/marketing/work-saban-clip-evergreen-20261030.review.json','utf8'));
const entry=queue.entries.find(x=>x.id==='work-saban-rotation-w1-facebook');
const now=new Date('2026-11-02T18:00:00Z');
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'saban-clip-'));
const permit=async()=>({decision:'allow',grant_id:'verified-passport-grant'});
const credentials=()=>({safe_status:{facebook:'resolved'},config:{pageId:'123456',pageAccessToken:'never-print-me'}});
const linkVerifier=async input=>{
 assert.match(input.url,/work-saban\/report/);
 assert.equal(input.requireCanonicalSelfMatch,true);
 return {verified:true};
};
function fixture(){
 const requests=[];
 const fetchImpl=async (url,init={})=>{
  requests.push({url,method:init.method||'GET',body:String(init.body||'')});
  let body={},status=200;
  if(url.includes('123456?fields=id%2Cname'))body={id:'123456',name:'Evercraft'};
  else if(url.endsWith('/123456/feed'))body={id:'123456_789'};
  else if(url.endsWith('/123456_789/comments'))body={id:'comment-001'};
  else if(url.includes('123456_789?fields=id%2Cpermalink_url'))body={id:'123456_789',permalink_url:'https://www.facebook.com/123456/posts/789'};
  else status=404;
  return {ok:status===200,status,async json(){return body}};
 };
 return {requests,fetchImpl};
}
test('owner launch copy is valid but cannot mint a publishing grant by itself',()=>{
 assert.equal(queue.owner_organic_distribution_approved,true);
 assert.equal(queue.publication_authority,false);
 assert.ok(validateWorkSabanText(entry));
 const e={schema:'evercraft.clip.operator-authority.v1',authorized:true,authority_state:'manual_authorized',
  campaign_id:WORK_SABAN_CAMPAIGN,subject_ref:'system:work-saban-clip-publisher',product:'evercraft-home',
  issuer_ref:'authority:verified',authority_receipt_ref:'issuer:receipt:proof',
  scopes:['home.clip.publish'],resource_refs:['brand:evercraft-work-saban'],
  excluded_brand_keys:['eps','havenly-cleaning','rnb-chicken-and-soul','christmaslightsusa'],
  boundaries:{channel_scope:'verified_evercraft_corporate_only',paid_spend_usd:0,
   first_comment_provider_receipt_required:true,no_personal_automated_posting:true,
   minimum_hours_between_posts_per_platform:72,max_posts_per_platform_per_7_days:2},
  starts_at:'2026-11-01T00:00:00Z',ends_at:'2026-11-30T00:00:00Z'};
 assert.equal(validateWorkSabanClipAuthority(e,now),e);
 assert.throws(()=>validateWorkSabanClipAuthority({...e,issuer_ref:''},now),/issuer_receipt_missing/);
 assert.throws(()=>validateWorkSabanClipAuthority({...e,resource_refs:['brand:humanfilter']},now),/scope_mismatch/);
 assert.throws(()=>validateWorkSabanClipAuthority({...e,ends_at:'2026-11-02T17:00:00Z'},now),/expired_or_future/);
});
test('dry run does not touch a publisher or issue a grant',async()=>{
 const stateDir=dir();let called=false;
 const r=await runWorkSabanFacebookCycle({repoRoot,stateDir,now,
  authorize:async()=>{called=true;throw Error('should_not_call')},
  credentialResolver:()=>{called=true;throw Error('should_not_call')}});
 assert.equal(r.status,'preflight_only');assert.equal(r.next_entry_id,entry.id);
 assert.equal(called,false);assert.equal(fs.existsSync(path.join(stateDir,'entries')),false);
});
test('missing issuer grant and mismatched company identity fail before any post',async()=>{
 const stateDir=dir(),mock=fixture();
 const hold=await runWorkSabanFacebookCycle({repoRoot,stateDir,now,fire:true,expectedPageId:'123456',
  authorize:async()=>({decision:'deny'}),credentialResolver:credentials,fetchImpl:mock.fetchImpl,linkVerifier});
 assert.equal(hold.status,'blocked_issuer_grant');
 assert.equal(mock.requests.length,0);
 const mismatch=await runWorkSabanFacebookCycle({repoRoot,stateDir,now,fire:true,expectedPageId:'different-page',
  authorize:permit,credentialResolver:credentials,fetchImpl:mock.fetchImpl,linkVerifier});
 assert.equal(mismatch.status,'blocked_page_scope_mismatch');
 assert.equal(mock.requests.length,0);
});
test('published requires verified company page, first comment, permalink; one slot per cycle',async()=>{
 const stateDir=dir(),mock=fixture();
 const r=await runWorkSabanFacebookCycle({repoRoot,stateDir,now,fire:true,expectedPageId:'123456',
  authorize:permit,credentialResolver:credentials,fetchImpl:mock.fetchImpl,linkVerifier});
 assert.equal(r.status,'provider_receipt_recorded');assert.equal(r.post_submitted,true);
 assert.equal(r.provider_post_url,'https://www.facebook.com/123456/posts/789');
 assert.equal(mock.requests.filter(x=>x.method==='POST').length,2);
 assert.match(mock.requests.find(x=>x.url.includes('/comments')).body,/work-saban/);
 assert.doesNotMatch(JSON.stringify(r),/never-print-me/);
 const again=await runWorkSabanFacebookCycle({repoRoot,stateDir,now,fire:true,expectedPageId:'123456',
  authorize:permit,credentialResolver:credentials,fetchImpl:mock.fetchImpl,linkVerifier});
 assert.equal(again.status,'nothing_due');
 assert.equal(mock.requests.filter(x=>x.method==='POST').length,2);
 const local=JSON.parse(fs.readFileSync(path.join(stateDir,'entries',entry.id+'.json'),'utf8'));
 assert.equal(local.public_anonymous_visibility_verified,false);
});
test('an uncertain provider outcome permanently holds that candidate for reconciliation',async()=>{
 const stateDir=dir(),mock=fixture();
 const broken=async(url,init)=>{
  if(url.endsWith('/123456_789/comments'))return {ok:false,status:502,async json(){return {error:'provider uncertain'}}};
  return mock.fetchImpl(url,init);
 };
 const first=await runWorkSabanFacebookCycle({repoRoot,stateDir,now,fire:true,expectedPageId:'123456',
  authorize:permit,credentialResolver:credentials,fetchImpl:broken,linkVerifier});
 assert.equal(first.status,'manual_reconciliation_required');
 assert.equal(first.provider_post_id,'123456_789');
 const again=await runWorkSabanFacebookCycle({repoRoot,stateDir,now,fire:true,expectedPageId:'123456',
  authorize:permit,credentialResolver:credentials,fetchImpl:broken,linkVerifier});
 assert.equal(again.status,'manual_reconciliation_required');
 assert.equal(mock.requests.filter(x=>x.url.endsWith('/123456/feed')).length,1);
});
