"""Deterministic inspection, preparation and approved composite cropping."""
import hashlib
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps


def inspect(file):
    raw = Path(file).read_bytes()
    with Image.open(io.BytesIO(raw)) as image:
        image.load()  # Reject truncated/corrupt images, not just bad headers.
        fmt = image.format
        oriented = ImageOps.exif_transpose(image).convert("RGBA")
        pixel_hash = hashlib.sha256(str(oriented.size).encode() + oriented.tobytes()).hexdigest()
        return dict(width=oriented.width, height=oriented.height, format=fmt,
                    bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), pixel_sha256=pixel_hash)


def main(request):
    if request["action"] == "read_docx":
        with zipfile.ZipFile(request["source"]) as archive:
            doc = ET.fromstring(archive.read("word/document.xml"))
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        return {"text": "\n".join("".join(p.itertext()) for p in doc.findall(".//w:p", ns))}
    if request["action"] == "inspect":
        return [inspect(file) for file in request["files"]]
    if request["action"] == "hd_render":
        mode = request["mode"]
        with Image.open(request["basis"]) as original:
            base = ImageOps.exif_transpose(original).convert("RGBA")
        if base.width != base.height:
            raise ValueError("HD composition requires a square design basis")
        side = max(base.width, 2048)
        if mode == "region":
            with Image.open(request["candidate"]) as image:
                candidate = ImageOps.exif_transpose(image).convert("RGBA")
            if candidate.width != candidate.height:
                raise ValueError("Cannot register a non-square edit to a square crop")
            side = max(side, candidate.width)
            if candidate.width != side:
                candidate = candidate.resize((side, side), Image.Resampling.LANCZOS)
            mask = Image.new("L", (side, side), 0)
            draw = ImageDraw.Draw(mask)
            for vertices in request["polygons"]:
                draw.polygon([(round(x*(side-1)), round(y*(side-1))) for x,y in vertices], fill=255)
            result = Image.composite(candidate, base.resize((side,side), Image.Resampling.LANCZOS), mask)
        elif mode == "white_source":
            with Image.open(request["original"]) as image:
                product = ImageOps.exif_transpose(image).convert("RGBA")
            left,top,right,bottom = [round(v*side) for v in request["box"]]
            ratio = min((right-left)/product.width, (bottom-top)/product.height)
            product = product.resize((max(1,round(product.width*ratio)), max(1,round(product.height*ratio))), Image.Resampling.LANCZOS)
            result = Image.new("RGBA", (side,side), "white")
            result.alpha_composite(product, ((left+right-product.width)//2, (top+bottom-product.height)//2))
        elif mode == "scale":
            result = base.resize((side,side), Image.Resampling.LANCZOS)
        else:
            raise ValueError("Unknown HD render mode")
        with Path(request["destination"]).open("xb") as output:
            result.save(output, format="PNG")
        return inspect(request["destination"])
    if request["action"] == "split":
        with Image.open(request["source"]) as image:
            image.load()
            image = ImageOps.exif_transpose(image)
            width, height = image.size
            if width * 3 != height * 2 or width % 2 or height % 3:
                raise ValueError("Composite must contain an exact 2x3 square grid; never stretch")
            destinations = [Path(p) for p in request["destinations"]]
            if len(destinations) != 6 or len(set(destinations)) != 6 or any(p.exists() for p in destinations):
                raise ValueError("Need six unique, unused crop paths")
            side = width // 2
            for i, dest in enumerate(destinations):
                left, top = (i % 2) * side, (i // 2) * side
                with dest.open("xb") as output:
                    image.crop((left, top, left + side, top + side)).save(output, format="PNG")
        return [inspect(p) for p in destinations]
    source, dest = Path(request["source"]), Path(request["destination"])
    if dest.exists():
        raise ValueError("Destination exists; refusing overwrite")
    with Image.open(source) as image:
        image.load()
        image = ImageOps.exif_transpose(image)
        if request["action"] == "prepare":
            image.thumbnail((request["max_side"], request["max_side"]), Image.Resampling.LANCZOS)
        elif request["action"] != "save_png":
            raise ValueError("Unknown image action")
        # Keep aspect, color channels and alpha; no crop, collage, retouch, or upscale.
        image = image.convert("RGBA") if "A" in image.getbands() else image.convert("RGB")
        with dest.open("xb") as output:
            image.save(output, format="PNG", icc_profile=image.info.get("icc_profile"))
    return inspect(dest)


if __name__ == "__main__":
    try:
        print(json.dumps(main(json.load(sys.stdin)), ensure_ascii=True))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
