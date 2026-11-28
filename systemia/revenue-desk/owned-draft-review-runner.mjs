// Isolated owned draft-review runner. Reuses exact existing #2611 read-only
// OAuth implementation; never enrolls, copies credentials, or requests send scope.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {reviewOwnedDrafts} from './owned-draft-review.mjs';

const PINNED={
 'owned-gmail-binding.mjs':'a8218cbe8b41005a52e23ac6494d4bd0acbdc255',
 'owned-gmail-import.mjs':'107500309dbb4925f86a8886b3d607f506081ead'
};
function verifySource(directory){
 if(!path.isAbsolute(directory)||fs.realpathSync(directory)!==directory)throw Error('gmail_binding_source_hold');
 for(const [name,want] of Object.entries(PINNED)){
  const file=path.join(directory,name);
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>100000)throw Error('gmail_binding_source_hold');
  const b=fs.readFileSync(file);
  const actual=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
  if(actual!==want)throw Error('gmail_binding_source_mismatch');
 }
}
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==2&&args.length!==4||args[0]!=='--binding-source'||(args.length===4&&args[2]!=='--reviewed-lanes-file'))throw Error('gmail_draft_runner_usage');
 const root=path.join(os.homedir(),'.local/state/evercraft-revenue-desk/.secrets');
 const clientPath=path.join(root,'gmail-desktop-client.json');
 const bindingPath=path.join(root,'gmail-readonly-binding.json');
 if(!fs.existsSync(clientPath)||!fs.existsSync(bindingPath)){
  console.log(JSON.stringify({schema:'evercraft.systemia.owned-draft-review-runner.v1',state:'hold_owned_gmail_binding_not_present_on_this_node',provider_requests:0,send_authority:false,provider_write_performed:false}));
  process.exitCode=2;return;
 }
 verifySource(args[1]);
 const m=await import(pathToFileURL(path.join(args[1],'owned-gmail-binding.mjs')).href);
 const client=m.desktopClient(m.readPrivateJson(clientPath)),binding=m.readPrivateJson(bindingPath);
 // Existing owner-enrolled mailbox identity is checked again against Google's profile.
 const accessToken=await m.refreshBinding({client,binding,expectedMailbox:binding.expected_mailbox});
 const reviewedLanes=args.length===4?m.readPrivateJson(args[3]):{};
 if(!reviewedLanes||typeof reviewedLanes!=='object'||Array.isArray(reviewedLanes)||Object.keys(reviewedLanes).length>400)throw Error('gmail_reviewed_lanes_hold');
 const r=await reviewOwnedDrafts({accessToken,reviewedLanes,maxDrafts:20,maxListPages:10});
 console.log(JSON.stringify({...r,mailbox_identity_verified:true,review_map_entries:Object.keys(reviewedLanes).length},null,2));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{
 const code=String(e?.message??'');
 console.error(JSON.stringify({state:'hold',reason:/^gmail_[a-z0-9_]+$/.test(code)?code:'private_input_or_transport_hold',send_authority:false}));
 process.exitCode=1;
});
