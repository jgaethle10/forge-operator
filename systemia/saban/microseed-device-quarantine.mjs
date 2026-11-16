/**
 * Temporary Node001 physical execution quarantine.
 *
 * The operator observed repeated Penguin Crostini halt requests on
 * 2026-11-15. The initiating ChromeOS host component remains unknown:
 * https://github.com/jgaethle10/forge-operator/issues/2132
 *
 * This hold applies to EXECUTION only. Read-only signed telemetry and
 * local device inspection remain available. It intentionally has no
 * environment-variable or request-level bypass: resumption requires a
 * reviewed change after host evidence and operator acceptance.
 *
 * Not an authorization grant or a claim that MicroSeed caused the halt.
 */
const DEVICE_ID='evercraft-node001-penguin';
export const MICROSEED_EXECUTION_QUARANTINE_REASON=
  'microseed_device_quarantined_pending_host_review';
export function isMicroSeedExecutionQuarantined(deviceId){
  return typeof deviceId==='string'&&deviceId===DEVICE_ID;
}
