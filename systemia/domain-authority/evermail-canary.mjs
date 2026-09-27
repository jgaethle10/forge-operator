import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';

const flattenTxt=rows=>rows.map(parts=>parts.join(''));
const normalize=value=>String(value||'').toLowerCase().replace(/\.$/,'');

async function safe(fn){
  try{return {ok:true,value:await fn()};}
  catch(error){return {ok:false,error:String(error?.code||error?.message||error)};}
}

function waitForReply(socket,timeoutMs=7000){
  return new Promise((resolve,reject)=>{
    let data='';
    const timer=setTimeout(()=>done(new Error('smtp_timeout')),timeoutMs);
    const onData=chunk=>{
      data+=chunk.toString('utf8');
      const lines=data.split(/\r?\n/).filter(Boolean);
      if(lines.length && /^\d{3} /.test(lines[lines.length-1])) done(null,data);
    };
    const onError=err=>done(err);
    const done=(err,value)=>{
      clearTimeout(timer);
      socket.off('data',onData);
      socket.off('error',onError);
      err?reject(err):resolve(value);
    };
    socket.on('data',onData);
    socket.on('error',onError);
  });
}

async function smtpStartTls(host,port=25,timeoutMs=8000){
  return await new Promise(resolve=>{
    const socket=net.connect({host,port});
    const fail=error=>{try{socket.destroy();}catch{} resolve({ok:false,error:String(error?.code||error?.message||error)});};
    socket.setTimeout(timeoutMs,()=>fail(new Error('smtp_connect_timeout')));
    socket.once('error',fail);
    socket.once('connect',async()=>{
      try{
        const banner=await waitForReply(socket,timeoutMs);
        if(!/^220[ -]/m.test(banner)) throw new Error('smtp_banner_invalid');
        socket.write('EHLO canary.evercraft.invalid\r\n');
        const ehlo=await waitForReply(socket,timeoutMs);
        if(!/^250[ -]/m.test(ehlo)) throw new Error('smtp_ehlo_failed');
        if(!/STARTTLS/i.test(ehlo)) throw new Error('smtp_starttls_not_advertised');
        socket.write('STARTTLS\r\n');
        const starttls=await waitForReply(socket,timeoutMs);
        if(!/^220[ -]/m.test(starttls)) throw new Error('smtp_starttls_rejected');

        socket.removeAllListeners('error');
        socket.setTimeout(0);
        const secure=tls.connect({
          socket,
          servername:host,
          rejectUnauthorized:true,
        });
        secure.setTimeout(timeoutMs,()=>{secure.destroy();resolve({ok:false,error:'smtp_tls_timeout'});});
        secure.once('error',error=>resolve({ok:false,error:String(error.code||error.message)}));
        secure.once('secureConnect',()=>{
          const cert=secure.getPeerCertificate();
          const out={
            ok:secure.authorized===true,
            trusted_tls:secure.authorized===true,
            authorization_error:secure.authorizationError||null,
            protocol:secure.getProtocol()||null,
            subject_cn:cert?.subject?.CN||null,
            valid_to:cert?.valid_to||null,
            starttls_advertised:true,
          };
          secure.write('QUIT\r\n');
          secure.end();
          resolve(out);
        });
      }catch(error){ fail(error); }
    });
  });
}

