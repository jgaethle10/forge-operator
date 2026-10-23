import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareSnapshots, main, COMPARISON_SCHEMA } from '../scripts/artifact-roundtrip.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-roundtrip-'));
  const a = path.join(root, 'a.bin'), b = path.join(root, 'b.bin');
  fs.writeFileSync(a, Buffer.from([0,1,2,3,254,255]));
  fs.copyFileSync(a,b);
  return {root,a,b};
}
const clean = root => fs.rmSync(root,{recursive:true,force:true});

test('identical bytes match but never become an authenticated cloud receipt', () => {
  const {root,a,b}=fixture();try{
    const r=compareSnapshots({original:a,restored:b});
    assert.equal(r.schema,COMPARISON_SCHEMA);
    assert.equal(r.comparison,'byte_identical');
    assert.equal(r.original.size_bytes,6);
    assert.equal(r.original.sha256,r.restored.sha256);
    assert.equal(r.backup_roundtrip_attested,false);
    assert.equal(r.provider_authentication,'not_evaluated');
    assert.equal(r.device_install,'unverified');
  }finally{clean(root);}
});

test('same-size content mutation is detected', () => {
  const {root,a,b}=fixture();try{
    fs.writeFileSync(b,Buffer.from([0,1,2,3,254,254]));
    assert.equal(compareSnapshots({original:a,restored:b}).comparison,'mismatch');
  }finally{clean(root);}
});

test('missing restored copy fails closed',()=>{
  const {root,a,b}=fixture();try{fs.unlinkSync(b);assert.throws(()=>compareSnapshots({original:a,restored:b}),/ENOENT/);}finally{clean(root);}
});

test('symlinked restored file is rejected',()=>{
  const {root,a,b}=fixture();try{fs.unlinkSync(b);fs.symlinkSync(a,b);assert.throws(()=>compareSnapshots({original:a,restored:b}),/symlink/);}finally{clean(root);}
});

test('symlinked parent directory is rejected',()=>{
  const {root,a,b}=fixture();try{const link=path.join(root,'link');fs.symlinkSync(root,link);assert.throws(()=>compareSnapshots({original:a,restored:path.join(link,'b.bin')}),/symlink/);}finally{clean(root);}
});

test('directory or unsupported path rejected',()=>{
  const {root,a}=fixture();try{assert.throws(()=>compareSnapshots({original:a,restored:root}),/regular file/);assert.throws(()=>compareSnapshots({original:a,restored:''}),/invalid/);}finally{clean(root);}
});

test('CLI exit 0 on match and 2 on mismatch',()=>{
  const {root,a,b}=fixture();try{
    const out=path.join(root,'report.json');
    assert.equal(main(['--original',a,'--restored',b,'--out',out]),0);
    assert.equal(JSON.parse(fs.readFileSync(out,'utf8')).backup_roundtrip_attested,false);
    fs.writeFileSync(b,'broken');
    assert.equal(main(['--original',a,'--restored',b,'--out',path.join(root,'new.json')]),2);
  }finally{clean(root);}
});

test('CLI refuses overwrite of inputs and existing reports',()=>{
  const {root,a,b}=fixture();try{
    assert.throws(()=>main(['--original',a,'--restored',b,'--out',a]),/overwrite/);
    const p=path.join(root,'existing.json');fs.writeFileSync(p,'keep');
    assert.throws(()=>main(['--original',a,'--restored',b,'--out',p]),/EEXIST/);
    assert.equal(fs.readFileSync(p,'utf8'),'keep');
  }finally{clean(root);}
});
