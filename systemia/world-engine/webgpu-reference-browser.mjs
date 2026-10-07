function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

async function sha256Bytes(bytes){
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash))
    .map(value=>value.toString(16).padStart(2,'0'))
    .join('');
}

async function sha256Text(value){
  return sha256Bytes(new TextEncoder().encode(value));
}

async function digestStable(value){
  return sha256Text(JSON.stringify(stable(value)));
}

function floats(values){
  return new Float32Array(values);
}

function packGeometry(geometry){
  const vertices=geometry.positions.length/3;
  const data=new Float32Array(vertices*6);
  for(let i=0;i<vertices;i++){
    data[i*6]=geometry.positions[i*3];
    data[i*6+1]=geometry.positions[i*3+1];
    data[i*6+2]=geometry.positions[i*3+2];
    data[i*6+3]=geometry.normals[i*3];
    data[i*6+4]=geometry.normals[i*3+1];
    data[i*6+5]=geometry.normals[i*3+2];
  }
  return data;
}

function lightStorageData(lights){
  const values=[];
  for(const light of lights){
    values.push(light.kind,light.intensity,light.range,light.innerCos);
    values.push(light.color[0],light.color[1],light.color[2],light.outerCos);
    values.push(light.position[0],light.position[1],light.position[2],0);
    values.push(light.direction[0],light.direction[1],light.direction[2],0);
  }
  if(!values.length) values.push(0,0,0,0);
  return floats(values);
}

function objectUniformData(draw){
  return floats([
    ...draw.modelMatrix,
    ...draw.normalMatrix,
    ...draw.baseColor,
    draw.materialModel,draw.metallic,draw.roughness,draw.alphaCutoff,
    draw.emissive[0],draw.emissive[1],draw.emissive[2],draw.emissiveIntensity
  ]);
}

function frameUniformData(plan){
  return floats([
    ...plan.viewProjectionMatrix,
    plan.cameraPosition[0],plan.cameraPosition[1],plan.cameraPosition[2],plan.exposure,
    plan.lights.length,0,0,0
  ]);
}

function pixelAt(pixels,width,x,y){
  const offset=(y*width+x)*4;
  return Array.from(pixels.slice(offset,offset+4));
}

function pixelsMatch(observed,expected,tolerance){
  return observed.length===expected.length &&
    observed.every((value,index)=>Math.abs(value-expected[index])<=tolerance);
}

function makePngDataUrl(pixels,width,height){
  const canvas=document.createElement('canvas');
  canvas.width=width;
  canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context) throw new Error('reference_frame_canvas_2d_unavailable');
  const image=new ImageData(new Uint8ClampedArray(pixels),width,height);
  context.putImageData(image,0,0);
  return canvas.toDataURL('image/png');
}

async function verifyReferencePackage(payload){
  if(payload?.schema!=='evercraft.world-engine.webgpu-reference-frame.v1'){
    throw new Error('reference_frame_schema_invalid');
  }
  const {digest:claimed,...core}=payload;
  const packageDigest=await digestStable(core);
  if(packageDigest!==claimed) throw new Error('reference_frame_package_digest_invalid');

  const {digest:planClaimed,...planCore}=payload.plan;
  const planDigest=await digestStable(planCore);
  if(planDigest!==planClaimed||planDigest!==payload.planDigest){
    throw new Error('reference_frame_plan_digest_invalid');
  }

  const shaderDigest=await sha256Text(payload.wgsl);
  if(shaderDigest!==payload.shaderDigest){
    throw new Error('reference_frame_shader_digest_invalid');
  }
  if(payload.plan.sourceVisualFrameDigest!==payload.visualFrameDigest){
    throw new Error('reference_frame_visual_digest_mismatch');
  }
  return {
    packageDigest,
    planDigest,
    shaderDigest
  };
}

