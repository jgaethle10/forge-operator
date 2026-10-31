import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runHumanFilterFacebookCycle} from './humanfilter-facebook-resident.mjs';

const root=process.cwd();
const now=new Date('2026-10-31T19:00:00.000Z');
const pageId='555551234';
const postId=pageId+'_7777';
function harness(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hf-clip-'));
  const requests=[];
  const fetchImpl=async (url,options={})=>{
    const address=String(url),method=options.method||'GET';
    requests.push({address,method});
    if(address.includes('humanfilter-beta/'))return new Response('<html><title>HumanFilter</title><h1>Your feed.</h1><h2>Your call.</h2></html>',{status:200,headers:{'content-type':'text/html'}});
    if(method==='GET'&&address.includes('555551234?'))return Response.json({id:pageId,name:'Evercraft LLC'});
    if(method==='POST'&&address.endsWith('/'+pageId+'/photos'))return Response.json({id:'photo_123',post_id:postId});
    if(method==='POST'&&address.endsWith('/'+encodeURIComponent(postId)+'/comments'))return Response.json({id:postId+'_c1'});
    if(method==='GET'&&address.includes(encodeURIComponent(postId)+'?'))return Response.json({id:postId,permalink_url:'https://www.facebook.com/'+pageId+'/posts/7777'});
    throw Error('unexpected_graph_request:'+method+':'+address);
  };
  const options={repoRoot:root,stateDir:dir,expectedPageId:pageId,now,fire:true,fetchImpl,
    authorize:async()=>({decision:'allow',grant_id:'verified-passport-grant-1'}),
    credentialResolver:()=>({safe_status:{facebook:'resolved'},config:{pageId,pageAccessToken:'test-token'}})
  };
  return {dir,requests,options,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

test('no publisher side effects without explicit fire and verified issuer',async()=>{
  const h=harness();
  try{
    const d=await runHumanFilterFacebookCycle({...h.options,fire:false});
    assert.equal(d.status,'preflight_only');
    assert.equal(h.requests.length,0);
    let blocked=await runHumanFilterFacebookCycle({...h.options,authorize:async()=>({decision:'deny',reason:'no_issuer_grant'})});
    assert.equal(blocked.status,'blocked_passport_authority');
    blocked=await runHumanFilterFacebookCycle({...h.options,expectedPageId:''});
    assert.equal(blocked.status,'blocked_expected_evercraft_page_id_missing');
    assert.equal(h.requests.length,0);
    assert.equal(fs.existsSync(path.join(h.dir,'entries')),false);
  }finally{h.cleanup();}
});

test('one authorized Evercraft photo post plus first comment, readback and durable dedupe',async()=>{
  const h=harness();
  try{
    const d=await runHumanFilterFacebookCycle(h.options);
    assert.equal(d.status,'provider_receipt_recorded');
    assert.equal(d.provider_post_id,postId);
    assert.equal(d.provider_comment_id,postId+'_c1');
    assert.match(d.provider_post_url,/facebook\.com/);
    assert.equal(h.requests.filter(x=>x.method==='POST').length,2);
    assert.ok(h.requests.some(x=>x.address.endsWith('/'+pageId+'/photos')));
    const again=await runHumanFilterFacebookCycle(h.options);
    assert.equal(again.status,'nothing_due_or_reconciliation_hold');
    assert.equal(h.requests.filter(x=>x.method==='POST').length,2);
    const out=JSON.parse(fs.readFileSync(path.join(h.dir,'entries','humanfilter-launch-facebook.json'),'utf8'));
    assert.equal(out.provider_post_id,postId);
    assert.equal(out.public_anonymous_visibility_verified,false);
    assert.equal(out.status,'provider_receipt_recorded');
  }finally{h.cleanup();}
});

test('post-side failure never causes blind repost on next cycle',async()=>{
  const h=harness();
  try{
    const fetchImpl=async (url,opts={})=>{
      if(String(url).endsWith('/'+encodeURIComponent(postId)+'/comments')&&opts.method==='POST'){
        h.requests.push({address:String(url),method:'POST'});
        return Response.json({error:{message:'permission missing'}},{status:403});
      }
      return h.options.fetchImpl(url,opts);
    };
    const first=await runHumanFilterFacebookCycle({...h.options,fetchImpl});
    assert.equal(first.status,'manual_reconciliation_required');
    assert.equal(first.provider_post_id,postId);
    assert.equal(h.requests.filter(x=>x.method==='POST'&&x.address.endsWith('/'+pageId+'/photos')).length,1);
    const second=await runHumanFilterFacebookCycle({...h.options,fetchImpl});
    assert.equal(second.status,'nothing_due_or_reconciliation_hold');
    assert.equal(h.requests.filter(x=>x.method==='POST'&&x.address.endsWith('/'+pageId+'/photos')).length,1);
  }finally{h.cleanup();}
});

test('a photo response with no post_id never gets misread as a post or reissued',async()=>{
  const h=harness();
  try{
    const fetchImpl=async(url,opts={})=>{
      if(String(url).endsWith('/'+pageId+'/photos')&&opts.method==='POST')return Response.json({id:'photo_only_123'});
      return h.options.fetchImpl(url,opts);
    };
    const first=await runHumanFilterFacebookCycle({...h.options,fetchImpl});
    assert.equal(first.status,'post_identity_missing_manual_reconciliation');
    assert.equal(first.post_submitted,false);
    const second=await runHumanFilterFacebookCycle({...h.options,fetchImpl});
    assert.equal(second.status,'nothing_due_or_reconciliation_hold');
  }finally{h.cleanup();}
});
