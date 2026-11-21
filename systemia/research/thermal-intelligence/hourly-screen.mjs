/**
 * THERMAL-INTELLIGENCE-001 hourly energy/temperature/economics desk screen.
 * All inputs unverified; no hardware, dispatch, or network side effects.
 */
export function screenHourlyProfile(p) {
  const number = (v,name,min=0,max=Infinity) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new RangeError(`${name} must be finite between ${min} and ${max}`);
    return v;
  };
  if (!p || !Array.isArray(p.hours) || !p.hours.length || p.hours.length>8784) throw new RangeError("hours must have 1-8784 records");
  if (!["synthetic","user_supplied_unverified"].includes(p.dataStatus)) throw new TypeError("dataStatus must describe unverified data");
  const capture=number(p.captureEfficiency,"captureEfficiency",0,1);
  const delivery=number(p.deliveryEfficiency,"deliveryEfficiency",0,1);
  const delta=number(p.approachDeltaC,"approachDeltaC",0,30);
  const capex=number(p.capexUSD,"capexUSD");
  const life=number(p.projectLifeYears,"projectLifeYears",0.01,100);
  const opex=number(p.annualOpexUSD,"annualOpexUSD");
  const totals={itElectricityKWh:0,thermalHeatDeliveredKWh:0,usableHeatKWh:0,unusableHeatKWh:0,
    avoidedHeatingElectricityKWh:0,heatingValueUSD:0,revenueUSD:0,avoidedCoolingUSD:0,
    addedElectricityKWh:0,addedElectricityUSD:0,opexUSD:0,allocatedCapexUSD:0,
    netBeforeCapexUSD:0,netAfterCapexUSD:0};
  const hourly=[],hourMs=3600000;
  let previous=null;
  for(const [i,h] of p.hours.entries()){
    if(!h||typeof h!=="object")throw new TypeError(`hours[${i}] missing`);
    const stamp=h.timestamp;
    const ms=Date.parse(stamp);
    if(typeof stamp!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/.test(stamp)||!Number.isFinite(ms)||
      new Date(ms).toISOString().replace(".000Z","Z")!==stamp) throw new TypeError(`hours[${i}].timestamp must be exact UTC whole hour`);
    if(previous!==null&&ms!==previous+hourMs)throw new RangeError("Hourly timestamps must be consecutive, unique and sorted");
    previous=ms;
    const it=number(h.itElectricityKWh,`hours[${i}].itElectricityKWh`);
    const demand=number(h.heatDemandKWhThermal,`hours[${i}].heatDemandKWhThermal`);
    const source=number(h.sourceOutletC,`hours[${i}].sourceOutletC`,-50,200);
    const sink=number(h.sinkRequiredC,`hours[${i}].sinkRequiredC`,-50,200);
    const cop=number(h.comparatorCOP,`hours[${i}].comparatorCOP`,1,15);
    const rate=number(h.electricityUSDPerKWh,`hours[${i}].electricityUSDPerKWh`);
    const fraction=number(h.incrementalComputeFraction,`hours[${i}].incrementalComputeFraction`,0,1);
    const aux=number(h.auxiliaryElectricityKWh,`hours[${i}].auxiliaryElectricityKWh`);
    const revenue=number(h.incrementalComputeRevenueUSD,`hours[${i}].incrementalComputeRevenueUSD`);
    const cooling=number(h.avoidedCoolingUSD,`hours[${i}].avoidedCoolingUSD`);
    const compatible=source>=sink+delta;
    const delivered=it*capture*delivery;
    const useful=compatible?Math.min(delivered,demand):0;
    const heatingValue=useful/cop*rate;
    const added=it*fraction+aux;
    const addedCost=added*rate;
    const fixedOpex=opex/(365*24);
    const allocatedCapex=capex/(life*365*24);
    const before=heatingValue+revenue+cooling-addedCost-fixedOpex;
    const increments={itElectricityKWh:it,thermalHeatDeliveredKWh:delivered,
      usableHeatKWh:useful,unusableHeatKWh:Math.max(0,delivered-useful),
      avoidedHeatingElectricityKWh:useful/cop,heatingValueUSD:heatingValue,revenueUSD:revenue,
      avoidedCoolingUSD:cooling,addedElectricityKWh:added,addedElectricityUSD:addedCost,
      opexUSD:fixedOpex,allocatedCapexUSD:allocatedCapex,
      netBeforeCapexUSD:before,netAfterCapexUSD:before-allocatedCapex};
    for(const [k,v] of Object.entries(increments))totals[k]+=v;
    hourly.push({timestamp:stamp,compatible,heatDemandKWhThermal:demand,
      usableHeatKWh:useful,unusableHeatKWh:increments.unusableHeatKWh,
      netAfterCapexUSD:increments.netAfterCapexUSD});
  }
  return {evidenceClass:"UNVERIFIED_DESK_SCREEN",dataStatus:p.dataStatus,
    fieldDeploymentApproved:false,periods:p.hours.length,totals,
    economicScreen:totals.netAfterCapexUSD>0?"POSITIVE_SCENARIO_NEEDS_VERIFICATION":"NONPOSITIVE_SCENARIO",
    hourly,warnings:[
      "Temperature eligibility models direct heat exchange only, not heat-pump temperature lift.",
      "Hourly inputs are unverified: do not present their outputs as measured savings.",
      "Do not annualize limited or seasonal inputs without a defensible demand profile.",
      "No hardware controls, new compute dispatch, plumbing work or field deployment authorized."
    ]};
}
