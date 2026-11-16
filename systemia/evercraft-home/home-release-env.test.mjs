import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {refreshHomeSourceRelease} from './home-release-env.mjs';

const OLD='81eb5e423b5c48cd03e423130abdb300a711b90a';
const NEW='6e57e36f4fce338a2224fba577355475c48cefd8';
function fixture(overrides=''){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'home-release-env-'));
  const file=path.join(root,'home.env');
  const lines=[
    'EVERCRAFT_HOME_HOST=127.0.0.1',
    'EVERCRAFT_HOME_AUTH=passport',
    'EVERCRAFT_IDENTITY_SECRET=fixture-sensitive-identity-secret',
    'EVERCRAFT_IDENTITY_STATE_DIR=/var/lib/evercraft/home/identity',
    'EVERCRAFT_PASSPORT_STATE_DIR=/var/lib/evercraft/home/passport',
    'EVERCRAFT_CREDENTIAL_STATE_DIR=/var/lib/evercraft/home/credentials',
    'EVERCRAFT_CLIP_JOURNAL_STATE_DIR=/var/lib/evercraft/home/clip/journal-attempts',
    'EVERCRAFT_HOME_RELEASE_REF='+OLD,
    'CLIP_LINKEDIN_ORGANIZATION_ID=1234567890',
    'CLIP_LINKEDIN_CREDENTIAL_REF=opaque-provider-ref',
    'CLIP_LINKEDIN_PUBLISH_ENABLED=true',
    'CLIP_FACEBOOK_JOURNAL_PAGE_ID=901234567890',
    'CLIP_FACEBOOK_JOURNAL_PUBLISH_ENABLED=true',
    'SOME_UNKNOWN_PROTECTED_SETTING=keep-exactly',
    overrides
  ];
  fs.writeFileSync(file,lines.join('\n')+'\n',{mode:0o600});
  return {root,file,close(){fs.rmSync(root,{recursive:true,force:true});}};
}

test('Home release refresh preserves private Clip, owner and unknown configuration byte for byte',()=>{
  const f=fixture();
  try{
    const old=fs.readFileSync(f.file,'utf8');
    const result=refreshHomeSourceRelease({file:f.file,releaseRef:NEW});
    assert.equal(result.state,'release_ref_updated');
    assert.equal(result.private_settings_preserved,true);
    const now=fs.readFileSync(f.file,'utf8');
    assert.equal(now,old.replace(OLD,NEW));
    assert.equal(fs.statSync(f.file).mode&0o777,0o600);
    assert.doesNotMatch(JSON.stringify(result),/fixture-sensitive-identity-secret/);
    assert.doesNotMatch(JSON.stringify(result),/opaque-provider-ref/);
    const repeat=refreshHomeSourceRelease({file:f.file,releaseRef:NEW});
    assert.equal(repeat.state,'unchanged');
    assert.equal(fs.readdirSync(f.root).length,1);
  }finally{f.close();}
});

test('corrupt or insecure private environment fails closed without modification',()=>{
  const cases=[
    file=>fs.chmodSync(file,0o644),
    file=>fs.appendFileSync(file,'EVERCRAFT_HOME_RELEASE_REF='+OLD+'\n'),
    file=>fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('EVERCRAFT_HOME_AUTH=passport','EVERCRAFT_HOME_AUTH=local')),
    file=>fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('EVERCRAFT_IDENTITY_SECRET=fixture-sensitive-identity-secret','EVERCRAFT_IDENTITY_SECRET=')),
  ];
  for(const change of cases){
    const f=fixture();
    try{
      change(f.file);
      const before=fs.readFileSync(f.file,'utf8');
      assert.throws(()=>refreshHomeSourceRelease({file:f.file,releaseRef:NEW}),/home_env_/);
      assert.equal(fs.readFileSync(f.file,'utf8'),before);
    }finally{f.close();}
  }
});

test('symbolic-link private environment and invalid release ref are not followed',()=>{
  const f=fixture();
  try{
    const link=path.join(f.root,'link.env');
    fs.symlinkSync(f.file,link);
    assert.throws(()=>refreshHomeSourceRelease({file:link,releaseRef:NEW}),/untrusted/);
    assert.throws(()=>refreshHomeSourceRelease({file:f.file,releaseRef:'main'}),/release_ref_invalid/);
    assert.match(fs.readFileSync(f.file,'utf8'),new RegExp(OLD));
  }finally{f.close();}
});

test('installer explicitly chooses safe reconciliation instead of writing over existing credentials',()=>{
  const installer=fs.readFileSync(new URL('../../scripts/install-evercraft-home-edge.sh',import.meta.url),'utf8');
  assert.match(installer,/if \[\[ -e "\$HOME_ENV" \|\| -L "\$HOME_ENV" \]\]; then/);
  assert.match(installer,/home-release-env\.mjs" "\$HOME_ENV" "\$RELEASE_REF"/);
  assert.match(installer,/else\s+umask 077\s+cat > "\$HOME_ENV" <<EOF/);
});
