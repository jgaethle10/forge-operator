#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildWaveExecutionPacket, nextWaveActions, assertWavePacketBoundaries } from './wave-execution-packet.mjs';

function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0?process.argv[i+1]||fallback:fallback;
}
function read(file){ return JSON.parse(fs.readFileSync(path.resolve(file),'utf8')); }

const wave=Number(arg('--wave','1'));
if(!Number.isInteger(wave)||wave<1) throw new Error('wave_invalid');
const estatePath=arg('--estate','systemia/migrations/base44-exit/estate-snapshot.json');
const policyPath=arg('--policy','systemia/migrations/base44-exit/policy.json');
const estate=read(estatePath);
const profileRef=estate?.wave_profiles?.[String(wave)]?.source_profile;
if(!profileRef) throw new Error('wave_source_profile_not_registered');
const profile=read(profileRef);
const policy=read(policyPath);

const packet=buildWaveExecutionPacket({profile,queue:estate.queue||[],policy});
assertWavePacketBoundaries(packet);
const actions=nextWaveActions(packet);
const outPath=path.resolve(arg('--out',`artifacts/base44-exit/wave-${wave}-execution-packet.json`));
fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify({...packet,next_actions:actions},null,2)+'\n',{mode:0o600});

console.log(JSON.stringify({
  schema:'evercraft.base44.wave-execution-run.v1',
  wave,
  output:outPath,
  products:packet.products.length,
  missing_shared_primitives:packet.missing_shared_landing_primitives,
  next_actions:actions,
  source_mutation_authority:false,
  traffic_cutover_authority:false,
  source_decommission_authority:false
},null,2));
