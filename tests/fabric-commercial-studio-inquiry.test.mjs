import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
import {validateStudioInquiry} from '../systemia/mcp/commercial-studio-inquiry.mjs';
import {STUDIO_INTRO_PROJECT,STUDIO_LEGACY_INTRO_PROJECT,STUDIO_PROJECT_OPTIONS}
  from '../systemia/mcp/studio-offer-contract.mjs';
const ORIGIN='https://jgaethle10.github.io';
const LEAD={
 name:'Casey Test',email:'casey@example.test',company:'Example Bakery',
 project:'$50 launch-week 30-second social commercial pilot',
 goal:'Introduce our bakery catering offer to local customers.',
 consent:true,website:''
};
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-studio-leads-test-'));
function post(url,body,origin=ORIGIN){
 return fetch(url+'/api/commercial-studio/inquiry',{method:'POST',headers:{'origin':origin,'content-type':'application/json'},
  body:JSON.stringify(body)});
}
test('public first-party inquiry stores consented record with no payment or agent execution',async()=>{
 const dir=temporary(),runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],studioLeadsDir:dir,faieSurfaceEnabled:false});
 try{
  const response=await post(runtime.url,LEAD);
  assert.equal(response.status,201);
  assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);
  const receipt=await response.json();
  assert.match(receipt.reference,/^EC-STUDIO-[0-9A-F]{20}$/);
  assert.equal(receipt.received,true);
  const pathname=path.join(dir,'inquiries.ndjson');
  const lines=fs.readFileSync(pathname,'utf8').trim().split('\n');
  assert.equal(lines.length,1);
  const record=JSON.parse(lines[0]);
  assert.equal(record.email,LEAD.email);
  assert.equal(record.agent_execution_authorized,false);
  assert.equal(record.automated_payment,false);
  assert.equal(fs.statSync(pathname).mode&0o777,0o600);
  assert.equal(await fetch(runtime.url+'/api/commercial-studio/inquiry').then(r=>r.status),403);
 }finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('every currently shipped public project select value is accepted by real private Fabric intake',async()=>{
 const html=fs.readFileSync(new URL('../public/commercial-studio/index.html',import.meta.url),'utf8');
 const select=html.match(/<select\\s+id="project"\\s+name="project"[^>]*>([\\s\\S]*?)<\\/select>/);
 assert.ok(select,'the public buyer project selector must be present');
 const pageProjects=[...select[1].matchAll(/<option(?:\\s+[^>]*)?>([^<]+)<\\/option>/g)].map(x=>x[1].trim());
 assert.deepEqual(pageProjects,STUDIO_PROJECT_OPTIONS,
  'the current public form must match canonical server options in the same order');
 assert.equal(pageProjects[0],STUDIO_INTRO_PROJECT,'default pilot is the live introductory offer');
 const dir=temporary(),runtime=await startFabricLocalRuntime({
  host:'127.0.0.1',port:0,catalog:[],studioLeadsDir:dir,faieSurfaceEnabled:false
 });
 try {
  for(const [i,project] of pageProjects.entries()){
   const synthetic={...LEAD,email:'person'+i+'@example.test',project};
   const response=await post(runtime.url,synthetic);
   assert.equal(response.status,201,'public option rejected: '+project);
   const receipt=await response.json();
   assert.equal(receipt.received,true);
   const alertFile=path.join(dir,'alert-outbox',receipt.reference+'.json');
   const alert=JSON.parse(fs.readFileSync(alertFile,'utf8'));
   assert.equal(alert.project,project);
   assert.equal(alert.pii_stored,false);
   assert.doesNotMatch(JSON.stringify(alert),/person\\d+@example\\.test/);
  }
  const records=fs.readFileSync(path.join(dir,'inquiries.ndjson'),'utf8').trim().split('\\n').map(JSON.parse);
  assert.deepEqual(records.map(x=>x.project),pageProjects);
  assert.equal(records.every(x=>x.agent_execution_authorized===false&&x.automated_payment===false),true);
 }finally{await runtime.close();fs.rmSync(dir,{force:true,recursive:true});}
});

test('cached launch-week project is accepted but normalized to current non-expiring introductory offer',async()=>{
 const dir=temporary(),runtime=await startFabricLocalRuntime({
  host:'127.0.0.1',port:0,catalog:[],studioLeadsDir:dir,faieSurfaceEnabled:false
 });
 try{
  const response=await post(runtime.url,{...LEAD,project:STUDIO_LEGACY_INTRO_PROJECT});
  assert.equal(response.status,201);
  const receipt=await response.json();
  const lead=JSON.parse(fs.readFileSync(path.join(dir,'inquiries.ndjson'),'utf8').trim());
  const alert=JSON.parse(fs.readFileSync(path.join(dir,'alert-outbox',receipt.reference+'.json'),'utf8'));
  assert.equal(lead.project,STUDIO_INTRO_PROJECT);
  assert.equal(alert.project,STUDIO_INTRO_PROJECT);
  assert.doesNotMatch(JSON.stringify(alert),/launch-week/i);
 }finally{await runtime.close();fs.rmSync(dir,{force:true,recursive:true});}
});

test('rejects off-origin, invalid, non-consenting and automated bot intake',async()=>{
 const dir=temporary(),runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],studioLeadsDir:dir,faieSurfaceEnabled:false});
 try{
  assert.equal((await post(runtime.url,LEAD,'https://malicious.example')).status,403);
  assert.equal((await post(runtime.url,{...LEAD,consent:false})).status,422);
  assert.equal((await post(runtime.url,{...LEAD,project:'Some other unapproved product'})).status,422);
  const honeypot=await post(runtime.url,{...LEAD,website:'https://spam.example'});
  assert.equal(honeypot.status,202);
  assert.equal((await honeypot.json()).received,false);
  assert.equal(fs.existsSync(path.join(dir,'inquiries.ndjson')),false);
 }finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('limits duplicate submissions and does not collect card information',async()=>{
 const dir=temporary(),runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],studioLeadsDir:dir,faieSurfaceEnabled:false});
 try{
  for(let i=0;i<3;i++)assert.equal((await post(runtime.url,LEAD)).status,201);
  assert.equal((await post(runtime.url,LEAD)).status,429);
  const file=fs.readFileSync(path.join(dir,'inquiries.ndjson'),'utf8');
  assert.equal(file.trim().split('\n').length,3);
  assert.doesNotMatch(file,/card_number|checkout_url|api_key|client_ip/);
 }finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('studio public page calls owned capture route and requires consent; receipt controls success',()=>{
 const html=fs.readFileSync(new URL('../public/commercial-studio/index.html',import.meta.url),'utf8');
 assert.match(html,/api\/commercial-studio\/inquiry/);
 assert.match(html,/Send my commercial brief/);
 assert.match(html,/name="consent"[^>]+required/);
 assert.match(html,/receipt\.received!==true/);
 assert.match(html,/Your details have NOT been confirmed received/);
});
test('field validator ignores browser-only statement of another product',()=>{
 assert.equal(validateStudioInquiry({...LEAD,project:'FindMyPart'}).error,'invalid_inquiry_fields');
 assert.equal(validateStudioInquiry({...LEAD,goal:'x'}).error,'invalid_inquiry_fields');
});
