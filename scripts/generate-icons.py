#!/usr/bin/env python3
"""
ClickUp Lite Icon Generator
Generates:
1. Master macOS App Icon (1024x1024 squircle with subtle drop shadow)
2. Tauri multi-resolution icon bundle (ICNS, ICO, PNGs)
3. Dedicated macOS Menu Bar Tray Template icons (crisp vector-like silhouette)
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
    generate_tray_icons()
    generate_web_icons()
    generate_tauri_bundle_icons()
    print("\nAll icon assets successfully generated!")
