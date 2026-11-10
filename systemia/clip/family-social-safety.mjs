// EVERCRAFT CORPORATE SOCIAL SAFETY
// This guard is for first-party social publishing paths, not third-party adult creators.
// Social channels owned/operated under Evercraft's family-facing identity must remain
// completely free of explicit, suggestive, or adult-industry promotion.
//
// Defense in depth: this scans visible copy and destination URLs before an adapter
// can publish. It CANNOT inspect video pixels, screenshots, music or offsite media.
// A separate visual/media review is always required before granting publish authority.

const EXCLUDED_TEXT=/(?:\b(?:porn(?:ography)?|pornographic|sex(?:ual|ually|y)?|nud(?:e|ity)|erotic|fetish|onlyfans|fansly|xxx|nsfw|strip(?:per|tease|club|ping)?|camgirl|cam boy|adult\s+(?:content|entertainment|film|industry|website|site|video|affiliate|traffic|material))\b)/iu;
const EXCLUDED_URL=/(?:\b(?:porn(?:ography)?|erotic|onlyfans|fansly|xxx|nsfw|nud(?:e|ity)|sex(?:ual|y)?)\b)/iu;

function normalized(value){return String(value??'').normalize('NFKC').toLowerCase();}
function visibleWords(text){
 return normalized(text)
  .replace(/[._/\\?&=#-]+/g,' ')
  .replace(/[%][0-9a-f]{2}/gi,' ')
  .replace(/\s+/g,' ')
  .trim();
}
function enforceSafeText(value,field){
 if(EXCLUDED_TEXT.test(visibleWords(value))){
  throw new Error('evercraft_social_zero_sexual_content_hold:'+field);
 }
}
function enforceSafeUrl(value,field){
 if(!String(value??'').trim())return;
 let url;
 try {url=new URL(String(value));}catch{throw new Error('evercraft_social_destination_invalid:'+field);}
 // Check parsed/decoded hostname and path. A destination can never be an adult property
 // even if the post caption looks safe.
 const decoded=decodeURIComponent(url.hostname+' '+url.pathname+' '+url.search+' '+url.hash);
 if(EXCLUDED_URL.test(visibleWords(decoded))||EXCLUDED_TEXT.test(visibleWords(decoded))){
  throw new Error('evercraft_social_adult_link_blocked:'+field);
 }
}

export function assertEvercraftFamilySocialSafe({title='',message='',link='',campaign='',mediaSafetyReview=null}={}){
 enforceSafeText(title,'title');
 enforceSafeText(message,'message');
 enforceSafeText(campaign,'campaign');
 enforceSafeUrl(link,'link');
 // Media cannot be cleared through keyword filters or mere presence of a file.
 if(mediaSafetyReview!==null){
  if(mediaSafetyReview?.decision!=='approved_nonsexual'||!String(mediaSafetyReview?.reviewerRef||'').trim()){
   throw new Error('evercraft_social_media_review_missing_or_unapproved');
  }
 }
 return {status:'text_link_pass',mediaReviewed:mediaSafetyReview?.decision==='approved_nonsexual'};
}
