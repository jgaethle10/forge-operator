#!/usr/bin/env node
// Public, read-only acceptance proof for the Evercraft Website Audit social card.
// A source commit, SVG render, or successful CI build alone does not prove publication.
import {pathToFileURL} from 'node:url';

export const OFFER_URL='https://fabric.systemiacommandcenters.com/offers/website-audit';
export const EXPECTED_IMAGE_URL='https://jgaethle10.github.io/forge-operator/visuals/website-audit-attention/preview-og-v2.png';
const PNG_SIGNATURE=Buffer.from('89504e470d0a1a0a','hex');

export function metaContent(html,key) {
  for(const tag of String(html||'').match(/<meta\b[^>]*>/gi)||[]) {
    const attrs={};
    for(const match of tag.matchAll(/\b(property|name|content)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      attrs[match[1].toLowerCase()]=match[2]??match[3]??'';
    }
    if(attrs.property===key||attrs.name===key) return attrs.content||'';
  }
  return '';
}

export function inspectPng(payload) {
  const bytes=Buffer.from(payload);
  const valid=bytes.length>=24&&bytes.subarray(0,8).equals(PNG_SIGNATURE);
  return {
    valid,
    bytes:bytes.length,
    width:valid?bytes.readUInt32BE(16):null,
    height:valid?bytes.readUInt32BE(20):null,
  };
}

export async function inspectPublishedPreview({fetcher=fetch,offerUrl=OFFER_URL,imageUrl=EXPECTED_IMAGE_URL}={}) {
  const issues=[];
  const result={
    schema:'evercraft.website-audit.public-share-acceptance.v1',
    checked_at:new Date().toISOString(),
    offer_url:offerUrl,
    expected_image_url:imageUrl,
    page:{status:null,content_type:null,open_graph_image:null,facebook_status:null},
    image:{status:null,content_type:null,bytes:null,width:null,height:null,valid_png:false},
    verdict:'blocked',
    issues,
  };
  const fetchWithTimeout=(url,options={})=>fetcher(url,{
    redirect:'follow',
    signal:AbortSignal.timeout(18000),
    ...options,
  });
  let html='';
  try {
    const page=await fetchWithTimeout(offerUrl,{headers:{'user-agent':'Evercraft-Public-Preview-Canary/1.0'}});
    result.page.status=page.status;
    result.page.content_type=page.headers.get('content-type')||'';
    if(!page.ok) issues.push('offer_http_'+page.status);
    else if(!/text\/html/i.test(result.page.content_type)) issues.push('offer_not_html');
    else html=await page.text();
  } catch(error) {
    issues.push('offer_unreachable:'+String(error?.cause?.code||error?.name||'unknown'));
  }

  if(html) {
    const expected={
      'og:image':imageUrl,
      'og:image:type':'image/png',
      'og:image:width':'1200',
      'og:image:height':'630',
      'twitter:card':'summary_large_image',
    };
    for(const [key,value] of Object.entries(expected)) {
      const observed=metaContent(html,key);
      if(key==='og:image')result.page.open_graph_image=observed||null;
      if(observed!==value)issues.push('metadata_mismatch:'+key);
    }
    if(!html.includes('Quick Win Audit')||!html.includes('$49'))issues.push('offer_copy_missing');
    if(!metaContent(html,'og:image:alt'))issues.push('image_alt_missing');
    try {
      const crawler=await fetchWithTimeout(offerUrl,{headers:{'user-agent':'facebookexternalhit/1.1'}});
      result.page.facebook_status=crawler.status;
      if(!crawler.ok)issues.push('facebook_http_'+crawler.status);
      else {
        const crawlerHtml=await crawler.text();
        if(metaContent(crawlerHtml,'og:image')!==imageUrl)issues.push('facebook_image_metadata_mismatch');
      }
    } catch(error) {
      issues.push('facebook_unreachable:'+String(error?.cause?.code||error?.name||'unknown'));
    }
  }

  try {
    const response=await fetchWithTimeout(imageUrl,{headers:{'user-agent':'Evercraft-Public-Preview-Canary/1.0'}});
    result.image.status=response.status;
    result.image.content_type=response.headers.get('content-type')||'';
    if(!response.ok)issues.push('image_http_'+response.status);
    else {
      const data=inspectPng(await response.arrayBuffer());
      Object.assign(result.image,{valid_png:data.valid,bytes:data.bytes,width:data.width,height:data.height});
      if(!data.valid)issues.push('image_not_png');
      if(data.width!==1200||data.height!==630)issues.push('image_wrong_dimensions');
      if(data.bytes>4_000_000)issues.push('image_too_large');
      if(!/image\/png/i.test(result.image.content_type))issues.push('image_content_type_wrong');
    }
  } catch(error) {
    issues.push('image_unreachable:'+String(error?.cause?.code||error?.name||'unknown'));
  }
  result.verdict=issues.length?'not_verified':'verified_live';
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const strict=process.argv.includes('--strict');
  const result=await inspectPublishedPreview();
  console.log(JSON.stringify(result,null,2));
  if(process.env.GITHUB_STEP_SUMMARY) {
    const fs=await import('node:fs');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## Website Audit public preview\n\n'+
      '**'+result.verdict+'**  \n'+
      'Offer HTTP: '+String(result.page.status)+'  \n'+
      'Facebook HTTP: '+String(result.page.facebook_status)+'  \n'+
      'Image HTTP: '+String(result.image.status)+'  \n'+
      'PNG: '+String(result.image.width)+'×'+String(result.image.height)+'  \n'+
      'Issues: '+(result.issues.join(', ')||'none')+'\n');
  }
  if(result.issues.length&&strict)process.exitCode=1;
}
