import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectSource,validateProof} from './real-motion-contrast.mjs';
test('byte-level source identity cannot be forged with merely a decodable clip',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'real-motion-fixture-'));
 const file=path.join(dir,'clip.webm');try{
  fs.writeFileSync(file,Buffer.from('Some made up source bytes'));
  assert.throws(()=>inspectSource(file,'a'.repeat(40),5310921),/source_bytes_mismatch/);
  assert.throws(()=>inspectSource(file,'a'.repeat(40),fs.statSync(file).size),/source_sha1_mismatch/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
const receipt=()=>({schema:'evercraft.fallen.real-motion-contrast.v1',
 publicationAuthorityGranted:false,isNebraskaGameFootage:false,
 sources:[{capturedDate:'2011-08-06',license:'CC BY-SA 3.0'},{capturedDate:'2026-04-21',license:'CC BY 4.0'}],
 master:{videoCodec:'h264',audioCodec:'aac'}});
test('valid review-level receipt cannot become a game-footage claim or release approval',()=>{
 assert.equal(validateProof(receipt()),true);
 assert.equal(validateProof({...receipt(),isNebraskaGameFootage:true}),false);
 assert.equal(validateProof({...receipt(),publicationAuthorityGranted:true}),false);
});
test('fails false archive dates, source-rights assignments or invalid MP4 codecs',()=>{
 const badDate=receipt();badDate.sources[1].capturedDate='2026-10-17';
 assert.equal(validateProof(badDate),false);
 const badLicense=receipt();badLicense.sources[0].license='CC0';
 assert.equal(validateProof(badLicense),false);
 assert.equal(validateProof({...receipt(),master:{videoCodec:'vp8',audioCodec:'opus'}}),false);
});
