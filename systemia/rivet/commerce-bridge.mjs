export const RIVET_PUBLIC_ID = 'rivet-site-underwriting-v1';
export const RIVET_COMMERCE_TARGET_ID = RIVET_PUBLIC_ID;
export const RIVET_REPORT_OFFER_KEYS = ['site_report_299', 'site_report_750'];

export function projectRivetReportOffer(offer = {}) {
  const key = String(offer.offer_key || '');
  if (!RIVET_REPORT_OFFER_KEYS.includes(key)) return null;
  return {
    offer_key: key,
    name: key === 'site_report_299'
      ? 'RIVET Preliminary Site Opportunity Report'
      : 'RIVET Full Site Opportunity Report',
    price: String(offer.price || ''),
    billing: String(offer.billing || 'one_time')
  };
}
