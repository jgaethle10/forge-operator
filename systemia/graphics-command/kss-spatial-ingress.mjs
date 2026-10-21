import crypto from 'node:crypto';

// Rights-aware KSS spatial presentation bridge. This is NOT a site-plan solver or
// certified engineering renderer. It only translates already-adjudicated local
// geometry into Fallen's owned, meter-scale geometry contract.
export const KSS_SPATIAL_INGRESS_SCHEMA = 'evercraft.kss.spatial-ingress.v1';
export const KSS_SPATIAL_HANDOFF_SCHEMA = 'evercraft.graphics-command.kss-world-handoff.v1';

const allowedKinds = new Set(['building', 'pavement', 'equipment', 'structure']);
const allowedRights = new Set(['owned', 'licensed', 'public_domain']);
const classification = new Set(['synthetic', 'observed', 'source-derived', 'inferred', 'proposed']);
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function fail(code) { throw new Error('kss_spatial_' + code); }
function str(value) { return String(value ?? '').trim(); }
function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(name + '_invalid');
  return value;
}
function positive(value, name) {
  const n = finite(value, name);
  if (n <= 0) fail(name + '_not_positive');
  return n;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stable(item)])
  );
  return value;
}
function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function validateId(id, name) {
  if (!idPattern.test(str(id))) fail(name + '_invalid');
  return str(id);
}
function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.z < b.z + b.depth && a.z + a.depth > b.z;
}
function rightsPacket(packet) {
  const rightsState = str(packet?.rightsState);
  const license = str(packet?.license);
  const sourceRef = str(packet?.sourceRef);
  const evidenceState = str(packet?.evidenceState);
  if (!allowedRights.has(rightsState)) fail('rights_unresolved');
  if (!license || !sourceRef) fail('provenance_missing');
  if (!classification.has(evidenceState)) fail('evidence_state_invalid');
  if (rightsState === 'licensed' && packet?.derivativeUseApproved !== true) {
    fail('license_derivative_approval_missing');
  }
  // Only these reviewed fields propagate. Metadata from partner/customer
  // records is never copied implicitly into the canonical scene graph.
  return { rightsState, license, sourceRef, evidenceState };
}
function boxAsset(shape, provenance, projectId) {
  const { id, x, z, width, depth, height } = shape;
  const x0 = x, x1 = x + width, z0 = z, z1 = z + depth, y0 = 0, y1 = height;
  const faces = [
    { n:[0,0,1], q:[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]] },
    { n:[0,0,-1], q:[[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]] },
    { n:[1,0,0], q:[[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]] },
    { n:[-1,0,0], q:[[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]] },
    { n:[0,1,0], q:[[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]] },
    { n:[0,-1,0], q:[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]] },
  ];
  const positions = [], normals = [], uvs = [], indices = [];
  for (const face of faces) {
    const offset = positions.length / 3;
    for (const [i, vertex] of face.q.entries()) {
      positions.push(...vertex);
      normals.push(...face.n);
      uvs.push(...[[0,0],[1,0],[1,1],[0,1]][i]);
    }
    indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
  }
  return {
    schema:'evercraft.fallen.geometry.v1',
    id:'kss.' + projectId + '.' + id,
    primitive:'triangles',
    coordinateSystem:'right_handed_y_up',
    units:'meters',
    positions, normals, uvs, indices,
    provenance:{
      sourceRef:provenance.sourceRef,
      rightsState:provenance.rightsState,
      license:provenance.license
    }
  };
}

export function compileKssWorldHandoff(input) {
  if (input?.schema !== KSS_SPATIAL_INGRESS_SCHEMA) fail('schema_invalid');
  const projectId = validateId(input.projectId,'project_id');
  if (input.units !== 'meters' || input.coordinateSystem !== 'local_x_east_z_north_y_up') {
    fail('coordinate_contract_invalid');
  }
  const provenance = rightsPacket(input.provenance);
  if (!input.parcel || !Array.isArray(input.objects) || input.objects.length < 1 || input.objects.length > 128) {
    fail('objects_or_parcel_missing');
  }
  const parcel = {
    x:finite(input.parcel.x,'parcel_x'), z:finite(input.parcel.z,'parcel_z'),
    width:positive(input.parcel.width,'parcel_width'),
    depth:positive(input.parcel.depth,'parcel_depth')
  };
  const names = new Set();
  const objects = input.objects.map((obj) => {
    const id = validateId(obj?.id,'object_id');
    if (names.has(id)) fail('duplicate_object_id');
    names.add(id);
    const kind = str(obj?.kind);
    if (!allowedKinds.has(kind)) fail('object_kind_unsupported');
    const shape = {
      id, kind, x:finite(obj.x,'object_x'), z:finite(obj.z,'object_z'),
      width:positive(obj.width,'object_width'),
      depth:positive(obj.depth,'object_depth'),
      height:positive(obj.height,'object_height')
    };
    if (shape.x < parcel.x || shape.z < parcel.z
      || shape.x+shape.width > parcel.x+parcel.width
      || shape.z+shape.depth > parcel.z+parcel.depth) fail('object_exits_parcel:' + id);
    return shape;
  });
  // Proposed equipment may occupy mapped pavement, but cannot intersect a
  // building footprint. Collision checking here is conservative, not ADA QA.
  for (const a of objects.filter(x => x.kind === 'equipment')) {
    for (const b of objects.filter(x => x.kind === 'building')) {
      if (intersects(a,b)) fail('equipment_building_collision:' + a.id);
    }
  }
  const assets = objects.map(o => boxAsset(o,provenance,projectId));
  const core = {
    schema:KSS_SPATIAL_HANDOFF_SCHEMA,
    projectId,
    sourceModelDigest:sha256({parcel,objects,provenance}),
    units:'meters',
    coordinateSystem:'right_handed_y_up',
    parcel,
    objects,
    evidenceState:provenance.evidenceState,
    geometryAssets:assets,
    geometryAssetDigests:assets.map(a => ({id:a.id,sha256:sha256(a)})),
    qa:{
      boundsChecked:true,
      equipmentBuildingCollisionChecked:true,
      codeComplianceVerified:false,
      surveyGrade:false,
      visualRenderVerified:false,
      note:'Preliminary spatial presentation only. No construction or permit authority.'
    },
    publicationAuthority:false,
    externalDeliveryAuthorized:false,
  };
  return {...core,digest:sha256(core)};
}
