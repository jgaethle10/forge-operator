// HUDSON public source cache. No request may block the shared Fabric event loop
// while Git history is scanned. Failures keep the prior timestamp, never
// fabricate freshness. All public content is admitted by the upstream source.
export function createHudsonFeedCache({
  loadSnapshot,
  now=()=>Date.now(),
  intervalMs=60_000,
  waitMs=1_500,
}={}){
  if(typeof loadSnapshot!=='function')throw new TypeError('hudson_cache_loader_required');
  if(!Number.isFinite(intervalMs)||intervalMs<1000)throw new TypeError('hudson_cache_interval_invalid');
  if(!Number.isFinite(waitMs)||waitMs<0||waitMs>5000)throw new TypeError('hudson_cache_wait_invalid');
  let snapshot=null, lastAttemptAt=-Infinity, pending=null;
  function maybeRefresh(){
    const time=now();
    if(pending || time-lastAttemptAt<intervalMs)return pending;
    lastAttemptAt=time;
    pending=Promise.resolve().then(loadSnapshot)
      .then(value=>{
        if(!value||value.schema!=='evercraft.hudson.public-activity.v1'||value.status!=='connected')throw Error('untrusted_public_snapshot');
        snapshot=value;
      })
      .catch(()=>{/* Keep the old receipt with its old timestamp; never relabel as fresh. */})
      .finally(()=>{pending=null});
    return pending;
  }
  async function read(){
    const work=maybeRefresh();
    if(!snapshot&&work&&waitMs>0){
      let timer;
      try{
        await Promise.race([work,new Promise(resolve=>{timer=setTimeout(resolve,waitMs)})]);
      }finally{clearTimeout(timer)}
    }
    return snapshot;
  }
  return Object.freeze({read});
}
