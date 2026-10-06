import assert from 'node:assert/strict';
import { renderRivetLanding, renderAliEvLanding } from '../systemia/mcp/fabric-public-site.mjs';

const rivet=renderRivetLanding();
assert.match(rivet,/One address\./);
assert.match(rivet,/RIVET is the reporting brand/);
assert.match(rivet,/\$299 one-time/);
assert.match(rivet,/\$750 one-time/);
assert.match(rivet,/href="\/aliev"/);

const aliev=renderAliEvLanding();
assert.match(aliev,/AliEV is Evercraft's EV infrastructure intelligence and operating layer/);
assert.match(aliev,/Observed session intelligence/);
assert.match(aliev,/href="\/rivet"/);

console.log(JSON.stringify({ok:true,schema:'evercraft.rivet-aliev-owned-pages-proof.v1'},null,2));
