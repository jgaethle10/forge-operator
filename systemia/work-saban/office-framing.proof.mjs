import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const source=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'office-framing.js'),'utf8');
const context={window:{}};
vm.runInNewContext(source,context,{filename:'office-framing.js'});
const frame=context.window.EvercraftOfficeFraming;
assert(frame);
const phone=frame.fit({width:320,height:440});
const largerPhone=frame.fit({width:390,height:540});
const narrowDesktopPanel=frame.fit({width:540,height:570});
const wideDesktop=frame.fit({width:1180,height:720});
assert(phone.zoom>=frame.MIN&&phone.zoom<.30,'phone must frame the whole group, not three cropped agents');
assert(largerPhone.zoom>phone.zoom,'larger stage permits a larger scene');
assert(narrowDesktopPanel.zoom<.5,'embedded desktop view cannot use full browser width');
assert(wideDesktop.zoom>narrowDesktopPanel.zoom,'wide stage must feel closer');
assert(wideDesktop.zoom<=frame.MAX,'zoom has safe upper bound');
for(const pose of [phone,largerPhone,narrowDesktopPanel,wideDesktop]){
  assert.equal(pose.yaw,-9);
  assert.equal(pose.pitch,61);
  assert.equal(pose.panX,0);
  assert.equal(pose.panY,0);
  assert(Object.isFrozen(pose));
}
for(const dims of [{width:0,height:500},{width:300,height:-1},{width:NaN,height:500}])
  assert.throws(()=>frame.fit(dims),/measured positive/);
assert.equal(frame.fit({width:50000,height:50000}).zoom,frame.MAX);
console.log('Work Saban responsive fit: PASS (actual scene sizes, 6-agent overview, phone/desktop bounds).');
