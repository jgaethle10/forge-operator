"""Clean-room Kennedy two-sheet S-0/A-0 PDF compiler, synthetic-only gate.

Uses *two separately validated owned PNG sources* with operator-local affine
control points. Neither source nor geometry is surveyed, georeferenced in a
known CRS, a permitting deliverable, or independently rights-verified.

NO external network, proprietary images, third-party runtime, customer data,
or public deployment. This is a deterministic synthetic proof-of-path.
"""
import hashlib
import math
import struct
import zlib

import raster_registration as reg
import spatial

SCHEMA = "evercraft.kss.two-sheet-synthetic.v1"
PAGE_W, PAGE_H = 2592, 1728
MAX_UNCOMPRESSED = 48 * 1024 * 1024

class SheetError(ValueError):
    pass


def decode_rgb_png(data):
    """Strict and bounded RGB8 PNG decoder, checksum-verified for every chunk."""
    w, h = reg.png_dimensions(data)
    if w * h * 3 + h > MAX_UNCOMPRESSED:
        raise SheetError("decoded_image_too_large")
    offset, chunks, ended, idat_started = 8, [], False, False
    while offset < len(data):
        if offset + 12 > len(data):
            raise SheetError("png_chunk_truncated")
        n = struct.unpack(">I", data[offset:offset+4])[0]
        tag = data[offset+4:offset+8]
        end = offset + 12 + n
        if n > reg.MAX_BYTES or end > len(data):
            raise SheetError("png_chunk_oversized")
        payload = data[offset+8:offset+8+n]
        crc = struct.unpack(">I", data[offset+8+n:end])[0]
        if zlib.crc32(tag + payload) & 0xffffffff != crc:
            raise SheetError("png_chunk_crc_invalid")
        if tag == b"IHDR":
            if offset != 8 or n != 13 or payload[8:] != b"\x08\x02\x00\x00\x00":
                raise SheetError("png_rgb8_only")
        elif tag == b"IDAT":
            if not idat_started and offset == 8:
                raise SheetError("png_missing_header")
            chunks.append(payload)
            idat_started = True
        elif tag == b"IEND":
            if n or not idat_started or end != len(data):
                raise SheetError("png_bad_end")
            ended = True
        else:
            raise SheetError("png_unapproved_chunk")
        offset = end
        if ended:
            break
    if not ended or not chunks:
        raise SheetError("png_incomplete")
    expected = h * (1 + w * 3)
    obj = zlib.decompressobj()
    try:
        decompressed = obj.decompress(b"".join(chunks), expected + 1)
    except zlib.error as exc:
        raise SheetError("png_deflate_invalid") from exc
    if (not obj.eof or obj.unconsumed_tail or obj.unused_data or
        len(decompressed) != expected):
        raise SheetError("png_deflate_size_or_trailing_bytes")
    stride = w * 3
    previous = bytearray(stride)
    pixels = bytearray()
    position = 0
    for _ in range(h):
        filt = decompressed[position]
        if filt not in (0, 1, 2, 3, 4):
            raise SheetError("png_filter_unsupported")
        position += 1
        source = decompressed[position:position+stride]
        position += stride
        row = bytearray(stride)
        for j in range(stride):
            a = row[j-3] if j >= 3 else 0
            b = previous[j]
            c = previous[j-3] if j >= 3 else 0
            if filt == 0:
                predictor = 0
            elif filt == 1:
                predictor = a
            elif filt == 2:
                predictor = b
            elif filt == 3:
                predictor = (a + b) // 2
            else:
                p = a + b - c
                da, db, dc = abs(p-a), abs(p-b), abs(p-c)
                predictor = a if da <= db and da <= dc else b if db <= dc else c
            row[j] = (source[j] + predictor) & 255
        pixels.extend(row)
        previous = row
    return w, h, bytes(pixels)


def rgb(color):
    return " ".join(f"{int(color[i:i+2], 16) / 255:.4f}" for i in (1,3,5))


def clean_text(value, limit=115):
    import unicodedata
    raw = unicodedata.normalize("NFKD", str(value))
    raw = raw.encode("ascii", "replace").decode("ascii")
    raw = "".join(c if 32 <= ord(c) < 127 else " " for c in raw)
    return raw[:limit].replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def fit_image(width, height):
    """Consistent image placement within the left plan viewport."""
    available = (86.0, 225.0, 1835.0, 1215.0)
    fx, fy, fw, fh = available
    s = min(fw / width, fh / height)
    return (fx + (fw - width*s)/2, fy + (fh - height*s)/2, width*s, height*s, s)


