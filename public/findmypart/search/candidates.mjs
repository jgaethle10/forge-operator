// A buyer-managed shortlist of possible parts, not supplier-provided data.
export function candidateFromInput({url,partNumber='',notes='',priceText=''}={}){
 let parsed;
 try{parsed=new URL(String(url||'').trim())}catch{throw Error('Enter a valid supplier listing URL.')}
 if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)
  throw Error('Only public HTTP(S) listing links are supported.');
 const host=parsed.hostname.toLowerCase();
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
   /^(?:127|10|0)\./.test(host)||/^192\.168\./.test(host)||
   /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)||host==='::1'||host.startsWith('['))
  throw Error('Use a public supplier listing URL.');
 if(parsed.href.length>1500)throw Error('Listing link is too long.');
 const strip=(v,max)=>String(v??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
 return {source_url:parsed.href,seller_domain:host,part_number_claim:strip(partNumber,120),
  buyer_notes:strip(notes,500),price_claim:strip(priceText,80),
  source:'buyer_entered',identity:'unverified',fitment:'unverified',
  price_verified:false,inventory_verified:false,
  notice:'Buyer-entered candidate. Seller claims, price, inventory and fitment have not been independently checked.'};
}
export function addCandidate(brief,input){
 if(!brief||brief.schema!=='evercraft.findmypart.search-brief.v1')throw Error('invalid_search_brief');
 const candidate=candidateFromInput(input);
 const existing=brief.source_evidence||[];
 if(existing.length>=20)throw Error('Maximum of 20 candidates per search.');
 if(existing.some(x=>x.source_url===candidate.source_url))throw Error('This listing is already saved.');
 return {...brief,source_evidence:[...existing,candidate]};
}
export function removeCandidate(brief,index){
 if(!Number.isInteger(index)||index<0||index>=(brief?.source_evidence?.length??0))throw Error('invalid_candidate');
 return {...brief,source_evidence:brief.source_evidence.filter((_,i)=>i!==index)};
}
