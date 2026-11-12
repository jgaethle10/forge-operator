/** Bound only to local Evercraft Edge loopback. Edge must own TLS and public routing. */
import {createEvermapsStagingServer} from './staging-http.mjs';
const dir=process.env.EVERMAPS_RELEASE_DIR||'';
const port=Number(process.env.EVERMAPS_STAGING_PORT||'4737');
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Invalid staging port');
const {server,release}=await createEvermapsStagingServer({releaseDirectory:dir});
server.listen(port,'127.0.0.1',()=>{
 console.log(JSON.stringify({
  service:'evermaps-research',
  local_origin:'http://127.0.0.1:'+port,
  route_state:'local_only_public_https_unverified',
  release_wgs_sha256:release.wgs_source_sha256
 }));
});
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close());
