export const SUPPORTED_TYPES=new Set(["A","AAAA","CNAME","TXT","MX","CAA","SRV","NS"]);
export function validateZone(zone){
  if(!zone?.origin?.endsWith(".")) throw new Error("origin must end in .");
  if(!Number.isInteger(zone.serial)||zone.serial<1) throw new Error("invalid serial");
  if(!zone.primary_ns?.endsWith(".")||!zone.admin?.endsWith(".")) throw new Error("SOA names must be absolute");
  if(!Array.isArray(zone.nameservers)||zone.nameservers.length<2) throw new Error("at least two authoritative nameservers required");
  for(const ns of zone.nameservers) if(!ns.endsWith(".")) throw new Error("nameserver must be absolute");
  for(const r of zone.records||[]){
    const t=String(r.type||"").toUpperCase();
    if(!SUPPORTED_TYPES.has(t)) throw new Error("unsupported RR type "+t);
    if(r.ttl!==undefined && (!Number.isInteger(r.ttl)||r.ttl<30)) throw new Error("ttl below safety floor");
    if(t==="SRV" && !Number.isInteger(r.port)) throw new Error("SRV port required");
  }
  return true;
}
export function nextSerial(previous, now=new Date()){
  const d=now.toISOString().slice(0,10).replaceAll("-","");
  const prefix=Number(d)*100;
  return Math.max(Number(previous||0)+1,prefix+1);
}
