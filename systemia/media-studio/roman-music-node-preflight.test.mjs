import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyHardware,collectHardware} from './roman-music-node-preflight.mjs';

test('GPU candidate with supported Python gives 2B trial, not deployment permission',()=>{
 const report=classifyHardware({gpus:[{name:'NVIDIA',vram_gb:8}],
  python:{major:3,minor:11,patch:9},free_disk_gb:40,memory_gb:16,ffmpeg:true,ffprobe:true});
 assert.equal(report.recommended_lane,'ace_step_2b_offload_candidate');
 assert.equal(report.deployment_authorized,false);
 assert.equal(report.commercial_audio_approved,false);
 assert.deepEqual(report.blockers,[]);
});
test('WSL CPU-only needs benchmarking and no default GPU claim',()=>{
 const report=classifyHardware({gpus:[],python:{major:3,minor:12,patch:4},free_disk_gb:30,memory_gb:12,wsl:true});
 assert.equal(report.recommended_lane,'measure_cpu_fallback_before_installing_model');
 assert.ok(report.warnings.includes('wsl_gpu_pass_through_must_be_validated'));
 assert.ok(report.warnings.includes('gpu_vram_unavailable_or_no_cuda_device'));
});
test('unsupported Python is explicit blocker; unknown disk remains unknown',()=>{
 const report=classifyHardware({python:{major:3,minor:13,patch:0}});
 assert.ok(report.blockers.includes('python_3_11_or_3_12_not_detected'));
 assert.ok(report.warnings.includes('disk_free_space_unmeasured'));
});
test('host inspection reports snapshot without installing anything',()=>{
 const r=collectHardware();
 assert.equal(r.schema,'evercraft.fallen.node-music-hardware-preflight.v1');
 assert.equal(r.decision.deployment_authorized,false);
 assert.ok(Array.isArray(r.gpus));
 assert.ok(Number.isFinite(r.memory_gb));
 assert.ok(r.machine.length>0);
});
