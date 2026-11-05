// Build an untrusted, synthetic device lab bundle. Private keys never leave this process.
// The standalone verifier uses the exact same verification logic as Passage's hosted reader.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {issuePackage} from './passage-signed-package.mjs';
import {validateCatalog} from '../public/passage/catalog.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=content=>createHash('sha256').update(content).digest('hex');
const policyHash=content=>createHash('sha256').update(content).digest('base64');
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CSS=[
':root{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#183a38;background:#f7f9f6;color-scheme:light}',
'*{box-sizing:border-box}body{margin:0 auto;padding:34px 20px 100px;max-width:750px;line-height:1.7}',
'h1{font-size:clamp(2.3rem,7vw,4.1rem);line-height:1.06;letter-spacing:-.06em;margin:15px 0}',
'h1 span{color:#197b6a}h2{font-size:1.15rem}p{margin:0 0 16px}small{color:#536e65}',
'.eyebrow{font-size:.7rem;font-weight:800;color:#197b6a;letter-spacing:.12em;text-transform:uppercase}',
'.lead{font-size:1.1rem;color:#536e65;max-width:640px}',
'.panel{border:1px solid #d0e2d7;border-radius:18px;background:white;padding:24px;margin:26px 0}',
'label{display:block;font-size:.86rem;font-weight:800;margin:19px 0 7px}input{display:block;width:100%;padding:13px;background:#fff;border:1px solid #aac9b8;border-radius:10px;max-width:100%;font:inherit}',
'button{background:#104f46;color:white;border:1px solid #104f46;border-radius:10px;padding:13px 18px;font:inherit;font-weight:800;cursor:pointer;margin:19px 8px 3px 0}',
'button[hidden],div[hidden]{display:none!important}button:disabled{opacity:.6;cursor:not-allowed}',
'button.secondary{color:#104f46;background:white}button:focus-visible,input:focus-visible{outline:3px solid #2caa92;outline-offset:3px}',
'#verification-status{font-weight:750;overflow-wrap:anywhere}#verification-details p{font-size:.83rem;overflow-wrap:anywhere;margin:8px 0}',
'.caution{border-top:1px solid #dce8de;padding-top:18px;font-size:.87rem;color:#667c71}',
'.status{background:#e7f0ea;border-radius:10px;padding:12px;font-size:.84rem}',
'footer{font-size:.8rem;color:#5b7568;margin:36px 0 0}@media(max-width:600px){.panel{padding:19px}}'
].join('\n');
export async function buildDemoKit(destination,options={}){
 const dir=resolve(destination);await mkdir(dir,{recursive:true});
 const [verifierSource,uiSource,catalogSource]=await Promise.all([
  readFile(join(root,'public/passage/package-verifier.mjs'),'utf8'),
  readFile(join(root,'public/passage/package-ui.mjs'),'utf8'),
  readFile(join(root,'public/passage/catalog.json'),'utf8')
 ]);
 const verifier=verifierSource.replace(/^export /gm,'');
 const ui=uiSource.replace(/^import .*;\r?\n/m,'');
 if(/\b(?:import|export)\s/.test(verifier+'\n'+ui)||/<\/script/i.test(verifier+'\n'+ui))throw Error('Unsafe or unsupported standalone script source');
 const script=verifier+'\n'+ui+'\n';
 const csp="default-src 'none'; script-src 'sha256-"+policyHash(script)+"'; style-src 'sha256-"+policyHash(CSS)+"'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 const html=[
 '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'">',
 '<meta name="color-scheme" content="light"><title>Passage | Offline verification lab</title>',
 '<style>'+CSS+'</style></head><body>',
 '<div class="eyebrow">EVERCRAFT / DEVICE LAB / ORIGINAL DEMO CONTENT ONLY</div>',
 '<h1>Knowledge you can <span>check offline.</span></h1>',
 '<p class="lead">Verify a small Passage text package with a publisher public key and an independently confirmed key fingerprint. No server, account, external scripts or uploaded data.</p>',
 '<p class="status"><strong>Offline verifier demonstration.</strong> Signatures prove integrity against the supplied key only. This HTML file itself must come from a trusted source; a checksum in the same bundle does not authenticate that source.</p>',
 '<section class="panel" aria-label="Verify signed file">',
 '<label for="package-file">Passage text package (.json)</label><input id="package-file" type="file" accept=".json,application/json">',
 '<label for="trusted-key-file">Publisher public key (.pem), obtained from a trusted source</label><input id="trusted-key-file" type="file" accept=".pem,text/plain">',
 '<label for="expected-fingerprint">Expected SHA-256 public-key fingerprint from a separate trusted channel</label>',
 '<input id="expected-fingerprint" type="text" inputmode="text" spellcheck="false" autocomplete="off" autocapitalize="off" maxlength="96" placeholder="64 hexadecimal characters" aria-describedby="fingerprint-help">',
 '<p class="caution" id="fingerprint-help">The sample key and fingerprint packaged with this lab are synthetic and <strong>not</strong> independently trusted. They demonstrate mechanics only.</p>',
 '<button type="button" id="verify-package">Verify locally</button>',
 '<p id="verification-status" role="status" aria-live="polite">No file has been verified.</p><div id="verification-details" hidden></div>',
 '<button type="button" id="save-verified-file" class="secondary" hidden>Save checked plain text</button>',
 '</section>',
 '<h2>Safety boundaries</h2><p class="caution">This does not encrypt files, hide reading activity, verify journalistic truth, certify rights, or protect an inspected device. Offline clocks can be incorrect and revocations cannot be checked. If this browser does not support Ed25519 WebCrypto from local HTML, verification must fail rather than bypass checks.</p>',
 '<footer>Evercraft Passage · laboratory build · no external network dependencies · no production publisher identity</footer>',
 '<script>'+script+'</script></body></html>'
 ].join('\n');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const catalog=validateCatalog(JSON.parse(catalogSource));
 const issued=options.issuedAt?new Date(options.issuedAt):new Date();
 const envelope=issuePackage({article:catalog.articles[0],privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'}).toString(),issuedAt:issued,ttlDays:7});
 const publicPem=publicKey.export({type:'spki',format:'pem'}).toString();
 const fingerprint=sha(publicKey.export({type:'spki',format:'der'}));
 const readme=[
 'Evercraft Passage: OFFLINE TWO-DEVICE LAB KIT',
 'This is original synthetic signed demonstration material. This is not an independently trusted publisher identity.',
 'NO ANONYMITY, ENCRYPTION, CENSORSHIP BYPASS, HIDDEN STORAGE, NETWORK TRANSFER OR READER PROTECTION.',
 '',
 'CONTENTS',
 'passage-offline-verifier.html = complete browser verifier, no external files or network calls.',
 'DEMO-package.json = one original educational guide signed using an EPHEMERAL key for this build.',
 'DEMO-public-key.pem = matching, UNTRUSTED demonstration public key.',
 'DEMO-fingerprint-UNTRUSTED.txt = calculated test fingerprint included in the SAME bundle; not independently certified.',
 'SHA256SUMS.txt = accidental corruption checks only, not a trusted signature.',
 '',
 'HOW TO TEST',
 '1. On a device you control, save these files and open passage-offline-verifier.html in a compatible browser.',
 '2. Switch off Wi-Fi and cellular internet, then select DEMO-package.json and DEMO-public-key.pem.',
 '3. For a simulation only, copy the 64-character value from DEMO-fingerprint-UNTRUSTED.txt into the fingerprint input.',
 '4. Verify. A PASS proves only that the files and DEMO key match; NOT who produced the key or whether the content is true.',
 '5. Edit a copy of the package, change the fingerprint, or use an expired package and confirm NOT VERIFIED.',
 '6. On a real deployment, independently authenticate the publisher key fingerprint BEFORE receiving the package.',
 '7. If local file WebCrypto or downloads do not work on the device, record UNSUPPORTED. Do not override the failure.',
 '',
 'This is not a release for at-risk readers. Do not place private keys, private documents or real reporter identities in this lab.',
 'No private signing key is included, saved, or published.',
 ''
 ].join('\n');
 const files={
  'passage-offline-verifier.html':html,
  'DEMO-package.json':envelope,
  'DEMO-public-key.pem':publicPem,
  'DEMO-fingerprint-UNTRUSTED.txt':fingerprint+'\n',
  'READ-ME-FIRST.txt':readme
 };
 for(const [name,data] of Object.entries(files))await writeFile(join(dir,name),data,{flag:'wx',mode:0o600});
 const sums=Object.entries(files).map(([name,data])=>sha(data)+'  '+name).join('\n')+'\n';
 await writeFile(join(dir,'SHA256SUMS.txt'),sums,{flag:'wx',mode:0o600});
 return {directory:dir,verifier:join(dir,'passage-offline-verifier.html'),package:join(dir,'DEMO-package.json'),publicKey:join(dir,'DEMO-public-key.pem'),fingerprint,files:Object.keys(files).concat('SHA256SUMS.txt')};
}
if(process.argv[1]&&process.argv[1]===fileURLToPath(import.meta.url)){
 const result=await buildDemoKit(process.env.PASSAGE_KIT_DIR||join(root,'.passage-device-lab'));
 console.log(JSON.stringify({directory:result.directory,files:result.files,note:'Synthetic demo key ONLY. No private key saved.'},null,2));
}
