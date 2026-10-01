import http from 'node:http';

const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);

export class EvercraftSystemiaCoreGateway {
  constructor({identityResolver,machineCommerceDelegate=null}={}){
    if(typeof identityResolver!=='function') throw new Error('systemia_core_identity_resolver_required');
    if(machineCommerceDelegate!==null&&typeof machineCommerceDelegate!=='function'){
      throw new Error('systemia_core_machine_commerce_delegate_invalid');
    }
    this.identityResolver=identityResolver;
    this.machineCommerceDelegate=machineCommerceDelegate;
  }

  async handle({method='GET',url='http://systemia-core.local/',body={},requestContext=null}={}){
    const verb=String(method||'GET').toUpperCase();
    if(!['GET','POST'].includes(verb)) return {status:405,body:{ok:false,error:'GET or POST required'}};

    const user=await this.identityResolver(requestContext);
    if(!user) return {status:401,body:{ok:false,error:'authentication_required'}};

    try{
      const parsed=new URL(url,'http://systemia-core.local');
      const input=body&&typeof body==='object'&&!Array.isArray(body)?body:{};
      const view=clean(input.view||parsed.searchParams.get('view')||'identity',80).toLowerCase();
      const intent=clean(input.intent||parsed.searchParams.get('intent')||'',1200);

      if(view==='identity'){
        return {status:200,body:{
          ok:true,
          service:'Systemia Core / Collider',
          role:'internal_control_plane',
          access:'authenticated',
          state:'owned_runtime_candidate',
          dependencies:{
            machine_commerce:this.machineCommerceDelegate?'owned_delegate_bound':'owned_delegate_required',
            upstream_gateway:null,
            authority_note:'Machine-commerce delegation is permitted only through an explicitly bound owned delegate. Missing binding fails closed.'
          },
          invariants:{
            no_new_legacy_runtime_builds:true,
            discovery_is_not_authorization:true,
            payment_requires_explicit_confirmation:true,
            verified_payment_required_before_revenue_or_paid_fulfillment:true,
            sensitive_and_consequential_actions_keep_existing_gates:true,
            exact_output_required_before_release_claims:true,
            human_visible_contradiction_reopens_release_gate:true,
            release_proof_uses_versioned_policies_and_expires:true,
            upstream_release_failures_reopen_downstream_dependents:true,
            bounded_machine_sweeps_may_recheck_release_integrity:true
          }
        }};
      }

      if(view==='catalog'||view==='machine-commerce'||intent){
        if(!this.machineCommerceDelegate){
          return {status:503,body:{
            ok:false,
            error:'machine_commerce_owned_upstream_not_bound',
            payment_created:false,
            external_action_taken:false
          }};
        }
        const upstream=await this.machineCommerceDelegate({intent:intent||undefined,view,requestContext});
        return {status:200,body:{
          ok:true,
          service:'Systemia Core / Collider',
          state:'owned_upstream',
          source:'owned_machine_commerce_delegate',
          migration_note:'Canonical control-plane records and machine-commerce transport are independently receipt-gated.',
          ...upstream
        }};
      }

      return {status:400,body:{ok:false,error:'unsupported_view'}};
    }catch{
      return {status:502,body:{ok:false,error:'systemia_core_bridge_unavailable'}};
    }
  }

  health(){
    return {
      schema:'evercraft.systemia-core.gateway-health.v1',
      state:'healthy',
      authenticated_access_required:true,
      machine_commerce_delegate_bound:Boolean(this.machineCommerceDelegate),
      machine_commerce_missing_fails_closed:true,
      source_platform_dependency:false,
      automatic_payment_authority:false,
      automatic_cutover_authority:false
    };
  }
}

async function readJson(req,maxBytes=1024*1024){
  const chunks=[]; let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}
function send(res,status,body){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':data.length,'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(data);
}

export async function startSystemiaCoreGateway({gateway,host='127.0.0.1',port=0}={}){
  if(!gateway||typeof gateway.handle!=='function') throw new Error('systemia_core_gateway_required');
  const server=http.createServer(async(req,res)=>{
    try{
      const body=req.method==='POST'?await readJson(req):{};
      const result=await gateway.handle({
        method:req.method,
        url:'http://systemia-core.local'+String(req.url||'/'),
        body,
        requestContext:{headers:req.headers,request:req}
      });
      send(res,result.status,result.body);
    }catch{
      send(res,502,{ok:false,error:'systemia_core_bridge_unavailable'});
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  return {
    schema:'evercraft.systemia-core.gateway-runtime.v1',
    url:'http://'+host+':'+actualPort,
    health:()=>gateway.health(),
    close:()=>new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))
  };
}
