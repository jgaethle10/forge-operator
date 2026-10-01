import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

function clean(value){ return String(value??'').trim(); }
function bodyBuffer(body){ return Buffer.isBuffer(body)?Buffer.from(body):Buffer.from(String(body??'')); }
function constantTimeTextEqual(left,right){
  const a=Buffer.from(String(left??''));
  const b=Buffer.from(String(right??''));
  return a.length===b.length && timingSafeEqual(a,b);
}
function parseJson(body){
  try { return JSON.parse(bodyBuffer(body).toString('utf8')); }
  catch { throw new Error('webhook_json_invalid'); }
}
function shaHex(body){
  return createHash('sha256').update(bodyBuffer(body)).digest('hex');
}

export function createStripeWebhookVerifier(){
  return async function verifyStripeWebhook({headers={},body,secret,now,maxSkewMs}={}){
    const header=clean(headers['stripe-signature']);
    if(!header) throw new Error('stripe_signature_required');
    const parts=header.split(',').map(clean).filter(Boolean);
    const timestamp=clean(parts.find((part)=>part.startsWith('t='))?.slice(2));
    const signatures=parts.filter((part)=>part.startsWith('v1=')).map((part)=>clean(part.slice(3)));
    if(!/^\d+$/.test(timestamp)||!signatures.length) throw new Error('stripe_signature_format_invalid');

    const observedMs=Number(timestamp)*1000;
    const nowMs=new Date(now).getTime();
    if(!Number.isFinite(observedMs)||Math.abs(nowMs-observedMs)>Number(maxSkewMs||0)){
      throw new Error('webhook_timestamp_outside_replay_window');
    }

    const expected=createHmac('sha256',String(secret??''))
      .update(timestamp+'.')
      .update(bodyBuffer(body))
      .digest('hex');
    const matched=signatures.some((candidate)=>
      /^[a-f0-9]{64}$/i.test(candidate) &&
      constantTimeTextEqual(candidate.toLowerCase(),expected)
    );
    if(!matched) throw new Error('webhook_signature_mismatch');

    const event=parseJson(body);
    const eventId=clean(event?.id);
    if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(eventId)){
      throw new Error('stripe_event_id_invalid');
    }
    return {
      verified:true,
      eventId,
      timestamp,
      enforceReplayWindow:true,
      metadata:{
        provider:'stripe',
        event_type:clean(event?.type,200)
      }
    };
  };
}

export function createSharedSecretJsonWebhookVerifier({
  header='x-evercraft-voice-secret',
  eventIdFields=['event_id','moment_id','call_sid','conversation_id']
}={}){
  const headerKey=clean(header).toLowerCase();
  if(!headerKey) throw new Error('shared_secret_header_required');
  return async function verifySharedSecretJson({headers={},body,secret,now}={}){
    const provided=clean(headers[headerKey]);
    if(!provided||!constantTimeTextEqual(provided,String(secret??''))){
      throw new Error('webhook_signature_mismatch');
    }
    const payload=parseJson(body);
    let eventId='';
    for(const field of eventIdFields){
      const value=clean(payload?.[field]);
      if(value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)){
        eventId=value;
        break;
      }
    }
    if(!eventId) eventId='body_'+shaHex(body).slice(0,64);
    return {
      verified:true,
      eventId,
      timestamp:new Date(now).toISOString(),
      enforceReplayWindow:false,
      metadata:{
        provider:'shared_secret_json',
        provider_timestamp_available:false,
        event_type:clean(payload?.event_type||payload?.type,200)
      }
    };
  };
}
