#!/usr/bin/env node
// Internal source reconciliation: no publishing, editing live catalogs, or release approval.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const FILES={
  crosswalk:'docs/brand/catalog-crosswalk.v1.json',
  identity:'docs/brand/identity-source-register.v1.json',
  workstreams:'docs/brand/review-workstreams.v1.json',
  directory:'public/.well-known/evercraft-products.json',
  index:'registry/public-products.json',
  registry:'registry/catalog.json'
};
const ALLOWED_RELATIONS=new Set(['canonical_brand','family_member']);
const HELD=new Set(['skyops-parking','aliev','rivet']);

function keysFrom(source,label){
  if(!Array.isArray(source.products))throw Error(label+' missing products array');
  const seen=new Map();
  for(const product of source.products){
    const key=product?.product_key;
    if(typeof key!=='string'||!key)throw Error(label+' missing product key');
    if(seen.has(key))throw Error(label+' duplicate product key '+key);
    seen.set(key,product);
  }
  return seen;
}

export function reconcileCatalog({crosswalk,workstreams,identity,directory,index,registry}){
  if(crosswalk?.schema!=='evercraft.brand.catalog-crosswalk.v1'
     ||crosswalk.mode!=='internal_reconciliation_only'
     ||crosswalk.publication_approved!==false
     ||!Array.isArray(crosswalk.mappings))throw Error('Crosswalk is not an internal-only review manifest');
  if(workstreams?.schema!=='evercraft.brand-workstreams.v1'
     ||workstreams.review_only!==true
     ||workstreams.publication_approved!==false
     ||!Array.isArray(workstreams.workstreams))throw Error('Workstreams are not an internal-only review manifest');

  const primary=keysFrom(directory,'directory');
  const secondary=keysFrom(index,'public-product-index');
  const tertiary=keysFrom(registry,'agent-registry');
  const familyKeys=new Set(workstreams.workstreams.map(w=>w.key));
  const seenFamilies=new Set(),mappedKeys=new Map(),reviewNeeded=[];
  for(const link of crosswalk.mappings){
    if(!familyKeys.has(link.workstream_key))throw Error('Unknown brand workstream '+link.workstream_key);
    if(seenFamilies.has(link.workstream_key))throw Error('Duplicate workstream mapping '+link.workstream_key);
    seenFamilies.add(link.workstream_key);
    if(!Array.isArray(link.members))throw Error('Mapping needs members array '+link.workstream_key);
    for(const member of link.members){
      const key=member.catalog_key;
      if(HELD.has(key))throw Error('Restricted catalog key cannot map to public brand workstream: '+key);
      if(!ALLOWED_RELATIONS.has(member.relationship))throw Error('Invalid relationship for '+key);
      if(!primary.has(key))throw Error('Linked key not in primary source: '+key);
      if(mappedKeys.has(key))throw Error('Catalog key mapped twice: '+key);
      mappedKeys.set(key,{workstream_key:link.workstream_key,relationship:member.relationship});
    }
  }
  if(seenFamilies.size!==familyKeys.size)throw Error('Unmapped workstream families: '+[...familyKeys].filter(k=>!seenFamilies.has(k)).join(', '));
  for(const key of crosswalk.held_catalog_keys||[])if(!HELD.has(key))throw Error('Unreviewed hold key '+key);
  for(const key of HELD)if(!(crosswalk.held_catalog_keys||[]).includes(key))throw Error('Missing hold gate '+key);

  const rows=[...primary.values()].map(p=>{
    const key=p.product_key;
    const family=mappedKeys.get(key);
    const status=HELD.has(key)?'restricted_hold':family?'linked_review':'requires_brand_review';
    if(status==='requires_brand_review')reviewNeeded.push(key);
    return {
      product_key:key,
      name:p.name??key,
      brand_workstream:family?.workstream_key??null,
      relationship:family?.relationship??null,
      review_status:status,
      in_secondary_index:secondary.has(key),
      in_agent_registry:tertiary.has(key),
      original_directory_url:p.canonical_url??null,
      launch_approved:false,
      payment_verified:false
    };
  }).sort((a,b)=>a.product_key.localeCompare(b.product_key));

  const verifiedUniqueBrandsNotLinked=(identity?.brands??[])
    .filter(b=>b.role==='customer_product'&&b.asset?.status==='verified_existing_mark'&&!crosswalk.mappings.some(m=>m.workstream_key===b.key&&m.members.length>0))
    .map(b=>({workstream_key:b.key,name:b.name,verified_asset_source:b.asset.source,reason:'Verified identity exists outside this dated legacy catalog mapping'}));

  const drift={
    directory_missing_from_secondary:[...primary.keys()].filter(k=>!secondary.has(k)).sort(),
    secondary_missing_from_directory:[...secondary.keys()].filter(k=>!primary.has(k)).sort(),
    agent_registry_missing_from_directory:[...tertiary.keys()].filter(k=>!primary.has(k)).sort(),
    name_conflicts:[...primary.keys()].filter(k=>secondary.has(k)&&String(primary.get(k).name??'')!==String(secondary.get(k).name??'')).sort()
  };
  return {
    schema:'evercraft.brand.catalog-reconciliation-report.v1',
    source_updated_at:directory.updated_at??null,
    is_source_snapshot:true,
    publication_approved:false,
    generated_at_runtime:null,
    counts:{
      primary_directory:primary.size,public_product_index:secondary.size,agent_registry:tertiary.size,
      brand_workstreams:familyKeys.size,linked_review:rows.filter(x=>x.review_status==='linked_review').length,
      restricted_hold:rows.filter(x=>x.review_status==='restricted_hold').length,
      requires_brand_review:reviewNeeded.length,
      verified_unique_brands_not_linked_to_legacy_catalog:verifiedUniqueBrandsNotLinked.length
    },
    drift,verified_unique_brands_not_linked_to_legacy_catalog:verifiedUniqueBrandsNotLinked,products:rows
  };
}

