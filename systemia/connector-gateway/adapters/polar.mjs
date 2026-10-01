function clean(value){ return String(value??'').trim(); }
function required(value,field){
  const text=clean(value);
  if(!text) throw new Error(field+'_required');
  return text;
}
function httpsUrl(value,field){
  const url=new URL(required(value,field));
  if(url.protocol!=='https:'||url.username||url.password) throw new Error(field+'_invalid');
  if(url.hostname==='base44.app'||url.hostname.endsWith('.base44.app')) throw new Error(field+'_base44_forbidden');
  return url;
}
function scopeList(value){
  if(Array.isArray(value)) return [...new Set(value.map(clean).filter(Boolean))].sort();
  return [...new Set(clean(value).split(/\s+/).filter(Boolean))].sort();
}
function form(body){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(body||{})){
    if(value!=null&&String(value)!=='') params.set(key,String(value));
  }
  return params;
}
async function responseJson(response,label){
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const error=new Error(label+'_http_'+response.status);
    error.status=response.status;
    error.body=body;
    throw error;
  }
  if(body==null) throw new Error(label+'_response_invalid');
  return body;
}
function bearer(credential){
  const token=clean(credential?.access_token);
  if(!token) throw new Error('polar_access_token_required');
  return token;
}
function idValue(value,field='id'){
  const text=required(value,field);
  if(text.length>240||/[/?#]/.test(text)) throw new Error(field+'_invalid');
  return text;
}
function queryString(input={}){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(input?.queryParams||input?.query_params||{})){
    if(value==null||value==='') continue;
    if(Array.isArray(value)){
      for(const item of value) params.append(key,String(item));
    }else{
      params.set(key,String(value));
    }
  }
  const text=params.toString();
  return text?'?'+text:'';
}
function payloadOf(input={}){
  if(input?.payload&&typeof input.payload==='object'&&!Array.isArray(input.payload)) return input.payload;
  if(input?.body&&typeof input.body==='object'&&!Array.isArray(input.body)) return input.body;
  return input&&typeof input==='object'&&!Array.isArray(input)?input:{};
}

export function createPolarConnectorAdapter({
  clientId,
  clientSecretProvider,
  authorizationEndpoint,
  apiOrigin='https://api.polar.sh',
  fetchImpl=globalThis.fetch,
  refreshSkewSeconds=90
}={}){
  const oauthClientId=required(clientId,'polar_client_id');
  if(typeof clientSecretProvider!=='function') throw new Error('polar_client_secret_provider_required');
  if(typeof fetchImpl!=='function') throw new Error('polar_fetch_required');
  const authUrl=httpsUrl(authorizationEndpoint,'polar_authorization_endpoint');
  const api=httpsUrl(apiOrigin,'polar_api_origin');
  const tokenUrl=new URL('/v1/oauth2/token',api);
  const revokeUrl=new URL('/v1/oauth2/revoke',api);
  const userInfoUrl=new URL('/v1/oauth2/userinfo',api);
  const skew=Math.max(30,Math.min(600,Number(refreshSkewSeconds)||90));

  async function clientSecret(){
    return required(await clientSecretProvider(),'polar_client_secret');
  }

  async function tokenRequest(body,label){
    const response=await fetchImpl(tokenUrl,{
      method:'POST',
      headers:{
        accept:'application/json',
        'content-type':'application/x-www-form-urlencoded'
      },
      body:form({
        ...body,
        client_id:oauthClientId,
        client_secret:await clientSecret()
      })
    });
    const data=await responseJson(response,label);
    const access=required(data.access_token,'polar_access_token');
    const expiresIn=Math.max(1,Number(data.expires_in||3600));
    return {
      access_token:access,
      token_type:clean(data.token_type)||'Bearer',
      refresh_token:clean(data.refresh_token)||null,
      id_token:clean(data.id_token)||null,
      scope:clean(data.scope),
      expires_in:expiresIn,
      expires_at:new Date(Date.now()+expiresIn*1000).toISOString()
    };
  }

  async function userInfo(accessToken){
    const response=await fetchImpl(userInfoUrl,{
      headers:{authorization:'Bearer '+required(accessToken,'polar_access_token'),accept:'application/json'}
    });
    return await responseJson(response,'polar_userinfo');
  }

  async function refreshCredential(credential){
    const refreshToken=clean(credential?.refresh_token);
    if(!refreshToken) throw new Error('polar_refresh_token_required');
    const next=await tokenRequest({
      grant_type:'refresh_token',
      refresh_token:refreshToken
    },'polar_refresh');
    if(!next.refresh_token) next.refresh_token=refreshToken;
    return next;
  }

  function expiring(credential){
    const expiresAt=Date.parse(clean(credential?.expires_at));
    if(!Number.isFinite(expiresAt)) return false;
    return expiresAt<=Date.now()+skew*1000;
  }

  async function ensureCredential(credential){
    if(!credential||typeof credential!=='object') throw new Error('polar_credential_invalid');
    if(expiring(credential)&&clean(credential.refresh_token)){
      const updated=await refreshCredential(credential);
      return {credential:updated,updated:true};
    }
    bearer(credential);
    return {credential,updated:false};
  }

  async function apiRequest(credential,operation,input={}){
    const access=bearer(credential);
    let method='GET';
    let pathname='';
    let body=null;

    switch(operation){
      case 'products.list':
        pathname='/v1/products'+queryString(input);
        break;
      case 'products.create':
        method='POST';
        pathname='/v1/products';
        body=payloadOf(input);
        break;
      case 'organizations.list':
        pathname='/v1/organizations'+queryString(input);
        break;
      case 'checkouts.create':
        method='POST';
        pathname='/v1/checkouts';
        body=payloadOf(input);
        break;
      case 'checkouts.get':{
        const id=idValue(input?.pathParams?.id??input?.path_params?.id??input?.id,'checkout_id');
        pathname='/v1/checkouts/'+encodeURIComponent(id);
        break;
      }
      case 'oauth.userinfo':
        pathname='/v1/oauth2/userinfo';
        break;
      default:
        throw new Error('polar_operation_unsupported');
    }

    const headers={authorization:'Bearer '+access,accept:'application/json'};
    if(body!=null) headers['content-type']='application/json';
    const response=await fetchImpl(new URL(pathname,api),{
      method,
      headers,
      body:body==null?undefined:JSON.stringify(body)
    });
    return await responseJson(response,'polar_api');
  }

  return {
    provider:'polar',
    current_api_contract:'polar_rest_v1',
    authorization_endpoint_explicit:true,

    async buildAuthorizationUrl({state,redirectUri,scopes=[]}={}){
      const redirect=httpsUrl(redirectUri,'polar_redirect_uri');
      const url=new URL(authUrl);
      url.searchParams.set('response_type','code');
      url.searchParams.set('client_id',oauthClientId);
      url.searchParams.set('redirect_uri',redirect.toString());
      url.searchParams.set('state',required(state,'polar_oauth_state'));
      const requested=scopeList(scopes);
      if(requested.length) url.searchParams.set('scope',requested.join(' '));
      return url.toString();
    },

    async exchangeAuthorization({code,redirectUri}={}){
      const redirect=httpsUrl(redirectUri,'polar_redirect_uri');
      const credential=await tokenRequest({
        grant_type:'authorization_code',
        code:required(code,'polar_authorization_code'),
        redirect_uri:redirect.toString()
      },'polar_token');
      const info=await userInfo(credential.access_token);
      return {
        credential,
        provider_account_ref:required(info.sub,'polar_account_ref'),
        scopes:scopeList(credential.scope)
      };
    },

    async invoke({operation,input={},credential}={}){
      let current=await ensureCredential(credential);
      let result;
      try{
        result=await apiRequest(current.credential,operation,input);
      }catch(error){
        if(
          Number(error?.status)===401 &&
          clean(current.credential?.refresh_token)
        ){
          current={credential:await refreshCredential(current.credential),updated:true};
          result=await apiRequest(current.credential,operation,input);
        }else{
          throw error;
        }
      }
      if(current.updated){
        return {
          schema:'evercraft.connector.adapter-result.v1',
          result,
          credential_update:current.credential,
          scopes:scopeList(current.credential.scope)
        };
      }
      return result;
    },

    async revoke({credential}={}){
      const token=clean(credential?.refresh_token)||bearer(credential);
      const response=await fetchImpl(revokeUrl,{
        method:'POST',
        headers:{
          accept:'application/json',
          'content-type':'application/x-www-form-urlencoded'
        },
        body:form({
          token,
          token_type_hint:clean(credential?.refresh_token)?'refresh_token':'access_token',
          client_id:oauthClientId,
          client_secret:await clientSecret()
        })
      });
      await responseJson(response,'polar_revoke');
      return {revoked:true};
    }
  };
}
