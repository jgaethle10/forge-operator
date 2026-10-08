export const EVERCRAFT_WEBGPU_WGSL=`
struct FrameUniforms {
  viewProjection: mat4x4<f32>,
  cameraExposure: vec4<f32>,
  lightMeta: vec4<f32>,
};

struct ObjectUniforms {
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
  baseColor: vec4<f32>,
  material: vec4<f32>,
  emissive: vec4<f32>,
};

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<storage, read> lightData: array<vec4<f32>>;
@group(1) @binding(0) var<uniform> object: ObjectUniforms;

struct VertexIn {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
};

@vertex
fn vs_main(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  let world = object.model * vec4<f32>(input.position, 1.0);
  out.position = frame.viewProjection * world;
  out.worldPosition = world.xyz;
  out.normal = normalize((object.normalMatrix * vec4<f32>(input.normal, 0.0)).xyz);
  return out;
}

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let base = object.baseColor;
  let modelFlag = object.material.x;
  let metallic = saturate(object.material.y);
  let roughness = clamp(object.material.z, 0.04, 1.0);
  let alphaCutoff = object.material.w;

  if (alphaCutoff >= 0.0 && base.a < alphaCutoff) {
    discard;
  }

  let emissive = object.emissive.rgb * object.emissive.a;
  if (modelFlag > 0.5) {
    return vec4<f32>((base.rgb + emissive) * frame.cameraExposure.w, base.a);
  }

  let N = normalize(input.normal);
  let V = normalize(frame.cameraExposure.xyz - input.worldPosition);
  var lighting = vec3<f32>(0.0);
  var specular = vec3<f32>(0.0);
  let lightCount = u32(frame.lightMeta.x);

  for (var i:u32=0u; i<lightCount; i=i+1u) {
    let offset=i*4u;
    let head=lightData[offset];
    let colorOuter=lightData[offset+1u];
    let pos=lightData[offset+2u].xyz;
    let direction=normalize(lightData[offset+3u].xyz);
    let kind=u32(head.x+0.5);
    let intensity=head.y;
    let range=head.z;
    let innerCos=head.w;
    let color=colorOuter.rgb;
    let outerCos=colorOuter.w;

    if (kind==0u) {
      lighting += color*intensity;
      continue;
    }

    var L=vec3<f32>(0.0);
    var attenuation=1.0;

    if (kind==1u) {
      L=normalize(-direction);
    } else {
      let delta=pos-input.worldPosition;
      let dist=length(delta);
      if (dist<=0.00001 || dist>=range) {
        continue;
      }
      L=delta/dist;
      attenuation=saturate(1.0-dist/range);
      if (kind==3u) {
        let cone=dot(direction,-L);
        let coneWidth=max(innerCos-outerCos,0.00001);
        attenuation*=saturate((cone-outerCos)/coneWidth);
      }
    }

    let ndotl=max(dot(N,L),0.0);
    lighting += color*intensity*ndotl*attenuation;

    if (ndotl>0.0) {
      let H=normalize(L+V);
      let shininess=mix(128.0,4.0,roughness);
      let spec=pow(max(dot(N,H),0.0),shininess);
      let dielectric=vec3<f32>(0.04);
      let f0=mix(dielectric,base.rgb,metallic);
      specular += f0*spec*intensity*attenuation;
    }
  }

  let diffuse=base.rgb*lighting*mix(1.0,0.25,metallic);
  let color=(diffuse+specular+emissive)*frame.cameraExposure.w;
  return vec4<f32>(color,base.a);
}
`;
