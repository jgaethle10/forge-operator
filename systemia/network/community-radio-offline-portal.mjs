import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Non-actuating LOOPBACK-ONLY preview. Never an FM, EAS or live station service.
const types={wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg'};
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ref=x=>typeof x==='string'&&/^[\w][\w.:/#-]{2,199}$/.test(x);
const stamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(x)?Date.parse(x):NaN;
const digest=b=>'sha256:'+crypto.createHash('sha256').update(b).digest('hex');
function file(dir,name,limit){
  if(typeof name!=='string'||!/^[A-Za-z0-9][\w.-]{0,79}$/.test(name)||name==='..')throw Error('invalid_package_filename');
  const target=path.join(dir,name),st=fs.lstatSync(target);
  if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>limit)throw Error('invalid_package_file');
  const bytes=fs.readFileSync(target);
  if(bytes.length!==st.size)throw Error('package_changed');
  return bytes;
}
export function verifyLocalRadioPackage({dir,publicKey,now=new Date()}={}){
  if(!dir||!publicKey)throw Error('separate_station_trust_key_required');
  const time=now instanceof Date?now.getTime():Date.parse(now);
  if(!Number.isFinite(time))throw Error('unverifiable_clock');
  const root=fs.realpathSync(dir);
  const p=JSON.parse(file(root,'bulletin.json',32768).toString());
  if(p.schema!=='evercraft.broadcast.signed-local-bulletin.v1'||!p.signed_data||
    typeof p.signature!=='string'||!/^[\w+/]+={0,2}$/.test(p.signature))throw Error('invalid_signed_package');
  const key=crypto.createPublicKey(publicKey);
  if(key.asymmetricKeyType!=='ed25519')throw Error('ed25519_required');
  const signed=Buffer.from(JSON.stringify(p.signed_data)),sig=Buffer.from(p.signature,'base64');
  if(sig.length!==64||!crypto.verify(null,signed,key,sig))throw Error('station_signature_invalid');
  const b=p.signed_data,from=stamp(b.approved_at),until=stamp(b.expires_at);
  if(b.schema!=='evercraft.broadcast.local-bulletin.v1'||
    typeof b.station_name!=='string'||!b.station_name.trim()||b.station_name.length>120||
    typeof b.title!=='string'||!b.title.trim()||b.title.length>140||
    typeof b.message!=='string'||!b.message.trim()||b.message.length>4000||
    !ref(b.editor_approval_ref)||!ref(b.local_distribution_rights_ref))throw Error('station_editor_or_rights_unverified');
  if(!Number.isFinite(from)||!Number.isFinite(until)||from>time||until<=time||until-from>86400000)throw Error('bulletin_expired_or_future');
  let audio=null;
  if(b.audio_file!==undefined&&b.audio_file!==null){
    const ext=String(b.audio_file).split('.').at(-1).toLowerCase();
    if(!Object.hasOwn(types,ext)||!/^sha256:[a-f0-9]{64}$/.test(b.audio_sha256))throw Error('invalid_audio_metadata');
    const bytes=file(root,b.audio_file,10*1024*1024);
    if(digest(bytes)!==b.audio_sha256)throw Error('tampered_audio');
    audio={bytes,type:types[ext]};
  }
  return {station:b.station_name,title:b.title,message:b.message,approved:b.approved_at,expires:b.expires_at,audio,hash:digest(signed)};
}
const headers=t=>({'content-type':t,'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
function html(b){return ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>',safe(b.station),' | Local bulletin</title><style>body{background:#0b2536;color:#edf9f9;font:1rem/1.6 system-ui;margin:0}main{max-width:700px;margin:auto;padding:2rem}.notice{background:#154659;border-left:4px solid #83e2bb;padding:1rem}audio{width:100%}small{color:#c6d9df}</style><main><small>EVERCRAFT NETWORK | LOCAL EXPERIMENT ONLY</small><h1>',safe(b.station),'</h1><div class="notice">Station-signed locally cached information. Not a live FM broadcast, emergency alert or proof of current conditions. Check current official instructions.</div><h2>',safe(b.title),'</h2><p>',safe(b.message),'</p>',b.audio?'<h3>Locally cached recording</h3><audio controls preload="none" src="/audio"></audio>':'','<p>Approved: <time>',safe(b.approved),'</time><br>Expires: <time>',safe(b.expires),'</time></p><small>Expires automatically. No outside network calls. No transmitter control.</small></main></html>'].join('');}
export async function startLocalRadioPortal({dir,publicKey,now=()=>new Date(),port=0}={}){
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('invalid_port');
  verifyLocalRadioPackage({dir,publicKey,now:now()});
  const server=http.createServer((req,res)=>{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers('text/plain'),'allow':'GET, HEAD'});res.end();return;}
    if(!['/','/audio','/health'].includes(req.url)){res.writeHead(404,headers('text/plain'));res.end();return;}
    try{
      const b=verifyLocalRadioPackage({dir,publicKey,now:now()});
      let body,type='text/html; charset=utf-8',status=200,extra={};
      if(req.url==='/health'){body=Buffer.from(JSON.stringify({state:'signed_local_bulletin_only',bulletin_hash:b.hash,fm_broadcast:false,live_audio:false,public_access:false}));type='application/json';}
      else if(req.url==='/audio'){
        if(!b.audio){res.writeHead(404,headers('text/plain'));res.end();return;}
        body=b.audio.bytes;type=b.audio.type;extra['accept-ranges']='bytes';
        if(req.headers.range){
          const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range),size=body.length;
          if(!m||Number(m[1])>=size||(m[2]&&Number(m[2])<Number(m[1]))){res.writeHead(416,{...headers(type),'content-range':'bytes */'+size});res.end();return;}
          const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),size-1):size-1;
          body=body.subarray(start,end+1);status=206;extra['content-range']='bytes '+start+'-'+end+'/'+size;
        }
      }else body=Buffer.from(html(b));
      res.writeHead(status,{...headers(type),...extra,'content-length':body.length});res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(503,headers('text/plain; charset=utf-8'));res.end('Local bulletin unavailable: station signature, rights, expiry or integrity unverified.');}
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',()=>{server.off('error',no);ok();});});
  return {server,origin:'http://127.0.0.1:'+server.address().port};
}
