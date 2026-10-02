export function normalizeCapabilities(provider, raw={}){
  return {
    provider,
    observed_at:new Date().toISOString(),
    compute:Boolean(raw.compute),
    storage:Boolean(raw.storage),
    network:Boolean(raw.network),
    dns:Boolean(raw.dns),
    regions:Array.isArray(raw.regions)?raw.regions:[],
    capacity:raw.capacity??null
  };
}
export function assertProvisionAuthorized(request, policy={}){
  if(request?.creates_financial_obligation && policy?.approved_budget!==true)
    throw new Error("provisioning denied: no approved budget");
  return true;
}
