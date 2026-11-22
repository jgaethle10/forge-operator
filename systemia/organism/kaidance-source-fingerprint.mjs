// Pure bounded source fingerprint shared by the company runner and goal bridge.
// No import from the CLI runner: CLI dynamic imports must not form a cycle.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function sourceFingerprint(root,files){
 const hash=createHash('sha256');
 for(const file of [...files].sort()){
  if(!/^(?:public\/worlds|tests)\/[a-z0-9./-]+$/.test(file)||file.includes('..'))
   throw Error('untrusted_company_source_path');
  const full=path.join(root,file);
  if(fs.lstatSync(full).isSymbolicLink())throw Error('company_source_symlink_refused');
  hash.update(file+'\0');hash.update(fs.readFileSync(full));hash.update('\0');
 }
 return 'sha256:'+hash.digest('hex');
}
