import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import {
  createComputeAgreement,
  createComputeProposal,
  counterComputeProposal,
  agreementUsable,
  normalizeNegotiationTerms,
} from './compute-negotiation.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const token=()=>randomBytes(32).toString('hex');
const id=(prefix)=>`${prefix}-${randomBytes(8).toString('hex')}`;
const cleanId=(value)=>{
  const out=String(value||'').trim();
  if(!/^[a-zA-Z0-9._:-]{1,128}$/.test(out)) throw new Error('invalid_identifier');
  return out;
};
const bearer=(req)=>{
  const value=String(req.headers.authorization||'');
  return value.startsWith('Bearer ')?value.slice(7):'';
};
const safeEqual=(a,b)=>{
  const aa=Buffer.from(String(a||'')), bb=Buffer.from(String(b||''));
  return aa.length===bb.length&&aa.length>0&&
    (awaitImportTimingSafeEqual(aa,bb));
};
import { timingSafeEqual as awaitImportTimingSafeEqual } from 'node:crypto';

async function readJson(req,max=128*1024){
  const chunks=[]; let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>max) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  if(!chunks.length) return {};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw new Error('invalid_json');}
}
function send(res,status,body){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
  });
  res.end(data);
}
function sanitizeOffer(provider){
  return {
    offer_id:provider.offer_id,
    provider_id:provider.provider_id,
    market:'evercraft-voluntary',
    access_class:'voluntary_compute',
    endpoint:null,
    resources:structuredClone(provider.resources),
    placement:structuredClone(provider.placement),
    trust:{
      uptime_7d:provider.trust.uptime_7d,
      audited:false,
      valid_version:true,
      attested:provider.trust.attested===true,
    },
    economics:structuredClone(provider.economics),
    quote_required:true,
    metadata:{
      workload_classes:[...provider.workload_classes],
      availability_expires_at:provider.availability_expires_at,
      terms_ref:provider.terms_ref,
    },
    observed_at:provider.observed_at,
  };
}

