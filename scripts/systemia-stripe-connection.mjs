#!/usr/bin/env node
/**
 * One-time local Stripe account identity registration for Systemia.
 * No Stripe secrets are requested or stored. Hosted Stripe connection
 * authorization is still managed externally by the user-approved connector.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  stripeConnectionPath,buildStripeConnectionReference,
  storeStripeConnectionReference,displayStripeConnectionStatus,
} from '../systemia/payments/stripe-connection-registry.mjs';

function argsOf(argv){
  const flags=new Map();
  const allowed=new Set([
    '--register','--status','--stripe-context','--account-name',
    '--livemode','--observed-date','--confirm-live','--replace','--help'
  ]);
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(!allowed.has(key))throw Error('unknown_argument_'+key);
    if(flags.has(key))throw Error('duplicate_argument_'+key);
    if(['--register','--status','--confirm-live','--replace','--help'].includes(key)){
      flags.set(key,true);
    }else{
      if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('missing_value_for_'+key);
      flags.set(key,argv[++i]);
    }
  }
  return flags;
}

export function usage(){
  return [
    'Systemia Stripe provider connection reference (credentials stay external)',
    '',
    'Read-only current status:',
    '  node scripts/systemia-stripe-connection.mjs --status',
    '',
    'One-time private registration:',
    '  node scripts/systemia-stripe-connection.mjs --register \\',
    '    --stripe-context acct_... --account-name "Evercraft Media & Technologies" \\',
    '    --livemode true --observed-date YYYY-MM-DD --confirm-live',
    '',
    'To change account or live/test mode later, add --replace after reconfirming the target.',
    'This records account identity, NOT API access, payment readiness, settlement or payout authority.',
  ].join('\n');
}

export function runStripeRegistration(argv,{output=console.log}={}){
  const flags=argsOf(argv);
  if(flags.has('--help')){
    output(usage());
    return {help:true};
  }
  if(!flags.has('--register')){
    if([...flags.keys()].some(k=>k!=='--status'))throw Error('register_required_for_changes');
    const result=displayStripeConnectionStatus();
    output(JSON.stringify(result,null,2));
    return result;
  }
  if(flags.has('--status'))throw Error('register_and_status_exclusive');
  const mode=flags.get('--livemode');
  if(mode!=='true'&&mode!=='false')throw Error('explicit_livemode_boolean_required');
  if(mode==='true'&&!flags.has('--confirm-live'))throw Error('live_stripe_account_confirmation_required');
  const record=buildStripeConnectionReference({
    stripeContext:flags.get('--stripe-context'),
    accountName:flags.get('--account-name'),
    livemode:mode==='true',
    observedDate:flags.get('--observed-date'),
  });
  const result=storeStripeConnectionReference(record,{
    file:stripeConnectionPath(),allowReplace:!!flags.get('--replace')
  });
  const status=displayStripeConnectionStatus();
  output(JSON.stringify({...result,file:undefined,...status},null,2));
  return status;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{runStripeRegistration(process.argv.slice(2));}
  catch(e){
    console.error('Systemia Stripe registration blocked:',e.message);
    process.exitCode=1;
  }
}
