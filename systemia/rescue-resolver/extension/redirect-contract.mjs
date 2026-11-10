// User-controlled, opt-in browser-only rescue route.
// NOT official-domain ownership, and never a registrar/DNS bypass.
export const RESCUE = Object.freeze({
  original: 'voteroman.com',
  target: 'https://fabric.systemiacommandcenters.com/campaigns/roman/',
  status: 'INDEPENDENT_INFORMATION_MIRROR',
  ruleId: 4101,
});
export const ORIGINAL_URL_PATTERN = '^https?://(?:www\\.)?voteroman\\.com(?:/|\\?|#|$)';
export function destinationIsAllowed(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.href === RESCUE.target;
  } catch { return false; }
}
export function createRule(target = RESCUE.target) {
  if (!destinationIsAllowed(target)) throw new Error('unreviewed_rescue_destination');
  return {
    id: RESCUE.ruleId,
    priority: 1,
    action: { type: 'redirect', redirect: { url: target } },
    condition: {
      regexFilter: ORIGINAL_URL_PATTERN,
      resourceTypes: ['main_frame'],
    },
  };
}
export function appliesToUrl(url) {
  return new RegExp(ORIGINAL_URL_PATTERN).test(url);
}
