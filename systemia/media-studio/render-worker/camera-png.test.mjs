import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeCameraFixture, pngPixel } from './camera-png.mjs';

test('generated source raster contains distinct deterministic spatial regions',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-camera-png-'));
  try {
    const filename=path.join(dir,'source.png');
    makeCameraFixture(filename);
    assert.deepEqual(pngPixel(filename,720,940),[255,0,0]);
    assert.deepEqual(pngPixel(filename,720,1390),[0,255,0]);
    assert.deepEqual(pngPixel(filename,720,1790),[0,0,255]);
    assert.throws(()=>pngPixel(filename,1441,0),/png_sample_out_of_bounds/);
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
