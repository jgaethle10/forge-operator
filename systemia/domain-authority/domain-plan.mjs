import net from 'node:net';

function cleanDomain(value){
  const domain=String(value||'').trim().toLowerCase().replace(/\.$/,'');
  if(!domain || domain.length>253) throw new Error('invalid_domain');
  for(const label of domain.split('.')){
    if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) throw new Error('invalid_domain_label');
  }
  return domain;
}

function validIp(value, family){
  const v=String(value||'').trim();
  if(!v) return null;
  if(net.isIP(v)!==family) throw new Error(family===4?'invalid_ipv4':'invalid_ipv6');
  return v;
}

function cleanHost(value, domain){
  const raw=String(value||'').trim().toLowerCase().replace(/\.$/,'');
  if(!raw) throw new Error('hostname_required');
  const host=raw.includes('.')?raw:`${raw}.${domain}`;
  cleanDomain(host);
  return host;
}

function fqdn(value){ return `${String(value).replace(/\.$/,'')}.`; }
function quoteTxt(value){ return `"${String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`; }

export function buildDomainPlan({
  domain,
  publicIpv4,
  publicIpv6=null,
  nameservers=[],
  mailHost='mail',
  edgeHost='edge',
  serviceHosts=[],
  dkimSelector='evercraft1',
  dkimPublicKey='',
  serial=null,
  ttl=300,
  soaRefresh=900,
  soaRetry=300,
  soaExpire=1209600,
  soaMinimum=300,
}={}){
  const zone=cleanDomain(domain);
  const ipv4=validIp(publicIpv4,4);
  const ipv6=validIp(publicIpv6,6);
  if(!ipv4 && !ipv6) throw new Error('public_ip_required');

  const ns=(Array.isArray(nameservers)?nameservers:[])
    .map(item=>{
      if(typeof item==='string') return {host:cleanHost(item,zone),ipv4:null,ipv6:null};
      const host=cleanHost(item?.host,zone);
      return {host,ipv4:validIp(item?.ipv4,4),ipv6:validIp(item?.ipv6,6)};
    });
  if(ns.length<2) throw new Error('two_authoritative_nameservers_required');
  if(new Set(ns.map(x=>x.host)).size!==ns.length) throw new Error('duplicate_nameserver_hostname');

  const mail=cleanHost(mailHost,zone);
  const edge=cleanHost(edgeHost,zone);
  const services=[...new Set(
    (Array.isArray(serviceHosts)?serviceHosts:[])
      .map(host=>cleanHost(host,zone))
      .filter(host=>host!==zone && host!==mail && host!==edge)
  )];
  const selector=String(dkimSelector||'').trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(selector)) throw new Error('invalid_dkim_selector');
  const dkimKey=String(dkimPublicKey||'').replace(/\s+/g,'').trim();
  const now=new Date();
  const defaultSerial=Number(
    `${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}01`
  );
  const zoneSerial=Number(serial||defaultSerial);
  if(!Number.isSafeInteger(zoneSerial)||zoneSerial<1) throw new Error('invalid_serial');

  const records=[];
  const add=(name,type,value,recordTtl=ttl)=>records.push({name,type,value,ttl:recordTtl});
  const primary=ns[0].host;
  add('@','SOA',`${fqdn(primary)} hostmaster.${fqdn(zone)} ${zoneSerial} ${soaRefresh} ${soaRetry} ${soaExpire} ${soaMinimum}`);
  for(const server of ns) add('@','NS',fqdn(server.host));
  if(ipv4){
    add('@','A',ipv4);
    add(mail,'A',ipv4);
    add(edge,'A',ipv4);
    for(const host of services) add(host,'A',ipv4);
  }
  if(ipv6){
    add('@','AAAA',ipv6);
    add(mail,'AAAA',ipv6);
    add(edge,'AAAA',ipv6);
    for(const host of services) add(host,'AAAA',ipv6);
  }

  for(const server of ns){
    if(server.host.endsWith('.'+zone)){
      if(server.ipv4) add(server.host,'A',server.ipv4);
      if(server.ipv6) add(server.host,'AAAA',server.ipv6);
    }
  }

  add('@','MX',`10 ${fqdn(mail)}`);
  add('@','TXT',quoteTxt('v=spf1 mx -all'));
  add('_dmarc','TXT',quoteTxt(`v=DMARC1; p=quarantine; rua=mailto:dmarc@${zone}; ruf=mailto:dmarc@${zone}; adkim=s; aspf=s; fo=1`));
  add('_smtp._tls','TXT',quoteTxt(`v=TLSRPTv1; rua=mailto:tlsrpt@${zone}`));
  add('_mta-sts','TXT',quoteTxt(`v=STSv1; id=${zoneSerial}`));
  if(dkimKey) add(`${selector}._domainkey`,'TXT',quoteTxt(`v=DKIM1; k=rsa; p=${dkimKey}`));

  const nsIps=ns.flatMap(x=>[x.ipv4,x.ipv6]).filter(Boolean);
  const independentNsAddresses=new Set(nsIps).size;
  const inBailiwickMissingGlue=ns
    .filter(x=>x.host.endsWith('.'+zone) && !x.ipv4 && !x.ipv6)
    .map(x=>x.host);

  const gates={
    two_authoritative_nameservers:ns.length>=2,
    independent_nameserver_addresses:independentNsAddresses>=2,
    in_bailiwick_glue_complete:inBailiwickMissingGlue.length===0,
    dkim_public_key_present:Boolean(dkimKey),
    mx_present:true,
    spf_present:true,
    dmarc_present:true,
    tls_reporting_present:true,
    mta_sts_dns_present:true,
  };

  return {
    schema:'evercraft.domain-authority.plan.v1',
    domain:zone,
    serial:zoneSerial,
    ttl,
    public:{ipv4,ipv6,edge_host:edge,mail_host:mail,service_hosts:services},
    nameservers:ns,
    mail:{
      mx_host:mail,
      dkim_selector:selector,
      dkim_public_key_present:Boolean(dkimKey),
      required_role_addresses:[
        `postmaster@${zone}`,
        `abuse@${zone}`,
        `dmarc@${zone}`,
        `tlsrpt@${zone}`,
      ],
    },
    records,
    gates,
    ready_for_delegation:Object.values(gates).every(Boolean),
    holds:[
      ...(independentNsAddresses<2?['nameservers_need_two_distinct_public_addresses']:[]),
      ...inBailiwickMissingGlue.map(host=>`missing_glue_address:${host}`),
      ...(!dkimKey?['dkim_public_key_not_supplied']:[]),
    ],
  };
}

