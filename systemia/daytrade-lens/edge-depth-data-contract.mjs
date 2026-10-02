function clean(value){
  return String(value??"").trim();
}
function finite(value){
  if(value===null||value===undefined||value==="") return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function iso(value){
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toISOString():null;
}
function normalizeLevel(row){
  const price=finite(row?.price??row?.p);
  const size=finite(row?.size??row?.s??row?.qty);
  if(!(price>0)||!(size>=0)) return null;
  return {
    price,
    size,
    exchange:clean(row?.exchange??row?.x)||null,
    order_count:Number.isFinite(finite(row?.order_count))
      ?finite(row.order_count)
      :null,
  };
}
function sum(values){
  return values.reduce((a,b)=>a+b,0);
}

export function normalizeMultiLevelDepthSnapshot(raw,{
  minimum_levels_per_side=2,
}={}){
  const provider=clean(raw?.provider);
  const scope=clean(raw?.scope);
  const symbol=clean(raw?.symbol).toUpperCase();
  const timestamp=iso(raw?.timestamp??raw?.t);
  const bids=(raw?.bids||[])
    .map(normalizeLevel)
    .filter(Boolean)
    .sort((a,b)=>b.price-a.price);
  const asks=(raw?.asks||[])
    .map(normalizeLevel)
    .filter(Boolean)
    .sort((a,b)=>a.price-b.price);

  if(!provider||!scope||!symbol||!timestamp){
    throw new Error("edge_depth_contract_provenance_required");
  }
  if(
    bids.length<Number(minimum_levels_per_side) ||
    asks.length<Number(minimum_levels_per_side)
  ){
    throw new Error("edge_depth_contract_multi_level_required");
  }
  if(asks[0].price<bids[0].price){
    throw new Error("edge_depth_contract_crossed_book");
  }

  return {
    schema:"evercraft.daytrade.multi-level-depth-snapshot.v1",
    provider,
    scope,
    symbol,
    timestamp,
    bids,
    asks,
    bid_level_count:bids.length,
    ask_level_count:asks.length,
    top_bid:bids[0],
    top_ask:asks[0],
    top_spread:asks[0].price-bids[0].price,
    measurement_state:"observed_multi_level_book",
    top_of_book_only:false,
    full_market_depth_claimed:false,
    missing_is_zero:false,
  };
}

export function summarizeMultiLevelDepth(snapshot,{
  levels=5,
}={}){
  if(snapshot?.measurement_state!=="observed_multi_level_book"){
    throw new Error("edge_depth_contract_observed_snapshot_required");
  }
  const n=Math.max(1,Number(levels||1));
  const bids=snapshot.bids.slice(0,n);
  const asks=snapshot.asks.slice(0,n);
  const bidSize=sum(bids.map((row)=>row.size));
  const askSize=sum(asks.map((row)=>row.size));
  const total=bidSize+askSize;
  return {
    schema:"evercraft.daytrade.multi-level-depth-summary.v1",
    provider:snapshot.provider,
    scope:snapshot.scope,
    symbol:snapshot.symbol,
    timestamp:snapshot.timestamp,
    requested_levels_per_side:n,
    observed_bid_levels:bids.length,
    observed_ask_levels:asks.length,
    cumulative_bid_size:bidSize,
    cumulative_ask_size:askSize,
    depth_imbalance:total>0?(bidSize-askSize)/total:null,
    measurement_state:"observed_multi_level_book",
    full_market_depth_claimed:false,
    top_of_book_substitution_used:false,
    missing_is_zero:false,
  };
}

export function buildDepthDataContract({
  provider_connected=false,
  provider=null,
  scope=null,
  minimum_levels_per_side=2,
}={}){
  return {
    schema:"evercraft.daytrade.edge-depth-data-contract.v1",
    provider_connected:Boolean(provider_connected),
    provider:provider||null,
    scope:scope||null,
    required_snapshot_schema:{
      provider:"nonempty string",
      scope:"provider/feed/book scope",
      symbol:"ticker",
      timestamp:"RFC3339",
      bids:"array<{price>0,size>=0,exchange?,order_count?}>",
      asks:"array<{price>0,size>=0,exchange?,order_count?}>",
      minimum_levels_per_side:Number(minimum_levels_per_side),
    },
    evidence_states:{
      top_of_book:"observed_top_of_book_only",
      multi_level_book:"observed_multi_level_book",
      unavailable:"unavailable_not_observed",
    },
    current_measurement_state:provider_connected
      ?"provider_connected_depth_not_yet_observed"
      :"unavailable_not_observed",
    invariants:{
      nbbo_top_of_book_must_not_satisfy_multi_level_depth:true,
      multi_level_snapshot_requires_both_sides:true,
      depth_imbalance_requires_observed_sizes:true,
      top_of_book_imbalance_must_not_be_labeled_depth_imbalance:true,
      observed_multi_level_book_must_not_be_called_full_market_depth_without_provider_proof:true,
      missing_is_never_zero:true,
    },
    live_trade_authority:false,
  };
}
