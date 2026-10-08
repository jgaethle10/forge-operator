#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const esc=(value)=>String(value??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  }
  return value;
}
const digest=(value)=>crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const clean=(value)=>String(value??'').trim();

export function normalizeSpaceDudzCampaign(input){
  if(input?.schema!=='evercraft.space-dudz.graphics-campaign.v1') throw new Error('space_dudz_campaign_schema_invalid');
  const id=clean(input.id);
  const slug=clean(input.slug).toLowerCase();
  const pollId=clean(input.pollId);
  if(!id||!pollId||!/^[a-z0-9-]+$/.test(slug)) throw new Error('space_dudz_campaign_identity_invalid');
  if(!Array.isArray(input.candidates)||input.candidates.length<2) throw new Error('space_dudz_candidates_missing');
  const labels=new Set();
  const candidates=input.candidates.map((item,index)=>{
    const label=clean(item.label)||String.fromCharCode(65+index);
    if(labels.has(label)) throw new Error('space_dudz_candidate_label_duplicate:'+label);
    labels.add(label);
    const concept=clean(item.concept);
    if(!['moon_motel','signal_lost','orbital_service'].includes(concept)) throw new Error('space_dudz_concept_unsupported:'+concept);
    return {
      id:clean(item.id)||slug+'-'+label.toLowerCase(),
      label,
      name:clean(item.name),
      concept,
      tagline:clean(item.tagline),
      microcopy:clean(item.microcopy),
    };
  });
  if(candidates.some(item=>!item.name||!item.tagline)) throw new Error('space_dudz_candidate_copy_incomplete');
  const palette={
    ink:'#07111F', cream:'#F4EBD5', aqua:'#4FE1D2', orange:'#FF6B45', violet:'#8D69FF',
    ...(input.palette||{}),
  };
  const normalized={
    schema:input.schema,id,slug,pollId,
    brand:'Space Dudz',
    creativeSystem:'evercraft_graphics_command',
    candidates,palette,
    destinations:['facebook','instagram','linkedin','tiktok'],
    boundaries:{
      publicationAuthority:false,
      printAuthorization:false,
      voteIsPreferenceSignal:true,
      preorderRequiredBeforePrint:true,
      ...(input.boundaries||{}),
    },
  };
  return {...normalized,digest:digest(normalized)};
}

function artMoonMotel(p){
  return `
  <circle cx="700" cy="640" r="475" fill="${p.cream}"/>
  <circle cx="860" cy="535" r="440" fill="${p.ink}"/>
  <g fill="${p.orange}">
    <path d="M235 400l16 43 45 3-35 29 11 44-38-24-38 24 11-44-35-29 45-3z"/>
    <path d="M1110 395l12 32 34 2-26 22 8 33-29-18-28 18 8-33-26-22 34-2z"/>
    <circle cx="286" cy="716" r="14"/><circle cx="1090" cy="770" r="11"/><circle cx="1040" cy="300" r="8"/>
  </g>
  <g transform="translate(175 760)">
    <rect width="1050" height="360" rx="66" fill="${p.ink}" stroke="${p.aqua}" stroke-width="20"/>
    <rect x="42" y="42" width="966" height="276" rx="42" fill="none" stroke="${p.orange}" stroke-width="8"/>
    <text x="525" y="175" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-size="132" letter-spacing="7" fill="${p.cream}">MOON MOTEL</text>
    <text x="525" y="260" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="46" letter-spacing="12" fill="${p.aqua}">VACANCY IN ORBIT</text>
  </g>
  <path d="M560 1120h280l-46 180H606z" fill="${p.ink}"/><rect x="625" y="1260" width="150" height="170" rx="18" fill="${p.ink}"/>
  <path d="M380 1420 Q700 1288 1020 1420" fill="none" stroke="${p.orange}" stroke-width="28" stroke-linecap="round"/>`;
}

