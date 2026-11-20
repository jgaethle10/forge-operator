#!/usr/bin/env python3
"""Read-only DEM metadata reconnaissance for GEMS disagreement review tiles.

Uses the owner's existing WGS84 diagnostic GeoJSON and optional externally
reviewed DEM footprint metadata. A bbox hit is NEVER pixel/DEM coverage proof.
No network access, model training, filesystem raster reads, or submissions.
"""
import argparse
import json
import math
from pathlib import Path

ATLAS_SCHEMA = 'evercraft.gems.prediction-disagreement-atlas.v1'
INDEX_SCHEMA = 'evercraft.gems.dem-metadata-index.v1'
GROUPS = ('high_disagreement_review', 'median_disagreement_control',
          'low_disagreement_control')


def bounds(values):
    if (not isinstance(values, (list, tuple)) or len(values) != 4 or
        any(isinstance(v, bool) or not isinstance(v, (int, float)) or
            not math.isfinite(v) for v in values)):
        raise ValueError('invalid_wgs84_bounds')
    west, south, east, north = values
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError('invalid_wgs84_bounds')
    return [float(x) for x in values]


def overlaps(a, b):
    # Coarse bbox overlap, not polygon intersection or verified raster coverage.
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def selected_tiles(atlas):
    if (atlas.get('type') != 'FeatureCollection' or
        atlas.get('metadata', {}).get('schema') != ATLAS_SCHEMA or
        atlas.get('metadata', {}).get('crs') != 'OGC:CRS84 (WGS84 longitude latitude)'):
        raise ValueError('atlas_crs_or_schema_invalid')
    features = atlas.get('features')
    if not isinstance(features, list) or not features:
        raise ValueError('atlas_features_invalid')
    result = []
    used = set()
    for feat in features:
        properties = feat.get('properties', {})
        group = properties.get('diagnostic_group')
        if group not in GROUPS:
            continue
        tile_id = properties.get('tile_id')
        if not isinstance(tile_id, str) or not tile_id or tile_id in used:
            raise ValueError('duplicate_or_invalid_diagnostic_tile')
        used.add(tile_id)
        if (properties.get('no_fault_truth_or_geology_observed') is not True or
            properties.get('eligible_for_diagnostic_sample') is not True):
            raise ValueError('diagnostic_tile_evidence_contract_invalid')
        geom = feat.get('geometry', {})
        if geom.get('type') != 'Polygon' or len(geom.get('coordinates', [])) != 1:
            raise ValueError('diagnostic_polygon_invalid')
        ring = geom['coordinates'][0]
        if (not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1] or
            any(not isinstance(point, list) or len(point) != 2 for point in ring)):
            raise ValueError('diagnostic_polygon_invalid')
        for point in ring:
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) or
                   not math.isfinite(v) for v in point):
                raise ValueError('invalid_wgs84_bounds')
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        tile_bounds = bounds([min(xs), min(ys), max(xs), max(ys)])
        result.append({'tile_id': tile_id, 'diagnostic_group': group,
                       'bbox_wgs84': tile_bounds, 'bbox_is_polygon_envelope': True})
    counts = [sum(t['diagnostic_group'] == group for t in result) for group in GROUPS]
    if not result or min(counts) < 1 or len(set(counts)) != 1:
        raise ValueError('unbalanced_diagnostic_groups')
    return sorted(result, key=lambda t: (GROUPS.index(t['diagnostic_group']), t['tile_id']))


def source_index(index):
    if index is None:
        return []
    if index.get('schema') != INDEX_SCHEMA or not isinstance(index.get('sources'), list):
        raise ValueError('dem_index_schema_invalid')
    if len(index['sources']) > 10000:
        raise ValueError('dem_index_too_large')
    result = []
    seen = set()
    for source in index['sources']:
        sid = source.get('id')
        reference = source.get('metadata_reference')
        if (not isinstance(sid, str) or not sid.strip() or sid in seen or
            not isinstance(reference, str) or not reference.strip()):
            raise ValueError('dem_index_provenance_invalid')
        seen.add(sid)
        result.append({'id': sid, 'metadata_reference': reference,
                       'bbox_wgs84': bounds(source.get('bbox_wgs84')),
                       'acquisition_date': source.get('acquisition_date'),
                       'vertical_datum': source.get('vertical_datum'),
                       'rights_reference': source.get('rights_reference')})
    return result


def build(atlas, index=None):
    tiles = selected_tiles(atlas)
    sources = source_index(index)
    matched = []
    for tile in tiles:
        potential = [s['id'] for s in sources if overlaps(tile['bbox_wgs84'], s['bbox_wgs84'])]
        matched.append({**tile, 'metadata_bbox_candidate_source_ids': potential,
                        'verified_1m_dem_coverage': False,
                        'verified_training_rights': False,
                        'metadata_review_pending': True})
    summary = {group: {'sample_tiles': sum(t['diagnostic_group'] == group for t in matched),
                       'tiles_with_bbox_candidates': sum(t['diagnostic_group'] == group and
                                                    bool(t['metadata_bbox_candidate_source_ids'])
                                                    for t in matched)} for group in GROUPS}
    return {'schema': 'evercraft.gems.dem-metadata-recon.v1',
            'research_only': True, 'network_requests': 0, 'raster_bytes_downloaded': 0,
            'official_score_or_ground_truth_available': False,
            'source_metadata_claims_independently_verified': False,
            'data_rights_verified': False, 'model_trained': False,
            'candidate_promoted': False, 'submission_made': False,
            'atlas_groups': summary, 'indexed_source_count': len(sources),
            'sources': sources, 'tiles': matched,
            'interpretation': ('Potential bbox intersection is only a screening hint. '
                 'No DEM coverage, valid pixels, vertical datum, acquisition vintage, '
                 'rights, or additional geological truth is verified. No index means UNKNOWN, not absent. '
                 'Review source metadata and compare equal-coverage controls before raster access.')}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--atlas', required=True, type=Path)
    cli.add_argument('--index', type=Path, help='Optional manually vetted metadata footprints JSON; no URLs fetched')
    cli.add_argument('--receipt', required=True, type=Path)
    args = cli.parse_args()
    if args.receipt.exists():
        raise FileExistsError('dem_metadata_receipt_exists')
    atlas = json.loads(args.atlas.read_text())
    index = json.loads(args.index.read_text()) if args.index else None
    report = build(atlas, index)
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    with args.receipt.open('x') as out:
        json.dump(report, out, indent=2)
        out.write('\n')
    print(json.dumps({'receipt': str(args.receipt), 'review_tiles': len(report['tiles']),
                      'sources_indexed': len(report['sources']), 'downloaded': False,
                      'dem_coverage_verified': False, 'submission_made': False}))


if __name__ == '__main__':
    main()