export function loadInputs(root=ROOT){
  return Object.fromEntries(Object.entries(FILES).map(([name,file])=>[name,JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))]));
}

export function markdownReport(report){
  const c=report.counts;
  const lines=[
    '# Evercraft product catalog | internal reconciliation',
    '',
    '**Not a public launch list.** This is a historical directory review. No offer, release, price, payment, or product-availability claim is approved.',
    '',
    '| Source or review class | Count |',
    '|---|---:|',
    '| Older public product directory | '+c.primary_directory+' |',
    '| Older public product index | '+c.public_product_index+' |',
    '| Agent registry subset | '+c.agent_registry+' |',
    '| Brand-review workstreams | '+c.brand_workstreams+' |',
    '| Explicitly linked to workstreams | '+c.linked_review+' |',
    '| Restricted hold entries | '+c.restricted_hold+' |',
    '| Not yet mapped to a reviewed brand | '+c.requires_brand_review+' |',
    '| Verified modern unique-brand marks not linked to old directory | '+c.verified_unique_brands_not_linked_to_legacy_catalog+' |',
    '',
    '## Worklist',
    '',
    'The unmapped items below are **review tasks**, not rejected Evercraft products.',
    '',
    '| Catalog key | Recorded name | Status |',
    '|---|---|---|',
    ...report.products.filter(p=>p.review_status==='requires_brand_review').map(p=>'| '+p.product_key+' | '+String(p.name).replaceAll('|','/').replaceAll('\n',' ')+' | Brand review needed |'),
    '',
    '## Verified identities outside the old catalog mapping',
    '',
    ...report.verified_unique_brands_not_linked_to_legacy_catalog.map(b=>'- '+b.name+' | source logo: '+b.verified_asset_source),
    '',
    '## Data drift',
    '',
    ...Object.entries(report.drift).map(([key,arr])=>'- '+key+': '+arr.length+(arr.length?' ('+arr.slice(0,15).join(', ')+(arr.length>15?', …':'')+')':'')),
    '',
    'The two restricted catalog entries are intentionally excluded from the public-brand workstream mappings. Do not treat any current discovery row as launch consent.',
    ''
  ];
  return lines.join('\n');
}

async function main(argv=process.argv.slice(2)){
  if(argv.includes('--public')||argv.includes('--publish'))throw Error('Publishing is not implemented or authorized');
  const report=reconcileCatalog(loadInputs());
  const outIndex=argv.indexOf('--out');
  const output=path.resolve(outIndex>=0?argv[outIndex+1]||'':path.join(ROOT,'tmp','evercraft-catalog-review.json'));
  if(!output.endsWith('.json')||output.startsWith(path.join(ROOT,'public')+path.sep))throw Error('Output must be private JSON outside public/');
  const markdown=output.replace(/\.json$/,'.md');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(markdown,markdownReport(report));
  console.log('Internal reconciliation saved:',output,markdown,JSON.stringify(report.counts));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
