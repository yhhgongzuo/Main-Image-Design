"""Prepare a context crop and blend one generated edit back into its scene."""

import argparse
import hashlib
import io
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageCms, ImageDraw, ImageFilter, ImageOps


def open_scene(path):
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode == "CMYK" and image.info.get("icc_profile"):
            source = ImageCms.ImageCmsProfile(io.BytesIO(image.info["icc_profile"]))
            return ImageCms.profileToProfile(image, source, ImageCms.createProfile("sRGB"),
                                             outputMode="RGB")
        return image.convert("RGBA" if ("A" in image.getbands() or "transparency" in image.info) else "RGB")


def polygon_arg(value):
    try:
        points = [tuple(map(int, pair.split(","))) for pair in value.split()]
        if len(set(points)) < 3 or any(len(point) != 2 for point in points):
            raise ValueError
    except ValueError:
        raise argparse.ArgumentTypeError("Use three or more ordered x,y pixel pairs.")
    return points


def crop_box(size, points):
    width, height = size
    if any(not (0 <= x < width and 0 <= y < height) for x, y in points):
        raise ValueError("Target coordinates fall outside the oriented scene.")
    xs, ys = zip(*points)
    tw, th = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
    if tw < 2 or th < 2:
        raise ValueError("Target has no usable width or height.")
    cw, ch = math.ceil(tw * 1.30), math.ceil(th * 1.30)
    ratio = min((2/3, 1, 1.5), key=lambda r: abs(math.log(cw / ch / r)))
    # Use a familiar model canvas where it still leaves the product prominent.
    if 0.72 <= cw / ch / ratio <= 1.38:
        cw, ch = max(cw, round(ch * ratio)), max(ch, round(cw / ratio))
    cw, ch = min(cw, width), min(ch, height)
    left = max(0, min(width - cw, (min(xs) + max(xs) + 1 - cw) // 2))
    top = max(0, min(height - ch, (min(ys) + max(ys) + 1 - ch) // 2))
    return left, top, left + cw, top + ch


def square_context(box, size):
    left, top, right, bottom = box
    side = max(right - left, bottom - top)
    if side > min(size):
        return box
    left = max(0, min(size[0] - side, (left + right - side) // 2))
    top = max(0, min(size[1] - side, (top + bottom - side) // 2))
    return left, top, left + side, top + side


def digest(path):
    with path.open("rb") as source:
        checksum = hashlib.sha256()
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(chunk)
        return checksum.hexdigest()


def prepare(args):
    scene = open_scene(args.scene)
    x0 = y0 = 0
    width, height = scene.size
    if args.panel:
        if width % 2 or height % 3 or width // 2 != height // 3:
            raise ValueError("Expected an evenly divisible 2-by-3 composite.")
        width, height = width // 2, height // 3
        x0 = (args.panel - 1) % 2 * width
        y0 = (args.panel - 1) // 2 * height
    points = [(x - x0, y - y0) for x, y in args.polygon]
    context = crop_box((width, height), points)
    if args.context_box is not None:
        left, top, right, bottom = args.context_box
        context = left - x0, top - y0, right - x0, bottom - y0
        left, top, right, bottom = context
        if not (0 <= left < right <= width and 0 <= top < bottom <= height):
            raise ValueError("Context box must fit within the scene or selected panel.")
        if not all(left <= x < right and top <= y < bottom for x, y in points):
            raise ValueError("Context box must contain every target polygon point.")
    left, top, right, bottom = square_context(context, (width, height)) if args.square else context
    box = left + x0, top + y0, right + x0, bottom + y0
    crop = scene.crop(box)
    mask = Image.new("L", crop.size)
    ImageDraw.Draw(mask).polygon([(x - box[0], y - box[1]) for x, y in args.polygon], fill=255)
    if mask.getbbox() is None:
        raise ValueError("Target polygon is empty.")
    args.job.mkdir(parents=True, exist_ok=False)
    working = crop.rotate(-args.turn, expand=True)
    content_box = (0, 0, *working.size)
    if args.square and working.width != working.height:
        side = max(working.size)
        dx, dy = (side - working.width) // 2, (side - working.height) // 2
        content_box = dx, dy, dx + working.width, dy + working.height
        # Use a neutral margin only when a real square cannot fit the context.
        square = Image.new(working.mode, (side, side), "#808080")
        square.paste(working, (dx, dy))
        working = square
    working.save(args.job / "crop.png")
    scene_box = (x0, y0, x0 + width, y0 + height)
    if args.scene_context and box != scene_box:
        scene.crop(scene_box).save(args.job / "scene-context.png")
    # A guide for visual verification only. Never give it to the generator.
    overlay = crop.convert("RGB")
    ImageDraw.Draw(overlay).line(
        [(x - box[0], y - box[1]) for x, y in args.polygon + args.polygon[:1]],
        fill="lime", width=2)
    overlay.save(args.job / "outline.png")
    mask.save(args.job / "mask.png")
    record = dict(scene=str(args.scene.resolve()), sha256=digest(args.scene),
                  box=box, size=scene.size, crop_size=crop.size, clockwise=args.turn,
                  model_size=working.size, content_box=content_box)
    (args.job / "job.json").write_text(json.dumps(record, ensure_ascii=False, indent=2),
                                       encoding="utf-8")
    print("Model canvas:", working.size, "from scene box", box)


def blending_mask(job, size, seam):
    if seam == "crop":
        # Only the outer band blends. All interior pixels come from the selected edit.
        soft = Image.new("L", size, 0)
        draw = ImageDraw.Draw(soft)
        band = max(1, min(12, round(min(size) * 0.025), (min(size) - 1) // 2))
        for inset in range(band + 1):
            rect = (inset, inset, size[0] - 1 - inset, size[1] - 1 - inset)
            if rect[2] >= inset and rect[3] >= inset:
                t = inset / band
                draw.rectangle(rect, fill=round(255 * t * t * (3 - 2 * t)))
    else:
        with Image.open(job / "mask.png") as mask:
            blur = min(4, max(0.65, min(size) / 160))
            soft = mask.filter(ImageFilter.GaussianBlur(blur))
    return soft


def claim_area(used, box, soft):
    if used is not None:
        if ImageChops.multiply(used.crop(box), soft.point(lambda a: 255 if a else 0)).getbbox():
            raise ValueError("Edited regions overlap. Combine nearby changes into one region.")
        used.paste(ImageChops.lighter(used.crop(box), soft), box[:2])


def check_regions(args):
    items = json.loads(args.spec.read_text(encoding="utf-8"))
    used = None
    for item in items:
        job = Path(item["job"])
        record = json.loads((job / "job.json").read_text(encoding="utf-8"))
        if used is None:
            used = Image.new("L", tuple(record["size"]))
        claim_area(used, tuple(record["box"]), blending_mask(job, tuple(record["crop_size"]), item["seam"]))


def paste_region(scene, job, edit_path, seam, used=None):
    record = json.loads((job / "job.json").read_text(encoding="utf-8"))
    scene_path = Path(record["scene"])
    if digest(scene_path) != record["sha256"]:
        raise ValueError("The source scene has changed since preparation.")
    size = tuple(record["crop_size"])
    edit = open_scene(edit_path)
    if "model_size" in record:
        mw, mh = record["model_size"]
        if edit.width * mh != edit.height * mw:
            raise ValueError("The generated patch has a different aspect ratio.")
        edit = edit.resize((mw, mh), Image.Resampling.LANCZOS).crop(record["content_box"])
    edit = edit.rotate(record.get("clockwise", 0), expand=True)
    scale = min(size[0] / edit.width, size[1] / edit.height)
    if (round(edit.width * scale), round(edit.height * scale)) != size:
        raise ValueError("Direct paste requires matching framing and uniform scale.")
    if edit.mode == "RGBA" and edit.getchannel("A").getextrema() != (255, 255):
        raise ValueError("The generated crop must be opaque.")
    edit = edit.convert("RGB")
    edit_icc, scene_icc = edit.info.get("icc_profile"), scene.info.get("icc_profile")
    if edit_icc != scene_icc:
        def profile(raw):
            return ImageCms.ImageCmsProfile(io.BytesIO(raw)) if raw else ImageCms.createProfile("sRGB")
        edit = ImageCms.profileToProfile(edit, profile(edit_icc), profile(scene_icc))
    edit = edit.resize(size, Image.Resampling.LANCZOS)
    soft = blending_mask(job, size, seam)
    if scene.mode == "RGBA":
        edit.putalpha(scene.crop(record["box"]).getchannel("A"))
    claim_area(used, tuple(record["box"]), soft)
    scene.paste(edit, tuple(record["box"][:2]), soft)


def compose(args):
    if args.command == "compose-set":
        batch = json.loads(args.spec.read_text(encoding="utf-8"))
        scene_path = Path(batch["base"])
        scene = open_scene(scene_path)
        original = scene.copy()
        used = Image.new("L", scene.size)
        for item in batch["regions"]:
            job = Path(item["job"])
            meta = json.loads((job / "job.json").read_text(encoding="utf-8"))
            if Path(meta["scene"]).resolve() != scene_path.resolve():
                raise ValueError("Patch belongs to a different scene.")
            paste_region(scene, job, Path(item["edit"]), item["seam"], used)
        protected = used.point(lambda a: 0 if a else 255)
        difference = ImageChops.difference(original, scene)
        if any(ImageChops.multiply(channel, protected).getbbox() for channel in difference.split()):
            raise ValueError("Pixels outside blending areas changed.")
        if not any(channel.getbbox() for channel in difference.split()):
            raise ValueError("The assembled image contains no visible edits.")
    else:
        meta = json.loads((args.job / "job.json").read_text(encoding="utf-8"))
        scene = open_scene(Path(meta["scene"]))
        paste_region(scene, args.job, args.edit, args.seam)
    if args.out.suffix.lower() != ".png":
        raise ValueError("Use a new PNG output to preserve original scene pixels.")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("xb") as stream:
        scene.save(stream, format="PNG", icc_profile=scene.info.get("icc_profile"))
    print(args.out)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prep = commands.add_parser("prepare")
    prep.add_argument("--scene", type=Path, required=True)
    prep.add_argument("--polygon", type=polygon_arg, required=True)
    prep.add_argument("--context-box", nargs=4, type=int, metavar=("LEFT", "TOP", "RIGHT", "BOTTOM"))
    prep.add_argument("--scene-context", action="store_true")
    prep.add_argument("--turn", type=int, choices=(0, 90, 180, 270), default=0,
                      help="Clockwise quarter-turn to make existing print easier to read.")
    prep.add_argument("--job", type=Path, required=True)
    prep.add_argument("--panel", type=int, choices=range(1, 7))
    prep.add_argument("--square", action="store_true")
    check = commands.add_parser("check-regions")
    check.add_argument("--spec", type=Path, required=True)
    batch = commands.add_parser("compose-set")
    batch.add_argument("--spec", type=Path, required=True)
    batch.add_argument("--out", type=Path, required=True)
    join = commands.add_parser("compose")
    join.add_argument("--job", type=Path, required=True)
    join.add_argument("--edit", type=Path, required=True)
    join.add_argument("--seam", choices=("crop", "target"), default="target",
                      help="Feather the context crop perimeter or the target polygon.")
    join.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "check-regions":
        check_regions(args)
    elif args.command == "prepare":
        prepare(args)
    else:
        compose(args)


if __name__ == "__main__":
    main()
