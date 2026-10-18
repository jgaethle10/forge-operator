// Human-facing offer explanation only. The canonical amount, SKU, processor,
// confirmation rules and fulfillment gate remain in public-payment-offers.mjs.
// No invented agent mappings, new prices, checkout implementation or guarantees.
export const PORTFOLIO_OFFER_COPY = Object.freeze({
  'browser-diagnosis': {
    eyebrow: 'Browser Workflow Diagnosis',
    headline: 'Your browser workflow should not depend on lucky clicks.',
    lede: 'Start with one browser task. Understand its inputs, fragile steps, permissions and human approval points before attempting automation.',
    promise: 'A scoped diagnosis of one authorized browser workflow, including practical failure and permission boundaries. This is not an unattended automation deployment.',
    send: [
      'A description of the browser task and where it gets stuck',
      'The steps a human follows and the expected result',
      'Which actions require a person to review or approve them. No passwords or session cookies',
    ],
    get: [
      'One bounded workflow diagnosis and proposed step sequence',
      'Identified failure, permission and human-approval checkpoints',
      'Suggested acceptance tests for any separately approved implementation',
    ],
    steps: [
      ['1. Describe one task', 'Keep the scope to one authorized browser workflow.'],
      ['2. Diagnose the handoffs', 'Separate repeatable steps from risky or ambiguous actions.'],
      ['3. Decide what to build', 'Review the diagnosis before authorizing any browser execution.'],
    ],
  },
  'payments-pilot': {
    eyebrow: 'Evercraft Payments Integration',
    headline: 'A checkout is the beginning. A verified order is the job.',
    lede: 'Scope one buyer-owned processor offer and the order-state handling around it. Preserve the merchant relationship, exact prices and authorization boundaries.',
    promise: 'One bounded founding integration for an approved processor-backed offer, subject to scoped access and acceptance checks. No promise of changed payment volume.',
    send: [
      'The buyer-owned processor and exact product or service being sold',
      'How an order is currently created, checked and delivered',
      'The approval and compliance constraints on the integration. Never paste live API keys',
    ],
    get: [
      'A scoped path for one approved offer and its checkout handoff',
      'Required paid-state, retry, entitlement and error-handling controls',
      'Verification and handoff criteria before any production launch',
    ],
    steps: [
      ['1. Confirm the offer', 'Scope one merchant-approved product and processor.'],
      ['2. Review order authority', 'Agree who may prepare checkout, confirm payment and release delivery.'],
      ['3. Prove the flow', 'Implementation and launch stay behind permissioned verification.'],
    ],
  },
  'legacy-xray': {
    eyebrow: 'Legacy Software X-Ray',
    headline: 'Understand the system before you replace it.',
    lede: 'A focused assessment of the dependencies and failure risks in one authorized legacy software workflow.',
    promise: 'One bounded dependency and risk diagnosis. It does not change production, migrate databases or promise a completed rescue.',
    send: [
      'The system or workflow you own or are authorized to assess',
      'What is failing and which business processes depend on it',
      'Safe architecture notes or non-sensitive evidence. No production credentials',
    ],
    get: [
      'A bounded view of the dependency and failure surface',
      'Key unknowns, operational risks and test requirements',
      'A reasoned next-step recommendation before changing the system',
    ],
    steps: [
      ['1. Identify the system', 'Scope one legacy workflow and its business role.'],
      ['2. Trace dependencies', 'Separate observed evidence from assumptions and unknowns.'],
      ['3. Decide the next move', 'Repair, modernize or stop based on the diagnosis.'],
    ],
  },
  'ibmi-xray': {
    eyebrow: 'IBM i 7.4 Upgrade X-Ray',
    headline: 'Before the IBM i upgrade, know what depends on it.',
    lede: 'Scope one IBM i 7.4 estate or workload and identify the integrations, jobs and operational risks that need attention in an upgrade plan.',
    promise: 'An IBM i 7.4-focused dependency and upgrade-risk diagnosis, not a production upgrade, certification or guaranteed compatibility finding.',
    send: [
      'The IBM i 7.4 estate, application or workload to assess',
      'Known vendor dependencies, scheduled jobs and integrations',
      'The upgrade objective, maintenance window and known risks. No passwords or secrets',
    ],
    get: [
      'A bounded map of upgrade dependencies and unknowns',
      'Important test, compatibility and rollback questions',
      'Prioritized preparation before authorizing a production change',
    ],
    steps: [
      ['1. Bound the workload', 'Pick one upgrade decision rather than a whole estate replacement.'],
      ['2. Reconstruct the risks', 'Document dependencies and verification needs.'],
      ['3. Plan safely', 'Decide what must be tested before any upgrade action.'],
    ],
  },
  'sign-pilot': {
    eyebrow: 'Evercraft Sign Founding Pilot',
    headline: 'Prove one signing workflow before asking people to trust it.',
    lede: 'Scope one electronic-signing journey with explicit identity, signer consent, evidence custody and human review requirements.',
    promise: 'One bounded founding signing-flow pilot with identity-control requirements. No universal legal enforceability or automated identity-verification guarantee.',
    send: [
      'The document type and who needs to sign it',
      'Required identity, consent and audit-trail checkpoints',
      'The jurisdiction and any regulated use. Do not upload sensitive documents during this public checkout',
    ],
    get: [
      'A scoped signer journey and human-approval map',
      'Required identity, consent and evidence controls',
      'Pilot acceptance and legal-review dependencies before production use',
    ],
    steps: [
      ['1. Scope one document journey', 'Identify signer roles and authorization requirements.'],
      ['2. Define proof and consent', 'Determine what evidence must be preserved.'],
      ['3. Review a pilot', 'Production use requires explicit approval and applicable legal checks.'],
    ],
  },
  'towi-evidence': {
    eyebrow: 'TOWI Rapid Evidence Scan',
    headline: 'A decision deserves evidence you can trace.',
    lede: 'Frame one research question and assemble a bounded source-review plan that separates findings, uncertainty and contradictions.',
    promise: 'One bounded evidence-scan deliverable for a defined question, not a guaranteed outcome, regulated professional opinion or comprehensive investigation.',
    send: [
      'The one decision or claim you need researched',
      'Relevant location, period and existing publicly shareable sources',
      'How the result will be used and what uncertainty would change your decision',
    ],
    get: [
      'A scoped evidence ledger and attributable source review',
      'Known contradictions, gaps and uncertainty labels',
      'A concise decision-oriented next-step summary',
    ],
    steps: [
      ['1. State the question', 'One bounded issue with a defined decision context.'],
      ['2. Examine the evidence', 'Record sources, conflicts and what remains unknown.'],
      ['3. Review the brief', 'Treat uncertain or consequential findings with appropriate human review.'],
    ],
  },
});

export function approvedPortfolioOfferCopy(slug, offer) {
  const copy = PORTFOLIO_OFFER_COPY[slug];
  if (!copy || !offer || offer.amount_cents <= 0 ||
      typeof offer.offer_key !== 'string' || !offer.offer_key ||
      offer.currency !== 'usd') return null;
  return copy;
}
