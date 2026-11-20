"""Evercraft-owned US screening aerial adapter.

Census address-range match + fixed USGS National Map imagery export.
No arbitrary URL or map tiles, no parcel ownership or site feasibility inference.
"""
import base64
import hashlib
import json
import math
import re
import urllib.parse
import urllib.request

CENSUS_ORIGIN = "https://geocoding.geo.census.gov"
USGS_ORIGIN = "https://basemap.nationalmap.gov"
CENSUS_PATH = "/geocoder/locations/onelineaddress"
USGS_PATH = "/arcgis/rest/services/USGSImageryOnly/MapServer/export"
RADIUS = 6378137.0
MAX_CENSUS = 256 * 1024
MAX_IMAGE = 4 * 1024 * 1024


def _fetch(url, max_bytes, opener):
    """Bounded read, no redirect to a different URL/host."""
    req = urllib.request.Request(url, headers={
        "Accept": "application/json,image/jpeg",
        "User-Agent": "EvercraftSitePlanner/1.0 (private operator screening)",
    })
    try:
        with opener(req, timeout=10) as response:
            if response.geturl() != url:
                raise ValueError("Upstream redirection is not permitted")
            if response.status != 200:
                raise ValueError("Upstream provider did not return HTTP 200")
            data = response.read(max_bytes + 1)
            ctype = str(response.headers.get("Content-Type", "")).split(";", 1)[0].lower()
    except (OSError, TimeoutError) as exc:
        raise ValueError("Government imagery provider is unavailable") from exc
    if not data or len(data) > max_bytes:
        raise ValueError("Upstream evidence was empty or exceeded size limit")
    return data, ctype


def _point(address, opener):
    if not isinstance(address, str) or not 10 <= len(address.strip()) <= 200:
        raise ValueError("Enter a complete U.S. street address (10–200 characters)")
    if any(ord(c) < 32 for c in address):
        raise ValueError("Control characters are not allowed in the address")
    url = CENSUS_ORIGIN + CENSUS_PATH + "?" + urllib.parse.urlencode({
        "address": address.strip(),
        "benchmark": "Public_AR_Current",
        "format": "json",
    })
    raw, ctype = _fetch(url, MAX_CENSUS, opener)
    if ctype not in ("application/json", "text/plain"):
        raise ValueError("Unexpected Census response type")
    try:
        matches = json.loads(raw)["result"]["addressMatches"]
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError("Invalid Census address-match response") from exc
    if not isinstance(matches, list) or len(matches) != 1:
        raise ValueError("Address was missing or ambiguous; supply an authorized aerial manually")
    match = matches[0]
    try:
        lon, lat = float(match["coordinates"]["x"]), float(match["coordinates"]["y"])
        matched = str(match["matchedAddress"]).strip()
    except (TypeError, KeyError, ValueError) as exc:
        raise ValueError("Census match is missing coordinates") from exc
    # Restrict MVP to mainland US, where federal aerial data is consistently supported.
    if (not math.isfinite(lon) or not math.isfinite(lat)
        or not (-125 <= lon <= -66 and 24 <= lat <= 50)
        or len(matched) > 200 or len(matched) < 10):
        raise ValueError("Matched location outside supported mainland U.S. coverage")
    return lon, lat, matched


def _mercator(lon, lat):
    x = RADIUS * math.radians(lon)
    y = RADIUS * math.log(math.tan(math.pi/4 + math.radians(lat)/2))
    return x, y


def _image(lon, lat, halfwidth, opener):
    x, y = _mercator(lon, lat)
    # ArcGIS export envelope in EPSG:3857; approximate centered imagery, NOT parcel geometry.
    aspect = 752/1024
    halfheight = halfwidth * aspect
    bbox = ",".join(f"{v:.3f}" for v in (x-halfwidth,y-halfheight,x+halfwidth,y+halfheight))
    query = urllib.parse.urlencode({
        "bbox": bbox, "bboxSR": "3857", "imageSR": "3857",
        "size": "1024,752", "format": "jpg", "f": "image", "dpi": "96",
    })
    url = USGS_ORIGIN + USGS_PATH + "?" + query
    raw, ctype = _fetch(url, MAX_IMAGE, opener)
    if ctype not in ("image/jpeg", "image/jpg", "application/octet-stream") or not raw.startswith(b"\xff\xd8\xff") or not raw.endswith(b"\xff\xd9"):
        raise ValueError("USGS did not return a valid JPEG aerial")
    return {
        "format": "jpeg", "image_base64": base64.b64encode(raw).decode("ascii"),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bbox_3857": [round(v, 3) for v in (x-halfwidth,y-halfheight,x+halfwidth,y+halfheight)],
        "width_pixels": 1024, "height_pixels": 752,
        "source": "USGS The National Map USGSImageryOnly",
        "source_page": USGS_ORIGIN + USGS_PATH.rsplit("/export",1)[0],
    }


def preview_from_address(address, opener=urllib.request.urlopen):
    lon, lat, matched = _point(address, opener)
    site = _image(lon, lat, 320, opener)
    vicinity = _image(lon, lat, 2400, opener)
    return {
        "schema": "evercraft.site-planner.usgs-address-aerial.v1",
        "requested_address": address.strip(),
        "census_matched_address": matched,
        "approximate_address_coordinate": {"lon": lon, "lat": lat},
        "match_class": "census_address_range_not_parcel",
        "site": site, "vicinity": vicinity,
        "imagery_date": None,
        "imagery_date_verified": False,
        "parcel_boundaries_verified": False,
        "site_layout_verified": False,
        "use_class": "preliminary_screening_only_not_for_engineering",
        "provenance": [
            CENSUS_ORIGIN + CENSUS_PATH,
            USGS_ORIGIN + USGS_PATH.rsplit("/export",1)[0],
        ],
        "limitations": "Census point is an address-range estimate, not a verified lot or entrance. Imagery may be older or too coarse for stalls, ADA or utilities. Confirm all source rights, actual address and geometry independently.",
    }
