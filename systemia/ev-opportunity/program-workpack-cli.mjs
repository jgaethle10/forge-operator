#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileEvProgramQueue } from './program-workpacks.mjs';

function arg(name, fallback='') {
  const index=process.argv.indexOf(name);
  return index === -1 ? fallback : String(process.argv[index+1]||'');
}
const catalog=JSON.parse(readFileSync(fileURLToPath(new URL('./programs.v1.json',import.meta.url)),'utf8'));
if (catalog?.schema!=='evercraft.ev-opportunity.official-program-catalog.v1' || !Array.isArray(catalog?.programs)) {
  throw new Error('program_catalog_invalid');
}
const now=arg('--now',new Date().toISOString());
const queue=compileEvProgramQueue(catalog.programs,{now});
const format=arg('--format','markdown');
if (format==='json') {
  process.stdout.write(JSON.stringify(queue,null,2)+'\n');
} else if (format==='markdown') {
  const out=['# Evercraft EV | internal solicitation work packages','',
    '> Research only. This is not a submitted bid, qualified contractor award, customer contract or engineering approval.',''];
  for (const row of queue.programs) {
    out.push('## '+row.title,'',
      '**State:** '+row.package_state+' | **Deadline:** '+row.deadline.at+' ('+row.deadline.state+')',
      '**Buyer route:** '+row.engagement_model,
      '**Official posting:** '+row.official_references.official_url,'',
      '### Reasons this is not ready','');
    for(const item of [...row.held_reasons,...row.research_gaps]) out.push('- '+item);
    out.push('','### Potential paid, independently scoped services','');
    for(const item of row.candidate_paid_scope)out.push('- '+item);
    out.push('','### 48-hour preparation (no external actions)','');
    for(const item of row.next_48h)out.push('- '+item);
    out.push('');
  }
  process.stdout.write(out.join('\n'));
} else {
  throw new Error('unsupported_format_use_json_or_markdown');
}