def _project(world_x, world_z, affine, frame, dims):
    a,b,c,d,e,f = affine
    det = a*e-b*d
    px = (e*(world_x-c)-b*(world_z-f))/det
    py = (-d*(world_x-c)+a*(world_z-f))/det
    w,h = dims
    if not (-0.01 <= px <= w+0.01 and -0.01 <= py <= h+0.01):
        raise SheetError("site_geometry_outside_image")
    fx,fy,_,_,s = frame
    return fx + px*s, fy + (h-py)*s


def _shape_vertices(shape):
    x,z,w,h = shape["x"],shape["z"],shape["width"],shape["depth"]
    return [(x,z),(x+w,z),(x+w,z+h),(x,z+h)]


def _line(commands, x, y, value, size=18, color="#1d2942", bold=False):
    commands.extend([
        f"{rgb(color)} rg",
        f"BT /{'F2' if bold else 'F1'} {size} Tf {x:.3f} {y:.3f} Td ({clean_text(value)}) Tj ET"
    ])


def _rectangle(commands, x,y,w,h,fill="#ffffff",stroke=None):
    commands.append(f"{rgb(fill)} rg")
    if stroke:
        commands.extend([f"{rgb(stroke)} RG", f"{x:.3f} {y:.3f} {w:.3f} {h:.3f} re B"])
    else:
        commands.append(f"{x:.3f} {y:.3f} {w:.3f} {h:.3f} re f")


def _polygon(commands, vertices, fill, stroke, alpha=True):
    if alpha:
        commands.append("/GSO gs")
    commands.extend([f"{rgb(fill)} rg",f"{rgb(stroke)} RG","3.2 w"])
    commands.append(f"{vertices[0][0]:.3f} {vertices[0][1]:.3f} m")
    for x,y in vertices[1:]:
        commands.append(f"{x:.3f} {y:.3f} l")
    commands.append("h B")
    if alpha:
        commands.append("/GSN gs")


def _pdf_stream(data, prefix=b""):
    return (b"<< " + prefix + b" /Length " + str(len(data)).encode() +
            b" >>\nstream\n" + data + b"\nendstream")


def _pdf_file(objs):
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, obj in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    at = len(out)
    out += f"xref\n0 {len(objs)+1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\n"
            f"startxref\n{at}\n%%EOF\n").encode()
    return bytes(out)


def _prepare(study, role, image, manifest):
    model = study["model"]
    if not isinstance(manifest, dict):
        raise SheetError(role + "_manifest_missing")
    receipt = reg.register_image(manifest, image)
    if receipt["site_id"] != model["site_id"]:
        raise SheetError(role + "_site_mismatch")
    # The first proof is deliberately synthetic-only. Owned user images and
    # licensed real imagery remain on hold pending the secure upload workflow.
    if receipt["rights_state"] != "owned" or receipt["evidence_state"] != "synthetic":
        raise SheetError(role + "_synthetic_only_gate")
    affine = receipt["pixel_to_local_m"]
    a,b,_,d,e,_ = affine
    l1,l2 = math.hypot(a,d), math.hypot(b,e)
    if not l1 or not l2 or abs(l1-l2)/max(l1,l2) > 0.03 or abs(a*b+d*e)/(l1*l2) > 0.03:
        raise SheetError(role + "_unequal_pixel_scale_or_skew")
    w,h,pixels = decode_rgb_png(image)
    frame = fit_image(w,h)
    parcel = model["parcel"]
    bounds = {"x":0.0,"z":0.0,"width":parcel["width"],"depth":parcel["depth"]}
    vertices = [_project(x,z,affine,frame,(w,h)) for x,z in _shape_vertices(bounds)]
    if role == "site":
        for shape in model["objects"]:
            for x,z in _shape_vertices(shape):
                _project(x,z,affine,frame,(w,h))
    return {
        "role":role,"receipt":receipt,"pixels":pixels,"w":w,"h":h,
        "frame":frame,"parcel":vertices,"affine":affine,
    }


