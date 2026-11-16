// Synthetic Node -> Python -> ForensiScope bridge contract. No real ASR inference.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transcribePreparedAudio} from './transcription-engine.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const adapter=path.join(here,'faster_whisper_local.py');
const python=process.env.EVERCRAFT_PILOT_PYTHON || 'python3';

function fixture({moduleSource,modelComplete=true}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensiscope-local-bridge-'));
  const model=path.join(root,'model');
  fs.mkdirSync(model);
  for(const name of ['config.json','model.bin','tokenizer.json']){
    if (!modelComplete && name==='tokenizer.json') continue;
    fs.writeFileSync(path.join(model,name),'synthetic');
  }
  const audio=path.join(root,'synthetic.wav');
  fs.writeFileSync(audio,'synthetic input bytes');
  fs.writeFileSync(path.join(root,'faster_whisper.py'),moduleSource);
  const env={
    PATH:process.env.PATH,
    PYTHONPATH:root,
    FORENSISCOPE_TRANSCRIBE_ENABLED:'true',
    FORENSISCOPE_TRANSCRIBE_ENGINE_ID:'faster-whisper-local-pilot-synthetic',
    FORENSISCOPE_TRANSCRIBE_EXECUTABLE:python,
    FORENSISCOPE_TRANSCRIBE_ARGS_JSON:JSON.stringify([
      adapter,'--input','{input}','--model-dir',model
    ])
  };
  return {root,audio,env,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}

const fakeModel=[
  'from types import SimpleNamespace',
  'class WhisperModel:',
  '    def __init__(self, path, **kwargs):',
  "        assert kwargs == {'device':'cpu','compute_type':'int8','local_files_only':True}",
  '    def transcribe(self, audio, **kwargs):',
  "        assert kwargs == {'beam_size':5,'vad_filter':False}",
  "        return iter([SimpleNamespace(start=0.25,end=1.5,text='  checked    text  '), SimpleNamespace(start=2,end=3,text='second')]), None",
  ''
].join('\n');

test('local Python CLI returns canonical segments through existing Node transcription engine',t=>{
  const f=fixture({moduleSource:fakeModel});t.after(f.cleanup);
  const output=transcribePreparedAudio({audioPath:f.audio,bounds:{duration:8,offset:37,start:4,end:12},env:f.env});
  assert.equal(output.state,'transcribed');
  assert.equal(output.engine_id,'faster-whisper-local-pilot-synthetic');
  assert.equal(output.segment_count,2);
  assert.deepEqual(output.segments,[
    {start_seconds:41.25,end_seconds:42.5,text:'checked text',confidence:null,speaker:null},
    {start_seconds:43,end_seconds:44,text:'second',confidence:null,speaker:null}
  ]);
});

test('missing local model fails closed without pretending to transcribe',t=>{
  const f=fixture({moduleSource:fakeModel,modelComplete:false});t.after(f.cleanup);
  const result=transcribePreparedAudio({audioPath:f.audio,bounds:{duration:5,offset:0,start:0,end:5},env:f.env});
  assert.equal(result.state,'engine_error');
  assert.equal(result.segment_count,undefined);
  assert.deepEqual(result.segments,[]);
  assert.doesNotMatch(result.reason,/synthetic input bytes/);
});

test('model exceptions cannot leak confidential transcript text to Node error receipt',t=>{
  const f=fixture({moduleSource:[
    'class WhisperModel:',
    '    def __init__(self,*args,**kwargs):',
    "        raise RuntimeError('SECRET_CUSTOMER_CONTENT')",
    ''
  ].join('\n')});t.after(f.cleanup);
  const result=transcribePreparedAudio({audioPath:f.audio,bounds:{duration:5,offset:0,start:0,end:5},env:f.env});
  assert.equal(result.state,'engine_error');
  assert.doesNotMatch(result.reason,/SECRET_CUSTOMER_CONTENT/);
  assert.match(result.reason,/RuntimeError/);
  assert.deepEqual(result.segments,[]);
});
