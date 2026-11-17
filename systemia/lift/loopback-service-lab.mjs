/**
 * Evercraft Lift: loopback-only HTTP harness for synthetic integration tests.
 *
 * NEVER expose through a public edge, reverse proxy, tunnel, or container port
 * mapping. No real applicants, actual documents, partners, or money.
 */
import http from 'node:http';
import {verifyEvercraftSession} from '../evercraft-home/identity.mjs';
import {openLiftPrivateIntegrationLab} from './private-integration-lab.mjs';

const TYPE='evercraft.lift.loopback-lab.v1';
const ID=/^lab_(?:case|partner|evidence)_[a-z0-9_]{3,48}$/;
const MAX_BYTES=4096;
class ProtocolError extends Error {
  constructor(status,code) {super(code);this.status=status;this.code=code;}
}
function bad(status,code){throw new ProtocolError(status,code);}
function exactKeys(object,names) {
  if(!object||typeof object!=='object'||Array.isArray(object)||
     Object.keys(object).some(k=>!names.includes(k)))bad(400,'invalid_request_shape');
}
async function jsonBody(req) {
  if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))bad(415,'json_required');
  const length=Number(req.headers['content-length']);
  if(req.headers['content-length']&&(length>MAX_BYTES||!Number.isSafeInteger(length)||length<0))
    bad(413,'body_too_large');
  const chunks=[];let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.byteLength;
    if(bytes>MAX_BYTES)bad(413,'body_too_large');
    chunks.push(chunk);
  }
  if(!bytes)bad(400,'empty_body');
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{bad(400,'invalid_json');}
}
function send(res,status,result){
  if(res.headersSent||res.destroyed)return;
  const data=Buffer.from(JSON.stringify(result));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'cross-origin-resource-policy':'same-origin',
    'referrer-policy':'no-referrer',
    'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
    'content-length':data.byteLength,
  });
  res.end(data);
}
function matchPath(pathname,pattern){
  const a=pathname.split('/').filter(Boolean);
  const b=pattern.split('/').filter(Boolean);
  if(a.length!==b.length)return null;
  const captures={};
  for(let i=0;i<a.length;i++){
    if(b[i].startsWith(':'))captures[b[i].slice(1)]=a[i];
    else if(a[i]!==b[i])return null;
  }
  return captures;
}
export async function startLiftLoopbackLab({host='127.0.0.1',port=0,identity,keyring,...options}={}){
  if(host!=='127.0.0.1'||!Number.isSafeInteger(port)||port<0||port>65535)
    bad(400,'loopback_only');
  if(!identity||typeof identity.assertSessionActive!=='function'||!keyring)
    bad(400,'trusted_identity_required');

  const service=await openLiftPrivateIntegrationLab({identity,keyring,...options});
  let server;
  try{
    server=http.createServer(async(req,res)=>{
      try{
        const boundPort=server.address()?.port;
        const expectedHost='127.0.0.1:'+boundPort;
        if(req.headers.host!==expectedHost)bad(403,'invalid_host');
        const origin=req.headers.origin;
        if(origin&&origin!=='http://'+expectedHost)bad(403,'cross_origin_denied');
        if(req.headers['sec-fetch-site']&&
          !['none','same-origin'].includes(req.headers['sec-fetch-site']))
          bad(403,'cross_site_denied');
        if(typeof req.url!=='string'||req.url.length>250||req.url.includes('?')||
           req.url.includes('#')||req.url.includes('%'))bad(400,'invalid_path');
        const pathname=req.url;
        if(pathname==='/health'&&req.method==='GET') {
          return send(res,200,{schema:TYPE,lab_only:true,real_data_allowed:false,payments_enabled:false});
        }
        if(!pathname.startsWith('/lab/'))bad(404,'not_found');
        // All mutable and "public" fixture routes still require a current
        // authenticated Identity session, never a client-supplied role.
        const header=req.headers.authorization;
        if(typeof header!=='string'||!/^Bearer [^\s]+$/.test(header))bad(401,'unauthorized');
        const token=header.slice(7);
        if(token.length>12000)bad(401,'unauthorized');
        const session=verifyEvercraftSession(token,keyring);
        identity.assertSessionActive(session);
        const identityArgs={token};
        let p;
        if(pathname==='/lab/cases'&&req.method==='POST'){
          const body=await jsonBody(req);exactKeys(body,['input','operationId']);
          return send(res,201,await service.createCase({...identityArgs,...body}));
        }
        if((p=matchPath(pathname,'/lab/cases/:id/actions'))&&req.method==='POST'){
          if(!ID.test(p.id)||!p.id.startsWith('lab_case_'))bad(404,'not_found');
          const body=await jsonBody(req);exactKeys(body,['event','expectedVersion','operationId']);
          exactKeys(body.event,['action','check','evidence_ref','title','summary','region','preview_version','reason_code']);
          return send(res,200,await service.transitionCase({...identityArgs,id:p.id,...body}));
        }
        if((p=matchPath(pathname,'/lab/cases/:id/public'))&&req.method==='GET'){
          if(!ID.test(p.id)||!p.id.startsWith('lab_case_'))bad(404,'not_found');
          return send(res,200,service.publicCase(p.id));
        }
        if(pathname==='/lab/partners'&&req.method==='POST'){
          const body=await jsonBody(req);exactKeys(body,['input','operationId']);
          return send(res,201,await service.createPartner({...identityArgs,...body}));
        }
        if((p=matchPath(pathname,'/lab/partners/:id/actions'))&&req.method==='POST'){
          if(!ID.test(p.id)||!p.id.startsWith('lab_partner_'))bad(404,'not_found');
          const body=await jsonBody(req);exactKeys(body,['event','expectedVersion','operationId']);
          exactKeys(body.event,['action','check','evidence_ref']);
          return send(res,200,await service.transitionPartner({...identityArgs,id:p.id,...body}));
        }
        if((p=matchPath(pathname,'/lab/partners/:id/directory'))&&req.method==='GET'){
          if(!ID.test(p.id)||!p.id.startsWith('lab_partner_'))bad(404,'not_found');
          return send(res,200,service.publicPartner(p.id));
        }
        if((p=matchPath(pathname,'/lab/evidence/:caseId/:evidenceId'))){
          if(!ID.test(p.caseId)||!p.caseId.startsWith('lab_case_')||
             !ID.test(p.evidenceId)||!p.evidenceId.startsWith('lab_evidence_'))
            bad(404,'not_found');
          if(req.method==='POST'){
            const body=await jsonBody(req);exactKeys(body,['fixtureCode']);
            return send(res,201,await service.putFixtureEvidence({...identityArgs,...p,...body}));
          }
          if(req.method==='GET')
            return send(res,200,await service.readFixtureEvidence({...identityArgs,...p}));
          if(req.method==='DELETE')
            return send(res,200,await service.revokeFixtureEvidence({...identityArgs,...p}));
        }
        bad(404,'not_found');
      }catch(error){
        const status=error instanceof ProtocolError?error.status:401;
        // Don't leak case IDs, scope decisions, vault paths, session claims or
        // parse stacks across a new HTTP boundary. Internal diagnostics require
        // separate operator-only facilities; never log request bodies.
        return send(res,status,{ok:false,error:error instanceof ProtocolError?error.code:'request_denied'});
      }
    });
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(port,'127.0.0.1',()=>{
        server.off('error',reject);resolve();
      });
    });
    const boundPort=server.address().port;
    return Object.freeze({
      origin:'http://127.0.0.1:'+boundPort,
      lab_only:true,payments_enabled:false,
      close:async()=>{
        await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
        await service.close();
      },
    });
  }catch(error){
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
    await service.close().catch(()=>{});
    throw error;
  }
}
