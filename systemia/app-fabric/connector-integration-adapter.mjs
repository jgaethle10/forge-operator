function clean(value){ return String(value??'').trim(); }
function key(value,field){
  const text=clean(value);
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(text)) throw new Error(field+'_invalid');
  return text;
}

export const POLAR_LEGACY_OPERATION_ALIASES=Object.freeze({
  'get:/v1/products':'products.list',
  'post:/v1/products':'products.create',
  'post:/v1/checkouts':'checkouts.create',
  'get:/v1/checkouts/{id}':'checkouts.get',
  'get:/v1/organizations':'organizations.list'
});

export function createConnectorIntegrationInvoker({
  connectorGateway,
  coreInvoker=null,
  operationAliases={ polar: POLAR_LEGACY_OPERATION_ALIASES }
}={}){
  if(!connectorGateway||typeof connectorGateway.invoke!=='function'){
    throw new Error('connector_gateway_required');
  }

  const aliasMaps=new Map();
  for(const [provider,aliases] of Object.entries(operationAliases||{})){
    aliasMaps.set(String(provider).toLowerCase(),new Map(Object.entries(aliases||{})));
  }

  return async function invokeIntegration({
    appKey,
    provider,
    operation,
    body={},
    subjectRef=null,
    identity=null,
    serviceRole=false,
    request=null
  }={}){
    const providerName=key(provider,'integration_provider');
    if(providerName==='Core'){
      if(typeof coreInvoker!=='function') throw new Error('core_integration_not_configured');
      return await coreInvoker({
        appKey,
        operation:key(operation,'integration_operation'),
        body,
        subjectRef,
        identity,
        serviceRole,
        request
      });
    }

    const rawOperation=clean(operation);
    const aliases=aliasMaps.get(providerName.toLowerCase());
    let connectorOperation=rawOperation;
    if(rawOperation.includes('/')){
      connectorOperation=aliases?.get(rawOperation)||'';
      if(!connectorOperation) throw new Error('connector_legacy_operation_unmapped');
    }
    connectorOperation=key(connectorOperation,'connector_operation');

    const result=await connectorGateway.invoke(
      appKey,
      providerName,
      connectorOperation,
      body,
      {
        subject_ref:subjectRef,
        service_role:Boolean(serviceRole),
        identity:identity?{
          subject_ref:identity.subject_ref||null,
          session_id:identity.session_id||null
        }:null
      }
    );

    return {
      success:true,
      data:result,
      provider:providerName,
      operation:connectorOperation,
      legacy_operation:rawOperation===connectorOperation?null:rawOperation
    };
  };
}
