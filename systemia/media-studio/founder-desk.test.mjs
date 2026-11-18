import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {makeServer,newJob,patchJob,readiness,packet,initialize} from './founder-desk.mjs';

function tmp(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-founder-desk-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}
test('founder and customers face the same hard stop for unfinished commercials',()=>{
  const job=newJob('tile-works','Tile Works');
  assert.equal(job.technicalRender,null);
  assert.equal(readiness(job).canPublish,false);
  assert.equal(readiness(job).canDeliver,false);
  job.technicalRender={pictureStatus:'review_required',sha256:'a'.repeat(64)};
  assert.ok(readiness(job).blockers.some(x=>x.includes('Automated picture scan')));
  job.technicalRender=null;
  assert.ok(readiness(job).blockers.some(x=>x.includes('Signature')));
  assert.throws(()=>patchJob(job,{format:'4:3'}),/invalid_format/);
  assert.throws(()=>patchJob(job,{narration:'silently_fake_voice'}),/invalid_narration_mode/);
  const musicOnly=patchJob(job,{narration:'music_only'});
  assert.equal(musicOnly.narration,'music_only');
  assert.equal(readiness(musicOnly).blockers.some(x=>x.includes('narration take')),false);
  assert.throws(()=>patchJob(job,{cta:3}),/invalid_field_cta/);
  const updated=patchJob(job,{goal:'Show actual tile workmanship',cta:'Verified client CTA'});
  assert.equal(updated.cta,'Verified client CTA');
  assert.equal(job.cta,'');
  const out=packet(updated);
  assert.equal(out.restrictions.noAutomaticPublishing,true);
  assert.equal(out.productionRoute.finalGate,'customer-commercial-gate.mjs + fallen-signature-gate.mjs');
});
test('existing projects seed only once and never overwrite private founder progress',t=>{
  const root=tmp(t);
  initialize(root);
  const file=path.join(root,'jobs','tile-works','job.json');
  let job=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.match(job.notes,/Bella/);
  job.goal='Saved brief from founder';
  fs.writeFileSync(file,JSON.stringify(job));
  initialize(root);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).goal,'Saved brief from founder');
  assert.equal(fs.readdirSync(path.join(root,'jobs')).length,4);
});
test('local HTTP interface rejects foreign writes, accepts actual source bytes, but never reports delivery',async t=>{
  const root=tmp(t);
  const server=makeServer({root,port:0});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>server.close());
  const origin='http://127.0.0.1:'+server.address().port;
  const page=await fetch(origin);
  assert.equal(page.status,200);
  const html=await page.text();
  const token=html.match(/const TOKEN='([a-f0-9]{48})'/)?.[1];
  assert.ok(token);
  const initial=await (await fetch(origin+'/api/jobs')).json();
  assert.equal(initial.jobs.length,4);
  assert.equal(initial.jobs.find(x=>x.id==='tile-works').technicalRender,null);
  const forged=await fetch(origin+'/api/jobs/tile-works/update',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({goal:'Spoof'})});
  assert.equal(forged.status,403);
  const foreign=await fetch(origin+'/api/jobs/tile-works/update',{
    method:'POST',headers:{'content-type':'application/json','x-fallen-token':token,
      origin:'https://random-site.example'},body:JSON.stringify({goal:'Spoof'})});
  assert.equal(foreign.status,403);
  const headers={'content-type':'application/json','x-fallen-token':token};
  const updated=await fetch(origin+'/api/jobs/tile-works/update',{
    method:'POST',headers,body:JSON.stringify({goal:'Show finished craftsmanship',offer:'Tile work',cta:'Ask for a quote',audience:'Homeowners'})});
  assert.equal(updated.status,200);
  const uploaded=await fetch(origin+'/api/jobs/tile-works/media?type=picture&name=actual.jpg',{
    method:'POST',headers:{'x-fallen-token':token,'content-type':'application/octet-stream'},
    body:Buffer.from('fixture bytes are NOT verified photography')});
  assert.equal(uploaded.status,201);
  const media=(await uploaded.json()).asset;
  assert.equal(media.rights,'unreviewed');
  assert.equal(media.technicalState,'bytes_received_not_auditioned');
  assert.equal(fs.existsSync(media.privatePath),true);
  const approvalWithoutEvidence=await fetch(origin+'/api/jobs/tile-works/rights',{
    method:'POST',headers,body:JSON.stringify({assetId:media.id,rights:'reviewed'})});
  assert.equal(approvalWithoutEvidence.status,400);
  const packetResp=await fetch(origin+'/api/jobs/tile-works/packet');
  assert.equal(packetResp.status,200);
  const final=await packetResp.json();
  assert.equal(final.project.goal,'Show finished craftsmanship');
  assert.equal(final.readiness.canDeliver,false);
  assert.ok(final.readiness.blockers.some(x=>x.includes('rights evidence')));
  assert.ok(final.readiness.blockers.some(x=>x.includes('Signature')));
  const badAssembly=await fetch(origin+'/api/jobs/tile-works/assembly',{
    method:'POST',headers,body:JSON.stringify({schema:'made-up',approved:true})});
  assert.equal(badAssembly.status,400);
  const stillUnrendered=await (await fetch(origin+'/api/jobs')).json();
  assert.equal(stillUnrendered.jobs.find(x=>x.id==='tile-works').technicalRender,null);
});
