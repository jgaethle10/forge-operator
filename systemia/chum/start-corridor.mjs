const DEFAULT_MACHINE_COMMERCE_GATEWAY = String(process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL || '').trim();
export const BUYER_FRONTAGE_ORIGIN = '';
export const BUYER_FRONTAGE_GATEWAY = '';

const BLOCKED_PUBLIC_HOSTS = new Set([
  'systemiacommandcenters.com',
  'www.systemiacommandcenters.com'
]);

const DIRECT_HUMAN_BUYER_DESTINATIONS = Object.freeze({});

function relativeBuyerFrontage(offer,{surface='chum_public_surface',source='chum',campaign='buyer-frontage'}={}){
  if(offer?.commercial_state!=='sell_now'||!offer?.public_id) return null;
  const params=new URLSearchParams();
  params.set('src',String(source||'chum').slice(0,80));
  params.set('campaign',String(campaign||'buyer-frontage').slice(0,120));
  params.set('ec_surface',String(surface||'chum_public_surface').slice(0,80));
  params.set('ec_public_id',String(offer.public_id));
  return '/buy/'+encodeURIComponent(String(offer.public_id))+'?'+params.toString();
}

export function machineReviewUrl(publicId,gateway=DEFAULT_MACHINE_COMMERCE_GATEWAY){
  const id=String(publicId||'').trim();
  if(!id) return null;
  const target=String(gateway||'').trim();
  if(!target) return '/buy/'+encodeURIComponent(id);
  try{
    const url=new URL(target);
    if(url.protocol!=='https:') return null;
    if(/(^|\.)base44\.app$/i.test(url.hostname)) return null;
    url.searchParams.set('view','service');
    url.searchParams.set('public_id',id);
    return url.toString();
  }catch{
    return null;
  }
}

export function configuredChumPublicOrigin(value=process.env.CHUM_PUBLIC_ORIGIN||process.env.PUBLIC_BASE_URL){
  const raw=String(value||'').trim();
  if(!raw) return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:') return null;
    if(BLOCKED_PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return null;
    if(/(^|\.)base44\.app$/i.test(url.hostname)) return null;
    return url.origin;
  }catch{
    return null;
  }
}

export function buyerFrontageUrl(offer,{
  surface='chum_public_surface',
  source='chum',
  campaign='buyer-frontage',
  gateway=configuredChumPublicOrigin()
}={}){
  if(offer?.commercial_state!=='sell_now'||!offer?.public_id) return null;
  const path=relativeBuyerFrontage(offer,{surface,source,campaign});
  const target=String(gateway||'').trim();
  if(!target) return path;
  try{
    const origin=configuredChumPublicOrigin(target);
    if(!origin) return null;
    return new URL(path,origin).toString();
  }catch{
    return null;
  }
}

export function directHumanBuyerUrl(offer,{surface='chum_public_surface'}={}){
  if(offer?.commercial_state!=='sell_now'||!offer?.public_id) return null;
  const destination=DIRECT_HUMAN_BUYER_DESTINATIONS[String(offer.public_id)]||'';
  if(!destination) return null;
  try{
    const url=new URL(destination);
    if(url.protocol!=='https:'||/(^|\.)base44\.app$/i.test(url.hostname)) return null;
    url.searchParams.set('src','chum');
    url.searchParams.set('campaign','buyer-frontage');
    url.searchParams.set('ec_surface',String(surface||'chum_public_surface'));
    url.searchParams.set('ec_public_id',String(offer.public_id));
    return url.toString();
  }catch{
    return null;
  }
}

export function humanStartUrl(offer,{
  surface='chum_public_surface',
  publicOrigin=process.env.CHUM_PUBLIC_ORIGIN||process.env.PUBLIC_BASE_URL,
  gateway=DEFAULT_MACHINE_COMMERCE_GATEWAY
}={}){
  if(offer?.commercial_state!=='sell_now'||!offer?.public_id) return null;

  const origin=configuredChumPublicOrigin(publicOrigin);
  if(origin){
    return origin+'/api/chum/go/'+encodeURIComponent(String(offer.public_id))
      +'?surface='+encodeURIComponent(String(surface||'chum_public_surface'));
  }

  const frontage=buyerFrontageUrl(offer,{surface,gateway:''});
  if(frontage) return frontage;

  const direct=directHumanBuyerUrl(offer,{surface});
  if(direct) return direct;

  return machineReviewUrl(offer.public_id,gateway);
}

export function humanStartState(offer,{
  publicOrigin=process.env.CHUM_PUBLIC_ORIGIN||process.env.PUBLIC_BASE_URL
}={}){
  if(offer?.commercial_state!=='sell_now'||!offer?.public_id) return 'not_sell_now';
  if(configuredChumPublicOrigin(publicOrigin)) return 'tracked_chum_handoff_configured_origin';
  if(buyerFrontageUrl(offer,{gateway:''})) return 'owned_relative_buyer_frontage';
  if(DIRECT_HUMAN_BUYER_DESTINATIONS[String(offer.public_id)]) return 'direct_human_buyer_destination';
  return 'commercial_execution_migration_hold';
}
