import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RECORDS=Object.freeze({
  'usgs-wa-shaded-relief-3dep-v1':Object.freeze({
    id:'usgs-wa-shaded-relief-3dep-v1',
    name:'Washington shaded relief',
    assetFile:'./assets/washington-usgs-shaded-relief.png',
    receiptFile:'./assets/washington-usgs-shaded-relief.receipt.json',
    outputAssetName:'terrain-relief.png',
    license:'US-PD',
  }),
});

function sha256(body){
  return crypto.createHash('sha256').update(body).digest('hex');
}

function recordFor(id){
  const key=String(id||'').trim();
  if(!key) return null;
  const record=RECORDS[key];
  if(!record) throw new Error('graphics_terrain_unknown:'+key);
  return record;
}

export function getTerrainRelief(id){
  const record=recordFor(id);
  if(!record) return null;

  const assetPath=fileURLToPath(new URL(record.assetFile,import.meta.url));
  const receiptPath=fileURLToPath(new URL(record.receiptFile,import.meta.url));
  if(!fs.existsSync(assetPath)) throw new Error('graphics_terrain_asset_missing:'+record.id);
  if(!fs.existsSync(receiptPath)) throw new Error('graphics_terrain_receipt_missing:'+record.id);

  const body=fs.readFileSync(assetPath);
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  if(receipt?.schema!=='evercraft.graphics-command.terrain-acquisition-receipt.v1'){
    throw new Error('graphics_terrain_receipt_schema_invalid:'+record.id);
  }
  if(receipt.terrainId!==record.id) throw new Error('graphics_terrain_receipt_id_mismatch:'+record.id);
  if(!/^public_domain$/i.test(String(receipt.rightsState||''))){
    throw new Error('graphics_terrain_rights_not_public_domain:'+record.id);
  }
  const digest=sha256(body);
  if(digest!==receipt.sha256) throw new Error('graphics_terrain_digest_mismatch:'+record.id);
  if(Number(receipt.image?.bytes)!==body.length) throw new Error('graphics_terrain_size_mismatch:'+record.id);
  if(!body.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))){
    throw new Error('graphics_terrain_not_png:'+record.id);
  }

  const bbox=receipt.bbox||{};
  for(const key of ['west','south','east','north']){
    if(!Number.isFinite(Number(bbox[key]))) throw new Error('graphics_terrain_bbox_invalid:'+record.id+':'+key);
  }

  return {
    id:record.id,
    name:record.name,
    provider:String(receipt.provider||''),
    service:String(receipt.service||''),
    sourceRef:String(receipt.serviceRef||''),
    exportEndpoint:String(receipt.exportEndpoint||''),
    sourceFamily:String(receipt.sourceFamily||''),
    rightsState:String(receipt.rightsState||''),
    license:record.license,
    sourceSha256:digest,
    assetPath,
    assetName:record.outputAssetName,
    sourceAssetName:path.basename(assetPath),
    width:Number(receipt.image?.width),
    height:Number(receipt.image?.height),
    bbox:{
      minLon:Number(bbox.west),
      minLat:Number(bbox.south),
      maxLon:Number(bbox.east),
      maxLat:Number(bbox.north),
      spatialReference:Number(bbox.spatialReference||4326),
    },
  };
}

export function terrainReliefProvenance(id){
  const terrain=getTerrainRelief(id);
  if(!terrain) return null;
  const {assetPath,...publicRecord}=terrain;
  return publicRecord;
}

export function terrainReliefDataUri(id){
  const terrain=getTerrainRelief(id);
  if(!terrain) return null;
  const body=fs.readFileSync(terrain.assetPath);
  return 'data:image/png;base64,'+body.toString('base64');
}
