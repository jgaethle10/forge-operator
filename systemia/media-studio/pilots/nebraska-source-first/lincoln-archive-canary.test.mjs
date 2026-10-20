import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ARCHIVE,inspectArchiveBytes,archivalReleaseBoundary} from './lincoln-archive-canary.mjs';
test('source is explicitly Lincoln 2011 and cannot be relabelled 2026 football',()=>{
 assert.match(ARCHIVE.page,/2011_sky_in_Lincoln/);
 assert.equal(ARCHIVE.capturedAt.slice(0,4),'2011');
 assert.equal(ARCHIVE.license,'CC BY-SA 3.0');
 assert.equal(ARCHIVE.expectedSha1.length,40);
});
test('intake must reject bytes not identical to source, even if media parser could decode them',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lincoln-source-'));
 const file=path.join(dir,'test.webm');
 try{fs.writeFileSync(file,'synthetic fixture');assert.throws(()=>inspectArchiveBytes(file),/archive_byte_length_mismatch/);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('archive release boundary requires no 2026-game or invented field-sound claims',()=>{
 const r={source:{capturedAt:ARCHIVE.capturedAt,license:ARCHIVE.license,footageOf:ARCHIVE.footageOf},claims:{realFootballPlay:false,originalLocationAudioInvented:false},publicationAuthorityGranted:false};
 assert.equal(archivalReleaseBoundary(r),true);
 assert.equal(archivalReleaseBoundary({...r,claims:{...r.claims,realFootballPlay:true}}),false);
 assert.equal(archivalReleaseBoundary({...r,claims:{...r.claims,originalLocationAudioInvented:true}}),false);
 assert.equal(archivalReleaseBoundary({...r,publicationAuthorityGranted:true}),false);
});
