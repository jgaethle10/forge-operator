#!/usr/bin/env node
// Owned Wing Courier broker activation: DRY-RUN by default.
// Never provisions wing secrets or enables Fabric's public private-route flag.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const BROKER_PREFLIGHT_SCHEMA='evercraft.wing-courier.broker-preflight.v1';
export const BROKER_LOCAL_PROBE_SCHEMA='evercraft.wing-courier.broker-local-probe.v1';
const SERVICE='evercraft-wing-courier-broker.service';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const TOKEN=/^[A-Za-z0-9_-]{43,256}$/;
const deny=reason=>{throw Error('wing_broker_bootstrap_'+reason);};
function safeArg(s){
  if(typeof s!=='string'||!s||/[\s%\u0000-\u001f\\;"'\x60$&|<>#]/.test(s))deny('unsafe_service_argument');
  return s;
}
function inspectFile(file,secret=false){
  if(typeof file!=='string'||!path.isAbsolute(file))deny('absolute_file_required');
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||
    (secret&&((st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid()))))
    deny('untrusted_file');
  return st;
}
function inspectDir(dir,privateDir=true){
  if(typeof dir!=='string'||!path.isAbsolute(dir))deny('absolute_dir_required');
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||
    (privateDir&&((st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid()))))
    deny('untrusted_dir');
}
function inspectParents(file){
  let dir=path.dirname(path.resolve(file));
  while(dir!==path.dirname(dir)){
    const st=fs.lstatSync(dir);
    if(!st.isDirectory()||st.isSymbolicLink())deny('symlinked_parent');
    dir=path.dirname(dir);
  }
}
function tokenHash(file){
  safeArg(file);inspectParents(file);
  const st=inspectFile(file,true);
  if(st.size<43||st.size>512)deny('token_size');
  const value=fs.readFileSync(file,'utf8').trim();
  if(!TOKEN.test(value))deny('token_format');
  return crypto.createHash('sha256').update(value).digest('hex');
}
function keyHash(file){
  safeArg(file);inspectParents(file);
  const st=inspectFile(file);
  if(st.size<40||st.size>4096)deny('key_size');
  const publicPem=fs.readFileSync(file,'utf8');
  // createPublicKey() also accepts a private PEM and derives its public half.
  // Never allow a wing's private signer to be accidentally stored on the broker.
  if(!/^-----BEGIN PUBLIC KEY-----\r?\n/.test(publicPem))deny('private_key_at_broker_forbidden');
  let key;
  try{key=crypto.createPublicKey(publicPem);}
  catch{deny('key_invalid');}
  if(key.asymmetricKeyType!=='ed25519')deny('key_not_ed25519');
  return crypto.createHash('sha256').update(
    key.export({format:'der',type:'spki'})).digest('hex');
}
export function evaluateWingBrokerConfig({configPath}={}){
  if(Number(process.versions.node.split('.')[0])<22)deny('node22_required');
  if(typeof process.getuid==='function'&&process.getuid()===0)deny('root_forbidden');
  safeArg(configPath);inspectParents(configPath);
  if(inspectFile(configPath,true).size>16000)deny('config_oversized');
  let config;
  try{config=JSON.parse(fs.readFileSync(configPath,'utf8'));}
  catch{deny('config_invalid');}
  if(!config||typeof config!=='object'||Array.isArray(config)||
     (config.port!==undefined&&config.port!==8851))deny('config_or_port_invalid');
  if(!Array.isArray(config.wings)||config.wings.length!==2||
     config.wings.filter(w=>w?.wing==='harbor').length!==1||
     config.wings.filter(w=>w?.wing==='fallen').length!==1)
    deny('exact_two_wings_required');
  safeArg(config.stateDir);inspectParents(path.join(config.stateDir,'reserved'));
  inspectDir(config.stateDir);
  if(fs.existsSync(path.join(config.stateDir,'packages')))
    inspectDir(path.join(config.stateDir,'packages'));
  const allTokens=[],ackKeys=[];
  for(const wing of config.wings){
    const allowed=wing.wing==='harbor'?'fallen':'harbor';
    if(!Array.isArray(wing.allowedDestinations)||
       wing.allowedDestinations.length!==1||
       wing.allowedDestinations[0]!==allowed)
      deny('wing_scope_invalid');
    allTokens.push(tokenHash(wing.sendTokenFile),tokenHash(wing.receiveTokenFile));
    ackKeys.push(keyHash(wing.ackVerifyPublicKeyFile));
  }
  if(new Set(allTokens).size!==4)deny('reused_bearer_token');
  if(new Set(ackKeys).size!==2)deny('reused_ack_identity');
  return {schema:BROKER_PREFLIGHT_SCHEMA,mode:'DRY_RUN',
    readyForOwnedLocalActivation:true,host:'127.0.0.1',port:8851,
    scope:'harbor<->fallen only',wingCount:2,separateTokens:4,
    distinctEd25519ReceiverAckKeys:true,privateStorageChecked:true,
    unitInstalled:false,publicRouteActivatedByThisTool:false,externalTlsObserved:false,
    sourceIdentityAttested:false,customerAssetsTransferred:false,
    passportAdmissionGranted:false,customerPreviewAuthorized:false};
}
export function renderWingBrokerUnit({nodeBin,sourceRoot,configPath}={}){
  for(const v of [nodeBin,sourceRoot,configPath])safeArg(v);
  return [
    '[Unit]','Description=Evercraft Wing Courier private ciphertext broker',
    'After=network-online.target','Wants=network-online.target','',
    '[Service]','Type=simple','WorkingDirectory='+sourceRoot,
    'ExecStart='+nodeBin+' '+sourceRoot+'/systemia/wing-courier/broker.mjs '+configPath,
    'Restart=on-failure','RestartSec=10','NoNewPrivileges=true',
    'PrivateTmp=true','UMask=0077','Environment=NODE_ENV=production','',
    '[Install]','WantedBy=default.target',''
  ].join('\n');
}
function ctl(...args){
  const r=spawnSync('systemctl',['--user',...args],
    {encoding:'utf8',timeout:15000});
  if(r.status!==0||r.error)deny('systemd_'+args[0]+'_failed');
}
async function localRequest({port,path:route,method='GET',body}){
  const buf=body?Buffer.from(JSON.stringify(body)):undefined;
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:route,method,timeout:3000,
      headers:buf?{'content-type':'application/json','content-length':buf.length}:{}},res=>{
        let str='',size=0;
        res.on('data',data=>{size+=data.length;if(size>2048){
          req.destroy(Error('wing_local_probe_response_too_large'));return;
        }str+=data.toString('utf8');});
        res.on('end',()=>resolve({status:res.statusCode,body:str}));
      });
    req.on('error',reject);req.on('timeout',()=>req.destroy(Error('wing_local_probe_timeout')));
    req.end(buf);
  });
}
/** Tests actual loopback HTTP contract, never sends a bearer token or customer data.
 * Does not independently prove broker process identity or external TLS routing.
 */
