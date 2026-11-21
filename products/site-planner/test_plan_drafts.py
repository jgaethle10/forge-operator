"""Owned Kennedy draft save/restore requires matching aerial fingerprints."""
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch
import server

class DraftTests(unittest.TestCase):
    def test_draft_script_private_route(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(server,'DB',Path(temp)/'test.sqlite3'),patch.object(server,'TOKEN','operator-test-key'):
                server.init()
                http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
                t=threading.Thread(target=http.serve_forever,daemon=True);t.start()
                try:
                    url=f'http://127.0.0.1:{http.server_port}/plan-drafts.js'
                    with self.assertRaises(HTTPError) as err:urlopen(url,timeout=4)
                    self.assertEqual(err.exception.code,401)
                    with urlopen(Request(url,headers={'Authorization':'Bearer operator-test-key'}),timeout=4) as r:
                        self.assertEqual(r.status,200)
                        self.assertIn('javascript',r.headers['Content-Type'])
                        self.assertIn(b'restoreDraft',r.read())
                finally:
                    http.shutdown();http.server_close();t.join(timeout=5)

    def test_source_binding_round_trip_and_tamper_rejection(self):
        script=r'''
const fs=require('fs'),vm=require('vm');
const page=fs.readFileSync('plan-studio.html','utf8');
const inline=page.split('<script>')[1].split('</script>')[0];
const drafts=fs.readFileSync('plan-drafts.js','utf8');
new Function(inline);new Function(drafts);
const els=new Map(), defaults={siteName:'Test site',address:'Unverified address',rev:'DRAFT',sourceText:'Operator rights note',knownFeet:'100'};
function element(id){if(!els.has(id))els.set(id,{value:defaults[id]||'',innerHTML:'',textContent:'',handlers:{},classList:{toggle(){}},addEventListener(k,fn){this.handlers[k]=fn},createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}}},getScreenCTM(){return {inverse(){return {}}}}});return els.get(id)}
const context={document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>({})},window:{},console,setTimeout,URL,Blob,alert(){}};
vm.createContext(context);vm.runInContext(inline,context,{timeout:4000});vm.runInContext(drafts,context,{timeout:4000});
const run=s=>vm.runInContext(s,context);
let rejected=false;try{run('window.__evercraftDraft.makeDraft()')}catch{rejected=true}
if(!rejected)throw Error('Draft accepted without source image and fingerprint');
run("state.siteImage='data:image/png;base64,YQ==';state.siteHash='a'.repeat(64);state.siteSource='own-aerial.png';state.contextImage='data:image/png;base64,Yg==';state.contextHash='b'.repeat(64);state.contextSource='own-context.png';state.marks=[{type:'charger',x:420,y:400},{type:'route',x:450,y:400,x2:600,y2:490}];state.calibration=calibrateFromPoints({x:100,y:100},{x:300,y:100},100,state.siteSource)");
const saved=JSON.parse(run('JSON.stringify(window.__evercraftDraft.makeDraft())'));
if(saved.marks.length!==2||JSON.stringify(saved).includes('data:image'))throw Error('Draft lost geometry or included raw aerial pixels');
run('state.marks=[];state.calibration=null');
if(context.window.__evercraftDraft.restoreDraft(saved)!==2||run('state.calibration.knownFeet')!==100)throw Error('Draft not restored');
const baseline=run('JSON.stringify(state.marks)');
run("state.siteHash='c'.repeat(64)");
rejected=false;try{context.window.__evercraftDraft.restoreDraft(saved)}catch(e){rejected=/fingerprint mismatch/.test(e.message)}
if(!rejected||run('JSON.stringify(state.marks)')!==baseline)throw Error('Wrong image not blocked');
run("state.siteHash='a'.repeat(64)");
for(const fn of [
d=>{d.marks[0].x=-100},d=>{d.calibration.knownFeet=0},
d=>{d.engineering_approved=true},d=>{d.source_binding.context_sha256='e'.repeat(64)},
d=>{d.marks=[...Array(201)].map(()=>({type:'pad',x:200,y:220}))}
]){
 const d=JSON.parse(JSON.stringify(saved));fn(d);let fail=false;
 try{context.window.__evercraftDraft.restoreDraft(d)}catch{fail=true}
 if(!fail||run('JSON.stringify(state.marks)')!==baseline)throw Error('Rejected project changed current drawing');
}
'''
        result=subprocess.run(['node','-e',script],cwd=Path(__file__).resolve().parent,capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)

if __name__=='__main__':unittest.main()
