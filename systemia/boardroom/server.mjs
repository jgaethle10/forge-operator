import {createServer} from 'node:http';
import {runCouncil} from './engine.mjs';
import {configuredProviders} from './providers.mjs';

const env=process.env, enabled=env.BOARDROOM_API_ENABLED==='1', access=env.BOARDROOM_ACCESS_TOKEN||'';
const providers=configuredProviders(env);
const allowedOrigins=(env.BOARDROOM_ALLOWED_ORIGINS||'http://localhost:8766').split(',').map(x=>x.trim()).filter(Boolean);
const port=Number(env.BOARDROOM_PORT||8766);
let active=0;const hits=new Map();
function json(res,code,obj,headers={}){
 res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(JSON.stringify(obj));
}
async function readBody(req){
 let size=0,text='';
 for await(const chunk of req){size+=chunk.length;if(size>12000)throw new RangeError('Request too large.');text+=chunk.toString('utf8');}
 return JSON.parse(text);
}
createServer(async(req,res)=>{
 const origin=req.headers.origin;
 const cors=origin&&allowedOrigins.includes(origin)?{'access-control-allow-origin':origin,'vary':'Origin'}:{};
 if(req.method==='GET'&&req.url==='/health')return json(res,200,{service:'evercraft-boardroom',enabled,configured_vendors:providers.length});
 if(req.url!=='/api/boardroom/run')return json(res,404,{error:'Not found.'});
 if(origin&&!allowedOrigins.includes(origin))return json(res,403,{error:'Origin not permitted.'});
 if(req.method==='OPTIONS'){res.writeHead(204,{...cors,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'POST,OPTIONS'});return res.end();}
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'},cors);
 if(!enabled||!access||providers.length<2)return json(res,503,{error:'The multi-model API is not enabled.'},cors);
 if(req.headers.authorization!=='Bearer '+access)return json(res,401,{error:'Authentication required.'},cors);
 const key=req.socket.remoteAddress||'unknown',now=Date.now();
 const recent=(hits.get(key)||[]).filter(t=>now-t<60000);recent.push(now);hits.set(key,recent);
 if(recent.length>5)return json(res,429,{error:'Request limit reached.'},cors);
 if(active>=2)return json(res,429,{error:'Capacity reached.'},cors);
 active++;
 try{const payload=await readBody(req);const data=await runCouncil({question:payload.question,providers});return json(res,200,data,cors);}
 catch(err){return json(res,err instanceof RangeError?400:400,{error:err instanceof RangeError?err.message:'Invalid request or unavailable model response.'},cors);}
 finally{active--;}
}).listen(port,'127.0.0.1',()=>{console.log('Boardroom private API listening on localhost:'+port+'; enabled='+enabled+'; vendors='+providers.length);});
