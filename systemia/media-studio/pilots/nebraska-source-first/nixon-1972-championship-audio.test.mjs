import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {source,checkAudioFile,checkResearchBoundary} from './nixon-1972-championship-audio.mjs';
test('historical NARA source is exact 1972 meeting, not invented Devaney quote',()=>{
 assert.equal(source.conversation,'662-010');
 assert.equal(source.date,'1972-02-01');
 assert.match(source.originalUrl,/nixonlibrary\.gov/);
 assert.equal(source.publicationAllowed,false);
});
test('rejects missing tape and fake login bytes',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nixon-662-tape-'));
 try{
  assert.throws(()=>checkAudioFile(path.join(tmp,'missing.mp3')),/missing_or_invalid_size/);
  const f=path.join(tmp,'fake.mp3');fs.writeFileSync(f,'<!doctype html>Login');
  assert.throws(()=>checkAudioFile(f),/missing_or_invalid_size/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
function sample(){return {schema:'evercraft.fallen.nixon-662-010-research-audio.v1',
 source:{conversation:'662-010',date:'1972-02-01'},
 publicationAuthorityGranted:false,sourceAudioPresent:true,speakerIdentityAudited:false,
 transcriptVerified:false,fileSubstitutedIntoEpisode:false};}
test('cannot promote independent audio mirror to authenticated actual speech',()=>{
 assert.equal(checkResearchBoundary(sample()),true);
 const r=sample();r.speakerIdentityAudited=true;assert.equal(checkResearchBoundary(r),false);
 const x=sample();x.transcriptVerified=true;assert.equal(checkResearchBoundary(x),false);
});
test('cannot quietly publish research-only championship tape',()=>{
 const r=sample();r.publicationAuthorityGranted=true;assert.equal(checkResearchBoundary(r),false);
 const x=sample();x.fileSubstitutedIntoEpisode=true;assert.equal(checkResearchBoundary(x),false);
});
