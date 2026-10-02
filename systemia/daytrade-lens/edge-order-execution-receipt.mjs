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
function activityOrderId(row){
  return clean(
    row?.order_id ??
    row?.details?.order_id
  )||null;
}
function activitySide(row){
  return clean(
    row?.side ??
    row?.details?.side
  ).toLowerCase()||null;
}
function activitySymbol(row){
  return clean(
    row?.symbol ??
    row?.details?.symbol
  ).toUpperCase()||null;
}
function activityType(row){
  return clean(
    row?.type ??
    row?.details?.execution_type
  ).toLowerCase()||null;
}
function activityTime(row){
  return iso(
    row?.transaction_time ??
    row?.executed_at ??
    row?.timestamp
  );
}
function activityId(row){
  return clean(
    row?.id ??
    row?.ref_id ??
    row?.execution_id
  )||null;
}
function activityCumQty(row){
  return finite(
    row?.cum_qty ??
    row?.details?.cum_qty
  );
}
function activityLeavesQty(row){
  return finite(
    row?.leaves_qty ??
    row?.details?.leaves_qty
  );
}

export function normalizeAlpacaFillActivity(row){
  const activityClass=clean(row?.activity_type).toUpperCase();
  const executionType=activityType(row);
  const orderId=activityOrderId(row);
  const qty=finite(row?.qty);
  const price=finite(row?.price);
  const executedAt=activityTime(row);
  const side=activitySide(row);
  const symbol=activitySymbol(row);
  const id=activityId(row);

  const tradeActivity=
    activityClass==="FILL" ||
    activityClass==="TRD" ||
    executionType==="fill" ||
    executionType==="partial_fill";
  if(!tradeActivity) return null;
  if(!["fill","partial_fill"].includes(executionType)) return null;
  if(!orderId||!id||!executedAt) return null;
  if(!["buy","sell"].includes(side)) return null;
  if(!symbol||!(qty>0)||!(price>0)) return null;

  return {
    schema:"evercraft.daytrade.order-fill-activity.v1",
    activity_id:id,
    order_id:orderId,
    symbol,
    side,
    execution_type:executionType,
    executed_at:executedAt,
    qty,
    price,
    cum_qty:activityCumQty(row),
    leaves_qty:activityLeavesQty(row),
    source_activity_type:activityClass||null,
    source_status:clean(row?.status)||null,
  };
}

function sideShortfallBps(side,fillPrice,referencePrice){
  if(!(fillPrice>0)||!(referencePrice>0)) return null;
  if(side==="buy"){
    return ((fillPrice-referencePrice)/referencePrice)*10000;
  }
  if(side==="sell"){
    return ((referencePrice-fillPrice)/referencePrice)*10000;
  }
  return null;
}

