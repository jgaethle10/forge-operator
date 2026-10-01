import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const DEFAULT_MAX_BYTES=750_000;
const DEFAULT_TIMEOUT_MS=8_000;
const DEFAULT_MAX_REDIRECTS=3;

function clean(value,max=4000){
  return String(value??'').trim().slice(0,max);
}

function normalizeUrl(value){
  let raw=clean(value,2048);
  if(!raw) throw new Error('website_url_required');
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw='https://'+raw;
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol)) throw new Error('website_url_protocol_not_allowed');
  const standardPort=url.protocol==='https:'?'443':'80';
  if(url.port&&url.port!==standardPort) throw new Error('website_nonstandard_port_not_allowed');
  if(url.username||url.password) throw new Error('website_url_credentials_not_allowed');
  if(!url.hostname) throw new Error('website_url_hostname_required');
  return url;
}

function ipv4Public(address){
  const parts=address.split('.').map(Number);
  if(parts.length!==4||parts.some((n)=>!Number.isInteger(n)||n<0||n>255)) return false;
  const [a,b]=parts;
  if(a===0||a===10||a===127||a>=224) return false;
  if(a===100&&b>=64&&b<=127) return false;
  if(a===169&&b===254) return false;
  if(a===172&&b>=16&&b<=31) return false;
  if(a===192&&(b===0||b===168)) return false;
  if(a===198&&(b===18||b===19)) return false;
  if(a===198&&b===51) return false;
  if(a===203&&b===0) return false;
  return true;
}

function ipv6ToBigInt(address){
  let value=String(address||'').toLowerCase().split('%')[0];
  if(value.includes('.')){
    const lastColon=value.lastIndexOf(':');
    const ipv4=value.slice(lastColon+1);
    if(net.isIP(ipv4)!==4) return null;
    const octets=ipv4.split('.').map(Number);
    value=value.slice(0,lastColon+1)+
      ((octets[0]<<8)|octets[1]).toString(16)+':'+
      ((octets[2]<<8)|octets[3]).toString(16);
  }
  const pieces=value.split('::');
  if(pieces.length>2) return null;
  const left=pieces[0]?pieces[0].split(':').filter(Boolean):[];
  const right=pieces.length===2&&pieces[1]?pieces[1].split(':').filter(Boolean):[];
  const missing=8-left.length-right.length;
  if(missing<0||(pieces.length===1&&missing!==0)) return null;
  const groups=pieces.length===2
    ? [...left,...Array(missing).fill('0'),...right]
    : left;
  if(groups.length!==8||groups.some((x)=>!/^[0-9a-f]{1,4}$/.test(x))) return null;
  return groups.reduce((acc,x)=>(acc<<16n)+BigInt(parseInt(x,16)),0n);
}

function ipv6InCidr(value,base,bits){
  const v=ipv6ToBigInt(value);
  const b=ipv6ToBigInt(base);
  if(v===null||b===null) return false;
  const shift=128n-BigInt(bits);
  return (v>>shift)===(b>>shift);
}

const IPV6_BLOCKED_RANGES=[
  ['::',96],
  ['::ffff:0:0',96],
  ['64:ff9b::',96],
  ['64:ff9b:1::',48],
  ['100::',64],
  ['2001:db8::',32],
  ['2001:10::',28],
  ['2001:20::',28],
  ['2002::',16],
  ['fc00::',7],
  ['fe80::',10],
  ['fec0::',10],
  ['ff00::',8],
];

function ipv6Public(address){
  const value=String(address||'').toLowerCase();
  const parsed=ipv6ToBigInt(value);
  if(parsed===null) return false;
  return !IPV6_BLOCKED_RANGES.some(([base,bits])=>ipv6InCidr(value,base,bits));
}

export function isPublicIp(address){
  const family=net.isIP(String(address||''));
  if(family===4) return ipv4Public(address);
  if(family===6) return ipv6Public(address);
  return false;
}

async function assertPublicHost(hostname,{lookup=dns.lookup}={}){
  const host=String(hostname||'').toLowerCase();
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')){
    throw new Error('website_private_host_not_allowed');
  }
  if(net.isIP(host)){
    if(!isPublicIp(host)) throw new Error('website_private_host_not_allowed');
    return [{address:host,family:net.isIP(host)}];
  }
  const rows=await lookup(host,{all:true,verbatim:true});
  if(!Array.isArray(rows)||!rows.length) throw new Error('website_dns_resolution_failed');
  if(rows.some((row)=>!isPublicIp(row.address))) throw new Error('website_private_host_not_allowed');
  return rows;
}

