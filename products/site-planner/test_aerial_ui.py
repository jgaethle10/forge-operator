"""Address-first aerial lookup UX: mocked browser, source isolation and no fake approvals."""
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent


class AerialUITests(unittest.TestCase):
    def test_browser_federal_lookup_and_safe_manual_override(self):
        script=r'''
const fs=require('fs'),vm=require('vm');
const page=fs.readFileSync('plan-studio.html','utf8'),inline=page.split('<script>')[1].split('</script>')[0];
new Function(inline);
const el=new Map(),defaults={siteName:'DEMONSTRATION RETAIL SITE',address:'4600 Silver Hill Rd, Washington, DC 20233',rev:'DRAFT',knownFeet:'100'};
function get(id){
 if(!el.has(id))el.set(id,{value:defaults[id]||'',innerHTML:'',textContent:'',disabled:false,handlers:{},classList:{toggle(){}},addEventListener(k,fn){this.handlers[k]=fn},
 createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}}},getScreenCTM(){return {inverse(){return {}}}}});
 return el.get(id);
}
const response={
 schema:'evercraft.site-planner.usgs-address-aerial.v1',match_class:'census_address_range_not_parcel',
 census_matched_address:'4600 SILVER HILL RD, WASHINGTON, DC, 20233',
 approximate_address_coordinate:{lon:-76.92,lat:38.84},
 site:{image_base64:'aGVsbG8=',sha256:'a'.repeat(64),bbox_3857:[1,2,3,4]},
 vicinity:{image_base64:'d29ybGQ=',sha256:'b'.repeat(64),bbox_3857:[10,20,30,40]}
};
let status=200,data=response,calls=0;
const sandbox={document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>({})},
 window:{},console,setTimeout,URL,Blob,alert:()=>{},fetch:async(url,options)=>{
  if(url!=='/api/aerial/preview'||options.method!=='POST')throw Error('Non-owned endpoint or method');
  if(JSON.parse(options.body).address!==defaults.address)throw Error('Address not sent explicitly');
  calls++;return {ok:status===200,json:async()=>data};
 }};
vm.createContext(sandbox);vm.runInContext(inline,sandbox,{timeout:4000});
(async()=>{
 const run=s=>vm.runInContext(s,sandbox);
 run("state.marks=[{type:'charger',x:330,y:350}];state.calibration={knownFeet:40}");
 await run("lookupPublicAerial()");
 if(calls!==1||get('lookupAerial').disabled)throw Error('Lookup did not finish');
 if(run('state.marks.length')!==0||run('state.calibration')!==null)throw Error('Old drawing carried over');
 if(run('state.siteHash')!=='a'.repeat(64)||run('state.contextHash')!=='b'.repeat(64))throw Error('Fingerprints missing');
 if(run('state.siteSource')!=='Evercraft-USGS-Site.jpg'||run('state.contextSource')!=='Evercraft-USGS-Vicinity.jpg')throw Error('Source filenames missing');
 if(!get('sourceState').textContent.includes('Census matched'))throw Error('Source is not labeled');
 if(!run('evidenceRecord().government_source')||run('evidenceRecord().customer_payment_verified')!==false)throw Error('Unverified provenance not retained');
 if(!get('drawing-1').innerHTML.includes('data:image/jpeg;base64,aGVsbG8='))throw Error('Aerial missing from site sheet');
 status=400;data={error:'Address ambiguous'};
 const before=run('state.siteHash');
 await run('lookupPublicAerial()');
 if(run('state.siteHash')!==before||!get('messages').textContent.includes('Address ambiguous'))throw Error('Failed lookup mutated project');

 // Editing an address invalidates the previously retrieved aerial, not just its label.
 get('address').value='100 New Property St, Washington, DC 20001';
 get('address').handlers.input();
 if(run('state.siteImage')!==''||run('state.contextImage')!=='')throw Error('Stale imagery survived address edit');
 if(run('state.aerialProvenance')!==null||run('state.siteHash')!==''||run('state.contextHash')!=='')throw Error('Old geolocation provenance survived address edit');
 if(run('state.marks.length')!==0||run('state.calibration')!==null)throw Error('Old-site geometry survived address edit');
 if(!get('sourceState').textContent.includes('Address changed'))throw Error('User not notified of reset');

 class Reader{readAsDataURL(f){this.result='data:image/png;base64,dGVzdA==';this.onload()}}
 sandbox.FileReader=Reader;
 run("readImage({files:[{name:'new-property.png',type:'image/png',size:4}],value:''},'siteImage','siteSource')");
 if(run('state.contextImage')!==''||run('state.contextHash')!==''||run('state.aerialProvenance')!==null)throw Error('Old vicinity evidence carried onto new site');
 if(run('state.siteSource')!=='new-property.png')throw Error('Manual upload failed');
})().catch(e=>{console.error(e);process.exitCode=1});
'''
        result=subprocess.run(['node','-e',script],cwd=ROOT,capture_output=True,text=True,timeout=12)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_three_simple_steps_survive_address_lookup(self):
        html=(ROOT/'plan-studio.html').read_text()
        self.assertEqual(html.count('class="quick-step"'),3)
        first=html.split('class="quick-step"',1)[1].split('</div>\n<div class="quick-step"',1)[0]
        for token in ('id="address"','id="lookupAerial"','id="siteImage"','id="sourceState"'):
            self.assertIn(token,first)
        self.assertIn('government_source:',html)
        self.assertIn('Your address is sent to those government services.',html)
        self.assertNotIn('buy.stripe.com',html)

if __name__=='__main__':unittest.main()