export async function inspectEvermail({
  domain,
  selector='evercraft1',
  expectedMailHost=null,
  expectedOutboundIp=null,
  smtpPort=25,
}={}){
  const zone=normalize(domain);
  if(!zone) throw new Error('domain_required');
  const dkimName=`${selector}._domainkey.${zone}`;
  const [mx,spf,dmarc,dkim,tlsRpt,mtaSts]=await Promise.all([
    safe(()=>dns.resolveMx(zone)),
    safe(()=>dns.resolveTxt(zone)),
    safe(()=>dns.resolveTxt(`_dmarc.${zone}`)),
    safe(()=>dns.resolveTxt(dkimName)),
    safe(()=>dns.resolveTxt(`_smtp._tls.${zone}`)),
    safe(()=>dns.resolveTxt(`_mta-sts.${zone}`)),
  ]);
  const mxRows=mx.ok?mx.value.sort((a,b)=>a.priority-b.priority):[];
  const mailHost=normalize(expectedMailHost || mxRows[0]?.exchange || '');
  const spfRows=spf.ok?flattenTxt(spf.value):[];
  const dmarcRows=dmarc.ok?flattenTxt(dmarc.value):[];
  const dkimRows=dkim.ok?flattenTxt(dkim.value):[];
  const tlsRptRows=tlsRpt.ok?flattenTxt(tlsRpt.value):[];
  const mtaStsRows=mtaSts.ok?flattenTxt(mtaSts.value):[];

  const mailA=mailHost?await safe(()=>dns.resolve4(mailHost)):({ok:false,error:'mail_host_missing'});
  const mailAAAA=mailHost?await safe(()=>dns.resolve6(mailHost)):({ok:false,error:'mail_host_missing'});
  const addresses=[
    ...(mailA.ok?mailA.value:[]),
    ...(mailAAAA.ok?mailAAAA.value:[]),
  ];

  let reverse={ok:false,error:'outbound_ip_not_supplied'};
  if(expectedOutboundIp){
    reverse=await safe(()=>dns.reverse(expectedOutboundIp));
  }else if(addresses.length){
    reverse=await safe(()=>dns.reverse(addresses[0]));
  }
  const ptrs=reverse.ok?reverse.value.map(normalize):[];
  const ptrMatchesMailHost=Boolean(mailHost && ptrs.includes(mailHost));

  const smtp=mailHost?await smtpStartTls(mailHost,Number(smtpPort)||25):{ok:false,error:'mail_host_missing'};
  const expectedMxMatches=!expectedMailHost || mxRows.some(x=>normalize(x.exchange)===normalize(expectedMailHost));

  const gates={
    mx_publicly_resolvable:mxRows.length>0,
    expected_mx_matches:expectedMxMatches,
    mail_host_has_address:addresses.length>0,
    spf_present:spfRows.some(v=>/^v=spf1\b/i.test(v)),
    dmarc_present:dmarcRows.some(v=>/^v=DMARC1\b/i.test(v)),
    dkim_present:dkimRows.some(v=>/^v=DKIM1\b/i.test(v)),
    tls_reporting_present:tlsRptRows.some(v=>/^v=TLSRPTv1\b/i.test(v)),
    mta_sts_dns_present:mtaStsRows.some(v=>/^v=STSv1\b/i.test(v)),
    reverse_dns_matches_mail_host:ptrMatchesMailHost,
    smtp_starttls_trusted:smtp.ok===true,
  };

  return {
    schema:'evercraft.evermail.public-canary.v1',
    domain:zone,
    selector,
    mail_host:mailHost||null,
    ready:Object.values(gates).every(Boolean),
    gates,
    observed:{
      mx:mxRows,
      addresses,
      ptr:ptrs,
      spf:spfRows.filter(v=>/^v=spf1\b/i.test(v)),
      dmarc:dmarcRows.filter(v=>/^v=DMARC1\b/i.test(v)),
      dkim:dkimRows.filter(v=>/^v=DKIM1\b/i.test(v)).map(v=>v.replace(/p=([^;\s]+)/i,'p=[redacted-public-key]')),
      tls_reporting:tlsRptRows,
      mta_sts:mtaStsRows,
      smtp,
    },
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const args=Object.fromEntries(process.argv.slice(2).map(item=>{
    const [k,...rest]=item.replace(/^--/,'').split('=');
    return [k,rest.join('=')];
  }));
  const result=await inspectEvermail({
    domain:args.domain,
    selector:args.selector||'evercraft1',
    expectedMailHost:args['mail-host']||null,
    expectedOutboundIp:args['outbound-ip']||null,
    smtpPort:Number(args.port||25),
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.ready) process.exitCode=2;
}
