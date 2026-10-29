import { createHmac, timingSafeEqual } from 'node:crypto';

// HubSpot signature v3: method + original absolute URL + raw request body + timestamp.
// HubSpot decodes only this documented subset of escapes before signing.
export function normalizeHubspotSignedUrl(uri) {
  return String(uri).replace(/%(3A|2F|3F|40|21|24|27|28|29|2A|2C|3B)/gi,
    code => ({'3A':':','2F':'/','3F':'?','40':'@','21':'!','24':'$','27':"'",'28':'(','29':')','2A':'*','2C':',','3B':';'})[code.slice(1).toUpperCase()]);
}
export function validateHubspotV3({ method, absoluteUrl, rawBody = '', headers = {}, clientSecret, now = Date.now() }) {
  const signature = headers['x-hubspot-signature-v3'];
  const timestamp = headers['x-hubspot-request-timestamp'];
  if (typeof clientSecret !== 'string' || clientSecret.length < 16 ||
      typeof signature !== 'string' || !/^[a-zA-Z0-9+/]{43}=$/.test(signature) ||
      typeof timestamp !== 'string' || !/^\d{13}$/.test(timestamp)) return false;
  const delta = now - Number(timestamp);
  if (!Number.isSafeInteger(Number(timestamp)) || Math.abs(delta) > 300000) return false;
  if (!['GET','POST','PUT','PATCH','DELETE'].includes(method)) return false;
  const message = method + normalizeHubspotSignedUrl(absoluteUrl) + rawBody + timestamp;
  const expected = createHmac('sha256', clientSecret).update(message, 'utf8').digest();
  const actual = Buffer.from(signature, 'base64');
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}
