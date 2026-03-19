"""File storage helpers for ephemeral filesystems (e.g. Render).

Saves file binary data alongside the path so files can be restored after redeploys.
"""
import os
import secrets

from ..config import settings


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"}
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff"}


async def save_upload(file) -> tuple:
    """Save uploaded file, return (path, file_type, file_data_bytes).

    Only image files are allowed for giveaways.
    """
    ct = (getattr(file, "content_type", "") or "").lower()
    ext = os.path.splitext(getattr(file, "filename", "") or "")[1].lower()

    if ct and ct not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise ValueError(f"Разрешены только фото (JPG, PNG, GIF, WebP). Загружен файл типа: {ct}")
    if ext and ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError(f"Разрешены только фото (JPG, PNG, GIF, WebP). Расширение файла: {ext}")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = secrets.token_hex(16) + ext
    path = os.path.join(settings.UPLOAD_DIR, filename)
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)
    return path, "photo", content


def overlay_legal_text(file_path: str, erid: str = "", legal_info: str = "") -> str:
    """Overlay erid and legal_info text on the bottom-right of the image.

    Returns path to the new image with text overlay.
    """
    if not file_path or not os.path.exists(file_path):
        return file_path
    lines = []
    if erid:
        lines.append(f"ERID: {erid}")
    if legal_info:
        lines.append(legal_info)
    if not lines:
        return file_path

    from PIL import Image, ImageDraw, ImageFont

    img = Image.open(file_path).convert("RGBA")
    w, h = img.size

    # Font size ~2% of image height, min 10px
    font_size = max(10, int(h * 0.02))
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
    except (OSError, IOError):
        font = ImageFont.load_default()

    # Create overlay for semi-transparent background
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    padding = max(4, font_size // 3)
    line_spacing = max(2, font_size // 5)

    # Measure text block
    line_bboxes = []
    total_text_h = 0
    max_text_w = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lw, lh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        line_bboxes.append((lw, lh))
        max_text_w = max(max_text_w, lw)
        total_text_h += lh
    total_text_h += line_spacing * (len(lines) - 1)

    # Background rectangle position (bottom-right)
    rect_w = max_text_w + padding * 2
    rect_h = total_text_h + padding * 2
    rx = w - rect_w - padding
    ry = h - rect_h - padding

    draw.rectangle([rx, ry, rx + rect_w, ry + rect_h], fill=(0, 0, 0, 120))

    # Draw text lines
    y = ry + padding
    for i, line in enumerate(lines):
        lw, lh = line_bboxes[i]
        x = rx + padding
        draw.text((x, y), line, font=font, fill=(255, 255, 255, 230))
        y += lh + line_spacing

    result = Image.alpha_composite(img, overlay).convert("RGB")

    # Save to new file
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    out_path = file_path.rsplit(".", 1)[0] + "_legal" + ext
    result.save(out_path, quality=95)
    return out_path


def ensure_file(file_path: str, file_data) -> str | None:
    """Ensure file exists on disk. Restore from DB bytes if missing.

    Returns the file_path if file is available, None if unrecoverable.
    """
    if not file_path:
        return None
    if os.path.exists(file_path):
        return file_path
    if not file_data:
        return None
    dir_name = os.path.dirname(file_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    raw = file_data if isinstance(file_data, (bytes, bytearray, memoryview)) else bytes(file_data)
    with open(file_path, "wb") as f:
        f.write(raw)
    return file_path