export async function observeLocalWingBroker({port=8851}={}){
  if(!Number.isInteger(port)||port<1||port>65535)deny('probe_port_invalid');
  const a=await localRequest({port,path:'/health'});
  let h;
  try{h=JSON.parse(a.body);}catch{deny('health_not_json');}
  if(a.status!==200||h.schema!=='evercraft.wing-broker.health.v1'||
     h.ok!==true||h.plaintextPresent!==false||
     h.productionAuthority!==false||h.externalDeliveryAuthority!==false)
    deny('health_contract_invalid');
  const b=await localRequest({port,path:'/v1/envelopes',method:'POST',
    body:{id:'a'.repeat(32),fromWing:'harbor',toWing:'fallen',
      ciphertextSha256:'b'.repeat(64),bytes:100}});
  let error;
  try{error=JSON.parse(b.body).error;}catch{deny('auth_denial_not_json');}
  if(b.status!==403||error!=='wing_broker_not_authorized')
    deny('unauthenticated_send_not_denied');
  const c=await localRequest({port,path:'/v1/inbox?wing=fallen'});
  if(c.status!==403)deny('unauthenticated_receive_not_denied');
  return {schema:BROKER_LOCAL_PROBE_SCHEMA,loopbackObserved:true,
    unauthenticatedSendDenied:true,unauthenticatedReceiveDenied:true,
    liveProcessIdentityNotCryptographicallyAttested:true,
    externalTlsObserved:false,publicRouteActivatedByThisTool:false,realCustomerTransfer:false};
}
export async function installWingBroker({
  configPath,activate=false,confirmOwnedHost=false,home=os.homedir(),
}={}){
  const pre=evaluateWingBrokerConfig({configPath});
  if(!fs.existsSync(path.join(root,'systemia/wing-courier/broker.mjs')))
    deny('broker_source_missing');
  if(!activate)return pre;
  if(!confirmOwnedHost)deny('confirm_owned_host_required');
  inspectDir(home,false);
  const dir=path.join(home,'.config/systemd/user');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  inspectParents(path.join(dir,'unit.marker'));
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink())deny('unit_dir_invalid');
  const unit=path.join(dir,SERVICE);
  if(fs.existsSync(unit))deny('existing_unit_requires_independent_review');
  const body=renderWingBrokerUnit({nodeBin:process.execPath,sourceRoot:root,configPath});
  fs.writeFileSync(unit,body,{flag:'wx',mode:0o600});
  ctl('daemon-reload');ctl('enable','--now',SERVICE);
  ctl('is-active','--quiet',SERVICE);
  const local=await observeLocalWingBroker();
  return {...pre,...local,mode:'ACTIVATED_LOCAL_USER_SERVICE',
    unitInstalled:true,externalTlsObserved:false,publicRouteActivatedByThisTool:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const index=process.argv.indexOf('--config');
  const configPath=index>=0?process.argv[index+1]:null;
  installWingBroker({configPath,activate:process.argv.includes('--activate'),
    confirmOwnedHost:process.argv.includes('--confirm-owned-host')})
    .then(r=>console.log(JSON.stringify(r)))
    .catch(e=>{console.error('HOLD:',e?.message||'broker_bootstrap_failed');process.exitCode=2;});
}
