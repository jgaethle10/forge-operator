import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {captureEcologyWorkbook} from './wa-workbook-capture.mjs';
const key='wa-county-disposal-1994-2024';
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const bytes=Buffer.from([0x50,0x4b,0x03,0x04,1,2,3,4]); // synthetic signature only, not an actual workbook
const mock=(body=bytes,type=mime)=>async(url,options)=>{
 assert.equal(url,'https://ecology.wa.gov/disposal-by-county');
 assert.equal(options.redirect,'error');
 const r=new Response(body,{headers:{'content-type':type}});
 Object.defineProperty(r,'url',{value:url});
 return r;
};
test('capture preserves exact bytes and digest, replay cannot replace source bytes',async t=>{
 const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'ecology-proof-'));
 t.after(()=>fs.rmSync(outDir,{recursive:true,force:true}));
 const args={sourceKey:key,outDir,fetcher:mock()};
 const r=await captureEcologyWorkbook(args);
 assert.equal(r.sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.deepEqual(fs.readFileSync(path.join(outDir,r.filename)),bytes);
 assert.equal(fs.statSync(path.join(outDir,r.filename)).mode&0o777,0o600);
 assert.equal(r.workbookSchemaVerified,false);assert.equal(r.rowsVerified,0);
 assert.equal((await captureEcologyWorkbook(args)).filename,r.filename);
 assert.equal(fs.readdirSync(outDir).filter(x=>x.endsWith('.xlsx')).length,1);
 await assert.rejects(captureEcologyWorkbook({...args,sourceKey:'other'}),/not_allowlisted/);
 await assert.rejects(captureEcologyWorkbook({...args,fetcher:mock(bytes,'text/html')}),/mime_invalid/);
 await assert.rejects(captureEcologyWorkbook({...args,fetcher:mock(Buffer.from('html'))}),/signature_invalid/);
 const symlink=path.join(outDir,'alias');fs.symlinkSync(outDir,symlink);
 await assert.rejects(captureEcologyWorkbook({...args,outDir:symlink}),/private_directory_required/);
 fs.writeFileSync(path.join(outDir,r.filename),Buffer.alloc(bytes.length));
 await assert.rejects(captureEcologyWorkbook(args),/existing_bytes_conflict/);
});
