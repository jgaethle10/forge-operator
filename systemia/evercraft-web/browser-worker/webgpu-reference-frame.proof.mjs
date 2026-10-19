import assert from 'node:assert/strict';
import { runWorldEngineReferenceFrameConformance } from './webgpu-reference-frame.mjs';

const receipt=await runWorldEngineReferenceFrameConformance({
  repoRoot:process.env.GITHUB_WORKSPACE || undefined,
  sourceDir:process.cwd(),
  stateDir:String(process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||'').trim() || null,
});

assert.equal(receipt.status,'verified');
assert.equal(receipt.pixel_verified,true);
assert.equal(receipt.atmosphere_pixel_verified,true);
assert.deepEqual(receipt.atmosphere_pixel.length,4);
assert.match(receipt.shader_sha256,/^sha256:[a-f0-9]{64}$/);
assert.match(receipt.receipt_hash,/^sha256:[a-f0-9]{64}$/);
assert.deepEqual(receipt.observed_pixel.length,4);

if(receipt.execution_class==='software_adapter'){
  assert.equal(receipt.hardware_execution_claim,false);
}
if(receipt.execution_class==='adapter_type_unknown'){
  assert.equal(receipt.hardware_execution_claim,false);
}
if(receipt.hardware_execution_claim===true){
  assert.equal(receipt.execution_class,'hardware_adapter_reported');
}

process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
