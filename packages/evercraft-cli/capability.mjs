import crypto from 'node:crypto';

const allowedKeys=['schema','id','name','summary','publisher','integration','evidence','commercial_model'];
const effects=new Set(['read_only','writes_data','external_action','financial']);
const transports=new Set(['mcp-stdio','mcp-streamable-http','openapi','a2a']);
const authModes=new Set(['none','api_key','oauth2','other']);
const commercialModels=new Set(['free','paid_proposed','contract_only']);

function textField(v,label,min=1,max=1000){
  if(typeof v!=='string'||v.trim().length<min||v.length>max)throw Error(label+' must be '+min+'-'+max+' characters.');
  return v.trim();
}
function httpsUrl(v,label){
  textField(v,label,8,1500);
  let url;
  try{url=new URL(v);}catch{throw Error(label+' must be an HTTPS URL.');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw Error(label+' must be an HTTPS URL without credentials.');
  return url.href;
}
function object(v,label,keys){
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error(label+' must be an object.');
  const unexpected=Object.keys(v).filter(k=>!keys.includes(k));
  if(unexpected.length)throw Error(label+' has unrecognized field(s): '+unexpected.join(', '));
  return v;
}
export function validateCapabilitySubmission(data){
  object(data,'Capability manifest',allowedKeys);
  if(data.schema!=='evercraft.operator-capability.v0')throw Error('Unsupported capability manifest schema.');
  const id=textField(data.id,'id',5,90);
  if(!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id))throw Error('id must be lowercase dotted publisher namespace, e.g. example.math.');
  const publisher=object(data.publisher,'publisher',['name','website']);
  const integration=object(data.integration,'integration',['transport','authentication','side_effects']);
  const evidence=object(data.evidence,'evidence',['documentation_url','source_url']);
  const pub={
    name:textField(publisher.name,'publisher.name',2,140),
    website:httpsUrl(publisher.website,'publisher.website')
  };
  if(!transports.has(integration.transport))throw Error('Unsupported integration.transport.');
  if(!authModes.has(integration.authentication))throw Error('Unsupported integration.authentication.');
  if(!effects.has(integration.side_effects))throw Error('Unsupported integration.side_effects.');
  if(!commercialModels.has(data.commercial_model))throw Error('Unsupported commercial_model; paid listings are proposals only.');
  const clean={
    schema:data.schema,id,name:textField(data.name,'name',3,120),
    summary:textField(data.summary,'summary',15,1000),publisher:pub,
    integration:{transport:integration.transport,authentication:integration.authentication,side_effects:integration.side_effects},
    evidence:{documentation_url:httpsUrl(evidence.documentation_url,'evidence.documentation_url'),
      source_url:httpsUrl(evidence.source_url,'evidence.source_url')},
    commercial_model:data.commercial_model
  };
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(clean)).digest('hex');
  return {
    manifest:clean,
    fingerprint_sha256:fingerprint,
    state:'candidate_unverified',
    human_review_required:true,
    execution_granted:false,
    publication_granted:false,
    commerce_granted:false,
    note:'Local syntax validation only. Hash is not a publisher signature or a security review.'
  };
}