function artSignalLost(p){
  return `
  <path d="M195 290H1205V1310H195z" fill="none" stroke="${p.ink}" stroke-width="34"/>
  <g fill="${p.violet}"><rect x="250" y="350" width="125" height="24"/><rect x="1025" y="430" width="125" height="24"/><rect x="220" y="1150" width="180" height="24"/><rect x="1000" y="1070" width="180" height="24"/></g>
  <circle cx="700" cy="755" r="365" fill="${p.ink}" stroke="${p.aqua}" stroke-width="26"/><circle cx="700" cy="755" r="292" fill="${p.cream}"/>
  <path d="M455 820Q700 540 945 820Q918 1034 700 1075Q482 1034 455 820z" fill="${p.ink}"/>
  <path d="M505 795Q700 610 895 795Q865 920 700 950Q535 920 505 795z" fill="${p.violet}"/>
  <path d="M516 745L885 855" stroke="${p.aqua}" stroke-width="36"/><path d="M520 850L900 730" stroke="${p.orange}" stroke-width="24"/>
  <circle cx="700" cy="450" r="74" fill="${p.orange}" stroke="${p.ink}" stroke-width="20"/>
  <path d="M700 380V250" stroke="${p.ink}" stroke-width="24" stroke-linecap="round"/><circle cx="700" cy="222" r="28" fill="${p.aqua}" stroke="${p.ink}" stroke-width="16"/>
  <g fill="${p.ink}"><rect x="235" y="590" width="220" height="30"/><rect x="945" y="610" width="210" height="30"/><rect x="220" y="1000" width="260" height="22"/><rect x="930" y="1010" width="240" height="22"/></g>`;
}

function artOrbitalService(p){
  return `
  <circle cx="700" cy="760" r="520" fill="${p.ink}"/><circle cx="700" cy="760" r="468" fill="${p.cream}" stroke="${p.orange}" stroke-width="24"/>
  <circle cx="700" cy="760" r="390" fill="none" stroke="${p.ink}" stroke-width="22" stroke-dasharray="18 22"/>
  <path d="M700 370C776 475 800 593 774 704L900 887L836 926L712 750C625 784 529 769 442 716C562 695 640 630 682 529C699 487 705 434 700 370z" fill="${p.aqua}" stroke="${p.ink}" stroke-width="22" stroke-linejoin="round"/>
  <path d="M775 704L975 517" stroke="${p.ink}" stroke-width="54" stroke-linecap="round"/><path d="M957 490l84-50 38 66-82 50z" fill="${p.orange}" stroke="${p.ink}" stroke-width="18"/>
  <path d="M622 807L442 1000" stroke="${p.ink}" stroke-width="62" stroke-linecap="round"/><circle cx="405" cy="1038" r="85" fill="none" stroke="${p.ink}" stroke-width="34"/>
  <path d="M645 860Q700 915 755 860L700 1100z" fill="${p.orange}" stroke="${p.ink}" stroke-width="18"/><path d="M675 1085l25 110 25-110" fill="${p.violet}" stroke="${p.ink}" stroke-width="14"/>`;
}

function conceptArt(candidate,p){
  if(candidate.concept==='moon_motel') return artMoonMotel(p);
  if(candidate.concept==='signal_lost') return artSignalLost(p);
  return artOrbitalService(p);
}