export function buildOrderExecutionReceipt({
  order_id,
  requested_qty,
  decision_time,
  submitted_time=null,
  decision_reference_price,
  expected_side=null,
  expected_symbol=null,
  activities=[],
  terminal_status=null,
  terminal_time=null,
  terminal_reference_price=null,
  known_fees_usd=null,
}={}){
  const orderId=clean(order_id);
  const requested=finite(requested_qty);
  const decisionAt=iso(decision_time);
  const submittedAt=submitted_time?iso(submitted_time):null;
  const reference=finite(decision_reference_price);
  const terminalAt=terminal_time?iso(terminal_time):null;
  const terminalReference=finite(terminal_reference_price);
  const knownFees=finite(known_fees_usd);
  if(!orderId) throw new Error("edge_order_receipt_order_id_required");
  if(!(requested>0)) throw new Error("edge_order_receipt_requested_qty_required");
  if(!decisionAt) throw new Error("edge_order_receipt_decision_time_required");
  if(!(reference>0)) throw new Error("edge_order_receipt_reference_price_required");

  const normalized=[];
  const seen=new Set();
  for(const raw of activities||[]){
    const row=normalizeAlpacaFillActivity(raw);
    if(!row||row.order_id!==orderId) continue;
    if(seen.has(row.activity_id)) continue;
    seen.add(row.activity_id);
    normalized.push(row);
  }
  normalized.sort((a,b)=>new Date(a.executed_at)-new Date(b.executed_at));

  const sides=[...new Set(normalized.map((row)=>row.side))];
  const symbols=[...new Set(normalized.map((row)=>row.symbol))];
  if(sides.length>1) throw new Error("edge_order_receipt_mixed_side");
  if(symbols.length>1) throw new Error("edge_order_receipt_mixed_symbol");
  const side=sides[0]||clean(expected_side).toLowerCase()||null;
  const symbol=symbols[0]||clean(expected_symbol).toUpperCase()||null;
  if(side&&!["buy","sell"].includes(side)){
    throw new Error("edge_order_receipt_side_invalid");
  }
  if(expected_side && side!==clean(expected_side).toLowerCase()){
    throw new Error("edge_order_receipt_side_mismatch");
  }
  if(expected_symbol && symbol!==clean(expected_symbol).toUpperCase()){
    throw new Error("edge_order_receipt_symbol_mismatch");
  }

  const filledQty=normalized.reduce((sum,row)=>sum+row.qty,0);
  const executedNotional=normalized.reduce(
    (sum,row)=>sum+row.qty*row.price,
    0
  );
  const vwap=filledQty>0?executedNotional/filledQty:null;
  const first=normalized[0]||null;
  const last=normalized[normalized.length-1]||null;
  const lastCum=last?.cum_qty;
  const lastLeaves=last?.leaves_qty;
  const finalFillObserved=normalized.some((row)=>row.execution_type==="fill");
  const completeByQuantity=
    filledQty>=requested-1e-12 ||
    (Number.isFinite(lastCum)&&lastCum>=requested-1e-12) ||
    (Number.isFinite(lastLeaves)&&lastLeaves<=1e-12);
  const complete=finalFillObserved||completeByQuantity;
  const unfilledQty=Math.max(0,requested-filledQty);
  const decisionMs=new Date(decisionAt).getTime();
  const submittedMs=submittedAt?new Date(submittedAt).getTime():null;
  const firstMs=first?new Date(first.executed_at).getTime():null;
  const lastMs=last?new Date(last.executed_at).getTime():null;
  const terminalMs=terminalAt?new Date(terminalAt).getTime():null;
  const executedShortfallUsd=side
    ?normalized.reduce((sum,row)=>{
        const perShare=side==="buy"
          ?row.price-reference
          :reference-row.price;
        return sum+row.qty*perShare;
      },0)
    :null;
  const terminalOpportunityEvidence=
    unfilledQty>0 &&
    Number.isFinite(terminalReference) &&
    terminalReference>0 &&
    Number.isFinite(terminalMs);
  const unfilledOpportunityCostUsd=
    terminalOpportunityEvidence && side
      ?unfilledQty*(
          side==="buy"
            ?terminalReference-reference
            :reference-terminalReference
        )
      :unfilledQty===0
        ?0
        :null;
  const grossTotalShortfallUsd=
    Number.isFinite(executedShortfallUsd) &&
    Number.isFinite(unfilledOpportunityCostUsd)
      ?executedShortfallUsd+unfilledOpportunityCostUsd
      :null;
  const requestedDecisionNotional=requested*reference;
  const grossTotalShortfallBps=
    Number.isFinite(grossTotalShortfallUsd) && requestedDecisionNotional>0
      ?grossTotalShortfallUsd/requestedDecisionNotional*10000
      :null;
  const totalWithKnownFeesUsd=
    Number.isFinite(grossTotalShortfallUsd) && Number.isFinite(knownFees)
      ?grossTotalShortfallUsd+knownFees
      :null;

  return {
    schema:"evercraft.daytrade.order-execution-receipt.v1",
    order_id:orderId,
    symbol,
    side,
    requested_qty:requested,
    filled_qty:filledQty,
    unfilled_qty:unfilledQty,
    fill_fraction:requested>0?Math.min(1,filledQty/requested):null,
    fill_event_count:normalized.length,
    partial_fill_event_count:normalized.filter(
      (row)=>row.execution_type==="partial_fill"
    ).length,
    final_fill_event_observed:finalFillObserved,
    execution_complete:complete,
    terminal_status:clean(terminal_status)||null,
    terminal_time:terminalAt,
    decision_time:decisionAt,
    submitted_time:submittedAt,
    first_fill_time:first?.executed_at||null,
    last_fill_time:last?.executed_at||null,
    decision_to_first_fill_ms:
      Number.isFinite(firstMs)?firstMs-decisionMs:null,
    submission_to_first_fill_ms:
      Number.isFinite(firstMs)&&Number.isFinite(submittedMs)
        ?firstMs-submittedMs
        :null,
    decision_to_last_fill_ms:
      Number.isFinite(lastMs)?lastMs-decisionMs:null,
    submission_to_last_fill_ms:
      Number.isFinite(lastMs)&&Number.isFinite(submittedMs)
        ?lastMs-submittedMs
        :null,
    executed_notional_usd:executedNotional,
    vwap_fill_price:vwap,
    decision_reference_price:reference,
    executed_share_implementation_shortfall_bps:
      side&&Number.isFinite(vwap)
        ?sideShortfallBps(side,vwap,reference)
        :null,
    executed_share_implementation_shortfall_usd:executedShortfallUsd,
    terminal_reference_price:
      Number.isFinite(terminalReference)?terminalReference:null,
    unfilled_remainder_opportunity_cost_usd:unfilledOpportunityCostUsd,
    gross_total_implementation_shortfall_usd:grossTotalShortfallUsd,
    gross_total_implementation_shortfall_bps:grossTotalShortfallBps,
    known_fees_usd:Number.isFinite(knownFees)?knownFees:null,
    total_implementation_shortfall_with_known_fees_usd:
      totalWithKnownFeesUsd,
    last_reported_cum_qty:Number.isFinite(lastCum)?lastCum:null,
    last_reported_leaves_qty:Number.isFinite(lastLeaves)?lastLeaves:null,
    execution_state:normalized.length===0
      ?"NO_FILL_ACTIVITY_OBSERVED"
      :complete
        ?"FULL_FILL_ACTIVITY_OBSERVED"
        :"PARTIAL_FILL_ACTIVITY_OBSERVED",
    unfilled_remainder_opportunity_cost_measured:
      unfilledQty===0 || terminalOpportunityEvidence,
    total_implementation_shortfall_complete:
      normalized.length>0 &&
      (complete || terminalOpportunityEvidence) &&
      Number.isFinite(grossTotalShortfallUsd),
    fill_activities:normalized,
    interpretation:{
      fill_activity_is_order_specific_execution_evidence:true,
      executed_share_shortfall_uses_vwap_vs_decision_reference:true,
      buy_positive_shortfall_is_worse_execution:true,
      sell_positive_shortfall_is_worse_execution:true,
      incomplete_order_requires_terminal_reference_for_opportunity_cost:true,
      terminal_reference_is_never_inferred:true,
      commission_and_fees_not_included_unless_separately_supplied:true,
      lifecycle_nonfill_events_not_inferred_from_fill_activity:true,
      no_order_submission_capability:true,
      no_cancel_replace_capability:true,
    },
    read_only_evidence_parser:true,
    autonomous_order_authority:false,
    live_trade_authority:false,
  };
}

export function buildOrderExecutionReceipts(specs=[]){
  return (specs||[]).map((spec)=>buildOrderExecutionReceipt(spec));
}
