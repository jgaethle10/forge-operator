#!/usr/bin/env node
// Explicitly invoked private-runner entrypoint. Does not schedule, refresh tokens, or publish.
import { preserveArtifact } from './artifact-preservation.mjs';
import { googleDriveAdapter } from './artifact-google-drive.mjs';

function options(args) {
  const o={};
  for(let i=0;i<args.length;i+=2){
    if(!args[i]?.startsWith('--') || !args[i+1]) throw Error('expected --flag value');
    const n=args[i].slice(2);
    if(!['source','project','version','custody-dir','execute'].includes(n)||o[n]) throw Error('invalid option');
    o[n]=args[i+1];
  }
  for(const key of ['source','project','version','custody-dir']) if(!o[key]) throw Error(`missing --${key}`);
  if(o.execute!=='authorized-private-upload') throw Error('explicit --execute authorized-private-upload required');
  return o;
}
export async function main(args=process.argv.slice(2),env=process.env){
  const o=options(args);
  const adapter=googleDriveAdapter({
    accessToken:env.GOOGLE_DRIVE_ACCESS_TOKEN,
    folderId:env.EVERCRAFT_CUSTODY_DRIVE_FOLDER_ID
  });
  const result=await preserveArtifact({source:o.source,project:o.project,version:o.version,
    custodyDir:o['custody-dir'],adapter});
  return {state:result.state,sha256:result.sha256,run_id:result.run_id,
    backup_roundtrip_attested:false,device_install:'unverified',publication:'unverified'};
}
if(process.argv[1]&&process.argv[1].endsWith('/artifact-preserve-drive.mjs')){
  try { const result=await main();process.stdout.write(JSON.stringify(result)+'\n'); }
  catch(error){
    // Never display raw provider error bodies or access tokens.
    process.stderr.write('Private Google Drive custody step failed. Inspect private receipt directory.\n');
    process.exitCode=1;
  }
}
