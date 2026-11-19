#!/usr/bin/env python3
"""Read-only independent audit of a preserved GEMS candidate ZIP.

Local research command (rasterio + numpy required):
  python systemia/mission-bridge/gems/audit_preserved_candidate.py /private/gems_001_verified_submission.zip
No network, no official reference raster, no training or scored submission.
"""
import hashlib
import json
import math
import sys
import zipfile

import numpy as np
from rasterio.io import MemoryFile

def audit(archive_path):
    with zipfile.ZipFile(archive_path) as z:
        info=z.getinfo('gems_candidate.tif')
        if info.file_size>200_000_000:
            raise ValueError('candidate_zip_member_too_large')
        raw=z.read('gems_candidate.tif')
        receipt=json.loads(z.read('evidence/drivendata-receipt.json'))
        earlier=json.loads(z.read('evidence/geotiff-validation.json'))
    digest=hashlib.sha256(raw).hexdigest()
    with MemoryFile(raw) as m, m.open() as ds:
        array=ds.read(1)
        finite=np.isfinite(array)
        positive=finite & (array>0)
        bad=finite & ((array<0)|(array>1))
        chunks=[]
        row=0
        for piece in np.array_split(array,4,axis=0):
            valid=np.isfinite(piece)
            pos=valid & (piece>0)
            end=row+piece.shape[0]
            chunks.append({'row_start':row,'row_end_exclusive':end,
                'finite_pixels':int(valid.sum()),'positive_pixels':int(pos.sum()),
                'positive_fraction_of_finite':float(pos.sum()/valid.sum()) if valid.any() else None})
            row=end
        checks={
          'checksum_matches_archived_receipt':digest==receipt['staged_file_sha256'],
          'checksum_matches_prior_local_audit':digest==earlier['sha256'],
          'expected_size':(ds.width,ds.height)==(3292,3730),
          'one_band':ds.count==1,
          'float32':ds.dtypes==('float32',),
          'expected_crs':ds.crs is not None and ds.crs.to_epsg()==32611,
          'resolution_100m':ds.res==(100.,100.),
          'nan_nodata':ds.nodata is not None and math.isnan(ds.nodata),
          'no_infinity':not bool(np.isinf(array).any()),
          'range_0_1':not bool(bad.any()),
          'finite_count_matches':int(finite.sum())==earlier['valid'],
          'missing_count_matches':int(np.isnan(array).sum())==earlier['outside'],
          'positive_count_matches':int(positive.sum())==earlier['positive']
        }
        values=array[finite]
        return {
          'schema':'evercraft.gems.candidate-independent-local-audit.v1',
          'source':'preserved_user_supplied_gems_001_verified_submission.zip',
          'validation_method':'rasterio_read_actual_geotiff_bytes',
          'submission_id_in_archived_receipt':receipt['submission_id'],
          'official_public_dti_in_archived_receipt':receipt['official_public_dti'],
          'official_score_independently_fetched':False,
          'file_sha256':digest,'file_bytes':len(raw),
          'width':ds.width,'height':ds.height,'band_count':ds.count,
          'dtype':ds.dtypes[0],'crs':str(ds.crs),
          'transform_first_six':list(ds.transform[:6]),
          'resolution_meters':list(ds.res),'nodata_representation':'NaN',
          'finite_pixels':int(finite.sum()),'nan_pixels':int(np.isnan(array).sum()),
          'inf_pixels':int(np.isinf(array).sum()),'positive_pixels':int(positive.sum()),
          'out_of_range_pixels':int(bad.sum()),
          'finite_min':float(values.min()),'finite_max':float(values.max()),
          'row_quartile_coverage':chunks,'checks':checks,
          'all_structural_checks_passed':all(checks.values()),
          'reference_raster_loaded':False,
          'official_allowed_area_mask_verified':False,
          'geological_generalization_verified':False,
          'read_only':True,'submission_modified':False,'paid_compute_usd':0
        }

if __name__=='__main__':
    if len(sys.argv)!=2:
        raise SystemExit('usage: audit_preserved_candidate.py PRIVATE_ARCHIVE.zip')
    result=audit(sys.argv[1])
    print(json.dumps(result,indent=2,sort_keys=True))
    raise SystemExit(0 if result['all_structural_checks_passed'] else 2)
