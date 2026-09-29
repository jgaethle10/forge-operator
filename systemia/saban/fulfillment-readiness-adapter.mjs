import registry from '../organism/product-fulfillment-registry.json' with { type: 'json' };

function getProfile(publicId) {
  return registry.products.find((row) => row.public_id === publicId) || null;
}

export async function runAssignment({ assignment }) {
  const item = assignment?.item || {};
  const publicId = item.public_id || item.key || item.raw?.public_id || null;
  const profile = getProfile(publicId);
  const role = assignment?.role || 'unknown';

  const checks = {
    profile_present:Boolean(profile),
    intake_declared:Boolean(profile?.intake?.length),
    deliverables_declared:Boolean(profile?.deliverables?.length),
    qa_declared:Boolean(profile?.qa?.length),
    coordinator_systemia:Boolean(profile?.specialist_roles?.includes('Systemia')),
    completion_receipt_required:true,
    expansion_human_gated:true
  };

  return {
    schema:'evercraft.saban.fulfillment-readiness-finding.v1',
    status:Object.values(checks).every(Boolean) ? 'completed' : 'gap',
    public_id:publicId,
    product_name:profile?.name || item.name || null,
    role,
    execution_mode:profile?.execution_mode || null,
    native_state:profile?.native_state || null,
    checks,
    boundary:{
      no_payment_action:true,
      no_customer_contact:true,
      no_private_access:true,
      no_production_mutation:true,
      saban_is_not_authority:true
    }
  };
}

export async function reconcile({ results }) {
  const rows = (results || []).filter(Boolean);
  const byProduct = new Map();
  for (const row of rows) {
    if (!row.public_id) continue;
    if (!byProduct.has(row.public_id)) byProduct.set(row.public_id, []);
    byProduct.get(row.public_id).push(row);
  }

  const products = [];
  for (const profile of registry.products) {
    const findings = byProduct.get(profile.public_id) || [];
    const failed = findings.filter((r) => r.status !== 'completed');
    products.push({
      public_id:profile.public_id,
      name:profile.name,
      role_passes:findings.length,
      gap_count:failed.length,
      state:failed.length ? 'gap' : findings.length ? 'contract_ready' : 'not_observed'
    });
  }

  return {
    schema:'evercraft.saban.fulfillment-readiness-reconciliation.v1',
    status:products.every((p) => p.state === 'contract_ready') ? 'reconciled' : 'gaps_present',
    product_count:products.length,
    contract_ready:products.filter((p) => p.state === 'contract_ready').length,
    gaps:products.filter((p) => p.state === 'gap'),
    not_observed:products.filter((p) => p.state === 'not_observed'),
    products,
    boundary:{
      contract_readiness_is_not_live_customer_delivery_proof:true,
      no_payment_or_outreach_side_effects:true
    }
  };
}
