// Run on an authorized SECOND device. A join link is read from stdin, not argv
// (so its bearer token does not enter shell command history or process arguments).
// Probe only visits an explicitly approved RFC1918 IPv4 synthetic lab origin.
import fs from 'node:fs';
import path from 'node:path';
import {probeCommunityRadioSecondDevice} from '../systemia/network/community-radio-second-device-probe.mjs';

const args=process.argv.slice(2);
const flag='--acknowledge-local-test';
const outputArg=args.find(x=>x.startsWith('--output='));
const valid=args.includes(flag)&&args.every(x=>x===flag||x===outputArg)&&
  args.filter(x=>x===flag).length===1&&args.filter(x=>x===outputArg).length<2;
if(!valid){
  console.error('Usage: npm run radio:second-device-probe -- --acknowledge-local-test [--output=/absolute/path/new-receipt.json]');
  console.error('Supply a temporary synthetic lab join link on stdin. Never use real station or emergency audio.');
  process.exitCode=2;
}else{
  try{
    process.stderr.write('Enter private synthetic LAN join link, then EOF. The bearer URL is never printed in the receipt.\n');
    let text='';
    for await(const chunk of process.stdin){
      text+=chunk.toString('utf8');
      if(text.length>600)throw Error('join_input_too_long');
    }
    const record=await probeCommunityRadioSecondDevice({joinUrl:text.trim(),acknowledged:true});
    const serialized=JSON.stringify(record,null,2)+'\n';
    if(outputArg){
      const output=outputArg.slice('--output='.length);
      if(!path.isAbsolute(output))throw Error('absolute_output_path_required');
      const fd=fs.openSync(output,'wx',0o600);
      try{fs.writeFileSync(fd,serialized);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      console.log('Synthetic LAN HTTP probe receipt saved. No bearer tokens or cookies recorded.');
    }else process.stdout.write(serialized);
  }catch(error){
    console.error('Synthetic LAN probe held: '+String(error.message||error));
    process.exitCode=1;
  }
}
