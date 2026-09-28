import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHostPlateFfmpegArgs } from './host-plate.js';

const base={
  schema:'evercraft.fallen.host-plate-prep.v1' as const,
  id:'jesse-host-plate',
  inputPath:'./input.mp4',
  outputPath:'./output.webm',
  sourceRefs:['user:approved-performance'],
  identityEvidenceRefs:['user:approved-reference'],
};

test('host plate preparation creates VP9 alpha output with chroma key',()=>{
  const args=buildHostPlateFfmpegArgs(base);
  assert.ok(args.includes('libvpx-vp9'));
  assert.ok(args.includes('yuva420p'));
  assert.ok(args.some(value=>value.includes('chromakey=0x00FF00')));
  assert.ok(args.includes('-an'));
});

test('already-alpha performance plates skip chroma keying',()=>{
  const args=buildHostPlateFfmpegArgs({...base,alreadyAlpha:true});
  const filter=args[args.indexOf('-vf')+1];
  assert.equal(filter,'format=yuva420p');
});
