// Loopback-only Evercraft Ship transfer candidate. A TLS-authenticated proxy and
// recipient identity are NOT configured by this module. Never publish as-is.
import {createServer} from 'node:http';
const ID=/^[a-f0-9]{32}$/;
const allowed=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);
async function smallJson(req){
 const chunks=[];let size=0;
 for await(const part of req){size+=part.length;if(size>8192)throw Error('metadata_too_large');chunks.push(part);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
 catch{throw Error('invalid_json');}
}
function json(res,status,obj) {
 if(res.headersSent)return;
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'"});
 res.end(JSON.stringify(obj));
}
export function createOwnedShipTransferServer(gate) {
 if(!gate||typeof gate.requireOperator!=='function')throw Error('gate_required');
 return createServer(async(req,res)=>{
  const remote=req.socket?.remoteAddress;
  if(!allowed.has(remote)){json(res,403,{error:'loopback_only'});return;}
  const pathname=new URL(req.url||'/', 'http://localhost').pathname;
  const match=pathname.match(/^\/v1\/ship\/transfers(?:\/([a-f0-9]{32}))?(?:\/(upload|grant|revoke|status|download))?$/);
  if(!match){json(res,404,{error:'not_found'});return;}
  const [,id,action]=match;
  try{
   const isDownload=req.method==='GET'&&id&&action==='download';
   if(!isDownload)gate.requireOperator(req.headers['x-evercraft-operator-key']);
   if(req.method==='POST'&&!id&&!action){
    const body=await smallJson(req);
    json(res,201,await gate.create(body));return;
   }
   if(!id||!ID.test(id)){json(res,404,{error:'not_found'});return;}
   if(req.method==='PUT'&&action==='upload'){
    const m=await gate.read(id);
    const len=Number(req.headers['content-length']);
    if(!Number.isSafeInteger(len)||len!==m.original_size||req.headers['transfer-encoding'])
      throw Error('upload_content_length_mismatch');
    json(res,200,await gate.upload(id,req));return;
   }
   if(req.method==='POST'&&action==='grant'){
    const body=await smallJson(req);json(res,201,await gate.issue(id,body.authorization_ref));return;
   }
   if(req.method==='POST'&&action==='revoke'){
    const body=await smallJson(req);json(res,200,await gate.revoke(id,body.authorization_ref));return;
   }
   if(req.method==='GET'&&action==='status'){
    json(res,200,await gate.status(id));return;
   }
   if(isDownload){
    const auth=req.headers.authorization||'';
    const token=/^Bearer ([0-9a-f]{64})$/.exec(auth)?.[1];
    if(!token){json(res,403,{error:'access_denied'});return;}
    const m=await gate.authorize(id,token);
    let begun=false;
    await gate.download(id,token,{
     write:async bytes=>{
      if(!begun){
       res.writeHead(200,{'content-type':'application/octet-stream',
        'content-disposition':'attachment; filename="evercraft-parcel-'+id+'.bin"',
        'content-length':String(m.original_size),'cache-control':'private, no-store',
        'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
        'content-security-policy':"default-src 'none'"});
       begun=true;
      }
      if(!res.write(bytes))await new Promise((resolve,reject)=>{
       const drain=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(Error('download_connection_closed'));};
       const cleanup=()=>{res.off('drain',drain);res.off('close',closed);};
       res.once('drain',drain);res.once('close',closed);
      });
     },
     finish:async()=>new Promise((resolve,reject)=>{
      if(!begun){res.end();resolve();return;}
      const onFinish=()=>{cleanup();resolve();};
      const onClose=()=>{cleanup();if(!res.writableFinished)reject(Error('download_response_interrupted'));};
      const cleanup=()=>{res.off('finish',onFinish);res.off('close',onClose);};
      res.once('finish',onFinish);res.once('close',onClose);res.end();
     })
    });
    return;
   }
   json(res,405,{error:'method_not_allowed'});
  }catch(e){
   // Errors intentionally do not disclose source file paths, keys or plaintext.
   if(res.headersSent){res.destroy();return;}
   const msg=String(e?.message||'');
   const isAuth=/operator_not_authorized|recipient_access_denied|grant_not_authorized|revoke_not_authorized/.test(msg);
   json(res,isAuth?403:400,{error:isAuth?'access_denied':'request_blocked'});
  }
 });
}
