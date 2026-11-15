// Node 22 CLI for issuing and verifying small signed plain-text demonstration packages.
// Publisher key management is external; packages cannot authorize their own signing keys.
import {readFile,writeFile} from 'node:fs/promises';
import {createPrivateKey,createPublicKey,sign,verify,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateCatalog} from '../public/passage/catalog.mjs';
import {articleText} from '../public/passage/article-text.mjs';
import {PACKAGE_FORMAT,MAX_TEXT_BYTES,MAX_PACKAGE_BYTES,verifySignedPackage,confirmPublisherFingerprint} from '../public/passage/package-verifier.mjs';
const b64=bytes=>Buffer.from(bytes).toString('base64');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const expect=(ok,message)=>{if(!ok)throw Error(message)};
export function issuePackage({article,privateKeyPem,issuedAt=new Date(),ttlDays=7}){
 expect(article&&typeof article.id==='string','Article is required');
 const key=createPrivateKey(privateKeyPem);expect(key.asymmetricKeyType==='ed25519','Only Ed25519 signing keys are allowed');
 expect(Number.isInteger(ttlDays)&&ttlDays>=1&&ttlDays<=30,'TTL must be 1-30 days');
 const issued=new Date(issuedAt),expires=new Date(issued.getTime()+ttlDays*86400000);
 expect(Number.isFinite(issued.getTime()),'Invalid signing date');
 const plain=articleText(article),content=Buffer.from(plain,'utf8');
 expect(content.length>0&&content.length<=MAX_TEXT_BYTES,'Article exceeds package size limit');
 const signed_data={format:PACKAGE_FORMAT,publisher:'Evercraft demonstration (unverified publisher claim)',article_id:article.id,title:article.title,
  edition:article.edition,issued_at:issued.toISOString(),expires_at:expires.toISOString(),content_type:'text/plain; charset=utf-8',
  filename:'passage-'+article.id+'.txt',byte_length:content.byteLength,sha256:sha(content),rights:article.rights,
  review_state:'demonstration-unverified'};
 const signature=sign(null,Buffer.from(JSON.stringify(signed_data),'utf8'),key);
 const envelope={format:PACKAGE_FORMAT,signed_data,signature_base64:b64(signature),content_base64:b64(content)};
 const result=JSON.stringify(envelope,null,2)+'\n';expect(Buffer.byteLength(result)<=MAX_PACKAGE_BYTES,'Package exceeds size limit');
 return result;
}
export async function checkPackage({packageJson,trustedPublicKeyPem,expectedFingerprint,now=new Date()}){
 const key=createPublicKey(trustedPublicKeyPem);expect(key.asymmetricKeyType==='ed25519','Only trusted Ed25519 public keys allowed');
 const checked=confirmPublisherFingerprint(await verifySignedPackage(packageJson,trustedPublicKeyPem,new Date(now).getTime()),expectedFingerprint);
 const parsed=JSON.parse(packageJson),passed=verify(null,Buffer.from(JSON.stringify(parsed.signed_data),'utf8'),key,Buffer.from(parsed.signature_base64,'base64'));
 expect(passed,'Node signature verification failed');
 return checked;
}
function args(argv){const out={};for(const item of argv){const index=item.indexOf('=');expect(item.startsWith('--')&&index>2,'Arguments must use --name=value');out[item.slice(2,index)]=item.slice(index+1)}return out}
async function main(){
 const [command,...rest]=process.argv.slice(2),a=args(rest);
 if(command==='issue'){
  expect(a.article&&a.key&&a.out,'Usage: issue --article=ID --key=PRIVATE_PEM --out=PACKAGE_JSON [--ttl-days=7]');
  const catalog=validateCatalog(JSON.parse(await readFile(new URL('../public/passage/catalog.json',import.meta.url),'utf8')));
  const article=catalog.articles.find(x=>x.id===a.article);expect(article,'Unknown demo article');
  const result=issuePackage({article,privateKeyPem:await readFile(a.key,'utf8'),ttlDays:a['ttl-days']===undefined?7:Number(a['ttl-days'])});
  await writeFile(a.out,result,{flag:'wx',mode:0o600});console.log('Issued signed demonstration package:',a.out);
 }else if(command==='verify'){
  expect(a.file&&a['trusted-key']&&a['expected-fingerprint'],'Usage: verify --file=PACKAGE_JSON --trusted-key=TRUSTED_PUBLIC_PEM --expected-fingerprint=64_HEX_CHARS [--out=TXT_FILE]');
  const checked=await checkPackage({packageJson:await readFile(a.file,'utf8'),trustedPublicKeyPem:await readFile(a['trusted-key'],'utf8'),expectedFingerprint:a['expected-fingerprint']});
  if(a.out)await writeFile(a.out,checked.text,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:'SIGNATURE_AND_CONTENT_VALID_FOR_PROVIDED_TRUST_ANCHOR',article_id:checked.metadata.article_id,
   edition:checked.metadata.edition,expires_at:checked.metadata.expires_at,key_fingerprint_sha256:checked.fingerprint_sha256,
   note:'Integrity against your externally trusted public key only. Not evidence of factual accuracy, legal rights or anonymity.'},null,2));
 }else throw Error('Usage: node scripts/passage-signed-package.mjs issue|verify [options]');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('Passage package rejected:',e.message);process.exitCode=1});
