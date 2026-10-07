#!/usr/bin/env node
import fs from 'node:fs';
import { compareCharterPaths } from './charter-readiness.mjs';

const file=process.argv[2]||'systemia/payments/charter-evidence.json';
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const ranked=compareCharterPaths({evidenceByPath:data.evidence_by_path||{}});
process.stdout.write(JSON.stringify({
  schema:'evercraft.financial.charter-readiness-report.v1',
  evidence_state:data.state||null,
  ranked_paths:ranked,
  regulated_execution_authorized:false
},null,2)+'\n');
