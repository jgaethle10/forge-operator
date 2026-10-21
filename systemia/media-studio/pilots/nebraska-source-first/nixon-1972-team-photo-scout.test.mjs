import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {checkContactSheet,canAdmitFrameAsReleasedFilm} from './nixon-1972-team-photo-scout.mjs';
test('arbitrary HTML and nonexistent bytes cannot become WHPO photo evidence',()=>{
 const t=fs.mkdtempSync(path.join(os.tmpdir(),'nebraska-whpo-'));
 try{
  assert.throws(()=>checkContactSheet(path.join(t,'none.jpg')),/whpo_contact_missing/);
  const f=path.join(t,'bad.jpg');fs.writeFileSync(f,'<html>not official original photo</html>');
  assert.throws(()=>checkContactSheet(f),/whpo_contact_missing/);
 }finally{fs.rmSync(t,{force:true,recursive:true});}
});
test('contact sheet access does not confer original-negative or film release approval',()=>{
 const empty={actualOriginalFrameObtained:false,exactOriginalFrameIdVerified:false,
  publishedUseRightsReviewed:false,founderCreativeApproval:false,publicReleaseAuthorized:false};
 assert.equal(canAdmitFrameAsReleasedFilm(empty),false);
 for(const key of Object.keys(empty)){const x={...empty,[key]:true};
  assert.equal(canAdmitFrameAsReleasedFilm(x),false);}
});
