#!/usr/bin/env python3
"""GEMS-001/002 prediction disagreement tiles. NOT geological fault ground truth.

Pinned user-owned GeoTIFFs only; no network, training labels, raster downloads
or DrivenData submission. Outputs GeoJSON in WGS84 (not UTM coordinates).
"""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import transform

GEMS001_SHA='3b2360bed8966b4bfdae76bfeb5436bf6dccd16ac9dc5ff402434736bdee57a4'
GEMS002_SHA='7d2b4cf8bc16421e36b196b2b6b349b65e0b6732560a392b98ac699ff3c6be80'
TILE_PIXELS=100
THRESHOLD=.2
MIN_VALID=3000
KNOWN_COUNTS={'valid':5167373,'old':384797,'new':444269,'overlap':185133}

def sha(payload):
    return hashlib.sha256(payload).hexdigest()

def polygon_4326(affine,row0,row1,col0,col1):
    pts=[(col0,row0),(col1,row0),(col1,row1),(col0,row1),(col0,row0)]
    xy=[affine*(col,row) for col,row in pts]
    lon,lat=transform('EPSG:32611','EPSG:4326',
                      [v[0] for v in xy],[v[1] for v in xy])
    return [[float(x),float(y)] for x,y in zip(lon,lat)]

def analyze(original_archive,challenger_tif,destination):
    dest=Path(destination)
    if dest.exists():raise FileExistsError('atlas_output_exists')
    with zipfile.ZipFile(original_archive) as archive:
        incumbent_bytes=archive.read('gems_candidate.tif')
    if sha(incumbent_bytes)!=GEMS001_SHA:raise ValueError('GEMS001_INCUMBENT_HASH_MISMATCH')
    challenger_bytes=Path(challenger_tif).read_bytes()
    if sha(challenger_bytes)!=GEMS002_SHA:raise ValueError('GEMS002_CHALLENGER_HASH_MISMATCH')
    with MemoryFile(incumbent_bytes) as omem,omem.open() as oldfile,\
         MemoryFile(challenger_bytes) as nmem,nmem.open() as newfile:
        old_meta=(oldfile.width,oldfile.height,oldfile.count,
                  oldfile.crs,oldfile.transform,oldfile.dtypes[0])
        new_meta=(newfile.width,newfile.height,newfile.count,
                  newfile.crs,newfile.transform,newfile.dtypes[0])
        if old_meta!=new_meta or oldfile.count!=1 or oldfile.dtypes[0]!='float32' or oldfile.crs.to_epsg()!=32611:
            raise ValueError('GRID_CONTRACT_MISMATCH')
        old=oldfile.read(1);new=newfile.read(1);affine=oldfile.transform
    valid=np.isfinite(old)
    if not np.array_equal(valid,np.isfinite(new)):
        raise ValueError('FINITE_MASK_MISMATCH')
    if not valid.any() or not np.all((old[valid]>=0)&(old[valid]<=1)) or not np.all((new[valid]>=0)&(new[valid]<=1)):
        raise ValueError('PROBABILITY_CONTRACT_MISMATCH')
    h,w=valid.shape
    fields=('valid','old','new','overlap','old_only','new_only','old_high','new_high')
    totals={x:0 for x in fields}
    features=[]
    for row0 in range(0,h,TILE_PIXELS):
        for col0 in range(0,w,TILE_PIXELS):
            row1=min(h,row0+TILE_PIXELS);col1=min(w,col0+TILE_PIXELS)
            mask=valid[row0:row1,col0:col1]
            if not np.any(mask):continue
            left=old[row0:row1,col0:col1]
            right=new[row0:row1,col0:col1]
            o=(left>=THRESHOLD)&mask;n=(right>=THRESHOLD)&mask
            shared=o&n
            local={'valid':int(mask.sum()),'old':int(o.sum()),'new':int(n.sum()),
                'overlap':int(shared.sum()),'old_only':int((o&~n).sum()),
                'new_only':int((n&~o).sum()),
                'old_high':int(((left>=.5)&mask).sum()),
                'new_high':int(((right>=.5)&mask).sum())}
            for key in fields:totals[key]+=local[key]
            xor=local['old_only']+local['new_only']
            tile=f'r{row0//TILE_PIXELS:02d}c{col0//TILE_PIXELS:02d}'
            iou_den=local['old']+local['new']-local['overlap']
            feat={'type':'Feature',
                'geometry':{'type':'Polygon','coordinates':[polygon_4326(affine,row0,row1,col0,col1)]},
                'properties':{'tile_id':tile,'row_start':row0,'row_end_exclusive':row1,
                    'col_start':col0,'col_end_exclusive':col1,
                    'eligible_for_diagnostic_sample':local['valid']>=MIN_VALID,
                    'threshold':THRESHOLD,'no_fault_truth_or_geology_observed':True,
                    **local,'xor_cells':xor,'xor_fraction_of_valid':float(xor/local['valid']),
                    'intersection_over_union':(float(local['overlap']/iou_den) if iou_den else None),
                    'diagnostic_group':'not_selected'}}
            features.append(feat)
    if totals['valid']!=int(valid.sum()) or any(totals[k]!=v for k,v in KNOWN_COUNTS.items()):
        raise ValueError('ORIGINAL_FULL_GRID_COUNTS_DISAGREE')
    eligible=[f for f in features if f['properties']['eligible_for_diagnostic_sample']]
    eligible.sort(key=lambda f:(f['properties']['xor_fraction_of_valid'],f['properties']['tile_id']))
    count=min(15,len(eligible)//3)
    chosen={}
    if count:
        low=eligible[:count]
        mid=len(eligible)//2-count//2
        middle=eligible[mid:mid+count]
        high=eligible[-count:]
        for group,arr in [('low_disagreement_control',low),
                          ('median_disagreement_control',middle),
                          ('high_disagreement_review',high)]:
            for feat in arr:chosen[feat['properties']['tile_id']]=group
    for feat in features:
        feat['properties']['diagnostic_group']=chosen.get(
            feat['properties']['tile_id'],'not_selected')
    ranked=sorted(eligible,key=lambda f:(-f['properties']['xor_fraction_of_valid'],f['properties']['tile_id']))
    groups={name:sorted([f['properties']['tile_id'] for f in features
        if f['properties']['diagnostic_group']==name])
        for name in ('low_disagreement_control','median_disagreement_control','high_disagreement_review')}
    report={'schema':'evercraft.gems.model-disagreement-study.v1',
            'gems001_sha256':GEMS001_SHA,'gems002_sha256':GEMS002_SHA,
            'grid':[w,h],'valid_grid_pixels':int(valid.sum()),
            'prediction_threshold':THRESHOLD,'full_map_counts':totals,
            'nonempty_10km_tiles':len(features),'diagnostic_eligible_tiles':len(eligible),
            'selected_control_and_review_tile_ids':groups,
            'top_10_disagreement_tiles':[{'tile_id':f['properties']['tile_id'],
                'xor_fraction':f['properties']['xor_fraction_of_valid'],
                'valid':f['properties']['valid'],
                'old_only':f['properties']['old_only'],
                'new_only':f['properties']['new_only']} for f in ranked[:10]],
            'limitation':'Model disagreement is NOT geologic evidence or error estimation; do not use tiles as fault labels, model-selection data, or lidar coverage proof.',
            'external_downloads':0,'new_scored_submission':False}
    geojson={'type':'FeatureCollection','name':'GEMS model disagreement, NOT ground-truth',
             'metadata':{'schema':'evercraft.gems.prediction-disagreement-atlas.v1',
                'crs':'OGC:CRS84 (WGS84 longitude latitude)',
                'source_crs':'EPSG:32611','tile_size_m':10000,
                'scientific_scope':'prediction disagreement only; no geological label, terrain input, or hidden score',
                'method':'every nonempty 100x100 tile, plus three groups of controls/review tiles'},
             'features':features}
    dest.mkdir(parents=True,exist_ok=False)
    (dest/'gems_model_disagreement_tiles.geojson').write_text(
        json.dumps(geojson,separators=(',',':'))+'\n')
    (dest/'disagreement_atlas_receipt.json').write_text(
        json.dumps(report,indent=2)+'\n')
    return dest,report

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--gems-001-archive',required=True)
    p.add_argument('--gems-002-tif',required=True)
    p.add_argument('--output-dir',required=True)
    args=p.parse_args()
    dest,report=analyze(args.gems_001_archive,args.gems_002_tif,args.output_dir)
    print(json.dumps({'atlas_dir':str(dest),'nonempty_tiles':report['nonempty_10km_tiles'],
        'diagnostic_eligible_tiles':report['diagnostic_eligible_tiles'],
        'scored_submission':False},indent=2))

if __name__=='__main__':main()
