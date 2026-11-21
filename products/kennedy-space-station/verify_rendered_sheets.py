#!/usr/bin/env python3
"""Offline pixel-level QA for already-rasterized, synthetic Kennedy PDF pages.

This checks color, layout and nonblank regions without OCR or an external
image-processing Python package. It does not establish readable text,
geographic truth, legal source rights, code compliance or human visual QA.
"""
import hashlib
import json
from pathlib import Path
import sys

EXPECTED = (2592, 1728)
MAX_PPM = 18 * 1024 * 1024


class RenderQAError(ValueError):
    pass


def ppm_pixels(path):
    data = Path(path).read_bytes()
    if len(data) > MAX_PPM or not data.startswith(b"P6"):
        raise RenderQAError("ppm_not_binary_rgb_or_oversized")
    i = 0
    tokens = []
    while len(tokens) < 4:
        while i < len(data) and data[i] in b" \n\r\t":
            i += 1
        if i < len(data) and data[i] == 35:
            while i < len(data) and data[i] not in b"\r\n":
                i += 1
            continue
        start = i
        while i < len(data) and data[i] not in b" \n\r\t":
            i += 1
        if i == start:
            raise RenderQAError("ppm_header_missing")
        try:
            tokens.append(data[start:i].decode("ascii"))
        except UnicodeDecodeError as exc:
            raise RenderQAError("ppm_header_invalid") from exc
    if tokens[0] != "P6" or tokens[3] != "255":
        raise RenderQAError("ppm_encoding_invalid")
    try:
        w,h = int(tokens[1]), int(tokens[2])
    except ValueError as exc:
        raise RenderQAError("ppm_dimensions_invalid") from exc
    if (w,h) != EXPECTED:
        raise RenderQAError("ppm_page_size_mismatch")
    if i >= len(data) or data[i] not in b" \n\r\t":
        raise RenderQAError("ppm_pixel_delimiter_missing")
    # PPM permits one whitespace delimiter after maxval. Renderer writes LF.
    if data[i] == 13 and i+1 < len(data) and data[i+1] == 10:
        i += 2
    else:
        i += 1
    pixels = data[i:]
    if len(pixels) != w*h*3:
        raise RenderQAError("ppm_pixel_length_mismatch")
    return w,h,pixels


def pixel(pixels, w, x, y):
    pos = (y*w+x)*3
    return tuple(pixels[pos:pos+3])


def grid_region(pixels, w, x0, y0, x1, y1, step=17):
    return [pixel(pixels,w,x,y) for y in range(y0,y1,step)
            for x in range(x0,x1,step)]


def inspect_page(path, sheet):
    w,h,pix = ppm_pixels(path)
    # Fixed semantic regions derived from sheet_compiler.PAGE_W/PAGE_H
    header = pixel(pix,w,25,95)
    title_band = pixel(pix,w,1990,285)
    banner = pixel(pix,w,70,1602)
    if max(abs(a-b) for a,b in zip(header,(18,33,59)))>12:
        raise RenderQAError(sheet+"_header_missing")
    if max(abs(a-b) for a,b in zip(title_band,(37,28,87)))>12:
        raise RenderQAError(sheet+"_title_band_missing")
    if max(abs(a-b) for a,b in zip(banner,(241,234,255)))>18:
        raise RenderQAError(sheet+"_warning_banner_missing")
    plan = grid_region(pix,w,100,410,1820,1360,step=23)
    colors = {tuple((v//24) for v in p) for p in plan}
    greenish = sum(1 for r,g,b in plan if g>r+10 and g>b-15)
    colorful = sum(1 for r,g,b in plan if max(r,g,b)-min(r,g,b)>18)
    if len(colors)<14 or colorful<len(plan)*0.10 or greenish<len(plan)*0.03:
        raise RenderQAError(sheet+"_underlay_not_visible")
    # Right block must contain actual dark text, not be a blank cream panel.
    panel = grid_region(pix,w,1990,470,2505,1290,step=5)
    ink = sum(1 for r,g,b in panel if max(r,g,b)<175)
    if ink<80:
        raise RenderQAError(sheet+"_right_title_block_blank")
    return {
        "sheet":sheet, "ppm_sha256":hashlib.sha256(pix).hexdigest(),
        "image_width_px":w, "image_height_px":h,
        "plan_color_bins":len(colors),"plan_colorful_pixels_sampled":colorful,
        "right_panel_ink_samples":ink,
        "automated_pixel_qa":"passed",
        "human_visual_qa":"not_performed",
        "source_georeference_verified":False,
        "customer_release_authorized":False,
    },pix


def verify(directory):
    directory=Path(directory)
    a,pa=inspect_page(directory/"qa-1.ppm","S-0")
    b,pb=inspect_page(directory/"qa-2.ppm","A-0")
    w,h=EXPECTED
    changed=0
    measured=0
    for y in range(420,1350,29):
        for x in range(110,1810,29):
            p1=pixel(pa,w,x,y);p2=pixel(pb,w,x,y)
            measured+=1
            if max(abs(p1[k]-p2[k]) for k in range(3))>14:
                changed+=1
    if changed < measured*0.10:
        raise RenderQAError("site_and_context_pages_not_visually_distinct")
    proof={"schema":"evercraft.kss.two-sheet-render-qa.v1",
           "status":"automated_pixel_qa_passed",
           "pages":[a,b],"different_plan_pixel_fraction":round(changed/measured,4),
           "human_visual_qa":"not_performed",
           "real_licensed_source_qa":"not_performed",
           "release_authorized":False}
    (directory/"render-qa-receipt.json").write_text(json.dumps(proof,indent=2,sort_keys=True)+"\n")
    return proof


def main():
    if len(sys.argv)!=2:
        raise SystemExit("usage: verify_rendered_sheets.py /path/to/rendered-fixture-directory")
    try:
        proof=verify(sys.argv[1])
    except (OSError,RenderQAError) as exc:
        print("HOLD: synthetic rendered-sheet QA failed: "+str(exc),file=sys.stderr)
        raise SystemExit(1)
    print("PASS: distinct synthetic S-0/A-0 underlays, title blocks, warnings, and sampled raster detail")
    print("HOLD: visual human review, source rights and geographic truth")
    print("color-bin counts:",[p["plan_color_bins"] for p in proof["pages"]])


if __name__=="__main__":
    main()
