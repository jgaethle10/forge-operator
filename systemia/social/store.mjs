import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

function clean(value,max=8000){ return String(value??'').trim().slice(0,max); }
function ensureDir(dir){ fs.mkdirSync(dir,{recursive:true,mode:0o750}); }
function readJson(file,fallback){ if(!fs.existsSync(file)) return fallback; return JSON.parse(fs.readFileSync(file,'utf8')); }
function atomicJson(file,value){
  ensureDir(path.dirname(file));
  const tmp=file+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600});
  fs.renameSync(tmp,file);
}
function sha(value){ return createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex'); }

async function withLock(file,fn,{attempts=120,delayMs=15}={}){
  ensureDir(path.dirname(file));
  let handle=null;
  for(let i=0;i<attempts;i+=1){
    try{ handle=fs.openSync(file,'wx',0o600); break; }
    catch(error){
      if(error?.code!=='EEXIST') throw error;
      await new Promise((resolve)=>setTimeout(resolve,delayMs));
    }
  }
  if(handle===null) throw new Error('social_state_lock_timeout');
  try{ return await fn(); }
  finally{
    try{ fs.closeSync(handle); }catch{}
    try{ fs.unlinkSync(file); }catch{}
  }
}

function normalizePackage(input={}){
  const id=clean(input.id||input.package_id||randomUUID(),180);
  const body=clean(input.body,12000);
  const status=clean(input.status||'draft',80);
  if(!id) throw new Error('content_package_id_required');
  if(!body) throw new Error('content_package_body_required');
  const allowedStatus=new Set(['draft','fact_check_required','ready_for_approval','approved','publishing','published','rejected','failed']);
  if(!allowedStatus.has(status)) throw new Error('content_package_status_invalid');
  return {
    id,
    source_asset:clean(input.source_asset,2000),
    content_type:clean(input.content_type||'text',80),
    hook:clean(input.hook,4000),
    body,
    link_url:clean(input.link_url,2000),
    media_url:clean(input.media_url,2000),
    target_page_id:clean(input.target_page_id,180),
    target_page_name:clean(input.target_page_name,300),
    status,
    approved_at:clean(input.approved_at,120)||null,
    published_url:clean(input.published_url,2000)||null,
    published_post_id:clean(input.published_post_id,400)||null,
    published_at:clean(input.published_at,120)||null,
    error_message:clean(input.error_message,2000),
    priority:clean(input.priority||'normal',80),
    publication_class:clean(input.publication_class||'story',100),
    campaign_key:clean(input.campaign_key,300)||null,
    source_package_key:clean(input.source_package_key,320)||null,
    origin_app:clean(input.origin_app,200)||null,
    freshness_state:clean(input.freshness_state||'unknown',80),
    updated_at:new Date().toISOString()
  };
}

function normalizeQueue(input={}){
  const id=clean(input.id||randomUUID(),180);
  const packageId=clean(input.package_id||input.clip_candidate_id,180);
  const platform=clean(input.platform||'facebook',80).toLowerCase();
  const status=clean(input.status||'waiting_approval',80);
  if(!packageId) throw new Error('publish_queue_package_id_required');
  if(!['facebook','linkedin','instagram','youtube','tiktok'].includes(platform)) throw new Error('publish_queue_platform_invalid');
  if(!['waiting_approval','approved','publishing','published','failed'].includes(status)) throw new Error('publish_queue_status_invalid');
  return {
    id,
    package_id:packageId,
    platform,
    status,
    scheduled_for:clean(input.scheduled_for,120)||null,
    published_url:clean(input.published_url,2000)||null,
    error_message:clean(input.error_message,2000),
    updated_at:new Date().toISOString()
  };
}

export function createSocialStore({stateDir=process.env.SOCIAL_STATE_DIR || path.join('/tmp','evercraft-social')}={}){
  const root=path.resolve(stateDir);
  const stateFile=path.join(root,'state.json');
  const lockFile=path.join(root,'state.lock');
  const empty=()=>({
    schema:'evercraft.social.store.v1',
    packages:{},
    queue:{},
    verifications:[],
    page_health:{},
    heartbeats:{},
    updated_at:null
  });
  ensureDir(root);

  function state(){ return readJson(stateFile,empty()); }
  function save(next){ next.updated_at=new Date().toISOString(); atomicJson(stateFile,next); return next; }

  async function mutate(fn){
    return withLock(lockFile,async()=>{
      const current=state();
      const result=await fn(current);
      save(current);
      return result;
    });
  }

  return {
    root,
    snapshot(){
      const current=state();
      return {
        schema:current.schema,
        package_count:Object.keys(current.packages||{}).length,
        queue_count:Object.keys(current.queue||{}).length,
        verification_count:Array.isArray(current.verifications)?current.verifications.length:0,
        page_health_count:Object.keys(current.page_health||{}).length,
        heartbeat_count:Object.keys(current.heartbeats||{}).length,
        updated_at:current.updated_at
      };
    },
    async upsertPackage(input){
      return mutate((current)=>{
        const row=normalizePackage(input);
        const prior=current.packages[row.id]||{};
        current.packages[row.id]={...prior,...row};
        return current.packages[row.id];
      });
    },
    async enqueue(input){
      return mutate((current)=>{
        const row=normalizeQueue(input);
        const prior=Object.values(current.queue).find((item)=>item.package_id===row.package_id&&item.platform===row.platform&&['waiting_approval','approved','publishing'].includes(item.status));
        if(prior) return prior;
        current.queue[row.id]=row;
        return row;
      });
    },
    getPackage(id){ return state().packages?.[clean(id,180)]||null; },
    listPublishedForPage(pageId){
      return Object.values(state().packages||{}).filter((row)=>row.target_page_id===String(pageId)&&row.status==='published'&&row.published_at);
    },
    listDue({platform='facebook',pageId='',now=new Date()}={}){
      const current=state();
      const nowMs=now.getTime();
      const rows=Object.values(current.queue||{})
        .filter((q)=>q.platform===platform&&q.status==='approved')
        .map((q)=>({queue:q,package:current.packages?.[q.package_id]||null}))
        .filter((row)=>row.package&&row.package.status==='approved'&&(!pageId||row.package.target_page_id===String(pageId)))
        .filter((row)=>{
          if(!row.queue.scheduled_for) return true;
          const when=Date.parse(row.queue.scheduled_for);
          return !Number.isFinite(when)||when<=nowMs;
        })
        .sort((a,b)=>{
          const ap={urgent:3,high:2,normal:1}[a.package.priority]||1;
          const bp={urgent:3,high:2,normal:1}[b.package.priority]||1;
          if(ap!==bp) return bp-ap;
          const as=Date.parse(a.queue.scheduled_for||'')||0;
          const bs=Date.parse(b.queue.scheduled_for||'')||0;
          return as-bs;
        });
      return rows;
    },
    async markPublishing(packageId,queueId){
      return mutate((current)=>{
        if(!current.packages?.[packageId]||!current.queue?.[queueId]) throw new Error('social_publish_row_missing');
        current.packages[packageId].status='publishing';
        current.packages[packageId].error_message='';
        current.queue[queueId].status='publishing';
        current.queue[queueId].error_message='';
        return {package:current.packages[packageId],queue:current.queue[queueId]};
      });
    },
    async markPublished({packageId,queueId,postId,permalink,publishedAt=new Date().toISOString()}){
      return mutate((current)=>{
        if(!current.packages?.[packageId]||!current.queue?.[queueId]) throw new Error('social_publish_row_missing');
        Object.assign(current.packages[packageId],{
          status:'published',published_post_id:postId,published_url:permalink||null,published_at:publishedAt,error_message:''
        });
        Object.assign(current.queue[queueId],{status:'published',published_url:permalink||null,error_message:''});
        return {package:current.packages[packageId],queue:current.queue[queueId]};
      });
    },
    async markFailed({packageId,queueId,error}){
      return mutate((current)=>{
        if(current.packages?.[packageId]) Object.assign(current.packages[packageId],{status:'failed',error_message:clean(error,2000)});
        if(current.queue?.[queueId]) Object.assign(current.queue[queueId],{status:'failed',error_message:clean(error,2000)});
        return true;
      });
    },
    async addVerification(row){
      return mutate((current)=>{
        const record={
          verification_id:clean(row.verification_id||randomUUID(),180),
          package_id:clean(row.package_id,180),
          platform:clean(row.platform,80),
          post_id:clean(row.post_id,400),
          target_page_id:clean(row.target_page_id,180),
          checked_at:clean(row.checked_at||new Date().toISOString(),120),
          status:clean(row.status,80),
          permalink:clean(row.permalink,2000)||null,
          message_match:row.message_match===true,
          observed_message_hash:clean(row.observed_message_hash,160)||null,
          expected_message_hash:clean(row.expected_message_hash,160)||null,
          failure_reason:clean(row.failure_reason,1600)||null,
          evidence_ref:'sha256:'+sha(row)
        };
        current.verifications.push(record);
        if(current.verifications.length>5000) current.verifications=current.verifications.slice(-5000);
        return record;
      });
    },
    async upsertPageHealth(pageId,patch){
      return mutate((current)=>{
        const key=clean(pageId,180);
        current.page_health[key]={...(current.page_health[key]||{}),page_id:key,...patch,updated_at:new Date().toISOString()};
        return current.page_health[key];
      });
    },
    async heartbeat(key,patch){
      return mutate((current)=>{
        const id=clean(key,180);
        current.heartbeats[id]={...(current.heartbeats[id]||{}),key:id,...patch,updated_at:new Date().toISOString()};
        return current.heartbeats[id];
      });
    }
  };
}
