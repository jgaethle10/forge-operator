import { createHash } from 'node:crypto';

// Non-payment intake contract. This only prepares an evidence-bound scope.
// The owned payment service must durably acknowledge it BEFORE checkout can open.
const clean=(value,max)=>String(value??'').normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

export const FINDMYPART_PURCHASE_SLUGS=Object.freeze(['findmypart','part-quick','part-deep','part-rescue']);

export function buildFindMyPartIntake(body,{slug,customerEmail}={}){
  if(!FINDMYPART_PURCHASE_SLUGS.includes(String(slug||'')))return {ok:false,error:'unsupported_findmypart_offer'};
  const customer_email=clean(customerEmail,200).toLowerCase();
  const part_description=clean(body?.part_description,1600);
  const equipment_context=clean(body?.equipment_context,450);
  const part_number=clean(body?.part_number,180);
  const sources_tried=clean(body?.sources_tried,800);
  const consent=body?.scope_confirmed===true||String(body?.scope_confirmed||'').toLowerCase()==='true';
  if(part_description.length<20)return {ok:false,error:'part_description_required',message:'Describe the missing part and what is wrong, at least 20 characters.'};
  if(equipment_context.length<4)return {ok:false,error:'equipment_context_required',message:'Provide the machine, vehicle or equipment context.'};
  if(!consent)return {ok:false,error:'part_scope_confirmation_required',message:'Confirm the part details and paid research scope before continuing.'};
  const intake={
    schema:'evercraft.findmypart.prepayment-intake.v1',
    offer_slug:slug,
    customer_email,
    part_description,
    equipment_context,
    part_number,
    sources_tried,
    photos_received:false,
    customer_scope_confirmed:true,
    fitment_verified:false,
    live_inventory_verified:false,
  };
  const intake_digest=createHash('sha256').update(JSON.stringify(intake)).digest('hex');
  return {ok:true,intake,intake_digest};
}

export function verifyFindMyPartPreflight(result,expectedDigest){
  return result?.ok===true &&
    result?.schema==='raven.findmypart-context-preflight.v1' &&
    result?.checkout_created===false &&
    result?.intake_persisted===true &&
    typeof result?.intake_ref==='string' &&
    /^[A-Za-z0-9._:-]{8,160}$/.test(result.intake_ref) &&
    result?.intake_digest===expectedDigest;
}

export function verifyFindMyPartCheckoutBinding(result,expectedDigest,expectedRef){
  return result?.context_persisted===true &&
    result?.intake_digest===expectedDigest &&
    result?.intake_ref===expectedRef &&
    result?.fulfillment_release!==true;
}
