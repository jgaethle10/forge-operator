import {pickEvidence,splitSentences,textReport} from './core.mjs';
/** Uses Apache-2.0 licensed open weights. No LLM API or file upload. */
export const MODEL_ID='Xenova/all-MiniLM-L6-v2';
export const MODEL_LIBRARY='@huggingface/transformers';
export class LocalAIBriefer {
  constructor(){this.extractor=null;this.loading=null;this.status='unloaded';}
  async load(onProgress=()=>{}) {
    if(this.extractor)return this.extractor;
    if(this.loading)return this.loading;
    this.status='loading';
    this.loading=(async()=>{
      onProgress('Fetching open-source inference runtime');
      // The runtime code and open model weights download on first use, then browser cache can help.
      // File content is processed only in the browser's local inference engine.
      const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      env.allowRemoteModels=true;
      env.useBrowserCache=true;
      onProgress('Loading MiniLM quantized open weights (~23 MB)');
      const extractor=await pipeline('feature-extraction',MODEL_ID,{device:'wasm',dtype:'q8',progress_callback:p=>{
        if(p?.status==='progress'&&p?.progress!=null)onProgress(`Model download: ${Math.round(p.progress)}%`);
      }});
      // A real inference must succeed before claiming the model is ready.
      const proof=await extractor('File Ferry local open model self-test.',{pooling:'mean',normalize:true});
      const vectors=proof.tolist();
      if(!Array.isArray(vectors)||vectors[0]?.length!==384)throw new Error('Open model inference returned unexpected embeddings');
      this.extractor=extractor;this.status='ready';onProgress('Local model inference verified');
      return extractor;
    })().catch(error=>{this.status='failed';this.loading=null;throw error;});
    return this.loading;
  }
  async brief(file,goal,onProgress=()=>{}){
    if(this.status!=='ready'||!this.extractor)throw new Error('Verified model must be loaded before creating an AI brief');
    if(file.size>2*1024*1024)throw new Error('For privacy and performance, text briefs are currently limited to 2 MiB. Use lossless parts.');
    const text=await file.text();
    const sentences=splitSentences(text,40);
    if(!sentences.length)throw new Error('No complete readable sentences were found in this text file');
    const question=String(goal||'Which facts and actions matter to the recipient?').slice(0,260);
    onProgress('Embedding recipient goal and local source sentences');
    const extracted=[];
    for(let i=0;i<sentences.length;i+=8){
      const tensor=await this.extractor(sentences.slice(i,i+8),{pooling:'mean',normalize:true});
      extracted.push(...tensor.tolist());
      onProgress(`Read ${Math.min(i+8,sentences.length)} / ${sentences.length} sentences locally`);
    }
    const q=(await this.extractor(question,{pooling:'mean',normalize:true})).tolist()[0];
    const ranked=pickEvidence(sentences,extracted,q,Math.min(5,sentences.length));
    const report=textReport({file,goal:question,excerpt:sentences.length,sentences:ranked});
    return {blob:new Blob([report],{type:'text/plain;charset=utf-8'}),ranked,sourceSentenceCount:sentences.length,model:MODEL_ID};
  }
}