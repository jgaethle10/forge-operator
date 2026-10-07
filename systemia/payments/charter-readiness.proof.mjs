import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareCharterPaths } from './charter-readiness.mjs';

const evidence=JSON.parse(fs.readFileSync('systemia/payments/charter-evidence.json','utf8'));
const ranked=compareCharterPaths({evidenceByPath:evidence.evidence_by_path||{}});

assert.equal(ranked.length,4);
assert.ok(ranked.every(x=>x.regulated_execution_authorized===false));
assert.ok(ranked.every(x=>x.application_ready===false));

process.stdout.write(JSON.stringify({
  schema:'evercraft.financial.charter-readiness-proof.v1',
  evidence_state:evidence.state,
  paths:ranked.map(x=>({
    path_key:x.path_key,
    readiness_percent:x.readiness_percent,
    verified_requirements:x.verified_requirements,
    total_requirements:x.total_requirements,
    application_ready:x.application_ready,
    regulated_execution_authorized:x.regulated_execution_authorized,
    first_blockers:x.missing_requirements.slice(0,5)
  })),
  boundary:'No charter application, approval, insurance, or regulated execution authority is inferred from this readiness proof.'
},null,2)+'\n');
