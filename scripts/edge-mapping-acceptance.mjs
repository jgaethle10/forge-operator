// Pure mapping admission: router acknowledgments cannot certify public HTTPS.
// Evaluate each protocol attempt independently against *every* requested
// production mapping, not only the successful replies or DNS mappings.
const same=(a,b)=>a?.external===b?.external&&a?.internal===b?.internal&&a?.proto===b?.proto;
export function assessMappingResult(desired,observed){
  const wants=Array.isArray(desired)?desired:[];
  const rows=Array.isArray(observed)?observed:[];
  const matches=(kind)=>{
    const required=wants.filter(x=>x?.[kind]===true);
    return required.length>0&&required.every(need=>
      rows.some(row=>
        row?.success===true &&
        same(row.requested,need) &&
        // NAT-PMP/PCP can reply with a different assigned port: reject it.
        (row.internal===undefined||row.internal===need.internal) &&
        (row.external===undefined||row.external===need.external) &&
        // In these protocols a zero granted lifetime means no live lease.
        (row.lifetime===undefined||(Number.isInteger(row.lifetime)&&row.lifetime>0))
      )
    );
  };
  return {production_ok:matches('production'),diagnostic_ok:matches('diagnostic')};
}
