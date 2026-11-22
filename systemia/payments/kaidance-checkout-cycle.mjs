#!/usr/bin/env node
// Runs with KAIDANCE's existing company heartbeat. Never publishes or mutates Stripe.
// Real provider GETs require explicitly provisioned owner-private Stripe key files.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {reconcileKaidanceOfferLinks,listHeartbeatOffers} from './kaidance-offer-links.mjs';
import {readOfferStripeLinks} from './kaidance-stripe-readonly.mjs';
import {discoverKaidanceStripeInventory} from './kaidance-stripe-inventory.mjs';
import {inspectClipCheckoutCampaign} from '../clip/kaidance-checkout-intake.mjs';
const SOURCE=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const hash=v=>'sha256:'+createHash('sha256').update(String(v)).digest('hex');
const parseFile=(filename)=>JSON.parse(fs.readFileSync(filename,'utf8'));
function privateJson(filename){
 if(!filename)return null;
 if(!path.isAbsolute(filename))throw Error('private_input_absolute_path_required');
 const target=path.resolve(filename);
 if(target.startsWith(SOURCE+path.sep)||target===SOURCE)throw Error('private_input_cannot_be_in_source');
 const stat=fs.lstatSync(target);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('private_input_permissions_invalid');
 return parseFile(target);
}
function writePrivate(file,value){
 const dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.lstatSync(dir).isSymbolicLink())throw Error('private_output_directory_symlink');
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('private_output_file_symlink');
 const tmp=file+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}
 finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
