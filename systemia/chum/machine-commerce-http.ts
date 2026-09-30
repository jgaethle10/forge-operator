import type { Express, Request, Response } from 'express';
import {
  executeOwnedMachineCommerceRpc,
  resolveOwnedMachineCommerceAction,
  getOwnedMachineOffer
} from './machine-commerce-owned.mjs';

function requestOrigin(req:Request){
  const configured=String(process.env.CHUM_PUBLIC_ORIGIN || process.env.PUBLIC_BASE_URL || '').trim();
  if(configured){
    try{
      const url=new URL(configured);
      if(url.protocol==='https:') return url.origin;
    }catch{}
  }
  const host=String(req.get('host')||'').trim();
  if(!host) return '';
  const proto=String(req.get('x-forwarded-proto')||req.protocol||'https').split(',')[0].trim();
  try{ return new URL(`${proto}://${host}`).origin; }catch{ return ''; }
}
function htmlEscape(value:unknown){
  return String(value??'').replace(/[&<>"']/g,(char)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[char] as string));
}

export function registerOwnedMachineCommerce(
  app:Express,
  {loadCatalog}:{loadCatalog:()=>any}
){
  app.get('/api/machine-commerce',(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    try{
      const action=String(req.query.action || 'offer');
      const publicId=String(req.query.public_id || '');
      const intent=String(req.query.intent || '');
      const limit=Number(req.query.limit || 5);
      const data=resolveOwnedMachineCommerceAction(action,publicId,loadCatalog(),{
        origin:requestOrigin(req),intent,limit
      });
      res.json(data);
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      res.status(message==='machine_commerce_offer_not_found'?404:400).json({ok:false,error:message});
    }
  });

  app.post('/api/machine-commerce',(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    try{
      const body=req.body || {};
      const data=resolveOwnedMachineCommerceAction(
        body.action || 'match_offer',
        body.public_id || '',
        loadCatalog(),
        {origin:requestOrigin(req),intent:body.intent || '',limit:Number(body.limit || 5)}
      );
      res.json(data);
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      res.status(message==='machine_commerce_offer_not_found'?404:400).json({ok:false,error:message});
    }
  });

  app.get('/mcp/machine-commerce',(req:Request,res:Response)=>{
    if(String(req.query.action||'')!=='health'){
      res.status(405).json({ok:false,error:'Use MCP Streamable HTTP POST or ?action=health.'});
      return;
    }
    res.setHeader('Cache-Control','no-store');
    res.json({
      ok:true,
      service:'Evercraft Machine Commerce',
      server:'evercraft-machine-commerce-owned',
      version:'2.0.0-yard',
      runtime:'yard_evercraft_compute',
      transport:'Streamable HTTP',
      tools:['match_offer','get_offer','prepare_human_handoff'],
      read_only:true,
      checkout_authority:false,
      payment_authority:false,
      provider_execution_authority:false,
      base44_transport_enabled:false
    });
  });

  app.post('/mcp/machine-commerce',async(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    const response=await executeOwnedMachineCommerceRpc(req.body,loadCatalog(),{origin:requestOrigin(req)});
    if(response===null){ res.status(202).end(); return; }
    res.type('application/json').json(response);
  });

  app.get('/buy/:publicId',(req:Request,res:Response)=>{
    res.setHeader('Cache-Control','no-store');
    const offer=getOwnedMachineOffer(loadCatalog(),String(req.params.publicId||''),{origin:requestOrigin(req)});
    if(!offer){
      res.status(404).type('text/plain').send('Unknown Evercraft offer.');
      return;
    }
    const price=offer.pricing ? htmlEscape(offer.pricing) : 'Pricing shown in the published offer';
    const publicLink=offer.public_url
      ? `<p><a href="${htmlEscape(offer.public_url)}" rel="noopener noreferrer">Open verified non-legacy product surface</a></p>`
      : '<p><strong>Execution route:</strong> held while the product-specific owned purchase/runtime path is migrated and verified.</p>';
    res.type('text/html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(offer.name)} | Evercraft</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0c0d10;color:#f7f8fb;margin:0}main{max-width:760px;margin:auto;padding:56px 22px}p{color:#c7ccd6;line-height:1.65}.card{border:1px solid #2a2f3a;border-radius:20px;padding:22px;background:#12141a}a{color:#8fd3ff}</style></head><body><main><p>EVERCRAFT HUMAN REVIEW</p><h1>${htmlEscape(offer.name)}</h1><div class="card"><p>${htmlEscape(offer.problem)}</p><p><strong>Published pricing:</strong> ${price}</p><p><strong>Commercial state:</strong> ${htmlEscape(offer.commercial_state)}</p><p>${htmlEscape(offer.confirmation || 'Any irreversible action requires explicit human confirmation.')}</p>${publicLink}<p>No checkout, payment, obligation, access, or paid work was created by opening this page.</p></div></main></body></html>`);
  });
}
