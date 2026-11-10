#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { checkOriginalDomains } from './roman-primary-acceptance.mjs';

const d=await checkOriginalDomains();
const out=process.argv.includes('--receipt')?process.argv[process.argv.indexOf('--receipt')+1]:null;
if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(d,null,2)+'\n');}
const summary=[
  '## Original-domain recovery acceptance: '+(d.mission_pass?'PASS':'FAIL (visitor still reaches broken/unverified page)'),
  ...d.original_domain_visits.map(x=>'- '+x.original_url+': HTTP '+(x.status??'unreachable')+'; final='+String(x.final_url??'none')+'; result='+(x.visitor_landing_verified?'VERIFIED':'FAILED '+x.problem)),
  '- Independent mirrors are NOT proof that the original domain is fixed.',
  '- No registrar logins, domain mutations, outreach, payments or browser installations attempted.',
  '- Next step, if failing: authorized routing of original domain to working Evercraft website.',
  ''
].join('\n');
process.stdout.write(summary);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
if(!d.mission_pass){
  process.stdout.write('::error title=ORIGINAL_DOMAIN_NOT_RECOVERED::Typing voteroman.com and www must reach a verified working page; independent mirror tests do not satisfy this acceptance gate.\n');
  process.exitCode=2;
}
