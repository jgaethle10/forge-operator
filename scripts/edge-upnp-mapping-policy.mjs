/**
 * Conservative UPnP control policy for known Evercraft ports.
 * Readback always precedes writes. A foreign or unverified owner is never changed.
 */
export function planUpnpMapping(existing,expected,{missing=false}={}){
  if(!expected||typeof expected!=='object'||!expected.desc||
     !Number.isInteger(expected.external)||!Number.isInteger(expected.internal)||
     !['TCP','UDP'].includes(expected.proto)||!expected.host){
    throw new TypeError('upnp_expected_mapping_invalid');
  }
  if(missing&&existing==null) return {action:'create',state:'missing',ownership_verified:false};
  if(!existing||typeof existing!=='object') return {action:'hold',state:'readback_unavailable',ownership_verified:false};
  const observed={
    host:String(existing.host||''),
    internal:Number(existing.internal),
    description:String(existing.description||''),
    enabled:String(existing.enabled||''),
  };
  if(observed.description!==expected.desc){
    return {action:'hold',state:'foreign_mapping',ownership_verified:false,observed};
  }
  if(observed.host!==expected.host||observed.internal!==expected.internal||
      !['1','true'].includes(observed.enabled.toLowerCase())){
    return {action:'hold',state:'owned_mapping_drift',ownership_verified:true,observed};
  }
  return {action:'keep',state:'already_correct',ownership_verified:true,observed};
}

export function parseUpnpErrorCode(xml){
  const code=String(xml||'').match(/<(?:[\w.-]+:)?errorCode\s*>\s*(\d+)\s*<\/(?:[\w.-]+:)?errorCode\s*>/i)?.[1]||null;
  return code;
}
