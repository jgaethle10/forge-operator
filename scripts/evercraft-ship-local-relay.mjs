#!/usr/bin/env node
// Local-only Ship relay, never a public production listener.
// Generate two independent random secrets and supply them via private environment.
import path from 'node:path';
import os from 'node:os';
import {OwnedShipTransferGate} from '../systemia/shipping/owned-transfer-gate.mjs';
import {createOwnedShipTransferServer} from '../systemia/shipping/owned-transfer-http.mjs';
const keyHex=String(process.env.EVERCRAFT_SHIP_ENCRYPTION_KEY_HEX||'');
const operatorSecret=String(process.env.EVERCRAFT_SHIP_OPERATOR_SECRET||'');
if(!/^[a-f0-9]{64}$/i.test(keyHex)||operatorSecret.length<24){
 console.error('Ship local relay requires EVERCRAFT_SHIP_ENCRYPTION_KEY_HEX (64 hex) and EVERCRAFT_SHIP_OPERATOR_SECRET (24+ characters).');
 process.exitCode=2;
}else{
 const root=path.resolve(process.env.EVERCRAFT_SHIP_VAULT_DIR||path.join(os.homedir(),'.local/share/evercraft/ship-vault'));
 const gate=await new OwnedShipTransferGate({root,operatorSecret,encryptionKey:Buffer.from(keyHex,'hex')}).init();
 const server=createOwnedShipTransferServer(gate);
 server.listen(8798,'127.0.0.1',()=>console.log('Evercraft Ship local relay listening on loopback 127.0.0.1:8798. Not publicly exposed; no automatic sending.'));
 const shutdown=()=>server.close();
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
