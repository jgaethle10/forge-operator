export async function executePortableWorkerOnRental({
  rental,
  localWorkerPath,
  payload,
}={}){
  if(!rental) throw new Error('golem_rental_required');
  if(!localWorkerPath) throw new Error('golem_portable_worker_path_required');
  if(!payload||payload.schema!=='evercraft.saban.portable-assignment.v1'){
    throw new Error('golem_portable_payload_invalid');
  }
  const exe=await rental.getExeUnit();
  const remoteWorker='/golem/work/evercraft-portable-worker.mjs';
  const remoteInput='/golem/work/evercraft-portable-input.json';
  await exe.uploadFile(String(localWorkerPath),remoteWorker);
  await exe.uploadJson(payload,remoteInput);
  const result=await exe.run(
    'node',
    [remoteWorker,remoteInput]
  );
  if(String(result?.result||'').toLowerCase()!=='ok'){
    throw new Error(
      'golem_portable_worker_execution_failed:'+
      String(result?.message||result?.stderr||'unknown')
    );
  }
  const stdout=String(result?.stdout||'').trim();
  if(!stdout) throw new Error('golem_portable_worker_empty_result');
  let receipt;
  try{receipt=JSON.parse(stdout);}
  catch{throw new Error('golem_portable_worker_invalid_json');}
  if(receipt?.schema!=='evercraft.saban.portable-worker-receipt.v1'){
    throw new Error('golem_portable_worker_receipt_schema_invalid');
  }
  return receipt;
}

export async function createGolemSdkClient({
  apiKey=process.env.YAGNA_APPKEY||'',
  url=process.env.YAGNA_API_BASEPATH||'http://127.0.0.1:7465',
}={}){
  if(!apiKey) throw new Error('golem_yagna_app_key_required');
  const { GolemNetwork }=await import('@golem-sdk/golem-js');
  const glm=new GolemNetwork({api:{key:apiKey,url}});
  await glm.connect();

  const collectObservable=(observable,timeoutMs)=>{
    const rows=[];
    return new Promise((resolve,reject)=>{
      let settled=false;
      let subscription=null;
      const finish=(value,error=null)=>{
        if(settled) return;
        settled=true;
        try{subscription?.unsubscribe?.();}catch{}
        clearTimeout(timer);
        if(error) reject(error); else resolve(value);
      };
      const timer=setTimeout(()=>finish(rows),Math.max(500,timeoutMs||5000));
      subscription=observable.subscribe({
        next:(value)=>rows.push(value),
        error:(error)=>finish(null,error),
        complete:()=>finish(rows),
      });
    });
  };

  return {
    schema:'evercraft.saban.golem-sdk-client.v1',
    network:glm,

    async scan({order,timeoutMs=5000}={}){
      return collectObservable(glm.market.scan(order),timeoutMs);
    },

    async rentOne({order,providerId}={}){
      const market={...(order.market||{})};
      const previous=market.offerProposalFilter;
      market.offerProposalFilter=(proposal)=>{
        const same=String(proposal?.provider?.id||'')===String(providerId||'');
        return same&&(typeof previous==='function'?previous(proposal):true);
      };
      const rental=await glm.oneOf({order:{...order,market}});
      return {rental,provider_id:String(providerId)};
    },

    async executeCommand({rental,command}={}){
      if(!rental) throw new Error('golem_rental_required');
      const exe=await rental.getExeUnit();
      return exe.run(String(command));
    },

    async executePortableWorker(args={}){
      return executePortableWorkerOnRental(args);
    },

    async release({rental}={}){
      if(!rental) return null;
      await rental.stopAndFinalize();
      return {released:true};
    },

    async close(){
      await glm.disconnect();
    },
  };
}
