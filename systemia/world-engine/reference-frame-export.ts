import { buildWorldEngineReferenceFramePackage } from './reference-frame.js';

process.stdout.write(
  JSON.stringify(buildWorldEngineReferenceFramePackage(),null,2)+'\n'
);