export function renderSpaceDudzDesign(campaignInput,candidateInput){
  const campaign=normalizeSpaceDudzCampaign(campaignInput);
  const candidate=campaign.candidates.find(item=>item.id===candidateInput.id)||candidateInput;
  if(!candidate) throw new Error('space_dudz_candidate_missing');
  const p=campaign.palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1600" viewBox="0 0 1400 1600">
<g>${conceptArt(candidate,p)}
<rect x="245" y="1215" width="910" height="185" rx="55" fill="${p.ink}"/>
<text x="700" y="1310" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-size="82" letter-spacing="4" fill="${p.cream}">${esc(candidate.name.toUpperCase())}</text>
<text x="700" y="1370" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="29" letter-spacing="7" fill="${p.orange}">${esc(candidate.tagline.toUpperCase())}</text>
<text x="700" y="1510" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="40" letter-spacing="10" fill="${p.ink}">SPACE DUDZ • ${esc(candidate.microcopy.toUpperCase())}</text>
</g></svg>\n`;
}

export function renderSpaceDudzVoteCard(campaignInput,candidateInput,{story=false}={}){
  const campaign=normalizeSpaceDudzCampaign(campaignInput);
  const candidate=campaign.candidates.find(item=>item.id===candidateInput.id)||candidateInput;
  const width=story?1080:1080, height=story?1920:1350;
  const art=Buffer.from(renderSpaceDudzDesign(campaign,candidate)).toString('base64');
  const p=campaign.palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="${p.ink}"/>
<text x="72" y="92" font-family="Arial Black,sans-serif" font-size="26" letter-spacing="5" fill="${p.aqua}">SPACE DUDZ • COMMUNITY DROP</text>
<text x="72" y="170" font-family="Impact,Arial Black,sans-serif" font-size="70" fill="${p.cream}">VOTE ${esc(candidate.label)}: ${esc(candidate.name.toUpperCase())}</text>
<image href="data:image/svg+xml;base64,${art}" x="100" y="${story?245:215}" width="880" height="${story?1150:920}" preserveAspectRatio="xMidYMid meet"/>
<rect x="72" y="${height-150}" width="936" height="84" rx="42" fill="${p.aqua}"/>
<text x="540" y="${height-95}" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="30" letter-spacing="4" fill="${p.ink}">PICK THE ONE YOU'D ACTUALLY WEAR</text>
</svg>\n`;
}

export function buildSpaceDudzCampaign(input,{outputRoot,origin='https://fabric.systemiacommandcenters.com/space-dudz'}={}){
  const campaign=normalizeSpaceDudzCampaign(input);
  const dir=path.join(path.resolve(outputRoot),campaign.slug);
  fs.mkdirSync(dir,{recursive:true});
  const assets={};
  for(const candidate of campaign.candidates){
    const designFile=candidate.id+'.svg';
    const feedFile=candidate.id+'-vote-feed.svg';
    const storyFile=candidate.id+'-vote-story.svg';
    fs.writeFileSync(path.join(dir,designFile),renderSpaceDudzDesign(campaign,candidate),'utf8');
    fs.writeFileSync(path.join(dir,feedFile),renderSpaceDudzVoteCard(campaign,candidate),'utf8');
    fs.writeFileSync(path.join(dir,storyFile),renderSpaceDudzVoteCard(campaign,candidate,{story:true}),'utf8');
    assets[candidate.id]={
      design:origin.replace(/\/$/,'')+'/'+campaign.slug+'/'+designFile,
      feed:origin.replace(/\/$/,'')+'/'+campaign.slug+'/'+feedFile,
      story:origin.replace(/\/$/,'')+'/'+campaign.slug+'/'+storyFile,
    };
  }
  const manifest={
    schema:'evercraft.space-dudz.graphics-manifest.v1',
    campaignId:campaign.id,
    pollId:campaign.pollId,
    campaignDigest:campaign.digest,
    assets,
    clipHandoff:{
      schema:'evercraft.clip.space-dudz-vote-handoff.v1',
      destinations:campaign.destinations,
      campaignId:campaign.id,
      pollId:campaign.pollId,
      publicationAuthority:false,
    },
    boundaries:campaign.boundaries,
    generatedAt:new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir,'campaign.json'),JSON.stringify(campaign,null,2)+'\n','utf8');
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  return {campaign,manifest,dir};
}

async function cli(){
  const args=Object.fromEntries(process.argv.slice(2).reduce((rows,item,index,all)=>{
    if(item.startsWith('--')) rows.push([item.slice(2),all[index+1]]);
    return rows;
  },[]));
  if(!args.campaign||!args.output) throw new Error('Usage: node space-dudz-design-factory.mjs --campaign <json> --output <dir>');
  const campaign=JSON.parse(fs.readFileSync(path.resolve(args.campaign),'utf8'));
  const built=buildSpaceDudzCampaign(campaign,{outputRoot:args.output,origin:args.origin});
  console.log(JSON.stringify(built.manifest,null,2));
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  cli().catch(error=>{console.error(error instanceof Error?error.stack||error.message:String(error));process.exitCode=1;});
}
