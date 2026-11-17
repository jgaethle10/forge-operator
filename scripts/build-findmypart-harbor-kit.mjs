#!/usr/bin/env node
// Export review-only handoff; never publishes, schedules or contacts Harbor.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {HARBOR_FINDMYPART_LAUNCH,validateHarborLaunchKit} from '../systemia/distribution/harbor/findmypart-launch.mjs';

export function buildCaptionPack(kit=HARBOR_FINDMYPART_LAUNCH){
 const checked=validateHarborLaunchKit(kit);
 if(!checked.pass)throw Error('launch_handoff_invalid:'+checked.failures.join(','));
 return ['FINDMYPART / HARBOR REVIEW COPY','STATE: STAGED, NOT PUBLISHED','PUBLIC ROUTE: UNVERIFIED','TRANSPORT: HUMAN-ATTACHED ONLY','',
   ...Object.entries(kit.captions).flatMap(([platform,item])=>[
    '=== '+platform.toUpperCase()+' ===','Asset: '+item.artwork,
    item.draft,'',item.call_to_action,''
   ])
 ].join('\n')+'\n';
}
export function exportHarborKit(directory){
 const out=resolve(directory);
 if(out.split(/[\\/]/).some(v=>['public','dist','.github'].includes(v)))throw Error('review_artifact_only');
 const check=validateHarborLaunchKit();
 if(!check.pass)throw Error('launch_handoff_invalid:'+check.failures.join(','));
 mkdirSync(out,{recursive:true});
 const json=join(out,'findmypart-harbor-review.json');
 const captions=join(out,'findmypart-harbor-captions.txt');
 writeFileSync(json,JSON.stringify(HARBOR_FINDMYPART_LAUNCH,null,2)+'\n',{flag:'w'});
 writeFileSync(captions,buildCaptionPack(),{flag:'w'});
 return {output_names:['findmypart-harbor-review.json','findmypart-harbor-captions.txt'],state:'STAGED_NOT_PUBLISHED',sent:false};
}
if(process.argv[1]&&process.argv[1].endsWith('build-findmypart-harbor-kit.mjs')){
 const idx=process.argv.indexOf('--out');
 if(idx<0||!process.argv[idx+1])throw Error('use --out DIRECTORY');
 process.stdout.write(JSON.stringify(exportHarborKit(process.argv[idx+1]))+'\n');
}
