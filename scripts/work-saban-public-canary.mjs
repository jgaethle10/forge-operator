// Public, read-only Work Saban pilot page check. No lead submission or private data.
const url = 'https://jgaethle10.github.io/forge-operator/work-saban/';
const expected = [
  'EVERCRAFT / WORK SABAN',
  'Saban brings the team.',
  'PRIVATE PILOT INTEREST',
  'No public CSV uploads',
  'Request the private pilot by email',
];
async function main() {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Evercraft-Work-Saban-Public-Canary/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();
  const missing = expected.filter(s => !html.includes(s));
  const passed = response.ok && response.status === 200
    && response.url.startsWith('https://')
    && missing.length === 0;
  console.log(JSON.stringify({
    schema: 'evercraft.work-saban.pilot-public-canary.v1',
    url, final_url: response.url,
    http_status: response.status,
    content_type: response.headers.get('content-type'),
    expected_markers_present: missing.length === 0,
    missing_markers: missing,
    form_submitted: false, payment_attempted: false,
    public_route_verified: passed,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}
main().catch(error => {
  console.error(JSON.stringify({schema:'evercraft.work-saban.pilot-public-canary.v1', public_route_verified:false, reason:error.name || 'fetch_failed', form_submitted:false}));
  process.exitCode = 1;
});
