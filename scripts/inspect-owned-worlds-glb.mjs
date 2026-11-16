#!/usr/bin/env node
// Offline only: inspect a locally authored/rights-cleared GLB, never upload it.
import fs from 'node:fs/promises';
import {admitOwnedGlb,MAX_GLB_BYTES} from '../public/worlds/owned-glb.mjs';
const [source,manifestFile]=process.argv.slice(2);
if(!source||!manifestFile){console.error('Usage: node scripts/inspect-owned-worlds-glb.mjs MODEL.glb RIGHTS.json');process.exitCode=2;}
else try{
 const st=await fs.stat(source);if(!st.isFile()||st.size>MAX_GLB_BYTES)throw Error('asset_file_bounds');
 const [bytes,manifest]=await Promise.all([fs.readFile(source),fs.readFile(manifestFile,'utf8').then(JSON.parse)]);
 const asset=await admitOwnedGlb(bytes,manifest);
 console.log(JSON.stringify({schema:asset.schema,asset_id:asset.rights.id,digest_verified:asset.rights.digest_verified,
  rights_operator_attested:true,license:asset.rights.license,
  vertexCount:asset.vertexCount,triangleCount:asset.triangleCount,
  material:asset.material,approved_for_visual_review:true,public_deployed:false},null,2));
}catch(error){console.error('HOLD:',String(error?.message||error));process.exitCode=1;}
