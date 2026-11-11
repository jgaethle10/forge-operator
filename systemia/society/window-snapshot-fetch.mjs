/**
 * Pin and read the canonical Mossmere saved state through GitHub HTTPS.
 * This is a read-only *snapshot transport*, not a signature, deployment,
 * publishing step, credential flow, remote writer or live stream.
 *
 * The SHA-pinned heartbeat writer and its GitHub workflow remain untouched.
 */
import {createHash} from 'node:crypto';
import {observeWindowSnapshot} from './window-decision-observer.mjs';

const REPO='jgaethle10/forge-operator';
const BRANCH='window-society-state';
const STATE_PATH='state/window.json';
const BASE='https://api.github.com/repos/'+REPO;
const SHA=/^[a-f0-9]{40}$/;
const MAX_JSON_BYTES=1_000_000;
const HEADERS=Object.freeze({
  Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28',
  'User-Agent':'Evercraft-Window-Read-Only-Observer'
});

async function getJson(fetchImpl,url){
  const res=await fetchImpl(url,{method:'GET',headers:HEADERS,redirect:'error'});
  if(!res||res.ok!==true)throw Error('Canonical GitHub snapshot unavailable (read-only request failed)');
  const payload=await res.json();
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid GitHub snapshot response');
  return payload;
}

export async function fetchWindowSnapshot({fetchImpl=fetch,observedAt=new Date().toISOString()}={}){
  if(typeof fetchImpl!=='function')throw Error('Fetch function required');
  if(!Number.isFinite(Date.parse(observedAt)))throw Error('Invalid observation time');

  const branch=await getJson(fetchImpl,BASE+'/git/ref/heads/'+BRANCH);
  if(branch.ref!=='refs/heads/'+BRANCH||branch.object?.type!=='commit'||!SHA.test(branch.object.sha||'')) {
    throw Error('Canonical state branch reference mismatch');
  }
  const commit=branch.object.sha;
  // The exact immutable commit SHA is supplied as ref, never a moving branch.
  const file=await getJson(fetchImpl,BASE+'/contents/'+STATE_PATH+'?ref='+commit);
  if(file.type!=='file'||file.path!==STATE_PATH||file.encoding!=='base64'||
     !SHA.test(file.sha||'')||!Number.isInteger(file.size)||
     file.size<2||file.size>MAX_JSON_BYTES||typeof file.content!=='string'||
     file.content.length>1_400_000)throw Error('Invalid pinned state file metadata');
  const encoded=file.content.replace(/\s/g,'');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length%4!==0)
    throw Error('Invalid encoded state file');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length!==file.size)throw Error('Pinned state file length mismatch');
  const blobHash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(blobHash!==file.sha)throw Error('Pinned Git object hash mismatch');
  let state;
  try{state=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Invalid JSON in canonical state snapshot');}
  const observation=observeWindowSnapshot(state);
  return {
    ...observation,
    source_fetch:{
      kind:'github_https_commit_pinned_read_only',
      repo:REPO,branch:BRANCH,path:STATE_PATH,
      commit_sha:commit,blob_sha:file.sha,
      observed_at:observedAt,
      assertion:'git_blob_and_world_content_consistency_not_signed_attestation'
    }
  };
}

if(process.argv[1]?.endsWith('/window-snapshot-fetch.mjs')){
  if(process.argv.length!==2){
    console.error('Usage: node systemia/society/window-snapshot-fetch.mjs > private-observation.json');
    process.exitCode=2;
  }else{
    fetchWindowSnapshot()
      .then(observation=>process.stdout.write(JSON.stringify(observation,null,2)+'\n'))
      .catch(e=>{console.error('Read-only snapshot refused: '+e.message);process.exitCode=1;});
  }
}
