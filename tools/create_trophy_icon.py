import os
import numpy as np
from PIL import Image
from collections import deque

def create_trophy_icons(input_path='data/hg_pokaali2.jpeg'):
    img = Image.open(input_path).convert('RGB')
    arr = np.array(img, dtype=np.float32)
    h, w, _ = arr.shape

    # 1. Flood fill outer white background from corners
    is_white = (arr[:,:,0] > 235) & (arr[:,:,1] > 235) & (arr[:,:,2] > 235)
    visited = np.zeros((h, w), dtype=bool)

    q = deque([(0, 0), (0, w-1), (h-1, 0), (h-1, w-1)])
    for y, x in q:
        visited[y, x] = True

    while q:
        y, x = q.popleft()
        for dy, dx in [(-1,0), (1,0), (0,-1), (0,1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_white[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    # 2. Openings inside the handles (left handle x < 260, right handle x > 505, y in [180, 520])
    handle_openings = (
        is_white & (~visited) &
        ((np.arange(w)[np.newaxis, :] < 260) | (np.arange(w)[np.newaxis, :] > 505)) &
        (np.arange(h)[:, np.newaxis] > 180) & (np.arange(h)[:, np.newaxis] < 520)
    )

    bg_mask = visited | handle_openings

    # 3. Alpha calculation and edge defringing
    alpha = np.ones((h, w), dtype=np.float32)
    alpha[bg_mask] = 0.0

    # Expand boundary by 2 pixels to capture anti-aliasing
    bg_dilated = bg_mask.copy()
    for dy in [-2, -1, 0, 1, 2]:
        for dx in [-2, -1, 0, 1, 2]:
            if abs(dy) + abs(dx) <= 3:
                bg_dilated |= np.roll(np.roll(bg_mask, dy, axis=0), dx, axis=1)

    boundary = bg_dilated & (~bg_mask)
    min_rgb = arr[boundary].min(axis=1)
    edge_alpha = np.clip((255.0 - min_rgb) / 195.0, 0.0, 1.0)
    alpha[boundary] = edge_alpha

    # Defringe: remove white halo on dark backgrounds
    out_rgb = arr.copy()
    b_alpha = alpha[boundary, np.newaxis]
    nonzero = (b_alpha[:, 0] > 0.05)
    c_fg = (arr[boundary][nonzero] - (1.0 - b_alpha[nonzero]) * 255.0) / b_alpha[nonzero]
    c_fg = np.clip(c_fg, 0.0, 255.0)
    boundary_pts = np.argwhere(boundary)
    valid_pts = boundary_pts[nonzero]
    out_rgb[valid_pts[:, 0], valid_pts[:, 1]] = c_fg

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:,:,:3] = np.clip(out_rgb, 0, 255).astype(np.uint8)
    rgba[:,:,3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)

    # 4. Crop tightly to trophy bounding box
    y_indices, x_indices = np.where(alpha > 0.05)
    y_min, y_max = y_indices.min(), y_indices.max()
    x_min, x_max = x_indices.min(), x_indices.max()

    cropped_rgba = rgba[y_min:y_max+1, x_min:x_max+1]
    cropped_trophy = Image.fromarray(cropped_rgba)
    w_t, h_t = cropped_trophy.size

    # Ensure output directories exist
    os.makedirs('public', exist_ok=True)
    os.makedirs('data', exist_ok=True)

    # Save tight-cropped original resolution
    cropped_trophy.save('public/hg_pokaali_ikoni_trimmed.png')
    cropped_trophy.save('data/hg_pokaali_ikoni_trimmed.png')
    print("Saved trimmed full-res version")

    # Helper function to generate square centered icon
    def make_square_icon(size):
        margin = int(size * 0.04) # 4% margin
        target_h = size - 2 * margin
        scale = target_h / h_t
        target_w = int(w_t * scale)
        scaled = cropped_trophy.resize((target_w, target_h), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        paste_x = (size - target_w) // 2
        paste_y = margin
        canvas.paste(scaled, (paste_x, paste_y), scaled)
        return canvas

    # Primary square 512x512
    icon_512 = make_square_icon(512)
    icon_512.save('public/hg_pokaali_ikoni.png')
    icon_512.save('public/hg_pokaali_ikoni.webp', quality=95)
    icon_512.save('data/hg_pokaali_ikoni.png')
    print("Saved primary 512x512 icon (PNG & WebP)")

    # Multi-resolution square icons
    for s in [256, 128, 64, 32]:
        icon = make_square_icon(s)
        icon.save(f'public/hg_pokaali_ikoni_{s}.png')
        icon.save(f'data/hg_pokaali_ikoni_{s}.png')
        print(f"Saved {s}x{s} icon")

    # Clean up any test images
    for test_file in [
        'data/test_cropped_trophy.png',
        'data/test_dark_composite.png',
        'data/test_icon_512.png',
        'data/test_icon_256.png',
        'data/test_icon_128.png',
        'data/test_icon_64.png',
        'data/test_icon_32.png',
        'data/test_icon_64_sharp.png'
    ]:
        if os.path.exists(test_file):
            os.remove(test_file)

if __name__ == '__main__':
    create_trophy_icons()
