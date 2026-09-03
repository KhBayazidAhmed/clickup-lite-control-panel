#!/usr/bin/env python3
"""
ClickUp Lite Icon Generator
Generates:
1. Master macOS App Icon (1024x1024 Light Minimalist squircle with drop shadow)
2. Tauri multi-resolution icon bundle (ICNS, ICO, PNGs)
3. Dedicated macOS Menu Bar Tray Template icons (crisp vector silhouette)
4. Public web favicons (favicon.ico, favicon.png, apple-touch-icon.png)
"""

import os
import subprocess
from PIL import Image, ImageDraw, ImageFilter

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TAURI_ICONS_DIR = os.path.join(PROJECT_ROOT, "apps", "web", "src-tauri", "icons")
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "apps", "web", "public")
MASTER_ICON = os.path.join(PROJECT_ROOT, "apps", "web", "src-tauri", "app-icon.png")

os.makedirs(TAURI_ICONS_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)

CLICKUP_LOGO_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 24 24">
  <defs>
    <linearGradient id="chevronGrad" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#FF007F" />
      <stop offset="100%" stop-color="#7B68EE" />
    </linearGradient>
    <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00E5FF" />
      <stop offset="100%" stop-color="#00B0FF" />
    </linearGradient>
  </defs>
  <path fill="url(#chevronGrad)" d="M12.04 6.15l-6.568 5.66-3.036-3.52L12.055 0l9.543 8.296-3.05 3.509z"/>
  <path fill="url(#arcGrad)" d="M2 18.439l3.69-2.828c1.961 2.56 4.044 3.739 6.363 3.739 2.307 0 4.33-1.166 6.203-3.704L22 18.405C19.298 22.065 15.941 24 12.053 24C8.178 24 4.788 22.078 2 18.439z"/>
</svg>"""

def generate_master_icon():
    print("Generating master 1024x1024 Light Minimalist icon...")
    size = 1024
    pad = 96
    tile_w = size - pad * 2
    tile_h = size - pad * 2
    radius = 185

    # 1. Soft macOS drop shadow
    shadow_canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_canvas)
    shadow_draw.rounded_rectangle(
        [pad, pad + 18, pad + tile_w, pad + tile_h + 18],
        radius=radius,
        fill=(0, 0, 0, 75)
    )
    shadow_blurred = shadow_canvas.filter(ImageFilter.GaussianBlur(radius=24))

    # 2. White to light-gray squircle tile
    tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    tile_draw = ImageDraw.Draw(tile)
    for y in range(tile_h):
        ratio = y / float(tile_h)
        r = int(255 * (1 - ratio) + 242 * ratio)
        g = int(255 * (1 - ratio) + 244 * ratio)
        b = int(255 * (1 - ratio) + 248 * ratio)
        tile_draw.line([(0, y), (tile_w, y)], fill=(r, g, b, 255))

    # Rounded squircle mask
    mask = Image.new("L", (tile_w, tile_h), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, tile_w, tile_h], radius=radius, fill=255)

    # Crisp borders
    tile_draw.rounded_rectangle(
        [0, 0, tile_w - 1, tile_h - 1],
        radius=radius,
        outline=(226, 232, 240, 255),
        width=4
    )
    tile_draw.rounded_rectangle(
        [2, 2, tile_w - 3, tile_h - 3],
        radius=radius,
        outline=(255, 255, 255, 220),
        width=2
    )

    tile_masked = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    tile_masked.paste(tile, (0, 0), mask=mask)

    composite = Image.alpha_composite(shadow_blurred, Image.new("RGBA", (size, size), (0, 0, 0, 0)))
    composite.paste(tile_masked, (pad, pad), mask=mask)

    # 3. Vector ClickUp Brand Logo
    tmp_logo_svg = "/tmp/clickup_logo_vector.svg"
    tmp_logo_png = "/tmp/clickup_logo_vector.png"
    with open(tmp_logo_svg, "w") as f:
        f.write(CLICKUP_LOGO_SVG)

    subprocess.run([
        "/opt/homebrew/bin/rsvg-convert",
        "-w", "480",
        "-h", "480",
        "-o", tmp_logo_png,
        tmp_logo_svg
    ], check=True)

    logo_img = Image.open(tmp_logo_png)
    composite.paste(logo_img, (272, 272), mask=logo_img)
    composite.save(MASTER_ICON, "PNG")
    print("  ✓ app-icon.png (1024x1024)")

def generate_tray_icons():
    print("Generating macOS menu bar tray template icons...")
    def create_tray_icon(size, scale):
        total_px = size * scale
        ss = 4
        canvas_size = total_px * ss
        img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        center_x = canvas_size / 2.0
        line_w = int(2.2 * scale * ss)
        
        peak_y = canvas_size * 0.22
        foot_y = canvas_size * 0.48
        span_x = canvas_size * 0.28
        
        draw.line([
            (center_x - span_x, foot_y),
            (center_x, peak_y),
            (center_x + span_x, foot_y)
        ], fill=(0, 0, 0, 255), width=line_w, joint='round')
        
        arc_top = canvas_size * 0.54
        arc_bottom = canvas_size * 0.82
        arc_span = canvas_size * 0.24
        bbox = [center_x - arc_span, arc_top, center_x + arc_span, arc_bottom]
        draw.arc(bbox, start=20, end=160, fill=(0, 0, 0, 255), width=line_w)
        
        return img.resize((total_px, total_px), Image.Resampling.LANCZOS)

    icon_1x = create_tray_icon(22, 1)
    icon_2x = create_tray_icon(22, 2)
    icon_1x.save(os.path.join(TAURI_ICONS_DIR, 'tray-icon.png'))
    icon_2x.save(os.path.join(TAURI_ICONS_DIR, 'tray-icon@2x.png'))
    print("  ✓ tray-icon.png (22x22)")
    print("  ✓ tray-icon@2x.png (44x44)")

def generate_web_icons():
    print("Generating web & favicon assets...")
    if not os.path.exists(MASTER_ICON):
        print(f"Master icon {MASTER_ICON} not found!")
        return
    master = Image.open(MASTER_ICON)
    fav32 = master.resize((32, 32), Image.Resampling.LANCZOS)
    fav64 = master.resize((64, 64), Image.Resampling.LANCZOS)
    fav180 = master.resize((180, 180), Image.Resampling.LANCZOS)

    fav32.save(os.path.join(PUBLIC_DIR, 'favicon.png'))
    fav180.save(os.path.join(PUBLIC_DIR, 'apple-touch-icon.png'))
    fav32.save(os.path.join(PUBLIC_DIR, 'favicon.ico'), sizes=[(32, 32), (16, 16)])
    print("  ✓ favicon.ico, favicon.png, apple-touch-icon.png")

def generate_tauri_bundle_icons():
    print("Generating Tauri desktop icon bundle...")
    cmd = ["bun", "--cwd", "apps/web", "tauri", "icon", "./src-tauri/app-icon.png"]
    subprocess.run(cmd, cwd=PROJECT_ROOT, check=True)
    print("  ✓ Generated ICNS, ICO, and all PNG icon dimensions")

if __name__ == "__main__":
    generate_master_icon()
    generate_tray_icons()
    generate_web_icons()
    generate_tauri_bundle_icons()
    print("\nAll icon assets successfully generated!")
