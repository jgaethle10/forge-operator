#!/usr/bin/env node
// Compatibility entrypoint. Explicit operator permission required.
// The canonical private workflow is scripts/findmypart-owner-inbox.mjs.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [reference,flag]=process.argv.slice(2);
if(!/^FMP-[A-F0-9]{24}$/.test(String(reference||''))||flag!=='--reveal'){
 process.stderr.write('Use: node scripts/findmypart-owner-inbox.mjs show FMP-<24 HEX> --reveal\n');
 process.exitCode=2;
}else{
 const script=fileURLToPath(new URL('./findmypart-owner-inbox.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[script,'show',reference,'--reveal'],{stdio:'inherit',env:process.env});
 process.exitCode=result.status===null?1:result.status;
}
