import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUTPUT = 'artifacts/owned-business-rescue';
const SOURCES = [
  { source: 'public/eps/index.html', target: 'eps/index.html' },
  { source: 'public/apps/eps-estimator/index.html', target: 'eps/apps/eps-estimator/index.html' },
  { source: 'public/havenly/index.html', target: 'havenly/index.html' }
];
const REQUIRED = {
  'eps/index.html': ['Evercraft Property Services', 'sms:+15099103256', 'mailto:jesse@evercraftpropertyservices.com'],
  'eps/apps/eps-estimator/index.html': ['EPS Precise Estimator'],
  'havenly/index.html': ['HAVENLY Cleaning', 'sms:+15095605190', 'mailto:havenlycleaning@gmail.com']
};

export function validatePage(target, html) {
  if (!/<!doctype html>/i.test(html) || !/<html\b/i.test(html)) throw new Error('invalid_html:'+target);
  if (/base44\.app|@base44|base44Client|base44-prod/i.test(html)) throw new Error('legacy_provider_dependency:'+target);
  for (const marker of REQUIRED[target] || []) {
    if (!html.includes(marker)) throw new Error('missing_critical_customer_route:'+target+':'+marker);
  }
  return crypto.createHash('sha256').update(html).digest('hex');
}

export function buildOwnedBusinessRescue(root = process.cwd(), output = OUTPUT) {
  const dest = path.resolve(root, output);
  const inventory = [];
  for (const item of SOURCES) {
    const file = path.resolve(root, item.source);
    const html = fs.readFileSync(file,'utf8');
    const sha256 = validatePage(item.target, html);
    const out = path.resolve(dest,item.target);
    fs.mkdirSync(path.dirname(out),{recursive:true});
    fs.writeFileSync(out,html);
    inventory.push({target:item.target,sha256,bytes:Buffer.byteLength(html,'utf8')});
  }
  const receipt = {
    schema:'evercraft.owned-business-rescue.build-receipt.v1',
    classification:'portable_static_package_not_deployed',
    sites:['EPS','HAVENLY'],
    files:inventory,
    no_base44_runtime_dependency_in_frontage:true,
    server_form_delivery_verified:false,
    external_hosting_verified:false,
    dns_cutover_verified:false,
    online_customer_path_verified:false,
    user_contact_launch_methods:'device_SMS_or_email',
    final_acceptance:'human_review_and_independent_live_route_required'
  };
  fs.writeFileSync(path.resolve(dest,'build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}

if(process.argv[1] && import.meta.url === new URL('file://'+path.resolve(process.argv[1])).href) {
  const report=buildOwnedBusinessRescue();
  process.stdout.write(JSON.stringify(report)+'\n');
}
