import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateBrandFidelity } from './fidelity-gate.mjs';

function pngHeader(width,height,tail=0) {
  const buf = Buffer.alloc(25);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(buf,0);
  buf.writeUInt32BE(13,8);
  buf.write('IHDR',12,'ascii');
  buf.writeUInt32BE(width,16);
  buf.writeUInt32BE(height,20);
  buf[24]=tail;
  return buf;
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'brand-fidelity-proof-'));
const baselineRoot=path.join(root,'baseline');
const candidateRoot=path.join(root,'candidate');
fs.mkdirSync(baselineRoot,{recursive:true});
fs.mkdirSync(candidateRoot,{recursive:true});

const baseline={
  schema:'evercraft.brand-fidelity-manifest.v1',
  product_id:'rivet',
  brand_namespace:'rivet-isolated',
  baseline_release_ref:'partner-approved-release',
  capture_state:'APPROVED_BASELINE_CAPTURED',
  viewports:[{id:'desktop',width:1440,height:1000},{id:'mobile',width:390,height:844}],
  protected_tokens:{logo_sha:'logo-1',font_stack:'Approved Font',primary:'#123456',radius:'12px'},
  interaction_contract:{navigation:['home','report'],loading_state:'approved',forms:'approved'},
  screenshots:[
    {id:'home-desktop',file:'home-desktop.png'},
    {id:'home-mobile',file:'home-mobile.png'},
  ],
  assets:[{id:'logo',sha256:'asset-logo-sha'}],
};

const candidate={
  ...structuredClone(baseline),
  capture_state:'CANDIDATE_CAPTURED',
};

fs.writeFileSync(path.join(baselineRoot,'home-desktop.png'),pngHeader(1440,1000,1));
fs.writeFileSync(path.join(candidateRoot,'home-desktop.png'),pngHeader(1440,1000,1));
fs.writeFileSync(path.join(baselineRoot,'home-mobile.png'),pngHeader(390,844,1));
fs.writeFileSync(path.join(candidateRoot,'home-mobile.png'),pngHeader(390,844,1));

const clean=evaluateBrandFidelity({baselineManifest:baseline,candidateManifest:candidate,baselineRoot,candidateRoot});
assert.equal(clean.ok,true);

fs.writeFileSync(path.join(candidateRoot,'home-mobile.png'),pngHeader(390,844,2));
const visualDrift=evaluateBrandFidelity({baselineManifest:baseline,candidateManifest:candidate,baselineRoot,candidateRoot});
assert.equal(visualDrift.ok,false);
assert.ok(visualDrift.blockers.some((row)=>row.code==='screenshot_visual_drift'));

fs.writeFileSync(path.join(candidateRoot,'home-mobile.png'),pngHeader(391,844,1));
const dimensionDrift=evaluateBrandFidelity({baselineManifest:baseline,candidateManifest:candidate,baselineRoot,candidateRoot});
assert.equal(dimensionDrift.ok,false);
assert.ok(dimensionDrift.blockers.some((row)=>row.code==='screenshot_dimension_drift'));

fs.writeFileSync(path.join(candidateRoot,'home-mobile.png'),pngHeader(390,844,1));
const tokenCandidate=structuredClone(candidate);
tokenCandidate.protected_tokens.primary='#654321';
const tokenDrift=evaluateBrandFidelity({baselineManifest:baseline,candidateManifest:tokenCandidate,baselineRoot,candidateRoot});
assert.equal(tokenDrift.ok,false);
assert.ok(tokenDrift.blockers.some((row)=>row.code==='protected_token_drift'));

const unapprovedBaseline=structuredClone(baseline);
unapprovedBaseline.capture_state='NOT_CAPTURED';
const noBaseline=evaluateBrandFidelity({baselineManifest:unapprovedBaseline,candidateManifest:candidate,baselineRoot,candidateRoot});
assert.equal(noBaseline.ok,false);
assert.deepEqual(noBaseline.blockers.map((row)=>row.code),['approved_baseline_capture_required']);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.brand-fidelity-proof.v1',
  exact_png_regression_gate:true,
  viewport_gate:true,
  protected_token_gate:true,
  interaction_contract_gate:true,
  approved_baseline_required:true,
  accidental_parent_theme_inheritance_blocked:true,
},null,2));

fs.rmSync(root,{recursive:true,force:true});