export async function startVoluntaryComputeExchange({
  host='127.0.0.1',
  port=0,
  providerOfferTtlMs=5*60*1000,
  maxLeaseSeconds=3600,
  jobDeliveryLeaseMs=30000,
  providerAdmissionToken='',
}={}){
  const controlToken=token();
  const providers=new Map();
  const proposals=new Map();
  const agreements=new Map();
  const jobs=new Map();
  const loopbackHost=new Set(['127.0.0.1','::1','localhost']).has(String(host).toLowerCase());
  const providerAdmissionRequired=!loopbackHost;
  if(providerAdmissionRequired&&!String(providerAdmissionToken||'')){
    throw new Error('provider_admission_token_required_for_non_loopback_exchange');
  }

  const controlOk=(req)=>safeEqual(bearer(req),controlToken);
  const providerForRequest=(req,providerId)=>{
    const row=providers.get(providerId);
    if(!row||!safeEqual(bearer(req),row.token)) return null;
    return row;
  };
  const activeProviders=()=>[...providers.values()].filter((row)=>
    Date.parse(row.availability_expires_at)>Date.now()
  );

  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');

      if(req.method==='GET'&&url.pathname==='/health'){
        return send(res,200,{
          ok:true,
          schema:'evercraft.saban.voluntary-exchange-health.v1',
          provider_count:activeProviders().length,
          active_agreement_count:[...agreements.values()].filter((x)=>x.state==='active').length,
        });
      }

      if(req.method==='POST'&&url.pathname==='/v1/providers/register'){
        if(
          providerAdmissionRequired &&
          !safeEqual(
            String(req.headers['x-evercraft-provider-admission']||''),
            providerAdmissionToken
          )
        ){
          return send(res,401,{error:'provider_admission_required'});
        }
        const body=await readJson(req);
        const providerId=cleanId(body.provider_id||id('provider'));
        const workloadClasses=[...new Set(
          (body.workload_classes||[]).map(String).map((x)=>x.trim()).filter(Boolean)
        )];
        if(!workloadClasses.length) throw new Error('workload_classes_required');
        const ttl=Math.max(30_000,Math.min(providerOfferTtlMs,Number(body.offer_ttl_ms||providerOfferTtlMs)));
        const providerToken=token();
        const resources={
          cpu_units:Math.max(0.001,Number(body.resources?.cpu_units||1)),
          memory_mb:Math.max(1,Number(body.resources?.memory_mb||512)),
          storage_gb:Math.max(0,Number(body.resources?.storage_gb||0)),
          gpu_count:Math.max(0,Number(body.resources?.gpu_count||0)),
          gpu_models:Array.isArray(body.resources?.gpu_models)?body.resources.gpu_models.map(String):[],
        };
        const economics={
          zero_cost:body.economics?.zero_cost!==false,
          quoted:false,
          hourly_usd:body.economics?.hourly_usd==null?0:Math.max(0,Number(body.economics.hourly_usd)),
          total_usd:null,
          native_price:null,
        };
        const row={
          provider_id:providerId,
          offer_id:`evercraft-voluntary:${providerId}`,
          token:providerToken,
          resources,
          placement:{
            region:body.placement?.region||null,
            country:body.placement?.country||null,
            public_ingress:false,
            persistent_storage:body.placement?.persistent_storage===true,
          },
          trust:{
            uptime_7d:Math.max(0,Math.min(1,Number(body.trust?.uptime_7d||0))),
            attested:body.trust?.attested===true,
          },
          economics,
          workload_classes:workloadClasses,
          terms_ref:body.terms_ref||'evercraft-voluntary-v1',
          observed_at:new Date().toISOString(),
          availability_expires_at:new Date(Date.now()+ttl).toISOString(),
        };
        providers.set(providerId,row);
        const receiptBody={
          schema:'evercraft.saban.voluntary-provider-registration.v1',
          provider_id:providerId,
          offer_id:row.offer_id,
          workload_classes:workloadClasses,
          availability_expires_at:row.availability_expires_at,
          registered_at:row.observed_at,
        };
        return send(res,201,{
          ...receiptBody,
          provider_token:providerToken,
          receipt_hash:sha(receiptBody),
        });
      }

      if(req.method==='POST'&&url.pathname.match(/^\/v1\/providers\/[^/]+\/heartbeat$/)){
        const providerId=cleanId(decodeURIComponent(url.pathname.split('/')[3]));
        const row=providerForRequest(req,providerId);
        if(!row) return send(res,401,{error:'provider_auth_required'});
        row.observed_at=new Date().toISOString();
        row.availability_expires_at=new Date(Date.now()+providerOfferTtlMs).toISOString();
        return send(res,200,{ok:true,availability_expires_at:row.availability_expires_at});
      }

      if(req.method==='GET'&&url.pathname==='/v1/offers'){
        return send(res,200,{
          schema:'evercraft.saban.voluntary-offers.v1',
          offers:activeProviders().map(sanitizeOffer),
          observed_at:new Date().toISOString(),
        });
      }

      if(req.method==='POST'&&url.pathname==='/v1/control/proposals'){
        if(!controlOk(req)) return send(res,401,{error:'control_auth_required'});
        const body=await readJson(req);
        const providerId=cleanId(body.provider_id);
        const provider=providers.get(providerId);
        if(!provider||Date.parse(provider.availability_expires_at)<=Date.now()){
          return send(res,404,{error:'provider_unavailable'});
        }
        const terms=normalizeNegotiationTerms(body.terms||{});
        if(!provider.workload_classes.includes(terms.workload_class)){
          return send(res,409,{error:'workload_not_offered'});
        }
        const proposal=createComputeProposal({
          demand_id:body.demand_id,
          provider_id:providerId,
          market:'evercraft-voluntary',
          terms,
        });
        proposals.set(proposal.proposal_id,{
          ...proposal,
          response:null,
          origin:'saban',
        });
        return send(res,201,proposals.get(proposal.proposal_id));
      }

      const providerProposalList=url.pathname.match(/^\/v1\/providers\/([^/]+)\/proposals$/);
      if(req.method==='GET'&&providerProposalList){
        const providerId=cleanId(decodeURIComponent(providerProposalList[1]));
        if(!providerForRequest(req,providerId)) return send(res,401,{error:'provider_auth_required'});
        return send(res,200,{
          proposals:[...proposals.values()].filter((p)=>
            p.provider_id===providerId&&p.state==='pending'
          ),
        });
      }

      const providerProposalResponse=url.pathname.match(
        /^\/v1\/providers\/([^/]+)\/proposals\/([^/]+)\/respond$/
      );
      if(req.method==='POST'&&providerProposalResponse){
        const providerId=cleanId(decodeURIComponent(providerProposalResponse[1]));
        const proposalId=cleanId(decodeURIComponent(providerProposalResponse[2]));
        if(!providerForRequest(req,providerId)) return send(res,401,{error:'provider_auth_required'});
        const proposal=proposals.get(proposalId);
        if(!proposal||proposal.provider_id!==providerId) return send(res,404,{error:'proposal_not_found'});
        if(proposal.state!=='pending') return send(res,409,{error:'proposal_not_pending'});
        const body=await readJson(req);
        const decision=String(body.decision||'').toLowerCase();
        if(decision==='accept'){
          proposal.state='accepted';
          proposal.response={decision:'accept',responded_at:new Date().toISOString()};
        }else if(decision==='reject'){
          proposal.state='rejected';
          proposal.response={
            decision:'reject',
            reason:String(body.reason||'provider_rejected'),
            responded_at:new Date().toISOString(),
          };
        }else if(decision==='counter'){
          const counter=counterComputeProposal(proposal,body.counter_terms||{});
          proposal.state='countered';
          proposal.response={
            decision:'counter',
            counter_proposal_id:counter.proposal_id,
            responded_at:new Date().toISOString(),
          };
          proposals.set(counter.proposal_id,{
            ...counter,
            origin:'provider',
            response:null,
          });
        }else{
          return send(res,400,{error:'decision_must_accept_counter_or_reject'});
        }
        return send(res,200,proposal);
      }

      const controlProposal=url.pathname.match(/^\/v1\/control\/proposals\/([^/]+)$/);
      if(req.method==='GET'&&controlProposal){
        if(!controlOk(req)) return send(res,401,{error:'control_auth_required'});
        const proposal=proposals.get(cleanId(decodeURIComponent(controlProposal[1])));
        if(!proposal) return send(res,404,{error:'proposal_not_found'});
        const counter=proposal.response?.counter_proposal_id
          ? proposals.get(proposal.response.counter_proposal_id)
          : null;
        return send(res,200,{proposal,counter_proposal:counter});
      }

      const acceptCounter=url.pathname.match(/^\/v1\/control\/proposals\/([^/]+)\/accept$/);
      if(req.method==='POST'&&acceptCounter){
        if(!controlOk(req)) return send(res,401,{error:'control_auth_required'});
        const proposal=proposals.get(cleanId(decodeURIComponent(acceptCounter[1])));
        if(!proposal) return send(res,404,{error:'proposal_not_found'});
        if(proposal.origin!=='provider'||proposal.state!=='pending'){
          return send(res,409,{error:'provider_counter_not_pending'});
        }
        proposal.state='accepted';
        proposal.response={decision:'accepted_by_saban',responded_at:new Date().toISOString()};
        return send(res,200,proposal);
      }

      if(req.method==='POST'&&url.pathname==='/v1/control/agreements'){
        if(!controlOk(req)) return send(res,401,{error:'control_auth_required'});
        const body=await readJson(req);
        const proposal=proposals.get(cleanId(body.proposal_id));
        if(!proposal||proposal.state!=='accepted') return send(res,409,{error:'accepted_proposal_required'});
        const agreement=createComputeAgreement({
          proposal,
          lease_seconds:Math.min(maxLeaseSeconds,Number(body.lease_seconds||proposal.terms.duration_seconds)),
        });
        agreements.set(agreement.agreement_id,agreement);
        return send(res,201,agreement);
      }

      const providerAgreements=url.pathname.match(/^\/v1\/providers\/([^/]+)\/agreements$/);
      if(req.method==='GET'&&providerAgreements){
        const providerId=cleanId(decodeURIComponent(providerAgreements[1]));
        if(!providerForRequest(req,providerId)) return send(res,401,{error:'provider_auth_required'});
        return send(res,200,{
          agreements:[...agreements.values()].filter((a)=>a.provider_id===providerId),
        });
      }

      const createJob=url.pathname.match(/^\/v1\/control\/agreements\/([^/]+)\/jobs$/);
      if(req.method==='POST'&&createJob){
        if(!controlOk(req)) return send(res,401,{error:'control_auth_required'});
        const agreement=agreements.get(cleanId(decodeURIComponent(createJob[1])));
        const body=await readJson(req);
        const gate=agreementUsable(agreement,{workload_class:body.workload_class});
        if(!gate.ok) return send(res,409,{error:gate.reason});
        const idempotencyKey=String(body.idempotency_key||id('idem'));
        const requestIdentity=sha({
          agreement_id:agreement.agreement_id,
          workload_class:String(body.workload_class),
          idempotency_key:idempotencyKey,
          input:body.input??null,
        });
        const existing=[...jobs.values()].find((job)=>
          job.agreement_id===agreement.agreement_id &&
          job.idempotency_key===idempotencyKey
        );
        if(existing){
          if(existing.request_identity!==requestIdentity){
            return send(res,409,{error:'idempotency_key_conflict'});
          }
          return send(res,200,{
            ...existing,
            result:existing.state==='completed'?existing.result:undefined,
            deduplicated:true,
          });
        }

        const jobBody={
          schema:'evercraft.saban.voluntary-job.v1',
          job_id:id('job'),
          agreement_id:agreement.agreement_id,
          provider_id:agreement.provider_id,
          workload_class:String(body.workload_class),
          idempotency_key:idempotencyKey,
          request_identity:requestIdentity,
          input:body.input??null,
          checkpoint:body.checkpoint??null,
          state:'queued',
          delivery_id:null,
          delivery_expires_at:null,
          created_at:new Date().toISOString(),
        };
        jobs.set(jobBody.job_id,{...jobBody,result:null});
        return send(res,201,jobBody);
      }

      const nextJob=url.pathname.match(/^\/v1\/providers\/([^/]+)\/jobs\/next$/);
      if(req.method==='GET'&&nextJob){
        const providerId=cleanId(decodeURIComponent(nextJob[1]));
        if(!providerForRequest(req,providerId)) return send(res,401,{error:'provider_auth_required'});
        const nowMs=Date.now();
        for(const candidate of jobs.values()){
          if(
            candidate.provider_id===providerId &&
            candidate.state==='leased' &&
            Date.parse(candidate.delivery_expires_at||0)<=nowMs
          ){
            candidate.state='queued';
            candidate.delivery_id=null;
            candidate.delivery_expires_at=null;
          }
        }
        const job=[...jobs.values()].find((j)=>j.provider_id===providerId&&j.state==='queued');
        if(!job) return send(res,200,{job:null});
        job.state='leased';
        job.leased_at=new Date().toISOString();
        job.delivery_id=id('delivery');
        job.delivery_expires_at=new Date(
          Date.now()+Math.max(1000,Number(jobDeliveryLeaseMs||30000))
        ).toISOString();
        return send(res,200,{job:{...job,result:undefined}});
      }

      const jobResult=url.pathname.match(
        /^\/v1\/providers\/([^/]+)\/jobs\/([^/]+)\/result$/
      );
      if(req.method==='POST'&&jobResult){
        const providerId=cleanId(decodeURIComponent(jobResult[1]));
        const jobId=cleanId(decodeURIComponent(jobResult[2]));
        if(!providerForRequest(req,providerId)) return send(res,401,{error:'provider_auth_required'});
        const job=jobs.get(jobId);
        if(!job||job.provider_id!==providerId) return send(res,404,{error:'job_not_found'});
        if(job.state!=='leased') return send(res,409,{error:'job_not_leased'});
        const body=await readJson(req);
        if(
          !body.delivery_id ||
          body.delivery_id!==job.delivery_id ||
          Date.parse(job.delivery_expires_at||0)<=Date.now()
        ){
          return send(res,409,{error:'job_delivery_lease_invalid'});
        }
        job.state=body.ok===false?'failed':'completed';
        job.result=body.result??null;
        job.error=body.error??null;
        job.checkpoint=body.checkpoint??job.checkpoint;
        job.completed_at=new Date().toISOString();
        job.delivery_id=null;
        job.delivery_expires_at=null;
        const receiptBody={
          schema:'evercraft.saban.voluntary-job-result.v1',
          job_id:job.job_id,
          agreement_id:job.agreement_id,
          provider_id:job.provider_id,
          state:job.state,
          checkpoint:job.checkpoint,
          completed_at:job.completed_at,
        };
        job.result_receipt=sha(receiptBody);
        return send(res,200,{ok:true,state:job.state,receipt:job.result_receipt});
      }

      const controlJob=url.pathname.match(/^\/v1\/control\/jobs\/([^/]+)$/);
      if(req.method==='GET'&&controlJob){
        if(!controlOk(req)) return send(res,401,{error:'control_auth_required'});
        const job=jobs.get(cleanId(decodeURIComponent(controlJob[1])));
        if(!job) return send(res,404,{error:'job_not_found'});
        return send(res,200,job);
      }

      const release=url.pathname.match(/^\/v1\/control\/agreements\/([^/]+)\/release$/);
      if(req.method==='POST'&&release){
        if(!controlOk(req)) return send(res,401,{error:'control_auth_required'});
        const agreement=agreements.get(cleanId(decodeURIComponent(release[1])));
        if(!agreement) return send(res,404,{error:'agreement_not_found'});
        agreement.state='released';
        agreement.released_at=new Date().toISOString();
        const body={
          schema:'evercraft.saban.voluntary-release.v1',
          agreement_id:agreement.agreement_id,
          provider_id:agreement.provider_id,
          released_at:agreement.released_at,
        };
        return send(res,200,{...body,receipt_hash:sha(body)});
      }

      return send(res,404,{error:'not_found'});
    }catch(error){
      return send(res,400,{error:String(error?.message||error)});
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  if(!address||typeof address==='string') throw new Error('voluntary_exchange_bind_failed');
  const endpoint=`http://${host}:${address.port}`;

  return {
    schema:'evercraft.saban.voluntary-exchange.v1',
    endpoint,
    health:()=>({
      provider_count:activeProviders().length,
      provider_admission_required:providerAdmissionRequired,
      proposal_count:proposals.size,
      agreement_count:agreements.size,
      job_count:jobs.size,
    }),
    close:()=>new Promise((resolve)=>server.close(()=>resolve())),
    controlHeaders:()=>({authorization:`Bearer ${controlToken}`}),
  };
}
