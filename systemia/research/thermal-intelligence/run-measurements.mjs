/**
 * Offline G1 calorimetry intake. Does not connect to live instruments.
 * Keep private meter logs local and out of the public repository.
 */
import { readFileSync } from 'node:fs';
import { evaluateMeasurementBatch } from './measurement-intake.mjs';

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: node run-measurements.mjs <local-measurements.json>');
  process.exitCode = 2;
} else {
  try {
    const input = JSON.parse(readFileSync(filename, 'utf8'));
    const report = evaluateMeasurementBatch(input);
    const output = {
      evidenceClass: report.evidenceClass,
      independentlyVerified: report.independentlyVerified,
      fieldDeploymentApproved: report.fieldDeploymentApproved,
      observationCount: report.observationCount,
      screen: report.screen,
      total: report.total,
      unknownCalibration: report.unknownCalibration,
      flaggedHours: report.observations.filter((h) => h.flags.length),
      warnings: report.warnings,
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } catch (error) {
    console.error('Measurement intake rejected: ' + error.message);
    process.exitCode = 1;
  }
}
