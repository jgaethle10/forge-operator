import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  createAmbientTrustRecord,
  markAmbientCandidate,
  authorizeAmbientDevice,
  heartbeatAmbientDevice,
  evaluateAmbientTrust,
  revokeAmbientDevice,
} from './ambient-device-trust.mjs';

function clean(v){return String(v??'').trim();}
function safeId(v){
  const id=clean(v).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,160);
  if(!id) throw new Error('ambient_registry_device_id_required');
  return id;
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function readJson(file){
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

export class AmbientDeviceRegistry{
  constructor({root}={}){
    if(!root) throw new Error('ambient_registry_root_required');
    this.root=path.resolve(root);
    this.devicesDir=path.join(this.root,'devices');
    this.manifestsDir=path.join(this.root,'manifests');
    fs.mkdirSync(this.devicesDir,{recursive:true,mode:0o700});
    fs.mkdirSync(this.manifestsDir,{recursive:true,mode:0o700});
  }

  trustFile(deviceId){return path.join(this.devicesDir,safeId(deviceId)+'.json');}
  manifestFile(deviceId){return path.join(this.manifestsDir,safeId(deviceId)+'.json');}

  get(deviceId){
    const file=this.trustFile(deviceId);
    return fs.existsSync(file)?readJson(file):null;
  }

  manifest(deviceId){
    const file=this.manifestFile(deviceId);
    return fs.existsSync(file)?readJson(file):null;
  }

  observe({device_id,observed_at=new Date().toISOString()}={}){
    const current=this.get(device_id);
    if(current) return current;
    const record=createAmbientTrustRecord({device_id,observed_at});
    atomicJson(this.trustFile(device_id),record);
    return record;
  }

  candidate({device_id,manifest}={}){
    if(!manifest?.manifest_hash) throw new Error('ambient_registry_manifest_hash_required');
    let record=this.get(device_id)||this.observe({device_id});
    atomicJson(this.manifestFile(device_id),manifest);
    record=markAmbientCandidate(record,{
      capability_manifest_hash:manifest.manifest_hash,
      observed_at:manifest.observed_at||new Date().toISOString(),
    });
    atomicJson(this.trustFile(device_id),record);
    return record;
  }

  authorize({device_id,...args}={}){
    const current=this.get(device_id);
    if(!current) throw new Error('ambient_registry_device_unknown');
    const next=authorizeAmbientDevice(current,args);
    atomicJson(this.trustFile(device_id),next);
    return next;
  }

  heartbeat({device_id,...args}={}){
    const current=this.get(device_id);
    if(!current) throw new Error('ambient_registry_device_unknown');
    const next=heartbeatAmbientDevice(current,args);
    atomicJson(this.trustFile(device_id),next);
    return next;
  }

  revoke({device_id,...args}={}){
    const current=this.get(device_id);
    if(!current) throw new Error('ambient_registry_device_unknown');
    const next=revokeAmbientDevice(current,args);
    atomicJson(this.trustFile(device_id),next);
    return next;
  }

  list({now=new Date(),include_ineligible=true}={}){
    const rows=[];
    for(const name of fs.readdirSync(this.devicesDir).filter(x=>x.endsWith('.json')).sort()){
      const record=readJson(path.join(this.devicesDir,name));
      const evaluation=evaluateAmbientTrust(record,{now});
      if(!include_ineligible&&!evaluation.eligible) continue;
      rows.push({
        device_id:record.device_id,
        state:evaluation.state,
        eligible:evaluation.eligible,
        reason:evaluation.reason,
        heartbeat_age_ms:evaluation.heartbeat_age_ms??null,
        capability_manifest_hash:record.capability_manifest_hash,
        authorization_expires_at:record.authorization_expires_at,
        last_heartbeat_at:record.last_heartbeat_at,
        manifest:this.manifest(record.device_id),
      });
    }
    return {
      schema:'evercraft.saban.ambient-device-registry-snapshot.v1',
      root:this.root,
      device_count:rows.length,
      eligible_count:rows.filter(x=>x.eligible).length,
      rows,
      generated_at:(now instanceof Date?now:new Date(now)).toISOString(),
    };
  }
}
