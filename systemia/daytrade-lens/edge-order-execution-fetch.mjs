import {
  buildOrderExecutionReceipt,
  normalizeAlpacaFillActivity,
} from "./edge-order-execution-receipt.mjs";

function clean(value){
  return String(value??"").trim();
}

export async function fetchAlpacaOrderFillActivities({
  order_id,
  key,
  secret,
  base_url="https://paper-api.alpaca.markets",
  fetchImpl=fetch,
  page_size=100,
  max_pages=100,
}={}){
  const orderId=clean(order_id);
  if(!orderId) throw new Error("edge_order_fill_fetch_order_id_required");
  if(!key||!secret) throw new Error("edge_order_fill_fetch_credentials_required");
  const base=clean(base_url).replace(/\/$/,"");
  if(!/^https:\/\//.test(base)){
    throw new Error("edge_order_fill_fetch_https_required");
  }
  const out=[];
  const seenActivityIds=new Set();
  let pageToken=null;

  for(let page=0;page<Number(max_pages);page++){
    const url=new URL(base+"/v2/account/activities/FILL");
    url.searchParams.set("order_id",orderId);
    url.searchParams.set("direction","asc");
    url.searchParams.set(
      "page_size",
      String(Math.max(1,Math.min(100,Number(page_size||100))))
    );
    if(pageToken) url.searchParams.set("page_token",pageToken);

    const response=await fetchImpl(url,{
      method:"GET",
      headers:{
        "APCA-API-KEY-ID":key,
        "APCA-API-SECRET-KEY":secret,
        accept:"application/json",
      },
    });
    if(!response.ok){
      const error=new Error(
        `edge_order_fill_fetch_http_${response.status}`
      );
      error.status=response.status;
      throw error;
    }
    const payload=await response.json();
    const rows=Array.isArray(payload)?payload:[];
    if(rows.length===0) break;

    for(const raw of rows){
      const normalized=normalizeAlpacaFillActivity(raw);
      if(!normalized||normalized.order_id!==orderId) continue;
      if(seenActivityIds.has(normalized.activity_id)) continue;
      seenActivityIds.add(normalized.activity_id);
      out.push(raw);
    }

    if(rows.length<Math.max(1,Math.min(100,Number(page_size||100)))) break;
    const lastId=clean(rows[rows.length-1]?.id);
    if(!lastId) break;
    if(lastId===pageToken){
      throw new Error("edge_order_fill_fetch_pagination_loop");
    }
    pageToken=lastId;
  }

  return {
    schema:"evercraft.daytrade.order-fill-fetch.v1",
    order_id:orderId,
    activity_count:out.length,
    activities:out,
    explicit_order_id_required:true,
    account_wide_sweep_performed:false,
    read_only_http_method:"GET",
    order_submission_supported:false,
    order_cancel_supported:false,
    order_replace_supported:false,
    live_trade_authority:false,
  };
}

export async function fetchAndBuildOrderExecutionReceipt({
  order,
  key,
  secret,
  base_url="https://paper-api.alpaca.markets",
  fetchImpl=fetch,
  page_size=100,
  max_pages=100,
}={}){
  if(!order||!clean(order.order_id)){
    throw new Error("edge_order_receipt_order_spec_required");
  }
  const fetched=await fetchAlpacaOrderFillActivities({
    order_id:order.order_id,
    key,
    secret,
    base_url,
    fetchImpl,
    page_size,
    max_pages,
  });
  const receipt=buildOrderExecutionReceipt({
    ...order,
    activities:fetched.activities,
  });
  return {
    schema:"evercraft.daytrade.order-execution-fetch-receipt.v1",
    fetch:fetched,
    receipt,
    read_only:true,
    live_trade_authority:false,
  };
}