async function requestPinned(url,address,{timeoutMs,maxBytes}){
  const secure=url.protocol==='https:';
  const transport=secure?https:http;
  const defaultPort=secure?443:80;
  const port=url.port?Number(url.port):defaultPort;
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error('website_port_invalid');
  if(port!==defaultPort) throw new Error('website_nonstandard_port_not_allowed');

  return await new Promise((resolve,reject)=>{
    let settled=false;
    const fail=(error)=>{
      if(settled) return;
      settled=true;
      reject(error instanceof Error?error:new Error(String(error)));
    };
    const options={
      protocol:url.protocol,
      hostname:address,
      family:net.isIP(address),
      port,
      method:'GET',
      path:(url.pathname||'/')+(url.search||''),
      headers:{
        host:url.host,
        accept:'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5',
        'accept-encoding':'identity',
        'user-agent':'Evercraft-Fabric-Website-Preview/1.0',
        connection:'close',
      },
    };
    if(secure){
      options.servername=url.hostname;
      options.rejectUnauthorized=true;
      options.checkServerIdentity=(_host,cert)=>tls.checkServerIdentity(url.hostname,cert);
    }

    const req=transport.request(options,(res)=>{
      const status=Number(res.statusCode||0);
      const headers=Object.fromEntries(
        Object.entries(res.headers).map(([key,value])=>[
          key.toLowerCase(),
          Array.isArray(value)?value.join(', '):String(value??''),
        ])
      );
      const declared=Number(headers['content-length']||0);
      if(Number.isFinite(declared)&&declared>maxBytes){
        res.destroy();
        return fail(new Error('website_response_too_large'));
      }

      const chunks=[];
      let total=0;
      res.on('data',(chunk)=>{
        total+=chunk.length;
        if(total>maxBytes){
          res.destroy();
          fail(new Error('website_response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('error',fail);
      res.on('end',()=>{
        if(settled) return;
        settled=true;
        resolve({
          status,
          headers,
          body:Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.setTimeout(timeoutMs,()=>req.destroy(new Error('website_fetch_timeout')));
    req.on('error',(error)=>{
      if(error?.message==='website_fetch_timeout') return fail(error);
      fail(new Error('website_fetch_failed'));
    });
    req.end();
  });
}

function tagAttributes(tag){
  const out={};
  for(const match of tag.matchAll(/\s([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
    out[String(match[1]).toLowerCase()]=match[2]??match[3]??match[4]??'';
  }
  return out;
}

function stripHtml(value){
  return String(value||'')
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/\s+/g,' ')
    .trim();
}

function firstTagText(html,name){
  const match=String(html).match(new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'));
  return match?stripHtml(match[1]):'';
}

function metadata(html){
  const meta={};
  for(const tag of String(html).match(/<meta\b[^>]*>/gi)||[]){
    const attrs=tagAttributes(tag);
    const key=String(attrs.name||attrs.property||'').toLowerCase();
    if(key&&attrs.content!==undefined) meta[key]=clean(attrs.content,1000);
  }
  return meta;
}

function linkMetadata(html){
  const links=[];
  for(const tag of String(html).match(/<link\b[^>]*>/gi)||[]){
    const attrs=tagAttributes(tag);
    links.push(attrs);
  }
  return links;
}

function countMatches(html,pattern){
  return (String(html).match(pattern)||[]).length;
}

function buildFindings(snapshot){
  const findings=[];
  const add=(severity,code,finding,evidence)=>findings.push({severity,code,finding,evidence});

  if(snapshot.http_status<200||snapshot.http_status>=400){
    add('high','http_status','The page did not return a normal successful HTTP status.',String(snapshot.http_status));
  }
  if(!snapshot.title){
    add('high','title_missing','The page is missing a title element.','No <title> text observed.');
  }else if(snapshot.title.length<20||snapshot.title.length>65){
    add('medium','title_length_review','The page title length is worth reviewing.',snapshot.title.length+' characters observed.');
  }
  if(!snapshot.meta_description){
    add('medium','meta_description_missing','No meta description was observed.','No description meta tag observed.');
  }
  if(!snapshot.viewport){
    add('high','viewport_missing','No viewport meta tag was observed, which can hurt mobile presentation.','No viewport meta tag observed.');
  }
  if(snapshot.h1_count===0){
    add('medium','h1_missing','No H1 heading was observed.','0 H1 elements observed.');
  }else if(snapshot.h1_count>1){
    add('low','h1_multiple','Multiple H1 headings were observed and may deserve a structure review.',snapshot.h1_count+' H1 elements observed.');
  }
  if(!snapshot.canonical_url){
    add('low','canonical_missing','No canonical URL declaration was observed.','No rel=canonical link observed.');
  }
  if(snapshot.noindex){
    add('high','noindex_observed','The page declares noindex. Confirm that this is intentional.',snapshot.robots||'noindex');
  }
  if(snapshot.image_count>0&&snapshot.images_missing_alt>0){
    add('medium','image_alt_gaps','Some images do not expose a non-empty alt attribute.',snapshot.images_missing_alt+' of '+snapshot.image_count+' images observed without non-empty alt text.');
  }
  if(snapshot.structured_data_blocks===0){
    add('low','structured_data_absent','No JSON-LD structured-data block was observed. This may be an opportunity depending on the business and page type.','0 application/ld+json blocks observed.');
  }
  if(!snapshot.has_contact_signal){
    add('low','contact_signal_weak','No obvious telephone, email, contact, quote, booking, or schedule signal was observed in the bounded HTML preview.','Bounded text/link scan found no strong contact signal.');
  }
  return findings.slice(0,8);
}

export function analyzePublicWebsiteHtml({url,status,headers={},html,fetchDurationMs=null}){
  const meta=metadata(html);
  const links=linkMetadata(html);
  const canonical=links.find((x)=>String(x.rel||'').toLowerCase().split(/\s+/).includes('canonical'))?.href||'';
  const htmlTag=String(html).match(/<html\b[^>]*>/i)?.[0]||'';
  const htmlAttrs=htmlTag?tagAttributes(htmlTag):{};
  const imageTags=String(html).match(/<img\b[^>]*>/gi)||[];
  const imagesMissingAlt=imageTags.filter((tag)=>{
    const attrs=tagAttributes(tag);
    return !('alt' in attrs)||!clean(attrs.alt,500);
  }).length;
  const text=stripHtml(html);
  const hrefs=(String(html).match(/<a\b[^>]*href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi)||[]).join(' ');
  const hasContactSignal=/mailto:|tel:/i.test(hrefs)||/\b(contact|call|quote|estimate|book|schedule|appointment|request)\b/i.test(text);
  const robots=clean(meta.robots||meta['googlebot']||'',500);
  const snapshot={
    final_url:String(url),
    http_status:Number(status),
    content_type:clean(headers['content-type']||'',200)||null,
    fetch_duration_ms:Number.isFinite(fetchDurationMs)?Math.round(fetchDurationMs):null,
    title:clean(firstTagText(html,'title'),300)||null,
    meta_description:clean(meta.description||'',1000)||null,
    viewport:clean(meta.viewport||'',500)||null,
    robots:robots||null,
    noindex:/\bnoindex\b/i.test(robots),
    canonical_url:clean(canonical,2048)||null,
    html_lang:clean(htmlAttrs.lang||'',40)||null,
    h1_count:countMatches(html,/<h1\b[^>]*>/gi),
    h2_count:countMatches(html,/<h2\b[^>]*>/gi),
    image_count:imageTags.length,
    images_missing_alt:imagesMissingAlt,
    form_count:countMatches(html,/<form\b[^>]*>/gi),
    structured_data_blocks:countMatches(html,/<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>/gi),
    word_count:text?text.split(/\s+/).filter(Boolean).length:0,
    has_contact_signal:hasContactSignal,
  };
  return {
    schema:'evercraft.public-website-preview.v1',
    observed:snapshot,
    findings:buildFindings(snapshot),
    limitations:[
      'This is a bounded HTML/HTTP preview, not a full crawl, Core Web Vitals lab test, accessibility certification, security audit, or ranking guarantee.',
      'Dynamic client-rendered content may not be visible in the fetched HTML.',
      'Findings describe observed signals and should be reviewed in the context of the site owner’s goals.',
    ],
  };
}

export async function previewPublicWebsite(value,{
  lookup=dns.lookup,
  requestImpl=requestPinned,
  timeoutMs=DEFAULT_TIMEOUT_MS,
  maxBytes=DEFAULT_MAX_BYTES,
  maxRedirects=DEFAULT_MAX_REDIRECTS,
}={}){
  if(typeof requestImpl!=='function') throw new Error('website_fetch_unavailable');
  let url=normalizeUrl(value);
  const started=Date.now();

  for(let redirects=0;redirects<=maxRedirects;redirects+=1){
    const resolved=await assertPublicHost(url.hostname,{lookup});
    const address=resolved[0]?.address;
    if(!address||!isPublicIp(address)) throw new Error('website_dns_resolution_failed');

    const response=await requestImpl(url,address,{timeoutMs,maxBytes});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers?.location;
      if(!location) throw new Error('website_redirect_missing_location');
      if(redirects>=maxRedirects) throw new Error('website_redirect_limit');
      url=new URL(location,url);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password){
        throw new Error('website_redirect_not_allowed');
      }
      continue;
    }

    const contentType=clean(response.headers?.['content-type']||'',200).toLowerCase();
    if(contentType&&!/^(text\/html|application\/xhtml\+xml|text\/plain)\b/.test(contentType)){
      throw new Error('website_content_type_not_supported');
    }

    const html=String(response.body||'');
    const headerObject={'content-type':contentType||null};
    return {
      ok:true,
      requested_url:clean(value,2048),
      ...analyzePublicWebsiteHtml({
        url:url.toString(),
        status:response.status,
        headers:headerObject,
        html,
        fetchDurationMs:Date.now()-started,
      }),
      transactional:false,
      external_action_taken:false,
      network_scope:'user_supplied_public_url_only',
    };
  }

  throw new Error('website_redirect_limit');
}
