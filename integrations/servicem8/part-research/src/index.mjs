/**
 * ServiceM8 Job Card -> FindMyPart free human handoff (prototype).
 * No ServiceM8 API calls, data transfers, purchases, or user tracking.
 * ServiceM8's Addon Kit invokes handler(event) on an explicit job-card action.
 */
export const FINDMYPART_FREE_ENTRY = 'https://findmypart.base44.app/free-part-check';
export const ACTION = 'evercraft_part_research';

const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft Part Research</title><style>
:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif}body{margin:0;background:#f5f8f9;color:#152629}.card{max-width:560px;padding:26px;margin:5vh auto;background:white;border:1px solid #cadad7;border-radius:16px;box-shadow:0 8px 32px #15262912}h1{margin:0 0 10px;font-size:28px}p{line-height:1.5}.muted{color:#415c60}.action{display:inline-block;background:#163f3b;color:#fff;border-radius:10px;padding:15px 20px;text-decoration:none;font-weight:700;min-height:22px}.action:focus-visible{outline:3px solid #55bda6;outline-offset:3px}</style></head><body><main class="card">${body}</main></body></html>`;

const SUCCESS = page(`<h1>Need a hard-to-find part?</h1><p>Open Evercraft's free part check, then enter only the part details you choose to share. No ServiceM8 customer, job, address, invoice or token is sent.</p><p><a class="action" href="${FINDMYPART_FREE_ENTRY}" target="_blank" rel="noopener noreferrer">Open free part check</a></p><p class="muted">You remain in control. Paid research, if offered later, requires a separate explicit purchase. This add-on does not create a payment or attach anything to your job.</p>`);
const HELD = page('<h1>Action unavailable</h1><p>This prototype supports only the explicit Part Research job action. It performs no other work.</p>');

export const handler = async (event) => ({
  eventResponse: String(event?.eventName || '').toLowerCase() === ACTION ? SUCCESS : HELD,
});
