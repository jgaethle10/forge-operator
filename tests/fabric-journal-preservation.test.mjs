import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const updater=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');
const rescue=fs.readFileSync('scripts/rescue-fabric-journal-edge.sh','utf8');

test('neither automated Fabric updater nor rescue deletes Journal publications',()=>{
  for(const [name,code] of [['updater',updater],['rescue',rescue]]){
    assert.doesNotMatch(code,/\bgit -C "\$REPO_ROOT" (?:restore|clean)[^\n]*public\/journal/,name);
    assert.doesNotMatch(code,/\bgit -C "\$REPO_ROOT" reset --hard/,name);
    assert.match(code,/ls-files --others --ignored --exclude-standard -- public\/journal/,name);
    assert.match(code,/HOLD: .*Journal/,name);
    const journalIndex=code.indexOf('ls-files --others --ignored');
    const fetchIndex=code.indexOf('fetch --prune "$REMOTE" "$BRANCH"');
    assert.ok(journalIndex>=0&&journalIndex<fetchIndex,name+' must protect Journal before fetch');
  }
  assert.match(updater,/if \[\[ "\$journal_dirty" == "true" \|\| -n "\$journal_ignored" \]\]/);
  assert.match(updater,/reset --merge "\$before"/);
});

test('ignored Journal files stay detectable even when porcelain status omits them',()=>{
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),'journal-protection-git-'));
  const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
  try{
    git('init','-q');
    fs.mkdirSync(path.join(repo,'public','journal'),{recursive:true});
    fs.writeFileSync(path.join(repo,'.gitignore'),'public/journal/*.json\n');
    fs.writeFileSync(path.join(repo,'public','journal','unpublished.json'),'{"receipt":"preserve"}\n');
    const status=git('status','--porcelain','--untracked-files=all');
    assert.equal(status.includes('unpublished.json'),false);
    const ignored=git('ls-files','--others','--ignored','--exclude-standard','--','public/journal');
    assert.ok(ignored.includes('public/journal/unpublished.json'));
    assert.equal(fs.readFileSync(path.join(repo,'public','journal','unpublished.json'),'utf8'),'{"receipt":"preserve"}\n');
  }finally{
    fs.rmSync(repo,{recursive:true,force:true});
  }
});
