import { validateHubspotV3 } from './signature.mjs';

const STATUSES = new Set([
  'no_review', 'waiting_for_checkins', 'clarification_needed',
  'decision_recorded', 'awaiting_acknowledgments', 'acknowledged',
]);
const reply=(status, code, extra={})=>({status, body:{schema:'evercraft.relay.hubspot.status.v1', code, ...extra}});
const validId=x=>typeof x==='string' && /^\d{1,18}$/.test(x) && !/^0+$/.test(x);
const count=x=>Number.isSafeInteger(x) && x>=0 && x<=10000;
const okOrigin=x=>{try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/';}catch{return false;}};

// This function does not make CRM writes, send mail or import contacts.
// The host must provide actual OAuth-backed deal authorization and tenant-scoped Relay status.
// Absence of these adapters is a hard 503, not a synthetic customer result.
export async function handleDealStatus(req, opts={}) {
  if (req.method !== 'GET') return reply(405, 'METHOD_NOT_ALLOWED');
  if (!okOrigin(opts.publicOrigin) || !opts.clientSecret || !validId(String(opts.appId||'')))
    return reply(503,'INTEGRATION_NOT_CONFIGURED');
  if (typeof req.rawUrl !== 'string' || req.rawUrl.length > 4096 || !req.rawUrl.startsWith('/v1/hubspot/deal-status'))
    return reply(404,'UNKNOWN_ROUTE');
  if (req.rawBody && req.rawBody.length) return reply(400,'BODY_NOT_ALLOWED');
  const signedUrl=opts.publicOrigin.replace(/\/$/,'')+req.rawUrl;
  if (!validateHubspotV3({method:'GET',absoluteUrl:signedUrl,rawBody:'',headers:req.headers,clientSecret:opts.clientSecret,now:opts.now??Date.now()}))
    return reply(401,'INVALID_SIGNATURE');
  let params;
  try { params=new URL(signedUrl).searchParams; } catch { return reply(400,'INVALID_REQUEST'); }
  const portalId=params.get('portalId'),appId=params.get('appId'),
    userId=params.get('userId'),dealId=params.get('dealId');
  if (![portalId,appId,userId,dealId].every(validId) || params.getAll('dealId').length!==1 ||
      params.getAll('portalId').length!==1 || params.getAll('appId').length!==1 ||
      params.getAll('userId').length!==1) return reply(400,'INVALID_CONTEXT');
  if (appId!==String(opts.appId) || !Array.isArray(opts.admittedPortals) ||
      !opts.admittedPortals.includes(portalId)) return reply(403,'NOT_ADMITTED');
  if (typeof opts.authorizeDealAccess!=='function'||typeof opts.readRelayStatus!=='function')
    return reply(503,'AUTHORIZATION_ADAPTER_NOT_CONNECTED');
  const context={portalId, appId, userId, dealId};
  try {
    if (await opts.authorizeDealAccess(context)!==true) return reply(403,'DEAL_ACCESS_NOT_CONFIRMED');
    const result=await opts.readRelayStatus(context);
    if (result==null) return reply(200,'OK',{state:'no_review'});
    if (!STATUSES.has(result.state)) return reply(503,'UNVERIFIED_RELAY_STATUS');
    const data={state:result.state};
    if (result.state==='awaiting_acknowledgments') {
      if (!count(result.expectedCount)||!count(result.acknowledgedCount)||
          result.acknowledgedCount>result.expectedCount||
          !count(result.version)||result.version<1) return reply(503,'INVALID_ACKNOWLEDGMENT_COUNTS');
      data.expectedCount=result.expectedCount;
      data.acknowledgedCount=result.acknowledgedCount;
      data.version=result.version;
    }
    return reply(200,'OK',data);
  } catch {
    return reply(503,'RELAY_DATA_UNAVAILABLE');
  }
}
