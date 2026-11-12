// A browser-local, customer-initiated scope email for the existing $149 Asset Diagnosis.
// This module does not send requests, collect analytics, retain personal data, or initiate payment.
export const SUBJECT = 'Asset Diagnosis ($149) | Scope confirmation request';
export const TO = 'jessegaethle10@gmail.com';

const clean = (value, max) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

export function buildAssetScopeInquiry(values = {}) {
  const asset = clean(values.asset, 180);
  const issue = clean(values.issue, 320);
  const decision = clean(values.decision, 240);
  const timing = clean(values.timing, 100);
  const source = values.source === 'evercraft_try'
    ? 'Evercraft free tools (visitor-provided link context)'
    : 'Asset Diagnosis page';
  if (asset.length < 5) throw new Error('Identify one asset or public URL (at least five characters).');
  if (issue.length < 10) throw new Error('Describe what is not working (at least ten characters).');
  if (decision.length < 10) throw new Error('Tell us which decision this diagnosis should help with.');
  const body = [
    'Hello Evercraft,',
    '',
    'I would like to discuss the existing $149 Asset Diagnosis service for ONE asset.',
    'This is a scope request, not an order or authorization to charge me.',
    '',
    'Asset or public URL: ' + asset,
    'What is not working: ' + issue,
    'What I need to decide: ' + decision,
    'Preferred timing (if any): ' + (timing || 'Please confirm availability'),
    'Where I found this: ' + source,
    '',
    'I confirm I own this asset or am authorized to discuss it.',
    'Please reply with an exact written scope, delivery availability, and the payment step.',
    'I will not send passwords, card data, API keys or private records by email.',
  ].join('\n');
  const mailto = 'mailto:' + TO + '?subject=' + encodeURIComponent(SUBJECT)
    + '&body=' + encodeURIComponent(body);
  return { subject: SUBJECT, body, mailto };
}
