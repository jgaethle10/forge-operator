"""Phone-first editor: charger selection, reposition and reversible changes."""
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent

class TapToEditTests(unittest.TestCase):
    def test_reposition_undo_erase_reset_and_new_source_history(self):
        js=r'''
const fs=require('fs'),vm=require('vm');
const page=fs.readFileSync('plan-studio.html','utf8');
const code=page.split('<script>')[1].split('</script>')[0];
new Function(code);
const nodes=new Map(),defaults={siteName:'DEMONSTRATION RETAIL SITE',address:'Sample',rev:'CONCEPT',sourceText:'None',knownFeet:'100',angle:'0'};
function get(id){
 if(!nodes.has(id))nodes.set(id,{value:defaults[id]||'',textContent:'',innerHTML:'',handlers:{},
 addEventListener(k,f){this.handlers[k]=f},classList:{toggle(){}},
 createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}}},
 getScreenCTM(){return {inverse(){return {}}}}});
 return nodes.get(id);
}
const sandbox={document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>({})},window:{},console,setTimeout,URL,Blob,alert:()=>{}};
vm.createContext(sandbox);vm.runInContext(code,sandbox,{timeout:4000});
const run=(s)=>vm.runInContext(s,sandbox);
const tap=(x,y)=>run('onCanvasTap({clientX:'+x+',clientY:'+y+'})');
const count=()=>Number(run('state.marks.filter(x=>x.type==="charger").length'));
if(count()!==8)throw Error('Demonstration expected eight chargers');
tap(450,400);if(count()!==9||run('state.history.length')!==1)throw Error('Tap did not add charger with undo history');
tap(450,400);if(run('state.selectedMarkIndex')===null||count()!==9)throw Error('Tap existing charger did not select it');
tap(500,470);if(run('state.selectedMarkIndex')!==null||count()!==9)throw Error('Move accidentally added another charger');
if(run('state.marks.find(x=>x.x===500&&x.y===470)')==null)throw Error('Charger not relocated');
get('undo').handlers.click();
if(run('state.marks.find(x=>x.x===450&&x.y===400)')==null)throw Error('Undo did not restore prior position');
get('undo').handlers.click();if(count()!==8)throw Error('Undo did not remove new charger');
get('undo').handlers.click();if(count()!==8)throw Error('Undo without history mutated demonstration');
tap(450,400);tap(450,400);get('undo').handlers.click();
if(run('state.selectedMarkIndex')!==null)throw Error('Undo did not cancel move selection');
if(count()!==9)throw Error('Cancel selection altered layout');
run("state.tool='erase'");tap(450,400);if(count()!==8)throw Error('Erasing failed');
get('undo').handlers.click();if(count()!==9)throw Error('Undo could not restore erased placement');
get('reset').handlers.click();if(count()!==8)throw Error('Reset should restore demo eight');
get('undo').handlers.click();if(count()!==9)throw Error('Undo did not restore pre-reset layout');
class Reader{readAsDataURL(f){this.result='data:image/png;base64,AA==';this.onload()}}
sandbox.FileReader=Reader;
run("readImage({files:[{name:'real-photo.png',type:'image/png',size:3}],value:''},'siteImage','siteSource')");
if(count()!==0||run('state.history.length')!==0||run('state.selectedMarkIndex')!==null)throw Error('New aerial retained old edit state');
get('undo').handlers.click();if(count()!==0)throw Error('Undo brought back marks from unrelated aerial');
console.log('TAP-TO-EDIT PASS');
'''
        result=subprocess.run(['node','-e',js],cwd=ROOT,capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('TAP-TO-EDIT PASS',result.stdout)

if __name__=='__main__':unittest.main()
