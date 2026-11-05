import { readFileSync } from 'node:fs';
import { screenHourlyProfile } from './hourly-screen.mjs';

const file=process.argv[2];
if (!file) {
  console.error('Usage: node run-profile.mjs <local-profile.json>');
  process.exitCode=2;
} else {
  try {
    const profile=JSON.parse(readFileSync(file,'utf8'));
    const result=screenHourlyProfile(profile);
    process.stdout.write(JSON.stringify({
      evidenceClass:result.evidenceClass,
      dataStatus:result.dataStatus,
      periods:result.periods,
      economicScreen:result.economicScreen,
      fieldDeploymentApproved:result.fieldDeploymentApproved,
      totals:result.totals,
      warnings:result.warnings
    },null,2)+'\n');
  } catch(e) {
    console.error(`Profile validation failed: ${e.message}`);
    process.exitCode=1;
  }
}
