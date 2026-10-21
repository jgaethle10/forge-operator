import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateReelDownload,verifyArchiveReceipt} from './early-nebraska-game-reel.mjs';
test('a login page or nonexistent file cannot pose as historic football video',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nshs-forged-video-'));
 try{
  const p=path.join(dir,'claimed-original.mp4');
  fs.writeFileSync(p,'<html>login required</html>');
  assert.throws(()=>validateReelDownload(p),/archive_reel_missing_or_too_small/);
  assert.throws(()=>validateReelDownload('/no-such-archive.mp4'),/archive_reel_missing_or_too_small/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
function base(){return {schema:'evercraft.fallen.history-nebraska-motion-canary.v1',
  source:{collection:'RG6137.MI',sourceExcerptStartSec:12},
  creative:{originalFootballFramesOnly:true,fabricatedHistoricAudio:false},
  claims:{exactGameYearConfirmed:false,currentNebraska2026Footage:false},
  publicationAuthorityGranted:false};}
test('historic attribution remains provisional and cannot represent 2026 footage',()=>{
 assert.equal(verifyArchiveReceipt(base()),true);
 const y=base();y.claims.exactGameYearConfirmed=true;assert.equal(verifyArchiveReceipt(y),false);
 const z=base();z.claims.currentNebraska2026Footage=true;assert.equal(verifyArchiveReceipt(z),false);
});
test('cannot admit fabricated archive crowd audio or claim publishing rights',()=>{
 const a=base();a.creative.fabricatedHistoricAudio=true;assert.equal(verifyArchiveReceipt(a),false);
 const b=base();b.publicationAuthorityGranted=true;assert.equal(verifyArchiveReceipt(b),false);
 const c=base();c.source.collection='unknown';assert.equal(verifyArchiveReceipt(c),false);
});
