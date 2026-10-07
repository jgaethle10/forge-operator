import assert from 'node:assert/strict';
import { runWebGpuDeviceConformance } from './webgpu-conformance.mjs';

const receipt=await runWebGpuDeviceConformance({
  sourceDir:process.cwd(),
  stateDir:String(process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||'').trim() || null,
});

assert.equal(receipt.status,'verified');
assert.equal(receipt.navigator_gpu,true);
assert.equal(receipt.device_acquired,true);
assert.equal(receipt.compute?.verified,true);
assert.equal(receipt.render?.verified,true);
assert.ok(String(receipt.receipt_hash||'').match(/^sha256:[a-f0-9]{64}$/));

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
