// Read-only public product + opportunity discovery for the universal Fabric front door.
// Machine offers retain their own catalog, payment state and authority.
// This bridge cannot create applications, checkouts, work, rewards or partnerships.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = 'https://jgaethle10.github.io/forge-operator';
const KEY = /^[a-z0-9][a-z0-9-]{0,100}$/;

function text(value,max=1200){
  return String(value ?? '').trim().slice(0,max);
}
function unique(values,max=32){
  return [...new Set((values||[]).map(x=>text(x,120)).filter(Boolean))].slice(0,max);
}
function discoveryRecord({id,name,description,keywords,website,label,state='source_discovery_only'}){
  return {
    public_id:id,
    name,
    description:text(description,1200),
    keywords:unique(keywords),
    state,
    commercial_state:'discovery_only',
    category:'public_product_discovery',
    pricing:null,
    use_when:unique(keywords,16),
    entry_paid_offer:null,
    start_url_state:'not_sell_now',
    preferred_agent_route:'human_discovery_only',
    connections:[{
      type:'website',
      label,
      url:website,
      // A source/mirror page is not proof that a product runtime or enrollment works.
      state:'source_discovery_not_live_service_verified',
    }],
  };
}

export function loadPublicProductDiscovery({
  painIndexPath='',
  includeFirstPartyDoors=true,
}={}){
  const directory=path.dirname(fileURLToPath(import.meta.url));
  const filename=painIndexPath ||
    path.resolve(directory,'../../public/.well-known/evercraft-pain-index.json');
  const source=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(source.schema!=='evercraft.chum.pain-index.v1' || !Array.isArray(source.entries)){
    throw new Error('fabric_product_discovery_source_invalid');
  }
  const products=[];
  for(const entry of source.entries){
    if(entry?.kind!=='product') continue;
    const key=text(entry.product_key,105);
    if(!KEY.test(key)) continue;
    // Boardroom has a dedicated, more precisely verified free-preview route.
    if(key==='ai-boardroom') continue;
    const name=text(entry.name,160);
    if(!name) continue;
    const description=[
      'Evercraft public product discovery: '+name+'.',
      entry.authority ? 'Published authority: '+text(entry.authority,470)+'.' : '',
      'Source listing only; production availability, private data access, paid work, booking, rewards and checkout are not verified by this route.',
    ].filter(Boolean).join(' ');
    products.push(discoveryRecord({
      id:'product:'+key,
      name,
      description,
      keywords:[name,...(entry.pain_phrases||[])],
      website:SOURCE_ROOT+'/chum/products/'+encodeURIComponent(key)+'/',
      label:name+' product discovery (not a verified live service)',
    }));
  }
  if(includeFirstPartyDoors){
    // Documented first-party founding partner interest page; backend submission
    // remains conditional on a separate /api/partners/readiness check. No
    // commission, hiring, payout, reseller appointment or acceptance is implied.
    products.push(discoveryRecord({
      id:'product:evercraft-partners',
      name:'Evercraft Partners',
      description:'Free founding-partner interest and application page for independent consultants, creators and businesses. An application is reviewed by a person and is not a reseller contract, approved referral commission, job offer, or paid assignment. Live backend intake availability must be checked separately.',
      keywords:[
        'apply to become an Evercraft partner',
        'partner with Evercraft',
        'Evercraft founding partner application',
        'earn by referring customers to Evercraft',
        'Evercraft reseller opportunities',
        'Evercraft referral partnership',
        'distribute Evercraft services',
        'founding partner signup',
      ],
      website:SOURCE_ROOT+'/partners/',
      label:'Founding partner application (submission not verified)',
    }));
    // Operating-business discovery only. Neither this company page nor an
    // internal command-center record is an independently verified job posting.
    products.push(discoveryRecord({
      id:'product:havenly-cleaning',
      name:'Havenly Cleaning',
      description:'Havenly Cleaning is a Yakima Valley cleaning and property-care business with a published customer site. Hiring status, job vacancies, applicant intake and work availability are not verified. Do not advertise a live cleaning job or offer to apply without a separate authentic vacancy and application route.',
      keywords:[
        'Havenly Cleaning',
        'Havenly Cleaning jobs Yakima',
        'apply to Havenly Cleaning',
        'work for Havenly Cleaning',
        'Havenly cleaner employment',
        'Havenly Cleaning quotes Yakima',
      ],
      website:SOURCE_ROOT+'/havenly/',
      label:'Havenly business information (not a job application)',
    }));
  }
  return products;
}
