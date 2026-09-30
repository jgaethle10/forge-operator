import { generateVapidKeys } from './web-push.mjs';
const keys = generateVapidKeys();
console.log(`EVERCRAFT_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`EVERCRAFT_VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('EVERCRAFT_VAPID_SUBJECT=mailto:ops@example.com');
