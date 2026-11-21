"""Evercraft-owned aerial image provenance and local-coordinate registration gate.

No external imagery fetching, GIS claims, image publishing, surveys or property
boundary verification. For now this is a pure kernel, NOT connected to the
Kennedy studio, report service, or PDF output.
"""
import hashlib
import math
import re
import struct
import zlib

SCHEMA = "evercraft.kss.aerial-registration.v1"
STATES = {"owned", "licensed", "public_domain"}
EVIDENCE = {"synthetic", "observed", "source-derived", "inferred"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_BYTES = 15 * 1024 * 1024
MAX_DIM = 20000


class RegistrationError(ValueError):
    pass


def require_text(value, field, limit=300):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise RegistrationError(field + "_missing_or_invalid")
    if any(ord(c) < 32 or 0xd800 <= ord(c) <= 0xdfff for c in value):
        raise RegistrationError(field + "_unsafe_characters")
    return value.strip()


def number(value, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise RegistrationError(field + "_nonfinite")
    return float(value)


def png_dimensions(data):
    """Fail closed on unknown container, fake PNG, or unsupported image geometry.

    This only validates PNG signature, IHDR and CRC, not complete pixel decode.
    A trusted renderer must fully decode and limit decompression separately.
    """
    if not isinstance(data, bytes) or not 40 <= len(data) <= MAX_BYTES:
        raise RegistrationError("image_bytes_missing_or_oversized")
    if data[:8] != PNG_SIGNATURE:
        raise RegistrationError("image_format_unsupported_png_only")
    size = struct.unpack(">I", data[8:12])[0]
    if size != 13 or data[12:16] != b"IHDR":
        raise RegistrationError("png_ihdr_missing")
    chunk = data[12:29]
    expected_crc = struct.unpack(">I", data[29:33])[0]
    if (zlib.crc32(chunk) & 0xffffffff) != expected_crc:
        raise RegistrationError("png_ihdr_crc_mismatch")
    width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", data[16:29])
    if not (16 <= width <= MAX_DIM and 16 <= height <= MAX_DIM):
        raise RegistrationError("png_dimensions_unsupported")
    if (depth, color) not in {(8, 2), (8, 6)} or compression or filtering or interlace:
        raise RegistrationError("png_encoding_unsupported")
    return width, height


def _solve3(matrix, rhs):
    """Pivoted 3x3 elimination for a well-conditioned overdetermined fit."""
    a = [[float(matrix[i][j]) for j in range(3)] + [float(rhs[i])] for i in range(3)]
    for c in range(3):
        pivot = max(range(c, 3), key=lambda r: abs(a[r][c]))
        if abs(a[pivot][c]) < 1e-11:
            raise RegistrationError("control_points_degenerate")
        a[c], a[pivot] = a[pivot], a[c]
        factor = a[c][c]
        for j in range(c, 4):
            a[c][j] /= factor
        for r in range(3):
            if r == c:
                continue
            factor = a[r][c]
            for j in range(c, 4):
                a[r][j] -= factor * a[c][j]
    return [a[i][3] for i in range(3)]


def fit_affine(points, width, height, max_rmse):
    """Compute pixel x/y -> entered local x/z meters, with no CRS assumption."""
    if not isinstance(points, list) or not 4 <= len(points) <= 24:
        raise RegistrationError("four_to_twentyfour_control_points_required")
    seen = set()
    samples = []
    for item in points:
        if not isinstance(item, dict):
            raise RegistrationError("control_point_invalid")
        px = number(item.get("pixel_x"), "pixel_x")
        py = number(item.get("pixel_y"), "pixel_y")
        x = number(item.get("local_x_m"), "local_x_m")
        z = number(item.get("local_z_m"), "local_z_m")
        if not (0 <= px < width and 0 <= py < height):
            raise RegistrationError("control_point_outside_image")
        if max(abs(x), abs(z)) > 5000:
            raise RegistrationError("local_coordinates_outside_expected_bounds")
        if (px, py) in seen:
            raise RegistrationError("duplicate_control_point")
        seen.add((px, py))
        # Normalize pixel domain to [0..1] to improve the condition number.
        samples.append((px / width, py / height, x, z))
    normal = [[0.0] * 3 for _ in range(3)]
    bx, bz = [0.0] * 3, [0.0] * 3
    for u, v, x, z in samples:
        vec = (u, v, 1.0)
        for i in range(3):
            bx[i] += vec[i] * x
            bz[i] += vec[i] * z
            for j in range(3):
                normal[i][j] += vec[i] * vec[j]
    ax = _solve3(normal, bx)
    az = _solve3(normal, bz)
    # Convert normalized domain back to original image pixels.
    affine = (ax[0] / width, ax[1] / height, ax[2],
              az[0] / width, az[1] / height, az[2])
    a, b, c, d, e, f = affine
    determinant = a * e - b * d
    scale = math.sqrt(abs(determinant))
    if abs(determinant) < 1e-10 or not 0.001 <= scale <= 100.0:
        raise RegistrationError("implausible_or_degenerate_pixel_scale")
    total_error = 0.0
    for u, v, x, z in samples:
        px, py = u * width, v * height
        total_error += (a*px + b*py + c-x)**2 + (d*px + e*py + f-z)**2
    rmse = math.sqrt(total_error / len(samples))
    if rmse > max_rmse + 1e-9:
        raise RegistrationError("control_point_residual_exceeds_limit")
    return [round(x, 9) for x in affine], round(rmse, 6)


def register_image(raw, image_data):
    """Return an explicit *operator-calibrated* receipt, never a verification claim.

    Caller owns storage and must later attach exactly these bytes by SHA-256.
    This does not persist, host, decode or render a source image.
    """
    if not isinstance(raw, dict) or raw.get("schema") != SCHEMA:
        raise RegistrationError("registration_schema_invalid")
    width, height = png_dimensions(image_data)
    digest = hashlib.sha256(image_data).hexdigest()
    if raw.get("expected_sha256") != digest:
        raise RegistrationError("image_sha256_mismatch")
    if raw.get("pixel_width") != width or raw.get("pixel_height") != height:
        raise RegistrationError("image_dimension_mismatch")
    rights = raw.get("rights_state")
    if rights not in STATES:
        raise RegistrationError("rights_unresolved")
    if rights == "licensed" and raw.get("derivative_use_approved") is not True:
        raise RegistrationError("licensed_derivative_use_not_approved")
    license_ref = require_text(raw.get("license_ref"), "license_ref")
    source_ref = require_text(raw.get("source_ref"), "source_ref")
    if raw.get("evidence_state") not in EVIDENCE:
        raise RegistrationError("evidence_classification_missing")
    site_id = require_text(raw.get("site_id"), "site_id", 64)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", site_id):
        raise RegistrationError("site_id_invalid")
    limit = number(raw.get("max_rmse_m"), "max_rmse_m")
    if not 0 <= limit <= 2:
        raise RegistrationError("residual_limit_invalid")
    affine, error = fit_affine(raw.get("control_points"), width, height, limit)
    return {
        "schema": SCHEMA,
        "site_id": site_id,
        "image_sha256": digest,
        "mime_type": "image/png",
        "pixel_width": width,
        "pixel_height": height,
        "rights_state": rights,
        "license_ref": license_ref,
        "source_ref": source_ref,
        "evidence_state": raw["evidence_state"],
        "pixel_to_local_m": affine,
        "registration_rmse_m": error,
        "max_rmse_m": limit,
        "registration_authority": "operator_control_points_only",
        "source_rights_authority": "operator_attested_not_independently_verified",
        "north_verified": False,
        "crs_verified": False,
        "survey_grade": False,
        "aerial_sheet_export_ready": False,
        "publication_authorized": False
    }
