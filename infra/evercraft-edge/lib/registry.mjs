import fs from "node:fs";
export function readRegistry(path){
  const raw=fs.readFileSync(path,"utf8");
  const services=[];
  let current=null;
  for(const line of raw.split(/\r?\n/)){
    let m=line.match(/^  - service_id:\s*(.+)$/);
    if(m){current={service_id:m[1].trim(),endpoints:[]};services.push(current);continue;}
    m=line.match(/^    logical_uri:\s*(.+)$/); if(m&&current) current.logical_uri=m[1].trim();
    m=line.match(/^    tenant:\s*(.+)$/); if(m&&current) current.tenant=m[1].trim();
  }
  return {services};
}
export function validateRegistry(reg){
  const ids=new Set(), uris=new Set();
  for(const s of reg.services||[]){
    if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(s.service_id||"")) throw new Error("invalid service_id");
    if(!String(s.logical_uri||"").startsWith("evercraft://")) throw new Error("invalid logical_uri");
    if(ids.has(s.service_id)||uris.has(s.logical_uri)) throw new Error("duplicate identity");
    ids.add(s.service_id); uris.add(s.logical_uri);
  }
  return true;
}