export async function executeWorldEngineReferenceFrame(device,payload){
  const verifiedPackage=await verifyReferencePackage(payload);
  const plan=payload.plan;
  const width=plan.width;
  const height=plan.height;
  if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1){
    throw new Error('reference_frame_viewport_invalid');
  }

  const geometryMap=new Map(payload.geometries.map(geometry=>[geometry.id,geometry]));
  if(geometryMap.size!==payload.geometries.length){
    throw new Error('reference_frame_geometry_duplicate');
  }

  const shader=device.createShaderModule({
    label:'Evercraft World Engine reference WGSL',
    code:payload.wgsl
  });
  const compilation=await shader.getCompilationInfo();
  const shaderErrors=compilation.messages
    .filter(message=>message.type==='error')
    .map(message=>message.message);
  if(shaderErrors.length){
    throw new Error('reference_frame_shader_compile_failed:'+shaderErrors.join('|'));
  }

  const usage=GPUBufferUsage;
  const frameData=frameUniformData(plan);
  const frameBuffer=device.createBuffer({
    size:Math.ceil(frameData.byteLength/16)*16,
    usage:usage.UNIFORM|usage.COPY_DST
  });
  device.queue.writeBuffer(frameBuffer,0,frameData);

  const lightData=lightStorageData(plan.lights);
  const lightBuffer=device.createBuffer({
    size:Math.max(16,Math.ceil(lightData.byteLength/16)*16),
    usage:usage.STORAGE|usage.COPY_DST
  });
  device.queue.writeBuffer(lightBuffer,0,lightData);

  const colorTexture=device.createTexture({
    size:[width,height,1],
    format:'rgba8unorm',
    usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC
  });
  const depthTexture=device.createTexture({
    size:[width,height,1],
    format:'depth24plus',
    usage:GPUTextureUsage.RENDER_ATTACHMENT
  });

  const bytesPerRow=Math.ceil((width*4)/256)*256;
  const readback=device.createBuffer({
    size:bytesPerRow*height,
    usage:usage.COPY_DST|usage.MAP_READ
  });

  const geometryBuffers=new Map();
  const objectBuffers=[];
  const pipelines=new Map();

  const ensureGeometry=(geometryId)=>{
    if(geometryBuffers.has(geometryId)) return geometryBuffers.get(geometryId);
    const geometry=geometryMap.get(geometryId);
    if(!geometry) throw new Error('reference_frame_geometry_missing:'+geometryId);
    const vertexData=packGeometry(geometry);
    const vertexBuffer=device.createBuffer({
      size:Math.max(4,vertexData.byteLength),
      usage:usage.VERTEX|usage.COPY_DST
    });
    device.queue.writeBuffer(vertexBuffer,0,vertexData);

    let indexBuffer=null;
    if(geometry.indices?.length){
      const indexData=new Uint32Array(geometry.indices);
      indexBuffer=device.createBuffer({
        size:Math.max(4,indexData.byteLength),
        usage:usage.INDEX|usage.COPY_DST
      });
      device.queue.writeBuffer(indexBuffer,0,indexData);
    }
    const value={
      vertexBuffer,
      indexBuffer,
      vertexCount:geometry.positions.length/3,
      indexCount:geometry.indices?.length||0
    };
    geometryBuffers.set(geometryId,value);
    return value;
  };

  const ensurePipeline=(draw)=>{
    if(pipelines.has(draw.pipelineKey)) return pipelines.get(draw.pipelineKey);
    const blend=draw.alphaMode==='blend'
      ? {
          color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
          alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}
        }
      : undefined;
    const pipeline=device.createRenderPipeline({
      layout:'auto',
      vertex:{
        module:shader,
        entryPoint:'vs_main',
        buffers:[{
          arrayStride:24,
          attributes:[
            {shaderLocation:0,offset:0,format:'float32x3'},
            {shaderLocation:1,offset:12,format:'float32x3'}
          ]
        }]
      },
      fragment:{
        module:shader,
        entryPoint:'fs_main',
        targets:[{format:'rgba8unorm',blend}]
      },
      primitive:{
        topology:'triangle-list',
        frontFace:'ccw',
        cullMode:draw.doubleSided?'none':'back'
      },
      depthStencil:{
        format:'depth24plus',
        depthWriteEnabled:draw.alphaMode!=='blend',
        depthCompare:'less'
      }
    });
    pipelines.set(draw.pipelineKey,pipeline);
    return pipeline;
  };

  device.pushErrorScope('validation');
  const encoder=device.createCommandEncoder({
    label:'Evercraft World Engine reference frame'
  });
  const pass=encoder.beginRenderPass({
    colorAttachments:[{
      view:colorTexture.createView(),
      clearValue:{
        r:plan.clearColor.r,
        g:plan.clearColor.g,
        b:plan.clearColor.b,
        a:1
      },
      loadOp:'clear',
      storeOp:'store'
    }],
    depthStencilAttachment:{
      view:depthTexture.createView(),
      depthClearValue:1,
      depthLoadOp:'clear',
      depthStoreOp:'store'
    }
  });

  for(const draw of plan.draws){
    const pipeline=ensurePipeline(draw);
    const geometry=ensureGeometry(draw.geometryId);
    const frameBindGroup=device.createBindGroup({
      layout:pipeline.getBindGroupLayout(0),
      entries:[
        {binding:0,resource:{buffer:frameBuffer}},
        {binding:1,resource:{buffer:lightBuffer}}
      ]
    });
    const objectData=objectUniformData(draw);
    const objectBuffer=device.createBuffer({
      size:Math.ceil(objectData.byteLength/16)*16,
      usage:usage.UNIFORM|usage.COPY_DST
    });
    objectBuffers.push(objectBuffer);
    device.queue.writeBuffer(objectBuffer,0,objectData);
    const objectBindGroup=device.createBindGroup({
      layout:pipeline.getBindGroupLayout(1),
      entries:[{binding:0,resource:{buffer:objectBuffer}}]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0,frameBindGroup);
    pass.setBindGroup(1,objectBindGroup);
    pass.setVertexBuffer(0,geometry.vertexBuffer);
    if(geometry.indexBuffer){
      pass.setIndexBuffer(geometry.indexBuffer,'uint32');
      pass.drawIndexed(geometry.indexCount,1,0,0,0);
    }else{
      pass.draw(geometry.vertexCount,1,0,0);
    }
  }
  pass.end();

  encoder.copyTextureToBuffer(
    {texture:colorTexture},
    {buffer:readback,bytesPerRow,rowsPerImage:height},
    [width,height,1]
  );
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const validationError=await device.popErrorScope();
  if(validationError){
    throw new Error('reference_frame_validation_error:'+validationError.message);
  }

  await readback.mapAsync(GPUMapMode.READ);
  const mapped=new Uint8Array(readback.getMappedRange().slice(0));
  const pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++){
    pixels.set(
      mapped.slice(y*bytesPerRow,y*bytesPerRow+width*4),
      y*width*4
    );
  }
  readback.unmap();

  const center=pixelAt(
    pixels,width,payload.expected.center.x,payload.expected.center.y
  );
  const background=pixelAt(
    pixels,width,payload.expected.background.x,payload.expected.background.y
  );
  const centerVerified=pixelsMatch(
    center,payload.expected.center.rgba,payload.expected.tolerance
  );
  const backgroundVerified=pixelsMatch(
    background,payload.expected.background.rgba,payload.expected.tolerance
  );
  const pixelSha256=await sha256Bytes(pixels);
  const pngDataUrl=makePngDataUrl(pixels,width,height);

  frameBuffer.destroy();
  lightBuffer.destroy();
  readback.destroy();
  colorTexture.destroy();
  depthTexture.destroy();
  for(const geometry of geometryBuffers.values()){
    geometry.vertexBuffer.destroy();
    geometry.indexBuffer?.destroy();
  }
  for(const buffer of objectBuffers) buffer.destroy();

  return {
    schema:'evercraft.world-engine.webgpu-reference-execution.v1',
    verified:centerVerified&&backgroundVerified,
    packageDigest:verifiedPackage.packageDigest,
    planDigest:verifiedPackage.planDigest,
    shaderDigest:verifiedPackage.shaderDigest,
    width,
    height,
    drawCount:plan.draws.length,
    lightCount:plan.lights.length,
    center:{
      expected:payload.expected.center.rgba,
      observed:center,
      verified:centerVerified
    },
    background:{
      expected:payload.expected.background.rgba,
      observed:background,
      verified:backgroundVerified
    },
    pixelSha256,
    pngDataUrl
  };
}
