import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {captureAndAdmit} from '../systemia/revenue-desk/public-demand-source-handoff.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
test('capture-to-inbox handoff admits solicitation, excludes budgets, and replays without browsing',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-handoff-'));
 try{
  fs.mkdirSync(path.join(root,'captures'),{mode:0o700});
  const inbox=path.join(root,'document-inbox.json');
  fs.writeFileSync(inbox,JSON.stringify({schema:'evercraft.public-demand.document-inbox.v1',captures:[]}),{mode:0o600});
  let browses=0;
  const browse=async({url})=>{
   browses++;
   const text='Public procurement documents';
   const timestamp=new Date().toISOString();
   const evidence={engine:'evercraft-owned-browser-worker-v1',mode:'public_read_only',http_status:200,requested_url:url,final_url:url,text_sha256:sha(text),actions:[],started_at:timestamp,finished_at:timestamp,boundaries:{fresh_context_per_job:true,private_and_reserved_targets_blocked:true,dns_pinned_outbound_proxy:true,persisted_cookies:false,downloads_allowed:false,form_submit_action_supported:false}};
   return {ok:true,...evidence,evidence_receipt_sha256:sha(JSON.stringify(evidence)),snapshot:{text,title:'Purchasing',links:[{href:'https://www.yvl.org/budget.pdf',text:'Budget'},{href:'https://www.yvl.org/RFP-26-002.pdf',text:'RFP'},{href:'https://example.org/RFP.pdf',text:'Foreign'}]}};
  };
  const first=await captureAndAdmit({root,sourceKey:'yvl',browse});
  assert.equal(first.state,'admitted');assert.equal(first.added,1);
  assert.deepEqual(first.admission.source_urls,['https://www.yvl.org/RFP-26-002.pdf']);
  assert.equal(first.contact_authorized,false);
  const before=fs.readFileSync(inbox);
  const again=await captureAndAdmit({root,sourceKey:'yvl',browse});
  assert.equal(again.state,'no_new_solicitation_pointers');
  assert.equal(browses,1);
  assert.ok(fs.readFileSync(inbox).equals(before));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
