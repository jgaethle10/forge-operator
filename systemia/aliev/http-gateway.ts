import type { Express, Request, Response } from 'express';
import {
  alievCapabilities,
  alievOffers,
  prepareAliEVHandoff,
  analyzeAliEVSite,
  executeAliEVMcp,
  ALIEV_OFFERS
} from './public-edge.mjs';

function requestOrigin(req:Request){
  const configured=String(process.env.CHUM_PUBLIC_ORIGIN||process.env.PUBLIC_BASE_URL||'').trim();
  if(configured){ try{ const u=new URL(configured); if(u.protocol==='https:') return u.origin; }catch{} }
  const host=String(req.get('host')||'').trim();
  const proto=String(req.get('x-forwarded-proto')||req.protocol||'').split(',')[0].trim();
  if(!host||!['http','https'].includes(proto)) return '';
  try{ return new URL(proto+'://'+host).origin; }catch{ return ''; }
}
function html(value:unknown){ return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c] as string)); }
function sourceUrl(){ return String(process.env.ALIEV_PUBLIC_SCREEN_SOURCE_URL||process.env.ALIEV_YARD_SOURCE_URL||'').trim(); }

export function registerAliEVGateway(app:Express){
  app.get('/api/aliev',(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    const view=String(req.query.view||'capabilities').toLowerCase();
    if(view==='offers'){ res.json(alievOffers()); return; }
    res.json({ok:true,...alievCapabilities({origin:requestOrigin(req),siteSourceConfigured:Boolean(sourceUrl())})});
  });

  app.post('/api/aliev',async(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    const body=req.body||{},action=String(body.action||'capabilities').trim();
    try{
      if(action==='capabilities'){ res.json({ok:true,...alievCapabilities({origin:requestOrigin(req),siteSourceConfigured:Boolean(sourceUrl())})}); return; }
      if(action==='offers'){ res.json(alievOffers()); return; }
      if(action==='create_handoff'){ res.json(prepareAliEVHandoff({offerKey:body.offer_key,address:body.address,origin:requestOrigin(req),requestId:body.request_id})); return; }
      if(action==='analyze_site'){
        if(!sourceUrl()){ res.status(503).json({ok:false,error:'aliev_owned_site_source_not_configured',state:'migration_hold',base44_fallback:false}); return; }
        const result=await analyzeAliEVSite({address:body.address,sourceUrl:sourceUrl(),systemiaMachineKey:process.env.SYSTEMIA_MACHINE_KEY||''});
        res.json({ok:true,result}); return;
      }
      if(['prepare_checkout','status'].includes(action)){
        res.status(409).json({ok:false,error:'aliev_owned_commerce_execution_not_verified',state:'migration_hold',base44_fallback:false});
        return;
      }
      res.status(400).json({ok:false,error:'unsupported_action',supported_actions:['capabilities','offers','create_handoff','analyze_site']});
    }catch(error){
      res.status(502).json({ok:false,error:error instanceof Error?error.message:String(error),base44_fallback:false});
    }
  });

  app.get('/mcp/aliev',(req:Request,res:Response)=>{
    if(String(req.query.action||'')!=='health'){ res.status(405).json({ok:false,error:'Use MCP Streamable HTTP POST or ?action=health.'}); return; }
    res.setHeader('Cache-Control','no-store');
    res.json({
      ok:true,service:'AliEV',server:'aliev',version:'2.0.0-yard',runtime:'yard_evercraft_compute',
      tools:['get_aliev_capabilities','get_aliev_offers','prepare_paid_handoff','analyze_ev_site'],
      site_source_configured:Boolean(sourceUrl()),checkout_authority:false,payment_authority:false,base44_fallback:false
    });
  });

  app.post('/mcp/aliev',async(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    const response=await executeAliEVMcp(req.body,{
      origin:requestOrigin(req),
      sourceUrl:sourceUrl(),
      systemiaMachineKey:process.env.SYSTEMIA_MACHINE_KEY||''
    });
    if(response===null){ res.status(202).end(); return; }
    res.type('application/json').json(response);
  });

  app.get('/aliev/review',(req:Request,res:Response)=>{
    const key=String(req.query.offer||'').trim();
    const address=String(req.query.address||'').trim();
    const offer=ALIEV_OFFERS.find((row)=>row.key===key);
    if(!offer){ res.status(404).type('text/plain').send('Unknown AliEV offer.'); return; }
    res.setHeader('Cache-Control','no-store');
    res.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(offer.name)} | AliEV</title><style>body{font-family:system-ui;background:#0b0a09;color:#fffaf7;margin:0}main{max-width:760px;margin:auto;padding:56px 24px}.card{border:1px solid #463925;border-radius:24px;padding:22px;background:#14110e}.muted{color:#c5b9b4}.price{font-size:36px;font-weight:800;color:#f0c675}</style></head><body><main><p>ALIEV HUMAN REVIEW</p><h1>${html(offer.name)}</h1><div class="card"><div class="price">$${Number(offer.amount_usd).toLocaleString()}${offer.billing_mode==='subscription'?'/mo':''}</div><p class="muted">${html(offer.scope)}</p>${address?`<p><strong>Site:</strong> ${html(address)}</p>`:''}<p>No checkout, payment, entitlement, report access or outreach was created by this page.</p><p><strong>Checkout:</strong> held until the owned Evercraft commerce execution rail is independently verified.</p></div></main></body></html>`);
  });
}
