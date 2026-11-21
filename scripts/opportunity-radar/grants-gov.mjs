// Read-only Grants.gov Search2 collector. Official docs: https://www.grants.gov/api/common/search2
// Search hits are leads, NOT proof of eligibility or an open award. No applications or outbound messages.
const ENDPOINT = 'https://api.grants.gov/v1/api/search2';
export function normalizeGrantHit(hit, checkedAt) {
  if (!hit || !/^\d+$/.test(String(hit.id ?? '')) || !String(hit.title ?? '').trim()) return null;
  const status = String(hit.oppStatus ?? '').toLowerCase();
  return {
    publisher: String(hit.agencyName || hit.agencyCode || 'Grants.gov'),
    notice_id: String(hit.number || hit.id),
    source_url: 'https://www.grants.gov/search-results-detail/' + String(hit.id),
    title: String(hit.title).trim(),
    first_seen_at: checkedAt,
    last_checked_at: checkedAt,
    published_at: null,
    deadline_at: null, // US date without time zone is not safe for expiry comparison
    raw_open_date: hit.openDate || null,
    raw_close_date: hit.closeDate || null,
    eligibility: 'unknown', // search hits do not establish applicant eligibility
    status: status === 'closed' || status === 'archived' ? 'closed' : 'unknown',
    opportunity_type: 'non_dilutive_award_candidate',
    candidate_capabilities: [],
    scores: {},
    evidence_links: ['https://www.grants.gov/search-results-detail/' + String(hit.id)],
    no_contact_without_approval: true,
    source_status: status,
    source_document_type: hit.docType || null
  };
}
export async function searchGrants({keyword, rows=20, fetchImpl=fetch, checkedAt=new Date().toISOString()}={}) {
  if (typeof keyword !== 'string' || !keyword.trim() || keyword.length > 120) throw new Error('keyword required (1-120 chars)');
  if (!Number.isInteger(rows) || rows < 1 || rows > 100) throw new Error('rows must be 1-100');
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),15000);
  try {
    const response = await fetchImpl(ENDPOINT, {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({keyword:keyword.trim(),rows,oppStatuses:'posted|forecasted'}),
      signal:controller.signal
    });
    if (!response.ok) throw new Error('Grants.gov HTTP '+response.status);
    const payload=await response.json();
    if (payload?.errorcode !== 0 || !Array.isArray(payload?.data?.oppHits)) throw new Error('Grants.gov response error or invalid schema');
    return {
      source:ENDPOINT, keyword:keyword.trim(), checked_at:checkedAt,
      reported_hit_count:payload.data.hitCount,
      records:payload.data.oppHits.map(hit=>normalizeGrantHit(hit,checkedAt)).filter(Boolean)
    };
  } finally { clearTimeout(timeout); }
}
if (process.argv[1] && import.meta.url === new URL('file://'+process.argv[1]).href) {
  const keyword=process.argv.slice(2).join(' ');
  try { console.log(JSON.stringify(await searchGrants({keyword}),null,2)); }
  catch(err) { console.error(err.message); process.exitCode=1; }
}
