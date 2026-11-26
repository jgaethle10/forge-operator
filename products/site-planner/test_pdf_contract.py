"""PDF export contract: two-page PDF structure, explicit phone links, invalidation.

Uses only Node.js and Python standard library. The 8px JPEG fixture is generated
locally for format/offset testing; full-resolution browser raster is tested separately.
"""
import base64
import re
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent
# Synthetic JPEG envelope fixture for PDF binary contract tests only; not a renderable photo.
TINY_JPEG="/9j/2Q=="


class PdfContractTests(unittest.TestCase):
    def test_generated_pdf_has_valid_cross_reference_and_two_pages(self):
        script=r"""
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('plan-pdf.js','utf8');
new Function(source);
const context={TextEncoder,Blob,URL:{createObjectURL:()=> 'blob:unused',revokeObjectURL(){}},
 window:{},document:{getElementById:()=>null}};
context.$=id=>({hidden:true,removeAttribute(){},addEventListener(){}});
vm.createContext(context);vm.runInContext(source,context,{timeout:4000});
const b64=process.argv[1];
const raw=Buffer.from(b64,'base64');
context.TEST_BYTES=raw;
const result=vm.runInContext('window.__evercraftPdf.pdfBytes([new Uint8Array(TEST_BYTES),new Uint8Array(TEST_BYTES)])',context,{timeout:4000});
process.stdout.write(Buffer.from(result).toString('base64'));
"""
        p=subprocess.run(['node','-e',script,TINY_JPEG],cwd=ROOT,
                         capture_output=True,text=True,timeout=8)
        self.assertEqual(p.returncode,0,p.stderr)
        pdf=base64.b64decode(p.stdout)
        self.assertTrue(pdf.startswith(b'%PDF-1.4\n'))
        self.assertTrue(pdf.endswith(b'%%EOF\n'))
        self.assertEqual(len(re.findall(rb'/Type /Page /Parent',pdf)),2)
        self.assertEqual(len(re.findall(rb'/Subtype /Image',pdf)),2)
        self.assertEqual(len(re.findall(rb'/MediaBox \[0 0 1224 792\]',pdf)),2)
        self.assertEqual(pdf.count(b'\xff\xd8\xff'),2)
        xrefs=re.search(rb'startxref\n(\d+)\n%%EOF\n$',pdf)
        self.assertIsNotNone(xrefs)
        pointer=int(xrefs.group(1))
        self.assertEqual(pdf[pointer:pointer+7],b'xref\n0 ')
        table=pdf[pointer:].split(b'trailer\n',1)[0]
        self.assertIn(b'xref\n0 9\n',table)
        entries=re.findall(rb'(\d{10}) 00000 n \n',table)
        self.assertEqual(len(entries),8)
        for obj_id,offset in enumerate(entries,1):
            self.assertTrue(pdf[int(offset):].startswith(f'{obj_id} 0 obj\n'.encode()),obj_id)

    def test_phone_pdf_open_download_and_stale_invalidation(self):
        script=r"""
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('plan-pdf.js','utf8');new Function(source);
const els=new Map(),events=new Map(),revoke=[],create=[];
function get(id){if(!els.has(id))els.set(id,{
 hidden:true,disabled:false,textContent:'',href:'',download:'',
 addEventListener(k,fn){events.set(id+':'+k,fn)},
 removeAttribute(k){delete this[k]},
 cloneNode(){return {querySelector(){return null},setAttribute(){}}},
 click(){throw Error('PDF link must not auto-click')}
});return els.get(id)}
const context={
 TextEncoder,Blob,atob,
 XMLSerializer:class {serializeToString(){return '<svg xmlns="http://www.w3.org/2000/svg"/>'}},
 Image:class {set src(url){this.onload?.()}},
 document:{
  getElementById:get,
  createElement(tag){
   if(tag!=='canvas')throw Error('Unknown element: '+tag);
   return {width:0,height:0,getContext(){return {fillRect(){},drawImage(){},set fillStyle(v){}}},
    toDataURL(){return 'data:image/jpeg;base64,'+process.argv[1]}};
  }
 },$ : get,
 URL:{createObjectURL(b){const url='blob:local-'+create.length;create.push([url,b]);return url},revokeObjectURL(u){revoke.push(u)}},
 window:{},console
};
vm.createContext(context);
vm.runInContext(source,context,{timeout:4000});
(async()=>{
 const click=events.get('print:click');
 if(typeof click!=='function')throw Error('Main PDF click not wired');
 await click();
 if(get('pdfReady').hidden||get('pdfDownload').hidden)throw Error('Open and download must be visible');
 if(get('pdfReady').href!==get('pdfDownload').href)throw Error('Open/download must refer to one PDF');
 if(get('pdfDownload').download!=='Evercraft-EV-Site-Concept-S01-A01.pdf')throw Error('Wrong download name');
 if(get('print').disabled||get('print').textContent!=='View / Save PDF')throw Error('Main action did not recover');
 const blob=create.map(x=>x[1]).find(x=>x.type==='application/pdf');
 if(!blob)throw Error('PDF blob not created');
 const bytes=Buffer.from(await blob.arrayBuffer());
 if(bytes.subarray(0,8).toString()!=='%PDF-1.4')throw Error('PDF payload missing');
 const prior=revoke.length;
 vm.runInContext('window.__evercraftPdf.invalidate()',context);
 if(!get('pdfReady').hidden||!get('pdfDownload').hidden||revoke.length!==prior+1)throw Error('Stale PDF was not invalidated');
 context.window.__evercraftDrawingVersion=7;
 let rasterCount=0;
 context.Image=class {set src(url){rasterCount++;if(rasterCount===2)context.window.__evercraftDrawingVersion=8;this.onload?.()}};
 await click();
 if(!get('pdfReady').hidden||!get('pdfDownload').hidden)throw Error('Mid-render edit allowed stale PDF');
 if(!get('messages').textContent.includes('The drawing changed while the PDF was being made'))throw Error('No clear retry message after edit');
 console.log('PHONE PDF FLOW PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
"""
        p=subprocess.run(['node','-e',script,TINY_JPEG],cwd=ROOT,
                         capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,0,p.stderr)
        self.assertIn('PHONE PDF FLOW PASS',p.stdout)

    def test_no_automatic_download_and_sheet_invalidation_hook(self):
        source=(ROOT/'plan-pdf.js').read_text()
        html=(ROOT/'plan-studio.html').read_text()
        self.assertNotIn('ready.click()',source)
        self.assertIn('id="pdfReady"',html)
        self.assertIn('id="pdfDownload"',html)
        self.assertIn('target="_blank" rel="noopener"',html)
        self.assertIn('window.__evercraftPdf?.invalidate',html)
        self.assertIn('Not for construction.',html)
        self.assertEqual(html.count('class="quick-step"'),3)


if __name__=='__main__':
    unittest.main()