def _page_content(study, source, address):
    """Actual image bytes + project geometry on S-0; project locator on A-0."""
    model = study["model"]
    role=source["role"]
    sheet="S-0" if role=="site" else "A-0"
    heading="PRELIMINARY SITE / EQUIPMENT LAYOUT" if role=="site" else "LOCAL AREA CONTEXT / SITE LOCATOR"
    C=[]
    _rectangle(C,0,0,PAGE_W,PAGE_H,"#f8f9fd")
    _rectangle(C,0,1542,PAGE_W,186,"#12213b")
    _line(C,82,1655,"KENNEDY SPACE STATION",47,"#ffffff",True)
    _line(C,84,1595,heading,28,"#bdcff4",True)
    _line(C,1735,1659,"EVERCRAFT  /  SYNTHETIC VALIDATION",22,"#e2edff",True)
    _line(C,1760,1593,"NOT FOR EXTERNAL DELIVERY",20,"#ffcfb5",True)
    # The entire left plan frame is image-backed with independently decoded
    # PNG pixels. There are no fabricated aerial tiles here.
    _rectangle(C,66,190,1882,1300,"#e8eef3","#acb8c5")
    fx,fy,fw,fh,scale = source["frame"]
    C.extend(["q",f"{fw:.4f} 0 0 {fh:.4f} {fx:.4f} {fy:.4f} cm",
              "/ImSite Do Q" if role=="site" else "/ImContext Do Q"])
    _polygon(C,source["parcel"],"#e2c6ff","#4b22a1")
    if role=="site":
        for obj in model["objects"]:
            vertices=[_project(x,z,source["affine"],source["frame"],(source["w"],source["h"]))
                      for x,z in _shape_vertices(obj)]
            fill,stroke=spatial.COLORS[obj["kind"]]
            _polygon(C,vertices,fill,stroke)
            cx=sum(p[0] for p in vertices)/4
            cy=sum(p[1] for p in vertices)/4
            # Avoid fitting a full paragraph into a tiny footprint.
            bounds_w=max(p[0] for p in vertices)-min(p[0] for p in vertices)
            bounds_h=max(p[1] for p in vertices)-min(p[1] for p in vertices)
            if bounds_w > 92 and bounds_h > 26:
                label=(obj["label"] or obj["kind"].replace("_"," ").upper())[:min(22,int(bounds_w/10))]
                _line(C,cx-min(len(label)*4.3, bounds_w/2-2),cy,label,14,"#172140",True)
    else:
        cx=sum(p[0] for p in source["parcel"])/4
        cy=sum(p[1] for p in source["parcel"])/4
        C.extend([f"{rgb('#3b1a8a')} RG","4 w",
                  f"{cx-23:.2f} {cy:.2f} m {cx+23:.2f} {cy:.2f} l S",
                  f"{cx:.2f} {cy-23:.2f} m {cx:.2f} {cy+23:.2f} l S"])
    # Explicit local distance only: no north arrow or coordinate CRS is known.
    l1=math.hypot(source["affine"][0],source["affine"][3])
    length=10 / l1 * scale
    if length > 0.55*fw:
        raise SheetError("local_scale_bar_not_fittable")
    xx=fx+26
    yy=fy+28
    _rectangle(C,xx-13,yy-18,length+30,65,"#ffffff","#e7ecf4")
    C.extend([f"{rgb('#292344')} RG","5 w",
              f"{xx:.3f} {yy:.3f} m {xx+length:.3f} {yy:.3f} l S",
              f"{xx:.3f} {yy-7:.3f} m {xx:.3f} {yy+7:.3f} l S",
              f"{xx+length:.3f} {yy-7:.3f} m {xx+length:.3f} {yy+7:.3f} l S"])
    _line(C,xx,yy+20,"10 m - operator-local scale",13,"#292344",True)
    _rectangle(C,66,75,1882,82,"#f1eaff","#d4c8ec")
    _line(C,88,124,"ILLUSTRATIVE SYNTHETIC RASTER - DO NOT RELY ON LOCATION, NORTH OR PARCEL LINES",22,"#4a287c",True)
    _line(C,88,91,"Control-point registration is operator-calibrated; no known coordinate reference system or survey.",18,"#575777")
    # Right title block
    _rectangle(C,1971,190,559,1300,"#ffffff","#c9cbd9")
    _rectangle(C,1971,1385,559,105,"#251c57")
    _line(C,1995,1441,sheet + "  |  SYNTHETIC TEST ONLY",25,"#ffffff",True)
    _line(C,1995,1405,"NOT A PERMIT / CONSTRUCTION DOCUMENT",16,"#ebc7ff",True)
    sections=[
        ("PROJECT",model["title"][:54]),
        ("LOCATION (LABEL ONLY)",address[:63]),
        ("SITE ID",model["site_id"]),
        ("MODEL / REVISION",f"Rev {study['revision']}  |  SHA256"),
        ("MODEL DIGEST A",study["model_sha256"][:32]),
        ("MODEL DIGEST B",study["model_sha256"][32:]),
        ("RASTER SOURCE",source["receipt"]["source_ref"][:55]),
        ("RASTER RIGHTS",source["receipt"]["rights_state"]+" / "+source["receipt"]["evidence_state"]),
        ("RASTER SHA256 A",source["receipt"]["image_sha256"][:32]),
        ("RASTER SHA256 B",source["receipt"]["image_sha256"][32:]),
        ("LOCAL FIT ERROR",f"{source['receipt']['registration_rmse_m']:.6f} m RMSE (operator)"),
        ("IMAGE",f"{source['w']} x {source['h']} pixels, RGB8"),
    ]
    top=1363
    for label,value in sections:
        _line(C,1995,top,label,15,"#7365b2",True)
        _line(C,1995,top-34,value,17,"#202344",True)
        top-=76
    report=model.get("source_report_receipt")
    if report:
        _line(C,1995,top-5,"ORIGIN REPORT SHA256",14,"#7365b2",True)
        _line(C,1995,top-29,report["snapshot_sha256"][:32],15,"#33365a")
        _line(C,1995,top-51,report["snapshot_sha256"][32:],15,"#33365a")
    _rectangle(C,1985,205,531,103,"#ffeacc","#d6a669")
    _line(C,1995,263,"PRELIMINARY CONCEPT ONLY",20,"#86531e",True)
    _line(C,1995,236,"NO SURVEY, ADA, ZONING OR CODE QA",14,"#86531e",True)
    _line(C,1995,211,"NO ENGINEERING OR APPROVAL",14,"#86531e",True)
    return ("\n".join(C)+"\n").encode("ascii")


