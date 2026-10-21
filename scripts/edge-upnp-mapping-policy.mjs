/**
 * IGD SOAP may wrap string values in XML CDATA.
 * Remove only a complete CDATA wrapper, never substrings or ordinary text:
 * labels remain subject to the same byte-for-byte ownership comparison.
 */
export function decodeUpnpCdata(value){
  if(value===null||value===undefined) return null;
  const raw=String(value).trim();
  const cdata=/^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
  return cdata ? cdata[1].trim() : raw;
}

/**
 * Conservative UPnP control policy for known Evercraft ports.
 * Readback always precedes writes. A foreign or unverified owner is never changed.
 */
export function planUpnpMapping(existing,expected,{missing=false,renewHealthy=false}={}){
  if(!expected||typeof expected!=='object'||!expected.desc||
     !Number.isInteger(expected.external)||expected.external<1||expected.external>65535||
     !Number.isInteger(expected.internal)||expected.internal<1||expected.internal>65535||
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
    lease_seconds:/^(0|[1-9][0-9]*)$/.test(String(existing.lease_seconds??''))
      ? Number(existing.lease_seconds) : null,
  };
  if(observed.description!==expected.desc){
    return {action:'hold',state:'foreign_mapping',ownership_verified:false,observed};
  }
  if(observed.host!==expected.host||observed.internal!==expected.internal||
      !['1','true'].includes(observed.enabled.toLowerCase())){
    return {action:'hold',state:'owned_mapping_drift',ownership_verified:true,observed};
  }
  // A verified, healthy, finite-lease mapping needs bounded renewal before
  // the router expires it. A zero lease is conventionally indefinite.
  // Routers vary in whether the readback is total or remaining duration,
  // so the resident timer also periodically requests renewal.
  if(observed.lease_seconds!==0 && (
    renewHealthy===true ||
    (Number.isFinite(observed.lease_seconds) && observed.lease_seconds>0 && observed.lease_seconds<=3600)
  )){
    return {action:'renew',state:'owned_lease_renewal_due',ownership_verified:true,observed};
  }
  return {action:'keep',state:'already_correct',ownership_verified:true,observed};
}

export function parseUpnpErrorCode(xml){
  const code=String(xml||'').match(/<(?:[\w.-]+:)?errorCode\s*>\s*(\d+)\s*<\/(?:[\w.-]+:)?errorCode\s*>/i)?.[1]||null;
  return code;
}
