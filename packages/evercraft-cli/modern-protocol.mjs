// Narrow, stateless MCP 2026-07-28 stdio request support.
// Kept opt-in while the existing 2025 legacy route is the default.
export const MODERN_VERSION='2026-07-28';

export function modernParams(params={}){
  if(!params||typeof params!=='object'||Array.isArray(params))throw Error('MCP modern params must be an object.');
  if(Object.hasOwn(params,'_meta'))throw Error('Reserved MCP _meta must not be overridden.');
  return {...params,_meta:{
    'io.modelcontextprotocol/protocolVersion':MODERN_VERSION,
    'io.modelcontextprotocol/clientCapabilities':{},
    'io.modelcontextprotocol/clientInfo':{name:'evercraft-operator-cli',version:'0.1.0-dev'}
  }};
}

export function checkModernDiscover(result){
  if(!result||!Array.isArray(result.supportedVersions)||!result.supportedVersions.includes(MODERN_VERSION)){
    throw Error('Server did not advertise MCP 2026-07-28. Try the default legacy mode only with trusted servers.');
  }
  if(!result.capabilities||typeof result.capabilities!=='object'||Array.isArray(result.capabilities)){
    throw Error('MCP server/discover returned no capability object.');
  }
  if(!Object.hasOwn(result.capabilities,'tools')){
    throw Error('MCP server did not advertise tool capability.');
  }
  const identity=result._meta?.['io.modelcontextprotocol/serverInfo'];
  return {protocolVersion:MODERN_VERSION,serverInfo:
    identity&&typeof identity.name==='string'&&typeof identity.version==='string'
      ? {name:identity.name,version:identity.version} : {}};
}
