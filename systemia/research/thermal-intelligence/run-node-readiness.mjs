/**
 * Run once on an authorized local machine.
 * Writes a privacy-bounded diagnostic to stdout; no network, scheduled polling,
 * additional computing workload, or system settings changes.
 */
import {captureNodeReadiness} from './node-readiness.mjs';
const result=captureNodeReadiness();
process.stdout.write(JSON.stringify(result,null,2)+'\n');
