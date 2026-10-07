import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWebGpuAdapter } from './webgpu-conformance.mjs';

test('forced SwiftShader profile can never claim hardware execution',()=>{
  const result=classifyWebGpuAdapter(
    {vendor:'Google',architecture:'SwiftShader',description:'SwiftShader Device'},
    {forcedSoftware:true}
  );
  assert.equal(result.execution_class,'software_adapter');
  assert.equal(result.hardware_execution_claim,false);
});

test('software adapter description is classified as software even without forced profile',()=>{
  const result=classifyWebGpuAdapter(
    {vendor:'Mesa',description:'llvmpipe software rasterizer'},
    {forcedSoftware:false}
  );
  assert.equal(result.execution_class,'software_adapter');
  assert.equal(result.hardware_execution_claim,false);
});

test('known hardware vendor may be reported as hardware only when no software marker exists',()=>{
  const result=classifyWebGpuAdapter(
    {vendor:'NVIDIA',architecture:'Ada',description:'GeForce RTX'},
    {forcedSoftware:false}
  );
  assert.equal(result.execution_class,'hardware_adapter_reported');
  assert.equal(result.hardware_execution_claim,true);
});

test('ambiguous adapter remains unknown instead of being promoted to hardware',()=>{
  const result=classifyWebGpuAdapter(
    {vendor:'',architecture:'',description:''},
    {forcedSoftware:false}
  );
  assert.equal(result.execution_class,'adapter_type_unknown');
  assert.equal(result.hardware_execution_claim,false);
});
