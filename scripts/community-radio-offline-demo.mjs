// Explicitly simulated radio demo. No client data, actual station credentials, or RF.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {startLocalRadioPortal} from '../systemia/network/community-radio-offline-portal.mjs';
import {startCommunityRadioLanLab} from '../systemia/network/community-radio-lan-lab.mjs';
import {createCommunityRadioClockGuard} from '../systemia/network/community-radio-clock-guard.mjs';
const demoDir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-offline-radio-demo-'));
const pair=crypto.generateKeyPairSync('ed25519');
const publicKey=pair.publicKey.export({format:'pem',type:'spki'});
const wav=Buffer.alloc(44+16000);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);
wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
for(let i=0;i<8000;i++)wav.writeInt16LE(Math.round(1500*Math.sin(2*Math.PI*440*i/8000)),44+i*2);
fs.writeFileSync(path.join(demoDir,'demo.wav'),wav,{mode:0o600});
const issued=new Date(),expires=new Date(issued.getTime()+20*60*1000);
const signed_data={
  schema:'evercraft.broadcast.local-bulletin.v1',
  station_name:'Evercraft Simulated Community Station | No Real Broadcast',
  title:'Offline demonstration: simulated message',
  message:'SIMULATION ONLY. This example is not a real emergency update or station transmission. The portal and recording are served entirely from your own device.',
  approved_at:issued.toISOString(),expires_at:expires.toISOString(),
  editor_approval_ref:'simulation-editor-only',
  local_distribution_rights_ref:'simulation-original-tone',
  lab_synthetic_fixture:true,
  audio_file:'demo.wav',
  audio_sha256:'sha256:'+crypto.createHash('sha256').update(wav).digest('hex'),
};
fs.writeFileSync(path.join(demoDir,'bulletin.json'),JSON.stringify({
  schema:'evercraft.broadcast.signed-local-bulletin.v1',
  signed_data,
  signature:crypto.sign(null,Buffer.from(JSON.stringify(signed_data)),pair.privateKey).toString('base64'),
}),{mode:0o600});
const args=process.argv.slice(2);
const hostArgument=args.find(a=>a.startsWith('--lan-lab='));
const consent=args.includes('--consent-to-local-sharing');
if((hostArgument&&!consent)||(!hostArgument&&consent)){
  console.error('LAN lab requires BOTH --lan-lab=<private-interface-IP> and --consent-to-local-sharing. Synthetic material only.');
  fs.rmSync(demoDir,{recursive:true,force:true});process.exit(2);
}
const clockGuard=createCommunityRadioClockGuard({stateDir:demoDir,initialize:true,now:issued});
const portal=hostArgument?
  await startCommunityRadioLanLab({dir:demoDir,publicKey,host:hostArgument.slice('--lan-lab='.length),operatorAcknowledged:true,minutes:10,clockGuard}):
  await startLocalRadioPortal({dir:demoDir,publicKey,clockGuard});
console.log(JSON.stringify(hostArgument?{
  state:'synthetic_lan_lab_explicit_opt_in',join_url:portal.join_url,
  expires_at:portal.expires_at,plain_http_is_not_private:true,
  customer_hardware:false,fm_transmission:false,actual_station_audio:false,
  instruction:'Open the join URL on a second phone connected to the same isolated authorized Wi-Fi, with upstream internet off.'
}:{state:'simulated_loopback_demo_only',open_on_same_device:portal.origin,expires_at:expires.toISOString(),fm_transmission:false,lan_distribution:false,customer_hardware:false}));
const cleanup=()=>{if(hostArgument)void portal.stop().finally(()=>fs.rmSync(demoDir,{recursive:true,force:true}));else {portal.server.close();fs.rmSync(demoDir,{recursive:true,force:true});}};
process.once('SIGTERM',()=>{cleanup();process.exit(0);});
process.once('SIGINT',()=>{cleanup();process.exit(0);});
