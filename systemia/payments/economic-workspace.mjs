const POSITION_TYPES=Object.freeze([
  'external_balance_observation',
  'evercraft_receivable',
  'evercraft_payable',
  'planning_bucket'
]);

function money(value){
  const n=Number(value);
  if(!Number.isFinite(n)) throw new Error('finite amount required');
  return Math.round(n*100)/100;
}

export function normalizeEconomicPosition(position={}){
  if(!POSITION_TYPES.includes(position.type)) throw new Error('unsupported economic position type');
  if(!position.position_key) throw new Error('position_key required');
  if(!position.currency) throw new Error('currency required');

  const base={
    schema:'evercraft.financial.economic-position.v1',
    position_key:String(position.position_key),
    type:position.type,
    currency:String(position.currency).toUpperCase(),
    amount:money(position.amount||0),
    custody_state:'no_evercraft_custody_claim'
  };

  if(position.type==='external_balance_observation'){
    if(!position.evidence_ref) throw new Error('external balance observation requires evidence_ref');
    if(!position.as_of) throw new Error('external balance observation requires as_of');
    return {
      ...base,
      evidence_state:'observed_external',
      evidence_ref:String(position.evidence_ref),
      as_of:String(position.as_of),
      contributes_to_observed_cash:true,
      contributes_to_projected_cash:false
    };
  }

  if(position.type==='evercraft_receivable'){
    if(!position.payment_order_ref) throw new Error('receivable requires payment_order_ref');
    return {
      ...base,
      evidence_state:'expected_receivable',
      payment_order_ref:String(position.payment_order_ref),
      contributes_to_observed_cash:false,
      contributes_to_projected_cash:true
    };
  }

  if(position.type==='evercraft_payable'){
    return {
      ...base,
      evidence_state:'expected_payable',
      obligation_ref:position.obligation_ref?String(position.obligation_ref):null,
      contributes_to_observed_cash:false,
      contributes_to_projected_cash:true
    };
  }

  return {
    ...base,
    evidence_state:'planning_only',
    target_ref:position.target_ref?String(position.target_ref):null,
    contributes_to_observed_cash:false,
    contributes_to_projected_cash:false,
    boundary:'Planning buckets do not represent segregated, stored, deposited, or custodied funds.'
  };
}

export function buildEconomicWorkspace({workspaceKey,entityKey,positions=[]}={}){
  if(!workspaceKey) throw new Error('workspaceKey required');
  if(!entityKey) throw new Error('entityKey required');
  const normalized=positions.map(normalizeEconomicPosition);
  const currencies=[...new Set(normalized.map(x=>x.currency))];

  const byCurrency=Object.fromEntries(currencies.map(currency=>{
    const rows=normalized.filter(x=>x.currency===currency);
    const observedCash=rows.filter(x=>x.type==='external_balance_observation')
      .reduce((sum,x)=>sum+x.amount,0);
    const receivables=rows.filter(x=>x.type==='evercraft_receivable')
      .reduce((sum,x)=>sum+x.amount,0);
    const payables=rows.filter(x=>x.type==='evercraft_payable')
      .reduce((sum,x)=>sum+x.amount,0);
    return [currency,{
      observed_external_cash:money(observedCash),
      expected_receivables:money(receivables),
      expected_payables:money(payables),
      projected_after_known_receivables_and_payables:money(observedCash+receivables-payables)
    }];
  }));

  return {
    schema:'evercraft.financial.economic-workspace.v1',
    workspace_key:String(workspaceKey),
    entity_key:String(entityKey),
    custody_state:'no_evercraft_custody_claim',
    positions:normalized,
    summary_by_currency:byCurrency,
    boundary:'Observed external balances, expected receivables/payables, and planning buckets remain distinct. This workspace does not create a deposit account or assert custody of funds.'
  };
}
