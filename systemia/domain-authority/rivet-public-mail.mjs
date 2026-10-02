const forbiddenTokens=['evercraft','systemia','base44'];

function normalizeDomain(value){
  const domain=String(value||'').trim().toLowerCase().replace(/^@/,'').replace(/\.$/,'');
  if(!domain) throw new Error('rivet_public_mail_domain_required');
  if(domain.length>253) throw new Error('invalid_domain');
  const labels=domain.split('.');
  if(labels.length<2) throw new Error('public_dns_domain_required');
  for(const label of labels){
    if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) throw new Error('invalid_domain_label');
  }
  if(forbiddenTokens.some(token=>domain.includes(token))) throw new Error('rivet_public_domain_leaks_parent_brand');
  return domain;
}

function cleanLocalPart(value){
  const local=String(value||'').trim().toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(local)) throw new Error('invalid_mailbox_local_part');
  return local;
}

export function buildRivetPublicMailPlan({domain,mailboxes=[]}={}){
  const publicDomain=normalizeDomain(domain);
  const seen=new Set();
  const addresses=mailboxes.map(mailbox=>{
    const local=cleanLocalPart(mailbox?.local_part);
    if(seen.has(local)) throw new Error('duplicate_mailbox_local_part');
    seen.add(local);
    const internalIdentity=String(mailbox?.internal_identity||`evercraft://mail/rivet/${local}`);
    if(!internalIdentity.startsWith('evercraft://mail/rivet/')) throw new Error('invalid_internal_rivet_mail_identity');
    return {
      local_part:local,
      internal_identity:internalIdentity,
      public_address:`${local}@${publicDomain}`,
      display_name:String(mailbox?.display_name||'RIVET'),
      purpose:String(mailbox?.purpose||''),
      send:mailbox?.send===true,
      receive:mailbox?.receive!==false,
    };
  });
  const required=['postmaster','abuse','dmarc','tlsrpt'];
  const missingRequired=required.filter(local=>!seen.has(local));
  const staff=['paola','daryl','jess','jesse'].filter(local=>seen.has(local));
  const commerce=['invoices','billing','hello','ops'].filter(local=>seen.has(local));
  const publicLeak=addresses.some(row=>forbiddenTokens.some(token=>row.public_address.includes(token)));
  return {
    schema:'evercraft.rivet.public-mail-plan.v1',
    brand:'RIVET',
    logical_service:'evercraft://mail/rivet',
    internal_namespace:'rivet.evercraft',
    public_domain:publicDomain,
    public_addresses:addresses,
    staff_addresses:staff.map(local=>`${local}@${publicDomain}`),
    commerce_addresses:commerce.map(local=>`${local}@${publicDomain}`),
    default_invoice_sender:seen.has('invoices')?`invoices@${publicDomain}`:null,
    gates:{
      standalone_rivet_domain_selected:true,
      parent_brand_not_public:!publicLeak,
      required_role_addresses_present:missingRequired.length===0,
      at_least_one_staff_sender:staff.length>0,
      invoice_sender_present:seen.has('invoices'),
    },
    missing_required_role_addresses:missingRequired,
    ready_for_dns_mail_promotion:!publicLeak && missingRequired.length===0 && staff.length>0 && seen.has('invoices'),
  };
}

export function assertRivetPublicMailPlan(plan){
  if(!plan||plan.schema!=='evercraft.rivet.public-mail-plan.v1') throw new Error('invalid_rivet_public_mail_plan');
  const failed=Object.entries(plan.gates||{}).filter(([,ok])=>ok!==true).map(([gate])=>gate);
  if(failed.length) throw new Error(`rivet_public_mail_plan_failed:${failed.join(',')}`);
  return true;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const args=Object.fromEntries(process.argv.slice(2).map(item=>{
    const [k,...rest]=item.replace(/^--/,'').split('=');
    return [k,rest.join('=')];
  }));
  const fs=await import('node:fs/promises');
  const manifestPath=args.manifest||new URL('./rivet-mailboxes.json',import.meta.url);
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  const plan=buildRivetPublicMailPlan({
    domain:args.domain||process.env.RIVET_PUBLIC_MAIL_DOMAIN,
    mailboxes:manifest.mailboxes,
  });
  if(args.strict==='true') assertRivetPublicMailPlan(plan);
  process.stdout.write(JSON.stringify(plan,null,2)+'\n');
}
