"""Kennedy plan studio: access control, editor interactions, and demo evidence limits."""
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import server

class PlanStudioTests(unittest.TestCase):
    def test_protected_two_sheet_editor_does_not_modify_sites_or_orders(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(server,'DB',Path(temp)/'demo.sqlite3'), patch.object(server,'TOKEN','local-test-token'):
                server.init()
                http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
                thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
                base=f'http://127.0.0.1:{http.server_port}'
                try:
                    for route in ('/plan-studio','/plan-studio.html'):
                        with self.assertRaises(HTTPError) as err:urlopen(base+route,timeout=4)
                        self.assertEqual(err.exception.code,401)
                        with urlopen(Request(base+route,headers={'Authorization':'Bearer local-test-token'}),timeout=4) as response:
                            page=response.read().decode('utf-8')
                            self.assertEqual(response.status,200)
                            self.assertIn('frame-ancestors',response.headers['Content-Security-Policy'])
                            for marker in ('KENNEDY DRAWING SYSTEM','type="file"','FICTIONAL DIAGRAM','NOT FOR CONSTRUCTION','function onCanvasTap','sourceHash'):
                                if marker=='sourceHash':marker="siteHash"
                                self.assertIn(marker,page)
                            self.assertNotIn('https://buy.stripe.com',page)
                    with server.connect() as db:
                        for table in ('sites','orders','outbox','plans'):
                            self.assertEqual(db.execute('SELECT count(*) FROM '+table).fetchone()[0],0)
                finally:
                    http.shutdown();http.server_close();thread.join(timeout=5)

    def test_studio_controls_run_in_owned_node_vm(self):
        script=r'''
const fs=require('fs'),vm=require('vm');
const page=fs.readFileSync('plan-studio.html','utf8');
const code=page.split('<script>')[1].split('</script>')[0];new Function(code);
const el=new Map(),defaults={siteName:'Demo',address:'Imaginary',rev:'CONCEPT',sourceText:'No image supplied',angle:'0'};
function get(id){if(!el.has(id))el.set(id,{value:defaults[id]||'',innerHTML:'',textContent:'',handlers:{},addEventListener:function(k,fn){this.handlers[k]=fn},classList:{toggle(){}},createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}}},getScreenCTM(){return {inverse(){return {}}}}});return el.get(id)}
const document={getElementById:get,querySelectorAll:()=>[],createElement:()=>({})};
const sandbox={document,window:{},console,setTimeout,URL,Blob,alert:()=>{}};
vm.createContext(sandbox);vm.runInContext(code,sandbox,{timeout:4000});
if(get('chargerCount').textContent!=='8 CONCEPT CHARGERS')throw Error('Initial demo count missing');
if(!get('drawing-1').innerHTML.includes('EV INFRASTRUCTURE CONCEPT'))throw Error('Site sheet absent');
if(!get('drawing-2').innerHTML.includes('AREA SOURCE IMAGE NOT PROVIDED'))throw Error('Context placeholder absent');
vm.runInContext('onCanvasTap({clientX:450,clientY:400})',sandbox);
if(get('chargerCount').textContent!=='9 CONCEPT CHARGERS')throw Error('Tap did not add charger');
get('undo').handlers.click();
if(get('chargerCount').textContent!=='8 CONCEPT CHARGERS')throw Error('Undo failed');
vm.runInContext("state.tool='route';onCanvasTap({clientX:500,clientY:450});onCanvasTap({clientX:600,clientY:500})",sandbox);
if(!get('drawing-1').innerHTML.includes('M500 450 L600 500'))throw Error('Conduit route absent');
class MockReader{readAsDataURL(f){this.result='data:image/png;base64,AAAA';this.onload()}}
sandbox.FileReader=MockReader;
vm.runInContext("readImage({files:[{type:'image/png',name:'owned-aerial.png',size:4}],value:''},'siteImage','siteSource')",sandbox);
if(!get('drawing-1').innerHTML.includes('data:image/png;base64,AAAA'))throw Error('Supplied aerial missing');
if(!get('drawing-1').innerHTML.includes('OPERATOR-SUPPLIED AERIAL'))throw Error('Image source label missing');
if(get('chargerCount').textContent!=='0 CONCEPT CHARGERS')throw Error('Demo objects were carried onto actual image');
'''
        result=subprocess.run(['node','-e',script],cwd=Path(__file__).resolve().parent,capture_output=True,text=True,timeout=8,check=False)
        self.assertEqual(result.returncode,0,result.stderr)

if __name__=='__main__':unittest.main()
