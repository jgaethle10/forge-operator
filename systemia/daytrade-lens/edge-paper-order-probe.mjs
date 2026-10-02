function clean(value){
  return String(value??"").trim();
}
function finite(value){
  if(value===null||value===undefined||value==="") return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function normalizePaperBase(baseUrl){
  const raw=clean(baseUrl||"https://paper-api.alpaca.markets");
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.hostname!=="paper-api.alpaca.markets"){
    throw new Error("edge_paper_probe_paper_host_required");
  }
  if(url.username||url.password||url.port){
    throw new Error("edge_paper_probe_plain_host_required");
  }
  return "https://paper-api.alpaca.markets";
}
function validateSide(side){
  const value=clean(side).toLowerCase();
  if(!["buy","sell"].includes(value)){
    throw new Error("edge_paper_probe_side_invalid");
  }
  return value;
}
function validateSymbol(symbol){
  const value=clean(symbol).toUpperCase();
  if(!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(value)){
    throw new Error("edge_paper_probe_symbol_invalid");
  }
  return value;
}
function validateNotional(value,maxNotionalUsd){
  const notional=finite(value);
  const max=finite(maxNotionalUsd);
  if(!(notional>0)) throw new Error("edge_paper_probe_notional_required");
  if(!(max>0)) throw new Error("edge_paper_probe_max_notional_invalid");
  if(notional>max+1e-12){
    throw new Error("edge_paper_probe_notional_exceeds_cap");
  }
  return notional;
}
function clientOrderId(value){
  const supplied=clean(value);
  if(supplied) return supplied;
  return "evercraft-daytrade-paper-"+Date.now();
}

export function buildPaperOrderProbeSpec({
  symbol,
  side,
  notional_usd,
  client_order_id=null,
  base_url="https://paper-api.alpaca.markets",
  max_notional_usd=20,
}={}){
  const base=normalizePaperBase(base_url);
  const notional=validateNotional(notional_usd,max_notional_usd);
  return {
    schema:"evercraft.daytrade.paper-order-probe-spec.v1",
    base_url:base,
    symbol:validateSymbol(symbol),
    side:validateSide(side),
    notional_usd:notional,
    max_notional_usd:Number(max_notional_usd),
    client_order_id:clientOrderId(client_order_id),
    order_type:"market",
    time_in_force:"day",
    endpoint:"/v2/orders",
    paper_only:true,
    live_host_allowed:false,
    autonomous_live_order_authority:false,
    live_trade_authority:false,
  };
}

export async function submitPaperOrderProbe({
  symbol,
  side,
  notional_usd,
  client_order_id=null,
  key,
  secret,
  base_url="https://paper-api.alpaca.markets",
  max_notional_usd=20,
  dry_run=true,
  fetchImpl=fetch,
}={}){
  const spec=buildPaperOrderProbeSpec({
    symbol,
    side,
    notional_usd,
    client_order_id,
    base_url,
    max_notional_usd,
  });
  if(dry_run!==false){
    return {
      schema:"evercraft.daytrade.paper-order-probe.v1",
      mode:"dry_run",
      spec,
      submitted:false,
      paper_only:true,
      live_trade_authority:false,
    };
  }
  if(!key||!secret){
    throw new Error("edge_paper_probe_credentials_required");
  }
  const response=await fetchImpl(spec.base_url+spec.endpoint,{
    method:"POST",
    headers:{
      "APCA-API-KEY-ID":key,
      "APCA-API-SECRET-KEY":secret,
      "content-type":"application/json",
      accept:"application/json",
    },
    body:JSON.stringify({
      symbol:spec.symbol,
      notional:String(spec.notional_usd),
      side:spec.side,
      type:spec.order_type,
      time_in_force:spec.time_in_force,
      client_order_id:spec.client_order_id,
    }),
  });
  if(!response.ok){
    const error=new Error("edge_paper_probe_http_"+response.status);
    error.status=response.status;
    throw error;
  }
  const order=await response.json();
  if(!clean(order?.id)){
    throw new Error("edge_paper_probe_order_id_missing");
  }
  return {
    schema:"evercraft.daytrade.paper-order-probe.v1",
    mode:"paper_submit",
    spec,
    submitted:true,
    order_id:clean(order.id),
    provider_status:clean(order.status)||null,
    provider_symbol:clean(order.symbol).toUpperCase()||null,
    provider_side:clean(order.side).toLowerCase()||null,
    provider_submitted_at:clean(order.submitted_at)||null,
    paper_only:true,
    live_host_allowed:false,
    capital_at_risk_usd:0,
    autonomous_live_order_authority:false,
    live_trade_authority:false,
    interpretation:
      "This is a paper-broker execution plumbing probe. Paper fills can validate order lifecycle and receipt plumbing but are not evidence of live fill quality, queue position, impact or profitability.",
  };
}
