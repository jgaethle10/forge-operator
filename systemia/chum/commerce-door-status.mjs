/**
 * Status of the read-only commerce-door probe. Does not verify payment or revenue.
 * Fail closed when checks are missing, incomplete, or unsuccessful.
 */
export function classifyCommerceDoorProbe({ gateway, offers, results } = {}) {
  if (!gateway) return 'held';
  if (!Array.isArray(offers) || offers.length === 0) return 'held';
  if (!Array.isArray(results) || results.length !== offers.length) return 'fail';
  return results.every((entry) => entry?.valid === true) ? 'pass' : 'fail';
}