export async function runOfferLinkHeartbeat({root=SOURCE,outDir,now=new Date(),promotionFile='',stripeCredentialsFile='',fetchFn=fetch}={}){
 if(!outDir)throw Error('private_output_required');
 const base=path.resolve(root),out=path.resolve(outDir),at=new Date(now);
 const bindings=parseFile(path.join(base,'registry/kaidance-payment-offer-bindings.v1.json'));
 const legacy=parseFile(path.join(base,bindings.legacy_systemia_source));
 const catalog=listHeartbeatOffers(bindings,legacy);
 // The actual owned Clip service queue is a source of *intended offers*, not
 // proof of any authorized or already-published campaign.
 const clipQueuePath=String(bindings.clip_source_queue||'');
 if(!/^distribution\/marketing\/[a-z0-9.-]+\.review\.json$/.test(clipQueuePath))
  throw Error('kaidance_clip_source_path_not_allowlisted');
 const clipIntake=inspectClipCheckoutCampaign({
  queue:parseFile(path.join(base,clipQueuePath)),catalog,now:at
 });
 const promotions=promotionFile?privateJson(promotionFile):null;
 const credentials=stripeCredentialsFile?privateJson(stripeCredentialsFile):null;
 if(credentials&&(
  credentials.schema!=='evercraft.payments.private-stripe-key-files.v1'||
  !credentials.key_files||typeof credentials.key_files!=='object'))throw Error('private_stripe_credentials_config_invalid');
 // Only issue Stripe GETs when a current campaign actually requests payment links.
 const fresh=promotions?.schema==='evercraft.clip.verified-offer-beat.v1'&&
  Number.isFinite(Date.parse(promotions.observed_at))&&
  at.getTime()-Date.parse(promotions.observed_at)<=900000&&
  Date.parse(promotions.observed_at)<=at.getTime()+60000&&
  Array.isArray(promotions.offers)&&promotions.offers.length>0;
 let provider={schema:'evercraft.payments.stripe-link-readback.v1',accounts:[]};
 // Account-wide discovery is read-only and does not depend on an actively
 // publishing campaign. Five-minute inventory never creates a Stripe Link.
 const inventory=await discoverKaidanceStripeInventory({
  bindings,credentialPaths:credentials?.key_files||{},repoRoot:base,fetchFn,now:at
 });
 if(fresh&&credentials){
  const selected=new Set(promotions.offers.map(p=>catalog.find(x=>x.offer_key===p.offer_key)?.merchant).filter(Boolean));
  const paths=Object.fromEntries(Object.entries(credentials.key_files).filter(([merchant])=>selected.has(merchant)));
  provider=await readOfferStripeLinks({bindings,offerCatalog:catalog,credentialPaths:paths,repoRoot:base,fetchFn,now:at});
 }
 const result=reconcileKaidanceOfferLinks({bindings,legacy,promotions,provider,now:at});
 const readiness=!fresh?'awaiting_current_clip_promotion_receipt':
  !credentials?'awaiting_owned_stripe_read_credentials':
  result.holds.length?'held_exact_link_review':
  result.placements.length?'exact_link_candidates_verified':'no_matchable_current_offers';
 const output={...result,readiness,
  clip_source_intake:{source_campaign_id:clipIntake.source_campaign_id,
   source_entries:clipIntake.source_entries,
   selected_exact_source_offers:clipIntake.selected_exact_source_offers,
   rows:clipIntake.rows},
  stripe_inventory:{account_slots:inventory.account_slots,
   accounts_observed:inventory.accounts_observed,
   full_merchant_coverage_verified:inventory.full_merchant_coverage_verified,
   active_links_from_complete_accounts:inventory.active_links_from_complete_accounts,
   active_auto_tax_on_from_complete_accounts:inventory.active_auto_tax_on_from_complete_accounts,
   active_auto_tax_off_from_complete_accounts:inventory.active_auto_tax_off_from_complete_accounts,
   no_auto_tax_hosted_candidates_from_complete_accounts:inventory.no_auto_tax_hosted_candidates_from_complete_accounts},
  true_tax_obligations_determined:false,
  changes_to_stripe_tax_settings:0,
  private_provider_readback_attempted:fresh&&Boolean(credentials),
  sensitive_provider_data_exported:false,
  campaign_receipt_independently_authenticated:false};
 const actions={schema:'evercraft.payments.kaidance-heartbeat-actions.v1',
  observed_at:at.toISOString(),candidate_count:result.actions.length,
  actions:result.actions,proposed_checkout_placements:result.placements,
  clip_source_candidates:clipIntake.rows.map(row=>({entry_ref:row.entry_ref,
   selected_offer_key:row.selected_offer_key,review_state:row.review_state,
   authority:'existing_clip_authorized_publisher_only'})),
  provider_write_authorized:false,publisher_write_authorized:false,
  customer_charges:0,link_creations:0};
 // Optional KAIDANCE mission source. No fabricated production progression:
 // a held plan is not a finished action or a payment.
 const holds=result.holds.length+(readiness.startsWith('awaiting_')?1:0);
 const changed=result.placements.length+holds;
 const snapshot={schema:'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref:hash(JSON.stringify({at:at.toISOString(),readiness,actions:result.actions.length,matched:result.placements.map(p=>p.offer_key)})),
  observed_at:at.toISOString(),counts:{scanned:Math.max(1,result.requested_offers),changed,admitted:0,held:holds},
  evidence_refs:['source:registry/kaidance-payment-offer-bindings.v1.json',
   'source:systemia/payments/kaidance-offer-links.mjs']};
 // Snapshot must respect Collider's changed<=scanned and disposition<=changed.
 snapshot.counts.scanned=Math.max(snapshot.counts.scanned,changed);
 writePrivate(path.join(out,'inventory.json'),inventory);
 writePrivate(path.join(out,'latest.json'),output);
 writePrivate(path.join(out,'actions.json'),actions);
 writePrivate(path.join(out,'mission-snapshot.json'),snapshot);
 return {readiness,requested_offers:result.requested_offers,
  clip_source_entries:clipIntake.source_entries,
  inventory_accounts_observed:inventory.accounts_observed,
  matches:result.placements.length,holds:result.holds.length,
  provider_reads_attempted:fresh&&Boolean(credentials),provider_mutations:0,
  publication_actions:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const flag=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]||'':''};
 const out=flag('--out')||process.env.SYSTEMIA_KAIDANCE_CHECKOUT_OUT_DIR||path.join(SOURCE,'artifacts/kaidance-offer-checkout');
 runOfferLinkHeartbeat({outDir:out,
  promotionFile:flag('--promotion-file')||process.env.SYSTEMIA_CLIP_PROMOTION_RECEIPT_FILE||'',
  stripeCredentialsFile:flag('--stripe-credentials-file')||process.env.SYSTEMIA_STRIPE_MERCHANT_KEY_FILES||''
 }).then(result=>console.log(JSON.stringify({schema:'evercraft.payments.kaidance-checkout-cycle.v1',ok:true,...result})))
 .catch(e=>{console.error(JSON.stringify({schema:'evercraft.payments.kaidance-checkout-cycle.v1',ok:false,reason:String(e?.message||e).slice(0,120)}));process.exitCode=1});
}
