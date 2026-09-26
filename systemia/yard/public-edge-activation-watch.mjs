import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { YardOperator } from './operator.mjs';
import { PublicEdgeController } from './public-edge-controller.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

export class PublicEdgeActivationWatcher {
  constructor({
    stateDir,
    releaseRef,
    discovery={},
    allocatorTokenProvider=async()=>({allocatorToken:'',allocatorTokens:{}}),
    edge={mode:'wildcard_https'},
    specialist={},
    requiredPlacementLabels=['public-edge'],
    requestedHostname='evercraft-specialists',
    endpointTimeoutMs=1000,
    leaseTtlMs=3600000,
    renewEveryMs=1800000,
    intervalMs=300000,
    allowLoopbackProof=false,
  }={}){
    if(!stateDir) throw new Error('public_edge_watch_state_dir_required');
    if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||''))){
      throw new Error('release_ref_must_be_immutable_sha');
    }
    if(typeof allocatorTokenProvider!=='function'){
      throw new Error('allocator_token_provider_required');
    }

    this.stateDir=path.resolve(stateDir);
    this.releaseRef=String(releaseRef);
    this.discovery=discovery;
    this.allocatorTokenProvider=allocatorTokenProvider;
    this.edge=edge;
    this.specialist=specialist;
    this.requiredPlacementLabels=requiredPlacementLabels;
    this.requestedHostname=requestedHostname;
    this.endpointTimeoutMs=Math.max(100,Number(endpointTimeoutMs||1000));
    this.leaseTtlMs=Math.max(60000,Number(leaseTtlMs||3600000));
    this.renewEveryMs=Math.max(30000,Number(renewEveryMs||1800000));
    this.intervalMs=Math.max(10000,Number(intervalMs||300000));
    this.allowLoopbackProof=Boolean(allowLoopbackProof);
    this.yard=new YardOperator({stateDir:path.join(this.stateDir,'yard')});
    this.controller=new PublicEdgeController({
      yard:this.yard,
      stateDir:path.join(this.stateDir,'controller'),
      leaseTtlMs:this.leaseTtlMs,
      renewEveryMs:this.renewEveryMs,
      intervalMs:Math.min(this.intervalMs,60000),
      allowLoopbackProof:this.allowLoopbackProof,
    });
    this.timer=null;
    this.inFlight=false;
    this.sequence=0;
    fs.mkdirSync(this.stateDir,{recursive:true,mode:0o700});
  }

  #stateFile(){
    return path.join(this.stateDir,'public-edge-activation-watch.json');
  }

  #result(action,data={}){
    const body={
      schema:'evercraft.public-edge.activation-watch-result.v1',
      sequence:++this.sequence,
      action,
      release_ref:this.releaseRef,
      founder_action_required:false,
      observed_at:new Date().toISOString(),
      ...data,
    };
    const result={...body,receipt_hash:sha(body)};
    // Never persist allocator authority or raw private endpoints in watcher state.
    const persisted={
      ...result,
      selected_endpoint:null,
      allocator_authority_persisted:false,
    };
    atomicJson(this.#stateFile(),persisted);
    return result;
  }

  async tick(){
    if(this.inFlight){
      return this.#result('hold',{reason:'watch_tick_in_flight'});
    }
    this.inFlight=true;
    try{
      const edge=this.yard.deploymentStatus(this.controller.edgeDeploymentId);
      const specialist=this.yard.deploymentStatus(this.controller.specialistDeploymentId);

      if(edge&&specialist&&edge.state==='ready'&&specialist.state==='ready'){
        try{
          const resumed=await this.controller.resume({rebindIfNeeded:true});
          return this.#result('healthy',{
            origin:resumed.origin,
            route_scope:resumed.route_scope,
            route_verified:resumed.route_verified,
            resume_receipt:resumed.receipt_hash,
          });
        }catch(error){
          return this.#result('hold',{
            reason:'existing_edge_resume_failed',
            detail:String(error?.message||error).slice(0,500),
          });
        }
      }

      let authority={allocatorToken:'',allocatorTokens:{}};
      try{
        authority=await this.allocatorTokenProvider();
      }catch(error){
        return this.#result('hold',{
          reason:'allocator_authority_provider_failed',
          detail:String(error?.message||error).slice(0,500),
        });
      }

      try{
        const provisioned=await this.controller.provisionDiscovered({
          releaseRef:this.releaseRef,
          discovery:this.discovery,
          allocatorToken:String(authority?.allocatorToken||''),
          allocatorTokens:authority?.allocatorTokens||{},
          endpointTimeoutMs:this.endpointTimeoutMs,
          requiredPlacementLabels:this.requiredPlacementLabels,
          edge:this.edge,
          specialist:this.specialist,
          requestedHostname:this.requestedHostname,
          edgeRollbackTarget:'systemia:public-edge-watch-previous',
          specialistRollbackTarget:'systemia:specialist-watch-previous',
        });

        return this.#result('activated',{
          origin:provisioned.origin,
          route_scope:provisioned.route_scope,
          route_verified:provisioned.route_verified,
          selected_node_id:provisioned.discovery?.selected_node_id||null,
          resolver_receipt:provisioned.discovery?.receipt_hash||null,
          provision_receipt:provisioned.receipt_hash,
          allocator_authority_persisted:false,
        });
      }catch(error){
        const resolution=error?.resolution||null;
        const noCapacity=/no_edge_ready_evercraft_capacity_discovered/.test(
          String(error?.message||'')
        );
        return this.#result('hold',{
          reason:noCapacity
            ? 'no_edge_ready_compute_node'
            : 'activation_failed',
          discovered_count:resolution?.discovered_count??null,
          eligible_count:resolution?.eligible_count??null,
          resolver_receipt:resolution?.receipt_hash||null,
          detail:String(error?.message||error).slice(0,500),
        });
      }
    }finally{
      this.inFlight=false;
    }
  }

  start({immediate=true}={}){
    if(this.timer) return;
    if(immediate) this.tick().catch(()=>{});
    this.timer=setInterval(()=>this.tick().catch(()=>{}),this.intervalMs);
    this.timer.unref?.();
  }

  stop(){
    if(this.timer) clearInterval(this.timer);
    this.timer=null;
  }

  async close({stopManagedRuntime=false}={}){
    this.stop();
    if(stopManagedRuntime){
      try{
        return await this.controller.close({reason:'activation_watch_shutdown'});
      }catch{}
    }
    return this.#result('stopped',{
      managed_runtime_left_running:!stopManagedRuntime,
    });
  }
}
