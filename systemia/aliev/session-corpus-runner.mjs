#!/usr/bin/env node
import path from 'node:path';
import {
  backfillPlugNYCSessionCorpus,
  compactPlugNYCSessionCorpus,
  sessionCorpusStatus,
  PLUGNYC_SOURCE_URL
} from './session-corpus.mjs';

function value(args,name,fallback){
  const i=args.indexOf(name);
  return i>=0 ? (args[i+1]??fallback) : fallback;
}
const args=process.argv.slice(2);
const stateDir=path.resolve(value(args,'--state-dir',process.env.ALIEV_SESSION_CORPUS_STATE_DIR||'artifacts/aliev-session-corpus'));
const sourceUrl=value(args,'--source-url',process.env.ALIEV_SESSION_SOURCE_URL||PLUGNYC_SOURCE_URL);
const pageSize=Number(value(args,'--page-size',process.env.ALIEV_SESSION_PAGE_SIZE||5000));
const maxPages=Number(value(args,'--max-pages',process.env.ALIEV_SESSION_MAX_PAGES_PER_RUN||8));
const compactAlways=args.includes('--compact');
const compactOnComplete=args.includes('--compact-on-complete') || process.env.ALIEV_SESSION_COMPACT_ON_COMPLETE!=='false';

const result=await backfillPlugNYCSessionCorpus({
  stateDir,
  sourceUrl,
  pageSize,
  maxPagesPerRun:maxPages
});
let compaction=null;
if(compactAlways || (compactOnComplete && result.checkpoint.complete)){
  compaction=compactPlugNYCSessionCorpus({stateDir});
}
console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.aliev.session-corpus-runner.v1',
  backfill:result.receipt,
  compaction:compaction?.receipt||null,
  status:sessionCorpusStatus({stateDir})
},null,2));
