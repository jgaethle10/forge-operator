#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { renderEvConceptSheet } from './site-plan-renderer.mjs';

// Does not fetch assets, manipulate a browser, or deploy. Writes an SVG only
// to the explicitly supplied output file; no implicit system paths.
const idx = name => process.argv.indexOf(name);
const value = name => idx(name) >= 0 ? process.argv[idx(name)+1] : undefined;
const source=value('--input'), output=value('--output');
const role=value('--role')||'site_concept';
if(!source || !output || !/\.svg$/i.test(output)) throw new Error('usage: --input path.json --output path.svg [--role site_concept|area_context]');
const model=JSON.parse(readFileSync(source,'utf8'));
const result=renderEvConceptSheet(model,{role});
if(!result.svg) {
  process.stderr.write(JSON.stringify(result.qa,null,2)+'\n');
  process.exitCode=2;
} else {
  writeFileSync(output,result.svg,{flag:'wx'});
  process.stdout.write(JSON.stringify({role,output,state:result.qa.state,sha256:result.qa.model_sha256,verification_notes:result.qa.verification_notes},null,2)+'\n');
}
