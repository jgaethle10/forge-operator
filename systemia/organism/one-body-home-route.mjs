/**
 * One-Body snapshot GET route for the EXISTING Evercraft Home server.
 *
 * Identity arrives only from Home's verified sessionFor() middleware.
 * Authorization is checked a second time with existing Passport,
 * not a self-issued token or a claimed subject from a request.
 * No listener, dispatch, state mutation, new identity store or public CORS.
 */
import { createOneBodySnapshotReader } from './one-body-snapshot-reader.mjs';

const ROUTE='/api/systemia/one-body/snapshot';
const safeHeaders={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store, max-age=0',
  'pragma':'no-cache',
  'vary':'Cookie',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'",
};
function respond(res,status,value,other={}) {
  res.writeHead(status,{...safeHeaders,...other});
  res.end(JSON.stringify(value));
}
const deny=()=>({
  schema:'evercraft.one-body.home-snapshot.v1',
  ok:false,state:'not_authorized',
});
const unavailable=()=>({
  schema:'evercraft.one-body.home-snapshot.v1',
  ok:false,state:'snapshot_unavailable',
});
export function createOneBodyHomeSnapshotRoute({
  getHomeSession,passportStateDir,bodyStateFile,
  loadTrustedConsumers=()=>({}),
  maxPerMinute=60,
  clock=()=>new Date(),
}={}) {
  if(typeof getHomeSession!=='function')throw Error('home_session_authority_required');
  if(typeof loadTrustedConsumers!=='function')throw Error('operator_trust_loader_required');
  if(typeof passportStateDir!=='string'||!passportStateDir.trim()||
     typeof bodyStateFile!=='string'||!bodyStateFile.trim())
    throw Error('one_body_snapshot_configuration_required');
  if(!Number.isSafeInteger(maxPerMinute)||maxPerMinute<1||maxPerMinute>300)
    throw Error('invalid_one_body_snapshot_rate_limit');
  const visits=new Map();
  return async function handleOneBodyHomeSnapshot(req,res) {
    const url=new URL(req.url||'/', 'http://localhost');
    if(url.pathname!==ROUTE)return false;
    if(req.method!=='GET') {
      respond(res,405,{ok:false,state:'method_not_allowed'},{allow:'GET'});
      return true;
    }
    // No query-string keys, cross-site fetches or request-body data.
    if(url.search || req.headers.origin ||
        (req.headers['sec-fetch-site'] &&
          !['same-origin','none'].includes(req.headers['sec-fetch-site'])) ||
        (req.headers['content-length'] && req.headers['content-length']!=='0') ||
        req.headers['transfer-encoding']) {
      respond(res,400,deny());
      return true;
    }
    let session;
    try {session=await getHomeSession(req);}
    catch {respond(res,401,deny());return true;}
    if(!session?.ok || session.mode!=='passport' ||
       session.authority!=='evercraft-identity+passport' ||
       typeof session.subject!=='string'||!session.subject.trim()) {
      respond(res,401,deny());
      return true;
    }
    const now=clock();
    const t=now instanceof Date?now.getTime():new Date(now).getTime();
    if(!Number.isFinite(t)) {
      respond(res,503,unavailable());return true;
    }
    // Bounded in-memory per-verified-subject read rate. Restarts reset this
    // guard; an owned edge may apply stronger distributed limits.
    const key=session.subject;
    const prior=visits.get(key);
    const slot=prior && t-prior.since<60000 && t>=prior.since
      ?prior:{since:t,count:0};
    if(slot.count>=maxPerMinute) {
      respond(res,429,{ok:false,state:'read_rate_limited'},{'retry-after':'60'});
      return true;
    }
    slot.count++;
    if(visits.size>=512 && !visits.has(key)) {
      for(const [id,record] of visits)if(t-record.since>=60000)visits.delete(id);
      if(visits.size>=512)visits.delete(visits.keys().next().value);
    }
    visits.set(key,slot);
    try {
      // Trust anchors are operator-provisioned, never received from request.
      // Load on each read so key revocation fails closed immediately.
      const trust=await loadTrustedConsumers();
      const reader=createOneBodySnapshotReader({
        passportStateDir,bodyStateFile,trustedConsumers:trust,clock,
        verifySession:async object=>object===session
          ?{subject_ref:session.subject}:null,
      });
      const result=await reader.read(session);
      if(!result.allowed){respond(res,403,deny());return true;}
      respond(res,200,{
        schema:'evercraft.one-body.home-snapshot.v1',
        ok:true,snapshot:result.snapshot,
        evidence_scope:'read_only_snapshot',
        live_runtime_verified:false,
        execution_authority_granted:false,
      });
    } catch {
      // Never leak file paths, keys, private record details, or parser errors.
      respond(res,503,unavailable());
    }
    return true;
  };
}
