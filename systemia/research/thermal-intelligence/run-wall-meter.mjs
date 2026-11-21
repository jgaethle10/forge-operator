import {readFileSync} from 'node:fs';
import {normalizeWallMeter} from './wall-meter-intake.mjs';

const filename=process.argv[2];
if (!filename) {
  console.error('Usage: node run-wall-meter.mjs <local-meter.json>');
  process.exitCode=2;
} else {
  try {
    const input=JSON.parse(readFileSync(filename,'utf8'));
    const result=normalizeWallMeter(input);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  } catch(error) {
    console.error('Wall meter intake rejected: '+error.message);
    process.exitCode=1;
  }
}
