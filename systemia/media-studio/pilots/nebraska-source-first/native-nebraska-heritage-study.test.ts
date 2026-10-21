import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assertNaraPhoto,assertHeritageBoundary} from './native-nebraska-heritage-study.js';

test('refuses any invented NARA image file even with .jpg extension',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nara-fake-'));
 try{const file=path.join(dir,'fake.jpg');fs.writeFileSync(file,'pretend photo');
  assert.throws(()=>assertNaraPhoto(file),/nara_photo_byte_size_unexpected/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
function good(){
 return {schema:'evercraft.fallen.nebraska-heritage-study.v1',
  isReal1973GameVideo:false,is2026FootballFootage:false,
  photo:{naraId:'547323',sha1:'8476a2db33115d25a2fc0a60ea8618dea3795209'},
  founderApproved:false,publicationAuthorityGranted:false,
  sound:{inventedCrowdAudio:false,scorePresent:false}};
}
test('historical still has explicit capture identity and no fake 1973 motion or sound',()=>{
 assert.equal(assertHeritageBoundary(good()),true);
 assert.equal(assertHeritageBoundary({...good(),isReal1973GameVideo:true}),false);
 assert.equal(assertHeritageBoundary({...good(),is2026FootballFootage:true}),false);
 const fake=good();fake.sound.inventedCrowdAudio=true;assert.equal(assertHeritageBoundary(fake),false);
});
test('no metadata can claim a rights or founder release by modifying only project title',()=>{
 assert.equal(assertHeritageBoundary({...good(),publicationAuthorityGranted:true}),false);
 assert.equal(assertHeritageBoundary({...good(),founderApproved:true}),false);
 const fake=good();fake.photo.sha1='0'.repeat(40);
 assert.equal(assertHeritageBoundary(fake),false);
});
