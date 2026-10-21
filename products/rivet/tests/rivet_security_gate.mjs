import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));
let passed = 0;
const checks = [];

function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  if (condition) passed += 1;
}

const ownerEntities = [
  'RIVETClient',
  'RIVETInvoice',
  'RIVETPropertyListing',
  'RIVETBrokerCheckout',
];

const customerReadable = {
  RIVETReport: 'data.customer_email',
  RIVETPurchase: 'data.buyer_email',
};

function hasTemplate(value, key, template) {
  return JSON.stringify(value).includes(`"${key}":"${template}"`);
}

for (const entity of [...ownerEntities, ...Object.keys(customerReadable)]) {
  const schema = json(`base44/entities/${entity}.jsonc`);
  const rls = schema.rls || {};
  check(`${entity} has create RLS`, Boolean(rls.create));
  check(`${entity} has read RLS`, Boolean(rls.read));
  check(`${entity} has update RLS`, Boolean(rls.update));
  check(`${entity} has delete RLS`, Boolean(rls.delete));
  check(`${entity} delete remains admin-only`,
    JSON.stringify(rls.delete) === JSON.stringify({ user_condition: { role: 'admin' } })
  );
}

for (const entity of ownerEntities) {
  const schema = json(`base44/entities/${entity}.jsonc`);
  const readRule = JSON.stringify(schema.rls?.read || {});
  check(`${entity} read is owner/admin only`,
    readRule.includes('"role":"admin"') &&
    readRule.includes('"data.rivet_owner":true') &&
    !readRule.includes('{{user.email}}')
  );
}

for (const [entity, field] of Object.entries(customerReadable)) {
  const schema = json(`base44/entities/${entity}.jsonc`);
  check(`${entity} customer read is identity-bound`,
    hasTemplate(schema.rls?.read || {}, field, '{{user.email}}')
  );
  check(`${entity} customer identity does not grant writes`,
    !JSON.stringify(schema.rls?.create || {}).includes('{{user.email}}') &&
    !JSON.stringify(schema.rls?.update || {}).includes('{{user.email}}')
  );
}

const checkout = read('base44/functions/createReportCheckout/entry.ts');
check('checkout requires authenticated user', checkout.includes("if(!user?.id||!user?.email)"));
check('checkout return origin requires HTTPS', checkout.includes("u.protocol!=='https:'"));
check('checkout never treats browser return as payment authority', checkout.includes('Browser return is not payment authority'));
check('checkout starts purchase pending', checkout.includes("status:'pending'"));

const verify = read('base44/functions/verifyReportCheckout/entry.ts');
check('payment verification requires authenticated user', verify.includes("if(!user?.id||!user?.email)"));
check('payment verification binds purchase to signed-in email', verify.includes('purchase_owner_mismatch'));
check('payment verification binds checkout session', verify.includes('checkout_session_mismatch'));
check('payment verification requires broker confirmation', verify.includes('payment_confirmed!==true'));

const generate = read('base44/functions/generateQuickReport/entry.ts');
check('report generation requires authenticated user or one-time Systemia canary', generate.includes("if(!me?.id&&!systemiaCanary?.allowed)"));
check('Systemia canary token is hash-bound', generate.includes("x-systemia-rivet-canary") && generate.includes("RIVET_GENERATOR_CANARY_V1") && generate.includes("clean(envelope?.hash)===actualHash"));
check('Systemia canary is report/address/expiry bound', generate.includes("clean(envelope?.report_id)===reportId") && generate.includes("normAddress(report?.address)") && generate.includes("expiry>Date.now()"));
check('Systemia canary is consumed before generation', generate.includes("aliev_report_data_json:''") && generate.includes("systemia_one_time_generator_canary"));
check('report generation enforces owner/customer authorization', generate.includes('if(!ownerAccess&&!customerAccess)'));
check('customer generation requires paid purchase', generate.includes("paidPurchase.status!=='paid'"));
check('customer generation requires Stripe session evidence', generate.includes("startsWith('cs_')"));
check('redacted upstream payloads are rejected', generate.includes("evidence_state==='PUBLIC_DISCOVERY_REDACTED'"));
check('commercial upstream authorization is required', generate.includes("commercial_access!==true"));

const suggestions = read('base44/functions/addressSuggestions/entry.ts');
check('address suggestion proxy requires auth', suggestions.includes("if(!auth)return Response.json({error:'Authentication required'},{status:401})"));
check('address suggestion input is bounded', suggestions.includes('.slice(0,200)'));

const availability = read('base44/functions/reportAvailability/entry.ts');
check('availability requires auth', availability.includes("if(!auth)return Response.json({ok:false,error:'Authentication required'},{status:401})"));
check('availability input is bounded', availability.includes("clean(body?.address,500)"));

for (const result of checks) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
}
if (passed !== checks.length) {
  console.error(`RIVET_SECURITY_GATE_FAIL ${passed}/${checks.length}`);
  process.exit(1);
}
console.log(`RIVET_SECURITY_GATE_PASS ${passed}/${checks.length}`);