export function renderZone(plan){
  if(!plan || plan.schema!=='evercraft.domain-authority.plan.v1') throw new Error('invalid_domain_plan');
  const zone=plan.domain;
  const owner=(name)=>{
    const v=String(name);
    if(v==='@') return '@';
    if(v.endsWith('.')) return v;
    if(v===zone || v.endsWith('.'+zone)) return fqdn(v);
    return v;
  };
  const lines=[
    `$ORIGIN ${fqdn(zone)}`,
    `$TTL ${plan.ttl}`,
    '',
  ];
  for(const record of plan.records){
    lines.push(`${owner(record.name)} ${record.ttl} IN ${record.type} ${record.value}`);
  }
  return lines.join('\n')+'\n';
}

if(import.meta.url===`file://${process.argv[1]}`){
  const args=Object.fromEntries(process.argv.slice(2).map(item=>{
    const [k,...rest]=item.replace(/^--/,'').split('=');
    return [k,rest.join('=')];
  }));
  const nameservers=String(args.nameservers||'').split(',').filter(Boolean).map(entry=>{
    const [host,ipv4,ipv6]=entry.split('|');
    return {host,ipv4:ipv4||null,ipv6:ipv6||null};
  });
  const plan=buildDomainPlan({
    domain:args.domain,
    publicIpv4:args.ipv4||null,
    publicIpv6:args.ipv6||null,
    nameservers,
    mailHost:args['mail-host']||'mail',
    edgeHost:args['edge-host']||'edge',
    serviceHosts:String(args['service-hosts']||'').split(',').map(x=>x.trim()).filter(Boolean),
    dkimSelector:args['dkim-selector']||'evercraft1',
    dkimPublicKey:args['dkim-public-key']||'',
  });
  if(args.zone==='true') process.stdout.write(renderZone(plan));
  else process.stdout.write(JSON.stringify(plan,null,2)+'\n');
}
