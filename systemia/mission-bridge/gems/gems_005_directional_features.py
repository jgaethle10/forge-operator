#!/usr/bin/env python3
"""GEMS-005 fixed, label-free, source-masked geophysical coherence features.
Uses ONLY existing official magnetic RTP and isostatic gravity bands; no labels,
external downloads, scored outputs or submit actions.
"""
from pathlib import Path
import numpy as np
import rasterio
from scipy.ndimage import gaussian_filter
BANDS=("rtp","iso_grav_anom")
SCALES=(2.0,8.0)
MIN_SUPPORT=.90

def directional_coherence_response(values,source_valid,scale):
    a=np.asarray(values,dtype=np.float32)
    m=np.asarray(source_valid,bool)
    if a.ndim!=2 or m.shape!=a.shape or not np.isfinite(scale) or scale<=0:
        raise ValueError("directional_input_invalid")
    if not np.any(m):raise ValueError("directional_no_source_coverage")
    if np.any(~np.isfinite(a[m])):raise ValueError("directional_finite_values_required")
    weight=gaussian_filter(m.astype("float32"),scale,mode="reflect")
    numerator=gaussian_filter(np.where(m,a,0.).astype("float32"),scale,mode="reflect")
    smooth=np.divide(numerator,weight,out=np.zeros_like(numerator),where=weight>1e-5)
    dy,dx=np.gradient(smooth)
    support=m&(weight>=MIN_SUPPORT)
    tensor_weight=gaussian_filter(support.astype("float32"),scale,mode="reflect")
    def moment(z):
        filtered=gaussian_filter(np.where(support,z,0.).astype("float32"),scale,mode="reflect")
        return np.divide(filtered,tensor_weight,out=np.zeros_like(filtered),where=tensor_weight>1e-5)
    jxx=moment(dx*dx);jyy=moment(dy*dy);jxy=moment(dx*dy)
    energy=np.maximum(jxx+jyy,0.)
    anisotropy=np.sqrt(np.maximum((jxx-jyy)**2+4*jxy*jxy,0.))
    coherence=np.clip(np.divide(anisotropy,energy+1e-12),0,1)
    out=np.sqrt(energy)*coherence
    out[~(support&(tensor_weight>=MIN_SUPPORT))]=np.nan
    out[~np.isfinite(out)]=np.nan
    return out.astype("float32")

def make_directional_matrix(valid,official_feature_tif):
    valid=np.asarray(valid,bool)
    if valid.ndim!=2 or not valid.any():raise ValueError("invalid_mask")
    out=np.empty((int(valid.sum()),4),dtype="float32")
    audit=[]
    with rasterio.open(Path(official_feature_tif)) as src:
        if src.count!=19 or (src.height,src.width)!=valid.shape:
            raise ValueError("geodawn_feature_grid_invalid")
        names=[(d or "").split(" - ",1)[0] for d in src.descriptions]
        if any(names.count(name)!=1 for name in BANDS):
            raise ValueError("source_band_semantics_invalid")
        for i,name in enumerate(BANDS):
            band=names.index(name)+1
            a=src.read(band).astype("float32",copy=False)
            good=valid&np.isfinite(a)
            if src.nodata is not None and np.isfinite(src.nodata):good &= a!=src.nodata
            for j,scale in enumerate(SCALES):
                response=directional_coherence_response(a,good,scale)
                response[~valid]=np.nan
                col=i*len(SCALES)+j
                out[:,col]=response[valid]
                audit.append({"column_offset":col,"source_band":name,
                    "source_band_index":band,"scale_pixels":scale,
                    "valid_feature_cells":int(np.isfinite(response[valid]).sum()),
                    "missing_feature_cells":int(np.isnan(response[valid]).sum()),
                    "feature_definition":"structure_tensor_sqrt_energy_times_coherence",
                    "no_fault_labels_used":True})
    return out,audit
