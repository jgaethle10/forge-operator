"""Kennedy operator reference measurement must not turn diagrams into survey assertions."""
import subprocess
import unittest
from pathlib import Path

class CalibrationTests(unittest.TestCase):
    def test_reference_length_and_source_binding_in_browser_vm(self):
        js = r'''
const fs=require('fs'),vm=require('vm');
const page=fs.readFileSync('plan-studio.html','utf8');
const script=page.split('<script>')[1].split('</script>')[0];
new Function(script);
const els=new Map();
const defaults={siteName:'Test property',address:'Not verified',rev:'DRAFT',sourceText:'No source',knownFeet:'100'};
function element(id){if(!els.has(id))els.set(id,{value:defaults[id]??'',innerHTML:'',textContent:'',handlers:{},classList:{toggle(){}},addEventListener(k,fn){this.handlers[k]=fn},createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}}},getScreenCTM(){return {inverse(){return {}}}}});return els.get(id)}
const sandbox={document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>({})},window:{},console,setTimeout,URL,Blob,alert() {}};
vm.createContext(sandbox);vm.runInContext(script,sandbox,{timeout:5000});
const click=(x,y)=>vm.runInContext('onCanvasTap({clientX:'+x+',clientY:'+y+'})',sandbox);
const run=x=>vm.runInContext(x,sandbox);
// No source image means no reference distance may be asserted.
run("state.tool='calibrate'");click(100,100);if(run('state.calibration')!==null)throw Error('calibration accepted on demo');
// Source image present: reject invalid distances and short baselines.
run("state.siteImage='data:image/png;base64,YQ==';state.siteSource='site.png';state.marks=[]");
element('knownFeet').value='0';click(100,100);if(run('state.calibrationPending')!==null)throw Error('invalid zero length accepted');
element('knownFeet').value='100';click(100,100);click(110,100);if(run('state.calibration')!==null)throw Error('short line accepted');
click(100,100);click(300,100);
if(Math.abs(run('state.calibration.feetPerUnit')-0.5)>1e-9)throw Error('wrong conversion');
if(element('scaleState').textContent!=='OPERATOR REFERENCE · NOT SURVEYED')throw Error('scale wrongly certified');
const len=run("routeEstimate({type:'route',x:100,y:100,x2:300,y2:100})");if(len!==100)throw Error('wrong route estimate '+len);
const evidence=JSON.parse(run('JSON.stringify(evidenceRecord())'));
if(evidence.imagery.site.name!=='site.png'||evidence.imagery.verified_geolocation!==false||evidence.engineering_approved!==false)throw Error('evidence overclaimed');
if(JSON.stringify(evidence).includes('data:image'))throw Error('raw aerial leaked into JSON');
if(evidence.reference_calibration.classification!=='operator_reference_estimate_not_survey')throw Error('bad evidence state');
// Replacing the image invalidates the old reference and eliminates old marks.
run("state.marks.push({type:'charger',x:100,y:200});state.tool='charger'");
class Reader{readAsDataURL(){this.result='data:image/jpeg;base64,Yg==';this.onload()}}sandbox.FileReader=Reader;
run("readImage({files:[{type:'image/jpeg',name:'second-site.jpg',size:50}],value:''},'siteImage','siteSource')");
if(run('state.calibration')!==null || run('state.marks.length')!==0)throw Error('stale calibrated drawing survived new aerial');
if(element('scaleState').textContent!=='SCALE UNVERIFIED · NTS')throw Error('scale not reset');
'''
        result=subprocess.run(['node','-e',js],cwd=Path(__file__).resolve().parent,capture_output=True,text=True,timeout=12)
        self.assertEqual(result.returncode,0,result.stderr)

if __name__=='__main__':unittest.main()