def _image_object(source):
    pixels=source["pixels"]
    compressed=zlib.compress(pixels,6)
    prefix=(b"/Type /XObject /Subtype /Image /Width "+str(source["w"]).encode()
        + b" /Height "+str(source["h"]).encode()
        + b" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode")
    return _pdf_stream(compressed,prefix)


def compile_two_sheet_synthetic(study, site_png, site_manifest, context_png, context_manifest, address):
    """Build a deterministic two-page 36x24-inch PDF with genuine raster layers.

    Both sources MUST be distinct, owned and synthetic, registered to the same
    validated *local* model. This cannot export real client imagery yet.
    """
    if not isinstance(study, dict) or not isinstance(study.get("model"),dict):
        raise SheetError("saved_study_required")
    model=study["model"]
    sid=model.get("site_id")
    try:
        normalized=spatial.validate(model,sid)
        if any(model.get(key)!=value for key,value in normalized.items()):
            raise SheetError("model_unvalidated_or_modified")
        if spatial.digest(model)!=study.get("model_sha256"):
            raise SheetError("saved_model_digest_mismatch")
    except (spatial.StudyError, TypeError) as exc:
        raise SheetError("model_invalid") from exc
    if not isinstance(study.get("revision"),int) or study["revision"] < 1:
        raise SheetError("revision_invalid")
    address=reg.require_text(address,"display_address",120)
    if not isinstance(site_png,bytes) or not isinstance(context_png,bytes) or site_png==context_png:
        raise SheetError("distinct_image_bytes_required")
    site=_prepare(study,"site",site_png,site_manifest)
    context=_prepare(study,"context",context_png,context_manifest)
    if site["receipt"]["image_sha256"]==context["receipt"]["image_sha256"]:
        raise SheetError("identical_rasters_not_allowed")
    resources=(b"/Resources << /Font << /F1 5 0 R /F2 6 0 R >> "
               b"/XObject << /ImSite 7 0 R /ImContext 8 0 R >> "
               b"/ExtGState << /GSO 9 0 R /GSN 10 0 R >> >>")
    page_base=b"/Type /Page /Parent 2 0 R /MediaBox [0 0 2592 1728] "
    objs=[
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        b"<< "+page_base+resources+b" /Contents 11 0 R >>",
        b"<< "+page_base+resources+b" /Contents 12 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        _image_object(site),
        _image_object(context),
        b"<< /Type /ExtGState /ca 0.27 /CA 0.90 >>",
        b"<< /Type /ExtGState /ca 1 /CA 1 >>",
        _pdf_stream(_page_content(study,site,address)),
        _pdf_stream(_page_content(study,context,address)),
    ]
    return _pdf_file(objs)
