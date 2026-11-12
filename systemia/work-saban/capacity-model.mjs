/* Work Saban capacity model. Pure functions; no workers are spawned by this module.
   Visual headcount is never a claim of actual provisioned execution. */
export function capacityView({requested=0,admitted=0,running=0,verified=0,failed=0,provisioned=0}={}){
  const counts={requested,admitted,running,verified,failed,provisioned};
  for(const [key,value] of Object.entries(counts)){
    if(!Number.isSafeInteger(value)||value<0)throw new RangeError(key+' must be a nonnegative safe integer');
  }
  if(admitted>requested||provisioned>admitted||running>provisioned||verified+failed>admitted){
    throw new RangeError('Inconsistent execution counts');
  }
  const pending=admitted-running-verified-failed;
  if(pending<0)throw new RangeError('Active and finished workers exceed admitted count');
  const visibleCharacters=Math.min(provisioned,24);
  const groupedWorkers=Math.max(0,provisioned-visibleCharacters);
  return Object.freeze({
    ...counts,pending,visibleCharacters,groupedWorkers,
    venue:provisioned>=1000?'warehouse':provisioned>=100?'campus':'office',
    status:provisioned===0?'not_provisioned':running>0?'executing':'allocated',
    note:'Only provisioned workers count as active capacity. Scene avatars are representational.'
  });
}
